"""One narrated sentence over the real trend stats in trends.py, using a
small local Hugging Face model (TensorFlow backend) — not a paid API, and
not a forecaster. The model only ever restates facts it's handed; it is
never asked to predict anything.

Honesty guardrail: the model is a genuine risk of stating a number it
invented rather than one of the real facts it was given (small models do
this). Every number in its output is checked against the exact set of real
values from the Trend before being trusted — any number that doesn't match
means the model hallucinated, and the deterministic template sentence
(built from the same real facts, zero model involved) is used instead. The
API always reports which one actually produced the sentence.
"""

from __future__ import annotations

import logging
import os
import re
from decimal import Decimal
from pathlib import Path

from .trends import Trend

log = logging.getLogger("backend.narration")

MODEL_NAME = "google/flan-t5-small"

# Keep the model download inside the project (on whichever drive that is)
# instead of huggingface_hub's default under the user profile — on this
# machine the system drive is nearly full, and the default cache location
# doesn't respect where the project itself was deliberately placed to have
# room. Must be set before transformers/huggingface_hub is imported.
os.environ.setdefault("HF_HOME", str(Path(__file__).resolve().parent.parent.parent / ".hf_cache"))

_tokenizer = None
_model = None
_load_failed = False


def _load_model() -> None:
    global _tokenizer, _model, _load_failed
    if _model is not None or _load_failed:
        return
    try:
        from transformers import AutoTokenizer, TFAutoModelForSeq2SeqLM

        log.info("Loading narration model %s (first call only, may take a while)...", MODEL_NAME)
        _tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
        # use_safetensors=False: the safetensors PT->TF conversion path in
        # this transformers version raises `'safe_open' object is not
        # iterable` for this checkpoint — the plain pytorch_model.bin path
        # doesn't hit that bug. Confirmed working 2026-08-28.
        _model = TFAutoModelForSeq2SeqLM.from_pretrained(MODEL_NAME, use_safetensors=False)
        log.info("Narration model ready.")
    except Exception:
        log.exception("Narration model failed to load — narration will use the template fallback only")
        _load_failed = True


def is_ready() -> bool:
    return _model is not None


def warm_up() -> None:
    """Called once at backend startup so the first real request isn't the
    one paying for the model download/load.
    """
    _load_model()


def _money(value: Decimal) -> str:
    return f"৳{value:,.2f}".rstrip("0").rstrip(".")


def _template_summary(trend: Trend) -> str:
    if trend.direction == "flat" or trend.change_pct is None:
        return f"Price has held steady at {_money(trend.last_price)} across {trend.checks} check(s)."
    verb = "risen" if trend.direction == "up" else "fallen"
    pct = abs(trend.change_pct)
    return (
        f"Price has {verb} {pct}% to {_money(trend.last_price)} over {trend.checks} checks "
        f"spanning {trend.window_days:.1f} day(s); lowest seen so far is {_money(trend.lowest_price)}."
    )


def _allowed_numbers(trend: Trend) -> set[str]:
    """Every number the model is allowed to state. Anything else in its
    output means it invented a figure.
    """
    raw_values = [trend.checks, trend.last_price, trend.first_price, trend.lowest_price, trend.highest_price, trend.streak_length]
    if trend.change_pct is not None:
        raw_values.append(trend.change_pct)
        raw_values.append(abs(trend.change_pct))

    normalized: set[str] = set()
    for value in raw_values:
        as_float = float(value)
        normalized.add(str(int(round(as_float))))
        trimmed = f"{as_float:.2f}".rstrip("0").rstrip(".")
        normalized.add(trimmed)
    return normalized


NUMBER_RE = re.compile(r"\d+(?:\.\d+)?")


def _is_grounded(text: str, trend: Trend) -> bool:
    allowed = _allowed_numbers(trend)
    for match in NUMBER_RE.findall(text):
        trimmed = match.rstrip("0").rstrip(".") if "." in match else match
        if match not in allowed and trimmed not in allowed:
            return False
    return True


def generate_summary(product_name: str, trend: Trend) -> tuple[str, str]:
    """Returns (summary, source) where source is "model" or "template"."""
    fallback = _template_summary(trend)

    _load_model()
    if _model is None:
        return fallback, "template"

    facts = (
        f"checks recorded: {trend.checks}. "
        f"first price: {trend.first_price}. last price: {trend.last_price}. "
        f"change percent: {trend.change_pct if trend.change_pct is not None else 'none'}. "
        f"direction: {trend.direction}. "
        f"lowest price seen: {trend.lowest_price}. highest price seen: {trend.highest_price}. "
        f"current streak: {trend.streak_length} checks {trend.streak_direction}."
    )
    prompt = (
        f"Product: {product_name}. Write one short, plain sentence summarizing this price trend. "
        "Use ONLY the numbers given below - do not introduce any other number. "
        f"Facts: {facts}"
    )

    try:
        inputs = _tokenizer(prompt, return_tensors="tf", truncation=True, max_length=256)
        output = _model.generate(
            **inputs, max_new_tokens=48, min_new_tokens=10, num_beams=4, length_penalty=1.2, no_repeat_ngram_size=3
        )
        text = _tokenizer.decode(output[0], skip_special_tokens=True).strip()
    except Exception:
        log.exception("Narration generation failed; using template")
        return fallback, "template"

    if not text or not _is_grounded(text, trend):
        log.warning("Narration output failed the grounding check, using template instead: %r", text)
        return fallback, "template"
    return text, "model"
