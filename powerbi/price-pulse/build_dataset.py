"""
Build a star-schema CSV export from the Price Pulse scraper database.

Source: ecommerce-price-tracker/data/pricetracker.db (SQLite, written by the
Selenium pipeline). Output: four CSVs under ./data that Power BI imports.

Run it again after every scrape; the model picks up the new rows with a
refresh. Nothing here invents data — rows that cannot be parsed are kept and
flagged so the dashboard can report on them rather than quietly hiding them.

    python build_dataset.py
"""

from __future__ import annotations

import csv
import re
import sqlite3
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DB = ROOT.parent.parent / "ecommerce-price-tracker" / "data" / "pricetracker.db"
OUT = ROOT / "data"

# Retailer display names. The scraper stores lowercase keys.
RETAILERS = {
    "daraz": "Daraz",
    "shwapno": "Shwapno",
    "othoba": "Othoba",
    "startech": "Star Tech",
    "pickaboo": "Pickaboo",
    "cartup": "Cartup",
    "packly": "Packly",
    "chaldal": "Chaldal",
}

# Ceiling for a plausible consumer retail price in BDT. The top of the real
# range here is Pickaboo laptops around 200k, so 500k leaves generous headroom
# while still catching the concatenation defect described below.
SUSPECT_ABOVE = 500_000
SUSPECT_BELOW = 5
# A sale price many times its own "original" is internally inconsistent.
SUSPECT_RATIO = 20

# Keyword categories. Deliberately conservative: anything that does not match
# stays Unclassified, and the dashboard reports that share rather than
# pretending the classification is complete.
CATEGORY_RULES: list[tuple[str, tuple[str, ...]]] = [
    (
        "Computing",
        ("laptop", "macbook", "notebook", "ssd", " ram", "intel", "ryzen",
         "processor", "motherboard", "monitor", "keyboard", "mouse", "gaming"),
    ),
    (
        "Mobile & Audio",
        ("phone", "mobile", "headphone", "earbud", "airpod", "speaker",
         "bluetooth", "charger", "powerbank", "smartwatch"),
    ),
    (
        "Grocery",
        ("rice", "oil", "milk", "sugar", "coffee", "tea", "flour", "salt",
         "spice", "powder", "atta", "dal", "lentil", "biscuit", "snack",
         "juice", "water", "food", "honey", "ghee"),
    ),
    (
        "Personal Care",
        ("cream", "lotion", "shampoo", "soap", "perfume", "freshener",
         "toothpaste", "sanitizer", "facewash", "deodorant"),
    ),
    ("Fashion", ("shoe", "sneaker", "sandal", "shirt", "pant", "saree",
                 "panjabi", "watch", "bag", "wallet")),
    ("Home & Kitchen", ("dinner", "glass", "cookware", "pan", "bottle",
                        "combo", "furniture", "mattress", "towel", "curtain")),
]

NUM = re.compile(r"\d+(?:\.\d+)?")


def parse_number(raw: str | None) -> float | None:
    """Pull the first number out of a scraped price string."""
    if raw is None:
        return None
    text = str(raw).replace(",", "").strip()
    if not text:
        return None
    match = NUM.search(text)
    return float(match.group()) if match else None


def classify(name: str) -> str:
    lowered = f" {name.lower()} "
    for category, keywords in CATEGORY_RULES:
        if any(k in lowered for k in keywords):
            return category
    return "Unclassified"


def write_csv(path: Path, header: list[str], rows: list[list]) -> None:
    # Plain UTF-8, no BOM. The M queries pass Encoding = 65001 explicitly, so
    # Bangla product names come through; a BOM risks ending up inside the first
    # column's name instead.
    with path.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.writer(handle)
        writer.writerow(header)
        writer.writerows(rows)
    print(f"  {path.name:28} {len(rows):>6} rows")


def main() -> None:
    if not DB.exists():
        raise SystemExit(f"Scraper database not found at {DB}")
    OUT.mkdir(parents=True, exist_ok=True)

    con = sqlite3.connect(DB)
    con.row_factory = sqlite3.Row

    products = con.execute(
        "SELECT id, site, product_name, source_url, first_seen FROM products"
    ).fetchall()
    history = con.execute(
        "SELECT id, product_id, current_price, original_price, discount_percent,"
        " currency, scraped_at FROM price_history"
    ).fetchall()

    print(f"Read {len(products)} products and {len(history)} observations")

    # ---- DimRetailer ----------------------------------------------------
    sites = sorted({p["site"] for p in products})
    retailer_key = {site: i + 1 for i, site in enumerate(sites)}
    write_csv(
        OUT / "DimRetailer.csv",
        ["RetailerKey", "RetailerCode", "RetailerName"],
        [[retailer_key[s], s, RETAILERS.get(s, s.title())] for s in sites],
    )

    # ---- DimProduct -----------------------------------------------------
    product_rows = []
    product_retailer: dict[int, int] = {}
    for p in products:
        category = classify(p["product_name"] or "")
        product_retailer[p["id"]] = retailer_key[p["site"]]
        product_rows.append(
            [
                p["id"],
                retailer_key[p["site"]],
                (p["product_name"] or "").strip(),
                category,
                p["source_url"] or "",
                (p["first_seen"] or "")[:19],
            ]
        )
    write_csv(
        OUT / "DimProduct.csv",
        ["ProductKey", "RetailerKey", "ProductName", "Category", "SourceUrl", "FirstSeen"],
        product_rows,
    )

    # ---- FactPriceObservation -------------------------------------------
    # Find the latest observation per product so the model can answer
    # "current price" without guessing.
    # Ties on the timestamp are common (a product scraped twice in the same
    # second), so break them on the observation id. Without this, "current
    # price" double counts.
    latest_obs: dict[int, tuple[str, int]] = {}
    for h in history:
        pid = h["product_id"]
        candidate = (h["scraped_at"] or "", h["id"])
        if candidate > latest_obs.get(pid, ("", -1)):
            latest_obs[pid] = candidate

    fact_rows = []
    dates: set[date] = set()
    for h in history:
        pid = h["product_id"]
        if pid not in product_retailer:
            continue  # orphan observation; no product row to hang it off
        raw_ts = h["scraped_at"] or ""
        try:
            stamp = datetime.fromisoformat(raw_ts)
        except ValueError:
            continue
        day = stamp.date()
        dates.add(day)

        price = parse_number(h["current_price"])
        original = parse_number(h["original_price"])
        discount = parse_number(h["discount_percent"])
        if discount is not None and not 0 <= discount <= 100:
            discount = None

        # Classify why a price is unusable, so the dashboard can report the
        # shape of the problem instead of just a count. The dominant cause is
        # two prices concatenated out of the markup: Pickaboo's 194500195000
        # is 194,500 and 195,000 run together.
        if price is None:
            reason = "Unparseable"
        elif price > SUSPECT_ABOVE:
            reason = "Above plausible ceiling"
        elif price < SUSPECT_BELOW:
            reason = "Below plausible floor"
        elif original is not None and original > 0 and price > SUSPECT_RATIO * original:
            reason = "Inconsistent with original price"
        else:
            reason = ""
        suspect = reason != ""

        fact_rows.append(
            [
                h["id"],
                pid,
                product_retailer[pid],
                int(day.strftime("%Y%m%d")),
                stamp.strftime("%Y-%m-%d %H:%M:%S"),
                "" if suspect else f"{price:.2f}",
                "" if original is None else f"{original:.2f}",
                "" if discount is None else f"{discount:.2f}",
                h["currency"] or "",
                "TRUE" if suspect else "FALSE",
                reason,
                "TRUE" if original is not None else "FALSE",
                "TRUE" if discount is not None else "FALSE",
                "TRUE" if (raw_ts, h["id"]) == latest_obs.get(pid) else "FALSE",
            ]
        )

    write_csv(
        OUT / "FactPriceObservation.csv",
        [
            "ObservationKey", "ProductKey", "RetailerKey", "DateKey", "ScrapedAt",
            "CurrentPrice", "OriginalPrice", "DiscountPercent", "Currency",
            "IsSuspectPrice", "SuspectReason", "HasOriginalPrice", "HasDiscount",
            "IsLatest",
        ],
        fact_rows,
    )

    # ---- DimDate --------------------------------------------------------
    # Contiguous across the observed range; time intelligence needs no gaps.
    start, end = min(dates), max(dates)
    date_rows = []
    cursor = start
    while cursor <= end:
        date_rows.append(
            [
                int(cursor.strftime("%Y%m%d")),
                cursor.isoformat(),
                cursor.year,
                cursor.month,
                cursor.strftime("%b"),
                f"{cursor.year}-{cursor.month:02d}",
                cursor.day,
                cursor.strftime("%a"),
            ]
        )
        cursor += timedelta(days=1)
    write_csv(
        OUT / "DimDate.csv",
        ["DateKey", "Date", "Year", "MonthNumber", "MonthName", "YearMonth", "Day", "DayName"],
        date_rows,
    )

    span = (end - start).days + 1
    print(f"\nObserved range: {start} to {end}  ({span} day(s), {len(dates)} with data)")
    if len(dates) < 14:
        print(
            "NOTE: too few distinct days for trend analysis. Re-run the scraper\n"
            "      daily and rebuild; the Price Movement page needs real history."
        )


if __name__ == "__main__":
    main()
