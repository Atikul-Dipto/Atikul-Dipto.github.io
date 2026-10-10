"""
Generate the TMDL semantic model for the PaySim fraud project.

Run from this folder:  python _gen_model.py

Everything about the model lives here -- tables, columns, measures,
relationships -- so the whole thing is reviewable as one file instead of
scattered across generated TMDL. Re-run after any change and commit the output.
"""

from pathlib import Path

ROOT = Path(__file__).resolve().parent
MODEL = ROOT / "PaysimFraud.SemanticModel"
DEF = MODEL / "definition"
TABLES = DEF / "tables"
FACT = "FactTransaction"

# The folder the CSVs are read from. Single point of configuration: change it
# in the generated expressions.tmdl (or here and regenerate) if the repo moves.
DATA_FOLDER = str(ROOT / "data").replace("/", "\\")

# TMDL reads a property value starting with a double quote as an escaped
# quoted string, with inner quotes doubled. Written the obvious way, as
# '"TRUE";;"FALSE"', the parser rejects the whole model. Verified against
# the real TmdlSerializer -- see ../check_tmdl.ps1.
BOOL_FMT = '"""TRUE"";;""FALSE"""'


def write(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text.replace("\r\n", "\n"), encoding="utf-8", newline="\n")
    print("  wrote", path.relative_to(ROOT))


# --------------------------------------------------------------------------
# TMDL fragment builders. TMDL is indentation-significant and wants tabs.
# --------------------------------------------------------------------------

def col(name, dtype, *, hidden=False, key=False, fmt=None, sort=None,
        summarize="none", desc=None):
    out = []
    if desc:
        out.append(f"\t/// {desc}")
    out += [f"\tcolumn {name}", f"\t\tdataType: {dtype}"]
    if hidden:
        out.append("\t\tisHidden")
    if key:
        out.append("\t\tisKey")
    if fmt:
        out.append(f"\t\tformatString: {fmt}")
    out.append(f"\t\tsummarizeBy: {summarize}")
    out.append(f"\t\tsourceColumn: {name}")
    if sort:
        out.append(f"\t\tsortByColumn: {sort}")
    out += ["", "\t\tannotation SummarizationSetBy = Automatic", "", ""]
    return "\n".join(out)


def measure(name, expr, fmt, folder, desc):
    return (f"\t/// {desc}\n"
            f"\tmeasure '{name}' = {expr}\n"
            f"\t\tformatString: {fmt}\n"
            f"\t\tdisplayFolder: {folder}\n\n")


def partition(table, types, *, logicals=(), quoted=False, ncols=None):
    """An M partition reading one CSV out of the DataFolder.

    Booleans are stored as 1/0 in the CSVs (see build_dataset.py) and are
    converted here with Logical.From, so the model exposes real booleans.
    """
    cols_m = ", ".join('{"%s", %s}' % (c, t) for c, t in types)
    quote = "QuoteStyle.Csv" if quoted else "QuoteStyle.None"
    ncols_arg = f"Columns = {ncols}, " if ncols else ""
    lines = [
        f"\tpartition {table} = m",
        "\t\tmode: import",
        "\t\tsource =",
        "\t\t\t\tlet",
        f'\t\t\t\t    Source = Csv.Document(File.Contents(DataFolder & "\\{table}.csv"), '
        f'[Delimiter = ",", {ncols_arg}Encoding = 65001, QuoteStyle = {quote}]),',
        "\t\t\t\t    Headers = Table.PromoteHeaders(Source, [PromoteAllScalars = true]),",
        f"\t\t\t\t    Typed = Table.TransformColumnTypes(Headers, {{{cols_m}}}),",
    ]
    if logicals:
        flags = ", ".join('{"%s", Logical.From, type logical}' % c for c in logicals)
        lines += [f"\t\t\t\t    Flags = Table.TransformColumns(Typed, {{{flags}}})",
                  "\t\t\t\tin",
                  "\t\t\t\t    Flags"]
    else:
        lines += ["\t\t\t\tin", "\t\t\t\t    Typed"]
    lines += ["", "\tannotation PBI_ResultType = Table", ""]
    return "\n".join(lines)


# --------------------------------------------------------------------------
# Dimensions
# --------------------------------------------------------------------------

write(TABLES / "DimTransactionType.tmdl",
      "table DimTransactionType\n\n"
      + col("TypeKey", "int64", hidden=True, key=True)
      + col("TypeName", "string", sort="TypeSortOrder",
            desc="The five PaySim transaction types.")
      + col("Direction", "string",
            desc="Whether the type credits or debits the origin account. Reading the "
                 "balance equation in the wrong direction is the easiest way to "
                 "mis-measure this dataset.")
      + col("DestinationKind", "string",
            desc="PAYMENT always lands on a merchant account; every other type lands "
                 "on a customer account.")
      + col("TypeSortOrder", "int64", hidden=True, fmt="0")
      + partition("DimTransactionType",
                  [("TypeKey", "Int64.Type"), ("TypeName", "type text"),
                   ("Direction", "type text"), ("DestinationKind", "type text"),
                   ("TypeSortOrder", "Int64.Type")],
                  quoted=True))

write(TABLES / "DimStep.tmdl",
      "table DimStep\n\n"
      + col("StepKey", "int64", hidden=True, key=True)
      + col("SimDay", "int64", fmt="0", desc="Simulated day, 1-31. Not a calendar date.")
      + col("SimHour", "int64", fmt="0",
            desc="Hour within the simulated day, 0-23. PaySim documents no clock "
                 "alignment, so this is not a wall-clock time and must not be "
                 "labelled as one.")
      + col("SimHourLabel", "string", sort="SimHour")
      + col("HourBand", "string",
            desc="Quiet hours (1-8) carry under a tenth of the peak hour's volume. "
                 "Derived from volume, not from an assumed business day.")
      + col("DayLabel", "string", sort="SimDay")
      + col("IsFullVolumeDay", "boolean", fmt=BOOL_FMT,
            desc="True on the 14 days the simulator generated a full load of "
                 "legitimate traffic. Fraud injection is near constant, so fraud "
                 "RATE on the other 17 days measures the simulator, not risk.")
      + partition("DimStep",
                  [("StepKey", "Int64.Type"), ("SimDay", "Int64.Type"),
                   ("SimHour", "Int64.Type"), ("SimHourLabel", "type text"),
                   ("HourBand", "type text"), ("DayLabel", "type text"),
                   ("IsFullVolumeDay", "Int64.Type")],
                  logicals=("IsFullVolumeDay",)))

write(TABLES / "DimAmountBand.tmdl",
      "table DimAmountBand\n\n"
      + col("AmountBandKey", "int64", hidden=True, key=True)
      + col("AmountBand", "string", sort="BandSortOrder",
            desc="Right-open amount buckets, so 1000.00 falls in 1K - 10K.")
      + col("BandSortOrder", "int64", hidden=True, fmt="0")
      + col("BandFloor", "int64", fmt="#,0", desc="Inclusive lower bound of the band.")
      + partition("DimAmountBand",
                  [("AmountBandKey", "Int64.Type"), ("AmountBand", "type text"),
                   ("BandSortOrder", "Int64.Type"), ("BandFloor", "Int64.Type")]))

write(TABLES / "DimDetectionOutcome.tmdl",
      "table DimDetectionOutcome\n\n"
      + col("OutcomeKey", "int64", hidden=True, key=True)
      + col("Outcome", "string", sort="OutcomeSortOrder",
            desc="The four cells of the confusion matrix for the bank's own "
                 "isFlaggedFraud rule. The 'Alert raised, legitimate' row exists "
                 "with zero rows behind it on purpose: that zero is the finding.")
      + col("ConfusionCell", "string", sort="OutcomeSortOrder")
      + col("WasFraud", "boolean", fmt=BOOL_FMT)
      + col("AlertRaised", "boolean", fmt=BOOL_FMT)
      + col("OutcomeSortOrder", "int64", hidden=True, fmt="0")
      + partition("DimDetectionOutcome",
                  [("OutcomeKey", "Int64.Type"), ("Outcome", "type text"),
                   ("WasFraud", "Int64.Type"), ("AlertRaised", "Int64.Type"),
                   ("ConfusionCell", "type text"), ("OutcomeSortOrder", "Int64.Type")],
                  logicals=("WasFraud", "AlertRaised"), quoted=True))

# --------------------------------------------------------------------------
# Fact
# --------------------------------------------------------------------------

MONEY = "#,0"

fact_cols = (
    col("StepKey", "int64", hidden=True)
    + col("TypeKey", "int64", hidden=True)
    + col("AmountBandKey", "int64", hidden=True)
    + col("OutcomeKey", "int64", hidden=True)
    + col("Amount", "double", fmt=MONEY, summarize="sum",
          desc="Transaction amount. PaySim states no currency, so no unit is shown.")
    + col("OldBalanceOrig", "double", fmt=MONEY, desc="Origin balance before the transaction.")
    + col("NewBalanceOrig", "double", fmt=MONEY, desc="Origin balance after the transaction.")
    + col("OldBalanceDest", "double", fmt=MONEY,
          desc="Destination balance before. Always 0 for PAYMENT -- merchant "
               "balances are not recorded. See DestBalanceAbsent.")
    + col("NewBalanceDest", "double", fmt=MONEY, desc="Destination balance after.")
    + col("IsFraud", "boolean", fmt=BOOL_FMT,
          desc="The ground-truth label supplied with the dataset.")
    + col("IsFlaggedFraud", "boolean", fmt=BOOL_FMT,
          desc="The bank's own rule fired and blocked the transfer. All 16 rows "
               "that carry it show the origin balance unchanged, which is what "
               "'blocked' looks like in the ledger.")
    + col("IsFullAccountDrain", "boolean", fmt=BOOL_FMT,
          desc="Amount equals the origin's opening balance to the cent, on money "
               "out to a customer account: the account was emptied in one move. "
               "Derived in build_dataset.py, not supplied with the dataset.")
    + col("LedgerReconciles", "boolean", fmt=BOOL_FMT,
          desc="The row's own arithmetic adds up, reading the balance equation in "
               "the direction the type implies. True on only ~41% of rows.")
    + col("DestBalanceAbsent", "boolean", fmt=BOOL_FMT,
          desc="Destination balance is zero both before and after -- structurally "
               "missing rather than genuinely zero.")
)

M = [
    # ---- volume ----
    ("Transactions", f"COUNTROWS('{FACT}')", "#,0", "01 Volume",
     "Rows in the current filter context. One row is one transaction leg."),
    ("Transaction Value", f"SUM('{FACT}'[Amount])", MONEY, "01 Volume",
     "Total amount moved. Unitless: PaySim names no currency."),
    ("Average Transaction", f"AVERAGE('{FACT}'[Amount])", MONEY, "01 Volume",
     "Mean amount. Read next to the median -- this distribution is heavily skewed."),
    ("Median Transaction", f"MEDIAN('{FACT}'[Amount])", MONEY, "01 Volume",
     "Median amount."),
    ("Days Observed", f"COUNTROWS(SUMMARIZE('{FACT}', DimStep[SimDay]))", "#,0", "01 Volume",
     "Simulated days with at least one transaction in context."),
    ("Hours Observed", f"DISTINCTCOUNT('{FACT}'[StepKey])", "#,0", "01 Volume",
     "Simulated hours with at least one transaction in context."),

    # ---- fraud ----
    ("Fraud Legs", f"CALCULATE([Transactions], KEEPFILTERS('{FACT}'[IsFraud] = TRUE()))",
     "#,0", "02 Fraud",
     "Rows labelled fraudulent. A leg, not an event: each fraud is committed as a "
     "TRANSFER out of the victim and a CASH_OUT of the same amount."),
    ("Fraud Rate %", "DIVIDE([Fraud Legs], [Transactions])", "0.000%", "02 Fraud",
     "Share of rows labelled fraudulent."),
    ("Fraud Events",
     'CALCULATE([Fraud Legs], KEEPFILTERS(DimTransactionType[TypeName] = "TRANSFER"))',
     "#,0", "02 Fraud",
     "Fraud counted once per event by taking only the TRANSFER leg. Blank if the "
     "context already excludes TRANSFER, which is the honest answer rather than a "
     "number that ignores your filter."),
    ("Fraud Exposure",
     f"CALCULATE(SUM('{FACT}'[Amount]), KEEPFILTERS('{FACT}'[IsFraud] = TRUE()), "
     'KEEPFILTERS(DimTransactionType[TypeName] = "TRANSFER"))',
     MONEY, "02 Fraud",
     "Money stolen, counted once, by summing the TRANSFER leg only. This is the "
     "number to quote -- not Fraud Leg Value."),
    ("Fraud Leg Value",
     f"CALCULATE(SUM('{FACT}'[Amount]), KEEPFILTERS('{FACT}'[IsFraud] = TRUE()))",
     MONEY, "02 Fraud",
     "Sum of amount over every fraud row. Double counts the money, because each "
     "fraud appears twice. Shown next to Fraud Exposure to make that visible."),
    ("Leg Double Count %",
     "DIVIDE([Fraud Leg Value] - [Fraud Exposure], [Fraud Leg Value])",
     "0.0%", "02 Fraud",
     "How much of a naive SUM over fraud rows is the same money counted twice."),

    # ---- the bank's own rule ----
    ("Alerts Raised",
     f"CALCULATE([Transactions], KEEPFILTERS('{FACT}'[IsFlaggedFraud] = TRUE()))",
     "#,0", "03 Bank rule",
     "Times the bank's existing rule fired."),
    ("Fraud Caught",
     f"CALCULATE([Transactions], KEEPFILTERS('{FACT}'[IsFraud] = TRUE()), "
     f"KEEPFILTERS('{FACT}'[IsFlaggedFraud] = TRUE()))",
     "#,0", "03 Bank rule", "True positives."),
    ("Fraud Missed",
     f"CALCULATE([Transactions], KEEPFILTERS('{FACT}'[IsFraud] = TRUE()), "
     f"KEEPFILTERS('{FACT}'[IsFlaggedFraud] = FALSE()))",
     "#,0", "03 Bank rule", "False negatives."),
    ("False Alarms",
     f"CALCULATE([Transactions], KEEPFILTERS('{FACT}'[IsFraud] = FALSE()), "
     f"KEEPFILTERS('{FACT}'[IsFlaggedFraud] = TRUE()))",
     "#,0", "03 Bank rule",
     "False positives. Zero across the whole dataset: the rule never once fired "
     "on a legitimate transaction."),
    ("Bank Rule Recall %", "DIVIDE([Fraud Caught], [Fraud Legs])", "0.000%", "03 Bank rule",
     "Share of fraud the existing rule catches."),
    ("Bank Rule Precision %", "DIVIDE([Fraud Caught], [Alerts Raised])", "0.0%",
     "03 Bank rule", "Share of its alerts that were really fraud."),
    ("Value Caught",
     f"CALCULATE(SUM('{FACT}'[Amount]), KEEPFILTERS('{FACT}'[IsFraud] = TRUE()), "
     f"KEEPFILTERS('{FACT}'[IsFlaggedFraud] = TRUE()))",
     MONEY, "03 Bank rule", "Amount on the fraud rows the rule stopped."),
    ("Value Missed",
     f"CALCULATE(SUM('{FACT}'[Amount]), KEEPFILTERS('{FACT}'[IsFraud] = TRUE()), "
     f"KEEPFILTERS('{FACT}'[IsFlaggedFraud] = FALSE()))",
     MONEY, "03 Bank rule", "Amount on the fraud rows it did not."),

    # ---- the proposed rule ----
    ("Drain Rule Alerts",
     f"CALCULATE([Transactions], KEEPFILTERS('{FACT}'[IsFullAccountDrain] = TRUE()))",
     "#,0", "04 Drain rule",
     "Rows the proposed rule would flag: amount equals the origin's whole opening "
     "balance, on money out to a customer account."),
    ("Drain Rule Caught",
     f"CALCULATE([Transactions], KEEPFILTERS('{FACT}'[IsFullAccountDrain] = TRUE()), "
     f"KEEPFILTERS('{FACT}'[IsFraud] = TRUE()))",
     "#,0", "04 Drain rule", "True positives for the proposed rule."),
    ("Drain Rule False Alarms",
     f"CALCULATE([Transactions], KEEPFILTERS('{FACT}'[IsFullAccountDrain] = TRUE()), "
     f"KEEPFILTERS('{FACT}'[IsFraud] = FALSE()))",
     "#,0", "04 Drain rule", "False positives for the proposed rule."),
    ("Drain Rule Recall %", "DIVIDE([Drain Rule Caught], [Fraud Legs])", "0.0%",
     "04 Drain rule", "Share of fraud the proposed rule would catch."),
    ("Drain Rule Precision %", "DIVIDE([Drain Rule Caught], [Drain Rule Alerts])",
     "0.0%", "04 Drain rule", "Share of its alerts that would be real fraud."),
    ("Recall Lift vs Bank Rule", "DIVIDE([Drain Rule Recall %], [Bank Rule Recall %])",
     '#,0"x"', "04 Drain rule",
     "How many times more fraud the proposed rule catches. Derived from the same "
     "labels it is scored against, so this is an in-sample figure."),
    ("Alerts per Day", "DIVIDE([Drain Rule Alerts], [Days Observed])", "#,0",
     "04 Drain rule",
     "Review workload the proposed rule would create. A rule nobody can staff is "
     "not a rule."),
    ("Exposure Detected",
     f"CALCULATE(SUM('{FACT}'[Amount]), KEEPFILTERS('{FACT}'[IsFraud] = TRUE()), "
     'KEEPFILTERS(DimTransactionType[TypeName] = "TRANSFER"), '
     f"KEEPFILTERS('{FACT}'[IsFullAccountDrain] = TRUE()))",
     MONEY, "04 Drain rule",
     "Of the money actually stolen, how much the proposed rule would have stopped."),
    ("Exposure Detected %", "DIVIDE([Exposure Detected], [Fraud Exposure])", "0.0%",
     "04 Drain rule", "Exposure Detected as a share of Fraud Exposure."),

    # ---- where the risk sits ----
    ("Peak Hourly Fraud Rate %", "MAXX(VALUES(DimStep[SimHour]), [Fraud Rate %])",
     "0.0%", "05 Risk concentration",
     "Fraud rate in the worst hour of the simulated day."),
    ("Lowest Hourly Fraud Rate %", "MINX(VALUES(DimStep[SimHour]), [Fraud Rate %])",
     "0.000%", "05 Risk concentration",
     "Fraud rate in the best hour of the simulated day."),
    ("Hourly Fraud Rate Spread",
     "DIVIDE([Peak Hourly Fraud Rate %], [Lowest Hourly Fraud Rate %])",
     '#,0"x"', "05 Risk concentration",
     "Worst hour over best hour. Fraud volume is near constant around the clock "
     "while legitimate volume collapses overnight, so the ratio is large."),
    ("Quiet Hours Fraud Rate %",
     'CALCULATE([Fraud Rate %], KEEPFILTERS(DimStep[HourBand] = "Quiet hours"))',
     "0.0%", "05 Risk concentration", "Fraud rate across hours 1-8."),
    ("Active Hours Fraud Rate %",
     'CALCULATE([Fraud Rate %], KEEPFILTERS(DimStep[HourBand] = "Active hours"))',
     "0.000%", "05 Risk concentration", "Fraud rate across hours 9-0."),

    # ---- can you trust the input ----
    ("Ledger Reconciliation %",
     f"DIVIDE(CALCULATE([Transactions], KEEPFILTERS('{FACT}'[LedgerReconciles] = TRUE())), "
     "[Transactions])",
     "0.0%", "06 Data quality",
     "Share of rows whose own balances add up. Low, and that is a property of the "
     "simulator, not of this model."),
    ("Destination Balance Absent %",
     f"DIVIDE(CALCULATE([Transactions], KEEPFILTERS('{FACT}'[DestBalanceAbsent] = TRUE())), "
     "[Transactions])",
     "0.0%", "06 Data quality",
     "Share of rows with no destination balance recorded at all."),
    ("Zero Amount Rows", f"CALCULATE([Transactions], KEEPFILTERS('{FACT}'[Amount] = 0))",
     "#,0", "06 Data quality",
     "Transactions that moved nothing. All 16 are the stranded second leg of a "
     "fraud whose first leg the bank's rule blocked."),
    ("Full Volume Day Share %",
     "DIVIDE(CALCULATE([Transactions], KEEPFILTERS(DimStep[IsFullVolumeDay] = TRUE())), "
     "[Transactions])",
     "0.0%", "06 Data quality",
     "Share of rows falling on the 14 days with a full load of legitimate traffic."),
]

fact_types = [
    ("StepKey", "Int64.Type"), ("TypeKey", "Int64.Type"),
    ("AmountBandKey", "Int64.Type"), ("OutcomeKey", "Int64.Type"),
    ("Amount", "type number"), ("OldBalanceOrig", "type number"),
    ("NewBalanceOrig", "type number"), ("OldBalanceDest", "type number"),
    ("NewBalanceDest", "type number"), ("IsFraud", "Int64.Type"),
    ("IsFlaggedFraud", "Int64.Type"), ("IsFullAccountDrain", "Int64.Type"),
    ("LedgerReconciles", "Int64.Type"), ("DestBalanceAbsent", "Int64.Type"),
]

write(TABLES / f"{FACT}.tmdl",
      f"table {FACT}\n\n"
      + fact_cols
      + "".join(measure(n, e, f, d, desc) for n, e, f, d, desc in M)
      + partition(FACT, fact_types, ncols=14,
                  logicals=("IsFraud", "IsFlaggedFraud", "IsFullAccountDrain",
                            "LedgerReconciles", "DestBalanceAbsent")))

# --------------------------------------------------------------------------
# Relationships, expressions, model, database
# --------------------------------------------------------------------------
# Four single-direction one-to-many relationships, every one from a dimension
# key to the matching fact key. No bidirectional filtering and no second path
# between any pair of tables, so there is nothing ambiguous for the engine to
# resolve.

rels = [
    ("DimTransactionType", "TypeKey"),
    ("DimStep", "StepKey"),
    ("DimAmountBand", "AmountBandKey"),
    ("DimDetectionOutcome", "OutcomeKey"),
]
write(DEF / "relationships.tmdl",
      "\n".join(
          f"relationship {tbl}_{FACT}\n"
          f"\tfromColumn: {FACT}.{key}\n"
          f"\ttoColumn: {tbl}.{key}\n"
          for tbl, key in rels))

write(DEF / "expressions.tmdl",
      "/// Folder holding the CSVs written by build_dataset.py. The only thing in\n"
      "/// this model that knows where the data lives -- repoint it if you move the\n"
      "/// repo or rebuild the data elsewhere.\n"
      f'expression DataFolder = "{DATA_FOLDER}" meta [IsParameterQuery=true, '
      'Type="Text", IsParameterQueryRequired=true]\n\n'
      "\tannotation PBI_ResultType = Text\n")

order = ["DataFolder", "DimTransactionType", "DimStep", "DimAmountBand",
         "DimDetectionOutcome", FACT]
write(DEF / "model.tmdl",
      "model Model\n"
      "\tculture: en-US\n"
      "\tdefaultPowerBIDataSourceVersion: powerBI_V3\n"
      "\tdiscourageImplicitMeasures\n"
      "\tsourceQueryCulture: en-US\n"
      "\tdataAccessOptions\n"
      "\t\tlegacyRedirects\n"
      "\t\treturnErrorValuesAsNull\n\n"
      "annotation PBI_QueryOrder = [" + ",".join(f'"{t}"' for t in order) + "]\n\n"
      + "".join(f"ref table {t}\n" for t in order[1:]))

write(DEF / "database.tmdl", "database PaysimFraud\n\tcompatibilityLevel: 1550\n")

write(MODEL / "definition.pbism",
      '{\n  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/'
      'semanticModel/definitionProperties/1.0.0/schema.json",\n'
      '  "version": "4.2",\n  "settings": {}\n}\n')

print(f"\n{len(M)} measures across {len(rels) + 1} tables")
