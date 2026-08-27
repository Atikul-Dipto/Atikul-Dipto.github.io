# Price Pulse

A React dashboard for browsing and comparing public e-commerce prices in Bangladesh, backed by a Selenium scraping pipeline and (optionally) a live FastAPI + PostgreSQL backend that keeps a running price-history "storehouse" instead of a one-off snapshot.

There are two ways this project runs, and both work at all times:

- **Static** — `run_pipeline.py` scrapes into a local SQLite file and exports JSON snapshots straight into `public/`, which the deployed static site (this repo's GitHub Pages) reads directly. No backend involved. This is what's live today.
- **Live** — a Postgres database + FastAPI backend (`backend/`) accumulate every scrape into real history, and the frontend calls its API instead of the static files whenever `VITE_API_BASE_URL` is set and reachable. Falls back to the static files automatically otherwise (see "Frontend" below) — the live backend is additive, not a replacement.

## Scraping pipeline

`run_pipeline.py` scrapes every site configured in [`sites.yaml`](sites.yaml), stores every observation in a SQLite history database, and exports the latest snapshot to JSON — straight into `public/products.json`, which is what the frontend actually loads at runtime.

Requirements: Python 3.10+, Google Chrome, and a matching Selenium-managed ChromeDriver.

```bash
pip install -r requirements.txt

# Scrape every configured site once — products AND banners
python run_pipeline.py run

# Scrape a subset
python run_pipeline.py run --only daraz,startech,othoba

# Products only, skip the banner pass
python run_pipeline.py run --skip-banners

# (Re-)scrape just the promo banners
python run_pipeline.py banners

# Run forever, re-scraping every 15 minutes (matches the dashboard's "syncing every 15 min")
python run_pipeline.py loop --interval-minutes 15
```

Add `--headed` to watch Chrome while tuning selectors, and `--log-level DEBUG` for more detail.

### Tracking more products

Three independent levers, from cheapest to most work:

1. **Raise `--limit`** (default **150**, was 24) — caps items scraped per URL, e.g. `python run_pipeline.py run --limit 300`. **This has a real ceiling per site**, checked 2026-08-27 by scraping each site and counting cards in the DOM with and without scrolling — a site's single-page-load card count doesn't grow past what's actually rendered, `--limit` just stops being the bottleneck once it's above that:
   | Site | Cards per page (no scroll) |
   |---|---|
   | Shwapno (homepage) | ~110-120 (many stacked carousels) |
   | Daraz, Othoba | ~40 |
   | Cartup (homepage) | ~60 |
   | Star Tech, Bikroy, Pickaboo | ~20-24 (hard page-size cap) |

   For the capped sites, getting more per query needs real pagination (following `?page=2`, `?page=3`, ...) — not built, since it's a meaningfully bigger job than a config change. `--limit` above a site's natural ceiling is harmless, just a no-op past that point.
2. **Add more URLs to a site already in `sites.yaml`** — each entry in that site's `urls:` list gets scraped in full and added to the feed; a site's selectors are usually stable across different search queries/category pages on the same storefront, so this is normally a one-line addition, not new selector work. E.g. Daraz currently scrapes both a `wireless+headphones` and a `rice` search — add another `?q=<term>` line for another category. This *does* work around the per-page ceiling above (Othoba already gets a `?page=2` line for exactly this reason) — it's just a per-URL addition rather than the scraper following pagination on its own. Worth pointing overlapping-category sites (the grocery-carrying ones: Othoba, Shwapno, Cartup) at the *same* kind of item when you can — that's what gives the cross-platform comparison feature something to actually match on.
3. **Add a new site entirely** — copy the `my_site:` template further down this file into `sites.yaml`, run `python run_pipeline.py inspect my_site` to check what actually matched, and iterate on the selectors from the saved HTML in `data/debug/`. This is the only lever that needs real verification work; see "Configured sites" below for which of the current sites still need it.

**On freshness**: the live backend's scheduler (below) re-scrapes every `SCRAPE_INTERVAL_MINUTES` (default 60) — every scrape writes a new `price_history` row regardless of whether the price actually changed, so a price change on the source site is captured into Postgres within one interval. A shorter interval catches changes sooner but hits each site's servers more often; 60 minutes was chosen deliberately over something more aggressive to stay polite to sites that don't publish rate limits.

### Output

- `data/pricetracker.db` — SQLite history: every price observation ever recorded, per product per site (`products` + `price_history` tables). This is what lets the dashboard show a "was ৳X" price-drop indicator instead of just a snapshot. Gitignored — regenerated, not source.
- `public/products.json` — the latest known price per product, plus the price recorded just before it (`previous_price`).
- `public/banners.json` — the current homepage promo/offer banners per site (image + link). No SQLite history behind this one — banners rotate too often for a "previous banner" to be meaningful — so a partial `--only` run merges onto whatever's already in the file instead of overwriting it, or it would silently drop every site it didn't touch.

**Both JSON files are committed**, not gitignored: it's a static site with no backend, so these have to physically exist in the deployed build for the dashboard to have anything to show. Re-run the pipeline and commit the refreshed files whenever you want the live site to reflect newer prices/banners.

### Configured sites

| Site | Status | Banners | Notes |
|---|---|---|---|
| Daraz | ✅ verified | ✅ | Card container has a stable `data-qa-locator`, but title/price use hashed CSS-module classes that drift on redeploy — see `sites.yaml` notes. |
| Othoba | ✅ verified | ✅ | Points at the `/food-grocery` category (not the homepage) so its listings plausibly overlap with Shwapno/Cartup for cross-platform comparison. Banner carousel lazy-loads via `data-background-image` and links via an inline `onclick`, not a normal `<img src>`/`<a href>` — handled as special cases in `scraper/banners.py`. |
| Shwapno | ✅ verified | ✅ | Selectors confirmed against real class names (Tailwind, hydrated client-side). |
| Star Tech | ✅ verified | ✅ | Selectors confirmed against real rendered search results. |
| Bikroy | ✅ verified | ✅ | Classifieds site — one price per ad, no discount field. |
| Cartup | ✅ verified | ✅ | Was stuck at 1 product/run until 2026-08-28: its card selector matches an `<a>` directly (not a wrapper div), and the URL-extraction code only checked for a *nested* anchor — every card silently fell back to the homepage URL, so every product collapsed into one row via the dedup key. Fixed generically in `scraper/pipeline.py` (checks the card's own `href` first). Also fixed: the homepage's secondary "trending" widget has no visible name text at all, only an `<img alt="...">` — `element_text()` in `scraper/parsing.py` now falls back to `alt` for `<img>` elements. Yield went from 1 to ~55-60 real products per run. Content still rotates between loads, so exact yield varies run to run. |
| Pickaboo | ✅ verified | ✅ | Selectors confirmed against a real rendered category page. Discounted cards hold current + strikethrough price in the same `.product-price` element with no separator — same concatenation trap as Star Tech/Othoba, scoped selectors avoid it. Homepage hero slides have no link at all (not even `onclick`), so banners fall back to linking the homepage. |
| Packly | ⚠️ unverified | — | No product markup found at all — the URL may need to be a specific catalog page, or this may not be the storefront you meant (packly.com reads as a custom-packaging site). |
| Chaldal | ⚠️ unverified | — | Its homepage isn't a product listing at all; its search box is a live JS autocomplete with no real results-page URL behind it, so you'd need a real category URL or the autocomplete's XHR endpoint. |

Two more sites were tried and dropped rather than shipped half-working: **AjkerDeal** — its server doesn't respond at all (TCP connection times out on port 443, not a bot-block) as of 2026-08-27, likely defunct. **Ryans Computers** — sits behind a Cloudflare bot challenge ("Just a moment..." interstitial); circumventing that is a materially different, more ToS-sensitive activity than the plain scraping every other site here uses, so it wasn't pursued.

Banner scraping is a separate, simpler pass than product scraping — one image, one link, no price to parse — configured per site via `banner_url` / `banner_selectors` (see `sites.yaml`). Packly and Chaldal don't have it configured since their product selectors aren't trustworthy yet either.

For any ⚠️ site, run the inspector before trusting its output:

```bash
python run_pipeline.py inspect cartup
```

This renders the page in Chrome, saves the post-JavaScript HTML and a screenshot to `data/debug/`, and reports how many product cards the current `card_selectors` matched. Open the saved HTML, find the real product-card class names, and update that site's entry in `sites.yaml` (`card_selectors`, `name_selectors`, `price_selectors`, `original_price_selectors`).

### Adding or fixing a site

Every site is a plain entry in `sites.yaml`:

```yaml
my_site:
  name: My Site
  urls:
    - "https://example.com/category/headphones"
  card_selectors: [".product-card"]      # tried in order, first match wins
  name_selectors: [".product-title"]
  price_selectors: [".price"]
  original_price_selectors: [".price-was"]
  verified: true
  notes: "Optional freeform notes for future you."
```

No code changes needed — `run_pipeline.py run` picks up new entries automatically, on both the static pipeline and the live backend below (they share `sites.yaml` and the same scraping code in `scraper/`).

Use only on sites that permit automated access, and respect terms, robots rules, rate limits, and copyright restrictions.

## Backend (Postgres + FastAPI) — the "storehouse"

This is what turns "a JSON snapshot I re-export by hand" into a real, continuously-updated price history. It's local-only for now — no hosting has been set up, that's a deliberate, separate decision for later.

```bash
# 1. Start Postgres (isolated on host port 5433 — some machines already
#    run Postgres for other projects on the default 5432)
docker compose up -d

# 2. Start the API (run from ecommerce-price-tracker/ so the sibling
#    `scraper` package resolves; -m is important, see note below)
python -m uvicorn backend.app.main:app --reload --port 8000
```

On startup it creates the schema if it doesn't exist yet (`scraper/storage_pg.py`, mirrors the SQLite schema plus a `banners` table) and — unless `SCRAPE_ON_STARTUP=false` — immediately scrapes every configured site once, then again every `SCRAPE_INTERVAL_MINUTES` (default 60). Copy `.env.example` to `.env` to override any of this locally; `.env` is gitignored.

**Why `python -m uvicorn` and not the bare `uvicorn` command:** `-m` puts the current directory on `sys.path`, which is how `backend/` finds the sibling `scraper` package without any packaging setup. The bare console-script entry point doesn't reliably do this.

### API

- `GET /api/health` — readiness probe (checks the DB connection)
- `GET /api/products?q=&site=&sort=discount|price_asc|price_desc|newest&limit=&offset=` — paginated, with `previous_price` for the price-drop indicator
- `GET /api/products/{id}` / `GET /api/products/{id}/history` — one product's latest snapshot / full price-over-time series
- `GET /api/banners?site=`
- `GET /api/compare-groups?min_stores=2` — server-computed cross-platform matches (see below)
- `GET /api/sites` — per-site product/banner counts and last-scraped time, merged from Postgres + `sites.yaml`
- `POST /api/scrape/run {only?, headless?}` / `POST /api/scrape/banners {only?}` — trigger a scrape on demand instead of waiting for the interval; returns immediately, runs on the scheduler's thread pool

Full interactive docs at `http://localhost:8000/docs` once it's running.

### How it writes data

`scraper/pipeline.py`'s `scrape_url_with_retries()` and `scraper/banners.py`'s `scrape_banners()` — the same functions the static CLI pipeline uses — return plain dataclasses and know nothing about storage. `backend/app/scheduler.py::run_scrape_job()` calls them directly and writes into Postgres via `scraper/storage_pg.py`. `scraper/storage.py` (SQLite) and `run_pipeline.py` are untouched by any of this — `python run_pipeline.py inspect <site>` still works exactly as before for verifying a new site's selectors before adding it.

## Frontend

```bash
npm install
npm run dev
```

On load, the dashboard tries the backend first (`VITE_API_BASE_URL`, defaulted to `http://localhost:8000` in dev via the committed `.env.development`) and falls back to the static `public/products.json`/`banners.json` export if that env var is unset or the request fails — which is exactly the case for the deployed static site today, since no backend is hosted anywhere yet. Either way: search by name, filter by store, sort by discount/price/recency, click "Visit" to go straight to the listing on the source site, and star a product to add it to a localStorage-backed watchlist (persists across visits, per browser). Metrics are computed live from whichever data source is active — none of it is hardcoded. The header shows which source is active ("Live" vs "Static snapshot").

If there's no data at all yet, the dashboard shows an empty state with the exact command to run instead of silently showing nothing.

### Cross-platform comparison

There's no shared product ID across unrelated storefronts — "the same product on two sites" can only be inferred from listing-name text, and getting that wrong actively misleads a shopper (a false "it's cheaper elsewhere" is worse than not showing a comparison at all). So the matching — **`backend/app/matching.py`** when the live API is active, source of truth — is deliberately conservative, with hard gates rather than one similarity score:

1. Quantity notation is normalized (`"500 gm"` / `"500gm"` → the same token) so real matches aren't missed on formatting alone.
2. **Brand gate**: the first word of a listing title is almost always the brand in these catalogs — two listings must share it, or they never group, no matter how similar the rest of the words look. This is what stops "PRAN Full Cream Milk Powder 1kg" from being shown next to "AMA Full Cream Milk Powder 1kg" as if they were the same product.
3. **Quantity gate**: if both names carry a detected size/weight, it must match too, so a 500g pack and a 1kg pack of the same brand are never shown as directly comparable.
4. Only past both gates does word-overlap get a vote (Jaccard similarity ≥ 0.6).

`src/App.jsx`'s `groupAcrossStores` is the same algorithm, kept as the offline fallback for when there's no live API — it was ported to Python and the two were verified to produce identical output on the same data before either was trusted. If you change the matching rules, change both and re-verify (run each against the same snapshot, diff the groups) — they're meant to stay in lockstep, not drift.

The result: it surfaces real matches when they exist and says nothing when they don't, rather than guessing. With the currently configured sites/URLs, genuine overlap is rare (each site is pointed at a different product category) — mostly it fires when two grocery-carrying sites (Othoba, Shwapno, Cartup) happen to stock the same branded item. The dashboard also labels the section "Matched by listing name similarity — double-check before buying" so it's never presented as more certain than it is.

### Offers & banners

Banners are grouped by store and rendered as a horizontally-scrollable strip per marketplace under "Current offers & banners, by store" — each image links out to the actual campaign page on that site. Source is `/api/banners` (live) or `public/banners.json` (static fallback), same pattern as products.

### Price history chart

Click any product row to open a detail panel with a stock-style line chart of its price over time (hand-rolled SVG, no charting library) — real crosshair-and-tooltip on hover, endpoint value label, line colored by net direction (green = price fell or held, red = rose). Needs the live backend: the static export only ever carries the current and previous price, not the full series, so in fallback mode the panel says so plainly instead of drawing a misleading 2-point "chart." With ~1 day of scrape history behind it right now, most products' lines are still flat — that's an honest reflection of the data, not a bug, and fills in as more scrapes accumulate over time. Colors and interaction follow this project's `dataviz` design conventions (2px line, hairline gridlines, no legend needed for a single series).
