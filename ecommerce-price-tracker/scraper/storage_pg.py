"""PostgreSQL-backed storage: the schema and write path for the always-on
backend (see backend/app/scheduler.py). Sibling to storage.py, not a
replacement — the SQLite + JSON path in storage.py/run_pipeline.py keeps
working unchanged for manual runs and `inspect`-based selector debugging.

This module is the single source of truth for the Postgres schema; the
backend imports ProductORM/PriceHistoryORM/BannerORM from here for reads.
"""

from __future__ import annotations

from datetime import datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import BigInteger, DateTime, ForeignKey, Numeric, String, UniqueConstraint, create_engine, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Mapped, Session, mapped_column, relationship, sessionmaker

from .banners import Banner
from .models import Product


class Base(DeclarativeBase):
    pass


class ProductORM(Base):
    __tablename__ = "products"
    __table_args__ = (UniqueConstraint("site", "source_url", name="uq_products_site_source_url"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    site: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    product_name: Mapped[str] = mapped_column(String, nullable=False)
    source_url: Mapped[str] = mapped_column(String, nullable=False)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    price_history: Mapped[list["PriceHistoryORM"]] = relationship(
        back_populates="product", cascade="all, delete-orphan"
    )


class PriceHistoryORM(Base):
    __tablename__ = "price_history"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    product_id: Mapped[int] = mapped_column(
        BigInteger, ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    current_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    original_price: Mapped[Decimal | None] = mapped_column(Numeric(12, 2))
    discount_percent: Mapped[Decimal | None] = mapped_column(Numeric(5, 2))
    currency: Mapped[str | None] = mapped_column(String(8))
    scraped_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)

    product: Mapped[ProductORM] = relationship(back_populates="price_history")


class BannerORM(Base):
    __tablename__ = "banners"
    __table_args__ = (UniqueConstraint("site", "image_url", name="uq_banners_site_image_url"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    site: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    image_url: Mapped[str] = mapped_column(String, nullable=False)
    link_url: Mapped[str] = mapped_column(String, nullable=False)
    first_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    last_seen: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)


def get_engine(database_url: str) -> Engine:
    return create_engine(database_url, pool_pre_ping=True)


def get_sessionmaker(engine: Engine) -> sessionmaker:
    return sessionmaker(bind=engine, expire_on_commit=False)


def init_db(engine: Engine) -> None:
    Base.metadata.create_all(engine)


def _to_decimal(value: str) -> Decimal | None:
    """Product/Banner dataclasses carry prices as strings, often "" for
    "no original price" — Postgres NUMERIC needs that as NULL, not "".
    """
    if not value:
        return None
    try:
        return Decimal(value)
    except InvalidOperation:
        return None


def record(session: Session, product: Product) -> ProductORM:
    """Upsert the product row and append one price_history point."""
    row = session.execute(
        select(ProductORM).where(ProductORM.site == product.site, ProductORM.source_url == product.source_url)
    ).scalar_one_or_none()

    scraped_at = datetime.fromisoformat(product.scraped_at)

    if row is None:
        row = ProductORM(
            site=product.site,
            product_name=product.product_name,
            source_url=product.source_url,
            first_seen=scraped_at,
            last_seen=scraped_at,
        )
        session.add(row)
        session.flush()  # assigns row.id for the price_history FK below
    else:
        row.product_name = product.product_name
        row.last_seen = scraped_at

    session.add(
        PriceHistoryORM(
            product_id=row.id,
            current_price=_to_decimal(product.current_price),
            original_price=_to_decimal(product.original_price),
            discount_percent=_to_decimal(product.discount_percent),
            currency=product.currency or None,
            scraped_at=scraped_at,
        )
    )
    session.commit()
    return row


def record_banner(session: Session, banner: Banner) -> BannerORM:
    """Upsert on (site, image_url) — banners are latest-snapshot only,
    no history table; they rotate too often for a time series to be
    worth it (same reasoning as run_banners() in banners.py).
    """
    row = session.execute(
        select(BannerORM).where(BannerORM.site == banner.site, BannerORM.image_url == banner.image_url)
    ).scalar_one_or_none()

    scraped_at = datetime.fromisoformat(banner.scraped_at)

    if row is None:
        row = BannerORM(
            site=banner.site,
            image_url=banner.image_url,
            link_url=banner.link_url,
            first_seen=scraped_at,
            last_seen=scraped_at,
        )
        session.add(row)
    else:
        row.link_url = banner.link_url
        row.last_seen = scraped_at

    session.commit()
    return row
