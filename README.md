# X Country Filter

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Install-1d9bf0?logo=googlechrome&logoColor=white)](https://chromewebstore.google.com/detail/country-filter-for-x-twit/cocohplmilpblbkoikolbhakjipccioa)
[![Product Hunt](https://img.shields.io/badge/Product%20Hunt-Upvote-DA552F?logo=producthunt&logoColor=white)](https://www.producthunt.com/products/country-filter-for-x-twitter/)

Chrome extension (Manifest V3) that hides posts from countries or regions you pick on
**x.com**, including **X Pro** at **pro.x.com**.
Check a country or region in the popup → its posts disappear from your timeline, search, and
reply threads. Everything else stays untouched.

Need an override? Your signed-in account is always protected, so your own posts
remain visible. You can also add X usernames under **Exceptions**, or leave
**Accounts you follow** enabled. All three override every country and region
filter.

The searchable catalog covers 249 countries and areas across 10 regions. Its
geographic grouping is based on the [United Nations M49 standard](https://unstats.un.org/unsd/methodology/m49/overview/)
and adapted to the extension's region labels, with Taiwan and Kosovo included
for labels commonly shown on X.

Support the project: [star it on GitHub](https://github.com/apoorvdarshan/x-country-filter),
[report an issue](https://github.com/apoorvdarshan/x-country-filter/issues/new),
[follow @apoorvdarshan on X](https://x.com/apoorvdarshan), or
[vote on Product Hunt](https://www.producthunt.com/products/country-filter-for-x-twitter/).

## Install

**[Install from the Chrome Web Store →](https://chromewebstore.google.com/detail/country-filter-for-x-twit/cocohplmilpblbkoikolbhakjipccioa)**
— the one-click option.

> The extension checks X's public "Account based in" metadata through your
> logged-in X session, then falls back to conservative local signals. See
> [How detection works](#how-detection-works).

### Install (developer mode)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this folder (`x-country-filter`)
4. Open x.com or pro.x.com (logged in), click the extension icon, check the countries you want gone

## How detection works

The extension combines independent signals into a confidence score:

1. **X's "Account based in" value** (strongest) — fetched from X's own
   `AboutAccountQuery`. Both exact countries and broad regions such as "South
   Asia" are recognized. Results are cached locally for up to 24 hours.
2. **Author's public profile location** — used as a fallback and mapped from
   free text ("Bengaluru, India" → IN, "San Francisco, CA" → US, "東京" → JP).
   Every catalog country supports exact names and common aliases; the original
   hand-tuned countries also recognize major cities and native-script names.
   An opened profile uses its visible location and Follow/Following button
   immediately instead of waiting for X's API.
3. **Known accounts** — lists of well-known tech-news handles per country in `countries.js`
4. **Keywords** — country/city/company names in the post text (word-boundary matched)
5. **Post language** — scored only when the language maps to exactly one country
   in the database (ja → Japan, ko → South Korea...). English is never scored.

A single keyword or language never hides a post by itself. Weak evidence stays
visible, and competing countries are treated as ambiguous. Account metadata
overrides weaker signals; known-author or profile-location evidence can outweigh
topic text. The final country, region, confidence, and reasons are retained
locally for debugging without being added to the page markup.

Before a matching post is hidden, the extension checks three exemptions. The
signed-in username and any username saved in the popup win immediately. When
followed-account protection is enabled, the post remains visible while X's
relationship result is pending and stays visible if you follow that author.

Selecting a region suppresses both accounts whose X metadata shows that broad
region and exact countries assigned to it. For example, selecting South Asia
suppresses both `Account based in: South Asia` and exact India detections.

## About the API access ("cookies")

- Requests go directly to X's `/i/api/...` endpoints from the X page. The
  browser attaches your existing X session; nothing is sent to the developer.
- Two extra headers are needed: the public bearer token of X's own web client
  (a constant shipped in their JS bundle, identical for everyone — it identifies
  the app, not you) and `x-csrf-token`, which is just your `ct0` cookie value.
- The signed-in username is read from X's own page or account-settings response.
  It is used only to protect that account's posts and scope relationship caches.
- On X Pro, the Account menu identifies the signed-in username directly, and
  authors in opened profile columns move to the front of the lookup queue.
- Visible profile evidence is cached locally and shared between open X and
  X Pro tabs for the same signed-in account.
- Country, profile-location, and whether-you-follow results are throttled to
  two accounts per ~2.5 seconds and cached for 24 hours. On HTTP 429 the
  extension backs off for 2 minutes.
- Logged out? Lookups are skipped and the heuristic fallbacks still work.

## If X changes their API

- Primary endpoint is the `AboutAccountQuery` GraphQL call. Broad regions are
  retained directly; public profile location is the fallback when X returns no
  usable account-country or region metadata.
- Profile fallback first tries `/i/api/1.1/users/lookup.json`; if X removes it,
  the extension automatically falls back to `UserByScreenName`. These profile
  responses also provide the followed-account exemption.
- The GraphQL call self-heals when X adds new required feature flags (it parses the
  "features cannot be null" error and retries). If the **query id** itself expires
  (404), update the corresponding operation id in `account-location.js` from a
  current X web request.
- If X renames its `data-testid` attributes (`tweet`, `tweetText`, `User-Name`,
  `cellInnerDiv`), the selectors in `content.js` need updating.

## Customizing

- Add/edit the complete country list and region membership: `country-catalog.js`
- Add richer per-country signals: `countries.js` — `places` (profile-location matching),
  `keywords` (tweet text), `handles` (known accounts), `langs`
- Adjust scoring and ambiguity rules: `detection.js`
- After editing files, hit the reload icon on `chrome://extensions` and refresh x.com

## Development

The extension has no build-time dependencies. Run the detection regression suite with:

```sh
node tests/detection.test.js && node tests/account-location.test.js
```

## Limitations

- X's region labels are broader than countries; selecting a region intentionally
  suppresses every country or area assigned to that region
- Followed-account detection needs a logged-in X session and remains
  best-effort if X changes its private relationship fields
- "Account based in" is X's estimate for the account, not a verified
  nationality or current physical residence
- Profile-location fallback is user-written free text and may be empty or false
- Detection is deliberately conservative; uncertain posts remain visible
- X can change its private web API, so account lookup remains best-effort

## License

[MIT](LICENSE)
