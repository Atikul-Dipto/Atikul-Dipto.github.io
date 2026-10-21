"""Thin client for the local Ollama server — free, runs on this machine, no
paid API (see the project README). Used for exactly two jobs: turning a
shopper's free-text request into a structured Intent, and picking which
Daraz category a search belongs in. Prices, ranking and voucher math are
never left to the model.

Measured on this machine with qwen2.5:7b: ~3s per call once loaded, but
30-90s for the very first call while the model loads into memory — so
warm_up() is called at backend startup, and keep_alive holds it loaded.
"""

from __future__ import annotations

import json
import logging
import os

import requests

log = logging.getLogger("agent.llm")

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
MODEL = os.environ.get("AGENT_MODEL", "qwen2.5:7b")
KEEP_ALIVE = "60m"


class LLMUnavailable(RuntimeError):
    pass


def chat_json(system: str, user: str, timeout: float = 120.0) -> dict:
    """One chat turn constrained to JSON output. Raises LLMUnavailable on any
    transport/parse failure so callers can fall back to their rule-based path.
    """
    try:
        response = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": MODEL,
                "stream": False,
                "format": "json",
                "keep_alive": KEEP_ALIVE,
                "options": {"temperature": 0},
                "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
            },
            timeout=timeout,
        )
        response.raise_for_status()
        return json.loads(response.json()["message"]["content"])
    except (requests.RequestException, KeyError, ValueError) as exc:
        raise LLMUnavailable(str(exc)) from exc


def warm_up() -> None:
    try:
        chat_json("Reply with JSON.", '{"ping": true}', timeout=300)
        log.info("Agent model %s loaded", MODEL)
    except LLMUnavailable as exc:
        log.warning("Agent model %s not available (%s) — intent parsing will use the rule-based fallback", MODEL, exc)
