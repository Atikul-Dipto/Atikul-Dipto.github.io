"""
Build a star-schema CSV export from the PaySim synthetic mobile-money log.

Source: the Kaggle dataset "Synthetic Financial Datasets For Fraud Detection"
(Lopez-Rojas et al., PaySim). One CSV, 6,362,620 rows, 11 columns.
Output: five CSVs under ./data that Power BI imports.

    python build_dataset.py "D:/datasets/paysim-raw/PS_20174392719_1491204439457_log.csv"

Nothing here invents data. Every derived column is a documented transformation
of a source column, and every row of the source survives into the fact table --
including the broken ones, which are flagged so the report can measure them.

Two transformations carry real analytical weight and are explained where they
are computed: IsFullAccountDrain (the fraud signature) and LedgerReconciles
(the balance-equation audit). Read those comments before changing them.
"""

from __future__ import annotations

import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parent
OUT = ROOT / "data"

DEFAULT_SOURCE = Path("D:/datasets/paysim-raw/PS_20174392719_1491204439457_log.csv")

# PaySim's `step` is one simulated hour. 743 steps is just under 31 days. There
# is no calendar anchor anywhere in the dataset or its documentation, so this
# build deliberately does NOT manufacture dates -- see DimStep.
HOURS_PER_DAY = 24

# A transaction type either debits the origin account or credits it. Applying
# the wrong direction to the balance equation is the single easiest way to
# mis-measure this dataset, so the direction is declared once, here.
INFLOW_TYPES = ("CASH_IN",)

# Where the origin account's money goes. PAYMENT always lands on a merchant
# account (verified: 2,151,495 of 2,151,495 rows); everything else lands on a
# customer account.
MERCHANT_DEST_TYPES = ("PAYMENT",)

TYPE_ORDER = ("PAYMENT", "CASH_IN", "CASH_OUT", "TRANSFER", "DEBIT")

AMOUNT_BANDS = [
    # (label, floor, ceiling) -- right-open intervals, ceiling None = unbounded
    ("0 - 1K", 0, 1_000),
    ("1K - 10K", 1_000, 10_000),
    ("10K - 50K", 10_000, 50_000),
    ("50K - 100K", 50_000, 100_000),
    ("100K - 200K", 100_000, 200_000),
    ("200K - 500K", 200_000, 500_000),
    ("500K - 1M", 500_000, 1_000_000),
    ("1M - 10M", 1_000_000, 10_000_000),
    ("10M+", 10_000_000, None),
]

# The four cells of a confusion matrix for the bank's own isFlaggedFraud rule.
# "No alert, legitimate" is 99.87% of the data; the other three are the story.
OUTCOMES = [
    (1, "Alert raised, fraud confirmed", True, True, "True positive"),
    (2, "No alert, fraud occurred", True, False, "False negative"),
    (3, "Alert raised, legitimate", False, True, "False positive"),
    (4, "No alert, legitimate", False, False, "True negative"),
]

# A day is only comparable with other days if the simulator was actually
# generating legitimate traffic that day. PaySim's legitimate volume is wildly
# uneven -- full days carry 350K-575K transactions while 17 of the 31 days
# carry under 60K -- but its fraud injection is near constant at ~260/day. So
# an unqualified "fraud rate by day" chart measures the simulator's duty cycle,
# not risk. This threshold sits in the empty gap between 57,853 and 349,776.
FULL_VOLUME_DAY_MIN_LEGIT = 100_000

# Same problem within the day. Quiet hours carry as little as 1/500th of the
# peak hour's volume. 10% of the peak separates the two populations cleanly.
QUIET_HOUR_PEAK_SHARE = 0.10


def log(msg: str = "") -> None:
    print(msg, flush=True)


def band_of(amount: pd.Series) -> pd.Series:
    """Map amounts onto AMOUNT_BANDS keys (1-based, matching DimAmountBand)."""
    edges = [b[1] for b in AMOUNT_BANDS] + [np.inf]
    # right=False gives [floor, ceiling) so 1000.00 lands in "1K - 10K".
    keys = pd.cut(amount, bins=edges, labels=range(1, len(AMOUNT_BANDS) + 1),
                  right=False, include_lowest=True)
    return keys.astype("int8")


def write_csv(frame: pd.DataFrame, name: str, float_fmt: str | None = "%.2f") -> None:
    path = OUT / f"{name}.csv"
    # Plain UTF-8, no BOM: the M queries pass Encoding = 65001 explicitly, and a
    # BOM would otherwise end up inside the first column's name.
    frame.to_csv(path, index=False, encoding="utf-8", lineterminator="\n",
                 float_format=float_fmt)
    size = path.stat().st_size
    log(f"  {name + '.csv':30} {len(frame):>9,} rows  {size / 1_048_576:>8.1f} MB")


def main() -> None:
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_SOURCE
    if not src.exists():
        raise SystemExit(
            f"Source CSV not found: {src}\n\n"
            "Download 'Synthetic Financial Datasets For Fraud Detection' from\n"
            "Kaggle, unzip it, and pass the CSV path as the first argument."
        )
    OUT.mkdir(parents=True, exist_ok=True)

    log(f"Reading {src}")
    df = pd.read_csv(src, dtype={
        "step": "int32", "type": "category", "amount": "float64",
        "nameOrig": "object", "oldbalanceOrg": "float64", "newbalanceOrig": "float64",
        "nameDest": "object", "oldbalanceDest": "float64", "newbalanceDest": "float64",
        "isFraud": "int8", "isFlaggedFraud": "int8",
    })
    log(f"  {len(df):,} rows x {df.shape[1]} columns")

    # ---- account identifiers are dropped on purpose -----------------------
    # nameOrig holds 6,353,307 distinct values across 6,362,620 rows: it is
    # very nearly a row id and carries no analytical signal. nameDest holds
    # 2,722,362, and the mule-account hypothesis does not survive contact with
    # it -- 8,125 of the 8,169 accounts that receive fraud receive exactly one
    # fraudulent transaction, so there is no concentration to chart. The only
    # part of nameDest that means anything is its first character, which marks
    # merchant (M) versus customer (C), and that is already implied by the
    # transaction type. Keeping either column as a dimension would add millions
    # of distinct strings to the model for no answerable question.
    dest_is_merchant = df["nameDest"].str[0] == "M"
    expected_merchant = df["type"].isin(MERCHANT_DEST_TYPES)
    mismatch = int((dest_is_merchant != expected_merchant).sum())
    if mismatch:
        log(f"  WARNING: {mismatch:,} rows where destination kind disagrees with "
            "transaction type; MERCHANT_DEST_TYPES needs revisiting")
    df = df.drop(columns=["nameOrig", "nameDest"])

    # ---- DimTransactionType ---------------------------------------------
    present = [t for t in TYPE_ORDER if t in set(df["type"].cat.categories)]
    unexpected = sorted(set(df["type"].cat.categories) - set(TYPE_ORDER))
    if unexpected:
        raise SystemExit(f"Unknown transaction type(s) in source: {unexpected}")
    type_key = {t: i + 1 for i, t in enumerate(present)}
    dim_type = pd.DataFrame({
        "TypeKey": [type_key[t] for t in present],
        "TypeName": present,
        "Direction": ["Money in" if t in INFLOW_TYPES else "Money out" for t in present],
        "DestinationKind": ["Merchant" if t in MERCHANT_DEST_TYPES else "Customer account"
                            for t in present],
        "TypeSortOrder": range(1, len(present) + 1),
    })
    write_csv(dim_type, "DimTransactionType", float_fmt=None)

    # ---- derived fact columns -------------------------------------------
    df["TypeKey"] = df["type"].map(type_key).astype("int8")
    is_inflow = df["type"].isin(INFLOW_TYPES).to_numpy()

    # IsFullAccountDrain -- the fraud signature.
    #
    # The transferred amount is exactly the origin account's opening balance,
    # to the cent: the account was emptied in one move. This holds for 8,034 of
    # the 8,213 fraudulent rows and for 1 of the 6,354,407 legitimate ones, and
    # that single exception is a 63.99 PAYMENT to a merchant that left 0.01
    # behind, which the "money out to a customer account" condition excludes.
    #
    # The condition is restricted to TRANSFER and CASH_OUT because those are
    # the only two types fraud appears in at all, and because draining an
    # account into a merchant is shopping, not theft.
    outgoing_to_customer = (~is_inflow) & (~df["type"].isin(MERCHANT_DEST_TYPES)).to_numpy()
    df["IsFullAccountDrain"] = (
        ((df["amount"] - df["oldbalanceOrg"]).abs() < 0.01).to_numpy()
        & outgoing_to_customer
    )

    # LedgerReconciles -- does the row's own arithmetic add up?
    #
    # CASH_IN credits the origin account, every other type debits it. Applied
    # in the correct direction per type, the origin equation holds on only
    # ~40% of rows: 92.8% of CASH_IN but 4.5% of TRANSFER. This is a known
    # artefact of the simulator, not a parsing error on our side, and it is the
    # reason the report reads the flags rather than auditing the balances.
    expected_new_orig = np.where(is_inflow,
                                 df["oldbalanceOrg"] + df["amount"],
                                 df["oldbalanceOrg"] - df["amount"])
    df["LedgerReconciles"] = np.abs(expected_new_orig - df["newbalanceOrig"]) < 0.01

    # DestBalanceAbsent -- structurally missing, not missing at random.
    # Every one of the 2,151,495 PAYMENT rows reports the destination holding
    # zero before and after. Merchant balances simply are not recorded, so any
    # destination-side analysis has to exclude PAYMENT rather than read 0.
    df["DestBalanceAbsent"] = (df["oldbalanceDest"] == 0) & (df["newbalanceDest"] == 0)

    df["AmountBandKey"] = band_of(df["amount"])

    fraud = df["isFraud"] == 1
    flagged = df["isFlaggedFraud"] == 1
    outcome_key = np.select(
        [fraud & flagged, fraud & ~flagged, ~fraud & flagged],
        [1, 2, 3], default=4,
    ).astype("int8")
    df["OutcomeKey"] = outcome_key

    # ---- DimStep ---------------------------------------------------------
    # Simulation time, not a calendar. There is no date in the source and none
    # is invented here: a report page that needs an axis uses SimDay (1-31) and
    # SimHour (0-23), and the model has no date table at all. SimHour is an
    # hour *within the simulated day*; PaySim documents no clock alignment, so
    # it is not a wall-clock time and is never labelled as one.
    df["SimDay"] = ((df["step"] - 1) // HOURS_PER_DAY) + 1
    df["SimHour"] = df["step"] % HOURS_PER_DAY

    per_day = df.groupby("SimDay").agg(txns=("isFraud", "size"), fraud=("isFraud", "sum"))
    per_day["legit"] = per_day["txns"] - per_day["fraud"]
    full_days = set(per_day.index[per_day["legit"] >= FULL_VOLUME_DAY_MIN_LEGIT])
    log(f"\n  Full-volume days ({len(full_days)} of {len(per_day)}): "
        f"{sorted(full_days)}")
    log(f"  legit/day on full days   : {per_day.loc[sorted(full_days), 'legit'].min():,}"
        f" - {per_day.loc[sorted(full_days), 'legit'].max():,}")
    partial = sorted(set(per_day.index) - full_days)
    log(f"  legit/day on partial days: {per_day.loc[partial, 'legit'].min():,}"
        f" - {per_day.loc[partial, 'legit'].max():,}")

    per_hour = df.groupby("SimHour").size()
    quiet_cut = per_hour.max() * QUIET_HOUR_PEAK_SHARE
    quiet_hours = set(per_hour.index[per_hour < quiet_cut])
    log(f"  Quiet hours (<{quiet_cut:,.0f} txns): {sorted(quiet_hours)}")

    steps = np.arange(1, int(df["step"].max()) + 1)
    sim_day = ((steps - 1) // HOURS_PER_DAY) + 1
    sim_hour = steps % HOURS_PER_DAY
    dim_step = pd.DataFrame({
        "StepKey": steps,
        "SimDay": sim_day,
        "SimHour": sim_hour,
        "SimHourLabel": [f"H{h:02d}" for h in sim_hour],
        "HourBand": ["Quiet hours" if h in quiet_hours else "Active hours" for h in sim_hour],
        "DayLabel": [f"Day {d:02d}" for d in sim_day],
        # 1/0 rather than True/False so that every boolean in every table
        # takes the same Logical.From conversion in M. One pattern, one
        # failure mode.
        "IsFullVolumeDay": np.isin(sim_day, sorted(full_days)).astype("int8"),
    })
    write_csv(dim_step, "DimStep", float_fmt=None)

    # ---- DimAmountBand ---------------------------------------------------
    dim_band = pd.DataFrame({
        "AmountBandKey": range(1, len(AMOUNT_BANDS) + 1),
        "AmountBand": [b[0] for b in AMOUNT_BANDS],
        "BandSortOrder": range(1, len(AMOUNT_BANDS) + 1),
        "BandFloor": [b[1] for b in AMOUNT_BANDS],
    })
    write_csv(dim_band, "DimAmountBand", float_fmt=None)

    # ---- DimDetectionOutcome --------------------------------------------
    # Includes the "Alert raised, legitimate" row even though the data contains
    # none, so a visual over this dimension shows the empty cell rather than
    # silently omitting it. That zero *is* the finding: the rule never once
    # fired on a legitimate transaction.
    dim_outcome = pd.DataFrame({
        "OutcomeKey": [o[0] for o in OUTCOMES],
        "Outcome": [o[1] for o in OUTCOMES],
        "WasFraud": [int(o[2]) for o in OUTCOMES],
        "AlertRaised": [int(o[3]) for o in OUTCOMES],
        "ConfusionCell": [o[4] for o in OUTCOMES],
        "OutcomeSortOrder": [o[0] for o in OUTCOMES],
    })
    write_csv(dim_outcome, "DimDetectionOutcome", float_fmt=None)

    # ---- FactTransaction -------------------------------------------------
    # Booleans are written as 1/0 rather than TRUE/FALSE: at 6.4M rows the
    # five flag columns would otherwise add ~130 MB of the word "FALSE". The M
    # query converts them with Logical.From, so the model still sees real
    # booleans.
    fact = pd.DataFrame({
        "StepKey": df["step"].astype("int16"),
        "TypeKey": df["TypeKey"],
        "AmountBandKey": df["AmountBandKey"],
        "OutcomeKey": df["OutcomeKey"],
        "Amount": df["amount"],
        "OldBalanceOrig": df["oldbalanceOrg"],
        "NewBalanceOrig": df["newbalanceOrig"],
        "OldBalanceDest": df["oldbalanceDest"],
        "NewBalanceDest": df["newbalanceDest"],
        "IsFraud": fraud.astype("int8"),
        "IsFlaggedFraud": flagged.astype("int8"),
        "IsFullAccountDrain": df["IsFullAccountDrain"].astype("int8"),
        "LedgerReconciles": df["LedgerReconciles"].astype("int8"),
        "DestBalanceAbsent": df["DestBalanceAbsent"].astype("int8"),
    })
    log("")
    write_csv(fact, "FactTransaction")

    # ---- what the report will say, asserted here -------------------------
    log("\nHeadline figures (these are what the report should reproduce):")
    tp = int((fraud & flagged).sum())
    fn = int((fraud & ~flagged).sum())
    fp = int((~fraud & flagged).sum())
    drain = df["IsFullAccountDrain"]
    d_tp = int((drain & fraud).sum())
    d_fp = int((drain & ~fraud).sum())
    log(f"  fraud legs                      {int(fraud.sum()):,}")
    log(f"  fraud rate                      {fraud.mean() * 100:.4f}%")
    log(f"  bank rule   TP/FP/FN            {tp:,} / {fp:,} / {fn:,}")
    log(f"  bank rule   recall              {tp / (tp + fn) * 100:.4f}%")
    log(f"  drain rule  TP/FP               {d_tp:,} / {d_fp:,}")
    log(f"  drain rule  recall              {d_tp / int(fraud.sum()) * 100:.2f}%")
    log(f"  recall lift                     {(d_tp / (tp + fn)) / (tp / (tp + fn)):.0f}x")
    transfer_legs = fraud & (df["type"] == "TRANSFER")
    log(f"  fraud exposure (transfer leg)   {df.loc[transfer_legs, 'amount'].sum():,.0f}")
    log(f"  sum of all fraud legs           {df.loc[fraud, 'amount'].sum():,.0f}")
    log(f"  ledger reconciliation           {df['LedgerReconciles'].mean() * 100:.1f}%")
    log(f"  zero-amount rows                {int((df['amount'] == 0).sum()):,}")

    hourly = df.groupby("SimHour").agg(n=("isFraud", "size"), f=("isFraud", "sum"))
    hourly["rate"] = hourly["f"] / hourly["n"]
    log(f"  fraud rate, quietest hour       {hourly['rate'].max() * 100:.2f}%"
        f" (hour {int(hourly['rate'].idxmax())})")
    log(f"  fraud rate, busiest hour        {hourly['rate'].min() * 100:.3f}%"
        f" (hour {int(hourly['rate'].idxmin())})")
    log(f"  spread                          {hourly['rate'].max() / hourly['rate'].min():.0f}x")


if __name__ == "__main__":
    main()
