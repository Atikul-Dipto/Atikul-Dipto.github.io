"""Debug helper: render a site's page and save the post-JS HTML + a screenshot
so selectors can be read off the real DOM instead of guessed.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from pathlib import Path

from selenium.webdriver.support.ui import WebDriverWait

from .browser import find_cards, make_driver
from .sites import SiteConfig

log = logging.getLogger("scraper")


def inspect_site(site: SiteConfig, url: str, headless: bool, debug_dir: Path) -> tuple[Path, Path, int]:
    debug_dir.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    html_path = debug_dir / f"{site.key}_{stamp}.html"
    png_path = debug_dir / f"{site.key}_{stamp}.png"

    driver = make_driver(headless)
    try:
        driver.get(url)
        try:
            WebDriverWait(driver, site.wait_seconds).until(
                lambda current: find_cards(current, site.card_selectors)
            )
        except Exception:
            log.warning("%s: none of the configured card_selectors matched within %ss", site.key, site.wait_seconds)

        cards = find_cards(driver, site.card_selectors)
        html_path.write_text(driver.page_source, encoding="utf-8")
        driver.save_screenshot(str(png_path))
        return html_path, png_path, len(cards)
    finally:
        driver.quit()
