"""
Generate the PBIR report layer: four pages of visuals bound to the semantic
model.

Run from this folder:  python _gen_report.py
Then:                  python _check_model.py

Every file this writes is validated against Microsoft's published Fabric JSON
schemas by _validate_schemas.py, and every field binding is checked against the
TMDL by _check_model.py. Hand-editing the generated JSON is fine, but it is
easier to change the layout here.

Layout is on a fixed 1280x720 canvas with a 16px gutter and a 16px gap, so the
column arithmetic below is the only place sizes are decided.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent
REPORT = ROOT / "PaysimFraud.Report"
PAGES = REPORT / "definition/pages"

FACT = "FactTransaction"

SCHEMA = "https://developer.microsoft.com/json-schemas/fabric/item/report/definition"
S_REPORT = f"{SCHEMA}/report/1.0.0/schema.json"
S_PAGE = f"{SCHEMA}/page/1.0.0/schema.json"
S_PAGES = f"{SCHEMA}/pagesMetadata/1.0.0/schema.json"
S_VISUAL = f"{SCHEMA}/visualContainer/1.0.0/schema.json"

W, H = 1280, 720
PAD = 16          # outer gutter and inter-visual gap
HEAD_H = 52       # page header strip
CARD_H = 96


def cols(n: int, *, gutter: int = PAD) -> list[tuple[int, int]]:
    """n equal columns across the canvas; returns (x, width) for each."""
    usable = W - gutter * 2 - PAD * (n - 1)
    w = usable // n
    return [(gutter + i * (w + PAD), w) for i in range(n)]


# --------------------------------------------------------------------------
# Field and formatting helpers
# --------------------------------------------------------------------------

def lit(value) -> dict:
    """A Power BI literal expression. Text literals are single-quoted, and a
    literal apostrophe is doubled -- the same escaping rule as DAX."""
    if isinstance(value, bool):
        return {"expr": {"Literal": {"Value": "true" if value else "false"}}}
    if isinstance(value, (int, float)):
        return {"expr": {"Literal": {"Value": f"{value}D"}}}
    return {"expr": {"Literal": {"Value": "'" + str(value).replace("'", "''") + "'"}}}


def msr(name: str, table: str = FACT) -> dict:
    return {"Measure": {"Expression": {"SourceRef": {"Entity": table}},
                        "Property": name}}


def colf(table: str, name: str) -> dict:
    return {"Column": {"Expression": {"SourceRef": {"Entity": table}},
                       "Property": name}}


def proj(field: dict, table: str, name: str, *, display: str | None = None) -> dict:
    p = {"field": field, "queryRef": f"{table}.{name}", "nativeQueryRef": name}
    if display:
        p["displayName"] = display
    return p


def container(title: str | None, subtitle: str | None = None) -> dict:
    """Title and subtitle on the visual container.

    The narrative of this report lives in these two strings. A chart whose
    title states the finding is worth more than one labelled with its own
    field names.
    """
    out: dict = {}
    if title:
        out["title"] = [{"properties": {
            "show": lit(True), "text": lit(title),
            "fontSize": lit(12), "bold": lit(True),
        }}]
    if subtitle:
        out["subTitle"] = [{"properties": {
            "show": lit(True), "text": lit(subtitle), "fontSize": lit(9),
        }}]
    return out


def visual(name: str, box: tuple[int, int, int, int], vtype: str, *,
           roles: dict | None = None, title: str | None = None,
           subtitle: str | None = None, objects: dict | None = None,
           sort: list[dict] | None = None, z: int = 0) -> dict:
    x, y, w, h = box
    v: dict = {"visualType": vtype}
    if roles:
        q: dict = {"queryState": {r: {"projections": p} for r, p in roles.items()}}
        if sort:
            q["sortDefinition"] = {"sort": sort}
        v["query"] = q
    if objects:
        v["objects"] = objects
    cont = container(title, subtitle)
    if cont:
        v["visualContainerObjects"] = cont
    return {
        "$schema": S_VISUAL,
        "name": name,
        "position": {"x": x, "y": y, "z": z, "width": w, "height": h},
        "visual": v,
    }


def textbox(name: str, box: tuple[int, int, int, int], runs: list[tuple[str, dict]],
            *, z: int = 0) -> dict:
    """A textbox. `runs` is a list of (text, style) making up one paragraph each."""
    paragraphs = [
        {"textRuns": [{"value": text, "textStyle": style}]}
        for text, style in runs
    ]
    x, y, w, h = box
    return {
        "$schema": S_VISUAL,
        "name": name,
        "position": {"x": x, "y": y, "z": z, "width": w, "height": h},
        "visual": {
            "visualType": "textbox",
            "objects": {"general": [{"properties": {"paragraphs": paragraphs}}]},
        },
    }


H1 = {"fontSize": "20pt", "fontWeight": "bold", "color": "#1B1B1B"}
H2 = {"fontSize": "10pt", "color": "#555555"}
BODY = {"fontSize": "10pt", "color": "#333333"}
BOLD = {"fontSize": "10pt", "fontWeight": "bold", "color": "#1B1B1B"}


def header(page_no: int, title: str, standfirst: str) -> dict:
    return textbox(f"hdr{page_no}", (PAD, 8, W - PAD * 2, HEAD_H),
                   [(title, H1), (standfirst, H2)])


def card(name: str, box, measure: str, title: str, subtitle: str | None = None,
         table: str = FACT) -> dict:
    return visual(name, box, "card",
                  roles={"Values": [proj(msr(measure, table), table, measure)]},
                  title=title, subtitle=subtitle)


def bar_or_col(name, box, vtype, cat_table, cat_col, measures, title,
               subtitle=None, sort=None, series=None):
    roles = {
        "Category": [proj(colf(cat_table, cat_col), cat_table, cat_col)],
        "Y": [proj(msr(m), FACT, m) for m in measures],
    }
    if series:
        st, sc = series
        roles["Series"] = [proj(colf(st, sc), st, sc)]
    return visual(name, box, vtype, roles=roles, title=title, subtitle=subtitle,
                  sort=sort)


def desc(field: dict) -> list[dict]:
    return [{"field": field, "direction": "Descending"}]


def asc(field: dict) -> list[dict]:
    return [{"field": field, "direction": "Ascending"}]


# ==========================================================================
# Page 1 -- scale and shape
# ==========================================================================

c4 = cols(4)
c2 = cols(2)
c3 = cols(3)
ROW1_Y = 8 + HEAD_H + PAD                      # 76
ROW2_Y = ROW1_Y + CARD_H + PAD                 # 188
ROW2_H = 240
ROW3_Y = ROW2_Y + ROW2_H + PAD                 # 444
ROW3_H = H - ROW3_Y - PAD                      # 260

p1 = [
    header(1, "Mobile money fraud: scale and shape",
           "6.36M simulated transactions over 31 days. 0.129% are fraudulent, "
           "and they are not spread evenly across type, size or hour."),
    card("p1c1", (c4[0][0], ROW1_Y, c4[0][1], CARD_H), "Transactions",
         "Transactions", "One row is one transaction leg"),
    card("p1c2", (c4[1][0], ROW1_Y, c4[1][1], CARD_H), "Fraud Legs",
         "Fraudulent legs", "Labelled fraud in the source data"),
    card("p1c3", (c4[2][0], ROW1_Y, c4[2][1], CARD_H), "Fraud Rate %",
         "Fraud rate", "Share of all legs"),
    card("p1c4", (c4[3][0], ROW1_Y, c4[3][1], CARD_H), "Fraud Exposure",
         "Exposure", "Transfer leg only, so the money is counted once"),
    bar_or_col("p1v1", (c2[0][0], ROW2_Y, c2[0][1], ROW2_H), "clusteredColumnChart",
               "DimTransactionType", "TypeName", ["Transactions"],
               "Volume is dominated by payments and cash-outs",
               "All five transaction types", sort=desc(msr("Transactions"))),
    bar_or_col("p1v2", (c2[1][0], ROW2_Y, c2[1][1], ROW2_H), "clusteredColumnChart",
               "DimTransactionType", "TypeName", ["Fraud Rate %"],
               "Fraud appears in only two of the five types",
               "Transfers and cash-outs. Payments, debits and cash-ins: zero",
               sort=desc(msr("Fraud Rate %"))),
    bar_or_col("p1v3", (c2[0][0], ROW3_Y, c2[0][1], ROW3_H), "lineChart",
               "DimStep", "SimHour", ["Fraud Rate %"],
               "Fraud rate peaks 400x in the quiet hours",
               "Fraud volume holds steady around the clock while legitimate "
               "volume collapses overnight", sort=asc(colf("DimStep", "SimHour"))),
    bar_or_col("p1v4", (c2[1][0], ROW3_Y, c2[1][1], ROW3_H), "clusteredBarChart",
               "DimAmountBand", "AmountBand", ["Fraud Rate %"],
               "The bigger the transfer, the likelier it is fraud",
               "Fraud rate climbs from 0.02% under 10K to 5% above 10M",
               sort=asc(colf("DimAmountBand", "BandSortOrder"))),
]

# ==========================================================================
# Page 2 -- the detection rule the data already carries
# ==========================================================================

R1 = ROW1_Y                                    # bank rule cards
R2 = R1 + CARD_H + PAD                         # drain rule cards
R3 = R2 + CARD_H + PAD                         # charts
R3_H = 196
R4 = R3 + R3_H + PAD
R4_H = H - R4 - PAD

p2 = [
    header(2, "The rule in place catches 16 of 8,213",
           "isFlaggedFraud never once fires on a legitimate transaction -- but it "
           "almost never fires at all. One derived feature does far better."),
    card("p2c1", (c4[0][0], R1, c4[0][1], CARD_H), "Fraud Caught",
         "Caught by the bank rule", "True positives"),
    card("p2c2", (c4[1][0], R1, c4[1][1], CARD_H), "Fraud Missed",
         "Missed by the bank rule", "False negatives"),
    card("p2c3", (c4[2][0], R1, c4[2][1], CARD_H), "Bank Rule Recall %",
         "Bank rule recall", "Share of all fraud it stops"),
    card("p2c4", (c4[3][0], R1, c4[3][1], CARD_H), "Value Missed",
         "Value it let through", "Amount on the fraud legs it did not stop"),
    card("p2c5", (c4[0][0], R2, c4[0][1], CARD_H), "Drain Rule Caught",
         "Caught by the drain rule", "Amount equals the whole opening balance"),
    card("p2c6", (c4[1][0], R2, c4[1][1], CARD_H), "Drain Rule False Alarms",
         "Its false alarms", "Legitimate transactions it would flag"),
    card("p2c7", (c4[2][0], R2, c4[2][1], CARD_H), "Drain Rule Recall %",
         "Drain rule recall", "Share of all fraud it would stop"),
    card("p2c8", (c4[3][0], R2, c4[3][1], CARD_H), "Recall Lift vs Bank Rule",
         "Recall lift", "In-sample: scored on the labels that defined it"),
    # A matrix, not a bar chart: these four numbers span six orders of
    # magnitude (6,354,407 against 16) and no linear axis can show them
    # together. This is also the canonical shape for a confusion matrix.
    visual("p2v1", (c2[0][0], R3, c2[0][1], R3_H), "pivotTable",
           roles={
               "Rows": [proj(colf("DimDetectionOutcome", "WasFraud"),
                             "DimDetectionOutcome", "WasFraud",
                             display="Was fraud")],
               "Columns": [proj(colf("DimDetectionOutcome", "AlertRaised"),
                                "DimDetectionOutcome", "AlertRaised",
                                display="Alert raised")],
               "Values": [proj(msr("Transactions"), FACT, "Transactions")],
           },
           title="Confusion matrix for the rule already in place",
           subtitle="The top-right cell is zero: it never fired on a "
                    "legitimate transaction"),
    visual("p2v2", (c2[1][0], R3, c2[1][1], R3_H), "tableEx",
           roles={"Values": [
               proj(msr("Bank Rule Recall %"), FACT, "Bank Rule Recall %"),
               proj(msr("Bank Rule Precision %"), FACT, "Bank Rule Precision %"),
               proj(msr("Drain Rule Recall %"), FACT, "Drain Rule Recall %"),
               proj(msr("Drain Rule Precision %"), FACT, "Drain Rule Precision %"),
               proj(msr("Alerts per Day"), FACT, "Alerts per Day"),
               proj(msr("Exposure Detected %"), FACT, "Exposure Detected %"),
           ]},
           title="Both rules, side by side",
           subtitle="Precision holds at 100% for both. Only recall moves."),
    textbox("p2t1", (c2[0][0], R4, c2[0][1], R4_H), [
        ("The feature", BOLD),
        ("A fraudulent transfer moves an amount exactly equal to the origin "
         "account's opening balance, to the cent. The account is emptied in one "
         "move.", BODY),
        ("It holds on 8,034 of 8,213 fraud legs and on 1 of 6,354,407 "
         "legitimate ones -- a 63.99 payment to a merchant that left 0.01 "
         "behind, which the rule excludes by only considering money out to a "
         "customer account.", BODY),
        ("Caveat: this rule was derived from the same labels it is scored "
         "against, so the figures above are in-sample. On real data it would "
         "need validating on a held-out period before anyone relied on it.",
         H2),
    ]),
    bar_or_col("p2v3", (c2[1][0], R4, c2[1][1], R4_H), "clusteredColumnChart",
               "DimTransactionType", "TypeName",
               ["Drain Rule Alerts", "Drain Rule Caught"],
               "The drain rule only ever fires on transfers and cash-outs",
               "Alerts raised against alerts that were really fraud",
               sort=desc(msr("Drain Rule Alerts"))),
]

# ==========================================================================
# Page 3 -- what the fraud actually does
# ==========================================================================

p3 = [
    header(3, "Anatomy of a fraudulent transfer",
           "Each fraud is committed twice -- once as a transfer out of the victim, "
           "once as a cash-out of the same amount. Counting both doubles the money."),
    card("p3c1", (c4[0][0], ROW1_Y, c4[0][1], CARD_H), "Fraud Events",
         "Fraud events", "Counted once, on the transfer leg"),
    card("p3c2", (c4[1][0], ROW1_Y, c4[1][1], CARD_H), "Fraud Exposure",
         "Exposure", "The number to quote"),
    card("p3c3", (c4[2][0], ROW1_Y, c4[2][1], CARD_H), "Fraud Leg Value",
         "Naive sum over fraud rows", "What SUM of amount gives you"),
    card("p3c4", (c4[3][0], ROW1_Y, c4[3][1], CARD_H), "Leg Double Count %",
         "Double counted", "Share of the naive sum that is the same money twice"),
    bar_or_col("p3v1", (c3[0][0], ROW2_Y, c3[0][1], ROW2_H), "clusteredColumnChart",
               "DimTransactionType", "TypeName", ["Fraud Legs"],
               "Two legs, near equal counts",
               "4,097 transfers against 4,116 cash-outs",
               sort=desc(msr("Fraud Legs"))),
    bar_or_col("p3v2", (c3[1][0], ROW2_Y, c3[1][1], ROW2_H), "clusteredColumnChart",
               "DimAmountBand", "AmountBand", ["Fraud Legs"],
               "Fraud clusters in the large bands",
               "Where the money is worth taking",
               sort=asc(colf("DimAmountBand", "BandSortOrder"))),
    bar_or_col("p3v3", (c3[2][0], ROW2_Y, c3[2][1], ROW2_H), "donutChart",
               "DimStep", "HourBand", ["Fraud Legs"],
               "Fraud ignores the clock",
               "Split between quiet and active hours"),
    # Columns for legitimate volume, a line on its own axis for fraud volume.
    # Sharing one axis would flatten the fraud series onto zero and hide the
    # very thing the chart exists to show.
    visual("p3v4", (c2[0][0], ROW3_Y, c2[0][1], ROW3_H),
           "lineClusteredColumnComboChart",
           roles={
               "Category": [proj(colf("DimStep", "SimHour"), "DimStep", "SimHour")],
               "Y": [proj(msr("Transactions"), FACT, "Transactions")],
               "Y2": [proj(msr("Fraud Legs"), FACT, "Fraud Legs")],
           },
           sort=asc(colf("DimStep", "SimHour")),
           title="Fraud volume is flat; legitimate volume is not",
           subtitle="Columns: all transactions. Line, right axis: fraud legs. "
                    "That gap is the whole explanation for the rate spike."),
    visual("p3v5", (c2[1][0], ROW3_Y, c2[1][1], ROW3_H), "tableEx",
           roles={"Values": [
               proj(colf("DimTransactionType", "TypeName"),
                    "DimTransactionType", "TypeName"),
               proj(msr("Fraud Legs"), FACT, "Fraud Legs"),
               proj(msr("Fraud Leg Value"), FACT, "Fraud Leg Value"),
               proj(msr("Average Transaction"), FACT, "Average Transaction"),
               proj(msr("Median Transaction"), FACT, "Median Transaction"),
           ]},
           title="Fraud by type, with the amounts it moves",
           subtitle="Mean far above median: a few very large transfers dominate",
           sort=desc(msr("Fraud Legs"))),
]

# ==========================================================================
# Page 4 -- what this data cannot tell you
# ==========================================================================

Q3_H = 240
Q3_Y = ROW2_Y
Q4_Y = Q3_Y + Q3_H + PAD
Q4_H = H - Q4_Y - PAD

p4 = [
    header(4, "What this data cannot tell you",
           "A synthetic dataset with a broken ledger, an uneven duty cycle and "
           "no calendar. Each of those bounds a question you might want to ask."),
    card("p4c1", (c4[0][0], ROW1_Y, c4[0][1], CARD_H), "Ledger Reconciliation %",
         "Rows whose balances add up", "Expected new balance against reported"),
    card("p4c2", (c4[1][0], ROW1_Y, c4[1][1], CARD_H),
         "Destination Balance Absent %", "No destination balance recorded",
         "Zero before and after: structurally missing"),
    card("p4c3", (c4[2][0], ROW1_Y, c4[2][1], CARD_H), "Zero Amount Rows",
         "Transactions that moved nothing", "All 16 are a blocked fraud second leg"),
    card("p4c4", (c4[3][0], ROW1_Y, c4[3][1], CARD_H), "Full Volume Day Share %",
         "Rows on full-volume days", "14 of the 31 simulated days"),
    bar_or_col("p4v1", (c2[0][0], Q3_Y, c2[0][1], Q3_H), "clusteredBarChart",
               "DimTransactionType", "TypeName", ["Ledger Reconciliation %"],
               "The ledger only reconciles on cash-ins",
               "Read the flags, not the balances",
               sort=desc(msr("Ledger Reconciliation %"))),
    bar_or_col("p4v2", (c2[1][0], Q3_Y, c2[1][1], Q3_H), "clusteredColumnChart",
               "DimStep", "DayLabel", ["Transactions"],
               "The simulator does not run at a constant rate",
               "17 of 31 days carry under 60K transactions while full days carry "
               "350K-575K", sort=asc(colf("DimStep", "SimDay"))),
    textbox("p4t1", (PAD, Q4_Y, W - PAD * 2, Q4_H), [
        ("Four limits worth stating out loud", BOLD),
        ("1. It is synthetic. PaySim is an agent-based simulation of a mobile "
         "money network, not a record of anything that happened. Patterns here "
         "are the simulator's, and any of them may be an artefact.", BODY),
        ("2. The ledger does not reconcile. Reading the balance equation in the "
         "direction each type implies, it holds on 41% of rows -- 93% of "
         "cash-ins but 5% of transfers. Balances cannot be audited, so this "
         "model reads the flags instead.", BODY),
        ("3. There is no calendar. The source has an hour counter and nothing "
         "else, so this model has no date table and no dates were invented. "
         "Axes are simulated day and hour, and hour is not a wall-clock time.",
         BODY),
        ("4. Legitimate volume is uneven, fraud injection is not. A fraud rate "
         "by day therefore measures the simulator's duty cycle. Use "
         "IsFullVolumeDay to compare days honestly.", BODY),
    ]),
]

# ==========================================================================
# Write it all out
# ==========================================================================

SPEC = [
    ("01-overview", "Scale and shape", p1),
    ("02-detection", "Detection", p2),
    ("03-anatomy", "Fraud anatomy", p3),
    ("04-data-quality", "Data quality", p4),
]


def write(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8", newline="\n")


if PAGES.exists():
    shutil.rmtree(PAGES)

for page_name, display, visuals in SPEC:
    pdir = PAGES / page_name
    write(pdir / "page.json", {
        "$schema": S_PAGE,
        "name": page_name,
        "displayName": display,
        "displayOption": "FitToPage",
        "height": H,
        "width": W,
    })
    for v in visuals:
        write(pdir / "visuals" / v["name"] / "visual.json", v)
    print(f"  {page_name:16} {len(visuals):>2} visuals")

write(PAGES / "pages.json", {
    "$schema": S_PAGES,
    "pageOrder": [name for name, _, _ in SPEC],
    "activePageName": SPEC[0][0],
})

write(REPORT / "definition/report.json", {
    "$schema": S_REPORT,
    "themeCollection": {"baseTheme": {
        "name": "CY24SU10", "reportVersionAtImport": "5.55",
        "type": "SharedResources",
    }},
    "layoutOptimization": "None",
    "settings": {
        "useStylableVisualContainerHeader": True,
        "defaultFilterActionIsDataFilter": True,
        "useEnhancedTooltips": True,
    },
})

write(REPORT / "definition.pbir", {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/"
               "definitionProperties/1.0.0/schema.json",
    "version": "1.0",
    "datasetReference": {"byPath": {"path": "../PaysimFraud.SemanticModel"}},
})

write(ROOT / "PaysimFraud.pbip", {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/pbip/"
               "pbipProperties/1.0.0/schema.json",
    "version": "1.0",
    "artifacts": [{"report": {"path": "PaysimFraud.Report"}}],
    "settings": {"enableAutoRecovery": True},
})

total = sum(len(v) for _, _, v in SPEC)
print(f"\n{len(SPEC)} pages, {total} visuals")
