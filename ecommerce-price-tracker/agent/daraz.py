"""Daraz as an agent tool: live search through the JSON the search page
itself loads (`/catalog/?ajax=true&q=...`) — one plain HTTP request, ~1s,
no browser. Verified 2026-10-21; the Selenium path in scraper/ took ~20s
for the same page.

The JSON also carries Daraz's own category filter options for the query,
which is how accessories get filtered out: "samsung a55" alone returns
almost nothing but phone cases, while the same query scoped to the
"smartphones" category returns phones.

Per-product vouchers are NOT available here — Daraz only loads them for
logged-in users. See vouchers.py for where public vouchers come from.
"""

from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

import requests

from .models import Listing

log = logging.getLogger("agent.daraz")

BASE = "https://www.daraz.com.bd"
HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/130.0 Safari/537.36"
    ),
    "Accept": "application/json",
    "Accept-Language": "en-US,en;q=0.9",
}
TIMEOUT = 15


@dataclass
class CategoryOption:
    slug: str  # e.g. "smartphones" — goes in the URL path
    title: str  # e.g. "Mobiles"


@dataclass
class SearchResult:
    query: str
    category: str | None
    total: int
    listings: list[Listing]
    categories: list[CategoryOption]
    url: str


def _decimal(value) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        return Decimal(str(value).replace(",", ""))
    except InvalidOperation:
        return None


def _absolute(url: str) -> str:
    if url.startswith("//"):
        return "https:" + url
    if url.startswith("/"):
        return BASE + url
    return url


def _listing(item: dict) -> Listing | None:
    price = _decimal(item.get("price"))
    if price is None:
        return None
    original = _decimal(item.get("originalPrice"))
    if original is not None and original <= price:
        original = None
    discount = None
    if original:
        # Computed, not parsed from item["discount"] ("50% Off") — same rule
        # as the scraper: never trust a scraped % when the two prices are known.
        discount = ((original - price) / original * 100).quantize(Decimal("1"))
    badges = [icon.get("bizType", "") for icon in item.get("icons") or [] if icon.get("bizType")]
    try:
        rating = float(item.get("ratingScore")) if item.get("ratingScore") else None
    except ValueError:
        rating = None
    return Listing(
        site="daraz",
        item_id=str(item.get("itemId") or item.get("nid") or ""),
        sku_id=str(item.get("skuId") or ""),
        name=(item.get("name") or "").strip(),
        url=_absolute(item.get("itemUrl") or "").split("?")[0],
        image=item.get("image") or "",
        price=price,
        original_price=original,
        discount_percent=discount,
        seller=item.get("sellerName") or "",
        seller_id=str(item.get("sellerId") or ""),
        brand=item.get("brandName") or "",
        rating=rating,
        reviews=int(item.get("review") or 0),
        sold=item.get("itemSoldCntShow") or "",
        in_stock=bool(item.get("inStock", True)),
        location=item.get("location") or "",
        official_store="lazMall" in badges,
        badges=badges,
        highlights=[re.sub(r"\s+", " ", h).strip() for h in item.get("description") or [] if h],
        category_ids=[int(c) for c in item.get("categories") or [] if str(c).isdigit()],
    )


def product_category(url: str) -> str | None:
    """Leaf category slug of one product, e.g. "smartphones", read from the
    product page's embedded data (product.brand.suggestionUrl is
    "/<category>/<brand>/" — the "More Smart Phones from SAMSUNG" link).
    Plain HTML, ~1s. The search JSON's own category filter can't be used for
    this: it lists ~8 options and routinely omits the main one ("samsung
    galaxy a36" offers only "Mobile Phone Cases").
    """
    html = requests.get(url, headers={**HEADERS, "Accept": "text/html"}, timeout=TIMEOUT).text
    marker = "var __moduleData__ ="
    start = html.find(marker)
    if start < 0:
        return None
    try:
        data, _ = json.JSONDecoder().raw_decode(html[start + len(marker):].lstrip())
        suggestion = data["data"]["root"]["fields"]["product"]["brand"]["suggestionUrl"]
    except (ValueError, KeyError, TypeError):
        return None
    match = re.match(r"https?://[^/]+/([a-z0-9-]+)/", suggestion or "")
    return match.group(1) if match else None


def search(
    query: str,
    category: str | None = None,
    min_price: Decimal | None = None,
    max_price: Decimal | None = None,
    sort: str | None = None,  # None = Daraz's "best match"; "priceasc" / "pricedesc"
    page: int = 1,
) -> SearchResult:
    path = f"/{category}/" if category else "/catalog/"
    params: dict[str, str] = {"ajax": "true", "q": query, "page": str(page)}
    if min_price is not None or max_price is not None:
        params["price"] = f"{int(min_price or 0)}-{int(max_price) if max_price is not None else ''}"
    if sort:
        params["sort"] = sort

    response = requests.get(BASE + path, params=params, headers=HEADERS, timeout=TIMEOUT)
    response.raise_for_status()
    data = response.json()
    mods = data.get("mods") or {}

    listings = [l for l in (_listing(item) for item in mods.get("listItems") or []) if l is not None]

    categories: list[CategoryOption] = []
    for f in (mods.get("filter") or {}).get("filterItems") or []:
        if f.get("name") == "category":
            categories = [
                CategoryOption(slug=o["value"], title=o.get("title") or o["value"])
                for o in f.get("options") or []
                if o.get("value")
            ]

    try:
        total = int((data.get("mainInfo") or {}).get("totalResults") or 0)
    except ValueError:
        total = len(listings)
    log.info("daraz search q=%r category=%s -> %d listings (%d total)", query, category, len(listings), total)
    return SearchResult(
        query=query, category=category, total=total, listings=listings, categories=categories, url=response.url
    )
