"""SQLAlchemy engine/session wiring for the backend. The schema itself
lives in scraper/storage_pg.py (shared with the scrape job's write path).
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy.orm import Session

from scraper.storage_pg import get_engine, get_sessionmaker

from .config import settings

engine = get_engine(settings.database_url)
SessionLocal = get_sessionmaker(engine)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
