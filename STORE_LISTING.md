# Chrome Web Store — listing copy

Copy-paste source for the [developer dashboard](https://chrome.google.com/webstore/devconsole).
Every field below maps to a dashboard field, in the order the dashboard shows them.

Item ID: `cocohplmilpblbkoikolbhakjipccioa`

---

## Build → Package

Upload: `dist/country-filter-for-x-1.0.0.zip`

Rebuild after any change under `store/`:

```sh
cd store && rm -f ../dist/country-filter-for-x-1.0.0.zip && \
zip -qr ../dist/country-filter-for-x-1.0.0.zip \
  manifest.json content.js content.css countries.js \
  popup.html popup.js popup.css icons -x '.*'
```

For updates: bump `version` in `store/manifest.json` first (the store rejects
re-uploads of an existing version number), rename the zip to match.

---

## Store listing tab

### Title (from package — edit in `store/manifest.json`, not the dashboard)

```
Country Filter for X (Twitter)
```

### Summary (from package — edit in `store/manifest.json`, max 132 chars)

```
Hide posts from countries you pick on X. A simple blocklist for your timeline, search, and reply threads.
```

### Description

```
Hide posts from countries you pick — a simple blocklist for your X timeline.

Check a country in the popup and posts from it disappear from your For You feed, Following feed, search results, and reply threads. Uncheck it and they come right back. Everything else stays untouched.

HOW IT WORKS
The extension looks at what's already on the page — well-known accounts, country and city names in the post text, and the post's language — and hides posts that match a country you've blocked. Posts that can't be identified are always shown, so you never lose content by mistake.

PRIVACY
No data is collected. No analytics, no tracking, no external servers. Your settings stay in your browser (synced with your Chrome profile), and the extension only runs on x.com and twitter.com.

FEATURES
• 19 countries to choose from, one-click on/off
• Works on timeline, search, and reply threads
• Live count of how many countries you're hiding
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

### Additional fields (optional but fill them)

| Field | Value |
|---|---|
| Official URL / Homepage | `https://github.com/apoorvdarshan/x-country-filter` |
| Support URL | `https://github.com/apoorvdarshan/x-country-filter/issues` |

---

## Privacy tab

### Single purpose

```
Hides posts on x.com from countries the user selects.
```

### Permission justification — `storage`

```
Saves the user's settings: the on/off state and the list of countries they chose to hide. Synced via chrome.storage.sync so settings follow their Chrome profile.
```

### Permission justification — host permission (x.com, twitter.com content scripts)

```
The extension needs to run on x.com and twitter.com to read the author handle, text, and language of posts already displayed on the page and hide the ones matching the user's blocked countries. It does not run anywhere else.
```

### Data usage

- [x] **Does NOT collect or use any user data** — check this; collect nothing else.
- Certify all three compliance statements (no sale of data, no unrelated use, no creditworthiness use).

### Privacy policy URL

```
https://github.com/apoorvdarshan/x-country-filter/blob/master/PRIVACY.md
```

---

## Distribution tab

| Field | Value |
|---|---|
| Payments | Free |
| Visibility | Public |
| Regions | All regions |

---

## Submission checklist

- [ ] Zip uploaded (Package tab shows title + summary from manifest)
- [ ] Description, category, language filled
- [ ] Store icon uploaded (128×128)
- [ ] Both 1280×800 screenshots uploaded, hero first
- [ ] Privacy tab: purpose, 2 justifications, "no data collected", policy URL
- [ ] Distribution: public, all regions
- [ ] "Submit for review" (first review typically takes a few days)

### If a reviewer objects to the name

Drop "(Twitter)" from `name` in `store/manifest.json`, rebuild the zip, re-upload.
The "[Function] for [Brand]" pattern ("Country Filter for X") is explicitly allowed
by Google's branding guidelines.
