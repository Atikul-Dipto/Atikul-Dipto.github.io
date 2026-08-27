# Price Pulse

A React dashboard for browsing and comparing public e-commerce prices in Bangladesh, plus a Selenium scraping pipeline that produces the data feed.

## Scraping pipeline

`run_pipeline.py` scrapes every site configured in [`sites.yaml`](sites.yaml), stores every observation in a SQLite history database, and exports the latest snapshot to JSON — straight into `public/products.json`, which is what the frontend actually loads at runtime.

Requirements: Python 3.10+, Google Chrome, and a matching Selenium-managed ChromeDriver.

```bash
pip install -r requirements.txt

# Scrape every configured site once
python run_pipeline.py run

# Scrape a subset
python run_pipeline.py run --only daraz,startech,othoba

# Run forever, re-scraping every 15 minutes (matches the dashboard's "syncing every 15 min")
python run_pipeline.py loop --interval-minutes 15
```

Add `--headed` to watch Chrome while tuning selectors, and `--log-level DEBUG` for more detail.

### Output

- `data/pricetracker.db` — SQLite history: every price observation ever recorded, per product per site (`products` + `price_history` tables). This is what lets the dashboard show a "was ৳X" price-drop indicator instead of just a snapshot. Gitignored — regenerated, not source.
- `public/products.json` — the latest known price per product, plus the price recorded just before it (`previous_price`). **This one is committed**, not gitignored: it's a static site with no backend, so this file has to physically exist in the deployed build for the dashboard to have anything to show. Re-run the pipeline and commit the refreshed file whenever you want the live site to reflect newer prices.

### Configured sites

| Site | Status | Notes |
|---|---|---|
| Daraz | ✅ verified | Card container has a stable `data-qa-locator`, but title/price use hashed CSS-module classes that drift on redeploy — see `sites.yaml` notes. |
| Othoba | ✅ verified | Selectors confirmed against real server-rendered HTML. |
| Shwapno | ✅ verified | Selectors confirmed against real class names (Tailwind, hydrated client-side). |
| Star Tech | ✅ verified | Selectors confirmed against real rendered search results. |
| Bikroy | ✅ verified | Classifieds site — one price per ad, no discount field. |
| Cartup | ✅ verified, low yield | Real selectors confirmed, but the homepage mixes multiple card layouts and its content rotates between loads — point it at a category/search page for reliable results. |
| Packly | ⚠️ unverified | No product markup found at all — the URL may need to be a specific catalog page, or this may not be the storefront you meant (packly.com reads as a custom-packaging site). |
| Chaldal | ⚠️ unverified | Its homepage isn't a product listing at all; you'll need to point it at a real search/category URL. |

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

The dashboard fetches `public/products.json` on load — no backend, no fake sample data. It reflects whatever the pipeline last exported: search by name, filter by store, sort by discount/price/recency, click "Visit" to go straight to the listing on the source site, and star a product to add it to a localStorage-backed watchlist (persists across visits, per browser). Metrics (average discount, lowest price, price drops, stores monitored) are computed live from the loaded data — none of it is hardcoded.

If `public/products.json` doesn't exist yet or is empty, the dashboard shows an empty state with the exact command to run instead of silently showing nothing.
