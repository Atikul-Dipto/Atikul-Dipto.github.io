"""
Generate the PBIR report layer: four pages of visuals bound to the semantic
model, with a filter rail and page navigation on every page.

Run from this folder:  python _gen_report.py
Then:                  python _check_model.py && python _validate_schemas.py
And:                   powershell -File ../check_tmdl.ps1 ; python ../check_m.py

Layout is a fixed 1280x720 canvas: a 236px rail down the left holding the
title, page navigation and the slicers, and a content area to its right. All
column arithmetic comes out of `cols()`, so sizes are decided in one place.

The four slicers carry a syncGroup each, so a selection made on any page
applies on all four. That is what makes this a dashboard rather than four
unrelated pages, and it is also why the slicers are repeated per page rather
than living on one: Power BI syncs by group name, not by position.

One deliberate interaction worth knowing: selecting a transaction type other
than TRANSFER blanks `Fraud Events`, `Fraud Exposure` and `Exposure Detected`.
Those measures use KEEPFILTERS to count each fraud once on its transfer leg, so
a CASH_OUT context genuinely has no transfer-leg value. A blank is the honest
answer; a number would be one that ignored the filter.
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
PAD = 16
RAIL_W = 236
RAIL_INNER_X = 16
RAIL_INNER_W = RAIL_W - RAIL_INNER_X * 2
CONTENT_X = RAIL_W + PAD
CONTENT_W = W - CONTENT_X - PAD          # 1012

HEAD_Y, HEAD_H = 16, 52
CARD_Y, CARD_H = 84, 92
CARD2_Y = CARD_Y + CARD_H + PAD          # 192

# z-ordering: anything on BACKDROP_Z is a background layer and is allowed to
# sit underneath other visuals. _check_model.py only reports an overlap
# between two visuals on the same z.
BACKDROP_Z = 0
CONTENT_Z = 10

PAGE_BG = "#EEF1F4"
PANEL_BG = "#FFFFFF"
CARD_BG = "#FFFFFF"
BORDER = "#DCE1E6"
INK = "#1B2430"
MUTED = "#5A6572"


def cols(n: int, *, x: int = CONTENT_X, total: int = CONTENT_W) -> list[tuple[int, int]]:
    """n equal columns across the content area; returns (x, width) for each."""
    w = (total - PAD * (n - 1)) // n
    out = [(x + i * (w + PAD), w) for i in range(n)]
    # Give the last column any rounding remainder so the row ends flush.
    last_x, _ = out[-1]
    out[-1] = (last_x, x + total - last_x)
    return out


# --------------------------------------------------------------------------
# Expression and formatting helpers
# --------------------------------------------------------------------------

def lit(value) -> dict:
    """A Power BI literal expression. Text is single-quoted, and a literal
    apostrophe is doubled -- the same escaping rule as DAX."""
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


def card_chrome(*, bg: str = CARD_BG, shadow: bool = True) -> dict:
    """White panel, hairline border, soft shadow. Applied to every content
    visual so the page reads as a set of cards rather than floating charts."""
    out = {
        "background": [{"properties": {"show": lit(True), "color":
                       {"solid": {"color": lit(bg)}}, "transparency": lit(0)}}],
        "border": [{"properties": {"show": lit(True), "color":
                   {"solid": {"color": lit(BORDER)}}, "radius": lit(6)}}],
        "padding": [{"properties": {"top": lit(6), "bottom": lit(6),
                                    "left": lit(8), "right": lit(8)}}],
    }
    if shadow:
        out["dropShadow"] = [{"properties": {
            "show": lit(True), "color": {"solid": {"color": lit("#9AA5B1")}},
            "transparency": lit(80), "shadowBlur": lit(6),
            "shadowDistance": lit(1), "angle": lit(90), "preset": lit("BottomRight"),
        }}]
    return out


def titled(title: str | None, subtitle: str | None = None, **chrome) -> dict:
    """Title and subtitle on the container, over the card chrome.

    The narrative of this report lives in these two strings: a chart whose
    title states the finding is worth more than one labelled with field names.
    """
    out = card_chrome(**chrome)
    if title:
        out["title"] = [{"properties": {
            "show": lit(True), "text": lit(title), "fontSize": lit(11),
            "bold": lit(True), "fontColor": {"solid": {"color": lit(INK)}},
            "titleWrap": lit(True),
        }}]
    if subtitle:
        out["subTitle"] = [{"properties": {
            "show": lit(True), "text": lit(subtitle), "fontSize": lit(9),
            "fontColor": {"solid": {"color": lit(MUTED)}}, "titleWrap": lit(True),
        }}]
    return out


def visual(name: str, box, vtype: str, *, roles: dict | None = None,
           container: dict | None = None, objects: dict | None = None,
           sort: list[dict] | None = None, z: int = CONTENT_Z,
           sync: str | None = None) -> dict:
    x, y, w, h = box
    v: dict = {"visualType": vtype}
    if roles:
        q: dict = {"queryState": {r: {"projections": p} for r, p in roles.items()}}
        if sort:
            q["sortDefinition"] = {"sort": sort}
        v["query"] = q
    if objects:
        v["objects"] = objects
    if container:
        v["visualContainerObjects"] = container
    if sync:
        # Same group name on every page is what makes a selection carry across.
        v["syncGroup"] = {"groupName": sync, "fieldChanges": False,
                          "filterChanges": True}
    return {
        "$schema": S_VISUAL,
        "name": name,
        "position": {"x": x, "y": y, "z": z, "width": w, "height": h},
        "visual": v,
    }


def textbox(name: str, box, runs, *, z: int = CONTENT_Z,
            container: dict | None = None) -> dict:
    paragraphs = [{"textRuns": [{"value": text, "textStyle": style}]}
                  for text, style in runs]
    x, y, w, h = box
    v: dict = {"visualType": "textbox",
               "objects": {"general": [{"properties": {"paragraphs": paragraphs}}]}}
    if container:
        v["visualContainerObjects"] = container
    return {"$schema": S_VISUAL, "name": name,
            "position": {"x": x, "y": y, "z": z, "width": w, "height": h},
            "visual": v}


H1 = {"fontSize": "19pt", "fontWeight": "bold", "color": INK}
STAND = {"fontSize": "9.5pt", "color": MUTED}
BODY = {"fontSize": "9.5pt", "color": "#2B3440"}
BOLD = {"fontSize": "9.5pt", "fontWeight": "bold", "color": INK}
BRAND = {"fontSize": "14pt", "fontWeight": "bold", "color": INK}
BRANDSUB = {"fontSize": "8.5pt", "color": MUTED}


def card(name: str, box, measure: str, title: str, subtitle: str | None = None,
         table: str = FACT) -> dict:
    return visual(name, box, "card",
                  roles={"Values": [proj(msr(measure, table), table, measure)]},
                  container=titled(title, subtitle))


def chart(name, box, vtype, cat, measures, title, subtitle=None, sort=None,
          series=None, roles_extra=None):
    cat_table, cat_col = cat
    roles = {
        "Category": [proj(colf(cat_table, cat_col), cat_table, cat_col)],
        "Y": [proj(msr(m), FACT, m) for m in measures],
    }
    if series:
        roles["Series"] = [proj(colf(series[0], series[1]), series[0], series[1])]
    if roles_extra:
        roles.update(roles_extra)
    return visual(name, box, vtype, roles=roles,
                  container=titled(title, subtitle), sort=sort)


def desc(field: dict) -> list[dict]:
    return [{"field": field, "direction": "Descending"}]


def asc(field: dict) -> list[dict]:
    return [{"field": field, "direction": "Ascending"}]


# --------------------------------------------------------------------------
# The rail: title, navigation, synced slicers. Repeated on every page.
# --------------------------------------------------------------------------

# Heights are chosen so the stack ends clear of the bottom edge: starting at
# SLICER_TOP with SLICER_GAP between them, 104+124+84+84 lands at y=682.
SLICER_TOP = 256
SLICER_GAP = 10
SLICERS = [
    # (suffix, table, column, label, height, sync group)
    ("type", "DimTransactionType", "TypeName", "Transaction type", 104, "syncType"),
    ("band", "DimAmountBand", "AmountBand", "Amount band", 124, "syncBand"),
    ("hour", "DimStep", "HourBand", "Hour of the simulated day", 84, "syncHour"),
    ("days", "DimStep", "IsFullVolumeDay", "Full-volume days only", 84, "syncDays"),
]


def rail(page_no: int) -> list[dict]:
    """The left panel. Identical on every page apart from visual names."""
    out = [
        # A textbox with a background and no text is the panel itself. It sits
        # on BACKDROP_Z so the controls above it are not reported as overlaps.
        textbox(f"rail{page_no}", (0, 0, RAIL_W, H), [(" ", BODY)], z=BACKDROP_Z,
                container={
                    "background": [{"properties": {
                        "show": lit(True),
                        "color": {"solid": {"color": lit(PANEL_BG)}},
                        "transparency": lit(0)}}],
                    "border": [{"properties": {
                        "show": lit(True),
                        "color": {"solid": {"color": lit(BORDER)}},
                        "radius": lit(0)}}],
                }),
        textbox(f"brand{page_no}", (RAIL_INNER_X, 16, RAIL_INNER_W, 64),
                [("Mobile money fraud", BRAND),
                 ("PaySim, 6.36M simulated transactions", BRANDSUB)]),
        # Page navigator populates itself from the report's pages, so it needs
        # no query and stays correct if a page is added or renamed.
        visual(f"nav{page_no}", (RAIL_INNER_X, 92, RAIL_INNER_W, 136),
               "pageNavigator",
               container={"background": [{"properties": {"show": lit(False)}}]}),
        textbox(f"filterlabel{page_no}", (RAIL_INNER_X, 234, RAIL_INNER_W, 22),
                [("FILTERS — apply to every page",
                  {"fontSize": "8pt", "fontWeight": "bold", "color": MUTED})]),
    ]
    y = SLICER_TOP
    for suffix, table, column, label, height, group in SLICERS:
        out.append(visual(
            f"slicer_{suffix}{page_no}", (RAIL_INNER_X, y, RAIL_INNER_W, height),
            "slicer",
            roles={"Values": [proj(colf(table, column), table, column)]},
            container=titled(label, shadow=False),
            sync=group))
        y += height + SLICER_GAP
    assert y - SLICER_GAP <= H - PAD, f"slicer stack overruns the page: {y}"
    return out


def header(page_no: int, title: str, standfirst: str) -> dict:
    return textbox(f"hdr{page_no}", (CONTENT_X, HEAD_Y, CONTENT_W, HEAD_H),
                   [(title, H1), (standfirst, STAND)])


# ==========================================================================
# Page 1 -- scale and shape
# ==========================================================================

c4 = cols(4)
c3 = cols(3)
c2 = cols(2)
R2_Y, R2_H = CARD_Y + CARD_H + PAD, 244            # 192
R3_Y = R2_Y + R2_H + PAD                            # 452
R3_H = H - R3_Y - PAD                                # 252

p1 = rail(1) + [
    header(1, "Scale and shape",
           "6.36M simulated transactions over 31 days. 0.129% are fraudulent, and "
           "they are not spread evenly across type, size or hour."),
    card("p1c1", (c4[0][0], CARD_Y, c4[0][1], CARD_H), "Transactions",
         "Transactions", "One row is one leg"),
    card("p1c2", (c4[1][0], CARD_Y, c4[1][1], CARD_H), "Fraud Legs",
         "Fraudulent legs", "Labelled in the source"),
    card("p1c3", (c4[2][0], CARD_Y, c4[2][1], CARD_H), "Fraud Rate %",
         "Fraud rate", "Share of all legs"),
    card("p1c4", (c4[3][0], CARD_Y, c4[3][1], CARD_H), "Fraud Exposure",
         "Exposure", "Transfer leg only"),
    chart("p1v1", (c2[0][0], R2_Y, c2[0][1], R2_H), "clusteredColumnChart",
          ("DimTransactionType", "TypeName"), ["Transactions"],
          "Volume is dominated by payments and cash-outs",
          "All five transaction types", sort=desc(msr("Transactions"))),
    chart("p1v2", (c2[1][0], R2_Y, c2[1][1], R2_H), "clusteredColumnChart",
          ("DimTransactionType", "TypeName"), ["Fraud Rate %"],
          "Fraud appears in only two of the five types",
          "Transfers and cash-outs. Payments, debits and cash-ins: zero",
          sort=desc(msr("Fraud Rate %"))),
    chart("p1v3", (c2[0][0], R3_Y, c2[0][1], R3_H), "lineChart",
          ("DimStep", "SimHour"), ["Fraud Rate %"],
          "Fraud rate peaks 400x in the quiet hours",
          "Fraud volume holds steady around the clock while legitimate volume "
          "collapses overnight", sort=asc(colf("DimStep", "SimHour"))),
    chart("p1v4", (c2[1][0], R3_Y, c2[1][1], R3_H), "clusteredBarChart",
          ("DimAmountBand", "AmountBand"), ["Fraud Rate %"],
          "The bigger the transfer, the likelier it is fraud",
          "Fraud rate climbs from 0.02% under 10K to 5% above 10M",
          sort=asc(colf("DimAmountBand", "BandSortOrder"))),
]

# ==========================================================================
# Page 2 -- detection
# ==========================================================================

D3_Y, D3_H = CARD2_Y + CARD_H + PAD, 184            # 300
D4_Y = D3_Y + D3_H + PAD                             # 500
D4_H = H - D4_Y - PAD                                # 204

p2 = rail(2) + [
    header(2, "The rule in place catches 16 of 8,213",
           "isFlaggedFraud never fires on a legitimate transaction -- but it almost "
           "never fires at all. One derived feature does far better."),
    card("p2c1", (c4[0][0], CARD_Y, c4[0][1], CARD_H), "Fraud Caught",
         "Caught, bank rule", "True positives"),
    card("p2c2", (c4[1][0], CARD_Y, c4[1][1], CARD_H), "Fraud Missed",
         "Missed, bank rule", "False negatives"),
    card("p2c3", (c4[2][0], CARD_Y, c4[2][1], CARD_H), "Bank Rule Recall %",
         "Bank rule recall", "Share of fraud stopped"),
    card("p2c4", (c4[3][0], CARD_Y, c4[3][1], CARD_H), "Value Missed",
         "Value let through", "On the legs it missed"),
    card("p2c5", (c4[0][0], CARD2_Y, c4[0][1], CARD_H), "Drain Rule Caught",
         "Caught, drain rule", "Amount = opening balance"),
    card("p2c6", (c4[1][0], CARD2_Y, c4[1][1], CARD_H), "Drain Rule False Alarms",
         "Its false alarms", "Legitimate rows flagged"),
    card("p2c7", (c4[2][0], CARD2_Y, c4[2][1], CARD_H), "Drain Rule Recall %",
         "Drain rule recall", "Share of fraud it would stop"),
    card("p2c8", (c4[3][0], CARD2_Y, c4[3][1], CARD_H), "Recall Lift vs Bank Rule",
         "Recall lift", "In-sample: see the note below"),
    # A matrix, not a bar chart: these four numbers span six orders of
    # magnitude (6,354,407 against 16) and no linear axis shows them together.
    visual("p2v1", (c2[0][0], D3_Y, c2[0][1], D3_H), "pivotTable",
           roles={
               "Rows": [proj(colf("DimDetectionOutcome", "WasFraud"),
                             "DimDetectionOutcome", "WasFraud",
                             display="Was fraud")],
               "Columns": [proj(colf("DimDetectionOutcome", "AlertRaised"),
                                "DimDetectionOutcome", "AlertRaised",
                                display="Alert raised")],
               "Values": [proj(msr("Transactions"), FACT, "Transactions")],
           },
           container=titled("Confusion matrix for the rule already in place",
                            "The alert-raised, not-fraud cell is zero")),
    visual("p2v2", (c2[1][0], D3_Y, c2[1][1], D3_H), "tableEx",
           roles={"Values": [
               proj(msr("Bank Rule Recall %"), FACT, "Bank Rule Recall %"),
               proj(msr("Bank Rule Precision %"), FACT, "Bank Rule Precision %"),
               proj(msr("Drain Rule Recall %"), FACT, "Drain Rule Recall %"),
               proj(msr("Drain Rule Precision %"), FACT, "Drain Rule Precision %"),
               proj(msr("Alerts per Day"), FACT, "Alerts per Day"),
               proj(msr("Exposure Detected %"), FACT, "Exposure Detected %"),
           ]},
           container=titled("Both rules, side by side",
                            "Precision holds at 100% for both. Only recall moves.")),
    textbox("p2t1", (c2[0][0], D4_Y, c2[0][1], D4_H), [
        ("The feature", BOLD),
        ("A fraudulent transfer moves an amount exactly equal to the origin "
         "account's opening balance, to the cent. The account is emptied in one "
         "move.", BODY),
        ("It holds on 8,034 of 8,213 fraud legs and 1 of 6,354,407 legitimate "
         "ones -- a 63.99 payment to a merchant that left 0.01 behind, which the "
         "rule excludes by only counting money out to a customer account.", BODY),
        ("In-sample: the rule was derived from the labels it is scored against. "
         "On real data it would need a held-out period before anyone relied on "
         "it.", STAND),
    ], container=card_chrome()),
    chart("p2v3", (c2[1][0], D4_Y, c2[1][1], D4_H), "clusteredColumnChart",
          ("DimTransactionType", "TypeName"),
          ["Drain Rule Alerts", "Drain Rule Caught"],
          "The drain rule only fires on transfers and cash-outs",
          "Alerts raised against alerts that were really fraud",
          sort=desc(msr("Drain Rule Alerts"))),
]

# ==========================================================================
# Page 3 -- fraud anatomy
# ==========================================================================

p3 = rail(3) + [
    header(3, "Anatomy of a fraudulent transfer",
           "Each fraud is committed twice -- once as a transfer out of the victim, "
           "once as a cash-out of the same amount. Counting both doubles the money."),
    card("p3c1", (c4[0][0], CARD_Y, c4[0][1], CARD_H), "Fraud Events",
         "Fraud events", "Counted once, transfer leg"),
    card("p3c2", (c4[1][0], CARD_Y, c4[1][1], CARD_H), "Fraud Exposure",
         "Exposure", "The number to quote"),
    card("p3c3", (c4[2][0], CARD_Y, c4[2][1], CARD_H), "Fraud Leg Value",
         "Naive sum of fraud rows", "What SUM of amount gives"),
    card("p3c4", (c4[3][0], CARD_Y, c4[3][1], CARD_H), "Leg Double Count %",
         "Double counted", "Same money, twice"),
    chart("p3v1", (c3[0][0], R2_Y, c3[0][1], R2_H), "clusteredColumnChart",
          ("DimTransactionType", "TypeName"), ["Fraud Legs"],
          "Two legs, near equal counts", "4,097 transfers, 4,116 cash-outs",
          sort=desc(msr("Fraud Legs"))),
    chart("p3v2", (c3[1][0], R2_Y, c3[1][1], R2_H), "clusteredColumnChart",
          ("DimAmountBand", "AmountBand"), ["Fraud Legs"],
          "Fraud clusters in the large bands", "Where the money is worth taking",
          sort=asc(colf("DimAmountBand", "BandSortOrder"))),
    chart("p3v3", (c3[2][0], R2_Y, c3[2][1], R2_H), "donutChart",
          ("DimStep", "HourBand"), ["Fraud Legs"],
          "Fraud ignores the clock", "Quiet against active hours"),
    # Columns for legitimate volume, a line on its own axis for fraud volume.
    # One shared axis would flatten the fraud series onto zero and hide the
    # very thing the chart exists to show.
    visual("p3v4", (c2[0][0], R3_Y, c2[0][1], R3_H), "lineClusteredColumnComboChart",
           roles={
               "Category": [proj(colf("DimStep", "SimHour"), "DimStep", "SimHour")],
               "Y": [proj(msr("Transactions"), FACT, "Transactions")],
               "Y2": [proj(msr("Fraud Legs"), FACT, "Fraud Legs")],
           },
           sort=asc(colf("DimStep", "SimHour")),
           container=titled("Fraud volume is flat; legitimate volume is not",
                            "Columns: all transactions. Line, right axis: fraud "
                            "legs.")),
    visual("p3v5", (c2[1][0], R3_Y, c2[1][1], R3_H), "tableEx",
           roles={"Values": [
               proj(colf("DimTransactionType", "TypeName"),
                    "DimTransactionType", "TypeName"),
               proj(msr("Fraud Legs"), FACT, "Fraud Legs"),
               proj(msr("Fraud Leg Value"), FACT, "Fraud Leg Value"),
               proj(msr("Average Transaction"), FACT, "Average Transaction"),
               proj(msr("Median Transaction"), FACT, "Median Transaction"),
           ]},
           sort=desc(msr("Fraud Legs")),
           container=titled("Fraud by type, with the amounts it moves",
                            "Mean far above median: a few very large transfers "
                            "dominate")),
]

# ==========================================================================
# Page 4 -- data quality
# ==========================================================================

Q3_H = 236
Q4_Y = R2_Y + Q3_H + PAD                             # 444
Q4_H = H - Q4_Y - PAD                                # 260

p4 = rail(4) + [
    header(4, "What this data cannot tell you",
           "A synthetic dataset with a broken ledger, an uneven duty cycle and no "
           "calendar. Each of those bounds a question you might want to ask."),
    card("p4c1", (c4[0][0], CARD_Y, c4[0][1], CARD_H), "Ledger Reconciliation %",
         "Balances that add up", "Expected against reported"),
    card("p4c2", (c4[1][0], CARD_Y, c4[1][1], CARD_H),
         "Destination Balance Absent %", "No destination balance",
         "Zero before and after"),
    card("p4c3", (c4[2][0], CARD_Y, c4[2][1], CARD_H), "Zero Amount Rows",
         "Moved nothing", "A blocked fraud's second leg"),
    card("p4c4", (c4[3][0], CARD_Y, c4[3][1], CARD_H), "Full Volume Day Share %",
         "Rows on full days", "14 of the 31 simulated days"),
    chart("p4v1", (c2[0][0], R2_Y, c2[0][1], Q3_H), "clusteredBarChart",
          ("DimTransactionType", "TypeName"), ["Ledger Reconciliation %"],
          "The ledger only reconciles on cash-ins",
          "Read the flags, not the balances",
          sort=desc(msr("Ledger Reconciliation %"))),
    chart("p4v2", (c2[1][0], R2_Y, c2[1][1], Q3_H), "clusteredColumnChart",
          ("DimStep", "DayLabel"), ["Transactions"],
          "The simulator does not run at a constant rate",
          "17 of 31 days carry under 60K transactions; full days carry 350K-575K",
          sort=asc(colf("DimStep", "SimDay"))),
    textbox("p4t1", (CONTENT_X, Q4_Y, CONTENT_W, Q4_H), [
        ("Four limits worth stating out loud", BOLD),
        ("1. It is synthetic. PaySim is an agent-based simulation of a mobile "
         "money network, not a record of anything that happened. Patterns here "
         "are the simulator's, and any of them may be an artefact.", BODY),
        ("2. The ledger does not reconcile. Reading the balance equation in the "
         "direction each type implies, it holds on 41% of rows -- 93% of cash-ins "
         "but 5% of transfers. Balances cannot be audited, so this model reads "
         "the flags instead.", BODY),
        ("3. There is no calendar. The source has an hour counter and nothing "
         "else, so this model has no date table and no dates were invented. Axes "
         "are simulated day and hour, and hour is not a wall-clock time.", BODY),
        ("4. Legitimate volume is uneven, fraud injection is not. A fraud rate by "
         "day therefore measures the simulator's duty cycle. The full-volume "
         "filter on the left restricts to the 14 comparable days.", BODY),
    ], container=card_chrome()),
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
        "objects": {
            "background": [{"properties": {
                "color": {"solid": {"color": lit(PAGE_BG)}},
                "transparency": lit(0)}}],
            # The native filter pane stays available alongside the rail: the
            # rail carries the four filters worth reaching for constantly, the
            # pane reaches everything else.
            "outspacePane": [{"properties": {
                "backgroundColor": {"solid": {"color": lit(PANEL_BG)}},
                "foregroundColor": {"solid": {"color": lit(INK)}},
                "borderColor": {"solid": {"color": lit(BORDER)}},
                "border": lit(True),
                "transparency": lit(0),
                "titleSize": lit(11),
                "headerSize": lit(10),
                "width": lit(260)}}],
        },
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
        "allowChangeFilterTypes": True,
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
slicers = len(SLICERS) * len(SPEC)
print(f"\n{len(SPEC)} pages, {total} visuals "
      f"({slicers} slicers in {len(SLICERS)} sync groups)")
