"""The agent's reads and writes against the shared Postgres storehouse
(schema in scraper/storage_pg.py).

Every live lookup is written back as a normal price_history point, so the
"last looked-up price" a shopper sees is real history — either from the
hourly scrape job or from an earlier agent search for the same item. The
history is read *before* the new observation is recorded, so "last price"
means the previous check, not the one that just happened.

Listings are matched to stored products by Daraz item id (the "-i123456"
in every product URL), not by URL string — the scrape job and the search
JSON format the same product's URL differently.

Everything here degrades to "no history" if the database is down; the
agent still answers from the live search.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from scraper.models import Product
from scraper.storage_pg import PriceHistoryORM, ProductORM, VoucherORM, record

from .models import HistoryMatch, Listing, Voucher

log = logging.getLogger("agent.store")

VOUCHER_MAX_AGE = timedelta(hours=24)


def _item_url_pattern(item_id: str) -> str:
    # -i563978035.html or -i563978035-s2602903488.html, never -i5639780351
    return f"-i{item_id}(\\.html|-s)"


def lookup_history(session: Session, listings: list[Listing]) -> dict[str, HistoryMatch]:
    found: dict[str, HistoryMatch] = {}
    for listing in listings:
        if not listing.item_id:
            continue
        product = session.execute(
            select(ProductORM)
            .where(ProductORM.site == listing.site, ProductORM.source_url.op("~")(_item_url_pattern(listing.item_id)))
            .order_by(ProductORM.last_seen.desc())
            .limit(1)
        ).scalar_one_or_none()
        if product is None:
            continue
        stats = session.execute(
            select(
                func.count(PriceHistoryORM.id),
                func.min(PriceHistoryORM.current_price),
                func.max(PriceHistoryORM.current_price),
            ).where(PriceHistoryORM.product_id == product.id)
        ).one()
        last = session.execute(
            select(PriceHistoryORM)
            .where(PriceHistoryORM.product_id == product.id)
            .order_by(PriceHistoryORM.scraped_at.desc())
            .limit(1)
        ).scalar_one_or_none()
        found[listing.item_id] = HistoryMatch(
            product_name=product.product_name,
            source_url=product.source_url,
            last_price=last.current_price if last else None,
            last_seen=last.scraped_at.isoformat() if last else None,
            lowest_price=stats[1],
            highest_price=stats[2],
            checks=stats[0],
        )
    return found


def record_listings(session: Session, listings: list[Listing]) -> None:
    now = datetime.now(timezone.utc).isoformat()
    for listing in listings:
        record(
            session,
            Product(
                site=listing.site,
                product_name=listing.name,
                current_price=str(listing.price),
                original_price=str(listing.original_price or ""),
                discount_percent=str(listing.discount_percent or ""),
                currency="BDT",
                source_url=listing.url,
                scraped_at=now,
            ),
        )


def _fingerprint(v: Voucher) -> str:
    key = "|".join(str(x) for x in (v.title, sorted(v.labels), v.amount, v.percent, v.max_discount, v.min_spend, v.valid_from, v.valid_to))
    return hashlib.sha1(key.encode("utf-8")).hexdigest()


def save_vouchers(session: Session, vouchers: list[Voucher]) -> int:
    now = datetime.now(timezone.utc)
    for v in vouchers:
        fp = _fingerprint(v)
        row = session.execute(
            select(VoucherORM).where(VoucherORM.site == v.site, VoucherORM.fingerprint == fp)
        ).scalar_one_or_none()
        if row is None:
            session.add(
                VoucherORM(
                    site=v.site, fingerprint=fp, title=v.title, labels=v.labels, amount=v.amount, percent=v.percent,
                    max_discount=v.max_discount, min_spend=v.min_spend, valid_from=v.valid_from, valid_to=v.valid_to,
                    source_url=v.source_url, raw_text=v.raw_text, first_seen=now, last_seen=now,
                )
            )
        else:
            row.last_seen = now
            row.source_url = v.source_url
    session.commit()
    return len(vouchers)


def load_vouchers(session: Session, site: str = "daraz") -> list[Voucher]:
    """Vouchers seen by a harvest in the last day (older ones may have been pulled)."""
    cutoff = datetime.now(timezone.utc) - VOUCHER_MAX_AGE
    rows = session.execute(
        select(VoucherORM).where(VoucherORM.site == site, VoucherORM.last_seen >= cutoff)
    ).scalars()
    return [
        Voucher(
            site=r.site, title=r.title, labels=list(r.labels or []), amount=r.amount, percent=r.percent,
            max_discount=r.max_discount, min_spend=r.min_spend, valid_from=r.valid_from, valid_to=r.valid_to,
            source_url=r.source_url, raw_text=r.raw_text,
        )
        for r in rows
    ]


def safely(fn, *args, default=None):
    """Run a store call; on any DB failure log it and return `default`."""
    try:
        return fn(*args)
    except SQLAlchemyError as exc:
        log.warning("database unavailable for %s: %s", fn.__name__, exc.__class__.__name__)
        return default
