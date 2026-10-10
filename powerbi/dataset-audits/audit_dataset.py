"""
Audit a flat CSV before building a dashboard on it.

    python audit_dataset.py "path/to/data.csv" > findings.md

Writes a Markdown report to stdout. The point is to answer one question before
any modelling effort goes in: can this data support a claim about the world, or
would every "insight" just restate how the file was generated?

The checks are the pathologies that actually sink a portfolio dashboard, in
rough order of how badly they mislead:

1. Row duplication        -- inflated counts; N rows but far fewer real records
2. Functional dependence  -- two columns are one variable wearing two names
3. Disjoint group ranges  -- a category fully determines a measure
4. One-sided boundaries   -- a label is a threshold rule, not an observation
5. Extreme correlation    -- measures are copies of each other
6. Between-group variance -- a measure carries no information within a group
7. Degenerate columns     -- constant, near-constant, or all-unique

None of these is automatically fatal. Real data has some of them, for real
reasons. What matters is knowing which ones are present before you draw a chart
that implies a causal story the data cannot carry.

A note on why the base-rate corrections below exist. The first version of this
script reported 21 "confounded" column pairs on a dataset that was structurally
fine. The cause was a rare label: when a flag is true on 0.13% of rows, *every*
way of grouping it is ~100% one value, and a naive concentration test reads
that as perfect confounding. It is not -- it is rarity. So every test here that
asks "does knowing A tell me about B" is scored against how well you would do
knowing nothing at all, and is only reported when it clears that bar.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

# A column with more distinct values than this is not treated as a category.
MAX_CATEGORY_CARDINALITY = 25
# A numeric column needs at least this many distinct values to be worth testing.
MIN_NUMERIC_DISTINCT = 6
# A category whose single most common value covers at least this share of rows
# is near-constant: nothing can meaningfully "explain" it, because guessing the
# majority already wins. Excluded from being a prediction target.
NEAR_CONSTANT = 0.95
# Report a near-functional dependency at or above this within-group
# concentration -- but only when it also beats the base rate by LIFT_MIN.
NEAR_FUNCTIONAL = 0.95
# How many times better than knowing nothing a rule must be to count as
# telling you something.
LIFT_MIN = 1.5
# A threshold rule must be at least this precise past its boundary, and cover
# at least this much of the label, to be worth reporting.
BOUNDARY_MIN_PRECISION = 0.60
BOUNDARY_MIN_COVERAGE = 0.30
# Report a correlation pair at or above this absolute value.
HIGH_CORRELATION = 0.90
# Below this ratio of within-group to overall spread, a measure is essentially
# a restatement of the group it sits in.
LOW_WITHIN_GROUP_RATIO = 0.5
# Cap on how many threshold rules to print before truncating.
MAX_RULES = 12

findings: list[tuple[str, str]] = []


def finding(severity: str, text: str) -> None:
    findings.append((severity, text))


def modal_share(s: pd.Series) -> float:
    """Share of rows taking the column's single most common value."""
    s = s.dropna()
    if s.empty:
        return 1.0
    return float(s.value_counts(normalize=True).iloc[0])


def classify_columns(df: pd.DataFrame) -> tuple[list[str], list[str], list[str]]:
    cats, nums, ids = [], [], []
    for c in df.columns:
        s = df[c]
        n = s.nunique(dropna=True)
        if n <= 1:
            continue
        is_num = pd.api.types.is_numeric_dtype(s) and not pd.api.types.is_bool_dtype(s)
        # An all-distinct integer column is an identifier, not a measure.
        if is_num and n == len(s) and pd.api.types.is_integer_dtype(s):
            ids.append(c)
        elif is_num and n >= MIN_NUMERIC_DISTINCT:
            nums.append(c)
        elif n <= MAX_CATEGORY_CARDINALITY:
            cats.append(c)
    return cats, nums, ids


def h(title: str) -> None:
    print(f"\n## {title}\n")


def main() -> None:
    if len(sys.argv) < 2:
        sys.exit("usage: python audit_dataset.py <csv path>")
    src = Path(sys.argv[1])
    df = pd.read_csv(src)

    print(f"# Data audit — {src.name}\n")
    print(f"`{src}`  \n{len(df):,} rows x {len(df.columns)} columns\n")

    cats, nums, ids = classify_columns(df)
    near_constant = {c for c in cats if modal_share(df[c]) >= NEAR_CONSTANT}
    targets = [c for c in cats if c not in near_constant]

    # ---- columns -------------------------------------------------------
    h("Columns")
    print("| Column | Type | Distinct | Nulls | Most common | Read as |")
    print("|---|---|---|---|---|---|")
    for c in df.columns:
        n = df[c].nunique(dropna=True)
        nulls = int(df[c].isna().sum())
        role = ("identifier" if c in ids else "measure" if c in nums
                else "near-constant category" if c in near_constant
                else "category" if c in cats else "degenerate")
        share = f"{modal_share(df[c]):.1%}" if c in cats else "—"
        print(f"| {c} | {df[c].dtype} | {n:,} | {nulls:,} | {share} | {role} |")

    for c in df.columns:
        if df[c].nunique(dropna=True) <= 1:
            finding("warn", f"`{c}` holds a single value and carries no information.")
        nulls = int(df[c].isna().sum())
        if nulls:
            finding("note", f"`{c}` has {nulls:,} null value(s) "
                            f"({nulls / len(df):.1%}).")
    for c in sorted(near_constant):
        finding("note",
                f"`{c}` is {modal_share(df[c]):.1%} a single value. Comparisons "
                f"across it rest on a handful of rows, and nothing can "
                f"meaningfully explain it.")

    # ---- 1. duplication ------------------------------------------------
    h("1. Row duplication")
    print(f"Exact duplicate rows: **{int(df.duplicated().sum()):,}**")
    if ids:
        core = df.drop(columns=ids)
        dupes = int(core.duplicated().sum())
        distinct = len(core.drop_duplicates())
        print(f"\nIgnoring {', '.join(f'`{i}`' for i in ids)}: "
              f"**{distinct:,} distinct records** across {len(df):,} rows "
              f"({dupes:,} rows repeat another).")
        if dupes:
            spread = core.value_counts().value_counts().sort_index()
            print("\nHow often each distinct record appears:\n")
            print("| Appears | Records |")
            print("|---|---|")
            for times, how_many in spread.items():
                print(f"| {times}x | {how_many:,} |")
            rate = dupes / len(df)
            finding("critical" if rate > 0.25 else "warn",
                    f"{dupes:,} of {len(df):,} rows ({rate:.0%}) repeat an "
                    f"existing record once the identifier is dropped. There are "
                    f"only {distinct:,} real records, so every count, sum and "
                    f"share is overstated by about {len(df) / distinct:.1f}x.")
    else:
        print("\nNo identifier column detected, so no identity-stripped comparison.")

    # ---- 2. functional dependence between categories -------------------
    h("2. Are any two categories the same variable?")
    print("_Scored against the base rate: reported only when knowing one column "
          f"beats guessing the other's most common value by {LIFT_MIN}x or more._\n")
    printed = False
    for i, a in enumerate(cats):
        for b in cats[i + 1:]:
            sub = df[[a, b]].dropna()
            if sub.empty or sub[a].nunique() < 2 or sub[b].nunique() < 2:
                continue
            a_to_b = sub.groupby(a)[b].nunique()
            b_to_a = sub.groupby(b)[a].nunique()
            if (a_to_b == 1).all() and (b_to_a == 1).all():
                printed = True
                print(f"- **`{a}` and `{b}` are one variable.** Every value of "
                      f"each maps to exactly one value of the other.")
                finding("critical",
                        f"`{a}` and `{b}` are perfectly interchangeable. Any "
                        f"chart splitting by one is the same chart split by the "
                        f"other, so neither can be shown to explain an outcome "
                        f"the other does not.")
                continue
            for src_c, dst_c, mapping in ((a, b, a_to_b), (b, a, b_to_a)):
                if dst_c in near_constant:
                    continue  # nothing to explain; see the near-constant note
                base = modal_share(sub[dst_c])
                if (mapping == 1).all():
                    printed = True
                    print(f"- **`{src_c}` determines `{dst_c}`.** Each of the "
                          f"{sub[src_c].nunique()} values of `{src_c}` maps to "
                          f"exactly one `{dst_c}` (base rate {base:.0%}).")
                    finding("critical",
                            f"`{src_c}` fully determines `{dst_c}`, so `{dst_c}` "
                            f"adds nothing once `{src_c}` is known.")
                    continue
                conc = sub.groupby(src_c)[dst_c].agg(modal_share)
                weakest = float(conc.min())
                if weakest >= NEAR_FUNCTIONAL and weakest / base >= LIFT_MIN:
                    printed = True
                    print(f"- **`{src_c}` nearly determines `{dst_c}`** — every "
                          f"`{src_c}` group is at least {weakest:.0%} a single "
                          f"`{dst_c}`, against a {base:.0%} base rate "
                          f"({weakest / base:.1f}x).")
                    finding("warn",
                            f"`{src_c}` and `{dst_c}` are confounded: every "
                            f"`{src_c}` group is at least {weakest:.0%} one "
                            f"`{dst_c}`, {weakest / base:.1f}x the base rate. "
                            f"Their effects cannot be separated in this data.")
    if not printed:
        print("None found — the categories vary independently of each other.")

    # ---- 3. disjoint ranges --------------------------------------------
    h("3. Does a category fully determine a measure?")
    printed = False
    fully_determined: set[tuple[str, str]] = set()
    for cat in cats:
        for num in nums:
            sub = df[[cat, num]].dropna()
            if sub[cat].nunique() < 2:
                continue
            rng = sub.groupby(cat)[num].agg(["min", "max"]).sort_values("min")
            lows, highs = rng["min"].to_numpy(), rng["max"].to_numpy()
            if len(lows) > 1 and bool(np.all(highs[:-1] < lows[1:])):
                printed = True
                fully_determined.add((cat, num))
                bands = ", ".join(f"{g} {lo:,.4g}–{hi:,.4g}"
                                  for g, lo, hi in zip(rng.index, lows, highs))
                print(f"- **`{cat}` pins `{num}` exactly.** The groups occupy "
                      f"non-overlapping bands: {bands}.")
                finding("critical",
                        f"`{num}` ranges do not overlap at all across `{cat}` "
                        f"groups ({bands}). Knowing the `{cat}` tells you the "
                        f"`{num}` band with certainty, so \"group X has higher "
                        f"{num}\" is true by construction, not a finding.")
    if not printed:
        print("None found — every measure overlaps across category groups.")

    # ---- 4. one-sided label boundaries ---------------------------------
    h("4. Is a label really a threshold rule?")
    print(f"_Reported only if the boundary is at least "
          f"{BOUNDARY_MIN_PRECISION:.0%} precise, covers at least "
          f"{BOUNDARY_MIN_COVERAGE:.0%} of the label, and beats the label's base "
          f"rate by {LIFT_MIN}x._\n")
    rules: list[tuple[float, str, str, int]] = []
    for cat in targets:
        for num in nums:
            if (cat, num) in fully_determined:
                continue  # section 3 already said this, more strongly
            sub = df[[cat, num]].dropna()
            if sub[cat].nunique() < 2:
                continue
            for label, grp in sub.groupby(cat):
                base = len(grp) / len(sub)
                if base >= 0.5:
                    continue  # the majority class needs no rule to predict it
                for direction, bound in (("at or above", grp[num].min()),
                                         ("at or below", grp[num].max())):
                    past = (sub[sub[num] >= bound] if direction == "at or above"
                            else sub[sub[num] <= bound])
                    if past.empty or len(past) == len(sub):
                        continue  # a boundary that excludes nothing says nothing
                    hits = int((past[cat] == label).sum())
                    precision = hits / len(past)
                    coverage = hits / len(grp)
                    if (precision >= BOUNDARY_MIN_PRECISION
                            and coverage >= BOUNDARY_MIN_COVERAGE
                            and precision / base >= LIFT_MIN):
                        rules.append((
                            precision,
                            f"- **`{cat}` = {label!r} is `{num}` {direction} "
                            f"{bound:,.4g}.** {precision:.0%} of the "
                            f"{len(past):,} rows {direction} {bound:,.4g} carry "
                            f"that label, against a {base:.0%} base rate "
                            f"({precision / base:.1f}x), covering {coverage:.0%} "
                            f"of it.",
                            f"`{cat}` = {label!r} is close to a cut on `{num}` "
                            f"({direction} {bound:,.4g}: {precision:.0%} precise "
                            f"at {precision / base:.1f}x the base rate, covering "
                            f"{coverage:.0%} of the label)",
                            len(past) - hits,
                        ))

    rules.sort(key=lambda r: -r[0])
    for _precision, line, summary, exceptions in rules[:MAX_RULES]:
        print(line)
        if exceptions == 0:
            finding("critical", summary + ". The label is reducible to that cut, "
                                "so charting one against the other is circular.")
        else:
            finding("warn", summary + ". Not exact, but close enough that the "
                            "measure largely reproduces the label.")
    if len(rules) > MAX_RULES:
        print()
        print(f"...and {len(rules) - MAX_RULES} weaker rules, omitted.")
    if not rules:
        print("None found — no label is reducible to a cut on a single measure.")

    # ---- 5. correlation ------------------------------------------------
    h("5. Are the measures copies of each other?")
    if len(nums) >= 2:
        corr = df[nums].corr(numeric_only=True)
        print(corr.round(3).to_markdown())
        pairs = [(a, b, corr.loc[a, b]) for i, a in enumerate(nums)
                 for b in nums[i + 1:] if abs(corr.loc[a, b]) >= HIGH_CORRELATION]
        if pairs:
            print()
            for a, b, r in pairs:
                print(f"- `{a}` and `{b}`: r = {r:.3f}")
                finding("warn",
                        f"`{a}` and `{b}` correlate at r = {r:.3f}. They are "
                        f"close to the same measure, so showing both implies two "
                        f"pieces of evidence where there is one.")
    else:
        print("Fewer than two measures; nothing to compare.")

    # ---- 6. within-group variation -------------------------------------
    h("6. Does each measure vary within a group, or only between groups?")
    if cats and nums:
        print("| Measure | Grouped by | Overall spread | Mean within-group | Verdict |")
        print("|---|---|---|---|---|")
        flat: list[tuple[str, str, float]] = []
        for num in nums:
            overall = df[num].std()
            if not overall or np.isnan(overall):
                continue
            for cat in cats:
                within = df.groupby(cat)[num].std().mean()
                ratio = within / overall
                verdict = ("almost entirely between groups"
                           if ratio < LOW_WITHIN_GROUP_RATIO else "varies within")
                print(f"| {num} | {cat} | {overall:,.4g} | {within:,.4g} | "
                      f"{verdict} |")
                if ratio < LOW_WITHIN_GROUP_RATIO:
                    flat.append((num, cat, ratio))
        # One finding per measure, not one per pair: the same point repeated for
        # six groupings reads as six separate problems.
        for num in dict.fromkeys(n for n, _, _ in flat):
            by = sorted((c, r) for n, c, r in flat if n == num)
            where = ", ".join(f"`{c}` ({r:.0%})" for c, r in by)
            finding("note",
                    f"`{num}` barely varies inside a group of {where} "
                    f"— within-group spread as a share of overall. It is close "
                    f"to a relabelling of those columns.")
    else:
        print("Needs at least one category and one measure.")

    # ---- verdict -------------------------------------------------------
    h("Verdict")
    order = {"critical": 0, "warn": 1, "note": 2}
    ranked = sorted(dict.fromkeys(findings), key=lambda f: order[f[0]])
    counts = {k: sum(1 for s, _ in ranked if s == k) for k in order}
    print(f"{counts['critical']} critical, {counts['warn']} warnings, "
          f"{counts['note']} notes.\n")
    for severity, text in ranked:
        label = {"critical": "**Critical**", "warn": "**Warning**",
                 "note": "Note"}[severity]
        print(f"- {label}: {text}")

    print()
    if counts["critical"]:
        print("> This dataset has structure that makes ordinary business "
              "questions unanswerable: the headline comparisons a dashboard "
              "would draw are determined by how the file was built. Either scope "
              "the dashboard to what survives the findings above, make the "
              "structure itself the subject, or use different data.")
    elif counts["warn"]:
        print("> Usable, with the warnings above stated wherever an affected "
              "comparison appears.")
    else:
        print("> No structural blockers found. Ordinary measures and comparisons "
              "should mean what they appear to mean.")


if __name__ == "__main__":
    # Redirecting stdout on Windows defaults to cp1252, which cannot encode the
    # dashes used throughout the report.
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    main()
