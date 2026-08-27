"""Orchestrates scraping across configured sites: fetch, parse, store, export."""

from __future__ import annotations

import logging
import time
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urljoin

from selenium.common.exceptions import StaleElementReferenceException, WebDriverException
from selenium.webdriver.support.ui import WebDriverWait

from .browser import find_cards, find_within, make_driver
from .models import Product
from .parsing import detect_currency, element_text, extract_percent, first_text, format_decimal, parse_money
from .sites import SiteConfig
from .storage import export_snapshot, record

log = logging.getLogger("scraper")

# Give SPA sites that render a loading skeleton first (their real class
# names are already in place, only the text nodes swap in on hydration) a
# moment to settle after cards first appear, so we don't read half-hydrated
# elements or race a DOM swap into a StaleElementReferenceException.
HYDRATION_SETTLE_SECONDS = 1.5


def scrape_url(site: SiteConfig, url: str, limit: int, headless: bool) -> list[Product]:
    driver = make_driver(headless)
    scraped_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    try:
        driver.get(url)
        WebDriverWait(driver, site.wait_seconds).until(
            lambda current: find_cards(current, site.card_selectors)
        )
        time.sleep(HYDRATION_SETTLE_SECONDS)

        products: list[Product] = []
        for card in find_cards(driver, site.card_selectors)[:limit]:
            try:
                name = first_text(card, site.name_selectors, find_within)
                current_text = first_text(card, site.price_selectors, find_within)
                original_text = first_text(card, site.original_price_selectors, find_within)
                discount_text = first_text(card, site.discount_selectors, find_within)

                # A site's card_selectors sometimes matches the <a> itself
                # (e.g. Cartup's `a[href^="/product/"]`), not a wrapper div
                # around one — searching only for a *nested* anchor missed
                # that case entirely and silently fell back to `url` (the
                # listing page) for every card, collapsing every product on
                # the page into one row via the (site, source_url) dedup.
                own_href = card.get_attribute("href") if card.tag_name == "a" else None
                if own_href:
                    source_url = urljoin(url, own_href)
                else:
                    anchors = find_within(card, "a[href]")
                    source_url = urljoin(url, anchors[0].get_attribute("href")) if anchors else url
                card_text = element_text(card)
            except StaleElementReferenceException:
                log.debug("%s: skipped a card that went stale mid-read", site.key)
                continue

            current_price = parse_money(current_text)
            original_price = parse_money(original_text)
            # Only trust a discount selector that's scoped to its own element.
            # Falling back to the whole card's text is tempting but wrong: on
            # several sites the price and discount badge sit right next to
            # each other with no separator (e.g. "...480" immediately
            # followed by "6%"), so a card-wide regex reads "4806%" as the
            # discount instead of "6%". Compute it from the two prices
            # instead when there's no dedicated element for it.
            discount = extract_percent(discount_text)
            if not discount and current_price and original_price and original_price > current_price:
                discount = format_decimal((original_price - current_price) / original_price * 100)
            currency = detect_currency(card_text)

            if name and current_price is not None:
                products.append(
                    Product(
                        site=site.key,
                        product_name=name,
                        current_price=format_decimal(current_price),
                        original_price=format_decimal(original_price),
                        discount_percent=discount,
                        currency=currency,
                        source_url=source_url,
                        scraped_at=scraped_at,
                    )
                )
        return products
    finally:
        driver.quit()


def scrape_url_with_retries(
    site: SiteConfig, url: str, limit: int, headless: bool, retries: int, retry_delay: float
) -> list[Product]:
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            products = scrape_url(site, url, limit, headless)
            if products:
                return products
            log.warning("%s: 0 products found on attempt %d/%d for %s", site.key, attempt, retries, url)
        except WebDriverException as error:
            last_error = error
            log.warning("%s: attempt %d/%d failed for %s: %s", site.key, attempt, retries, url, error)
        if attempt < retries:
            time.sleep(retry_delay)
    if last_error is not None:
        log.error("%s: all %d attempts failed for %s", site.key, retries, url)
    return []


def run_pipeline(
    sites: dict[str, SiteConfig],
    db_conn,
    export_path: Path,
    only: list[str] | None = None,
    limit: int = 24,
    headless: bool = True,
    retries: int = 2,
    retry_delay: float = 5.0,
) -> dict[str, int]:
    """Scrape every configured site (or just `only`), store history, export a snapshot."""
    targets = {key: cfg for key, cfg in sites.items() if only is None or key in only}
    counts: dict[str, int] = {}

    for key, site in targets.items():
        if not site.verified:
            log.warning("%s: selectors are unverified — results may be empty or wrong", key)
        site_total = 0
        for url in site.urls:
            log.info("%s: scraping %s", key, url)
            products = scrape_url_with_retries(site, url, limit, headless, retries, retry_delay)
            for product in products:
                record(db_conn, product)
            log.info("%s: stored %d products from %s", key, len(products), url)
            site_total += len(products)
        counts[key] = site_total

    exported = export_snapshot(db_conn, export_path)
    log.info("Exported %d products to %s", exported, export_path)
    return counts
