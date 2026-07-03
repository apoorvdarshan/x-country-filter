# X Country Filter

Chrome extension (Manifest V3) that filters or highlights posts on **x.com** by country.
Built for keeping up with tech news from specific countries. Works on the home timeline,
search results, and reply threads under a post.

## Install (developer mode)

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. Click **Load unpacked** and select this folder (`x-country-filter`)
4. Open x.com, click the extension icon, pick your countries

## Modes

- **Filter** — hides every post not detected as one of your countries
- **Dim** — fades non-matching posts (hover to un-fade). Use this if Filter ever leaves
  blank gaps or makes infinite scroll stall (X's virtualized list usually reflows fine,
  but Dim is the safe fallback)
- **Highlight** — shows everything, adds a flag badge + blue edge to matching posts

**Also hide posts with unknown origin** — by default, posts the extension can't place
stay visible in Filter/Dim mode. Tick this for a strict countries-only feed.

## How detection works (X gives no location data on timeline posts)

Checked in order, first hit wins:

1. **Custom account rules** — your own `@handle = CC` mappings from the popup
2. **Known accounts** — seed lists of tech-news handles per country in `countries.js`
3. **Keywords** — country/city/company names in the tweet text (word-boundary matched)
4. **Tweet language** — X stamps every tweet with a `lang` attribute; used only when the
   language maps to exactly one country (ja → Japan, ko → South Korea, de → Germany...).
   English is never used as a signal — it's too widespread.

This is heuristic: an American quoting "London" can get tagged UK. For a news feed
that's usually what you want (news *about* a country), but the most reliable signal by
far is rule 1/2 — add the accounts you actually follow via **Custom account rules**.

## Customizing

- Add/edit countries, keywords, and seed handles in `countries.js` (plain JS object)
- After editing files, hit the reload icon on `chrome://extensions` and refresh x.com

## Limitations

- Country detection is best-effort; there is no ground-truth location on posts
- If X renames its `data-testid` attributes (`tweet`, `tweetText`, `User-Name`,
  `cellInnerDiv`), the selectors in `content.js` need updating
- In Filter mode with very strict settings, X may load several pages before anything
  matches — scroll on, or switch to Dim/Highlight
