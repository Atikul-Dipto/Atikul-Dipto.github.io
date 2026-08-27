"""Data model for a single scraped product observation."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class Product:
    site: str
    product_name: str
    current_price: str
    original_price: str
    discount_percent: str
    currency: str
    source_url: str
    scraped_at: str
