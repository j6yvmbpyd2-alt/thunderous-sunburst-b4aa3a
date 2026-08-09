# MTG Deal Hunter v3 — Netlify package

This is a deploy-ready version of MTG Deal Hunter with:

- the iPhone/PWA singles, sealed, portfolio, watchlist, and BUY/WATCH/PASS tools from v2
- a **Deals** tab backed by Netlify Functions
- persistent deal storage using **Netlify Blobs**
- hourly price/deal scans
- exact-printing reference pricing for singles
- a preview **Trackers** tab with Top 20 watch signals and sales-velocity breakouts
- preview Web Push notifications for target hits, Top 20 entrants, and verified breakouts

## Environment variables

In Netlify: Project configuration → Environment variables.

Push notifications:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- optional `VAPID_SUBJECT`

Breakout scanner:

- `SALES_FEED_URLS` — comma-separated HTTPS JSON feeds containing real sold-count snapshots
- optional `BREAKOUT_MIN_SALES` — default `8`
- optional `BREAKOUT_MIN_MULTIPLIER` — default `2.5`

Other optional variables:

- `DEAL_THRESHOLD` — default `25`
- `DEAL_FEED_URLS` — comma-separated HTTPS JSON feed URLs
- `DEAL_ADMIN_TOKEN`
- `TCGPLAYER_PUBLIC_KEY`
- `TCGPLAYER_PRIVATE_KEY`

## Preview test endpoints

- `/.netlify/functions/top20-now` — manually seed/refresh Top 20
- `/.netlify/functions/breakout-now` — manually run breakout scan
- `/.netlify/functions/push-test` — send a test push to saved subscriptions

Scheduled hourly runs only take effect after the feature is eventually published to production. Keep this branch in preview until the UI and push flow are verified.
