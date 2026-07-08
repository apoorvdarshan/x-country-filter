# X Country Filter

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-1d9bf0?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/country-filter-for-x-twit/cocohplmilpblbkoikolbhakjipccioa)

Chrome extension (Manifest V3) that hides posts from countries you pick on **x.com**.
Check a country in the popup → its posts disappear from your timeline, search, and
reply threads. Everything else stays untouched.

## Install

**[Install from the Chrome Web Store →](https://chromewebstore.google.com/detail/country-filter-for-x-twit/cocohplmilpblbkoikolbhakjipccioa)**
— the one-click option.

> The Chrome Web Store build detects countries from what's already on the page
> (known accounts, keywords, post language). The developer-mode version below
> adds a stronger signal: the author's profile location, looked up from X's own
> API in your logged-in session. See [How detection works](#how-detection-works).

### Install (developer mode)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this folder (`x-country-filter`)
4. Open x.com (logged in), click the extension icon, check the countries you want gone

## How detection works

Checked in order, first hit wins:

1. **Author's profile location** (strongest) — the extension calls X's internal API
   *as you* (same-origin fetch from x.com, so your session cookies are sent
   automatically) and reads each author's profile "location" field, then maps the
   free text to a country ("Bengaluru, India" → IN, "San Francisco, CA" → US,
   "東京" → JP). Results are cached for 7 days in `chrome.storage.local`.
2. **Known accounts** — lists of well-known tech-news handles per country in `countries.js`
3. **Keywords** — country/city/company names in the tweet text (word-boundary matched)
4. **Tweet language** — used only when the language maps to exactly one country
   (ja → Japan, ko → South Korea...). English is never used as a signal.

Posts that can't be identified are always shown. Since this is a blocklist,
imperfect detection only means an occasional post slips through.

## About the API access ("cookies")

- Requests go to `x.com/i/api/...` from a content script running on x.com — the
  browser attaches your own cookies. Nothing is read, copied, or sent anywhere else.
- Two extra headers are needed: the public bearer token of X's own web client
  (a constant shipped in their JS bundle, identical for everyone — it identifies
  the app, not you) and `x-csrf-token`, which is just your `ct0` cookie value.
- Lookups are batched (up to 40 accounts per request, one request per ~2.5 s) and
  cached 7 days, so traffic is minimal. On HTTP 429 it backs off for 2 minutes.
- Logged out? Lookups are skipped and the heuristic fallbacks still work.

## If X changes their API

- Primary endpoint is `/i/api/1.1/users/lookup.json` (batch). If X removes it, the
  extension automatically falls back to the `UserByScreenName` GraphQL call.
- The GraphQL call self-heals when X adds new required feature flags (it parses the
  "features cannot be null" error and retries). If the **query id** itself expires
  (404): open DevTools → Network on x.com, visit any profile, find the
  `UserByScreenName` request and copy the id segment of its URL into
  `GQL_QUERY_ID` in `content.js`.
- If X renames its `data-testid` attributes (`tweet`, `tweetText`, `User-Name`,
  `cellInnerDiv`), the selectors in `content.js` need updating.

## Customizing

- Add/edit countries: `countries.js` — `places` (profile-location matching),
  `keywords` (tweet text), `handles` (known accounts), `langs`
- After editing files, hit the reload icon on `chrome://extensions` and refresh x.com

## Limitations

- Profile location is free text users set themselves — empty, joke locations
  ("the internet", "Mars"), or unlisted cities resolve to nothing and fall back
  to the weaker heuristics
- Detection is best-effort; X exposes no verified location for accounts

## License

[MIT](LICENSE)
