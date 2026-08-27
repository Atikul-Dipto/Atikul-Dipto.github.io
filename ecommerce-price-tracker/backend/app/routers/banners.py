from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import crud
from ..db import get_db
from ..schemas import BannerListOut, BannerOut

router = APIRouter()


@router.get("/banners", response_model=BannerListOut)
def list_banners(site: str | None = None, db: Session = Depends(get_db)) -> BannerListOut:
    rows = crud.list_banners(db, site=site)
    return BannerListOut(
        results=[
            BannerOut(
                site=r.site,
                image_url=r.image_url,
                link_url=r.link_url,
                first_seen=r.first_seen,
                last_seen=r.last_seen,
            )
            for r in rows
        ]
    )
