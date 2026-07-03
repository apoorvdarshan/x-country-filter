// X Country Filter — content script.
// Scans timeline/reply articles, detects a country per post, then hides,
// dims, or badges them according to the popup settings.

(() => {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    mode: "filter", // "filter" | "dim" | "highlight"
    selected: ["US", "IN", "JP"],
    hideUnknown: false,
    customRules: ""
  };

  let settings = { ...DEFAULTS };
  let customHandleMap = {};

  // ---- detection ----------------------------------------------------------

  // One word-boundary regex per keyword. \b breaks on accented chars, so use
  // non-word-char boundaries instead.
  const KEYWORD_RES = {};
  for (const [cc, c] of Object.entries(COUNTRY_DB)) {
    KEYWORD_RES[cc] = c.keywords.map(k => {
      const esc = k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}([^\\p{L}\\p{N}]|$)`, "iu");
    });
  }

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

  function parseCustomRules(text) {
    const map = {};
    for (const line of (text || "").split("\n")) {
      const m = line.match(/^\s*@?([A-Za-z0-9_]{1,15})\s*=\s*([A-Za-z]{2})\s*$/);
      if (m && COUNTRY_DB[m[2].toUpperCase()]) map[m[1].toLowerCase()] = m[2].toUpperCase();
    }
    return map;
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

  function detectCountry({ handle, text, lang }) {
    if (handle && customHandleMap[handle]) return customHandleMap[handle];
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

  // ---- rendering ----------------------------------------------------------

  function removeBadge(article) {
    const b = article.querySelector(":scope .xcf-badge");
    if (b) b.remove();
  }

  function addBadge(article, cc) {
    if (article.querySelector(":scope .xcf-badge")) return;
    const c = COUNTRY_DB[cc];
    const chip = document.createElement("span");
    chip.className = "xcf-badge";
    chip.textContent = `${c.flag} ${cc}`;
    chip.title = c.name;
    article.appendChild(chip);
  }

  function applyToArticle(article) {
    const cell = article.closest('div[data-testid="cellInnerDiv"]') || article;
    cell.classList.remove("xcf-hidden", "xcf-dim");
    article.classList.remove("xcf-match", "xcf-rel");
    removeBadge(article);

    if (!settings.enabled) return;

    const cc = detectCountry(getTweetData(article));
    article.dataset.xcfCountry = cc || "unknown";

    if (cc && settings.selected.includes(cc)) {
      article.classList.add("xcf-match", "xcf-rel");
      addBadge(article, cc);
      return;
    }
    if (settings.mode === "highlight") return;
    if (!cc && !settings.hideUnknown) return;
    cell.classList.add(settings.mode === "filter" ? "xcf-hidden" : "xcf-dim");
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

  chrome.storage.sync.get(DEFAULTS, s => {
    settings = s;
    customHandleMap = parseCustomRules(s.customRules);
    scan();
    new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, { newValue }] of Object.entries(changes)) {
      settings[key] = newValue;
      if (key === "customRules") customHandleMap = parseCustomRules(newValue);
    }
    scan();
  });
})();
