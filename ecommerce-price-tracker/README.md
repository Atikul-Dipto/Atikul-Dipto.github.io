# Price Pulse

A React dashboard for browsing and comparing public e-commerce prices in Bangladesh, plus a Selenium scraping pipeline that produces the data feed.

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

1. **Raise `--limit`** (default 24) — caps items scraped per URL, e.g. `python run_pipeline.py run --limit 50`.
2. **Add more URLs to a site already in `sites.yaml`** — each entry in that site's `urls:` list gets scraped in full and added to the feed; a site's selectors are usually stable across different search queries/category pages on the same storefront, so this is normally a one-line addition, not new selector work. E.g. Daraz currently scrapes both a `wireless+headphones` and a `rice` search — add another `?q=<term>` line for another category. Worth pointing overlapping-category sites (the grocery-carrying ones: Othoba, Shwapno, Cartup) at the *same* kind of item when you can — that's what gives the cross-platform comparison feature something to actually match on.
3. **Add a new site entirely** — copy the `my_site:` template further down this file into `sites.yaml`, run `python run_pipeline.py inspect my_site` to check what actually matched, and iterate on the selectors from the saved HTML in `data/debug/`. This is the only lever that needs real verification work; see "Configured sites" below for which of the current 8 still need it.

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
| Cartup | ✅ verified, low yield | ✅ | Real selectors confirmed, but the homepage mixes multiple card layouts and its content rotates between loads — point it at a category/search page for reliable results. |
| Packly | ⚠️ unverified | — | No product markup found at all — the URL may need to be a specific catalog page, or this may not be the storefront you meant (packly.com reads as a custom-packaging site). |
| Chaldal | ⚠️ unverified | — | Its homepage isn't a product listing at all; you'll need to point it at a real search/category URL. |

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

No code changes needed — `run_pipeline.py run` picks up new entries automatically.

Use only on sites that permit automated access, and respect terms, robots rules, rate limits, and copyright restrictions.

## Frontend

```bash
npm install
npm run dev
```

The dashboard fetches `public/products.json` and `public/banners.json` on load (and re-fetches every 5 minutes while open) — no backend, no fake sample data. It reflects whatever the pipeline last exported: search by name, filter by store, sort by discount/price/recency, click "Visit" to go straight to the listing on the source site, and star a product to add it to a localStorage-backed watchlist (persists across visits, per browser). Metrics (average discount, lowest price, price drops, stores monitored) are computed live from the loaded data — none of it is hardcoded.

If `public/products.json` doesn't exist yet or is empty, the dashboard shows an empty state with the exact command to run instead of silently showing nothing.

### Cross-platform comparison

There's no shared product ID across 6 unrelated storefronts — "the same product on two sites" can only be inferred from listing-name text, and getting that wrong actively misleads a shopper (a false "it's cheaper elsewhere" is worse than not showing a comparison at all). So the matching in `src/App.jsx` (`groupAcrossStores`) is deliberately conservative, with hard gates rather than one similarity score:

1. Quantity notation is normalized (`"500 gm"` / `"500gm"` → the same token) so real matches aren't missed on formatting alone.
2. **Brand gate**: the first word of a listing title is almost always the brand in these catalogs — two listings must share it, or they never group, no matter how similar the rest of the words look. This is what stops "PRAN Full Cream Milk Powder 1kg" from being shown next to "AMA Full Cream Milk Powder 1kg" as if they were the same product.
3. **Quantity gate**: if both names carry a detected size/weight, it must match too, so a 500g pack and a 1kg pack of the same brand are never shown as directly comparable.
4. Only past both gates does word-overlap get a vote (Jaccard similarity ≥ 0.6).

The result: it surfaces real matches when they exist and says nothing when they don't, rather than guessing. With the currently configured sites/URLs, genuine overlap is rare (each site is pointed at a different product category) — mostly it will fire when two grocery-carrying sites (Othoba, Shwapno, Cartup) happen to stock the same branded item. The dashboard also labels the section "Matched by listing name similarity — double-check before buying" so it's never presented as more certain than it is.

### Offers & banners

`public/banners.json` (from `python run_pipeline.py banners`) is grouped by store and rendered as a horizontally-scrollable strip per marketplace under "Current offers & banners, by store" — each image links out to the actual campaign page on that site.
