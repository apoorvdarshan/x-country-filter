// X Country Filter — content script.
// Scores country evidence per post and hides only high-confidence matches.
// The developer build also uses the author's public profile location.

(() => {
  "use strict";

  const DEFAULTS = { enabled: true, hidden: [] };
  const {
    detectCountry,
    getTweetData,
    normalizeSettings,
    resolveLocationToCountry
  } = XCF_DETECTION;

  let settings = normalizeSettings(DEFAULTS);

  // ---- profile-location lookup (your own session, same-origin) ------------

  // Public bearer token of X's own web client (shipped in their JS bundle,
  // identical for every user — it identifies the app, not you; your cookies do).
  const BEARER = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  // If GraphQL fallback 404s: DevTools → Network → visit any profile →
  // find "UserByScreenName" and copy the id segment from its URL.
  const GQL_QUERY_ID = "G3KGOASz96M-Qu0nwmGXNg";

  const CACHE_KEY = "xcfLocCache";
  const CACHE_VERSION = 2;
  const CACHE_TTL = 7 * 24 * 3600 * 1000;
  const CACHE_MAX = 5000;
  const BATCH_SIZE = 40;
  const PUMP_INTERVAL = 2500;

  let locCache = new Map(); // handle -> { loc, cc, matchedPlace, ts }
  let queue = [];
  const queued = new Set();
  let pumping = false;
  let cooldownUntil = 0;
  let batchEndpointDead = false;
  const gqlExtraFeatures = Object.create(null);
  let persistTimer = null;
  let observer = null;
  let pumpTimer = null;
  let articleTimer = null;
  const pendingArticles = new Set();
  const detectionState = new WeakMap();

  globalThis.XCF_DEBUG = Object.freeze({
    get: cell => detectionState.get(cell) || null
  });

  // When the extension is reloaded/updated, this copy of the script is
  // orphaned: chrome.* APIs vanish but observers and timers can keep firing.
  function orphaned() {
    try {
      if (chrome.runtime && chrome.runtime.id) return false;
    } catch { /* extension context was invalidated */ }
    clearInterval(pumpTimer);
    clearTimeout(persistTimer);
    clearTimeout(articleTimer);
    if (observer) observer.disconnect();
    document.querySelectorAll(".xcf-hidden").forEach(cell => clearDetectionData(cell));
    return true;
  }

  function getCsrf() {
    const match = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
    return match ? match[1] : null;
  }

  function apiHeaders(csrf) {
    return {
      "authorization": `Bearer ${BEARER}`,
      "x-csrf-token": csrf,
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-active-user": "yes"
    };
  }

  function setCached(handle, location) {
    const resolved = resolveLocationToCountry(location);
    locCache.set(handle, {
      loc: location,
      cc: resolved.country,
      matchedPlace: resolved.matchedPlace,
      ts: Date.now()
    });
    queued.delete(handle);
  }

  function persistCache() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      if (orphaned()) return;
      let entries = [...locCache.entries()];
      if (entries.length > CACHE_MAX) {
        entries.sort((a, b) => b[1].ts - a[1].ts);
        entries = entries.slice(0, CACHE_MAX);
        locCache = new Map(entries);
      }
      const payload = { version: CACHE_VERSION, entries: Object.fromEntries(entries) };
      try { chrome.storage.local.set({ [CACHE_KEY]: payload }); } catch { /* context died mid-write */ }
    }, 2000);
  }

  function enqueue(handle) {
    if (queued.has(handle) || queue.length >= 500) return;
    queued.add(handle);
    queue.push(handle);
  }

  async function lookupBatch(handles, csrf) {
    const response = await fetch(`/i/api/1.1/users/lookup.json?screen_name=${handles.join(",")}`, {
      headers: apiHeaders(csrf),
      credentials: "include"
    });
    if (response.status === 404 || response.status === 410) {
      batchEndpointDead = true;
      return null;
    }
    if (response.status === 429) {
      cooldownUntil = Date.now() + 120000;
      return null;
    }
    if (!response.ok) {
      cooldownUntil = Date.now() + 30000;
      return null;
    }
    return response.json();
  }

  // X sometimes adds required GraphQL feature flags. Parse that error once and
  // retry with the missing flags disabled so minor API changes self-heal.
  async function lookupGraphql(handle, csrf, retried) {
    const features = {
      hidden_profile_subscriptions_enabled: false,
      rweb_tipjar_consultation_enabled: false,
      responsive_web_graphql_exclude_directive_enabled: true,
      verified_phone_label_enabled: false,
      highlights_tweets_tab_ui_enabled: false,
      responsive_web_twitter_article_notes_tab_enabled: false,
      creator_subscriptions_tweet_preview_api_enabled: false,
      responsive_web_graphql_skip_user_profile_image_extensions_enabled: false,
      responsive_web_graphql_timeline_navigation_enabled: true,
      subscriptions_verification_info_is_identity_verified_enabled: false,
      subscriptions_verification_info_verified_since_enabled: false,
      subscriptions_feature_can_gift_premium: false,
      ...gqlExtraFeatures
    };
    const params = new URLSearchParams({
      variables: JSON.stringify({ screen_name: handle, withSafetyModeUserFields: true }),
      features: JSON.stringify(features)
    });
    const response = await fetch(`/i/api/graphql/${GQL_QUERY_ID}/UserByScreenName?${params}`, {
      headers: apiHeaders(csrf),
      credentials: "include"
    });
    if (response.status === 429) {
      cooldownUntil = Date.now() + 120000;
      return null;
    }
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      const message = body && body.errors && body.errors[0] && body.errors[0].message || "";
      const missing = message.match(/features cannot be null:\s*(.+)/i);
      if (missing && !retried) {
        for (const feature of missing[1].split(",")) gqlExtraFeatures[feature.trim()] = false;
        return lookupGraphql(handle, csrf, true);
      }
      return "";
    }
    const result = body && body.data && body.data.user && body.data.user.result;
    if (!result) return "";
    return (result.legacy && result.legacy.location) ||
      (result.location && result.location.location) || "";
  }

  async function pumpQueue() {
    if (orphaned()) return;
    if (pumping || !queue.length || Date.now() < cooldownUntil) return;
    if (!settings.enabled || settings.hidden.length === 0) return;
    const csrf = getCsrf();
    if (!csrf) return; // logged out — use local evidence only

    pumping = true;
    try {
      if (!batchEndpointDead) {
        const batch = queue.slice(0, BATCH_SIZE);
        const results = await lookupBatch(batch, csrf);
        if (results) {
          queue = queue.slice(batch.length);
          const byHandle = new Map();
          for (const user of results) {
            byHandle.set((user.screen_name || "").toLowerCase(), user.location || "");
          }
          for (const handle of batch) {
            setCached(handle, byHandle.has(handle) ? byHandle.get(handle) : "");
          }
          persistCache();
          scanAll();
        }
      } else {
        const handle = queue.shift();
        const location = await lookupGraphql(handle, csrf, false);
        if (location === null) queue.unshift(handle);
        else {
          setCached(handle, location);
          persistCache();
          scanAll();
        }
      }
    } catch { /* network hiccup — keep queued handles for the next tick */ }
    pumping = false;
  }

  // ---- rendering ----------------------------------------------------------

  function clearDetectionData(cell) {
    cell.classList.remove("xcf-hidden");
    detectionState.delete(cell);
  }

  function applyToArticle(article) {
    const cell = article.closest('div[data-testid="cellInnerDiv"]') || article;
    clearDetectionData(cell);
    if (!settings.enabled || settings.hidden.length === 0) return;

    const data = getTweetData(article);
    const cached = data.handle ? locCache.get(data.handle) : null;
    if (data.handle && !cached) enqueue(data.handle);

    const detection = detectCountry({
      ...data,
      locationCountry: cached && cached.cc,
      locationReason: cached && cached.matchedPlace
        ? `profile location: ${cached.matchedPlace}`
        : "profile location"
    });

    detectionState.set(cell, detection);
    if (detection.country && settings.hidden.includes(detection.country)) {
      cell.classList.add("xcf-hidden");
    }
  }

  function scanAll() {
    document.querySelectorAll('article[data-testid="tweet"]').forEach(applyToArticle);
  }

  function scheduleArticle(article) {
    pendingArticles.add(article);
    if (articleTimer) return;
    articleTimer = setTimeout(() => {
      articleTimer = null;
      const articles = [...pendingArticles];
      pendingArticles.clear();
      for (const item of articles) {
        if (item.isConnected) applyToArticle(item);
      }
    }, 100);
  }

  function observeAddedPosts(mutations) {
    if (orphaned()) return;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        const element = node.nodeType === 1 ? node : node.parentElement;
        if (!element) continue;
        const containingArticle = element.closest('article[data-testid="tweet"]');
        if (containingArticle) scheduleArticle(containingArticle);
        if (element.matches('article[data-testid="tweet"]')) scheduleArticle(element);
        element.querySelectorAll('article[data-testid="tweet"]').forEach(scheduleArticle);
      }
    }
  }

  // ---- wiring -------------------------------------------------------------

  chrome.storage.local.get(CACHE_KEY, stored => {
    const raw = stored[CACHE_KEY];
    const saved = raw && raw.version === CACHE_VERSION ? raw.entries : raw || {};
    const now = Date.now();
    for (const [handle, value] of Object.entries(saved || {})) {
      if (value && Number.isFinite(value.ts) && now - value.ts < CACHE_TTL) {
        locCache.set(handle, value);
      }
    }

    chrome.storage.sync.get(DEFAULTS, value => {
      settings = normalizeSettings(value);
      scanAll();
      observer = new MutationObserver(observeAddedPosts);
      observer.observe(document.body, { childList: true, subtree: true });
      pumpTimer = setInterval(pumpQueue, PUMP_INTERVAL);
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    const next = { ...settings };
    let relevant = false;
    for (const key of Object.keys(DEFAULTS)) {
      if (changes[key]) {
        relevant = true;
        next[key] = changes[key].newValue === undefined
          ? DEFAULTS[key]
          : changes[key].newValue;
      }
    }
    if (!relevant) return;
    settings = normalizeSettings(next);
    scanAll();
  });
})();
