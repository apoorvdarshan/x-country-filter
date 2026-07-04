# Privacy Policy — Country Filter for X

**Last updated: July 4, 2026**

Country Filter for X ("the extension") is a browser extension that hides posts
on x.com from countries the user selects.

## Data collection

**The extension collects no data. Nothing is transmitted to the developer or to
any third party.**

- Your settings (on/off state and selected countries) are stored using Chrome's
  built-in extension storage (`chrome.storage`), which stays in your browser
  and your Chrome profile sync — the developer has no access to it.
- Country detection runs entirely locally in your browser by reading the posts
  already displayed on the page (author handle, post text, post language).
- The extension has no analytics, no tracking, no ads, and makes no network
  requests to any developer-controlled server. It cannot read your browsing
  history and only runs on x.com / twitter.com.

## The open-source developer version

The [GitHub version](https://github.com/apoorvdarshan/x-country-filter) of this
extension additionally looks up post authors' public profile location fields by
querying X's own API from within your logged-in x.com session. Those requests go
directly from your browser to X — the same place the data lives — and results
are cached locally in your browser. That data likewise never reaches the
developer or anyone else.

## Contact

Questions: open an issue at
https://github.com/apoorvdarshan/x-country-filter/issues
or email ad13dtu@gmail.com.
