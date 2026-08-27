"""Text-to-value helpers shared by every site scraper."""

from __future__ import annotations

import re
from decimal import Decimal, InvalidOperation
from typing import Iterable

CURRENCY_MARKERS = {"BDT": ["৳", "Tk", "TK", "tk"]}


def parse_money(text: str) -> Decimal | None:
    """Parse a price while preserving decimal values such as 1,299.50."""
    if not text:
        return None
    cleaned = re.sub(r"[^0-9.]", "", text.replace(",", ""))
    if not cleaned:
        return None
    try:
        return Decimal(cleaned)
    except InvalidOperation:
        return None


def format_decimal(value: Decimal | None) -> str:
    if value is None:
        return ""
    return f"{value:.2f}".rstrip("0").rstrip(".")


def extract_percent(text: str) -> str:
    match = re.search(r"(\d+(?:\.\d+)?)\s*%", text or "")
    return match.group(1) if match else ""


def detect_currency(text: str) -> str:
    for code, markers in CURRENCY_MARKERS.items():
        if any(marker in text for marker in markers):
            return code
    return ""


def element_text(element) -> str:
    """Read an element's raw text content, not its rendered `.text`.

    Selenium's `.text` returns "" for elements it considers not displayed
    (off-screen carousel slides, pre-hydration skeleton wrappers, etc.),
    which silently drops real product data on several of the tracked
    sites. `textContent` returns the text regardless of visibility.

    Some compact card layouts (e.g. Cartup's secondary "trending" widget)
    skip a visible name label entirely and rely on the product image's
    alt text instead — textContent is empty for an <img> since alt is an
    attribute, not a text node, so fall back to it specifically for img
    elements rather than silently returning nothing.
    """
    text = (element.get_attribute("textContent") or "").strip()
    if text:
        return text
    if element.tag_name == "img":
        return (element.get_attribute("alt") or "").strip()
    return ""


def first_text(card, selectors: Iterable[str], by_css_selector) -> str:
    """Return the first non-empty text match for any selector, searched in order."""
    for selector in selectors:
        for element in by_css_selector(card, selector):
            text = element_text(element)
            if text:
                return text
    return ""
