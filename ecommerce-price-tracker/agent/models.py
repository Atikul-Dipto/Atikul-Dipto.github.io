"""Plain data carried between the agent's steps. Prices are Decimal (BDT)
throughout — the voucher math in eligibility.py must never round-trip a
price through float.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import date
from decimal import Decimal


@dataclass
class Intent:
    raw_query: str
    mode: str  # "product" (named a specific item) | "need" (described what they want)
    search_query: str
    product_type: str | None = None
    brand: str | None = None
    min_price: Decimal | None = None
    max_price: Decimal | None = None
    must_have: list[str] = field(default_factory=list)
    source: str = "llm"  # "llm" | "rules" — which parser produced this


@dataclass
class Listing:
    site: str
    item_id: str
    sku_id: str
    name: str
    url: str
    image: str
    price: Decimal
    original_price: Decimal | None
    discount_percent: Decimal | None
    seller: str
    seller_id: str
    brand: str
    rating: float | None
    reviews: int
    sold: str
    in_stock: bool
    location: str
    official_store: bool  # Daraz Mall ("lazMall" badge)
    badges: list[str]  # raw Daraz icon bizTypes, e.g. FreeshippingAndVoucherMax
    highlights: list[str]  # the key-feature bullets Daraz returns with each search hit
    category_ids: list[int]
    # Filled in by ranking.py
    relevance: float = 0.0
    matched_features: list[str] = field(default_factory=list)


@dataclass
class Voucher:
    site: str
    title: str  # e.g. "Daraz Voucher"
    labels: list[str]  # badges on the card, e.g. ["bKash Choice Exclusive", "Limited redemption"]
    amount: Decimal | None  # flat BDT off
    percent: Decimal | None  # % off (Daraz caps these; cap goes in max_discount when shown)
    max_discount: Decimal | None
    min_spend: Decimal | None
    valid_from: date | None
    valid_to: date | None
    source_url: str  # the campaign page it was published on
    raw_text: str


@dataclass
class VoucherCheck:
    voucher: Voucher
    status: str  # "applies" | "conditional" | "not_applicable"
    saving: Decimal  # BDT off this listing if it applies (0 when it doesn't)
    reasons: list[str]  # why, in plain words — shown to the user verbatim
    conditions: list[str] = field(default_factory=list)  # what the shopper must do/be for it to apply


@dataclass
class PricePoint:
    price: Decimal
    seen_at: str


@dataclass
class HistoryMatch:
    product_name: str
    source_url: str
    last_price: Decimal | None
    last_seen: str | None
    lowest_price: Decimal | None
    highest_price: Decimal | None
    checks: int


def to_jsonable(obj):
    """dataclass -> dict with Decimal/date made JSON-safe (str/isoformat)."""
    if hasattr(obj, "__dataclass_fields__"):
        obj = asdict(obj)
    if isinstance(obj, dict):
        return {k: to_jsonable(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [to_jsonable(v) for v in obj]
    if isinstance(obj, Decimal):
        return format(obj.normalize(), "f")
    if isinstance(obj, date):
        return obj.isoformat()
    return obj
