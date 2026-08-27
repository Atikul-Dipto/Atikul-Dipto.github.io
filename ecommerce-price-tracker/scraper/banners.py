"""Scrapes homepage promo/offer banners: an image and where it links to.

Separate from product scraping — different page (usually the homepage,
not a search/category URL), different DOM shape (one image + one link,
nothing to parse as a price), and only worth running for sites where
`banner_selectors` has been configured and verified in sites.yaml.
"""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

from selenium.common.exceptions import WebDriverException
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait

from .browser import find_cards, make_driver
from .sites import SiteConfig

log = logging.getLogger("scraper")

BACKGROUND_IMAGE_RE = re.compile(r'url\(["\']?([^"\')]+)["\']?\)')
WINDOW_OPEN_RE = re.compile(r'window\.open\(["\']([^"\']+)["\']')


@dataclass
class Banner:
    site: str
    image_url: str
    link_url: str
    scraped_at: str


def _extract_image(element, image_attr: str) -> str | None:
    imgs = element.find_elements(By.CSS_SELECTOR, "img")
    if imgs:
        src = imgs[0].get_attribute("src")
        if src:
            return src
    if image_attr:
        value = element.get_attribute(image_attr)
        if value:
            return value
    style = element.get_attribute("style") or ""
    match = BACKGROUND_IMAGE_RE.search(style)
    if match:
        return match.group(1)
    return None


def _extract_link(element, base_url: str, link_attr: str) -> str | None:
    if element.tag_name == "a":
        href = element.get_attribute("href")
        if href:
            return href
    anchors = element.find_elements(By.CSS_SELECTOR, "a[href]")
    if anchors:
        href = anchors[0].get_attribute("href")
        if href:
            return href
    if link_attr:
        raw = element.get_attribute(link_attr) or ""
        match = WINDOW_OPEN_RE.search(raw)
        if match:
            return urljoin(base_url, match.group(1))
    return None


def scrape_banners(site: SiteConfig, headless: bool) -> list[Banner]:
    if not site.banner_url or not site.banner_selectors:
        return []

    driver = make_driver(headless)
    scraped_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        driver.get(site.banner_url)
        WebDriverWait(driver, site.wait_seconds).until(
            lambda current: find_cards(current, site.banner_selectors)
        )
        time.sleep(1.5)  # let lazy-loaded slide images/hydration settle

        banners: list[Banner] = []
        seen_images: set[str] = set()
        for element in find_cards(driver, site.banner_selectors):
            image_url = _extract_image(element, site.banner_image_attr)
            if not image_url or image_url in seen_images:
                continue
            link_url = _extract_link(element, site.banner_url, site.banner_link_attr)
            seen_images.add(image_url)
            banners.append(
                Banner(
                    site=site.key,
                    image_url=urljoin(site.banner_url, image_url),
                    link_url=link_url or site.banner_url,
                    scraped_at=scraped_at,
                )
            )
        return banners
    except WebDriverException as error:
        log.warning("%s: banner scrape failed: %s", site.key, error)
        return []
    finally:
        driver.quit()


def _load_existing(export_path: Path) -> list[dict]:
    if not export_path.exists():
        return []
    try:
        return json.loads(export_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return []


def run_banners(
    sites: dict[str, SiteConfig],
    export_path: Path,
    only: list[str] | None = None,
    headless: bool = True,
) -> dict[str, int]:
    """Scrape banners for every configured site that has them, export one JSON file.

    Banners have no SQLite history behind them (they rotate too often to be
    worth keeping), so unlike products.json, a partial --only run has
    nothing to fall back on for the sites it skipped. Merge onto whatever
    export_path already has instead of overwriting it, or `--only` would
    silently wipe out every other site's banners.
    """
    targets = {key: cfg for key, cfg in sites.items() if only is None or key in only}
    counts: dict[str, int] = {}
    scraped_banners: list[Banner] = []

    for key, site in targets.items():
        if not site.banner_url or not site.banner_selectors:
            continue
        log.info("%s: scraping banners from %s", key, site.banner_url)
        banners = scrape_banners(site, headless)
        log.info("%s: found %d banner(s)", key, len(banners))
        counts[key] = len(banners)
        scraped_banners.extend(banners)

    untouched = [b for b in _load_existing(export_path) if b.get("site") not in targets]
    combined = untouched + [asdict(b) for b in scraped_banners]

    export_path.parent.mkdir(parents=True, exist_ok=True)
    export_path.write_text(json.dumps(combined, indent=2), encoding="utf-8")
    log.info("Exported %d banners to %s", len(combined), export_path)
    return counts
