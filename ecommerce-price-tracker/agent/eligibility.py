"""Does this voucher work on this listing? Checked against the voucher's
*published* terms only — dates, minimum spend, cap, and the badges printed
on the card (payment method, new users, Mall-only). Pure arithmetic; the
LLM never touches a saving figure.

What this can't know, and says so instead of guessing:
- Whether a campaign voucher covers this specific item. Daraz doesn't
  publish item lists for platform vouchers to logged-out visitors.
- Store vouchers and personal vouchers (new-user, Coins), which Daraz only
  shows to a logged-in account. The listing's own badges are passed on as
  hints instead (see listing_hints()).

Daraz allows one platform voucher per order, so best_voucher() picks the
single biggest saving rather than summing them.
"""

from __future__ import annotations

import re
from datetime import date, datetime
from decimal import ROUND_DOWN, Decimal
from urllib.parse import parse_qs, urlparse

from .models import Listing, Voucher, VoucherCheck

# Card badges with a well-known meaning. Anything else printed on a card is
# passed through verbatim as a condition rather than interpreted — e.g.
# "bKash Choice Exclusive" could mean a payment method, a campaign, or both,
# and guessing which would put words in Daraz's mouth.
CONDITION_LABELS = {
    "bkash": "Pay with bKash",
    "nagad": "Pay with Nagad",
    "card": "Pay with the bank card named on the voucher",
    "bank": "Pay with the bank card named on the voucher",
    "new user": "New Daraz accounts only",
    "first order": "First order only",
    "app": "Only in the Daraz app",
    "limited redemption": "Limited redemptions — can run out",
}
MALL_LABELS = ("mall", "lazmall", "daraz mall")

BADGE_HINTS = {
    "FreeshippingAndVoucherMax": "Seller is in Daraz's voucher programme — log in to see store vouchers on this item.",
    "coinsAndFreeshipping": "Daraz Coins can be used, and shipping is free.",
    "coins": "Daraz Coins can be used on this item.",
    "Freeshipping": "Free shipping.",
    "lazMall": "Daraz Mall (official brand store).",
}


def campaign_name(source_url: str) -> str | None:
    """"bKashChoice" from ...?wh_pid=/lazada/channel/bd/weekly-campaigns/bKashChoice."""
    pid = parse_qs(urlparse(source_url).query).get("wh_pid", [""])[0]
    slug = pid.rstrip("/").rsplit("/", 1)[-1]
    if not slug or slug == "home":
        return None
    return re.sub(r"[-_]+", " ", slug)


def _money(value: Decimal) -> str:
    return f"৳{value:,.0f}"


def saving_for(voucher: Voucher, price: Decimal) -> Decimal:
    if voucher.amount is not None:
        saving = voucher.amount
    elif voucher.percent is not None:
        saving = (price * voucher.percent / 100).quantize(Decimal("1"), rounding=ROUND_DOWN)
        if voucher.max_discount is not None:
            saving = min(saving, voucher.max_discount)
    else:
        saving = Decimal(0)
    return min(saving, price)


def check(voucher: Voucher, listing: Listing, today: date | None = None) -> VoucherCheck:
    today = today or datetime.now().date()
    reasons: list[str] = []

    if voucher.valid_to and voucher.valid_to < today:
        return VoucherCheck(voucher, "not_applicable", Decimal(0), [f"Expired on {voucher.valid_to:%d %b %Y}."])
    if voucher.valid_from and voucher.valid_from > today:
        return VoucherCheck(voucher, "not_applicable", Decimal(0), [f"Starts {voucher.valid_from:%d %b %Y}."])

    if voucher.min_spend is not None and listing.price < voucher.min_spend:
        gap = voucher.min_spend - listing.price
        return VoucherCheck(
            voucher,
            "not_applicable",
            Decimal(0),
            [f"Needs a {_money(voucher.min_spend)} order; this item is {_money(listing.price)} ({_money(gap)} short)."],
        )

    labels = " ".join(voucher.labels).lower()
    if any(m in labels for m in MALL_LABELS) and not listing.official_store:
        return VoucherCheck(voucher, "not_applicable", Decimal(0), ["Daraz Mall items only; this seller isn't a Mall store."])

    conditions = sorted({text for key, text in CONDITION_LABELS.items() if key in labels})
    conditions += [f'Labelled "{label}"' for label in voucher.labels if not any(k in label.lower() for k in CONDITION_LABELS)]
    campaign = campaign_name(voucher.source_url)
    if campaign:
        conditions.append(f"Published on the {campaign} campaign page — may only cover that campaign's items")
    saving = saving_for(voucher, listing.price)
    if voucher.min_spend is not None:
        reasons.append(f"Order is over the {_money(voucher.min_spend)} minimum.")
    if voucher.valid_to:
        reasons.append(f"Valid until {voucher.valid_to:%d %b %Y}.")
    if voucher.percent is not None and voucher.max_discount is not None and saving == voucher.max_discount:
        reasons.append(f"{voucher.percent:f}% off, capped at {_money(voucher.max_discount)}.")
    return VoucherCheck(voucher, "conditional" if conditions else "applies", saving, reasons, conditions)


def check_all(vouchers: list[Voucher], listing: Listing, today: date | None = None) -> list[VoucherCheck]:
    order = {"applies": 0, "conditional": 1, "not_applicable": 2}
    checks = [check(v, listing, today) for v in vouchers]
    return sorted(checks, key=lambda c: (order[c.status], -c.saving))


def best_voucher(checks: list[VoucherCheck]) -> VoucherCheck | None:
    """Biggest saving among usable vouchers; an unconditional one wins a tie."""
    usable = [c for c in checks if c.status != "not_applicable" and c.saving > 0]
    if not usable:
        return None
    return max(usable, key=lambda c: (c.saving, c.status == "applies"))


def listing_hints(listing: Listing) -> list[str]:
    return [BADGE_HINTS[b] for b in dict.fromkeys(listing.badges) if b in BADGE_HINTS]
