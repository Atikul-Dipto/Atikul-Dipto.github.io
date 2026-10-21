"""Deterministic filtering and ranking of live listings — no model involved.

Two failure modes seen on real Daraz results drive the rules here:

1. Accessories flooding a device search. "samsung a55" returns mostly
   cases and screen protectors whose titles list a dozen models
   ("A56/A36/A15/A55 case"). The category scope in core.py removes most of
   them; ACCESSORY_WORDS catches the rest.
2. Placeholder prices. A "Samsung a 224g" listed at ৳180 sat among real
   phones at ৳20,000+. Anything under PRICE_FLOOR_RATIO of the median price
   of the remaining candidates is dropped as not a real offer.
"""

from __future__ import annotations

import math
import re
from decimal import Decimal
from statistics import median

from .models import Intent, Listing

ACCESSORY_WORDS = {
    "case", "cover", "protector", "glass", "tempered", "charger", "cable", "strap", "holder",
    "adapter", "skin", "pouch", "sticker", "mount", "stand", "lens", "film", "bumper",
}
PRICE_FLOOR_RATIO = Decimal("0.3")
# Adjectives that carry no searchable meaning in a must-have phrase:
# "good camera" should be checked as "camera".
FEATURE_FILLER = {"good", "great", "best", "nice", "long", "big", "high", "strong", "fast", "excellent", "better", "quality"}

TOKEN_RE = re.compile(r"[a-z0-9]+")
# Same unit list as backend/app/matching.py's quantity gate.
QUANTITY_RE = re.compile(r"(\d+(?:\.\d+)?)\s*(kg|g|gm|gram|grams|l|ltr|litre|liter|ml|pcs|pc|pack)\b", re.IGNORECASE)
UNIT_ALIASES = {"gm": "g", "gram": "g", "grams": "g", "ltr": "l", "litre": "l", "liter": "l", "pc": "pcs"}


def quantities(text: str) -> set[str]:
    """{"5kg"} from "Miniket Rice 5 KG" — normalized so spacing/case/alias don't matter."""
    return {
        f"{Decimal(amount).normalize():f}{UNIT_ALIASES.get(unit.lower(), unit.lower())}"
        for amount, unit in QUANTITY_RE.findall(text)
    }


def tokens(text: str) -> list[str]:
    return TOKEN_RE.findall(text.lower())


def _compact(text: str) -> str:
    """"Galaxy A 36" and "galaxy-a36" both -> "galaxya36", for model-number matching."""
    return "".join(tokens(text))


def _model_tokens(query_tokens: list[str]) -> list[str]:
    """What pins down a specific model, as compact strings the title must contain:
    tokens mixing letters and digits ("a36", "1000xm5"), and a bare number
    glued to the word before it ("iphone 15" -> "iphone15", so an iPhone 17
    doesn't pass). Sizes are left to the quantity gate.
    """
    found: list[str] = []
    for i, token in enumerate(query_tokens):
        if quantities(token):
            continue
        if re.search(r"\d", token) and re.search(r"[a-z]", token):
            found.append(token)
        elif token.isdigit() and i > 0 and not query_tokens[i - 1].isdigit():
            found.append(query_tokens[i - 1] + token)
    return found


def parse_sold(sold: str) -> int:
    match = re.search(r"([\d.]+)\s*([kK])?", sold or "")
    if not match:
        return 0
    value = float(match.group(1))
    return int(value * 1000) if match.group(2) else int(value)


def bayesian_rating(rating: float | None, reviews: int, prior: float = 4.0, weight: int = 10) -> float:
    """A 5.0 from 2 reviews shouldn't beat a 4.7 from 900."""
    if rating is None or reviews <= 0:
        return prior
    return (reviews * rating + weight * prior) / (reviews + weight)


def feature_keywords(feature: str) -> list[str]:
    return [t for t in tokens(feature) if t not in FEATURE_FILLER and len(t) > 2]


def match_features(listing: Listing, must_have: list[str]) -> list[str]:
    haystack = " ".join([listing.name, *listing.highlights]).lower()
    return [f for f in must_have if (kw := feature_keywords(f)) and all(k in haystack for k in kw)]


def _overlap(listing: Listing, query_tokens: list[str]) -> float:
    """Share of the query's words that appear in the title (compacted, so "wh" + "1000xm5" finds "WH-1000XM5")."""
    if not query_tokens:
        return 0.0
    name_tokens, compact = set(tokens(listing.name)), _compact(listing.name)
    return sum(1 for t in query_tokens if t in name_tokens or (len(t) > 2 and t in compact)) / len(query_tokens)


def is_accessory(listing: Listing, query_tokens: list[str]) -> bool:
    asked_for_accessory = any(t in ACCESSORY_WORDS for t in query_tokens)
    return not asked_for_accessory and any(t in ACCESSORY_WORDS for t in tokens(listing.name))


def rank(listings: list[Listing], intent: Intent, limit: int = 8) -> tuple[list[Listing], int]:
    """(best listings first, how many were dropped as suspiciously cheap)."""
    query_tokens = tokens(intent.search_query)
    model_tokens = _model_tokens(query_tokens)

    candidates = [l for l in listings if l.in_stock and not is_accessory(l, query_tokens)]

    wanted_qty = quantities(intent.search_query)
    if intent.mode == "product":
        # A named model must actually be in the title — "a36" must not match an A56.
        if model_tokens:
            candidates = [l for l in candidates if all(m in _compact(l.name) for m in model_tokens)]
        if wanted_qty:
            # A listing that states a different size is a different product;
            # one that states no size at all is kept (many titles omit it).
            candidates = [l for l in candidates if not (q := quantities(l.name)) or q & wanted_qty]
        if candidates:
            # Keep only listings that match as many of the query's words as
            # the best one does. Otherwise "miniket rice 5kg" lets in Jasmine
            # rice 5kg, and "sony wh-1000xm5" the WF-1000XM5 earbuds.
            best_overlap = max(_overlap(l, query_tokens) for l in candidates)
            candidates = [l for l in candidates if _overlap(l, query_tokens) >= best_overlap - 1e-9]

    # Anchor the floor on the official store's price when there is one: copies
    # can outnumber the real thing ("Sony WH-1000XM5" had four ৳2.5k clones
    # around one ৳28.9k original), which drags a median down with them.
    # Only for a named product — in "need" mode official listings span the
    # whole budget, so the median is the better reference there.
    official = [l.price for l in candidates if l.official_store] if intent.mode == "product" else []
    reference = max(official) if official else (Decimal(median(l.price for l in candidates)) if len(candidates) >= 4 else None)
    suspicious = 0
    if reference is not None:
        floor = reference * PRICE_FLOOR_RATIO
        suspicious = sum(1 for l in candidates if l.price < floor)
        candidates = [l for l in candidates if l.price >= floor]

    if intent.max_price is not None:
        candidates = [l for l in candidates if l.price <= intent.max_price]
    if intent.min_price is not None:
        candidates = [l for l in candidates if l.price >= intent.min_price]

    for listing in candidates:
        overlap = _overlap(listing, query_tokens)
        listing.matched_features = match_features(listing, intent.must_have)
        trust = (
            bayesian_rating(listing.rating, listing.reviews) / 5
            + min(math.log10(parse_sold(listing.sold) + 1) / 4, 1) * 0.5
            + (0.3 if listing.official_store else 0)
        )
        features = len(listing.matched_features) / len(intent.must_have) if intent.must_have else 0
        if intent.mode == "product":
            listing.relevance = round(overlap * 2 + trust, 3)
        else:
            # Someone with a ৳25k budget is shopping for the best phone near
            # ৳25k, not the cheapest thing under it.
            budget_fit = float(listing.price / intent.max_price) if intent.max_price else 0
            listing.relevance = round(features * 1.5 + trust + budget_fit * 0.8, 3)

    if intent.mode == "product":
        # Same product from several sellers: best match first, then cheapest.
        candidates.sort(key=lambda l: (-round(l.relevance, 1), l.price))
    else:
        candidates.sort(key=lambda l: (-l.relevance, l.price))
    return candidates[:limit], suspicious
