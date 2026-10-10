# Dataset audits

Run this before building a dashboard on an unfamiliar dataset.

```bash
pip install pandas tabulate
python audit_dataset.py "path/to/data.csv" > findings.md
```

It answers one question: **can this data support a claim about the world, or
would every "insight" just restate how the file was generated?**

That question matters most for public practice datasets. A lot of them are
generated rather than collected, and a generated file often encodes its answers
in its own structure — so a chart showing "premium members spend more" is
reporting the generator's rule, not a fact about customers. Shipping that in a
portfolio is worse than shipping nothing, because anyone who knows the dataset
recognises the tautology.

## What it checks

| | Check | Why it sinks a dashboard |
|---|---|---|
| 1 | Row duplication | N rows but far fewer real records; every count and sum is inflated |
| 2 | Functional dependence | Two columns are one variable wearing two names, so neither can explain anything the other does not |
| 3 | Disjoint group ranges | A category fully determines a measure, so "group X is higher" is true by construction |
| 4 | One-sided boundaries | A label is a cut on a measure, not an independent outcome — charting them together is circular |
| 5 | Extreme correlation | Two measures are copies, so showing both implies two pieces of evidence where there is one |
| 6 | Between-group variance | A measure carries no information inside a group |
| 7 | Degenerate columns | Constant, near-constant, or all-unique |

Every test that asks "does knowing A tell me about B" is scored against the
base rate — how well you would do knowing nothing — and reported only when it
clears that bar by a margin.

That correction exists because the first version did not have it, and reported
21 confounded column pairs on a dataset that was structurally fine. The cause
was a rare label: when a flag is true on 0.13% of rows, *every* way of grouping
it is about 100% one value, and a naive concentration test reads that as
perfect confounding. It is not — it is rarity.

The tool is now checked against both ends: a dataset known to be broken and one
known to be sound, confirming it separates them rather than complaining about
everything. On the PaySim fact table it returns zero critical findings and six
warnings, all of them real — the strongest being that `DestBalanceAbsent` is by
definition `NewBalanceDest <= 0`, which is exactly the kind of near-circularity
worth knowing about before you chart it.

## Limits

A clean report is not a guarantee. The checks are structural and univariate:
they catch a category that determines a measure, not a pair of columns that
jointly do. Nothing here tests whether the data is *true*, whether it is a
representative sample, or whether it was collected the way its description
claims. And a flagged dataset is not automatically unusable — real data is
confounded for real reasons. The output is evidence for a judgement, not the
judgement.

## Audits run so far

| Dataset | Verdict | Report |
|---|---|---|
| E-commerce Customer Behavior (Kaggle, 350 rows) | **Not usable for business questions** — 9 critical | [ecommerce-customer-behavior.md](ecommerce-customer-behavior.md) |

### E-commerce Customer Behavior, in short

Considered for a second dashboard and rejected. The file is a generator
artifact:

- **City and membership tier are the same variable.** Each city maps to exactly
  one tier with zero crossover, and city also fully determines whether a
  discount was applied.
- **Spend is pinned by tier.** Bronze 410–530, Silver 660–831, Gold 1,120–1,520,
  with no overlap at all.
- **Satisfaction is a threshold, not an outcome.** No "Unsatisfied" row has
  recency under 32 days; no "Satisfied" row has a rating under 4.2.
- **Only 170 real records in 350 rows** — 51% of rows repeat another once the
  customer ID is dropped, so every count is roughly doubled.
- **Gender is confounded with city**, every city being at least 98% one gender.

So "Gold members spend 2.8x Bronze", "New York is the best city" and "women
spend more" are all restatements of the file's construction. Only `Age` and
`Days Since Last Purchase` vary meaningfully within a tier, which is not enough
to build on.
