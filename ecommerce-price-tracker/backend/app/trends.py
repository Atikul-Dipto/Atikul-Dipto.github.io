"""Trend stats computed directly from real price_history rows — arithmetic,
not a model. This is deliberately the whole "prediction" story for now:
with ~1 day of scrape history, there isn't remotely enough depth for a
time-series forecast to mean anything, and shipping one anyway would look
like a prediction while really being noise. See narration.py for the one
place a model is actually used, and the guardrails around it.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal


@dataclass
class Trend:
    checks: int
    window_days: float
    first_price: Decimal
    last_price: Decimal
    change_pct: Decimal | None
    direction: str  # "up" | "down" | "flat"
    lowest_price: Decimal
    lowest_at: datetime
    highest_price: Decimal
    highest_at: datetime
    streak_direction: str
    streak_length: int


def _direction(delta: Decimal) -> str:
    if delta > Decimal("0.01"):
        return "up"
    if delta < Decimal("-0.01"):
        return "down"
    return "flat"


def compute_trend(points: list) -> Trend | None:
    """points: PriceHistoryORM rows, ascending by scraped_at, current_price
    non-null. Returns None if there's nothing to compute (need >= 1 point
    with a price; a single point still yields a trend with checks=1).
    """
    priced = [p for p in points if p.current_price is not None]
    if not priced:
        return None

    first, last = priced[0], priced[-1]
    window_days = max((last.scraped_at - first.scraped_at).total_seconds() / 86400, 0.0)

    change_pct = None
    if first.current_price:
        change_pct = (last.current_price - first.current_price) / first.current_price * 100

    lowest = min(priced, key=lambda p: p.current_price)
    highest = max(priced, key=lambda p: p.current_price)

    streak_direction = "flat"
    streak_length = 0
    if len(priced) > 1:
        steps = [_direction(b.current_price - a.current_price) for a, b in zip(priced, priced[1:])]
        streak_direction = steps[-1]
        for step in reversed(steps):
            if step != streak_direction:
                break
            streak_length += 1

    return Trend(
        checks=len(priced),
        window_days=round(window_days, 2),
        first_price=first.current_price,
        last_price=last.current_price,
        change_pct=change_pct.quantize(Decimal("0.01")) if change_pct is not None else None,
        direction=_direction(last.current_price - first.current_price),
        lowest_price=lowest.current_price,
        lowest_at=lowest.scraped_at,
        highest_price=highest.current_price,
        highest_at=highest.scraped_at,
        streak_direction=streak_direction,
        streak_length=streak_length,
    )
