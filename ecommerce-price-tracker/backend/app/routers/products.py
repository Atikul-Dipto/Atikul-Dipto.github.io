from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from .. import crud
from ..db import get_db
from ..narration import generate_summary
from ..schemas import ProductHistoryOut, ProductListOut, ProductOut, TrendOut
from ..trends import compute_trend

router = APIRouter()


def _row_to_product_out(row) -> ProductOut:
    return ProductOut(
        id=row.id,
        site=row.site,
        product_name=row.product_name,
        source_url=row.source_url,
        current_price=row.current_price,
        original_price=row.original_price,
        previous_price=row.previous_price,
        discount_percent=row.discount_percent,
        currency=row.currency,
        first_seen=row.first_seen,
        scraped_at=row.scraped_at,
    )


@router.get("/products", response_model=ProductListOut)
def list_products(
    q: str | None = None,
    site: str | None = None,
    sort: str = Query("discount", pattern="^(discount|price_asc|price_desc|newest)$"),
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db),
) -> ProductListOut:
    total, rows = crud.list_products(db, q=q, site=site, sort=sort, limit=limit, offset=offset)
    return ProductListOut(count=total, results=[_row_to_product_out(r) for r in rows])


@router.get("/products/{product_id}", response_model=ProductOut)
def get_product(product_id: int, db: Session = Depends(get_db)) -> ProductOut:
    row = crud.get_product(db, product_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return _row_to_product_out(row)


@router.get("/products/{product_id}/history", response_model=ProductHistoryOut)
def get_product_history(
    product_id: int,
    since: datetime | None = None,
    limit: int = Query(500, ge=1, le=5000),
    db: Session = Depends(get_db),
) -> ProductHistoryOut:
    product, points = crud.product_history(db, product_id, since=since, limit=limit)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    return ProductHistoryOut(
        product_id=product.id,
        site=product.site,
        product_name=product.product_name,
        points=[
            {
                "scraped_at": p.scraped_at,
                "current_price": p.current_price,
                "original_price": p.original_price,
                "discount_percent": p.discount_percent,
            }
            for p in points
        ],
    )


@router.get("/products/{product_id}/trend", response_model=TrendOut)
def get_product_trend(product_id: int, db: Session = Depends(get_db)) -> TrendOut:
    """Real stats computed from price_history (no ML), plus a one-sentence
    narration from a small local Hugging Face model. See trends.py and
    narration.py for what each layer is actually allowed to say.
    """
    product, points = crud.product_history(db, product_id, limit=5000)
    if product is None:
        raise HTTPException(status_code=404, detail="Product not found")
    trend = compute_trend(points)
    if trend is None:
        raise HTTPException(status_code=404, detail="No price data recorded yet for this product")

    summary, source = generate_summary(product.product_name, trend)
    return TrendOut(
        checks=trend.checks,
        window_days=trend.window_days,
        change_pct=trend.change_pct,
        direction=trend.direction,
        lowest_price=trend.lowest_price,
        lowest_at=trend.lowest_at,
        highest_price=trend.highest_price,
        highest_at=trend.highest_at,
        streak_direction=trend.streak_direction,
        streak_length=trend.streak_length,
        summary=summary,
        summary_source=source,
    )
