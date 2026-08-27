"""Server-side port of src/App.jsx's groupAcrossStores.

There's no shared product ID across unrelated storefronts, so "the same
product on two sites" can only be inferred from listing-name text — and
getting that wrong actively misleads a shopper (a false "cheaper
elsewhere" is worse than no comparison at all). Kept in exact lockstep
with the JS original's precision gates, ported here (not duplicated) so
there is exactly one implementation as more sites/products get added:

  1. Quantity notation is normalized ("500 gm" / "500gm" -> one token) so
     real matches aren't missed on formatting alone.
  2. Brand gate: the first word of a listing title is almost always the
     brand in these catalogs — two listings must share it, or they never
     group, no matter how similar the rest of the words look.
  3. Quantity gate: if both names carry a detected size/weight, it must
     match too, so a 500g pack and a 1kg pack of the same brand are never
     shown as directly comparable.
  4. Only past both gates does word-overlap (Jaccard) get a vote, and it
     still has to clear MATCH_THRESHOLD.
"""

from __future__ import annotations

import re
from decimal import Decimal
from typing import TypedDict

STOPWORDS = {
    "with", "for", "and", "the", "a", "an", "of", "to", "by", "in", "on", "is", "are", "this", "that",
}
QUANTITY_UNITS = "kg|g|gm|gram|grams|l|ltr|litre|liter|ml|pcs|pc|pack"
QUANTITY_RE = re.compile(rf"(\d+(?:\.\d+)?)\s*({QUANTITY_UNITS})\b", re.IGNORECASE)
QUANTITY_TOKEN_RE = re.compile(rf"^\d+({QUANTITY_UNITS})$")
NON_WORD_RE = re.compile(r"[^\w]+", re.UNICODE)
MATCH_THRESHOLD = 0.6


class MatchableProduct(TypedDict):
    id: int
    site: str
    product_name: str
    source_url: str
    current_price: Decimal


def tokenize(name: str) -> list[str]:
    normalized = QUANTITY_RE.sub(r"\1\2", name)
    normalized = NON_WORD_RE.sub(" ", normalized.lower())
    return [token for token in normalized.split() if len(token) > 1 and token not in STOPWORDS]


def quantity_token(tokens: list[str]) -> str | None:
    for token in tokens:
        if QUANTITY_TOKEN_RE.match(token):
            return token
    return None


def jaccard(a: set[str], b: set[str]) -> float:
    intersection = len(a & b)
    union = len(a) + len(b) - intersection
    return intersection / union if union else 0.0


def group_across_stores(products: list[MatchableProduct], min_stores: int = 2) -> list[dict]:
    """Groups of >=min_stores distinct sites, each group's items sorted by
    price ascending (cheapest first), groups sorted by size descending.
    """
    groups: list[dict] = []

    for product in products:
        if product.get("current_price") is None:
            continue
        token_list = tokenize(product["product_name"])
        if len(token_list) < 2:
            continue
        brand = token_list[0]
        quantity = quantity_token(token_list)
        tokens = set(token_list)

        best = None
        best_score = 0.0
        for group in groups:
            if group["brand"] != brand:
                continue
            if group["quantity"] and quantity and group["quantity"] != quantity:
                continue
            score = jaccard(tokens, group["tokens"])
            if score > best_score:
                best_score = score
                best = group

        if best is not None and best_score >= MATCH_THRESHOLD:
            best["items"].append(product)
        else:
            groups.append({"brand": brand, "quantity": quantity, "tokens": tokens, "items": [product]})

    results = []
    for group in groups:
        sites = {item["site"] for item in group["items"]}
        if len(sites) < min_stores:
            continue
        items = sorted(group["items"], key=lambda p: p["current_price"])
        results.append({"items": items})

    results.sort(key=lambda g: len(g["items"]), reverse=True)
    return results
