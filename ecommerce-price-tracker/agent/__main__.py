"""Command line for the agent. Run from ecommerce-price-tracker/ with the
project venv:

    .venv\\Scripts\\python.exe -m agent "Samsung Galaxy A36"
    .venv\\Scripts\\python.exe -m agent "phone under 25k with good camera" --json
    .venv\\Scripts\\python.exe -m agent --harvest-vouchers      # refresh the voucher cache
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys

from scraper.storage_pg import get_engine, get_sessionmaker, init_db

from . import core, store
from .vouchers import harvest

DEFAULT_DB = "postgresql+psycopg2://pricetracker:pricetracker@localhost:5433/pricetracker"


def _session_factory():
    engine = get_engine(os.environ.get("DATABASE_URL", DEFAULT_DB))
    try:
        init_db(engine)
    except Exception as exc:
        print(f"(database unavailable: {exc.__class__.__name__} — answering from live search only)", file=sys.stderr)
        return None
    return get_sessionmaker(engine)


def _print_answer(answer: dict) -> None:
    print(f"\n{answer['summary']}\n")
    intent = answer["intent"]
    print(
        f"understood: mode={intent['mode']} search={intent['search_query']!r} type={intent['product_type']} "
        f"budget={intent['min_price']}–{intent['max_price']} must_have={intent['must_have']} ({intent['source']})"
    )
    print(f"category: {answer['category']}   database: {answer['database']}   vouchers known: {answer['vouchers_known']}")
    for i, r in enumerate(answer["results"]):
        l = r["listing"]
        star = "★" if i == answer["best_index"] else " "
        bv = r["best_voucher"]
        voucher = f" → ৳{r['final_price']} with {bv['voucher']['title']}" if bv else ""
        hist = r["history"]
        last = f" | last ৳{hist['last_price']} ({hist['last_seen'][:10]})" if hist and hist["last_price"] else ""
        print(f" {star} ৳{l['price']:>7} {l['name'][:62]:<62} | {l['seller'][:22]} | ★{(l['rating'] or 0):.1f} ({l['reviews']}){voucher}{last}")
    print("timings (ms):", answer["timings_ms"])


def main() -> int:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser(prog="python -m agent", description="Price Pulse shopping agent (Daraz)")
    parser.add_argument("query", nargs="?", help="what the shopper typed")
    parser.add_argument("--json", action="store_true", help="print the full JSON answer")
    parser.add_argument("--harvest-vouchers", action="store_true", help="refresh public vouchers from Daraz campaign pages")
    parser.add_argument("--show-browser", action="store_true", help="run the harvest browser visibly")
    parser.add_argument("-v", "--verbose", action="store_true")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO if args.verbose else logging.WARNING, format="%(levelname)s %(name)s: %(message)s")

    factory = _session_factory()

    if args.harvest_vouchers:
        vouchers = harvest(headless=not args.show_browser)
        for v in vouchers:
            off = f"৳{v.amount}" if v.amount is not None else f"{v.percent}%"
            print(f"  {v.title}: {off} off, min ৳{v.min_spend}, {v.valid_from}→{v.valid_to}, {v.labels}")
        if factory:
            with factory() as session:
                store.save_vouchers(session, vouchers)
        print(f"{len(vouchers)} vouchers harvested" + (" and saved" if factory else " (not saved — no database)"))
        return 0

    if not args.query:
        parser.error("give a query, or --harvest-vouchers")
    answer = core.run(args.query, factory)
    if args.json:
        print(json.dumps(answer, ensure_ascii=False, indent=1))
    else:
        _print_answer(answer)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
