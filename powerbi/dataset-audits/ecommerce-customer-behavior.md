# Data audit — E-commerce Customer Behavior - Sheet1.csv

`D:\datasets\ecommerce-behavior-raw\E-commerce Customer Behavior - Sheet1.csv`  
350 rows x 11 columns


## Columns

| Column | Type | Distinct | Nulls | Most common | Read as |
|---|---|---|---|---|---|
| Customer ID | int64 | 350 | 0 | — | identifier |
| Gender | object | 2 | 0 | 50.0% | category |
| Age | int64 | 16 | 0 | — | measure |
| City | object | 6 | 0 | 16.9% | category |
| Membership Type | object | 3 | 0 | 33.4% | category |
| Total Spend | float64 | 76 | 0 | — | measure |
| Items Purchased | int64 | 15 | 0 | — | measure |
| Average Rating | float64 | 20 | 0 | — | measure |
| Discount Applied | bool | 2 | 0 | 50.0% | category |
| Days Since Last Purchase | int64 | 54 | 0 | — | measure |
| Satisfaction Level | object | 3 | 2 | 35.9% | category |

## 1. Row duplication

Exact duplicate rows: **0**

Ignoring `Customer ID`: **170 distinct records** across 350 rows (180 rows repeat another).

How often each distinct record appears:

| Appears | Records |
|---|---|
| 1x | 127 |
| 2x | 10 |
| 3x | 2 |
| 5x | 5 |
| 6x | 2 |
| 7x | 18 |
| 8x | 4 |

## 2. Are any two categories the same variable?

_Scored against the base rate: reported only when knowing one column beats guessing the other's most common value by 1.5x or more._

- **`City` nearly determines `Gender`** — every `City` group is at least 98% a single `Gender`, against a 50% base rate (2.0x).
- **`City` determines `Membership Type`.** Each of the 6 values of `City` maps to exactly one `Membership Type` (base rate 33%).
- **`City` determines `Discount Applied`.** Each of the 6 values of `City` maps to exactly one `Discount Applied` (base rate 50%).

## 3. Does a category fully determine a measure?

- **`Membership Type` pins `Total Spend` exactly.** The groups occupy non-overlapping bands: Bronze 410.8–530.4, Silver 660.3–830.9, Gold 1,120–1,520.

## 4. Is a label really a threshold rule?

_Reported only if the boundary is at least 60% precise, covers at least 30% of the label, and beats the label's base rate by 1.5x._

- **`City` = 'Chicago' is `Age` at or above 41.** 100% of the 58 rows at or above 41 carry that label, against a 17% base rate (6.0x), covering 100% of it.
- **`City` = 'San Francisco' is `Total Spend` at or above 1,360.** 100% of the 58 rows at or above 1,360 carry that label, against a 17% base rate (6.0x), covering 100% of it.
- **`City` = 'Houston' is `Items Purchased` at or below 8.** 100% of the 58 rows at or below 8 carry that label, against a 17% base rate (6.0x), covering 100% of it.
- **`City` = 'San Francisco' is `Items Purchased` at or above 18.** 100% of the 58 rows at or above 18 carry that label, against a 17% base rate (6.0x), covering 100% of it.
- **`Membership Type` = 'Bronze' is `Average Rating` at or below 3.6.** 100% of the 116 rows at or below 3.6 carry that label, against a 33% base rate (3.0x), covering 100% of it.
- **`Membership Type` = 'Gold' is `Items Purchased` at or above 14.** 99% of the 118 rows at or above 14 carry that label, against a 33% base rate (3.0x), covering 100% of it.
- **`Satisfaction Level` = 'Unsatisfied' is `Days Since Last Purchase` at or above 32.** 95% of the 122 rows at or above 32 carry that label, against a 33% base rate (2.9x), covering 100% of it.
- **`Satisfaction Level` = 'Satisfied' is `Total Spend` at or above 820.8.** 91% of the 138 rows at or above 820.8 carry that label, against a 36% base rate (2.5x), covering 100% of it.
- **`Membership Type` = 'Gold' is `Average Rating` at or above 4.3.** 85% of the 137 rows at or above 4.3 carry that label, against a 33% base rate (2.6x), covering 100% of it.
- **`City` = 'Houston' is `Total Spend` at or below 480.5.** 84% of the 69 rows at or below 480.5 carry that label, against a 17% base rate (5.1x), covering 100% of it.
- **`Satisfaction Level` = 'Satisfied' is `Average Rating` at or above 4.2.** 84% of the 149 rows at or above 4.2 carry that label, against a 36% base rate (2.3x), covering 100% of it.
- **`Membership Type` = 'Bronze' is `Items Purchased` at or below 10.** 83% of the 139 rows at or below 10 carry that label, against a 33% base rate (2.5x), covering 100% of it.

...and 6 weaker rules, omitted.

## 5. Are the measures copies of each other?

|                          |    Age |   Total Spend |   Items Purchased |   Average Rating |   Days Since Last Purchase |
|:-------------------------|-------:|--------------:|------------------:|-----------------:|---------------------------:|
| Age                      |  1     |        -0.678 |            -0.685 |           -0.722 |                      0.169 |
| Total Spend              | -0.678 |         1     |             0.972 |            0.941 |                     -0.54  |
| Items Purchased          | -0.685 |         0.972 |             1     |            0.922 |                     -0.42  |
| Average Rating           | -0.722 |         0.941 |             0.922 |            1     |                     -0.431 |
| Days Since Last Purchase |  0.169 |        -0.54  |            -0.42  |           -0.431 |                      1     |

- `Total Spend` and `Items Purchased`: r = 0.972
- `Total Spend` and `Average Rating`: r = 0.941
- `Items Purchased` and `Average Rating`: r = 0.922

## 6. Does each measure vary within a group, or only between groups?

| Measure | Grouped by | Overall spread | Mean within-group | Verdict |
|---|---|---|---|---|
| Age | Gender | 4.871 | 3.869 | varies within |
| Age | City | 4.871 | 1.256 | almost entirely between groups |
| Age | Membership Type | 4.871 | 2.469 | varies within |
| Age | Discount Applied | 4.871 | 4.681 | varies within |
| Age | Satisfaction Level | 4.871 | 3.296 | varies within |
| Total Spend | Gender | 362.1 | 333.6 | varies within |
| Total Spend | City | 362.1 | 22.73 | almost entirely between groups |
| Total Spend | Membership Type | 362.1 | 81.27 | almost entirely between groups |
| Total Spend | Discount Applied | 362.1 | 351.1 | varies within |
| Total Spend | Satisfaction Level | 362.1 | 154.8 | almost entirely between groups |
| Items Purchased | Gender | 4.156 | 3.711 | varies within |
| Items Purchased | City | 4.156 | 0.8251 | almost entirely between groups |
| Items Purchased | Membership Type | 4.156 | 1.569 | almost entirely between groups |
| Items Purchased | Discount Applied | 4.156 | 3.921 | varies within |
| Items Purchased | Satisfaction Level | 4.156 | 2.086 | varies within |
| Average Rating | Gender | 0.5805 | 0.4939 | varies within |
| Average Rating | City | 0.5805 | 0.124 | almost entirely between groups |
| Average Rating | Membership Type | 0.5805 | 0.1796 | almost entirely between groups |
| Average Rating | Discount Applied | 0.5805 | 0.5703 | varies within |
| Average Rating | Satisfaction Level | 0.5805 | 0.3255 | varies within |
| Days Since Last Purchase | Gender | 13.44 | 12.62 | varies within |
| Days Since Last Purchase | City | 13.44 | 4.194 | almost entirely between groups |
| Days Since Last Purchase | Membership Type | 13.44 | 11.29 | varies within |
| Days Since Last Purchase | Discount Applied | 13.44 | 8.278 | varies within |
| Days Since Last Purchase | Satisfaction Level | 13.44 | 6.662 | almost entirely between groups |

## Verdict

9 critical, 11 warnings, 6 notes.

- **Critical**: 180 of 350 rows (51%) repeat an existing record once the identifier is dropped. There are only 170 real records, so every count, sum and share is overstated by about 2.1x.
- **Critical**: `City` fully determines `Membership Type`, so `Membership Type` adds nothing once `City` is known.
- **Critical**: `City` fully determines `Discount Applied`, so `Discount Applied` adds nothing once `City` is known.
- **Critical**: `Total Spend` ranges do not overlap at all across `Membership Type` groups (Bronze 410.8–530.4, Silver 660.3–830.9, Gold 1,120–1,520). Knowing the `Membership Type` tells you the `Total Spend` band with certainty, so "group X has higher Total Spend" is true by construction, not a finding.
- **Critical**: `City` = 'Chicago' is close to a cut on `Age` (at or above 41: 100% precise at 6.0x the base rate, covering 100% of the label). The label is reducible to that cut, so charting one against the other is circular.
- **Critical**: `City` = 'San Francisco' is close to a cut on `Total Spend` (at or above 1,360: 100% precise at 6.0x the base rate, covering 100% of the label). The label is reducible to that cut, so charting one against the other is circular.
- **Critical**: `City` = 'Houston' is close to a cut on `Items Purchased` (at or below 8: 100% precise at 6.0x the base rate, covering 100% of the label). The label is reducible to that cut, so charting one against the other is circular.
- **Critical**: `City` = 'San Francisco' is close to a cut on `Items Purchased` (at or above 18: 100% precise at 6.0x the base rate, covering 100% of the label). The label is reducible to that cut, so charting one against the other is circular.
- **Critical**: `Membership Type` = 'Bronze' is close to a cut on `Average Rating` (at or below 3.6: 100% precise at 3.0x the base rate, covering 100% of the label). The label is reducible to that cut, so charting one against the other is circular.
- **Warning**: `City` and `Gender` are confounded: every `City` group is at least 98% one `Gender`, 2.0x the base rate. Their effects cannot be separated in this data.
- **Warning**: `Membership Type` = 'Gold' is close to a cut on `Items Purchased` (at or above 14: 99% precise at 3.0x the base rate, covering 100% of the label). Not exact, but close enough that the measure largely reproduces the label.
- **Warning**: `Satisfaction Level` = 'Unsatisfied' is close to a cut on `Days Since Last Purchase` (at or above 32: 95% precise at 2.9x the base rate, covering 100% of the label). Not exact, but close enough that the measure largely reproduces the label.
- **Warning**: `Satisfaction Level` = 'Satisfied' is close to a cut on `Total Spend` (at or above 820.8: 91% precise at 2.5x the base rate, covering 100% of the label). Not exact, but close enough that the measure largely reproduces the label.
- **Warning**: `Membership Type` = 'Gold' is close to a cut on `Average Rating` (at or above 4.3: 85% precise at 2.6x the base rate, covering 100% of the label). Not exact, but close enough that the measure largely reproduces the label.
- **Warning**: `City` = 'Houston' is close to a cut on `Total Spend` (at or below 480.5: 84% precise at 5.1x the base rate, covering 100% of the label). Not exact, but close enough that the measure largely reproduces the label.
- **Warning**: `Satisfaction Level` = 'Satisfied' is close to a cut on `Average Rating` (at or above 4.2: 84% precise at 2.3x the base rate, covering 100% of the label). Not exact, but close enough that the measure largely reproduces the label.
- **Warning**: `Membership Type` = 'Bronze' is close to a cut on `Items Purchased` (at or below 10: 83% precise at 2.5x the base rate, covering 100% of the label). Not exact, but close enough that the measure largely reproduces the label.
- **Warning**: `Total Spend` and `Items Purchased` correlate at r = 0.972. They are close to the same measure, so showing both implies two pieces of evidence where there is one.
- **Warning**: `Total Spend` and `Average Rating` correlate at r = 0.941. They are close to the same measure, so showing both implies two pieces of evidence where there is one.
- **Warning**: `Items Purchased` and `Average Rating` correlate at r = 0.922. They are close to the same measure, so showing both implies two pieces of evidence where there is one.
- Note: `Satisfaction Level` has 2 null value(s) (0.6%).
- Note: `Age` barely varies inside a group of `City` (26%) — within-group spread as a share of overall. It is close to a relabelling of those columns.
- Note: `Total Spend` barely varies inside a group of `City` (6%), `Membership Type` (22%), `Satisfaction Level` (43%) — within-group spread as a share of overall. It is close to a relabelling of those columns.
- Note: `Items Purchased` barely varies inside a group of `City` (20%), `Membership Type` (38%) — within-group spread as a share of overall. It is close to a relabelling of those columns.
- Note: `Average Rating` barely varies inside a group of `City` (21%), `Membership Type` (31%) — within-group spread as a share of overall. It is close to a relabelling of those columns.
- Note: `Days Since Last Purchase` barely varies inside a group of `City` (31%), `Satisfaction Level` (50%) — within-group spread as a share of overall. It is close to a relabelling of those columns.

> This dataset has structure that makes ordinary business questions unanswerable: the headline comparisons a dashboard would draw are determined by how the file was built. Either scope the dashboard to what survives the findings above, make the structure itself the subject, or use different data.
