# Chrome Web Store — listing copy

Copy-paste source for the [developer dashboard](https://chrome.google.com/webstore/devconsole).
Every field below maps to a dashboard field, in the order the dashboard shows them.

Item ID: `cocohplmilpblbkoikolbhakjipccioa`

Live listing: https://chromewebstore.google.com/detail/country-filter-for-x-twit/cocohplmilpblbkoikolbhakjipccioa

---

## Build → Package

Upload: `dist/country-filter-for-x-1.4.0.zip`

Rebuild after any change under `store/`:

```sh
mkdir -p dist
cd store && zip -qr ../dist/country-filter-for-x-1.4.0.zip \
  manifest.json country-catalog.js countries.js detection.js account-location.js content.js content.css \
  popup.html popup.js popup.css icons -x '.*'
```

For updates: bump `version` in `store/manifest.json` first (the store rejects
re-uploads of an existing version number), rename the zip to match.

Fields on the Package tab that need no action:

| Field | Meaning |
|---|---|
| Version / Item type / Permissions | derived automatically from the uploaded zip |
| CRX file / Public key | Google signs and packages the zip itself; nothing to provide |
| Verified CRX uploads (Opt in) | optional supply-chain feature — skip; it requires signing every future upload with your own key |

---

## Access → Test instructions (optional, speeds up review)

```
1. Load the extension and open https://x.com or https://pro.x.com (a logged-in account shows more posts, but public pages work too).
2. Click the extension icon in the toolbar.
3. On the Regions tab, check South Asia — accounts labeled South Asia and exact member-country detections disappear. On the Countries tab, search for India and check it to suppress India alone.
4. Uncheck it — the posts reappear. The header toggle disables the whole filter.
5. Detection checks X's "Account based in" metadata first, then falls back to profile location and conservative on-page signals. Weak and conflicting evidence stays visible.
```

---

## Store listing tab

### Title (from package — edit in `store/manifest.json`, not the dashboard)

```
Country Filter for X (Twitter)
```

### Summary (from package — edit in `store/manifest.json`, max 132 chars)

```
Hide posts from countries or regions you pick on X, including timelines, search, and reply threads.
```

### Description

```
Hide posts from countries or regions you pick — a simple blocklist for your X timeline.

Choose a region or search the complete country-and-area catalog in the popup, and matching posts disappear from your For You feed, Following feed, search results, and reply threads. Uncheck it and they come right back. Selecting a region suppresses both broad X region labels and exact countries within that region.

HOW IT WORKS
The extension checks X's public "Account based in" metadata for post authors first. Both exact countries and broad regions such as "South Asia" are supported. It then falls back to public profile location and signals already on the page — well-known accounts, country and city names in the post text, and the post's language. A single keyword and weak or conflicting evidence stay visible.

PRIVACY
No analytics, no tracking, and no developer-controlled servers. Public author handles are sent only to X's own API through your existing X session; account-country results are cached locally for up to 24 hours. Your settings stay in your browser, and the extension only runs on x.com, pro.x.com, and twitter.com.

FEATURES
• 10 regions and 249 countries and areas, with instant search
• Works on X and X Pro timelines, search, and reply threads
• Confidence scoring reduces false positives
• Live counts for selected regions and countries
• "Uncheck all" to reset instantly
• Open source: github.com/apoorvdarshan/x-country-filter
```

### Category

```
Social Networking
```

(Dashboard label, under the LIFESTYLE group. Google's docs call it
"Social Media & Networking" but the actual dropdown says "Social Networking".)

### Language

```
English
```

### Graphic assets

| Asset | File | Notes |
|---|---|---|
| Store icon | `store-assets/store-icon-128.png` | 128×128, artwork 96×96 + 16px transparent padding |
| Screenshot 1 (hero, upload first) | `store-assets/screenshot-2-hero-1280x800.png` | branded card: logo + tagline + popup |
| Screenshot 2 (timeline) | `store-assets/screenshot-1-timeline-1280x800.png` | popup open over a real x.com feed |
| Small promo tile (optional) | — not made yet | 440×280 PNG, improves discovery placement |

### Global assets

| Field | Value |
|---|---|
| Global promo video (YouTube URL) | leave empty |
| Marquee promo tile (1400×560) | leave empty (optional; only used if featured) |

### Additional fields

| Field | Value |
|---|---|
| Official URL | `None` — requires verifying site ownership in Google Search Console; GitHub repos can't be verified. Homepage URL below covers it. |
| Homepage URL | `https://github.com/apoorvdarshan/x-country-filter` |
| Support URL | `https://github.com/apoorvdarshan/x-country-filter/issues` |
| Mature content | leave **unchecked** — no sexual content, strong language, violence, or drugs/alcohol focus |
| Item support visibility | either is fine; ON shows a support tab pointing at the URLs above |

---

## Privacy tab

### Single purpose

```
Hides posts on x.com, including X Pro at pro.x.com, from countries or regions the user selects.
```

### Permission justification — `storage`

```
Saves the user's settings: the on/off state and the countries or regions they chose to hide. Synced via chrome.storage.sync so settings follow their Chrome profile.
```

### Permission justification — host permission (x.com, pro.x.com, twitter.com content scripts)

```
The extension needs to run on x.com, pro.x.com, and twitter.com to read post author handles, request those authors' public "Account based in" or profile-location metadata from X's own API, inspect displayed post text and language as fallback signals, and hide posts matching the user's blocked countries. It does not run anywhere else and sends nothing to a developer-controlled server.
```

### Are you using remote code?

Select **"No, I am not using Remote code"** — all JS ships inside the package;
there are no external `<script>` tags, remote modules, or `eval` of fetched code.
Leave the justification box empty.

### Data usage

"What user data do you plan to collect" — check **Website content** because the
extension processes public X author handles and account-country/profile-location
metadata. Leave the other categories unchecked; it does not collect the user's
precise location, authentication information, browsing history, communications,
or financial/health information.

Website content use justification:

```
Public X author handles are sent only to X's own API to retrieve public account-country or profile-location metadata needed to filter posts. Results are cached locally for up to 24 hours. Nothing is sent to the developer, used for analytics or advertising, sold, or shared with another service.
```

Certify all three disclosures:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

### Privacy policy URL

```
https://github.com/apoorvdarshan/x-country-filter/blob/master/PRIVACY.md
```

---

## Distribution tab

| Field | Value |
|---|---|
| Payments | **Free of charge** (no in-app purchases) |
| Visibility | **Public** |
| Distribution | **All regions** |

---

## Submission checklist

- [ ] Zip uploaded (Package tab shows title + summary from manifest)
- [ ] Description, category, language filled
- [ ] Store icon uploaded (128×128)
- [ ] Both 1280×800 screenshots uploaded, hero first
- [ ] Privacy tab: purpose, 2 justifications, Website content disclosure, policy URL
- [ ] Distribution: public, all regions
- [ ] "Submit for review" (first review typically takes a few days)

### If a reviewer objects to the name

Drop "(Twitter)" from `name` in `store/manifest.json`, rebuild the zip, re-upload.
The "[Function] for [Brand]" pattern ("Country Filter for X") is explicitly allowed
by Google's branding guidelines.
