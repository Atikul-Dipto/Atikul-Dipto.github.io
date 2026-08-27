from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel


class ProductOut(BaseModel):
    id: int
    site: str
    product_name: str
    source_url: str
    current_price: Decimal | None
    original_price: Decimal | None
    previous_price: Decimal | None
    discount_percent: Decimal | None
    currency: str | None
    first_seen: datetime
    scraped_at: datetime


class ProductListOut(BaseModel):
    count: int
    results: list[ProductOut]


class PricePoint(BaseModel):
    scraped_at: datetime
    current_price: Decimal | None
    original_price: Decimal | None
    discount_percent: Decimal | None


class ProductHistoryOut(BaseModel):
    product_id: int
    site: str
    product_name: str
    points: list[PricePoint]


class BannerOut(BaseModel):
    site: str
    image_url: str
    link_url: str
    first_seen: datetime
    last_seen: datetime


class BannerListOut(BaseModel):
    results: list[BannerOut]


class SiteStatsOut(BaseModel):
    key: str
    name: str
    verified: bool
    product_count: int
    banner_count: int
    last_scraped_at: datetime | None


class CompareItem(BaseModel):
    product_id: int
    site: str
    product_name: str
    current_price: Decimal
    source_url: str


class CompareGroup(BaseModel):
    items: list[CompareItem]


class CompareGroupsOut(BaseModel):
    results: list[CompareGroup]


class TrendOut(BaseModel):
    checks: int
    window_days: float
    change_pct: Decimal | None
    direction: str
    lowest_price: Decimal
    lowest_at: datetime
    highest_price: Decimal
    highest_at: datetime
    streak_direction: str
    streak_length: int
    summary: str
    summary_source: str  # "model" (Hugging Face) or "template" (pure computed fallback)


class ScrapeTriggerIn(BaseModel):
    only: list[str] | None = None
    headless: bool | None = None


class ScrapeTriggerOut(BaseModel):
    status: str
    job_id: str
