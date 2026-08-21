const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

function loadDetection(countryFile = "countries.js", detectionFile = "detection.js") {
  const context = { URL };
  context.globalThis = context;
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(countryFile, "utf8"), context, { filename: countryFile });
  vm.runInContext(fs.readFileSync(detectionFile, "utf8"), context, { filename: detectionFile });
  return context.XCF_DETECTION;
}

const detection = loadDetection();

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
  { country: "IN", matchedPlace: "India" }
);
assert.equal(detection.resolveAccountBasedIn("United Arab Emirates").country, "AE");
assert.equal(detection.resolveAccountBasedIn("U.S.A.").country, "US");
assert.equal(
  detection.resolveAccountBasedIn("South Asia").country,
  null,
  "broad X regions must not be guessed as a country"
);

assert.equal(detection.extractAccountBasedIn({
  data: {
    user_result_by_screen_name: {
      result: { about_profile: { account_based_in: "India" } }
    }
  }
}), "India");
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
  { handle: "outerauthor", text: "Outer post", lang: "en" },
  "the outer post author must win over a quoted author"
);

assert.deepEqual(
  JSON.parse(JSON.stringify(detection.normalizeSettings({
    enabled: "yes",
    hidden: ["IN", "IN", "XX", null]
  }))),
  { enabled: true, hidden: ["IN"] },
  "invalid or deleted synchronized settings must fall back safely"
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

function smokeContentScript(countryFile, detectionFile, accountFile, contentFile) {
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
  for (const file of [countryFile, detectionFile, accountFile, contentFile]) {
    vm.runInContext(fs.readFileSync(file, "utf8"), context, { filename: file });
  }
  assert.equal(typeof context.XCF_DEBUG.get, "function", `${contentFile} must initialize`);
}

smokeContentScript("countries.js", "detection.js", "account-location.js", "content.js");
smokeContentScript(
  "store/countries.js",
  "store/detection.js",
  "store/account-location.js",
  "store/content.js"
);

console.log("Detection tests passed");
