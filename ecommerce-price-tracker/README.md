# Price Pulse

A React dashboard for monitoring public e-commerce prices in Bangladesh, plus a Selenium scraping pipeline that produces the data feed.

## Scraping pipeline

`run_pipeline.py` scrapes every site configured in [`sites.yaml`](sites.yaml), stores every observation in a SQLite history database, and exports the latest snapshot to JSON.

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

- `data/pricetracker.db` — SQLite history: every price observation ever recorded, per product per site (`products` + `price_history` tables). This is what lets the dashboard show price movement over time instead of just a snapshot.
- `data/products.json` — the latest known price per product, plus the price recorded just before it (`previous_price`), regenerated on every run.

Both are gitignored since they're regenerated output, not source.

### Configured sites

| Site | Status | Notes |
|---|---|---|
| Daraz | ✅ verified | Carried over from the project's original scraper; known-good selectors. |
| Othoba | ✅ verified | Selectors confirmed against real server-rendered HTML. |
| Shwapno | ✅ verified | Selectors confirmed against real class names (Tailwind, hydrated client-side). |
| Star Tech | ✅ verified | Selectors confirmed against real rendered search results. |
| Bikroy | ✅ verified | Classifieds site — one price per ad, no discount field. |
| Cartup | ⚠️ unverified | Next.js app; product grid only exists after client-side hydration, so selectors are best-effort guesses. |
| Packly | ⚠️ unverified | Same situation as Cartup. Also worth double-checking this is the storefront you meant — packly.com reads as a custom-packaging site, not a general retailer. |
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

The dashboard currently uses sample records in `src/App.jsx`. The next integration step is having it fetch `data/products.json` (or serve it from a small backend) instead of the hardcoded sample array.
