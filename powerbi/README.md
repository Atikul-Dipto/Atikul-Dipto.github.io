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

`check_m.py` lints the M in every TMDL partition: balanced brackets and quotes, no comma before `in` (which Desktop reports with no file and no line number), and every step reference resolving to a binding that exists.

`check_tmdl.ps1` parses every semantic model here with `Microsoft.AnalysisServices.Tabular.TmdlSerializer`, the same parser Power BI Desktop uses to open a `.pbip`. Run it after changing any TMDL: hand-written TMDL fails in ways no JSON schema or static check can see, and both projects were rejected by Desktop before this existed.

[dataset-audits/](dataset-audits/) holds the structural check that runs before
any of this: whether a dataset can support a claim about the world, or whether
every "insight" would just restate how the file was generated. It is the reason
there is no third dashboard built on the E-commerce Customer Behavior set.

## Showing these in the portfolio

Both appear in the **Dashboards** section of the portfolio site, at
`/#dashboards`. Content lives in the `dashboards` export in
[`src/data.js`](../src/data.js); the component is
[`src/components/Dashboards.jsx`](../src/components/Dashboards.jsx).

Each entry has an `embedUrl`. While it is `null`, the section says "Not
published yet" and links to the model and measures here instead -- it does not
render an empty frame implying a live report is one click away.

To go live, once the project opens in Power BI Desktop:

1. **Publish** to **My Workspace**.
2. In the Power BI service: **File -> Embed report -> Publish to web (public)**.
3. Copy the `src` out of the iframe snippet it gives you.
4. Paste it as `embedUrl` for that dashboard in `src/data.js` and push.

Nothing else changes. The iframe, its 16:9 aspect ratio, the accessible title
and the full-screen link are already wired, and both code paths -- with and
without an `embedUrl` -- were verified by rendering the built site in headless
Chrome.

**The obstacle is the account, not the report.** Publish to web needs a work or
school account, and Power BI sign-up rejects consumer Gmail and Outlook
addresses. A university address works if there is one. Otherwise the free
routes are awkward and a paid licence is not worth buying for a portfolio
piece: this repository already shows the data model, all 53 measures across the
two projects and every visual definition in plain text, which for a data role
is arguably better evidence than a picture of a finished chart.
