"""Read queries backing the API routes. Writes live in scraper/storage_pg.py
(shared with the scrape job) — this module is read-only.
"""

from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from scraper.sites import SiteConfig
from scraper.storage_pg import BannerORM, PriceHistoryORM, ProductORM

VALID_SORTS = {"discount", "price_asc", "price_desc", "newest"}


def _ranked_history_subquery():
    """One row per (product_id, scraped_at), ranked newest-first per product."""
    rn = func.row_number().over(
        partition_by=PriceHistoryORM.product_id,
        order_by=PriceHistoryORM.scraped_at.desc(),
    ).label("rn")
    return select(
        PriceHistoryORM.product_id.label("product_id"),
        PriceHistoryORM.current_price.label("current_price"),
        PriceHistoryORM.original_price.label("original_price"),
        PriceHistoryORM.discount_percent.label("discount_percent"),
        PriceHistoryORM.currency.label("currency"),
        PriceHistoryORM.scraped_at.label("scraped_at"),
        rn,
    ).subquery()


def list_products(
    session: Session,
    q: str | None = None,
    site: str | None = None,
    sort: str = "discount",
    limit: int = 100,
    offset: int = 0,
) -> tuple[int, list]:
    """Latest price (+ the point before it) per product, batched in one
    query via a ranked self-join — not the N+1-per-row lookup the old
    SQLite export_snapshot() did.
    """
    ranked = _ranked_history_subquery()
    latest = ranked.alias("latest")
    previous = ranked.alias("previous")

    base = (
        select(
            ProductORM.id,
            ProductORM.site,
            ProductORM.product_name,
            ProductORM.source_url,
            ProductORM.first_seen,
            latest.c.current_price,
            latest.c.original_price,
            latest.c.discount_percent,
            latest.c.currency,
            latest.c.scraped_at,
            previous.c.current_price.label("previous_price"),
        )
        .join(latest, (latest.c.product_id == ProductORM.id) & (latest.c.rn == 1))
        .outerjoin(previous, (previous.c.product_id == ProductORM.id) & (previous.c.rn == 2))
    )

    if q:
        base = base.where(ProductORM.product_name.ilike(f"%{q}%"))
    if site:
        base = base.where(ProductORM.site == site)

    total = session.execute(select(func.count()).select_from(base.subquery())).scalar_one()

    if sort == "price_asc":
        base = base.order_by(latest.c.current_price.asc().nulls_last())
    elif sort == "price_desc":
        base = base.order_by(latest.c.current_price.desc().nulls_last())
    elif sort == "newest":
        base = base.order_by(latest.c.scraped_at.desc())
    else:
        base = base.order_by(latest.c.discount_percent.desc().nulls_last())

    base = base.limit(limit).offset(offset)
    rows = session.execute(base).all()
    return total, rows


def get_product(session: Session, product_id: int):
    ranked = _ranked_history_subquery()
    latest = ranked.alias("latest")
    previous = ranked.alias("previous")

    stmt = (
        select(
            ProductORM.id,
            ProductORM.site,
            ProductORM.product_name,
            ProductORM.source_url,
            ProductORM.first_seen,
            latest.c.current_price,
            latest.c.original_price,
            latest.c.discount_percent,
            latest.c.currency,
            latest.c.scraped_at,
            previous.c.current_price.label("previous_price"),
        )
        .join(latest, (latest.c.product_id == ProductORM.id) & (latest.c.rn == 1))
        .outerjoin(previous, (previous.c.product_id == ProductORM.id) & (previous.c.rn == 2))
        .where(ProductORM.id == product_id)
    )
    return session.execute(stmt).first()


def product_history(
    session: Session, product_id: int, since: datetime | None = None, limit: int = 500
):
    product = session.get(ProductORM, product_id)
    if product is None:
        return None, []

    stmt = select(PriceHistoryORM).where(PriceHistoryORM.product_id == product_id)
    if since is not None:
        stmt = stmt.where(PriceHistoryORM.scraped_at >= since)
    stmt = stmt.order_by(PriceHistoryORM.scraped_at.asc()).limit(limit)
    points = session.execute(stmt).scalars().all()
    return product, points


def all_latest_products(session: Session) -> list[dict]:
    """Every product's latest price point, unpaginated — feeds
    matching.group_across_stores(), which needs the full set to find
    cross-store overlaps rather than one page of it.
    """
    ranked = _ranked_history_subquery()
    latest = ranked.alias("latest")
    stmt = (
        select(
            ProductORM.id,
            ProductORM.site,
            ProductORM.product_name,
            ProductORM.source_url,
            latest.c.current_price,
        )
        .join(latest, (latest.c.product_id == ProductORM.id) & (latest.c.rn == 1))
    )
    rows = session.execute(stmt).all()
    return [
        {
            "id": r.id,
            "site": r.site,
            "product_name": r.product_name,
            "source_url": r.source_url,
            "current_price": r.current_price,
        }
        for r in rows
    ]


def list_banners(session: Session, site: str | None = None) -> list[BannerORM]:
    stmt = select(BannerORM)
    if site:
        stmt = stmt.where(BannerORM.site == site)
    stmt = stmt.order_by(BannerORM.site, BannerORM.last_seen.desc())
    return list(session.execute(stmt).scalars().all())


def site_stats(session: Session, sites_config: dict[str, SiteConfig]) -> list[dict]:
    product_counts = dict(session.execute(select(ProductORM.site, func.count()).group_by(ProductORM.site)).all())
    banner_counts = dict(session.execute(select(BannerORM.site, func.count()).group_by(BannerORM.site)).all())
    last_scraped = dict(
        session.execute(select(ProductORM.site, func.max(ProductORM.last_seen)).group_by(ProductORM.site)).all()
    )

    keys = set(sites_config) | set(product_counts) | set(banner_counts)
    results = []
    for key in sorted(keys):
        config = sites_config.get(key)
        results.append(
            {
                "key": key,
                "name": config.name if config else key,
                "verified": config.verified if config else False,
                "product_count": product_counts.get(key, 0),
                "banner_count": banner_counts.get(key, 0),
                "last_scraped_at": last_scraped.get(key),
            }
        )
    return results
