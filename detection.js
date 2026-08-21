// Shared country-detection engine. It combines independent signals, rejects
// weak or conflicting evidence, and keeps DOM extraction separate from hiding.

globalThis.XCF_DETECTION = (() => {
  "use strict";

  const MIN_CONFIDENCE = 65;
  const MIN_MARGIN = 20;
  const COUNTRY_CODES = new Set(Object.keys(COUNTRY_DB));
  const RESERVED_PATHS = new Set([
    "compose", "explore", "home", "i", "login", "logout", "messages",
    "notifications", "privacy", "search", "settings", "signup", "tos"
  ]);

  function wordRegex(value) {
    const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}([^\\p{L}\\p{N}]|$)`, "iu");
  }

  const keywordRegexes = new Map();
  const placeRegexes = new Map();
  const handleCountries = new Map();
  const languageCountries = new Map();
  const accountCountryLabels = new Map();

  for (const [country, data] of Object.entries(COUNTRY_DB)) {
    keywordRegexes.set(country, data.keywords.map(keyword => [keyword, wordRegex(keyword)]));
    placeRegexes.set(country, (data.places || []).map(place => [place, wordRegex(place)]));
    for (const handle of data.handles) handleCountries.set(handle, country);
    for (const language of data.langs) {
      const owners = languageCountries.get(language) || [];
      owners.push(country);
      languageCountries.set(language, owners);
    }
    accountCountryLabels.set(normalizeCountryLabel(data.name), country);
  }

  // X normally returns a canonical country name, but a few labels differ from
  // the short display names used in the popup.
  const ACCOUNT_COUNTRY_ALIASES = {
    "great britain": "GB",
    "korea, republic of": "KR",
    "republic of korea": "KR",
    "u.a.e": "AE",
    "united arab emirates": "AE",
    "united states of america": "US",
    "u.s": "US",
    "u.s.a": "US"
  };
  for (const [label, country] of Object.entries(ACCOUNT_COUNTRY_ALIASES)) {
    accountCountryLabels.set(normalizeCountryLabel(label), country);
  }

  const US_STATE_RE = /(?:,\s*|\s)(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\s*$/i;

  function normalizeCountryLabel(value) {
    return String(value || "")
      .normalize("NFKC")
      .trim()
      .toLowerCase()
      .replace(/[.]/g, "")
      .replace(/\s+/g, " ");
  }

  function handleFromHref(href) {
    if (!href) return null;
    try {
      const path = new URL(href, "https://x.com").pathname;
      const statusMatch = path.match(/^\/([A-Za-z0-9_]{1,15})\/status\/\d+/);
      if (statusMatch) return statusMatch[1].toLowerCase();
      const profileMatch = path.match(/^\/([A-Za-z0-9_]{1,15})\/?$/);
      if (!profileMatch) return null;
      const handle = profileMatch[1].toLowerCase();
      return RESERVED_PATHS.has(handle) ? null : handle;
    } catch {
      return null;
    }
  }

  // The first status permalink belongs to the outer/original post. This avoids
  // accidentally classifying a quoted post and works with X Pro's absolute URLs.
  function getTweetData(article) {
    let handle = null;
    for (const link of article.querySelectorAll('a[href*="/status/"]')) {
      handle = handleFromHref(link.getAttribute("href"));
      if (handle) break;
    }

    if (!handle) {
      const userName = article.querySelector('div[data-testid="User-Name"]');
      if (userName) {
        for (const link of userName.querySelectorAll("a[href]")) {
          handle = handleFromHref(link.getAttribute("href"));
          if (handle) break;
        }
      }
    }

    const textElement = article.querySelector('div[data-testid="tweetText"]');
    return {
      handle,
      text: textElement ? textElement.textContent || "" : "",
      lang: textElement ? textElement.getAttribute("lang") : null
    };
  }

  function resolveLocationToCountry(location) {
    if (!location) return { country: null, matchedPlace: null };

    // A conventional trailing state abbreviation is stronger than a city name;
    // for example, "Paris, TX" should not resolve to France.
    if (US_STATE_RE.test(location)) {
      return { country: "US", matchedPlace: "US state abbreviation" };
    }

    let bestCountry = null;
    let bestPlace = null;
    for (const [country, places] of placeRegexes) {
      for (const [place, regex] of places) {
        if ((!bestPlace || place.length > bestPlace.length) && regex.test(location)) {
          bestCountry = country;
          bestPlace = place;
        }
      }
    }
    return { country: bestCountry, matchedPlace: bestPlace };
  }

  // `account_based_in` can also contain a broad region such as "South Asia".
  // Only exact country labels are accepted so a regional result never blocks
  // several countries by guesswork.
  function resolveAccountBasedIn(value) {
    const label = normalizeCountryLabel(value);
    return {
      country: accountCountryLabels.get(label) || null,
      matchedPlace: accountCountryLabels.has(label) ? String(value).trim() : null
    };
  }

  function extractAccountBasedIn(payload) {
    const value = payload && payload.data &&
      payload.data.user_result_by_screen_name &&
      payload.data.user_result_by_screen_name.result &&
      payload.data.user_result_by_screen_name.result.about_profile &&
      payload.data.user_result_by_screen_name.result.about_profile.account_based_in;
    return typeof value === "string" ? value.trim() : "";
  }

  function addEvidence(scores, country, points, reason) {
    if (!country || !COUNTRY_CODES.has(country)) return;
    const entry = scores.get(country) || { country, score: 0, reasons: [] };
    entry.score = Math.min(100, entry.score + points);
    entry.reasons.push(reason);
    scores.set(country, entry);
  }

  function detectCountry({
    handle,
    text,
    lang,
    accountCountry = null,
    accountReason = null,
    locationCountry = null,
    locationReason = null
  }) {
    const scores = new Map();

    // X's dedicated account metadata is the strongest available signal. It
    // describes the account itself, unlike post text or a self-written bio.
    if (accountCountry && COUNTRY_CODES.has(accountCountry)) {
      return {
        country: accountCountry,
        confidence: 100,
        reasons: [accountReason || "X account-based country"],
        ambiguous: false,
        candidates: [{
          country: accountCountry,
          score: 100,
          reasons: [accountReason || "X account-based country"]
        }]
      };
    }

    if (locationCountry) {
      addEvidence(scores, locationCountry, 100, locationReason || "profile location");
    }

    if (handle) {
      const handleCountry = handleCountries.get(handle.toLowerCase());
      if (handleCountry) addEvidence(scores, handleCountry, 90, `known account @${handle}`);
    }

    if (text) {
      for (const [country, keywords] of keywordRegexes) {
        const matches = keywords.filter(([, regex]) => regex.test(text)).map(([keyword]) => keyword);
        if (matches.length) {
          const points = Math.min(65, 35 + (matches.length - 1) * 15);
          addEvidence(scores, country, points, `post keywords: ${matches.join(", ")}`);
        }
      }
    }

    if (lang) {
      const baseLanguage = lang.split("-")[0].toLowerCase();
      const owners = languageCountries.get(baseLanguage) || [];
      if (baseLanguage !== "en" && owners.length === 1) {
        addEvidence(scores, owners[0], 25, `post language: ${baseLanguage}`);
      }
    }

    const candidates = [...scores.values()].sort((a, b) => b.score - a.score);
    const top = candidates[0] || null;
    const runnerUp = candidates[1] || null;
    const ambiguous = Boolean(top && runnerUp && top.score - runnerUp.score < MIN_MARGIN);
    const accepted = Boolean(top && top.score >= MIN_CONFIDENCE && !ambiguous);

    return {
      country: accepted ? top.country : null,
      confidence: top ? top.score : 0,
      reasons: top ? top.reasons : [],
      ambiguous,
      candidates
    };
  }

  function normalizeSettings(value) {
    const source = value && typeof value === "object" ? value : {};
    const hidden = Array.isArray(source.hidden)
      ? [...new Set(source.hidden.filter(country => COUNTRY_CODES.has(country)))]
      : [];
    return {
      enabled: typeof source.enabled === "boolean" ? source.enabled : true,
      hidden
    };
  }

  return {
    MIN_CONFIDENCE,
    detectCountry,
    extractAccountBasedIn,
    getTweetData,
    handleFromHref,
    normalizeSettings,
    resolveAccountBasedIn,
    resolveLocationToCountry
  };
})();
