"""SQLite-backed price history storage and JSON snapshot export."""

from __future__ import annotations

import json
import sqlite3
from pathlib import Path

from .models import Product

SCHEMA = """
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    site TEXT NOT NULL,
    product_name TEXT NOT NULL,
    source_url TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    UNIQUE(site, source_url)
);

CREATE TABLE IF NOT EXISTS price_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL REFERENCES products(id),
    current_price TEXT,
    original_price TEXT,
    discount_percent TEXT,
    currency TEXT,
    scraped_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_price_history_product
    ON price_history(product_id, scraped_at);
"""


def connect(db_path: Path) -> sqlite3.Connection:
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.executescript(SCHEMA)
    return conn


def record(conn: sqlite3.Connection, product: Product) -> None:
    """Upsert the product record and append one price_history point."""
    cursor = conn.execute(
        "SELECT id FROM products WHERE site = ? AND source_url = ?",
        (product.site, product.source_url),
    )
    row = cursor.fetchone()
    if row is None:
        cursor = conn.execute(
            "INSERT INTO products (site, product_name, source_url, first_seen, last_seen) "
            "VALUES (?, ?, ?, ?, ?)",
            (product.site, product.product_name, product.source_url, product.scraped_at, product.scraped_at),
        )
        product_id = cursor.lastrowid
    else:
        product_id = row[0]
        conn.execute(
            "UPDATE products SET product_name = ?, last_seen = ? WHERE id = ?",
            (product.product_name, product.scraped_at, product_id),
        )

    conn.execute(
        "INSERT INTO price_history "
        "(product_id, current_price, original_price, discount_percent, currency, scraped_at) "
        "VALUES (?, ?, ?, ?, ?, ?)",
        (
            product_id,
            product.current_price,
            product.original_price,
            product.discount_percent,
            product.currency,
            product.scraped_at,
        ),
    )
    conn.commit()


def export_snapshot(conn: sqlite3.Connection, output_path: Path) -> int:
    """Write the latest known price point per product to a JSON file."""
    rows = conn.execute(
        """
        SELECT p.site, p.product_name, p.source_url, p.first_seen,
               h.current_price, h.original_price, h.discount_percent,
               h.currency, h.scraped_at
        FROM products p
        JOIN price_history h ON h.id = (
            SELECT id FROM price_history
            WHERE product_id = p.id
            ORDER BY scraped_at DESC, id DESC
            LIMIT 1
        )
        ORDER BY p.site, p.product_name
        """
    ).fetchall()

    snapshot = []
    for site, name, url, first_seen, price, original, discount, currency, scraped_at in rows:
        previous = conn.execute(
            """
            SELECT current_price FROM price_history
            WHERE product_id = (SELECT id FROM products WHERE site = ? AND source_url = ?)
            ORDER BY scraped_at DESC, id DESC
            LIMIT 1 OFFSET 1
            """,
            (site, url),
        ).fetchone()
        snapshot.append(
            {
                "site": site,
                "product_name": name,
                "current_price": price,
                "previous_price": previous[0] if previous else "",
                "original_price": original,
                "discount_percent": discount,
                "currency": currency,
                "source_url": url,
                "first_seen": first_seen,
                "scraped_at": scraped_at,
            }
        )

    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(snapshot, indent=2), encoding="utf-8")
    return len(snapshot)
