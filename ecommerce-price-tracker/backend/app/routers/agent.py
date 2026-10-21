from __future__ import annotations

from fastapi import APIRouter
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, Field

from agent import core
from agent.models import to_jsonable
from agent.store import load_vouchers
from agent.vouchers import active

from ..db import SessionLocal

router = APIRouter()


class AskIn(BaseModel):
    query: str = Field(min_length=2, max_length=200)


@router.post("/agent/ask")
async def ask(payload: AskIn) -> dict:
    """The shopping agent: live Daraz search + last looked-up price + voucher
    check. Blocking I/O (HTTP, Ollama, Postgres), so it runs off the event loop.
    The response shape is agent/core.py's run() — see its docstring.
    """
    return await run_in_threadpool(core.run, payload.query, SessionLocal)


@router.get("/agent/vouchers")
def vouchers() -> dict:
    with SessionLocal() as session:
        current = active(load_vouchers(session, "daraz"))
    return {"count": len(current), "results": to_jsonable(current)}
