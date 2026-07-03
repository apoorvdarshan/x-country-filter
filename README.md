# X Country Filter

Chrome extension (Manifest V3) that hides posts from countries you pick on **x.com**.
Check a country in the popup → its posts disappear from your timeline, search, and
reply threads. Everything else stays untouched.

## Install (developer mode)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this folder (`x-country-filter`)
4. Open x.com, click the extension icon, check the countries you want gone

## How detection works (X gives no location data on timeline posts)

Checked in order, first hit wins:

1. **Known accounts** — lists of well-known tech-news handles per country in `countries.js`
2. **Keywords** — country/city/company names in the tweet text (word-boundary matched)
3. **Tweet language** — X stamps every tweet with a `lang` attribute; used only when the
   language maps to exactly one country (ja → Japan, ko → South Korea, de → Germany...).
   English is never used as a signal — it's too widespread.

Posts that can't be identified are always shown. Since this is a blocklist, imperfect
detection only means an occasional post slips through — it never hides something it
shouldn't have a reason to.

## Customizing

- Add/edit countries, keywords, and known handles in `countries.js` (plain JS object)
- After editing files, hit the reload icon on `chrome://extensions` and refresh x.com

## Limitations

- Country detection is best-effort; there is no ground-truth location on posts
- If X renames its `data-testid` attributes (`tweet`, `tweetText`, `User-Name`,
  `cellInnerDiv`), the selectors in `content.js` need updating
