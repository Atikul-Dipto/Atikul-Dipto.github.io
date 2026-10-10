# PaySim fraud detection — Power BI project

A Power BI Project (PBIP) over the PaySim synthetic mobile-money log: a star
schema, 38 measures, and a four-page report, all in plain text. The semantic
model is TMDL and the report is PBIR, so the data model, every DAX measure and
every visual binding are reviewable in this repo instead of buried in a `.pbix`.

**The data is synthetic.** PaySim is an agent-based simulation of a mobile money
network, published by Lopez-Rojas et al. and distributed on Kaggle as
*Synthetic Financial Datasets For Fraud Detection*. Nothing here is a record of
real transactions, real customers or a real bank, and no employer data is
involved. Every pattern below is the simulator's, which is a limitation and is
treated as one throughout.

## What is in it

| | |
|---|---|
| Transaction legs | 6,362,620 |
| Simulated hours / days | 743 / 31 |
| Transaction types | 5 (PAYMENT, CASH_IN, CASH_OUT, TRANSFER, DEBIT) |
| Fraudulent legs | 8,213 (0.129%) |
| Types fraud appears in | 2 — TRANSFER (0.769%) and CASH_OUT (0.184%) |

## Three findings

### 1. The detection rule already in the data catches 16 of 8,213

The source ships an `isFlaggedFraud` column: the bank's own rule. Scored as a
classifier against the ground-truth label:

| | Bank rule | Proposed rule |
|---|---|---|
| True positives | 16 | 8,034 |
| False positives | **0** | **0** |
| False negatives | 8,197 | 179 |
| Precision | 100% | 100% |
| **Recall** | **0.195%** | **97.8%** |
| Value stopped | 77,785,564 | — |
| Value let through | 11,978,629,864 | — |

The existing rule is perfectly precise and almost perfectly useless: it fires
16 times in 6.4 million transactions. The proposed rule is one derived
boolean — **the amount moved equals the origin account's opening balance to the
cent, on money leaving towards a customer account**. The account is emptied in a
single move.

That holds on 8,034 of 8,213 fraudulent legs and on **1** of 6,354,407
legitimate ones. The single exception is a 63.99 payment to a merchant that left
0.01 behind, and restricting the rule to customer-account destinations excludes
it — draining your account into a merchant is shopping, not theft.

**This is an in-sample result.** The rule was derived from the same labels it is
scored against, so 97.8% is an upper bound, not a forecast. On real data it
would need validating on a held-out period before anyone staffed a queue
against it. The report says so on the page that shows it, and the
`Recall Lift vs Bank Rule` measure carries the caveat in its description.

### 2. The existing rule works — it blocks, and the block is visible in the ledger

All 16 flagged rows are TRANSFERs, all are fraudulent, and in every one the
origin's balance is **unchanged** after the transaction. The money never moved.

Every one of those 16 rows is followed, in the very next row of the source file,
by a fraudulent CASH_OUT **of amount zero**. That is the second leg of the fraud
arriving to collect, finding the account untouched, and taking nothing.

The control case holds too: of the 4,081 fraudulent transfers that were *not*
blocked, 4,075 are followed by a fraudulent cash-out, and **not one of those is
zero**. Blocked transfer, empty cash-out. Unblocked transfer, real cash-out.

So the 16 zero-amount rows are not dirty data to be cleaned away. They are the
fingerprint of a control working, and the `Zero Amount Rows` measure is on the
data-quality page to say exactly that.

This pairing is by adjacent row position in the source file. Row order is not a
stable key in a semantic model, so it is deliberately **not** modelled — it is
established here, in the build, and reported as a finding rather than exposed as
a relationship that would silently break on a re-sort.

### 3. Fraud ignores the clock, so the overnight fraud rate is 422× the daytime rate

Fraudulent volume is near constant hour to hour — between 274 and 375 legs in
every hour of the simulated day. Legitimate volume is not: the busiest hour
carries 647,814 transactions and the quietest carries 1,241, a factor of 522.

Constant numerator, collapsing denominator. The fraud *rate* therefore runs from
0.053% in the busiest hour to **22.3%** in the quietest — better than one in
five. Nothing about fraud changed overnight; the traffic it hides in went away.

The operational reading is about staffing a review queue by hour, not about
blocking night-time transfers.

## Model

```
DimTransactionType ─┐
DimStep            ─┼─< FactTransaction
DimAmountBand      ─┤
DimDetectionOutcome ┘
```

Four single-direction one-to-many relationships, each from a dimension key to
the matching fact key. No bidirectional filtering, and no second path between
any pair of tables, so there is nothing ambiguous for the engine to resolve.

**No date table, and no dates.** The source has an hour counter (`step`, 1–743)
and no calendar anchor of any kind. Rather than manufacture dates to unlock time
intelligence nobody needs over 31 synthetic days, `DimStep` exposes `SimDay`
(1–31) and `SimHour` (0–23). `SimHour` is an hour *within the simulated day* —
PaySim documents no clock alignment, so it is not a wall-clock time and is never
labelled as one.

**The account identifiers are dropped.** `nameOrig` holds 6,353,307 distinct
values across 6,362,620 rows: it is very nearly a row id. `nameDest` holds
2,722,362, and the obvious mule-account hypothesis does not survive it — of the
8,169 accounts that receive fraud, **8,125 receive exactly one** fraudulent
transaction. There is no concentration to chart. Keeping either column would
have added millions of distinct strings to the model to answer nothing. The only
part of `nameDest` that carries meaning is merchant-versus-customer, and the
transaction type already implies it: all 2,151,495 PAYMENT rows go to a merchant
and nothing else ever does.

Four derived flags do the analytical work: `IsFullAccountDrain` (finding 1),
`LedgerReconciles` and `DestBalanceAbsent` (data quality), and `OutcomeKey`
(the confusion matrix). Each is computed in `build_dataset.py` with the
reasoning in a comment beside it.

### Measures

38, in six folders.

- **Volume** — `Transactions`, `Transaction Value`, `Average Transaction`, `Median Transaction`, `Days Observed`, `Hours Observed`
- **Fraud** — `Fraud Legs`, `Fraud Rate %`, `Fraud Events`, `Fraud Exposure`, `Fraud Leg Value`, `Leg Double Count %`
- **Bank rule** — `Alerts Raised`, `Fraud Caught`, `Fraud Missed`, `False Alarms`, `Bank Rule Recall %`, `Bank Rule Precision %`, `Value Caught`, `Value Missed`
- **Drain rule** — `Drain Rule Alerts`, `Drain Rule Caught`, `Drain Rule False Alarms`, `Drain Rule Recall %`, `Drain Rule Precision %`, `Recall Lift vs Bank Rule`, `Alerts per Day`, `Exposure Detected`, `Exposure Detected %`
- **Risk concentration** — `Peak Hourly Fraud Rate %`, `Lowest Hourly Fraud Rate %`, `Hourly Fraud Rate Spread`, `Quiet Hours Fraud Rate %`, `Active Hours Fraud Rate %`
- **Data quality** — `Ledger Reconciliation %`, `Destination Balance Absent %`, `Zero Amount Rows`, `Full Volume Day Share %`

Two are worth singling out.

**`Fraud Exposure` counts the money once.** Each fraud is committed as two legs:
a TRANSFER out of the victim and a CASH_OUT of the same amount. `SUM(Amount)`
over fraudulent rows gives 12,056,415,428, of which **49.7% is the same money
counted twice**. `Fraud Exposure` sums the transfer leg only and returns
6,067,213,184. `Fraud Leg Value` and `Leg Double Count %` sit next to it on the
report so the trap is visible rather than merely avoided.

**Every measure uses `KEEPFILTERS`.** A bare `CALCULATE([X], Table[Col] = "Y")`
*replaces* the filter on that column, so a measure can quietly contradict the
slicer the reader just clicked. With `KEEPFILTERS` the filters intersect:
`Fraud Events` returns blank in a CASH_OUT context rather than a TRANSFER
number, which is the honest answer.

## Running it

Two steps, because the source data is a 186 MB download that does not belong in
a git repository.

```bash
# 1. Get the data. Kaggle -> "Synthetic Financial Datasets For Fraud Detection"
#    -> archive.zip -> unzip anywhere outside this repo.

# 2. Build the star schema (needs pandas; takes ~2 minutes)
cd powerbi/paysim-fraud
python build_dataset.py "D:/datasets/paysim-raw/PS_20174392719_1491204439457_log.csv"
```

Then open `PaysimFraud.pbip` in Power BI Desktop and refresh. The fact table is
367 MB of CSV, so the first import takes a few minutes; it is not stuck.

The four dimension CSVs are committed — they are a few kilobytes and make the
dimensional design reviewable without downloading anything. `FactTransaction.csv`
is not, and is rebuilt by the script.

If you move the repo, the CSV location is one line in
`PaysimFraud.SemanticModel/definition/expressions.tmdl` (the `DataFolder`
expression). That is the only place in the model that knows where the data is.

### The scripts

| Script | What it does |
|---|---|
| `build_dataset.py` | Kaggle CSV → five star-schema CSVs in `data/` |
| `_gen_model.py` | Regenerates the TMDL semantic model (tables, 38 measures, relationships) |
| `_gen_report.py` | Regenerates the PBIR report (4 pages, 40 visuals) |
| `_check_model.py` | 696 static checks: DAX references resolve, partitions match CSV headers, visuals bind to fields that exist, visuals fit the page and do not overlap |
| `_validate_schemas.py` | Validates all 49 JSON files against Microsoft's published Fabric schemas (`pip install jsonschema`) |

The model and report are generated rather than hand-written so that the
measures all live in one reviewable file instead of scattered across TMDL, and
so a layout change is an edit to arithmetic rather than to 40 JSON files.
Hand-editing the generated output is fine; re-running the generator overwrites
it.

## Report pages

1. **Scale and shape** — volume and fraud rate by type, the hourly rate curve,
   the fraud rate gradient across amount bands.
2. **Detection** — the confusion matrix for the existing rule, both rules side
   by side, and the derivation of the proposed one including its in-sample
   caveat.
3. **Fraud anatomy** — the two-leg structure and the double-count it causes,
   fraud by type and size, and flat fraud volume against collapsing legitimate
   volume on a combo chart.
4. **Data quality** — ledger reconciliation by type, the simulator's uneven duty
   cycle, and the four limits spelled out below. This page is the point, not an
   apology.

## What this data cannot tell you

1. **It is synthetic.** Any pattern here may be an artefact of the simulator
   rather than a fact about fraud.

2. **The ledger does not reconcile.** Reading the balance equation in the
   direction each transaction type implies — `CASH_IN` credits the origin,
   everything else debits it — it holds on **40.6%** of rows: 92.8% of
   `CASH_IN` but 4.5% of `TRANSFER`. Balances cannot be audited, which is why
   this model reads flags rather than recomputing from balances.

3. **Destination balances are structurally absent, not missing at random.** All
   2,151,495 PAYMENT rows report the destination holding zero before and after:
   merchant balances simply are not recorded. Destination-side analysis has to
   exclude PAYMENT rather than read those zeroes as real.

4. **Legitimate volume is uneven; fraud injection is not.** 14 of the 31
   simulated days carry a full load (349,478–573,984 legitimate transactions);
   the other 17 carry between 0 and 57,613. Fraud arrives at a near constant
   216–320 per day throughout, and simulated day 31 is 272 transactions of which
   **all 272 are fraud**. An unqualified fraud-rate-by-day chart therefore
   measures the simulator's duty cycle, not risk. `DimStep[IsFullVolumeDay]`
   marks the 14 comparable days and `Full Volume Day Share %` reports the
   coverage.

## Publishing

This dataset is public and synthetic, so unlike an employer dashboard it is
genuinely safe to publish — Publish to web exposes the whole underlying model
to anyone with the link, not just the visuals, and that is fine here.

Publish to web is free from **My Workspace**, needs a work or school account
(consumer Gmail and Outlook addresses are rejected at sign-up), and the tenant
admin must enable it. Import mode only, which this model is.

## Honesty note

**Verified, by `build_dataset.py`, `_check_model.py`, `_validate_schemas.py` and
a separate round-trip script:** row count, amount total, per-type counts, fraud
count and flagged count all survive the export unchanged; referential integrity
is clean across all four keys with zero orphans; every dimension key is unique;
the fact has no nulls; every amount falls inside its declared band; both rules'
confusion matrices recompute from the exported fact alone; no CSV carries a BOM;
696 static checks on the model and report pass; and all 49 JSON files validate
against Microsoft's published Fabric schemas. Both validators were tested by
injecting faults and confirming they fail.

**Not verified: this project has never been opened in Power BI Desktop.** There
is no Desktop install on the machine it was written on. The TMDL and PBIR were
written against the documented formats and checked as far as static analysis
reaches, but two classes of error survive that: a `visualType` or data-role name
that Power BI does not recognise (the schema leaves both open strings), and
anything about DAX evaluation or refresh behaviour. Expect to fix small things
on first open.

If the project will not open at all, the CSVs are the real deliverable: load the
five files, create the four relationships above, and paste the measures from
`PaysimFraud.SemanticModel/definition/tables/FactTransaction.tmdl`.
