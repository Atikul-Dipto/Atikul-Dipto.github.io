from __future__ import annotations

import uuid

from fastapi import APIRouter

from ..scheduler import run_banner_job, run_scrape_job, scheduler
from ..schemas import ScrapeTriggerIn, ScrapeTriggerOut

router = APIRouter()


@router.post("/scrape/run", response_model=ScrapeTriggerOut)
def trigger_scrape(payload: ScrapeTriggerIn) -> ScrapeTriggerOut:
    job_id = f"manual-scrape-{uuid.uuid4().hex[:8]}"
    scheduler.add_job(run_scrape_job, kwargs={"only": payload.only, "headless": payload.headless}, id=job_id)
    return ScrapeTriggerOut(status="started", job_id=job_id)


@router.post("/scrape/banners", response_model=ScrapeTriggerOut)
def trigger_banner_scrape(payload: ScrapeTriggerIn) -> ScrapeTriggerOut:
    job_id = f"manual-banners-{uuid.uuid4().hex[:8]}"
    scheduler.add_job(run_banner_job, kwargs={"only": payload.only, "headless": payload.headless}, id=job_id)
    return ScrapeTriggerOut(status="started", job_id=job_id)
