from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from .. import crud
from ..db import get_db
from ..matching import group_across_stores
from ..schemas import CompareGroup, CompareGroupsOut, CompareItem

router = APIRouter()


@router.get("/compare-groups", response_model=CompareGroupsOut)
def compare_groups(
    min_stores: int = Query(2, ge=2),
    limit: int = Query(100, ge=1, le=1000),
    db: Session = Depends(get_db),
) -> CompareGroupsOut:
    products = crud.all_latest_products(db)
    groups = group_across_stores(products, min_stores=min_stores)[:limit]
    return CompareGroupsOut(
        results=[
            CompareGroup(
                items=[
                    CompareItem(
                        product_id=item["id"],
                        site=item["site"],
                        product_name=item["product_name"],
                        current_price=item["current_price"],
                        source_url=item["source_url"],
                    )
                    for item in group["items"]
                ]
            )
            for group in groups
        ]
    )
