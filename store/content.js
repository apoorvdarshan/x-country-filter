// X Country Filter — content script.
// Detects a country per post and hides posts from the countries the user checked.

(() => {
  "use strict";

  const DEFAULTS = {
    enabled: true,
    hidden: [] // country codes to hide
  };

  let settings = { ...DEFAULTS };

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

  function applyToArticle(article) {
    const cell = article.closest('div[data-testid="cellInnerDiv"]') || article;
    cell.classList.remove("xcf-hidden");

    if (!settings.enabled || settings.hidden.length === 0) return;

    const cc = detectCountry(getTweetData(article));
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

  chrome.storage.sync.get(DEFAULTS, s => {
    settings = s;
    scan();
    new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "sync") return;
    for (const [key, { newValue }] of Object.entries(changes)) settings[key] = newValue;
    scan();
  });
})();
