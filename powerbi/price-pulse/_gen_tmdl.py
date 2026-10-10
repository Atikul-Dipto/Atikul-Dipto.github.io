"""Generate the TMDL table definitions. Run from the project folder."""

from pathlib import Path

T = Path("PricePulse.SemanticModel/definition/tables")
T.mkdir(parents=True, exist_ok=True)
F = "FactPriceObservation"


def w(name, text):
    (T / f"{name}.tmdl").write_text(text.replace("\r\n", "\n"), encoding="utf-8", newline="\n")
    print("  wrote", name)


def col(name, dtype, hidden=False, key=False, fmt=None, sort=None, cat=None, desc=None):
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
    out.append("\t\tsummarizeBy: none")
    out.append(f"\t\tsourceColumn: {name}")
    if sort:
        out.append(f"\t\tsortByColumn: {sort}")
    if cat:
        out.append(f"\t\tdataCategory: {cat}")
    out += ["", "\t\tannotation SummarizationSetBy = Automatic", "", ""]
    return "\n".join(out)


def measure(name, expr, fmt, desc):
    return f"\t/// {desc}\n\tmeasure '{name}' = {expr}\n\t\tformatString: {fmt}\n\n"


def partition(table, cols_m, cleaned):
    types = ", ".join('{"%s", %s}' % (c, t) for c, t in cols_m)
    return (
        f"\tpartition {table} = m\n\t\tmode: import\n\t\tsource =\n"
        f"\t\t\t\tlet\n"
        f'\t\t\t\t    Source = Csv.Document(File.Contents(DataFolder & "\\{table}.csv"), '
        f"[Delimiter = \",\", Encoding = 65001, QuoteStyle = QuoteStyle.Csv]),\n"
        f"\t\t\t\t    Headers = Table.PromoteHeaders(Source, [PromoteAllScalars = true]),\n"
        f"{cleaned}"
        f"\t\t\t\t    Typed = Table.TransformColumnTypes(Cleaned, {{{types}}})\n"
        f"\t\t\t\tin\n\t\t\t\t    Typed\n\n"
        f"\tannotation PBI_ResultType = Table\n"
    )


w(
    "DimRetailer",
    "table DimRetailer\n\n"
    + col("RetailerKey", "int64", hidden=True, key=True)
    + col("RetailerCode", "string", hidden=True)
    + col("RetailerName", "string", desc="Display name of the marketplace.")
    + partition(
        "DimRetailer",
        [("RetailerKey", "Int64.Type"), ("RetailerCode", "type text"), ("RetailerName", "type text")],
        "\t\t\t\t    Cleaned = Headers,\n",
    ),
)

w(
    "DimProduct",
    "table DimProduct\n\n"
    + col("ProductKey", "int64", hidden=True, key=True)
    + col("RetailerKey", "int64", hidden=True,
          desc="Attribute only. Deliberately not related to DimRetailer, which would make the filter path ambiguous.")
    + col("ProductName", "string")
    + col("Category", "string",
          desc="Derived from keywords in the product name. Unmatched names stay Unclassified.")
    + col("SourceUrl", "string", cat="WebUrl")
    + col("FirstSeen", "dateTime", fmt="yyyy-mm-dd hh:nn:ss")
    + partition(
        "DimProduct",
        [("ProductKey", "Int64.Type"), ("RetailerKey", "Int64.Type"), ("ProductName", "type text"),
         ("Category", "type text"), ("SourceUrl", "type text"), ("FirstSeen", "type datetime")],
        '\t\t\t\t    Cleaned = Table.ReplaceValue(Headers, "", null, Replacer.ReplaceValue, '
        '{"SourceUrl", "FirstSeen"}),\n',
    ),
)

w(
    "DimDate",
    "table DimDate\n\tdataCategory: Time\n\n"
    + col("DateKey", "int64", hidden=True, key=True)
    + col("Date", "dateTime", fmt="yyyy-mm-dd")
    + col("Year", "int64", fmt="0")
    + col("MonthNumber", "int64", hidden=True, fmt="0")
    + col("MonthName", "string", sort="MonthNumber")
    + col("YearMonth", "string")
    + col("Day", "int64", fmt="0")
    + col("DayName", "string")
    + partition(
        "DimDate",
        [("DateKey", "Int64.Type"), ("Date", "type date"), ("Year", "Int64.Type"),
         ("MonthNumber", "Int64.Type"), ("MonthName", "type text"), ("YearMonth", "type text"),
         ("Day", "Int64.Type"), ("DayName", "type text")],
        "\t\t\t\t    Cleaned = Headers,\n",
    ),
)

BOOL_FMT = '"TRUE";;"FALSE"'

cols = (
    col("ObservationKey", "int64", hidden=True, key=True)
    + col("ProductKey", "int64", hidden=True)
    + col("RetailerKey", "int64", hidden=True)
    + col("DateKey", "int64", hidden=True)
    + col("ScrapedAt", "dateTime", fmt="yyyy-mm-dd hh:nn:ss")
    + col("CurrentPrice", "double", fmt="#,0.00",
          desc="Blank when the scraped value failed validation. See SuspectReason.")
    + col("OriginalPrice", "double", fmt="#,0.00")
    + col("DiscountPercent", "double", fmt="#,0.0")
    + col("Currency", "string", hidden=True)
    + col("IsSuspectPrice", "boolean", fmt=BOOL_FMT)
    + col("SuspectReason", "string", desc="Why a price was rejected. Blank for good rows.")
    + col("HasOriginalPrice", "boolean", fmt=BOOL_FMT, hidden=True)
    + col("HasDiscount", "boolean", fmt=BOOL_FMT, hidden=True)
    + col("IsLatest", "boolean", fmt=BOOL_FMT, hidden=True,
          desc="Exactly one row per product: its most recent observation.")
)

measures = (
    measure("Observations", f"COUNTROWS('{F}')", "#,0", "Scraped price rows in the current context.")
    + measure("Products Tracked", f"DISTINCTCOUNT('{F}'[ProductKey])", "#,0", "Distinct products observed.")
    + measure("Retailers Covered", f"DISTINCTCOUNT('{F}'[RetailerKey])", "#,0", "Distinct marketplaces observed.")
    + measure("Days With Data", f"DISTINCTCOUNT('{F}'[DateKey])", "#,0",
              "Distinct scrape days. This is the ceiling on any trend analysis.")
    + measure("Median Price", f"MEDIAN('{F}'[CurrentPrice])", '#,0 "BDT"',
              "Median validated price. Suspect rows are blank, so they drop out.")
    + measure("Average Price", f"AVERAGE('{F}'[CurrentPrice])", '#,0 "BDT"',
              "Mean validated price. Read next to the median to see the skew.")
    + measure("P90 Price", f"PERCENTILEX.INC('{F}', '{F}'[CurrentPrice], 0.9)", '#,0 "BDT"',
              "The premium end of the assortment.")
    + measure("Current Median Price", f"CALCULATE([Median Price], '{F}'[IsLatest] = TRUE())", '#,0 "BDT"',
              "Median across the most recent observation of each product only.")
    + measure("Discount Coverage %",
              f"DIVIDE(CALCULATE([Observations], '{F}'[HasDiscount] = TRUE()), [Observations])", "0.0%",
              "Share of observations advertising a discount.")
    + measure("Average Discount Depth %", f"AVERAGE('{F}'[DiscountPercent])", "0.0",
              "Mean advertised discount across discounted rows only.")
    + measure("Deep Discount Share %",
              f"DIVIDE(CALCULATE([Observations], '{F}'[DiscountPercent] >= 30), "
              f"CALCULATE([Observations], '{F}'[HasDiscount] = TRUE()))", "0.0%",
              "Of discounted rows, the share at 30 percent off or deeper.")
    + measure("Suspect Observations", f"CALCULATE([Observations], '{F}'[IsSuspectPrice] = TRUE())", "#,0",
              "Rows whose scraped price failed validation.")
    + measure("Suspect Price Rate %", "DIVIDE([Suspect Observations], [Observations])", "0.0%",
              "Pipeline health. Concentrated in one retailer, this points at a selector bug.")
    + measure("Original Price Coverage %",
              f"DIVIDE(CALCULATE([Observations], '{F}'[HasOriginalPrice] = TRUE()), [Observations])", "0.0%",
              "Share of rows where a was-price was captured.")
    + measure("Unclassified Product Share %",
              'DIVIDE(CALCULATE(DISTINCTCOUNT(DimProduct[ProductKey]), DimProduct[Category] = "Unclassified"), '
              "DISTINCTCOUNT(DimProduct[ProductKey]))", "0.0%",
              "How much of the catalogue the keyword classifier does not reach.")
)

fact_types = [
    ("ObservationKey", "Int64.Type"), ("ProductKey", "Int64.Type"), ("RetailerKey", "Int64.Type"),
    ("DateKey", "Int64.Type"), ("ScrapedAt", "type datetime"), ("CurrentPrice", "type number"),
    ("OriginalPrice", "type number"), ("DiscountPercent", "type number"), ("Currency", "type text"),
    ("IsSuspectPrice", "type logical"), ("SuspectReason", "type text"),
    ("HasOriginalPrice", "type logical"), ("HasDiscount", "type logical"), ("IsLatest", "type logical"),
]
fact_cleaned = (
    '\t\t\t\t    Cleaned = Table.ReplaceValue(Headers, "", null, Replacer.ReplaceValue, '
    '{"CurrentPrice", "OriginalPrice", "DiscountPercent", "Currency", "SuspectReason"}),\n'
)

w(F, f"table {F}\n\n" + cols + measures + partition(F, fact_types, fact_cleaned))
print("done")
