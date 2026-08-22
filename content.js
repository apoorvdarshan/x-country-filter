// X Country Filter — content script.
// Uses X account metadata first, then conservative local country evidence.

(() => {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    hidden: [],
    hiddenRegions: [],
    exemptHandles: [],
    protectFollowing: true
  };
  const {
    detectCountry,
    exemptionReason,
    getTweetData,
    isBlockedLocation,
    normalizeHandle,
    normalizeSettings,
    regionForCountry,
    resolveLocationToCountry
  } = XCF_DETECTION;

  let settings = normalizeSettings(DEFAULTS);
  let accountLocations = null;
  let observer = null;
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
    clearTimeout(articleTimer);
    if (observer) observer.disconnect();
    if (accountLocations) accountLocations.stop();
    document.querySelectorAll(".xcf-hidden").forEach(cell => clearDetectionData(cell));
    return true;
  }

  function clearDetectionData(cell) {
    cell.classList.remove("xcf-hidden");
    detectionState.delete(cell);
  }

  function isFilteredHomeFeed(article) {
    if (typeof location === "undefined") return false;
    const path = String(location.pathname || "");
    if (!/^\/home\/?$/.test(path) && !/^\/i\/decks(?:\/|$)/.test(path)) return false;

    const timeline = article.closest('[aria-label="Timeline: Your Home Timeline"]');
    if (!timeline) return false;

    // X keeps For You, Following, and topic feeds on the same /home route.
    // Filter every selected Home feed except Following. X Pro may show several
    // Home columns at once, so fail open if the column selection is ambiguous.
    for (let root = timeline; root && root !== document.body; root = root.parentElement) {
      if (typeof root.querySelectorAll !== "function") continue;
      const selected = [...root.querySelectorAll('[role="tab"][aria-selected="true"]')];
      if (selected.length === 1) {
        return !/^following$/i.test(String(selected[0].textContent || "").trim());
      }
      if (selected.length > 1) return false;
    }
    return false;
  }

  function isProfileTimeline(article) {
    const timeline = article.closest('[aria-label^="Timeline:"]');
    const label = timeline && typeof timeline.getAttribute === "function"
      ? timeline.getAttribute("aria-label") || ""
      : "";
    return /['’]s posts$/i.test(label);
  }

  function isNearViewport(article) {
    if (!article || typeof article.getBoundingClientRect !== "function") return false;
    const rect = article.getBoundingClientRect();
    const height = typeof innerHeight === "number" && innerHeight > 0 ? innerHeight : 900;
    return rect.bottom >= -height * 0.5 && rect.top <= height * 1.5;
  }

  function visibleProfileEvidence(article, handle) {
    if (!handle || !isProfileTimeline(article) || typeof location === "undefined") return null;
    const route = String(location.pathname || "").match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/);
    const routeMatches = route && normalizeHandle(route[1]) === normalizeHandle(handle);
    const roots = [];
    const primary = article.closest('[data-testid="primaryColumn"]');
    if (primary) roots.push(primary);
    for (let node = article.parentElement; node && node !== document.body; node = node.parentElement) {
      if (typeof node.querySelector === "function" &&
          node.querySelector('[data-testid="UserLocation"]') && !roots.includes(node)) {
        roots.push(node);
      }
    }
    if (routeMatches && !roots.includes(document)) roots.push(document);

    for (const root of roots) {
      const locationElement = root.querySelector('[data-testid="UserLocation"]');
      const profileLocation = locationElement
        ? String(locationElement.textContent || "").trim()
        : "";
      const resolved = resolveLocationToCountry(profileLocation);

      let following = null;
      for (const button of root.querySelectorAll("button")) {
        const label = String(button.getAttribute("aria-label") || "").trim();
        if (new RegExp(`^Follow @${handle}$`, "i").test(label)) {
          following = false;
          break;
        }
        if (new RegExp(`^(?:Following|Unfollow) @${handle}$`, "i").test(label)) {
          following = true;
          break;
        }
      }

      // A matching relationship button safely binds a profile column on X Pro,
      // whose deck URL does not contain the opened profile's handle.
      if (!routeMatches && typeof following !== "boolean") continue;
      if (!resolved.country && typeof following !== "boolean") continue;
      return {
        profileLocation,
        country: resolved.country,
        matchedPlace: resolved.matchedPlace,
        following
      };
    }
    return null;
  }

  function applyToArticle(article) {
    const cell = article.closest('div[data-testid="cellInnerDiv"]') || article;
    clearDetectionData(cell);
    if (!isFilteredHomeFeed(article)) return;
    if (!settings.enabled || (settings.hidden.length === 0 && settings.hiddenRegions.length === 0)) return;

    const data = getTweetData(article);
    const viewerHandle = accountLocations && accountLocations.getViewerHandle();
    const immediateExemption = exemptionReason(
      data.handle,
      false,
      settings,
      viewerHandle,
      data.mentionedHandles
    );
    if (immediateExemption) {
      detectionState.set(cell, {
        country: null,
        region: null,
        confidence: 0,
        reasons: [immediateExemption],
        ambiguous: false,
        candidates: [],
        exempt: true,
        exemptionReason: immediateExemption
      });
      return;
    }
    if (data.handle && accountLocations && !accountLocations.viewerReady()) {
      detectionState.set(cell, {
        country: null,
        region: null,
        confidence: 0,
        reasons: ["checking the signed-in account"],
        ambiguous: false,
        candidates: [],
        pendingViewer: true
      });
      return;
    }

    const cached = data.handle && accountLocations
      ? accountLocations.get(data.handle)
      : null;
    const profileEvidence = visibleProfileEvidence(article, data.handle);
    if (profileEvidence && accountLocations) {
      accountLocations.rememberProfile(
        data.handle,
        profileEvidence.profileLocation,
        profileEvidence.following
      );
    }
    const following = profileEvidence && typeof profileEvidence.following === "boolean"
      ? profileEvidence.following
      : cached && cached.following;
    if (data.handle && !cached && accountLocations) {
      const priority = isProfileTimeline(article) || isNearViewport(article);
      accountLocations.enqueue(data.handle, priority);
      if (priority) accountLocations.pump();
    }
    if (data.handle && accountLocations && settings.protectFollowing &&
        typeof following !== "boolean") {
      detectionState.set(cell, {
        country: null,
        region: null,
        confidence: 0,
        reasons: ["checking whether you follow this account"],
        ambiguous: false,
        candidates: [],
        pendingRelationship: true
      });
      return;
    }

    const followedExemption = exemptionReason(
      data.handle,
      following,
      settings,
      viewerHandle
    );
    if (followedExemption) {
      detectionState.set(cell, {
        country: cached && cached.cc,
        region: cached && cached.accountRegion,
        confidence: 0,
        reasons: [followedExemption],
        ambiguous: false,
        candidates: [],
        exempt: true,
        exemptionReason: followedExemption
      });
      return;
    }

    const detection = detectCountry({
      ...data,
      accountCountry: cached && cached.accountCountry,
      accountReason: cached && cached.accountCountry
        ? "X account based in: " + cached.basedIn
        : null,
      locationCountry: cached && cached.profileCountry || profileEvidence && profileEvidence.country,
      locationReason: cached && cached.profileCountry && cached.matchedPlace
        ? "profile location: " + cached.matchedPlace
        : profileEvidence && profileEvidence.matchedPlace
          ? "visible profile location: " + profileEvidence.matchedPlace
        : "profile location"
    });

    const region = cached && cached.accountRegion || regionForCountry(detection.country);
    const result = {
      ...detection,
      region,
      regionReason: cached && cached.accountRegion
        ? "X account based in: " + cached.basedIn
        : region ? "country belongs to region" : null
    };
    detectionState.set(cell, result);
    if (isBlockedLocation(detection.country, region, settings)) {
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
    let feedSelectionChanged = false;
    for (const mutation of mutations) {
      if (mutation.type === "attributes") {
        if (mutation.target && mutation.target.getAttribute("role") === "tab") {
          feedSelectionChanged = true;
        }
        continue;
      }
      for (const node of mutation.addedNodes) {
        const element = node.nodeType === 1 ? node : node.parentElement;
        if (!element) continue;
        const containingArticle = element.closest('article[data-testid="tweet"]');
        if (containingArticle) scheduleArticle(containingArticle);
        if (element.matches('article[data-testid="tweet"]')) scheduleArticle(element);
        element.querySelectorAll('article[data-testid="tweet"]').forEach(scheduleArticle);
      }
    }
    if (feedSelectionChanged) scanAll();
  }

  chrome.storage.sync.get(DEFAULTS, value => {
    settings = normalizeSettings(value);
    accountLocations = XCF_ACCOUNT_LOCATION.create({
      shouldLookup: () => settings.enabled &&
        (settings.hidden.length > 0 || settings.hiddenRegions.length > 0),
      onUpdate: scanAll
    });
    accountLocations.start();
    scanAll();
    observer = new MutationObserver(observeAddedPosts);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["aria-selected"]
    });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && changes.xcfLocCache && accountLocations) {
      accountLocations.mergeStored(changes.xcfLocCache.newValue);
      return;
    }
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
    if (accountLocations) accountLocations.pump();
  });
})();
