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
    getAuthorHandle,
    getTweetData,
    isBlockedLocation,
    normalizeHandle,
    normalizeSettings,
    regionForCountry,
    resolveLocationToCountry
  } = XCF_DETECTION;
  const {
    homeTimelineLabel,
    isFilteredHomeFeed,
    isProfileTimeline,
    profileRelationship,
    profileRootFor
  } = XCF_FEED;
  // Translated Home timeline labels seen on x.com, reused to find the Home
  // column on X Pro when X is displayed in another language.
  const HOME_LABELS_KEY = "xcfHomeTimelineLabels";
  const HOME_LABELS_MAX = 5;

  let settings = normalizeSettings(DEFAULTS);
  let homeLabels = [];
  let accountLocations = null;
  let observer = null;
  let articleTimer = null;
  let rescanTimer = null;
  const pendingArticles = new Set();
  const pendingRescanHandles = new Set();
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
    clearTimeout(rescanTimer);
    if (observer) observer.disconnect();
    if (accountLocations) accountLocations.stop();
    document.querySelectorAll(".xcf-hidden").forEach(cell => clearDetectionData(cell));
    return true;
  }

  function clearDetectionData(cell) {
    cell.classList.remove("xcf-hidden");
    detectionState.delete(cell);
  }

  function sanitizeHomeLabels(value) {
    return Array.isArray(value)
      ? value.filter(label => typeof label === "string" && label.length <= 200)
        .slice(0, HOME_LABELS_MAX)
      : [];
  }

  function pageState() {
    const root = document.documentElement;
    return {
      path: typeof location === "undefined" ? "" : String(location.pathname || ""),
      uiLanguage: root && root.lang || "",
      homeLabels,
      // Profile columns are only possible while a profile header is shown.
      hasProfileHeader: Boolean(document.querySelector('[data-testid="UserName"]'))
    };
  }

  function learnHomeLabel(article, page) {
    const label = homeTimelineLabel(article, page);
    if (!label || homeLabels.includes(label)) return;
    homeLabels = [label, ...homeLabels].slice(0, HOME_LABELS_MAX);
    try { chrome.storage.local.set({ [HOME_LABELS_KEY]: homeLabels }); } catch { /* extension was reloaded */ }
  }

  function isNearViewport(article) {
    if (!article || typeof article.getBoundingClientRect !== "function") return false;
    const rect = article.getBoundingClientRect();
    const height = typeof innerHeight === "number" && innerHeight > 0 ? innerHeight : 900;
    return rect.bottom >= -height * 0.5 && rect.top <= height * 1.5;
  }

  function visibleProfileEvidence(article, handle, page) {
    if (!handle) return null;
    const route = page.path.match(/^\/([A-Za-z0-9_]{1,15})(?:\/|$)/);
    const routeMatches = route && normalizeHandle(route[1]) === normalizeHandle(handle);
    const roots = [];
    const profileRoot = profileRootFor(article);
    if (profileRoot) roots.push(profileRoot);
    const primary = article.closest('[data-testid="primaryColumn"]');
    if (primary && !roots.includes(primary)) roots.push(primary);
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

      const following = profileRelationship(root, handle);

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

  // Opened profiles are never filtered, but their visible location and
  // Follow/Following state warm the cache for that author's Home-feed posts.
  function rememberVisibleProfile(article, page) {
    if (!accountLocations) return;
    const handle = getAuthorHandle(article);
    if (!handle) return;
    const evidence = visibleProfileEvidence(article, handle, page);
    if (evidence && accountLocations.rememberProfile(
      handle,
      evidence.profileLocation,
      evidence.following
    )) {
      scheduleRescan([handle]);
    }
    // On X Pro a profile column sits beside Home columns, so look its
    // authors up first.
    if (/^\/i\/decks(?:\/|$)/.test(page.path)) {
      const cached = accountLocations.get(handle);
      if (!cached || cached.provisional) {
        accountLocations.enqueue(handle, true);
        accountLocations.pump();
      }
    }
  }

  function filteringActive() {
    return settings.enabled && (settings.hidden.length > 0 || settings.hiddenRegions.length > 0);
  }

  function applyToArticle(article, scan) {
    const cell = article.closest('div[data-testid="cellInnerDiv"]') || article;
    clearDetectionData(cell);
    if (!filteringActive()) return;
    if (!isFilteredHomeFeed(article, scan.page)) {
      if (scan.page.hasProfileHeader && isProfileTimeline(article)) {
        rememberVisibleProfile(article, scan.page);
      }
      return;
    }
    learnHomeLabel(article, scan.page);

    const data = getTweetData(article);
    const viewerHandle = scan.viewerHandle;
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
    const following = cached && cached.following;
    if (data.handle && accountLocations && (!cached || cached.provisional)) {
      const priority = isNearViewport(article);
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
      locationCountry: cached && cached.profileCountry,
      locationReason: cached && cached.matchedPlace
        ? (cached.provisional ? "visible profile location: " : "profile location: ") +
          cached.matchedPlace
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

  function scanState() {
    return {
      page: pageState(),
      viewerHandle: accountLocations ? accountLocations.getViewerHandle() : null
    };
  }

  // Lookup results only affect their own authors' posts, so rescan just
  // those unless the viewer or settings changed.
  function scanAll(handles) {
    const only = Array.isArray(handles) ? new Set(handles) : null;
    if (only && only.size === 0) return;
    const scan = scanState();
    document.querySelectorAll('article[data-testid="tweet"]').forEach(article => {
      if (!only || only.has(getAuthorHandle(article))) applyToArticle(article, scan);
    });
  }

  function scheduleRescan(handles) {
    handles.forEach(handle => pendingRescanHandles.add(handle));
    if (rescanTimer) return;
    rescanTimer = setTimeout(() => {
      rescanTimer = null;
      const next = [...pendingRescanHandles];
      pendingRescanHandles.clear();
      scanAll(next);
    }, 0);
  }

  function scheduleArticle(article) {
    pendingArticles.add(article);
    if (articleTimer) return;
    articleTimer = setTimeout(() => {
      articleTimer = null;
      const articles = [...pendingArticles];
      pendingArticles.clear();
      const scan = scanState();
      for (const item of articles) {
        if (item.isConnected) applyToArticle(item, scan);
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
    chrome.storage.local.get(HOME_LABELS_KEY, stored => {
      homeLabels = sanitizeHomeLabels(stored && stored[HOME_LABELS_KEY]);
      start();
    });
  });

  function start() {
    accountLocations = XCF_ACCOUNT_LOCATION.create({
      shouldLookup: filteringActive,
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
  }

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") {
      if (changes.xcfLocCache && accountLocations) {
        accountLocations.mergeStored(changes.xcfLocCache.newValue);
      }
      if (changes[HOME_LABELS_KEY]) {
        homeLabels = sanitizeHomeLabels(changes[HOME_LABELS_KEY].newValue);
        if (accountLocations) scanAll();
      }
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
