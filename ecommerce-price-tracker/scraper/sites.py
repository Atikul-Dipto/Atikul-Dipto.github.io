"""Per-site scraping configuration, loaded from sites.yaml."""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path

import yaml

DEFAULT_CONFIG_PATH = Path(__file__).resolve().parent.parent / "sites.yaml"


@dataclass
class SiteConfig:
    key: str
    name: str
    urls: list[str]
    card_selectors: list[str]
    name_selectors: list[str]
    price_selectors: list[str]
    original_price_selectors: list[str] = field(default_factory=list)
    discount_selectors: list[str] = field(default_factory=list)
    verified: bool = False
    notes: str = ""
    wait_seconds: int = 20


def load_sites(path: Path = DEFAULT_CONFIG_PATH) -> dict[str, SiteConfig]:
    raw = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
    sites: dict[str, SiteConfig] = {}
    for key, entry in raw.items():
        sites[key] = SiteConfig(
            key=key,
            name=entry.get("name", key),
            urls=list(entry.get("urls", [])),
            card_selectors=list(entry.get("card_selectors", [])),
            name_selectors=list(entry.get("name_selectors", [])),
            price_selectors=list(entry.get("price_selectors", [])),
            original_price_selectors=list(entry.get("original_price_selectors", [])),
            discount_selectors=list(entry.get("discount_selectors", [])),
            verified=bool(entry.get("verified", False)),
            notes=entry.get("notes", ""),
            wait_seconds=int(entry.get("wait_seconds", 20)),
        )
    return sites
