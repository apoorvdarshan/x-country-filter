// X Country Filter — content script.
// Uses X account metadata first, then conservative local country evidence.

(() => {
  "use strict";

  const DEFAULTS = { enabled: true, hidden: [] };
  const { detectCountry, getTweetData, normalizeSettings } = XCF_DETECTION;

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

  function applyToArticle(article) {
    const cell = article.closest('div[data-testid="cellInnerDiv"]') || article;
    clearDetectionData(cell);
    if (!settings.enabled || settings.hidden.length === 0) return;

    const data = getTweetData(article);
    const cached = data.handle && accountLocations
      ? accountLocations.get(data.handle)
      : null;
    if (data.handle && !cached && accountLocations) {
      accountLocations.enqueue(data.handle);
    }

    const accountMatch = cached && cached.source === "account";
    const profileMatch = cached && cached.source === "profile";
    const detection = detectCountry({
      ...data,
      accountCountry: accountMatch ? cached.cc : null,
      accountReason: accountMatch
        ? "X account based in: " + cached.basedIn
        : null,
      locationCountry: profileMatch ? cached.cc : null,
      locationReason: profileMatch && cached.matchedPlace
        ? "profile location: " + cached.matchedPlace
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

  chrome.storage.sync.get(DEFAULTS, value => {
    settings = normalizeSettings(value);
    accountLocations = XCF_ACCOUNT_LOCATION.create({
      shouldLookup: () => settings.enabled && settings.hidden.length > 0,
      onUpdate: scanAll
    });
    accountLocations.start();
    scanAll();
    observer = new MutationObserver(observeAddedPosts);
    observer.observe(document.body, { childList: true, subtree: true });
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
    if (accountLocations) accountLocations.pump();
  });
})();
