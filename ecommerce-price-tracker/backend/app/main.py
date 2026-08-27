"""FastAPI app entrypoint.

Run from ecommerce-price-tracker/ so the sibling `scraper` package resolves:

    python -m uvicorn backend.app.main:app --reload --port 8000
"""

from __future__ import annotations

import logging
import threading
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from scraper.storage_pg import init_db

# Uvicorn configures its own loggers (uvicorn, uvicorn.access) but not the
# scraper package's or this backend's — without this, every scrape job's
# progress (scraper/pipeline.py, scraper/banners.py, backend/app/scheduler.py
# log.info calls) is silently dropped instead of showing up in the server
# output, which makes a running scheduled job look like a black box.
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")

from .config import settings
from .db import engine
from .narration import warm_up as warm_up_narration
from .routers import banners, compare, health, products, scrape, sites
from .scheduler import schedule_periodic_job, start_scheduler


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db(engine)
    start_scheduler()
    schedule_periodic_job()
    # Load the narration model in the background so it's ready by the time
    # someone opens a product detail panel, instead of the first request
    # paying for a cold model load (which can take a while on CPU).
    threading.Thread(target=warm_up_narration, daemon=True).start()
    yield


app = FastAPI(title="Price Pulse API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router, prefix="/api")
app.include_router(products.router, prefix="/api")
app.include_router(banners.router, prefix="/api")
app.include_router(sites.router, prefix="/api")
app.include_router(scrape.router, prefix="/api")
app.include_router(compare.router, prefix="/api")
