"""Scrape orchestration: reuses the existing scraper package's extraction
functions (storage-agnostic — they return plain dataclasses) and writes
into Postgres via scraper.storage_pg. Runs on an APScheduler background
thread pool so Selenium's blocking calls never block the API.
"""

from __future__ import annotations

import logging

from apscheduler.schedulers.background import BackgroundScheduler

from scraper.banners import scrape_banners
from scraper.pipeline import scrape_url_with_retries
from scraper.sites import SiteConfig, load_sites
from scraper.storage_pg import record, record_banner

from .config import settings
from .db import SessionLocal

log = logging.getLogger("backend.scheduler")

scheduler = BackgroundScheduler()


def _targets(only: list[str] | None) -> dict[str, SiteConfig]:
    sites = load_sites()
    return {key: cfg for key, cfg in sites.items() if only is None or key in only}


def run_scrape_job(only: list[str] | None = None, headless: bool | None = None, limit: int = 24) -> None:
    """Scrape products (and banners) for the given sites, write to Postgres."""
    headless_flag = settings.headless if headless is None else headless

    with SessionLocal() as session:
        for key, site in _targets(only).items():
            try:
                for url in site.urls:
                    log.info("%s: scraping %s", key, url)
                    products = scrape_url_with_retries(
                        site, url, limit=limit, headless=headless_flag, retries=2, retry_delay=5.0
                    )
                    for product in products:
                        record(session, product)
                    log.info("%s: stored %d products from %s", key, len(products), url)

                if site.banner_url and site.banner_selectors:
                    banners = scrape_banners(site, headless_flag)
                    for banner in banners:
                        record_banner(session, banner)
                    log.info("%s: stored %d banners", key, len(banners))
            except Exception:
                log.exception("%s: scrape job failed, continuing with remaining sites", key)


def run_banner_job(only: list[str] | None = None, headless: bool | None = None) -> None:
    """Banners only — mirrors run_pipeline.py's `banners` subcommand."""
    headless_flag = settings.headless if headless is None else headless

    with SessionLocal() as session:
        for key, site in _targets(only).items():
            if not site.banner_url or not site.banner_selectors:
                continue
            try:
                banners = scrape_banners(site, headless_flag)
                for banner in banners:
                    record_banner(session, banner)
                log.info("%s: stored %d banners", key, len(banners))
            except Exception:
                log.exception("%s: banner scrape failed, continuing with remaining sites", key)


def start_scheduler() -> None:
    """Start the (empty) scheduler so manual /api/scrape/* triggers work.
    The automatic interval job is added separately by schedule_periodic_job()
    once the manual path is verified end to end.
    """
    if not scheduler.running:
        scheduler.start()


def schedule_periodic_job() -> None:
    scheduler.add_job(
        run_scrape_job,
        "interval",
        minutes=settings.scrape_interval_minutes,
        id="periodic-scrape",
        replace_existing=True,
    )
    if settings.scrape_on_startup:
        scheduler.add_job(run_scrape_job, id="startup-scrape", replace_existing=True)
