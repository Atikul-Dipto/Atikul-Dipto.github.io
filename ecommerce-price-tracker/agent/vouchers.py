"""Public Daraz vouchers: where they actually are, and how they're read.

Findings from probing live pages on 2026-10-21 (logged out, like every
visitor this agent can act as):

- Product pages show NO vouchers to a logged-out visitor — the page never
  even requests its voucher list (`mtop.lazada.detail.getVouchers`) without
  a session. Calling that signed internal API directly was deliberately not
  attempted: it's Daraz's anti-abuse-protected client API, the same line
  this project already drew at Ryans' Cloudflare challenge.
- /collectible-vouchers/, /bkash-offers/ and /payment-partners/ are stale
  (product grids or a redirect home), not voucher lists.
- Campaign pages linked from the homepage (pages.daraz.com.bd/wow/...) DO
  publish platform vouchers publicly, e.g. on the bKash Choice page:
  "Daraz Voucher · bKash Choice Exclusive · ৳50 · min spend ৳399 ·
  16/10/2026-22/10/2026". These render client-side, so this is the one
  part of the agent that needs Selenium (~15-20s/page) — which is why
  harvesting runs in the background on a schedule and the agent reads the
  cached result, instead of a shopper waiting on it.

Cards are located by shape, not CSS class (Daraz's campaign builder emits
unstable generated markup): the smallest element containing a date range,
a ৳ amount and a minimum-spend line, widened to the largest ancestor that
still contains only that one date range. The text is then parsed by
parse_card(), which handles the Bangla and English variants of the page.
"""

from __future__ import annotations

import logging
import re
import time
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from urllib.parse import parse_qs, urlparse

import requests

from .daraz import BASE, HEADERS
from .models import Voucher

log = logging.getLogger("agent.vouchers")

BANGLA_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
DATE_RANGE_RE = re.compile(r"(\d{1,2})/(\d{1,2})/(\d{4})\s*-\s*(\d{1,2})/(\d{1,2})/(\d{4})")
MIN_SPEND_RE = re.compile(r"(?:min(?:imum)?\.?\s*(?:spend|purchase|order)?|মিন\.?\s*খরচ\s*করুন)[^\d]*?([\d,]+)", re.IGNORECASE)
CAP_RE = re.compile(r"(?:capped at|cap|max(?:imum)?\.?\s*discount|up to|সর্বোচ্চ)[^\d]*?([\d,]+)", re.IGNORECASE)
PERCENT_RE = re.compile(r"(\d+(?:\.\d+)?)\s*%")
AMOUNT_RE = re.compile(r"৳\s*([\d,]+)")
# Card chrome that isn't a label: buttons, the currency sign on its own line, bare numbers.
NOISE_LINES = {"t&c", "collect", "collected", "সংগ্রহ", "সংগৃহীত", "৳", "use", "shop now", "off"}
LABEL_TRANSLATIONS = {
    "সীমিত রিডেম্পশন": "Limited redemption",
    "নতুন ব্যবহারকারী": "New users only",
}
# Homepage links that look like campaigns but are help/policy pages.
SKIP_PAGE_HINTS = ("privacy", "return", "customer-tc", "help-page", "fast-delivery", "donation", "daraz-pay")
MAX_PAGES = 15

FIND_CARDS_JS = r"""
const DATE=/\d{1,2}\/\d{1,2}\/\d{4}\s*-\s*\d{1,2}\/\d{1,2}\/\d{4}/g;
const MIN=/(min|মিন)/i;
const dates = t => (t.match(DATE) || []).length;
const core = el => { const t = el.innerText || ''; return t.length < 400 && dates(t) === 1 && t.includes('৳') && MIN.test(t); };
const smallest = [...document.querySelectorAll('div,section,li,a')].filter(core).filter(el => ![...el.children].some(core));
const roots = new Set();
for (const el of smallest) {
  let card = el;
  while (card.parentElement && dates(card.parentElement.innerText || '') === 1 && (card.parentElement.innerText || '').length < 600) {
    card = card.parentElement;
  }
  roots.add(card);
}
return [...roots].map(el => el.innerText);
"""


def _money(text: str) -> Decimal | None:
    try:
        return Decimal(text.replace(",", ""))
    except InvalidOperation:
        return None


def parse_card(text: str, source_url: str, site: str = "daraz") -> Voucher | None:
    """One voucher card's visible text -> Voucher. None if it isn't one."""
    norm = text.translate(BANGLA_DIGITS)
    dates = DATE_RANGE_RE.search(norm)
    if not dates:
        return None
    d1, m1, y1, d2, m2, y2 = (int(g) for g in dates.groups())
    try:
        valid_from, valid_to = date(y1, m1, d1), date(y2, m2, d2)
    except ValueError:
        return None

    flat = re.sub(r"\s+", " ", norm)
    min_match = MIN_SPEND_RE.search(flat)
    min_spend = _money(min_match.group(1)) if min_match else None
    cap_match = CAP_RE.search(flat)
    max_discount = _money(cap_match.group(1)) if cap_match else None

    # The headline amount is whatever ৳/% figure is left once the min-spend
    # and cap phrases (which also carry ৳ figures) are cut out.
    headline = flat
    for match in (min_match, cap_match):
        if match:
            headline = headline.replace(match.group(0), " ")
    headline = DATE_RANGE_RE.sub(" ", headline)
    percent_match = PERCENT_RE.search(headline)
    percent = _money(percent_match.group(1)) if percent_match else None
    amount = None
    if percent is None:
        amount_match = AMOUNT_RE.search(headline)
        amount = _money(amount_match.group(1)) if amount_match else None
    if amount is None and percent is None:
        return None

    title = "Voucher"
    labels: list[str] = []
    for line in (l.strip() for l in norm.splitlines()):
        if not line or line.lower() in NOISE_LINES or not re.search(r"[^\W\d_]", line):
            continue
        if DATE_RANGE_RE.search(line) or MIN_SPEND_RE.search(line) or CAP_RE.search(line) or PERCENT_RE.search(line):
            continue
        if "voucher" in line.lower() and title == "Voucher":
            title = line
            continue
        labels.append(LABEL_TRANSLATIONS.get(line, line))

    return Voucher(
        site=site,
        title=title,
        labels=labels,
        amount=amount,
        percent=percent,
        max_discount=max_discount,
        min_spend=min_spend,
        valid_from=valid_from,
        valid_to=valid_to,
        source_url=source_url,
        raw_text=text.strip(),
    )


def discover_campaign_pages() -> list[str]:
    """Campaign page URLs currently linked from the Daraz homepage."""
    html = requests.get(BASE + "/", headers={**HEADERS, "Accept": "text/html"}, timeout=20).text
    html = html.replace("\\u002F", "/").replace("&amp;", "&")
    seen: dict[str, str] = {}
    for url in re.findall(r"(?:https?:)?//pages\.daraz\.com\.bd/wow/[^\"'\s<>]+", html):
        url = "https:" + url if url.startswith("//") else url
        query = parse_qs(urlparse(url).query)
        key = query.get("wh_pid", [urlparse(url).path])[0]
        if any(hint in key.lower() for hint in SKIP_PAGE_HINTS) or key in seen:
            continue
        seen[key] = url
    return list(seen.values())[:MAX_PAGES]


def harvest(headless: bool = True, pages: list[str] | None = None) -> list[Voucher]:
    """Render each campaign page and collect every voucher card on it."""
    from scraper.browser import make_driver  # Selenium only loads for the harvest job

    pages = pages if pages is not None else discover_campaign_pages()
    log.info("voucher harvest: %d campaign pages", len(pages))
    found: dict[tuple, Voucher] = {}
    driver = make_driver(headless)
    try:
        for url in pages:
            try:
                driver.get(url)
                time.sleep(6)
                for _ in range(3):  # voucher strips sometimes sit below the hero banner
                    driver.execute_script("window.scrollBy(0, 1200)")
                    time.sleep(0.8)
                texts = driver.execute_script(FIND_CARDS_JS) or []
            except Exception:
                log.exception("voucher harvest: failed on %s", url)
                continue
            parsed = [v for v in (parse_card(t, url) for t in texts) if v is not None]
            for voucher in parsed:
                key = (voucher.title, voucher.amount, voucher.percent, voucher.min_spend, voucher.valid_to, tuple(voucher.labels))
                found.setdefault(key, voucher)
            log.info("voucher harvest: %d vouchers on %s", len(parsed), url)
    finally:
        driver.quit()
    return list(found.values())


def active(vouchers: list[Voucher], today: date | None = None) -> list[Voucher]:
    today = today or datetime.now().date()
    return [v for v in vouchers if (v.valid_from is None or v.valid_from <= today) and (v.valid_to is None or v.valid_to >= today)]
