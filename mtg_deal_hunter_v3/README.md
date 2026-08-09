# MTG Deal Hunter v3 — Netlify package

This is a deploy-ready version of MTG Deal Hunter with:

- the iPhone/PWA singles, sealed, portfolio, watchlist, and BUY/WATCH/PASS tools from v2
- a **Deals** tab backed by Netlify Functions
- persistent deal storage using **Netlify Blobs**
- an **hourly scheduled scanner**
- exact Scryfall reference-price lookup for singles when a feed provides a set + collector number (or card name)
- configurable external deal-feed adapters
- a protected manual ingestion endpoint

## Deploy

Upload/deploy the **contents of this folder as a Netlify project**, not just the `public` folder. Netlify needs `netlify.toml`, `package.json`, `public/`, and `netlify/functions/` together so it can deploy the Functions.

If your current site was created by drag-and-drop, the most reliable way to enable Functions is to connect this folder through a Git repository or use Netlify CLI (`netlify deploy --prod`). A static-only upload of `public/` will run the PWA but will not install the backend Functions.

## Environment variables

In Netlify: Project configuration → Environment variables.

Optional:

- `DEAL_THRESHOLD` — default `25`
- `DEAL_FEED_URLS` — comma-separated HTTPS JSON feed URLs
- `DEAL_ADMIN_TOKEN` — a long random secret used by `submit-deal`

### Feed JSON format

Each configured URL can return either an array or `{ "deals": [...] }`.

Example single (market price can be omitted if exact Scryfall fields are supplied):

```json
{
  "type": "single",
  "name": "Force of Vigor",
  "card_name": "Force of Vigor",
  "set": "mar",
  "collector_number": "77",
  "finish": "nonfoil",
  "condition": "NM",
  "store": "Example Games",
  "price": 4.25,
  "url": "https://example.com/listing"
}
```

Example sealed product (the adapter must supply a trustworthy exact-product reference market price):

```json
{
  "type": "sealed",
  "name": "Example Collector Booster Display",
  "store": "Example Games",
  "price": 149.99,
  "market_price": 209.99,
  "detail": "12-pack collector display",
  "url": "https://example.com/product"
}
```

The scanner only stores deals at or above the configured percentage discount.

## Functions

- `/.netlify/functions/health` — backend health check
- `/.netlify/functions/deals` — current qualifying feed
- `scan-deals` — scheduled `@hourly`; also has a **Run now** control in Netlify's Functions UI
- `/.netlify/functions/submit-deal` — protected POST ingestion endpoint

## Important limitation

v3 intentionally does **not** blindly scrape arbitrary game-store HTML. Store sites differ, may change markup, may prohibit automated access, and raw page prices can misidentify product configurations. Instead, `DEAL_FEED_URLS` is the adapter boundary: connect structured feeds or small store-specific adapters that you control/are permitted to query. This avoids false bargains and makes exact-product matching much safer.

## iPhone refresh after redeploy

After deploying v3, open the site in Safari once. If the old v2 UI persists, close the Home Screen app and reopen it; the v3 service worker replaces the old cache. If needed, remove/re-add the Home Screen icon after visiting the v3 site in Safari.
