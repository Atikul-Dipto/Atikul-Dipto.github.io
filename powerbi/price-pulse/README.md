# Price Pulse — Power BI model

A Power BI Project (PBIP) over the price data collected by the
[Price Pulse scraper](../../ecommerce-price-tracker). The semantic model is
plain-text TMDL, so the model and every measure are reviewable in this repo
rather than buried in a binary `.pbix`.

The data is my own: a Selenium pipeline I wrote scrapes public product listings
from six Bangladesh marketplaces into SQLite. Nothing here comes from an
employer.

## What this data can and cannot show

Worth stating plainly, because it shaped the design:

| | |
|---|---|
| Observations | 2,211 |
| Products | 777 |
| Retailers | 6 (Daraz, Shwapno, Othoba, Star Tech, Pickaboo, Cartup) |
| **Distinct scrape days** | **2** (2026-08-27 → 08-28) |
| Products listed by more than one retailer | 2 of 750 distinct names |

Two consequences:

- **No trend analysis.** Two days is not a price history. There is a
  `Days With Data` measure precisely so a report page can show its own
  limitation instead of drawing a two-point line and calling it a trend. Run
  the scraper daily for a few weeks, rebuild, and the time dimension becomes
  worth using.
- **No same-product price comparison.** The retailers barely overlap — Shwapno
  is groceries, Pickaboo is laptops, Daraz is a general marketplace. Comparing
  "the same product across retailers" is not possible here, so the model
  compares *assortments and pricing behaviour* instead.

## A finding worth keeping

`Suspect Price Rate %` exists because the data has a real defect, and the
dashboard reports it rather than hiding it.

Pickaboo prices arrive as **two numbers concatenated**: `194500195000` is
194,500 and 195,000 — the sale price and the was-price glued together by the
scraper's selector. It affects **17 of Pickaboo's 154 observations (11%)** and
essentially nothing elsewhere. The pipeline is mine, so this is a bug to fix
upstream; until then the rows are flagged, excluded from price statistics, and
counted on the data-quality page with a `SuspectReason`.

That is the honest version of a dashboard built on a pipeline you own: it
measures its own input quality.

## Model

A star schema. `build_dataset.py` reads the scraper's SQLite database and
writes four CSVs into `data/`.

```
DimRetailer ─┐
DimProduct  ─┼─< FactPriceObservation
DimDate     ─┘
```

`DimProduct` also carries `RetailerKey`, but it is deliberately **not** related
to `DimRetailer` — a second path from the fact to the retailer would make the
filter direction ambiguous. It is kept as a plain attribute.

`DimProduct[Category]` is derived from keywords in the product name. It is
conservative: anything unmatched stays `Unclassified`, currently **30%** of the
catalogue, and `Unclassified Product Share %` reports that rather than implying
the classification is complete.

### Measures

Volume: `Observations`, `Products Tracked`, `Retailers Covered`, `Days With Data`

Pricing: `Median Price`, `Average Price`, `P90 Price`, `Current Median Price`
(most recent observation per product — `IsLatest` guarantees exactly one row
per product, tie-broken on observation id)

Discounting: `Discount Coverage %`, `Average Discount Depth %`,
`Deep Discount Share %`

Data quality: `Suspect Observations`, `Suspect Price Rate %`,
`Original Price Coverage %`, `Unclassified Product Share %`

Suspect rows carry a blank `CurrentPrice`, so every price aggregation excludes
them automatically — no filter to remember and no way to forget it.

## Running it

```bash
cd powerbi/price-pulse
python build_dataset.py        # SQLite -> data/*.csv
```

Then open `PricePulse.pbip` in Power BI Desktop and refresh.

The CSV location is a single line in
`PricePulse.SemanticModel/definition/expressions.tmdl` (the `DataFolder`
expression). Change it if you move the repo.

**If the project does not open** — see the honesty note below — the fallback
costs about ten minutes: new file, Get Data → Text/CSV, load all four CSVs from
`data/`, create the three relationships above, and paste the measures from
`PricePulse.SemanticModel/definition/tables/FactPriceObservation.tmdl`. The
CSVs are the real deliverable; the PBIP is a convenience.

`_gen_tmdl.py` regenerates the TMDL table files if you change the model shape.

## Suggested pages

1. **Market overview** — products and observations per retailer, median price by
   retailer, price distribution, category mix.
2. **Discounting** — discount coverage and depth by retailer and category, deep
   discount share, discount depth histogram.
3. **Data quality** — `Suspect Price Rate %` by retailer, suspect reasons,
   original-price coverage, unclassified share, `Days With Data`. This page is
   the point, not an apology.

## Publishing

Publish to web is free from **My Workspace**, needs a work or school account
(consumer Gmail and Outlook addresses are rejected at sign-up), and the tenant
admin must enable it. Import mode only — Publish to web does not support
DirectQuery or row-level security, which is why this model imports CSVs.

Anyone with the link can read the entire underlying model, not just the
visuals. That is fine here because this data is public listings I scraped
myself. It would not be fine for employer data.

## Honesty note

The CSV export is verified: referential integrity across all three keys is
clean, `IsLatest` resolves to exactly one row per product, and the UTF-8
round-trip preserves Bangla product names. The three JSON scaffolding files
validate against Microsoft's published Fabric schemas.

The **TMDL has not been opened in Power BI Desktop** — it was written by hand
against the documented format, and there is no Desktop install here to test it.
Expect to fix small things on first open; the fallback above is the backstop.
