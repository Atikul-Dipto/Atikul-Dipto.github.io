# Power BI projects

Both are Power BI Projects (PBIP) rather than `.pbix` binaries, so the data
model, every DAX measure and (in the PaySim project) every visual binding are
plain text and reviewable in this repo.

Neither uses employer data. One is scraped by me from public listings, the other
is a published synthetic dataset.

| Project | Data | What it is about |
|---|---|---|
| [paysim-fraud](paysim-fraud/) | PaySim synthetic mobile-money log (Kaggle), 6.4M rows | Scoring a bank's own fraud rule against the ground truth, and a derived feature that beats its recall by 502× |
| [price-pulse](price-pulse/) | My own Selenium scraper, 6 Bangladesh marketplaces | Assortment and pricing behaviour across retailers, and the pipeline's own data quality |

Each folder has its own README covering the model, the measures, how to build
the data, and — in both cases explicitly — what has been verified and what has
not.
