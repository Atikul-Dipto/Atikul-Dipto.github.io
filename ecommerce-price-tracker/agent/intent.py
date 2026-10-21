"""Shopper request -> Intent. The local LLM does the reading (it handles
English, Bangla and mixed phrasing far better than rules), then every field
it returns is sanity-checked against the raw text:

- A budget is only kept if that number actually appears in the query
  (after normalizing Bangla digits and "25k" shorthand) — a model that
  invents a price ceiling would silently hide real results.
- Price words are stripped from search_query, because the budget is sent
  to Daraz as a real price filter; "phone under 25k" typed into Daraz's
  search box matches listing titles containing "25k", not phones under it.

If Ollama isn't running, parse_rules() gives a usable (dumber) Intent so the
agent still answers.
"""

from __future__ import annotations

import logging
import re
from decimal import Decimal

from .llm import LLMUnavailable, chat_json
from .models import Intent
from .ranking import QUANTITY_RE

log = logging.getLogger("agent.intent")

SYSTEM_PROMPT = """You turn a Bangladeshi online shopper's request into JSON for a product search on Daraz.
The request may be English, Bangla, or mixed. Return ONLY JSON with keys:
 "mode": "product" if they named a specific product or model (e.g. "Samsung Galaxy A36", "Miniket rice 5kg"), "need" if they described what they want (e.g. "phone under 25k with good camera"),
 "search_query": the short English keyword query to type into Daraz search, 2-6 words, NO price or budget words,
 "brand": brand name or null,
 "min_price": number in BDT or null,
 "max_price": number in BDT or null ("25k" means 25000),
 "must_have": list of short English feature phrases they asked for (empty list if none),
 "product_type": the kind of item in English, e.g. "smartphone", "headphones", "rice", "laptop"."""

BANGLA_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
NUMBER_RE = re.compile(r"(\d+(?:[.,]\d+)*)\s*(k|হাজার)?", re.IGNORECASE)
# Only budget words and price-sized numbers (k-suffixed, or 4+ digits) —
# small numbers are usually part of the product itself ("iPhone 15", "5kg").
PRICE_WORDS_RE = re.compile(
    r"\b(under|below|less than|within|upto|up to|budget|between|tk|taka|bdt)\b|৳|টাকা"
    r"|\b\d+(?:\.\d+)?\s*k\b|\b\d{1,3}(?:,\d{3})+\b|\b\d{4,}\b",
    re.IGNORECASE,
)
MAX_HINTS = re.compile(r"under|below|less than|within|upto|up to|max|budget|মধ্যে|নিচে|এর মধ্যে", re.IGNORECASE)
MIN_HINTS = re.compile(r"above|over|more than|at least|min|উপরে", re.IGNORECASE)


def normalize(text: str) -> str:
    return text.translate(BANGLA_DIGITS)


def query_numbers(text: str) -> set[Decimal]:
    """Every amount mentioned in the query, with "25k"/"25 হাজার" expanded."""
    found: set[Decimal] = set()
    for value, suffix in NUMBER_RE.findall(normalize(text)):
        try:
            amount = Decimal(value.replace(",", ""))
        except ArithmeticError:
            continue
        if suffix:
            amount *= 1000
        found.add(amount)
    return found


def _grounded_price(value, numbers: set[Decimal]) -> Decimal | None:
    if value in (None, "", 0):
        return None
    try:
        amount = Decimal(str(value))
    except ArithmeticError:
        return None
    return amount if amount in numbers else None


def _clean_search_query(query: str) -> str:
    cleaned = PRICE_WORDS_RE.sub(" ", normalize(query))
    return re.sub(r"\s+", " ", cleaned).strip()


def restore_model_numbers(query: str, search_query: str) -> str:
    """" 14" if the shopper typed "note 14" and the search text lost the 14."""
    have = set(re.findall(r"[a-z0-9]+", search_query.lower()))
    missing = [
        t for t in re.findall(r"[a-z0-9]+", _clean_search_query(query).lower())
        if re.search(r"\d", t) and t not in have and not QUANTITY_RE.fullmatch(t)
    ]
    return " " + " ".join(missing) if missing else ""


def parse_rules(query: str) -> Intent:
    """No-LLM fallback: budget from regex, everything else is the raw text."""
    text = normalize(query)
    numbers = sorted(n for n in query_numbers(text) if n >= 100)  # skip "5kg", "128GB"-sized numbers
    min_price = max_price = None
    if len(numbers) >= 2 and re.search(r"between|-|to", text, re.IGNORECASE):
        min_price, max_price = numbers[0], numbers[-1]
    elif numbers and MAX_HINTS.search(text):
        max_price = numbers[-1]
    elif numbers and MIN_HINTS.search(text):
        min_price = numbers[0]
    has_budget = min_price is not None or max_price is not None
    return Intent(
        raw_query=query,
        mode="need" if has_budget else "product",
        search_query=_clean_search_query(query) or query,
        min_price=min_price,
        max_price=max_price,
        source="rules",
    )


def parse_intent(query: str) -> Intent:
    query = query.strip()
    try:
        data = chat_json(SYSTEM_PROMPT, query)
    except LLMUnavailable as exc:
        log.warning("LLM unavailable, using rule-based intent: %s", exc)
        return parse_rules(query)

    numbers = query_numbers(query)
    brand = data.get("brand") or None
    product_type = data.get("product_type") or None
    search_query = _clean_search_query(str(data.get("search_query") or "")) or _clean_search_query(query) or query
    must_have = [str(f).strip() for f in (data.get("must_have") or []) if str(f).strip()]
    min_price = _grounded_price(data.get("min_price"), numbers)
    max_price = _grounded_price(data.get("max_price"), numbers)
    # Decided by rule, not by the model's "mode": it flip-flops on cases like
    # "miniket rice 5kg" (no brand -> "need" -> searched just "rice"). A budget
    # or a wished-for feature is what makes it a need; otherwise the shopper
    # named the thing, and Daraz should be searched for exactly that.
    mode = "need" if (max_price or min_price or must_have) else "product"

    if mode == "need" and product_type:
        # Search for the kind of item; the wished-for features are for
        # ranking. Typed into Daraz, "phone camera" finds security cameras
        # and feature phones, while "smartphone" + a price filter finds phones.
        search_query = f"{brand} {product_type}" if brand else product_type
        must_have = [f for f in must_have if not QUANTITY_RE.fullmatch(f.strip())]
    else:
        # The model tends to drop sizes ("miniket rice 5kg" -> "miniket rice"),
        # which is exactly what tells a 5kg bag from a 25kg sack.
        size = QUANTITY_RE.search(normalize(query))
        if size and not QUANTITY_RE.search(search_query):
            search_query = f"{search_query} {size.group(1)}{size.group(2).lower()}"
        # ...and model numbers: "Xiaomi Redmi Note 14" came back as "Xiaomi
        # Redmi Note", which found a Note 17.
        search_query += restore_model_numbers(query, search_query)
        must_have = [f for f in must_have if not QUANTITY_RE.fullmatch(f.strip())]

    return Intent(
        raw_query=query,
        mode=mode,
        search_query=search_query,
        product_type=product_type,
        brand=brand,
        min_price=min_price,
        max_price=max_price,
        must_have=must_have,
        source="llm",
    )
