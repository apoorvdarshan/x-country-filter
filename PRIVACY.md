# Privacy Policy — Country Filter for X

**Last updated: August 21, 2026**

Country Filter for X ("the extension") is a browser extension that hides posts
on x.com, including X Pro at pro.x.com, from countries or regions the user selects.

## Data collection

**The extension sends no data to the developer and uses no developer-controlled
server. It does not sell or share data with outside services.**

- Your settings (on/off state, selected countries or regions, username
  exceptions, and followed-account protection preference) are stored using
  Chrome's built-in extension storage (`chrome.storage`), which stays in your
  browser and your Chrome profile sync — the developer has no access to it.
- The extension reads the signed-in X username from X's page or account-settings
  response so it can keep your own posts visible and prevent relationship-cache
  results from carrying across different signed-in accounts.
- To identify an account's country, the extension sends that public account
  handle directly to X's own API through your existing logged-in X session and
  reads X's public "Account based in" or profile-location response and whether
  your logged-in account follows that author. The request is not sent anywhere
  else.
- Account-country and followed-account results are cached in
  `chrome.storage.local` for up to 24 hours and scoped to the signed-in
  username. Detection also reads post text and language already displayed on
  the page. All filtering, exception checks, and scoring happen locally in your
  browser.
- The extension has no analytics, no tracking, no ads, and makes no network
  requests to any developer-controlled server. It cannot read your browsing
  history and only runs on x.com, pro.x.com, and twitter.com.

## Contact

Questions: open an issue at
https://github.com/apoorvdarshan/x-country-filter/issues
or email ad13dtu@gmail.com.
