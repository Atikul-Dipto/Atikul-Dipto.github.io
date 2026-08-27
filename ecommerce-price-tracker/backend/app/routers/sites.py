from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from scraper.sites import load_sites

from .. import crud
from ..db import get_db
from ..schemas import SiteStatsOut

router = APIRouter()


@router.get("/sites", response_model=list[SiteStatsOut])
def list_sites(db: Session = Depends(get_db)) -> list[SiteStatsOut]:
    sites_config = load_sites()
    return [SiteStatsOut(**row) for row in crud.site_stats(db, sites_config)]
