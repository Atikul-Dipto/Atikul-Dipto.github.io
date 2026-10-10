"""
Static checks on the generated TMDL and PBIR, and on their agreement with the
CSVs on disk.

This is not a substitute for opening the project in Power BI Desktop. It is
here because the failures that actually happen -- a column renamed in the
builder but not the model, a measure referring to a measure that no longer
exists, a visual bound to a field that was never defined -- are all catchable
without Desktop, and silently shipping one of them is worse than not shipping.

    python _check_model.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
TABLES = ROOT / "PaysimFraud.SemanticModel/definition/tables"
DEFN = ROOT / "PaysimFraud.SemanticModel/definition"
REPORT = ROOT / "PaysimFraud.Report"
DATA = ROOT / "data"

failures: list[str] = []
checks = 0


def check(ok: bool, name: str, detail: str = "") -> bool:
    global checks
    checks += 1
    if not ok:
        failures.append(f"{name}{(' -- ' + detail) if detail else ''}")
        print(f"  FAIL  {name}" + (f"  {detail}" if detail else ""))
    return ok


# --------------------------------------------------------------------------
# Parse the TMDL we generated
# --------------------------------------------------------------------------

tables: dict[str, dict] = {}
for path in sorted(TABLES.glob("*.tmdl")):
    text = path.read_text(encoding="utf-8")
    name = re.match(r"table (\S+)", text).group(1)
    t = {
        "columns": re.findall(r"^\tcolumn (\S+)", text, re.M),
        "measures": re.findall(r"^\tmeasure '([^']+)'", text, re.M),
        "sorts": re.findall(r"^\tcolumn (\S+)[\s\S]*?^\t\tsortByColumn: (\S+)", text, re.M),
        "text": text,
        "file": path.name,
    }
    # column -> sortByColumn, parsed per block rather than with one greedy regex
    t["sorts"] = []
    current = None
    for line in text.splitlines():
        m = re.match(r"\tcolumn (\S+)", line)
        if m:
            current = m.group(1)
        m = re.match(r"\t\tsortByColumn: (\S+)", line)
        if m:
            t["sorts"].append((current, m.group(1)))
    tables[name] = t

all_measures = {m for t in tables.values() for m in t["measures"]}
all_columns = {(tn, c) for tn, t in tables.items() for c in t["columns"]}

print(f"Parsed {len(tables)} tables, {len(all_columns)} columns, "
      f"{len(all_measures)} measures\n")

print("-- model structure --")
check(len(tables) == 5, "five tables", str(sorted(tables)))
for t in ("FactTransaction", "DimStep", "DimTransactionType", "DimAmountBand",
          "DimDetectionOutcome"):
    check(t in tables, f"table {t} exists")
check(len(all_measures) == 38, "38 measures", str(len(all_measures)))
check(len(all_measures) == sum(len(t["measures"]) for t in tables.values()),
      "no duplicate measure names across tables")

print("\n-- every column sorted by a column that exists, and not by itself --")
for tn, t in tables.items():
    for colname, target in t["sorts"]:
        check(target != colname, f"{tn}[{colname}] not sorted by itself")
        check(target in t["columns"], f"{tn}[{colname}] sorts by existing {target}")

print("\n-- DAX references resolve --")
# Measure references: [Name]. Column references: 'Table'[Col] or Table[Col].
MEASURE_LINE = re.compile(r"^\tmeasure '([^']+)' = (.*)$", re.M)
for tn, t in tables.items():
    for mname, expr in MEASURE_LINE.findall(t["text"]):
        for tbl, col in re.findall(r"'([^']+)'\[([^\]]+)\]|\b([A-Za-z_]\w*)\[([^\]]+)\]",
                                   expr) and []:
            pass
        # qualified column refs
        for m in re.finditer(r"(?:'([^']+)'|\b([A-Z]\w*))\[([^\]]+)\]", expr):
            tbl = m.group(1) or m.group(2)
            col = m.group(3)
            check((tbl, col) in all_columns,
                  f"{mname}: '{tbl}'[{col}] exists",
                  f"in {t['file']}")
        # bare measure refs: [Name] not preceded by a table or quote
        for m in re.finditer(r"(?<![\w'\]])\[([^\]]+)\]", expr):
            ref = m.group(1)
            check(ref in all_measures, f"{mname}: measure [{ref}] exists")
        check(expr.count("(") == expr.count(")"),
              f"{mname}: balanced parentheses", expr[:70])
        check(expr.count("[") == expr.count("]"), f"{mname}: balanced brackets")
        check(expr.count('"') % 2 == 0, f"{mname}: balanced double quotes")

print("\n-- string literals in DAX match real dimension values --")
dim_values: dict[tuple[str, str], set[str]] = {}
import csv as _csv
for tn in tables:
    p = DATA / f"{tn}.csv"
    if not p.exists() or tn == "FactTransaction":
        continue
    with p.open(encoding="utf-8", newline="") as fh:
        rows = list(_csv.DictReader(fh))
    for cname in rows[0]:
        dim_values[(tn, cname)] = {r[cname] for r in rows}
for tn, t in tables.items():
    for mname, expr in MEASURE_LINE.findall(t["text"]):
        for m in re.finditer(r"(?:'([^']+)'|\b([A-Z]\w*))\[([^\]]+)\]\s*=\s*\"([^\"]+)\"",
                             expr):
            tbl, col, val = (m.group(1) or m.group(2)), m.group(3), m.group(4)
            vals = dim_values.get((tbl, col))
            if vals is not None:
                check(val in vals, f"{mname}: {tbl}[{col}] = \"{val}\" is a real value",
                      f"actual: {sorted(vals)[:6]}")

print("\n-- TMDL value quoting and description placement --")
# Both of these made Power BI Desktop reject an entire model outright.
# check_tmdl.ps1 proves the real parser accepts the files; these two rules
# catch the specific mistakes without needing PowerShell.
for path in sorted(DEFN.rglob("*.tmdl")):
    tmdl_lines = path.read_text(encoding="utf-8").splitlines()
    for idx, line in enumerate(tmdl_lines):
        m = re.match(r"\s*(\w+):\s*(\S.*)$", line)
        if m and m.group(2).startswith('"'):
            value = m.group(2)
            # A leading quote makes TMDL read the value as an escaped quoted
            # string: it must open and close with a quote and double every
            # inner one. 'formatString: "TRUE";;"FALSE"' does not, and is
            # fatal to the whole model.
            inner = value[1:-1] if len(value) >= 2 else value
            ok = (len(value) >= 2 and value.endswith('"')
                  and '"' not in inner.replace('""', ""))
            check(ok, f"{path.name}:{idx + 1} `{m.group(1)}` value is a "
                      f"correctly escaped TMDL string", line.strip())
        if line.strip().startswith("///"):
            nxt = next((x for x in tmdl_lines[idx + 1:]
                        if not x.strip().startswith("///")), "")
            check(not re.match(r"\s*relationship\b", nxt),
                  f"{path.name}:{idx + 1} description is not attached to a "
                  f"relationship (relationships have no Description property)")

print("\n-- relationships --")
rel_text = (DEFN / "relationships.tmdl").read_text(encoding="utf-8")
rels = re.findall(r"relationship (\S+)\n\tfromColumn: (\S+)\.(\S+)\n\ttoColumn: (\S+)\.(\S+)",
                  rel_text)
check(len(rels) == 4, "four relationships", str(len(rels)))
seen_pairs = set()
for rname, ft, fc, tt, tc in rels:
    check((ft, fc) in all_columns, f"{rname}: from {ft}[{fc}] exists")
    check((tt, tc) in all_columns, f"{rname}: to {tt}[{tc}] exists")
    check(ft == "FactTransaction", f"{rname}: many side is the fact")
    pair = tuple(sorted((ft, tt)))
    check(pair not in seen_pairs, f"{rname}: only one path between {ft} and {tt}")
    seen_pairs.add(pair)
    # the key must actually be unique on the dimension side
    p = DATA / f"{tt}.csv"
    if p.exists():
        with p.open(encoding="utf-8", newline="") as fh:
            vals = [r[tc] for r in _csv.DictReader(fh)]
        check(len(vals) == len(set(vals)), f"{rname}: {tt}[{tc}] is unique in the CSV")

print("\n-- each partition's column list matches its CSV header exactly --")
for tn, t in tables.items():
    m = re.search(r"Table\.TransformColumnTypes\(Headers, \{(.+?)\}\),", t["text"])
    check(m is not None, f"{tn}: partition has a type transform")
    if not m:
        continue
    declared = re.findall(r'\{"([^"]+)",', m.group(1))
    p = DATA / f"{tn}.csv"
    if not check(p.exists(), f"{tn}.csv exists"):
        continue
    header = p.open(encoding="utf-8").readline().strip().split(",")
    check(declared == header, f"{tn}: declared columns == CSV header",
          f"\n      declared {declared}\n      header   {header}")
    check(set(t["columns"]) == set(header),
          f"{tn}: model columns == CSV header",
          f"model-only {sorted(set(t['columns']) - set(header))}, "
          f"csv-only {sorted(set(header) - set(t['columns']))}")
    # Columns = N must match, when declared
    ncols = re.search(r"Columns = (\d+)", t["text"])
    if ncols:
        check(int(ncols.group(1)) == len(header),
              f"{tn}: Columns = {ncols.group(1)} matches {len(header)} CSV columns")
    # QuoteStyle.None is only safe if the CSV has no quote characters
    if "QuoteStyle.None" in t["text"]:
        sample = p.open(encoding="utf-8").read(400_000)
        check('"' not in sample, f"{tn}: QuoteStyle.None and no quotes in the data")

print("\n-- Logical.From applied to exactly the boolean columns --")
for tn, t in tables.items():
    declared_bool = set(re.findall(
        r"\tcolumn (\S+)\n\t\tdataType: boolean", t["text"]))
    converted = set(re.findall(r'\{"([^"]+)", Logical\.From', t["text"]))
    check(declared_bool == converted,
          f"{tn}: boolean columns == Logical.From columns",
          f"boolean {sorted(declared_bool)} vs converted {sorted(converted)}")

print("\n-- JSON files parse and declare their schema --")
json_files = sorted(ROOT.rglob("*.pbip")) + sorted(ROOT.rglob("*.pbism")) \
    + sorted(ROOT.rglob("*.pbir")) + sorted(REPORT.rglob("*.json"))
for p in json_files:
    try:
        obj = json.loads(p.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        check(False, f"{p.relative_to(ROOT)} parses", str(e))
        continue
    check(isinstance(obj, dict) and "$schema" in obj,
          f"{p.relative_to(ROOT)} declares $schema")

print("\n-- report visuals bind only to fields that exist --")
bound = 0
for p in sorted(REPORT.rglob("visual.json")):
    obj = json.loads(p.read_text(encoding="utf-8"))
    vis = obj.get("visual", {})
    for role, state in (vis.get("query", {}).get("queryState", {}) or {}).items():
        for proj in state.get("projections", []):
            field = proj["field"]
            kind = next(k for k in field if k in
                        ("Measure", "Column", "Aggregation", "Literal"))
            if kind in ("Measure", "Column"):
                entity = field[kind]["Expression"]["SourceRef"]["Entity"]
                prop = field[kind]["Property"]
                bound += 1
                if kind == "Measure":
                    check(prop in all_measures,
                          f"{p.parent.name}/{role}: measure [{prop}] exists")
                else:
                    check((entity, prop) in all_columns,
                          f"{p.parent.name}/{role}: {entity}[{prop}] exists")
            elif kind == "Aggregation":
                inner = field["Aggregation"]["Expression"]["Column"]
                entity = inner["Expression"]["SourceRef"]["Entity"]
                bound += 1
                check((entity, inner["Property"]) in all_columns,
                      f"{p.parent.name}/{role}: {entity}[{inner['Property']}] exists")
print(f"  checked {bound} field bindings")

print("\n-- report pages are wired up --")
pages_dir = REPORT / "definition/pages"
if pages_dir.exists():
    page_dirs = sorted(d.name for d in pages_dir.iterdir() if d.is_dir())
    meta = json.loads((pages_dir / "pages.json").read_text(encoding="utf-8"))
    check(sorted(meta.get("pageOrder", [])) == page_dirs,
          "pageOrder lists every page folder",
          f"order {meta.get('pageOrder')} vs folders {page_dirs}")
    check(meta.get("activePageName") in page_dirs, "activePageName is a real page")
    for d in sorted(pages_dir.iterdir()):
        if not d.is_dir():
            continue
        page = json.loads((d / "page.json").read_text(encoding="utf-8"))
        check(page["name"] == d.name, f"{d.name}: page name matches its folder")
        names, boxes = [], []
        for v in sorted(d.glob("visuals/*/visual.json")):
            vo = json.loads(v.read_text(encoding="utf-8"))
            check(vo["name"] == v.parent.name,
                  f"{d.name}/{v.parent.name}: visual name matches its folder")
            names.append(vo["name"])
            pos = vo["position"]
            boxes.append((vo["name"], pos["x"], pos["y"], pos["width"], pos["height"]))
            check(pos["x"] >= 0 and pos["y"] >= 0, f"{v.parent.name}: on-canvas origin")
            check(pos["x"] + pos["width"] <= page.get("width", 1280) + 0.5
                  and pos["y"] + pos["height"] <= page.get("height", 720) + 0.5,
                  f"{d.name}/{vo['name']}: fits the page",
                  f"{pos} vs {page.get('width')}x{page.get('height')}")
        check(len(names) == len(set(names)), f"{d.name}: visual names unique")
        # overlap detection: two visuals stacked on top of each other is
        # invisible in JSON and obvious on screen, so catch it here
        for i in range(len(boxes)):
            for j in range(i + 1, len(boxes)):
                n1, x1, y1, w1, h1 = boxes[i]
                n2, x2, y2, w2, h2 = boxes[j]
                overlap = (x1 < x2 + w2 and x2 < x1 + w1
                           and y1 < y2 + h2 and y2 < y1 + h1)
                check(not overlap, f"{d.name}: {n1} and {n2} do not overlap",
                      f"{(x1, y1, w1, h1)} vs {(x2, y2, w2, h2)}")
else:
    print("  (no report pages yet)")

print(f"\n{checks} checks, {len(failures)} failed")
if failures:
    print("\nFAILURES:")
    for f in failures:
        print("  -", f)
sys.exit(1 if failures else 0)
