const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadDetection(
  catalogFile = "country-catalog.js",
  countryFile = "countries.js",
  detectionFile = "detection.js"
) {
  const context = { URL };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(catalogFile, "utf8"), context, { filename: catalogFile });
  vm.runInContext(fs.readFileSync(countryFile, "utf8"), context, { filename: countryFile });
  vm.runInContext(fs.readFileSync(detectionFile, "utf8"), context, { filename: detectionFile });
  return context.XCF_DETECTION;
}

const detection = loadDetection();

function loadCountryData(catalogFile = "country-catalog.js", countryFile = "countries.js") {
  const context = {};
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(catalogFile, "utf8"), context, { filename: catalogFile });
  vm.runInContext(fs.readFileSync(countryFile, "utf8"), context, { filename: countryFile });
  return vm.runInContext(
    "({ catalog: COUNTRY_CATALOG, countries: COUNTRY_DB, regions: REGION_DB })",
    context
  );
}

const countryData = loadCountryData();
assert.equal(Object.keys(countryData.catalog).length, 249, "the complete catalog must contain 249 entries");
assert.equal(Object.keys(countryData.countries).length, 249, "every catalog entry must be selectable");
const regionMembers = Object.values(countryData.regions).flatMap(region => region.countries);
assert.equal(regionMembers.length, 249, "every country or area must belong to a region");
assert.equal(new Set(regionMembers).size, 249, "no country or area may belong to multiple regions");
assert.deepEqual(
  [...new Set(regionMembers)].sort(),
  Object.keys(countryData.catalog).sort(),
  "region membership must exactly cover the catalog"
);

function expectCountry(input, expected, message) {
  assert.equal(detection.detectCountry(input).country, expected, message);
}

// A country being discussed is not enough evidence about the author.
expectCountry(
  { text: "I am visiting Japan next month", lang: "en" },
  null,
  "one topic keyword must not hide a post"
);

expectCountry(
  { text: "Japan Tokyo Nintendo", lang: "en" },
  "JP",
  "three consistent keywords may cross the conservative threshold"
);

expectCountry(
  { text: "Japan and Tokyo", lang: "ja-JP" },
  "JP",
  "language may support multiple matching keywords"
);

expectCountry(
  { text: "A normal Japanese-language post", lang: "ja" },
  null,
  "language alone must not determine a country"
);

const ambiguous = detection.detectCountry({
  text: "India Mumbai and Japan Tokyo",
  lang: "en"
});
assert.equal(ambiguous.country, null);
assert.equal(ambiguous.ambiguous, true, "competing countries must remain visible");

expectCountry(
  { handle: "techcrunch", text: "Japan Tokyo Nintendo", lang: "en" },
  "US",
  "known-author evidence must beat weaker topic evidence"
);

const conflictingStrongSignals = detection.detectCountry({
  handle: "techcrunch",
  locationCountry: "IN",
  text: "",
  lang: "en"
});
assert.equal(conflictingStrongSignals.country, null);
assert.equal(conflictingStrongSignals.ambiguous, true, "conflicting strong evidence must fail open");

expectCountry(
  {
    accountCountry: "IN",
    accountReason: "X account based in: India",
    handle: "techcrunch",
    text: "Japan Tokyo Nintendo",
    lang: "ja"
  },
  "IN",
  "X account-based country must override weaker and conflicting signals"
);

assert.deepEqual(
  JSON.parse(JSON.stringify(detection.resolveAccountBasedIn(" India "))),
  { country: "IN", region: "SOUTH_ASIA", matchedPlace: "India" }
);
assert.equal(detection.resolveAccountBasedIn("United Arab Emirates").country, "AE");
assert.equal(detection.resolveAccountBasedIn("U.S.A.").country, "US");
assert.equal(
  detection.resolveAccountBasedIn("South Asia").country,
  null,
  "broad X regions must not be guessed as a country"
);
assert.equal(detection.resolveAccountBasedIn("South Asia").region, "SOUTH_ASIA");
assert.equal(detection.resolveAccountBasedIn("Western Europe").region, "EUROPE");
assert.equal(detection.resolveAccountBasedIn("Mars").region, null);
assert.equal(detection.regionForCountry("IN"), "SOUTH_ASIA");
assert.equal(detection.regionForCountry("JP"), "EAST_ASIA");
assert.equal(detection.resolveAccountBasedIn("Pakistan").country, "PK");
assert.equal(detection.resolveAccountBasedIn("Pakistan").region, "SOUTH_ASIA");
assert.equal(detection.resolveAccountBasedIn("Turkey").country, "TR");
assert.equal(detection.regionForCountry("KZ"), "CENTRAL_ASIA");
assert.equal(detection.regionForCountry("NZ"), "OCEANIA");
assert.equal(detection.resolveAccountBasedIn("Czech Republic").country, "CZ");
assert.equal(detection.resolveAccountBasedIn("Côte d'Ivoire").country, "CI");
assert.equal(detection.resolveAccountBasedIn("Taiwan").country, "TW");

assert.equal(detection.extractAccountBasedIn({
  data: {
    user_result_by_screen_name: {
      result: { about_profile: { account_based_in: "India" } }
    }
  }
}), "India");
assert.equal(detection.extractAccountBasedIn({
  data: {
    user: {
      result: {
        aboutModule: { aboutProfile: { accountBasedIn: "South Asia" } }
      }
    }
  }
}), "South Asia", "alternate X response shapes must retain broad regions");
assert.equal(detection.extractAccountBasedIn({ data: {} }), "");

assert.deepEqual(
  JSON.parse(JSON.stringify(detection.resolveLocationToCountry("Paris, TX"))),
  { country: "US", matchedPlace: "US state abbreviation" }
);
assert.equal(detection.resolveLocationToCountry("Paris, tx").country, "US");
assert.equal(detection.resolveLocationToCountry("Bengaluru, India").country, "IN");
assert.equal(detection.resolveLocationToCountry("Mars").country, null);

assert.equal(detection.handleFromHref("https://x.com/ForwardEditor/status/12345"), "forwardeditor");
assert.equal(detection.handleFromHref("https://x.com/ForwardEditor"), "forwardeditor");
assert.equal(detection.handleFromHref("/ForwardEditor"), "forwardeditor");
assert.equal(detection.handleFromHref("/home"), null);

const link = href => ({ getAttribute: name => name === "href" ? href : null });
const textElement = {
  textContent: "Outer post",
  getAttribute: name => name === "lang" ? "en" : null
};
const article = {
  querySelectorAll: selector => selector.includes("/status/")
    ? [link("https://x.com/OuterAuthor/status/123"), link("/QuotedAuthor/status/456")]
    : [],
  querySelector: selector => selector.includes("tweetText") ? textElement : null
};
assert.deepEqual(
  JSON.parse(JSON.stringify(detection.getTweetData(article))),
  { handle: "outerauthor", text: "Outer post", lang: "en", mentionedHandles: [] },
  "the outer post author must win over a quoted author"
);

const followedReplyArticle = {
  querySelectorAll: selector => selector.includes("/status/")
    ? [link("/blocked_parent/status/111"), link("/followed_author/status/222")]
    : [],
  querySelector: selector => selector.includes("User-Name")
    ? {
        querySelectorAll: nestedSelector => nestedSelector === "a[href]"
          ? [link("/followed_author")]
          : []
      }
    : selector.includes("tweetText") ? textElement : null
};
assert.equal(
  detection.getTweetData(followedReplyArticle).handle,
  "followed_author",
  "a surfaced reply must use its displayed author instead of the blocked parent"
);

const mentionLink = {
  textContent: "@Viewer_Account",
  getAttribute: name => name === "href" ? "/Viewer_Account" : null
};
const mentionedArticle = {
  querySelectorAll: selector => selector.includes("/status/")
    ? [link("/blocked_author/status/123")]
    : selector === 'a[href]' ? [mentionLink] : [],
  querySelector: selector => selector.includes("tweetText")
    ? {
        textContent: "Thanks @viewer_account and @second_user",
        getAttribute: name => name === "lang" ? "en" : null
      }
    : null
};
assert.deepEqual(
  JSON.parse(JSON.stringify(detection.getTweetData(mentionedArticle).mentionedHandles)),
  ["viewer_account", "second_user"],
  "inline mentions and reply-target links must identify the signed-in account"
);

assert.deepEqual(
  JSON.parse(JSON.stringify(detection.normalizeSettings({
    enabled: "yes",
    hidden: ["IN", "IN", "XX", null],
    hiddenRegions: ["SOUTH_ASIA", "SOUTH_ASIA", "ATLANTIS"],
    exemptHandles: ["@Allowed_User", "https://x.com/allowed_user", "not valid!"],
    protectFollowing: false
  }))),
  {
    enabled: true,
    hidden: ["IN"],
    hiddenRegions: ["SOUTH_ASIA"],
    exemptHandles: ["allowed_user"],
    protectFollowing: false
  },
  "invalid or deleted synchronized settings must fall back safely"
);

assert.equal(detection.normalizeHandle(" @OpenAI "), "openai");
assert.equal(detection.normalizeHandle("https://twitter.com/OpenAI/status/123"), "openai");
assert.equal(detection.normalizeHandle("not valid!"), null);

const exceptionSettings = detection.normalizeSettings({
  exemptHandles: ["always_show"],
  protectFollowing: true
});
assert.equal(detection.exemptionReason("Always_Show", false, exceptionSettings), "username exception");
assert.equal(detection.exemptionReason("someone_else", true, exceptionSettings), "account you follow");
assert.equal(
  detection.exemptionReason("My_Account", false, exceptionSettings, "my_account"),
  "your signed-in account"
);
assert.equal(
  detection.exemptionReason(
    "blocked_author",
    false,
    exceptionSettings,
    "my_account",
    ["my_account"]
  ),
  "mentions your signed-in account"
);
assert.equal(detection.exemptionReason("someone_else", false, exceptionSettings), null);
assert.equal(
  detection.exemptionReason("someone_else", true, { ...exceptionSettings, protectFollowing: false }),
  null
);

assert.deepEqual(
  JSON.parse(JSON.stringify(detection.normalizeSettings({ hidden: ["PK", "TW", "XK"] }))).hidden,
  ["PK", "TW", "XK"],
  "new catalog countries must be valid synchronized settings"
);

const regionSettings = detection.normalizeSettings({
  hidden: [],
  hiddenRegions: ["SOUTH_ASIA"]
});
assert.equal(
  detection.isBlockedLocation("IN", "SOUTH_ASIA", regionSettings),
  true,
  "a selected region must suppress exact member countries"
);
assert.equal(detection.isBlockedLocation(null, "SOUTH_ASIA", regionSettings), true);
assert.equal(detection.isBlockedLocation("JP", "EAST_ASIA", regionSettings), false);

assert.equal(
  fs.readFileSync("country-catalog.js", "utf8"),
  fs.readFileSync("store/country-catalog.js", "utf8"),
  "developer and store builds must share the complete country catalog"
);
assert.equal(
  fs.readFileSync("countries.js", "utf8"),
  fs.readFileSync("store/countries.js", "utf8"),
  "developer and store builds must share identical country signals"
);
assert.equal(
  fs.readFileSync("detection.js", "utf8"),
  fs.readFileSync("store/detection.js", "utf8"),
  "developer and store builds must share identical detection rules"
);
assert.equal(
  fs.readFileSync("account-location.js", "utf8"),
  fs.readFileSync("store/account-location.js", "utf8"),
  "developer and store builds must share identical account lookup rules"
);
assert.equal(
  fs.readFileSync("content.js", "utf8"),
  fs.readFileSync("store/content.js", "utf8"),
  "developer and store builds must share identical content behavior"
);
for (const file of ["popup.html", "popup.css", "popup.js"]) {
  assert.equal(
    fs.readFileSync(file, "utf8"),
    fs.readFileSync(`store/${file}`, "utf8"),
    `developer and store builds must share identical ${file}`
  );
}
const popupMarkup = fs.readFileSync("popup.html", "utf8");
for (const url of [
  "https://github.com/apoorvdarshan/x-country-filter",
  "https://github.com/apoorvdarshan/x-country-filter/issues/new",
  "https://x.com/apoorvdarshan"
]) {
  assert.ok(popupMarkup.includes(`href="${url}"`), `popup must link to ${url}`);
}
for (const file of ["manifest.json", "store/manifest.json"]) {
  const manifest = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(manifest.version, "1.6.9");
  assert.equal(manifest.content_scripts[0].js[0], "country-catalog.js");
}

function smokeContentScript(catalogFile, countryFile, detectionFile, accountFile, contentFile) {
  const context = {
    URL,
    clearInterval() {},
    clearTimeout() {},
    document: {
      body: {},
      cookie: "",
      querySelectorAll: () => []
    },
    setInterval: () => 1,
    setTimeout: () => 1,
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
    chrome: {
      runtime: { id: "test-extension" },
      storage: {
        local: {
          get: (_key, callback) => callback({}),
          set() {}
        },
        sync: {
          get: (defaults, callback) => callback(defaults),
          set() {}
        },
        onChanged: { addListener() {} }
      }
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of [catalogFile, countryFile, detectionFile, accountFile, contentFile]) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  assert.equal(typeof context.XCF_DEBUG.get, "function", `${contentFile} must initialize`);
}

smokeContentScript(
  "country-catalog.js",
  "countries.js",
  "detection.js",
  "account-location.js",
  "content.js"
);
smokeContentScript(
  "store/country-catalog.js",
  "store/countries.js",
  "store/detection.js",
  "store/account-location.js",
  "store/content.js"
);

function runContentScenario({
  settings,
  cached,
  expectedHidden,
  expectedReason = null,
  expectedPending = false,
  viewerHandle = null,
  mentionedHandle = null,
  surface = "forYou",
  profile = null
}) {
  const classes = new Set();
  const body = {};
  const cell = {
    classList: {
      add: value => classes.add(value),
      remove: value => classes.delete(value)
    }
  };
  const timeline = {
    getAttribute: name => name === "aria-label" ? "Timeline: Test Author’s posts" : null
  };
  const selectedTab = {
    textContent: /following/i.test(surface)
      ? "Following"
      : surface === "software" ? "Software"
        : surface === "tech" ? "Tech"
          : "For you"
  };
  const homeColumn = {
    parentElement: body,
    querySelectorAll: selector => selector.includes('role="tab"') ? [selectedTab] : []
  };
  const homeTimeline = {
    parentElement: homeColumn,
    querySelectorAll: () => []
  };
  const primaryColumn = {
    querySelector: selector => selector.includes("UserLocation") && profile
      ? { textContent: profile.location }
      : null,
    querySelectorAll: selector => selector === "button" && profile &&
      typeof profile.following === "boolean"
      ? [{
          getAttribute: name => name === "aria-label"
            ? `${profile.following ? "Following" : "Follow"} @test_author`
            : null
        }]
      : []
  };
  const article = {
    isConnected: true,
    closest: selector => {
      if (selector.includes("Timeline: Your Home Timeline")) {
        return !profile && /^(?:forYou|following|software|tech|proForYou|proFollowing)$/.test(surface)
          ? homeTimeline
          : null;
      }
      if (selector.includes('aria-label^="Timeline:"')) return profile ? timeline : null;
      if (selector.includes("primaryColumn")) return profile ? primaryColumn : null;
      if (selector.includes("cellInnerDiv")) return cell;
      return null;
    },
    querySelectorAll: selector => {
      if (selector.includes("/status/")) {
        return [{ getAttribute: () => "/test_author/status/123" }];
      }
      if (selector === 'a[href]' && mentionedHandle) {
        return [{
          textContent: `@${mentionedHandle}`,
          getAttribute: name => name === "href" ? `/${mentionedHandle}` : null
        }];
      }
      return [];
    },
    querySelector: selector => selector.includes("tweetText")
      ? { textContent: "India Mumbai Delhi", getAttribute: () => "en" }
      : null
  };
  const context = {
    URL,
    URLSearchParams,
    clearInterval() {},
    clearTimeout() {},
    document: {
      body,
      cookie: "",
      querySelector: selector => primaryColumn.querySelector(selector),
      querySelectorAll: selector => {
        if (selector.includes('article[data-testid="tweet"]')) return [article];
        if (viewerHandle && selector.includes("SideNav_AccountSwitcher_Button")) {
          return [{ textContent: "Viewer@" + viewerHandle, getAttribute: () => null }];
        }
        return [];
      }
    },
    location: {
      pathname: profile
        ? profile.path || "/test_author"
        : /^pro/.test(surface) ? "/i/decks/123"
          : surface === "notifications" ? "/notifications"
            : surface === "reply" ? "/blocked_author/status/123"
              : "/home"
    },
    setInterval: () => 1,
    setTimeout: () => 1,
    MutationObserver: class { observe() {} disconnect() {} },
    chrome: {
      runtime: { id: "test-extension" },
      storage: {
        local: {
          get: (_key, callback) => callback(cached ? {
            xcfLocCache: {
              version: 10,
              viewer: viewerHandle,
              entries: { test_author: { ...cached, ts: Date.now() } }
            }
          } : {}),
          set() {}
        },
        sync: {
          get: (defaults, callback) => callback({ ...defaults, ...settings }),
          set() {}
        },
        onChanged: { addListener() {} }
      }
    }
  };
  context.globalThis = context;
  vm.createContext(context);
  for (const file of [
    "country-catalog.js", "countries.js", "detection.js", "account-location.js", "content.js"
  ]) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }

  assert.equal(classes.has("xcf-hidden"), expectedHidden);
  const state = context.XCF_DEBUG.get(cell);
  assert.equal(state && state.exemptionReason || null, expectedReason);
  assert.equal(Boolean(state && state.pendingRelationship), expectedPending);
}

runContentScenario({
  settings: { hidden: ["IN"], exemptHandles: ["test_author"] },
  expectedHidden: false,
  expectedReason: "username exception"
});
runContentScenario({
  settings: { hidden: ["IN"] },
  viewerHandle: "viewer_account",
  cached: {
    basedIn: "India",
    accountCountry: "IN",
    accountRegion: "SOUTH_ASIA",
    profileCountry: null,
    cc: "IN",
    following: true
  },
  expectedHidden: false,
  expectedReason: "account you follow"
});
runContentScenario({
  settings: { hidden: ["IN"] },
  viewerHandle: "viewer_account",
  cached: {
    basedIn: "India",
    accountCountry: "IN",
    accountRegion: "SOUTH_ASIA",
    profileCountry: null,
    cc: "IN",
    following: null
  },
  expectedHidden: false,
  expectedPending: true
});
runContentScenario({
  settings: { hidden: ["IN"] },
  viewerHandle: "viewer_account",
  cached: {
    basedIn: "India",
    accountCountry: "IN",
    accountRegion: "SOUTH_ASIA",
    profileCountry: null,
    cc: "IN",
    following: false
  },
  expectedHidden: true
});
runContentScenario({
  settings: { hiddenRegions: ["SOUTH_ASIA"] },
  viewerHandle: "viewer_account",
  surface: "proForYou",
  cached: {
    basedIn: "South Asia",
    accountCountry: null,
    accountRegion: "SOUTH_ASIA",
    profileCountry: null,
    cc: null,
    following: false
  },
  expectedHidden: true
});
runContentScenario({
  settings: { hidden: ["IN"] },
  viewerHandle: "viewer_account",
  surface: "software",
  cached: {
    basedIn: "India",
    accountCountry: "IN",
    accountRegion: "SOUTH_ASIA",
    profileCountry: null,
    cc: "IN",
    following: false
  },
  expectedHidden: true
});
runContentScenario({
  settings: { hidden: ["IN"] },
  viewerHandle: "viewer_account",
  surface: "following",
  cached: {
    basedIn: "India",
    accountCountry: "IN",
    accountRegion: "SOUTH_ASIA",
    profileCountry: null,
    cc: "IN",
    following: false
  },
  expectedHidden: false
});
runContentScenario({
  settings: { hidden: ["IN"] },
  viewerHandle: "viewer_account",
  surface: "reply",
  cached: {
    basedIn: "India",
    accountCountry: "IN",
    accountRegion: "SOUTH_ASIA",
    profileCountry: null,
    cc: "IN",
    following: false
  },
  expectedHidden: false
});
runContentScenario({
  settings: { hidden: ["IN"] },
  viewerHandle: "viewer_account",
  surface: "notifications",
  cached: {
    basedIn: "India",
    accountCountry: "IN",
    accountRegion: "SOUTH_ASIA",
    profileCountry: null,
    cc: "IN",
    following: false
  },
  expectedHidden: false
});
runContentScenario({
  settings: { hidden: ["IN"] },
  viewerHandle: "viewer_account",
  surface: "proForYou",
  cached: {
    basedIn: "India",
    accountCountry: "IN",
    accountRegion: "SOUTH_ASIA",
    profileCountry: null,
    cc: "IN",
    following: false
  },
  expectedHidden: true
});
runContentScenario({
  settings: { hidden: ["IN"] },
  viewerHandle: "viewer_account",
  surface: "proFollowing",
  cached: {
    basedIn: "India",
    accountCountry: "IN",
    accountRegion: "SOUTH_ASIA",
    profileCountry: null,
    cc: "IN",
    following: false
  },
  expectedHidden: false
});
runContentScenario({
  settings: { hidden: ["IN"] },
  viewerHandle: "viewer_account",
  mentionedHandle: "viewer_account",
  cached: {
    basedIn: "India",
    accountCountry: "IN",
    accountRegion: "SOUTH_ASIA",
    profileCountry: null,
    cc: "IN",
    following: false
  },
  expectedHidden: false,
  expectedReason: "mentions your signed-in account"
});
runContentScenario({
  settings: { hidden: ["IN"] },
  expectedHidden: false,
  expectedPending: true
});
runContentScenario({
  settings: { hidden: ["IN"], protectFollowing: false },
  viewerHandle: "test_author",
  profile: { location: "India", following: false },
  expectedHidden: false,
  expectedReason: null
});
runContentScenario({
  settings: { hidden: ["IN"] },
  viewerHandle: "viewer_account",
  profile: { location: "India", following: false },
  expectedHidden: false
});
runContentScenario({
  settings: { hidden: ["IN"] },
  viewerHandle: "viewer_account",
  profile: { location: "India", following: false, path: "/i/decks/123" },
  expectedHidden: false
});
runContentScenario({
  settings: { hidden: ["IN"] },
  viewerHandle: "viewer_account",
  profile: { location: "India", following: null, path: "/i/decks/123" },
  expectedHidden: false,
  expectedPending: false
});
runContentScenario({
  settings: { hidden: ["IN"] },
  viewerHandle: "viewer_account",
  profile: { location: "India", following: true },
  expectedHidden: false,
  expectedReason: null
});

console.log("Detection tests passed");
