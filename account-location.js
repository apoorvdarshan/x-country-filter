// Looks up X's dedicated "Account based in" metadata through the user's own
// logged-in X session. Results stay local and are cached to keep traffic low.

globalThis.XCF_ACCOUNT_LOCATION = (() => {
  "use strict";

  const {
    extractAccountBasedIn,
    resolveAccountBasedIn,
    resolveLocationToCountry
  } = XCF_DETECTION;

  // Public bearer token used by X's web client. It identifies the web app, not
  // the signed-in user; the user's existing X session authorizes the request.
  const BEARER = "AAAAAAAAAAAAAAAAAAAAANRILgAAAAAAnNwIzUejRCOuH5E6I8xnZz4puTs%3D1Zv7ttfk8LF81IUq16cHjhLTvJu4FA33AGWWjCpTnA";
  // These operation hashes are shipped by X's web client and can change when X
  // deploys. The normal profile-location lookup remains as a fail-open fallback.
  const ABOUT_QUERY_ID = "TzOG2twZEfhr9KmClvVVqA";
  const PROFILE_QUERY_ID = "G3KGOASz96M-Qu0nwmGXNg";

  const CACHE_KEY = "xcfLocCache";
  const CACHE_VERSION = 5;
  const CACHE_TTL = 24 * 3600 * 1000;
  const CACHE_MAX = 5000;
  const PUMP_INTERVAL = 2500;
  const LOOKUPS_PER_PUMP = 2;

  function create({ shouldLookup, onUpdate }) {
    let cache = new Map();
    let queue = [];
    const queued = new Set();
    let pumping = false;
    let cooldownUntil = 0;
    let legacyEndpointDead = false;
    const profileExtraFeatures = Object.create(null);
    let persistTimer = null;
    let pumpTimer = null;
    let started = false;

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

    function get(handle) {
      return handle ? cache.get(handle.toLowerCase()) || null : null;
    }

    function enqueue(handle) {
      const normalized = String(handle || "").toLowerCase();
      if (!normalized || cache.has(normalized) || queued.has(normalized) || queue.length >= 500) return;
      queued.add(normalized);
      queue.push(normalized);
    }

    function setCached(handle, { basedIn = "", profileLocation = "", following = null }) {
      const account = resolveAccountBasedIn(basedIn);
      const profile = account.country
        ? { country: null, matchedPlace: null }
        : resolveLocationToCountry(profileLocation);
      const source = account.country
        ? "account"
        : account.region ? "region" : profile.country ? "profile" : null;
      cache.set(handle, {
        basedIn,
        profileLocation,
        accountCountry: account.country,
        accountRegion: account.region,
        profileCountry: profile.country,
        cc: account.country || profile.country,
        matchedPlace: profile.matchedPlace,
        following: typeof following === "boolean" ? following : null,
        source,
        ts: Date.now()
      });
      queued.delete(handle);
    }

    function persistCache() {
      clearTimeout(persistTimer);
      persistTimer = setTimeout(() => {
        let entries = [...cache.entries()];
        if (entries.length > CACHE_MAX) {
          entries.sort((a, b) => b[1].ts - a[1].ts);
          entries = entries.slice(0, CACHE_MAX);
          cache = new Map(entries);
        }
        const payload = { version: CACHE_VERSION, entries: Object.fromEntries(entries) };
        try { chrome.storage.local.set({ [CACHE_KEY]: payload }); } catch { /* extension was reloaded */ }
      }, 1500);
    }

    function setCooldown(response) {
      cooldownUntil = Date.now() + (response.status === 429 ? 120000 : 30000);
    }

    async function lookupAbout(handle, csrf) {
      const params = new URLSearchParams({
        variables: JSON.stringify({ screenName: handle })
      });
      const response = await fetch(
        `/i/api/graphql/${ABOUT_QUERY_ID}/AboutAccountQuery?${params}`,
        { headers: apiHeaders(csrf), credentials: "include" }
      );
      if (response.status === 429) {
        setCooldown(response);
        return { retry: true, value: "" };
      }
      if (!response.ok) return { retry: false, value: "" };
      const body = await response.json().catch(() => null);
      return { retry: false, value: extractAccountBasedIn(body) };
    }

    async function lookupLegacyProfile(handle, csrf) {
      if (legacyEndpointDead) return null;
      const response = await fetch(
        `/i/api/1.1/users/lookup.json?screen_name=${encodeURIComponent(handle)}`,
        { headers: apiHeaders(csrf), credentials: "include" }
      );
      if ([400, 401, 403, 404, 410].includes(response.status)) {
        legacyEndpointDead = true;
        return null;
      }
      if (response.status === 429) {
        setCooldown(response);
        return { retry: true, value: "" };
      }
      if (!response.ok) {
        setCooldown(response);
        return { retry: true, value: "" };
      }
      const users = await response.json().catch(() => []);
      const user = Array.isArray(users) ? users[0] : null;
      return {
        retry: false,
        value: {
          location: user && typeof user.location === "string" ? user.location : "",
          following: user && typeof user.following === "boolean" ? user.following : null
        }
      };
    }

    function graphqlFollowing(result) {
      const values = [
        result && result.relationship_perspectives && result.relationship_perspectives.following,
        result && result.legacy && result.legacy.following,
        result && result.viewer_relationship && result.viewer_relationship.following
      ];
      const direct = values.find(value => typeof value === "boolean");
      if (typeof direct === "boolean") return direct;

      const statuses = [
        result && result.connection_status,
        result && result.legacy && result.legacy.connection_status
      ].find(Array.isArray);
      return statuses ? statuses.includes("following") : null;
    }

    async function lookupGraphqlProfile(handle, csrf, retried = false) {
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
        ...profileExtraFeatures
      };
      const params = new URLSearchParams({
        variables: JSON.stringify({ screen_name: handle, withSafetyModeUserFields: true }),
        features: JSON.stringify(features)
      });
      const response = await fetch(
        `/i/api/graphql/${PROFILE_QUERY_ID}/UserByScreenName?${params}`,
        { headers: apiHeaders(csrf), credentials: "include" }
      );
      if (response.status === 429) {
        setCooldown(response);
        return { retry: true, value: { location: "", following: null } };
      }
      const body = await response.json().catch(() => null);
      if (!response.ok) {
        const message = body && body.errors && body.errors[0] && body.errors[0].message || "";
        const missing = message.match(/features cannot be null:\s*(.+)/i);
        if (missing && !retried) {
          for (const feature of missing[1].split(",")) profileExtraFeatures[feature.trim()] = false;
          return lookupGraphqlProfile(handle, csrf, true);
        }
        return { retry: false, value: { location: "", following: null } };
      }
      const data = body && body.data;
      const result = data && (
        (data.user && data.user.result) ||
        (data.user_result_by_screen_name && data.user_result_by_screen_name.result)
      );
      const location = result && (
        (result.legacy && result.legacy.location) ||
        (result.location && result.location.location)
      );
      return {
        retry: false,
        value: {
          location: typeof location === "string" ? location : "",
          following: graphqlFollowing(result)
        }
      };
    }

    async function lookupProfile(handle, csrf) {
      const legacy = await lookupLegacyProfile(handle, csrf);
      if (legacy === null) return lookupGraphqlProfile(handle, csrf);
      if (legacy.retry || typeof legacy.value.following === "boolean") return legacy;

      const graphql = await lookupGraphqlProfile(handle, csrf);
      if (graphql.retry) return legacy;
      return {
        retry: false,
        value: {
          location: legacy.value.location || graphql.value.location,
          following: graphql.value.following
        }
      };
    }

    async function processHandle(handle, csrf) {
      const about = await lookupAbout(handle, csrf);
      if (about.retry) return false;

      const profile = await lookupProfile(handle, csrf);
      if (profile.retry) return false;
      setCached(handle, {
        basedIn: about.value,
        profileLocation: profile.value.location,
        following: profile.value.following
      });
      return true;
    }

    async function pumpQueue() {
      if (!started || pumping || !queue.length || Date.now() < cooldownUntil) return;
      if (!shouldLookup()) return;
      const csrf = getCsrf();
      if (!csrf) return;

      pumping = true;
      const handles = queue.splice(0, LOOKUPS_PER_PUMP);
      try {
        const results = await Promise.all(handles.map(handle =>
          processHandle(handle, csrf).catch(() => false)
        ));
        let changed = false;
        results.forEach((success, index) => {
          if (success) changed = true;
          else queue.push(handles[index]);
        });
        if (changed) {
          persistCache();
          onUpdate();
        }
      } finally {
        pumping = false;
      }
    }

    function start() {
      if (started) return;
      chrome.storage.local.get(CACHE_KEY, stored => {
        const raw = stored[CACHE_KEY];
        const saved = raw && raw.version === CACHE_VERSION ? raw.entries : {};
        const now = Date.now();
        for (const [handle, value] of Object.entries(saved || {})) {
          if (value && Number.isFinite(value.ts) && now - value.ts < CACHE_TTL) {
            cache.set(handle, value);
          }
        }
        started = true;
        onUpdate();
        pumpTimer = setInterval(pumpQueue, PUMP_INTERVAL);
        pumpQueue();
      });
    }

    function stop() {
      started = false;
      clearInterval(pumpTimer);
      clearTimeout(persistTimer);
    }

    return { enqueue, get, pump: pumpQueue, start, stop };
  }

  return { create };
})();
