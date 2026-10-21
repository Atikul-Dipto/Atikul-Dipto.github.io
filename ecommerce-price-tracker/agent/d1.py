"""Sync from this PC to the Cloudflare agent's D1 database ("price-pulse",
schema in worker/migrations/). Two things only exist here and not there:

- Voucher harvesting needs Selenium, which can't run on Cloudflare, so
  harvested vouchers are pushed up (`python -m agent --harvest-vouchers --push-d1`).
- The scrapers' Daraz price history (SQLite from the static pipeline,
  Postgres from the backend) seeds the agent's memory once
  (`python -m agent --seed-d1`), so "the price we last saw" has a past
  from day one.

Both go through `wrangler d1 execute --remote --file`, run from the repo root
where wrangler.toml lives. Every statement is idempotent (INSERT OR IGNORE /
upsert), so re-running is safe.
"""

from __future__ import annotations

import hashlib
import json
import re
import shutil
import sqlite3
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from .models import Voucher

REPO_ROOT = Path(__file__).resolve().parents[2]
PROJECT = Path(__file__).resolve().parents[1]
DATABASE = "price-pulse"
ITEM_ID_RE = re.compile(r"-i(\d+)(?:-s\d+)?\.html")


def _q(value) -> str:
    """SQL literal. Values come from our own DBs and Daraz text, so quote properly."""
    if value is None:
        return "NULL"
    if isinstance(value, (int, float)):
        return repr(value)
    return "'" + str(value).replace("'", "''") + "'"


def _utc(ts) -> str:
    """Any stored timestamp -> the ISO UTC 'Z' form D1 rows compare as text."""
    dt = ts if isinstance(ts, datetime) else datetime.fromisoformat(str(ts))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def execute(sql: str) -> None:
    npx = shutil.which("npx.cmd") or shutil.which("npx") or "npx"
    with tempfile.NamedTemporaryFile("w", suffix=".sql", delete=False, encoding="utf-8") as f:
        f.write(sql)
        path = f.name
    try:
        subprocess.run([npx, "wrangler", "d1", "execute", DATABASE, "--remote", "--yes", "--file", path], cwd=REPO_ROOT, check=True)
    finally:
        Path(path).unlink(missing_ok=True)


def _history_rows(database_url: str | None) -> list[tuple]:
    """(item_id, name, url, price, original_price, seen_at) from SQLite and Postgres, deduplicated."""
    rows: dict[tuple, tuple] = {}

    sqlite_path = PROJECT / "data" / "pricetracker.db"
    if sqlite_path.exists():
        con = sqlite3.connect(sqlite_path)
        for name, url, price, original, at in con.execute(
            "SELECT p.product_name, p.source_url, h.current_price, h.original_price, h.scraped_at "
            "FROM price_history h JOIN products p ON p.id = h.product_id WHERE p.site = 'daraz'"
        ):
            if (m := ITEM_ID_RE.search(url)) and price:
                rows[(m.group(1), _utc(at))] = (m.group(1), name, url.split("?")[0], float(price), float(original) if original else None, _utc(at))

    if database_url:
        from sqlalchemy import text

        from scraper.storage_pg import get_engine

        try:
            with get_engine(database_url).connect() as con:
                for name, url, price, original, at in con.execute(
                    text(
                        "SELECT p.product_name, p.source_url, h.current_price, h.original_price, h.scraped_at "
                        "FROM price_history h JOIN products p ON p.id = h.product_id WHERE p.site = 'daraz'"
                    )
                ):
                    if (m := ITEM_ID_RE.search(url)) and price:
                        rows[(m.group(1), _utc(at))] = (m.group(1), name, url.split("?")[0], float(price), float(original) if original else None, _utc(at))
        except Exception as exc:  # Postgres is optional — SQLite alone still seeds
            print(f"(Postgres skipped: {exc.__class__.__name__})")
    return sorted(rows.values(), key=lambda r: r[5])


def seed_history(database_url: str | None) -> int:
    rows = _history_rows(database_url)
    statements = []
    latest: dict[str, tuple] = {}
    for item_id, name, url, price, original, at in rows:
        first = latest.get(item_id, (None,) * 6)[5] or at
        latest[item_id] = (item_id, name, url, price, original, at, first)
        statements.append(
            "INSERT INTO price_history (item_id, price, original_price, seen_at, source) "
            f"SELECT {_q(item_id)}, {_q(price)}, {_q(original)}, {_q(at)}, 'scrape' "
            f"WHERE NOT EXISTS (SELECT 1 FROM price_history WHERE item_id = {_q(item_id)} AND seen_at = {_q(at)});"
        )
    for item_id, name, url, _, _, last, first in latest.values():
        statements.append(
            "INSERT INTO listings (item_id, site, name, url, first_seen, last_seen) "
            f"VALUES ({_q(item_id)}, 'daraz', {_q(name)}, {_q(url)}, {_q(first)}, {_q(last)}) "
            "ON CONFLICT(item_id) DO UPDATE SET first_seen = MIN(listings.first_seen, excluded.first_seen), "
            "last_seen = MAX(listings.last_seen, excluded.last_seen);"
        )
    if statements:
        execute("\n".join(statements))
    return len(rows)


def _fingerprint(v: Voucher) -> str:
    key = "|".join(str(x) for x in (v.title, sorted(v.labels), v.amount, v.percent, v.max_discount, v.min_spend, v.valid_from, v.valid_to))
    return hashlib.sha1(key.encode("utf-8")).hexdigest()


def push_vouchers(vouchers: list[Voucher]) -> int:
    now = _utc(datetime.now(timezone.utc))
    num = lambda d: float(d) if d is not None else None  # noqa: E731 — Decimal -> REAL
    statements = [
        "INSERT INTO vouchers (fingerprint, site, title, labels, amount, percent, max_discount, min_spend, valid_from, valid_to, "
        "source_url, raw_text, first_seen, last_seen) VALUES ("
        + ", ".join(
            _q(x)
            for x in (
                _fingerprint(v), v.site, v.title, json.dumps(v.labels, ensure_ascii=False), num(v.amount), num(v.percent),
                num(v.max_discount), num(v.min_spend), v.valid_from.isoformat() if v.valid_from else None,
                v.valid_to.isoformat() if v.valid_to else None, v.source_url, v.raw_text, now, now,
            )
        )
        + ") ON CONFLICT(fingerprint) DO UPDATE SET last_seen = excluded.last_seen, source_url = excluded.source_url;"
        for v in vouchers
    ]
    if statements:
        execute("\n".join(statements))
    return len(statements)
