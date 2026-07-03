// X Country Filter — content script.
// Detects a country per post and hides posts from the countries the user checked.
//
// Primary signal: the author's profile "location" field, fetched from X's
// internal API using your own logged-in session (same-origin fetch, so your
// cookies are sent automatically; nothing leaves the browser). Results are
// cached for 7 days. Fallbacks: known-handle lists, tweet-text keywords,
// tweet language.

(() => {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    hidden: [] // country codes to hide
  };

  let settings = { ...DEFAULTS };

  // ---- heuristic detection ------------------------------------------------

  // One word-boundary regex per keyword. \b breaks on accented chars, so use
  // non-word-char boundaries instead.
  function wordRegex(k) {
    const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}([^\\p{L}\\p{N}]|$)`, "iu");
  }

  const KEYWORD_RES = {};
  const PLACE_RES = {};
  for (const [cc, c] of Object.entries(COUNTRY_DB)) {
    KEYWORD_RES[cc] = c.keywords.map(wordRegex);
    PLACE_RES[cc] = (c.places || []).map(p => [p, wordRegex(p)]);
  }

  // "San Francisco, CA" / "Austin TX" — trailing US state abbreviation.
  const US_STATE_RE = /(?:,\s*|\s)(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\s*$/;

  // Languages that map to exactly one country in the DB (excluding English,
  // which is too widespread to be a signal on its own).
  const LANG_OWNER = {};
  {
    const owners = {};
    for (const [cc, c] of Object.entries(COUNTRY_DB)) {
      for (const lang of c.langs) (owners[lang] = owners[lang] || []).push(cc);
    }
    for (const [lang, ccs] of Object.entries(owners)) {
      if (lang !== "en" && ccs.length === 1) LANG_OWNER[lang] = ccs[0];
    }
  }

  function resolveLocationToCountry(loc) {
    if (!loc) return null;
    let best = null, bestLen = 0;
    for (const cc of Object.keys(PLACE_RES)) {
      for (const [place, re] of PLACE_RES[cc]) {
        if (place.length > bestLen && re.test(loc)) { best = cc; bestLen = place.length; }
      }
    }
    if (best) return best;
    if (US_STATE_RE.test(loc)) return "US";
    return null;
  }

  function getTweetData(article) {
    let handle = null;
    const userName = article.querySelector('div[data-testid="User-Name"]');
    if (userName) {
      for (const a of userName.querySelectorAll('a[href^="/"]')) {
        const href = a.getAttribute("href");
        if (/^\/[A-Za-z0-9_]{1,15}$/.test(href)) { handle = href.slice(1).toLowerCase(); break; }
      }
    }
    const textEl = article.querySelector('div[data-testid="tweetText"]');
    return {
      handle,
      text: textEl ? textEl.textContent : "",
      lang: textEl ? textEl.getAttribute("lang") : null
    };
  }

  function heuristicCountry({ handle, text, lang }) {
    if (handle) {
      for (const [cc, c] of Object.entries(COUNTRY_DB)) {
        if (c.handles.includes(handle)) return cc;
      }
    }
    if (text) {
      let best = null, bestScore = 0;
      for (const cc of Object.keys(COUNTRY_DB)) {
        let score = 0;
        for (const re of KEYWORD_RES[cc]) if (re.test(text)) score++;
        if (score > bestScore) { bestScore = score; best = cc; }
      }
      if (best) return best;
    }
    if (lang) {
      const base = lang.split("-")[0].toLowerCase();
      if (LANG_OWNER[base]) return LANG_OWNER[base];
    }
    return null;
  }

  // ---- profile-location lookup (your own session, same-origin) ------------

  // Public bearer token of X's own web client (shipped in their JS bundle,
  // identical for every user — it identifies the app, not you; your cookies do).
  const BEARER = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  // If GraphQL fallback 404s: DevTools → Network → visit any profile →
  // find "UserByScreenName" and copy the id segment from its URL.
  const GQL_QUERY_ID = "G3KGOASz96M-Qu0nwmGXNg";

  const CACHE_KEY = "xcfLocCache";
  const CACHE_TTL = 7 * 24 * 3600 * 1000;
  const CACHE_MAX = 5000;
  const BATCH_SIZE = 40;
  const PUMP_INTERVAL = 2500;

  let locCache = {};        // handle -> { loc, cc, ts }
  let queue = [];
  let queued = new Set();
  let pumping = false;
  let cooldownUntil = 0;
  let batchEndpointDead = false;
  let gqlExtraFeatures = {};
  let persistTimer = null;

  function getCsrf() {
    const m = document.cookie.match(/(?:^|;\s*)ct0=([^;]+)/);
    return m ? m[1] : null;
  }

  function apiHeaders(csrf) {
    return {
      "authorization": `Bearer ${BEARER}`,
      "x-csrf-token": csrf,
      "x-twitter-auth-type": "OAuth2Session",
      "x-twitter-active-user": "yes"
    };
  }

  function setCached(handle, loc) {
    locCache[handle] = { loc, cc: resolveLocationToCountry(loc), ts: Date.now() };
    queued.delete(handle);
  }

  function persistCache() {
    clearTimeout(persistTimer);
    persistTimer = setTimeout(() => {
      const entries = Object.entries(locCache);
      if (entries.length > CACHE_MAX) {
        entries.sort((a, b) => b[1].ts - a[1].ts);
        locCache = Object.fromEntries(entries.slice(0, CACHE_MAX));
      }
      chrome.storage.local.set({ [CACHE_KEY]: locCache });
    }, 2000);
  }

  function enqueue(handle) {
    if (queued.has(handle) || queue.length > 500) return;
    queued.add(handle);
    queue.push(handle);
  }

  // Batch endpoint: one request resolves up to ~100 accounts.
  async function lookupBatch(handles, csrf) {
    const res = await fetch(`/i/api/1.1/users/lookup.json?screen_name=${handles.join(",")}`, {
      headers: apiHeaders(csrf),
      credentials: "include"
    });
    if (res.status === 404 || res.status === 410) { batchEndpointDead = true; return null; }
    if (res.status === 429) { cooldownUntil = Date.now() + 120000; return null; }
    if (!res.ok) { cooldownUntil = Date.now() + 30000; return null; }
    return res.json();
  }

  // Per-handle GraphQL fallback. X rejects requests with a "features cannot
  // be null" error when its required feature flags change; we parse that
  // error and retry with the missing flags added (self-healing).
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
    const res = await fetch(`/i/api/graphql/${GQL_QUERY_ID}/UserByScreenName?${params}`, {
      headers: apiHeaders(csrf),
      credentials: "include"
    });
    if (res.status === 429) { cooldownUntil = Date.now() + 120000; return null; }
    const j = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = j && j.errors && j.errors[0] && j.errors[0].message || "";
      const m = msg.match(/features cannot be null:\s*(.+)/i);
      if (m && !retried) {
        for (const f of m[1].split(",")) gqlExtraFeatures[f.trim()] = false;
        return lookupGraphql(handle, csrf, true);
      }
      return "";
    }
    const r = j && j.data && j.data.user && j.data.user.result;
    if (!r) return "";
    return (r.legacy && r.legacy.location) || (r.location && r.location.location) || "";
  }

  async function pumpQueue() {
    if (pumping || !queue.length || Date.now() < cooldownUntil) return;
    if (!settings.enabled || settings.hidden.length === 0) return;
    const csrf = getCsrf();
    if (!csrf) return; // not logged in — heuristics only
    pumping = true;
    try {
      if (!batchEndpointDead) {
        const batch = queue.slice(0, BATCH_SIZE);
        const results = await lookupBatch(batch, csrf);
        if (results) {
          queue = queue.slice(batch.length);
          const byHandle = {};
          for (const u of results) byHandle[(u.screen_name || "").toLowerCase()] = u.location || "";
          for (const h of batch) setCached(h, byHandle[h] !== undefined ? byHandle[h] : "");
          persistCache();
          scheduleScan();
        }
      } else {
        const h = queue.shift();
        const loc = await lookupGraphql(h, csrf, false);
        if (loc === null) queue.unshift(h); // rate limited, retry later
        else { setCached(h, loc); persistCache(); scheduleScan(); }
      }
    } catch { /* network hiccup — queue survives for the next tick */ }
    pumping = false;
  }

  // ---- rendering ----------------------------------------------------------

  function applyToArticle(article) {
    const cell = article.closest('div[data-testid="cellInnerDiv"]') || article;
    cell.classList.remove("xcf-hidden");

    if (!settings.enabled || settings.hidden.length === 0) return;

    const data = getTweetData(article);
    let cc = null;
    if (data.handle) {
      const cached = locCache[data.handle];
      if (cached) cc = cached.cc;
      else enqueue(data.handle);
    }
    if (!cc) cc = heuristicCountry(data);
    if (cc && settings.hidden.includes(cc)) cell.classList.add("xcf-hidden");
  }

  function scan() {
    document.querySelectorAll('article[data-testid="tweet"]').forEach(applyToArticle);
  }

  // ---- wiring -------------------------------------------------------------

  let scheduled = false;
  function scheduleScan() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(() => { scheduled = false; scan(); }, 250);
  }

  chrome.storage.local.get(CACHE_KEY, o => {
    const saved = o[CACHE_KEY] || {};
    const now = Date.now();
    for (const [h, v] of Object.entries(saved)) {
      if (v && now - v.ts < CACHE_TTL) locCache[h] = v;
    }
    chrome.storage.sync.get(DEFAULTS, s => {
      settings = s;
      scan();
      new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
      setInterval(pumpQueue, PUMP_INTERVAL);
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue;
    scan();
  });
})();
