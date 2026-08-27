"""CLI entrypoint for the price-tracker scraping pipeline.

    python run_pipeline.py run                      # scrape every configured site once (products + banners)
    python run_pipeline.py run --only daraz,startech # scrape a subset
    python run_pipeline.py run --skip-banners        # products only
    python run_pipeline.py banners                   # (re-)scrape just the promo banners
    python run_pipeline.py loop --interval-minutes 15
    python run_pipeline.py inspect cartup            # dump rendered HTML/screenshot for selector tuning

Use only on sites that permit automated access. Keep request frequency low
and respect each site's terms, robots rules, and rate limits.
"""

from __future__ import annotations

import argparse
import logging
import time
from pathlib import Path

from scraper.banners import run_banners
from scraper.inspect_site import inspect_site
from scraper.pipeline import run_pipeline
from scraper.sites import DEFAULT_CONFIG_PATH, load_sites
from scraper.storage import connect

ROOT = Path(__file__).resolve().parent
DEFAULT_DB = ROOT / "data" / "pricetracker.db"
# The React app is a static site with no backend, so both snapshots it
# fetches at runtime have to be real files inside public/ that get built
# and deployed with everything else — not the gitignored data/ directory.
DEFAULT_EXPORT = ROOT / "public" / "products.json"
DEFAULT_BANNERS_EXPORT = ROOT / "public" / "banners.json"
DEFAULT_DEBUG_DIR = ROOT / "data" / "debug"


def parse_only(value: str | None) -> list[str] | None:
    if not value:
        return None
    return [item.strip() for item in value.split(",") if item.strip()]


def add_common_run_args(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--only", help="Comma-separated site keys to scrape (default: all configured sites)")
    parser.add_argument("--limit", type=int, default=150, help="Max products to collect per URL")
    parser.add_argument("--headed", action="store_true", help="Show Chrome while scraping")
    parser.add_argument("--retries", type=int, default=2, help="Attempts per URL before giving up")
    parser.add_argument("--retry-delay", type=float, default=5.0, help="Seconds to wait between retries")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB, help="SQLite history database path")
    parser.add_argument("--export", type=Path, default=DEFAULT_EXPORT, help="JSON snapshot output path")
    parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH, help="sites.yaml path")
    parser.add_argument("--skip-banners", action="store_true", help="Don't refresh promo banners this run")
    parser.add_argument("--banners-export", type=Path, default=DEFAULT_BANNERS_EXPORT, help="Banner JSON output path")


def cmd_run(args: argparse.Namespace) -> None:
    sites = load_sites(args.config)
    conn = connect(args.db)
    try:
        counts = run_pipeline(
            sites,
            conn,
            args.export,
            only=parse_only(args.only),
            limit=args.limit,
            headless=not args.headed,
            retries=args.retries,
            retry_delay=args.retry_delay,
        )
    finally:
        conn.close()
    for key, count in counts.items():
        print(f"{key}: {count} products")

    if not args.skip_banners:
        banner_counts = run_banners(sites, args.banners_export, only=parse_only(args.only), headless=not args.headed)
        for key, count in banner_counts.items():
            print(f"{key}: {count} banners")


def cmd_banners(args: argparse.Namespace) -> None:
    sites = load_sites(args.config)
    counts = run_banners(sites, args.export, only=parse_only(args.only), headless=not args.headed)
    for key, count in counts.items():
        print(f"{key}: {count} banners")


def cmd_loop(args: argparse.Namespace) -> None:
    interval_seconds = args.interval_minutes * 60
    while True:
        started = time.monotonic()
        try:
            cmd_run(args)
        except Exception:
            logging.getLogger("scraper").exception("Pipeline run failed; will retry next interval")
        elapsed = time.monotonic() - started
        sleep_for = max(interval_seconds - elapsed, 0)
        logging.getLogger("scraper").info("Sleeping %.0fs until next run", sleep_for)
        time.sleep(sleep_for)


def cmd_inspect(args: argparse.Namespace) -> None:
    sites = load_sites(args.config)
    if args.site not in sites:
        raise SystemExit(f"Unknown site '{args.site}'. Known sites: {', '.join(sorted(sites))}")
    site = sites[args.site]
    url = args.url or (site.urls[0] if site.urls else None)
    if not url:
        raise SystemExit(f"No URL configured for '{args.site}' and none passed via --url")

    html_path, png_path, card_count = inspect_site(site, url, headless=not args.headed, debug_dir=args.debug_dir)
    print(f"Rendered {url}")
    print(f"Matched {card_count} card(s) with current card_selectors: {site.card_selectors}")
    print(f"Saved HTML -> {html_path}")
    print(f"Saved screenshot -> {png_path}")
    if card_count == 0:
        print(
            "\nNo cards matched. Open the saved HTML, find the real product-card "
            "container class, and update card_selectors (and name/price selectors) "
            f"for '{args.site}' in {args.config}."
        )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--log-level", default="INFO", choices=["DEBUG", "INFO", "WARNING", "ERROR"])
    subparsers = parser.add_subparsers(dest="command", required=True)

    run_parser = subparsers.add_parser("run", help="Scrape every configured site once")
    add_common_run_args(run_parser)
    run_parser.set_defaults(func=cmd_run)

    loop_parser = subparsers.add_parser("loop", help="Run the pipeline repeatedly on a fixed interval")
    add_common_run_args(loop_parser)
    loop_parser.add_argument("--interval-minutes", type=float, default=15, help="Minutes between runs")
    loop_parser.set_defaults(func=cmd_loop)

    banners_parser = subparsers.add_parser("banners", help="(Re-)scrape just the promo banners, skipping products")
    banners_parser.add_argument("--only", help="Comma-separated site keys (default: all configured sites)")
    banners_parser.add_argument("--headed", action="store_true", help="Show Chrome while scraping")
    banners_parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH, help="sites.yaml path")
    banners_parser.add_argument("--export", type=Path, default=DEFAULT_BANNERS_EXPORT, help="Banner JSON output path")
    banners_parser.set_defaults(func=cmd_banners)

    inspect_parser = subparsers.add_parser("inspect", help="Render a site and dump HTML/screenshot for selector tuning")
    inspect_parser.add_argument("site", help="Site key from sites.yaml, e.g. cartup")
    inspect_parser.add_argument("--url", help="Override the URL to render (default: first configured URL)")
    inspect_parser.add_argument("--headed", action="store_true", help="Show Chrome while rendering")
    inspect_parser.add_argument("--config", type=Path, default=DEFAULT_CONFIG_PATH, help="sites.yaml path")
    inspect_parser.add_argument("--debug-dir", type=Path, default=DEFAULT_DEBUG_DIR, help="Where to save HTML/screenshots")
    inspect_parser.set_defaults(func=cmd_inspect)

    args = parser.parse_args()
    logging.basicConfig(level=args.log_level, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    args.func(args)


if __name__ == "__main__":
    main()
