"""The agent: one shopper request in, one answer out.

    1. understand   intent.parse_intent        local LLM (~3s warm), rule fallback
    2. search       daraz.search               ~1s, live
    3. scope        product_category + search  only when step 2 is mostly accessories/noise (~2s)
    4. rank         ranking.rank               deterministic
    5. remember     store.lookup_history       last looked-up price, before recording this one
                    store.record_listings
    6. vouchers     store.load_vouchers        harvested in the background (vouchers.harvest)
    7. check        eligibility.check_all      published terms only, pure arithmetic
    8. answer       summarize                  template over computed facts — no free-form model text

Every step is timed and reported, because "within a very short time" is
the product's promise and has to stay measurable.
"""

from __future__ import annotations

import logging
import time
from decimal import Decimal

from sqlalchemy.orm import Session, sessionmaker

from . import daraz, store
from .eligibility import best_voucher, check_all, listing_hints
from .intent import parse_intent
from .llm import LLMUnavailable, chat_json
from .models import HistoryMatch, Intent, Listing, to_jsonable
from .ranking import rank
from .vouchers import active

log = logging.getLogger("agent.core")

# If the first, unscoped search leaves fewer usable listings than this after
# filtering, retry scoped to the right Daraz category.
MIN_GOOD_RESULTS = 5
RESULT_LIMIT = 6

CATEGORY_PROMPT = """A shopper on Daraz wants: {want}.
Which of these Daraz categories sells that item itself (not accessories, cases, parts or chargers for it)?
Categories (slug: title):
{options}
Return ONLY JSON: {{"slug": "<one slug from the list>"}} or {{"slug": null}} if none fits."""

CAVEATS = [
    "Vouchers are checked against their published terms (dates, minimum spend, cap, badges). Daraz makes the final call at checkout.",
    "Store vouchers and personal vouchers (new-user, Coins) only show to a logged-in Daraz account, so they aren't included.",
    "Daraz allows one platform voucher per order, so the best single voucher is shown, not a sum.",
]


def _money(value: Decimal | None) -> str:
    return "—" if value is None else f"৳{value:,.0f}"


def pick_category(intent: Intent, options: list[daraz.CategoryOption]) -> str | None:
    if not options:
        return None
    want = intent.product_type or intent.search_query
    if intent.product_type and intent.product_type.lower() != intent.search_query.lower():
        want = f"{intent.product_type} ({intent.search_query})"
    try:
        data = chat_json(
            "You classify shopping queries into store categories. Reply with JSON only.",
            CATEGORY_PROMPT.format(want=want, options="\n".join(f"{o.slug}: {o.title}" for o in options)),
            timeout=60,
        )
    except LLMUnavailable:
        return None
    slug = data.get("slug")
    return slug if any(o.slug == slug for o in options) else None


def _best_index(results: list[dict], intent: Intent) -> int | None:
    if not results:
        return None
    if intent.mode == "need":
        return 0  # ranking already weighed fit, trust and features
    # Named product: among listings as relevant as the top one, the lowest
    # price after the best usable voucher wins.
    top = results[0]["listing"].relevance
    close = [i for i, r in enumerate(results) if r["listing"].relevance >= top - 0.15]
    return min(close, key=lambda i: results[i]["final_price"])


def summarize(
    intent: Intent, results: list[dict], best: int | None, vouchers_known: int, suspicious: int = 0, seen: int = 0
) -> str:
    if best is None:
        budget = f" under {_money(intent.max_price)}" if intent.max_price else ""
        if seen:
            # e.g. "iphone 15": Daraz returns 40 cases and no phone.
            return (
                f"Daraz has no in-stock listing of \"{intent.search_query}\" itself{budget} right now — "
                f"the {seen} results it returned were accessories, other models, or out of stock."
            )
        return f"Nothing on Daraz matched \"{intent.search_query}\"{budget} right now."

    r = results[best]
    listing: Listing = r["listing"]
    parts = [f"Best deal: {listing.name} at {_money(listing.price)} from {listing.seller} on Daraz"]
    if listing.original_price:
        parts[0] += f" (was {_money(listing.original_price)}, {listing.discount_percent}% off)"
    parts[0] += "."

    bv = r["best_voucher"]
    if bv is not None:
        line = f"With the {bv.voucher.title} ({_money(bv.saving)} off) you'd pay {_money(r['final_price'])}"
        if bv.conditions:
            line += " (conditions: " + "; ".join(c[0].lower() + c[1:] for c in bv.conditions) + ")"
        parts.append(line + ".")
    elif vouchers_known:
        parts.append(f"None of the {vouchers_known} public Daraz vouchers we know of applies to this item.")
    else:
        parts.append("We have no current public Daraz vouchers on record.")

    h: HistoryMatch | None = r["history"]
    if h and h.last_price is not None:
        diff = listing.price - h.last_price
        trend = "same as" if diff == 0 else ("up from" if diff > 0 else "down from")
        parts.append(
            f"That's {trend} {_money(h.last_price)} when we last checked ({h.last_seen[:10]}); "
            f"lowest we've seen is {_money(h.lowest_price)} across {h.checks} checks."
        )
    else:
        parts.append("First time we've tracked this listing — its price is now saved for next time.")

    if intent.mode == "product" and len(results) > 1:
        prices = [x["listing"].price for x in results]
        parts.append(f"{len(results)} matching listings, from {_money(min(prices))} to {_money(max(prices))}.")
    if suspicious:
        parts.append(
            f"Skipped {suspicious} listing{'s' if suspicious > 1 else ''} priced far below the rest "
            "(often copies or placeholder prices)."
        )
    if intent.must_have:
        matched = listing.matched_features
        missing = [f for f in intent.must_have if f not in matched]
        if matched:
            parts.append(f"Listing mentions: {', '.join(matched)}.")
        if missing:
            parts.append(f"Not mentioned in the listing (check specs): {', '.join(missing)}.")
    return " ".join(parts)


def run(query: str, session_factory: sessionmaker | None = None) -> dict:
    t0 = time.perf_counter()
    timings: dict[str, int] = {}

    def lap(name: str, since: float) -> float:
        now = time.perf_counter()
        timings[name] = round((now - since) * 1000)
        return now

    intent = parse_intent(query)
    t = lap("understand", t0)

    first = daraz.search(intent.search_query, min_price=intent.min_price, max_price=intent.max_price)
    ranked, suspicious = rank(first.listings, intent, limit=RESULT_LIMIT)
    search_url, category = first.url, None
    t = lap("search", t)

    if len(ranked) < MIN_GOOD_RESULTS:
        # Category of the best real hit so far (its product page knows it);
        # only if there's no hit at all, ask the model to pick from Daraz's
        # (incomplete) filter options.
        category = daraz.product_category(ranked[0].url) if ranked else pick_category(intent, first.categories)
        if category:
            scoped = daraz.search(intent.search_query, category=category, min_price=intent.min_price, max_price=intent.max_price)
            # Merge, never replace: a seed listing filed under an odd category
            # ("refurbished" for a laptop) must not hide the first search's hits.
            merged = {l.item_id: l for l in first.listings + scoped.listings}
            rescored, rescored_suspicious = rank(list(merged.values()), intent, limit=RESULT_LIMIT)
            if len(rescored) > len(ranked):
                ranked, suspicious, search_url = rescored, rescored_suspicious, scoped.url
        t = lap("scope", t)

    history: dict[str, HistoryMatch] = {}
    vouchers = []
    db_status = "unavailable" if session_factory is None else ("not needed" if not ranked else "ok")
    if session_factory is not None and ranked:
        session: Session = session_factory()
        try:
            history = store.lookup_history(session, ranked)
            store.record_listings(session, ranked)
            vouchers = active(store.load_vouchers(session, "daraz"))
        except Exception as exc:  # DB down must never sink the answer
            session.rollback()
            db_status = "unavailable"
            log.warning("database step skipped: %s", exc.__class__.__name__)
        finally:
            session.close()
    t = lap("remember", t)

    results = []
    for listing in ranked:
        checks = check_all(vouchers, listing)
        bv = best_voucher(checks)
        results.append(
            {
                "listing": listing,
                "history": history.get(listing.item_id),
                "vouchers": checks,
                "best_voucher": bv,
                "final_price": listing.price - (bv.saving if bv else 0),
                "hints": listing_hints(listing),
            }
        )
    best = _best_index(results, intent)
    summary = summarize(intent, results, best, len(vouchers), suspicious, seen=len(first.listings))
    lap("check", t)
    timings["total"] = round((time.perf_counter() - t0) * 1000)

    return to_jsonable(
        {
            "query": query,
            "intent": intent,
            "category": category,
            "search_url": search_url,
            "best_index": best,
            "summary": summary,
            "results": results,
            "vouchers_known": len(vouchers),
            "skipped_suspicious": suspicious,
            "database": db_status,
            "caveats": CAVEATS,
            "timings_ms": timings,
        }
    )
