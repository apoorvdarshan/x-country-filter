// Page-structure helpers for the content script. They rely on X's roles and
// data-testid values instead of visible English text, so filtering keeps
// working when X is displayed in another language.

globalThis.XCF_FEED = (() => {
  "use strict";

  const ENGLISH_HOME_TIMELINE_LABEL = "Timeline: Your Home Timeline";
  const ENGLISH_PROFILE_TIMELINE_RE = /['’]s posts$/i;
  const HOME_PATH_RE = /^\/home\/?$/;
  const DECK_PATH_RE = /^\/i\/decks(?:\/|$)/;

  function attribute(element, name) {
    return element && typeof element.getAttribute === "function"
      ? String(element.getAttribute(name) || "")
      : "";
  }

  function isTag(element, tag) {
    return Boolean(element && String(element.tagName || "").toLowerCase() === tag);
  }

  function closestWith(element, name, value) {
    for (let node = element; node; node = node.parentElement) {
      if (attribute(node, name) === value) return node;
    }
    return null;
  }

  // X wraps every timeline in <section role="region"> whose labelled child
  // holds the virtualized post cells.
  function timelineFor(article) {
    for (let node = article && article.parentElement; node; node = node.parentElement) {
      const parent = node.parentElement;
      if (isTag(parent, "section") && attribute(parent, "role") === "region" &&
          attribute(node, "aria-label")) {
        return node;
      }
    }
    return null;
  }

  function homeTimeline(article, page) {
    const timeline = timelineFor(article);
    if (!timeline) return null;
    const label = attribute(timeline, "aria-label");
    const path = String(page && page.path || "");
    // x.com shows exactly one timeline in the primary column on /home.
    if (HOME_PATH_RE.test(path)) {
      return label === ENGLISH_HOME_TIMELINE_LABEL || closestWith(timeline, "data-testid", "primaryColumn")
        ? timeline
        : null;
    }
    // X Pro shows many labelled columns. Accept the English label and any
    // translated label learned from x.com's Home timeline.
    if (DECK_PATH_RE.test(path)) {
      const learned = Array.isArray(page.homeLabels) ? page.homeLabels : [];
      return label === ENGLISH_HOME_TIMELINE_LABEL || learned.includes(label) ? timeline : null;
    }
    return null;
  }

  // The translated Home timeline label, read where its identity is certain.
  function homeTimelineLabel(article, page) {
    if (!HOME_PATH_RE.test(String(page && page.path || ""))) return null;
    const timeline = homeTimeline(article, page);
    const label = attribute(timeline, "aria-label");
    return label && label !== ENGLISH_HOME_TIMELINE_LABEL ? label : null;
  }

  function isFollowingTab(tab, uiLanguage) {
    if (/^en(?:-|$)/i.test(String(uiLanguage || ""))) {
      return /^following$/i.test(String(tab.textContent || "").trim());
    }
    // X translates tab names but keeps Following directly after For you.
    const tablist = closestWith(tab, "role", "tablist");
    if (!tablist || typeof tablist.querySelectorAll !== "function") return true;
    return [...tablist.querySelectorAll('[role="tab"]')].indexOf(tab) === 1;
  }

  // X keeps For You, Following, and topic feeds on the same route. Filter
  // every selected Home feed except Following. X Pro may show several Home
  // columns at once, so fail open if the column selection is ambiguous.
  function isFilteredHomeFeed(article, page) {
    const timeline = homeTimeline(article, page);
    if (!timeline) return false;
    for (let root = timeline; root && !isTag(root, "body"); root = root.parentElement) {
      if (typeof root.querySelectorAll !== "function") continue;
      const selected = [...root.querySelectorAll('[role="tab"][aria-selected="true"]')];
      if (selected.length === 1) return !isFollowingTab(selected[0], page.uiLanguage);
      if (selected.length > 1) return false;
    }
    return false;
  }

  // The page or X Pro column that holds an opened profile's header together
  // with exactly one timeline, so neighbouring columns are never mixed up.
  function profileRootFor(article) {
    const timeline = timelineFor(article);
    if (!timeline) return null;
    for (let node = timeline.parentElement.parentElement; node && !isTag(node, "body");
      node = node.parentElement) {
      if (typeof node.querySelectorAll !== "function") continue;
      if (node.querySelectorAll('section[role="region"]').length > 1) return null;
      if (node.querySelector('[data-testid="UserName"]')) return node;
    }
    return null;
  }

  function isProfileTimeline(article) {
    return Boolean(profileRootFor(article)) ||
      ENGLISH_PROFILE_TIMELINE_RE.test(attribute(timelineFor(article), "aria-label"));
  }

  // Follow buttons carry "<user id>-follow" or "<user id>-unfollow" test IDs
  // in every language, and their translated labels still name @handle.
  function profileRelationship(root, handle) {
    if (!root || !handle || typeof root.querySelectorAll !== "function") return null;
    const mention = new RegExp(`@${handle}(?![A-Za-z0-9_])`, "i");
    for (const button of root.querySelectorAll("button")) {
      const label = attribute(button, "aria-label").trim();
      if (!mention.test(label)) continue;
      const testId = attribute(button, "data-testid");
      if (/-unfollow$/.test(testId)) return true;
      if (/-follow$/.test(testId)) return false;
      if (new RegExp(`^Follow @${handle}$`, "i").test(label)) return false;
      if (new RegExp(`^(?:Following|Unfollow) @${handle}$`, "i").test(label)) return true;
    }
    return null;
  }

  return {
    homeTimelineLabel,
    isFilteredHomeFeed,
    isProfileTimeline,
    profileRelationship,
    profileRootFor
  };
})();
