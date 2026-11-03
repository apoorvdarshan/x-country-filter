const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { el } = require("./fake-dom");

const context = {};
context.globalThis = context;
vm.createContext(context);
vm.runInContext(fs.readFileSync("feed.js", "utf8"), context, { filename: "feed.js" });
const feed = context.XCF_FEED;

function post() {
  return el("article", { "data-testid": "tweet" });
}

function timeline(label, article) {
  return el("section", { role: "region" }, [
    el("div", { "aria-label": label }, [el("div", { "data-testid": "cellInnerDiv" }, [article])])
  ]);
}

function tabs(names, selectedIndex) {
  return el("div", { role: "tablist" }, names.map((name, index) =>
    el("div", { role: "presentation" }, [
      el("div", { role: "tab", "aria-selected": String(index === selectedIndex) }, [], name)
    ])
  ));
}

function homePage(label, tabNames, selectedIndex) {
  const article = post();
  el("body", {}, [
    el("div", { "data-testid": "primaryColumn" }, [
      tabs(tabNames, selectedIndex),
      timeline(label, article)
    ])
  ]);
  return article;
}

const SPANISH_LABEL = "Cronología: Tu cronología de inicio";
const SPANISH_TABS = ["Para ti", "Siguiendo", "Tecnología"];

// Translated x.com Home feeds are recognized structurally.
let article = homePage(SPANISH_LABEL, SPANISH_TABS, 0);
assert.equal(feed.isFilteredHomeFeed(article, { path: "/home", uiLanguage: "es" }), true);
assert.equal(feed.homeTimelineLabel(article, { path: "/home" }), SPANISH_LABEL);
assert.equal(
  feed.isFilteredHomeFeed(homePage(SPANISH_LABEL, SPANISH_TABS, 1), { path: "/home", uiLanguage: "es" }),
  false,
  "the translated Following tab, second in the tab list, must stay unfiltered"
);
assert.equal(
  feed.isFilteredHomeFeed(homePage(SPANISH_LABEL, SPANISH_TABS, 2), { path: "/home", uiLanguage: "es" }),
  true,
  "translated topic tabs must be filtered"
);
assert.equal(feed.isFilteredHomeFeed(article, { path: "/explore", uiLanguage: "es" }), false);

// English keeps matching the Following tab by name, wherever it appears.
const ENGLISH_LABEL = "Timeline: Your Home Timeline";
assert.equal(
  feed.isFilteredHomeFeed(homePage(ENGLISH_LABEL, ["For you", "Software", "Following"], 2),
    { path: "/home", uiLanguage: "en" }),
  false
);
assert.equal(
  feed.isFilteredHomeFeed(homePage(ENGLISH_LABEL, ["For you", "Software", "Following"], 1),
    { path: "/home", uiLanguage: "en-GB" }),
  true
);
assert.equal(feed.homeTimelineLabel(homePage(ENGLISH_LABEL, ["For you"], 0), { path: "/home" }), null,
  "the built-in English label does not need to be learned");

// X Pro decks accept the English label and translated labels learned on x.com.
function deckHome(label) {
  const home = post();
  el("body", {}, [
    el("div", {}, [
      el("div", {}, [tabs(SPANISH_TABS, 0), timeline(label, home)]),
      el("div", {}, [timeline("Cronología: Notificaciones", post())])
    ])
  ]);
  return home;
}
const deckPage = { path: "/i/decks/123", uiLanguage: "es", homeLabels: [] };
assert.equal(feed.isFilteredHomeFeed(deckHome(SPANISH_LABEL), deckPage), false,
  "an unknown translated column must fail open");
assert.equal(
  feed.isFilteredHomeFeed(deckHome(SPANISH_LABEL), { ...deckPage, homeLabels: [SPANISH_LABEL] }),
  true
);
assert.equal(feed.isFilteredHomeFeed(deckHome(ENGLISH_LABEL), deckPage), true);
assert.equal(feed.homeTimelineLabel(deckHome(SPANISH_LABEL), deckPage), null,
  "labels are only learned where the Home timeline is certain");

// Opened profiles are found by their header, not by translated labels.
function profilePage(buttonTestId, buttonLabel) {
  const profilePost = post();
  el("body", {}, [
    el("div", { "data-testid": "primaryColumn" }, [
      el("div", { "data-testid": "UserName" }),
      el("div", { "data-testid": "UserLocation" }, [], "Bengaluru, India"),
      el("button", { "data-testid": buttonTestId, "aria-label": buttonLabel }),
      timeline("Cronología: posts de Someone", profilePost)
    ])
  ]);
  return profilePost;
}
article = profilePage("42-unfollow", "Siguiendo a @someone");
assert.equal(feed.isProfileTimeline(article), true);
assert.equal(feed.profileRelationship(feed.profileRootFor(article), "someone"), true);
article = profilePage("42-follow", "Seguir a @someone");
assert.equal(feed.profileRelationship(feed.profileRootFor(article), "someone"), false);
assert.equal(feed.profileRelationship(feed.profileRootFor(article), "some"), null,
  "a longer handle must not satisfy a shorter one");
article = profilePage("", "Following @someone");
assert.equal(feed.profileRelationship(feed.profileRootFor(article), "someone"), true,
  "the English label remains a fallback when X omits the test ID");

// A Home column beside an X Pro profile column is not a profile timeline.
const deckHomePost = post();
const deckProfilePost = post();
el("body", {}, [
  el("div", {}, [
    el("div", {}, [timeline(SPANISH_LABEL, deckHomePost)]),
    el("div", {}, [el("div", { "data-testid": "UserName" }), timeline("Cronología: posts", deckProfilePost)])
  ])
]);
assert.equal(feed.isProfileTimeline(deckHomePost), false);
assert.equal(feed.isProfileTimeline(deckProfilePost), true);
const englishProfilePost = post();
el("body", {}, [timeline("Timeline: Someone’s posts", englishProfilePost)]);
assert.equal(feed.isProfileTimeline(englishProfilePost), true, "the English profile label still counts");

console.log("Feed tests passed");
