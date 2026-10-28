"""A search index of Cartup's catalogue, so the Cloudflare agent can find a
product on Cartup at all.

Why it has to exist: Cartup's own search API (api.cartup.com/aes/.../search)
only answers requests carrying a per-request signature its page script
computes from a hidden key (the `sxsrf` header: triple-base64
{"random","sign","expires"}). Forging that is getting around an access
control — not done, same line as Daraz's signed voucher API. And robots.txt
disallows /search and every URL with a query string.

What Cartup does publish for automated visitors: a product sitemap (~890k
product URLs over 18 files, refreshed daily) and product pages that robots.txt
allows, each carrying schema.org Product JSON-LD with the live price, stock,
seller and rating. So the agent finds candidates here and reads prices from
the pages, live (worker/cartup.ts).

The product name is in the URL itself:
    /product/chair_wheel_5pc_166570935804140_oi44h8  ->  "chair wheel 5pc"

Layout in D1 (free plan: 500MB per database, 100k rows written/day, SQL
statements under 100KB each):
    cartup_docs(block, data)          64 slugs per row, doc id = block*64 + i
    cartup_postings(shard, part, data) token -> delta-encoded base36 doc ids,
                                       tokens hashed into SHARDS rows (FNV-1a,
                                       identical in worker/cartup.ts)
    cartup_meta(key, value)           build time, counts, tokens too common to index
Rows written per rebuild: ~16k, into *_new tables swapped in at the end. Run weekly from this PC:

    .venv\\Scripts\\python.exe -m agent --index-cartup
"""

from __future__ import annotations

import json
import re
import subprocess
import time
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

import requests

from .d1 import PROJECT, execute

DATA = PROJECT / "data" / "cartup"
SITEMAP_INDEX = "https://www.cartup.com/sitemap-product-all.xml.gz"
CATEGORY_INDEX = "https://www.cartup.com/sitemap-category-all.xml.gz"
UA = "Mozilla/5.0 (compatible; PricePulseIndexer/1.0; +https://atikul-dipto.github.io/price-pulse/)"

DOC_BLOCK = 64
SHARDS = 2048
MAX_ROW_CHARS = 90_000  # under D1's 100KB statement limit, with room for the SQL around it
# A token in more docs than this is too common to narrow anything ("for",
# "men", "black"); it's left out and listed in meta so queries skip it
# instead of treating it as a miss.
MAX_DF = 25_000
SLUG_RE = re.compile(r"/product/([^/?#<\s]+)")  # stop at "<": the first build kept it on every slug
# "_166570935804140_oi44h8" or "-1790653663537-wid3"; some slugs have no tail at all.
SLUG_TAIL_RE = re.compile(r"[_-]\d{9,}[_-][a-z0-9]+$")
TOKEN_RE = re.compile(r"[a-z0-9]+")
B36 = "0123456789abcdefghijklmnopqrstuvwxyz"


def fnv1a(token: str) -> int:
    h = 0x811C9DC5
    for byte in token.encode("utf-8"):
        h ^= byte
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def shard_of(token: str) -> int:
    return fnv1a(token) % SHARDS


def name_tokens(slug: str) -> list[str]:
    return TOKEN_RE.findall(SLUG_TAIL_RE.sub("", slug.lower()))


def b36(n: int) -> str:
    if n == 0:
        return "0"
    out = ""
    while n:
        n, r = divmod(n, 36)
        out = B36[r] + out
    return out


def download(fresh_days: float = 6) -> list[Path]:
    """The product sitemap files, re-downloaded when older than `fresh_days`."""
    DATA.mkdir(parents=True, exist_ok=True)
    index = requests.get(SITEMAP_INDEX, headers={"User-Agent": UA}, timeout=60).text
    urls = re.findall(r"<loc>([^<]+)</loc>", index)
    paths = []
    for n, url in enumerate(urls, start=1):
        path = DATA / f"products-{n}.xml"
        if path.exists() and time.time() - path.stat().st_mtime < fresh_days * 86400 and path.stat().st_size > 10_000:
            paths.append(path)
            continue
        response = requests.get(url, headers={"User-Agent": UA}, timeout=120)
        if response.status_code == 404:
            break  # the index lists more files than exist
        response.raise_for_status()
        path.write_bytes(response.content)
        paths.append(path)
        time.sleep(1)  # one file at a time, gently
    return paths


def build(paths: list[Path]) -> tuple[list[str], dict[str, list[int]], list[str]]:
    """(slugs by doc id, postings by token, tokens dropped as too common)"""
    slugs: list[str] = []
    seen: set[str] = set()
    for path in paths:
        text = path.read_bytes().decode("utf-8", "replace")
        for slug in SLUG_RE.findall(text):
            if slug not in seen:
                seen.add(slug)
                slugs.append(slug)
    postings: dict[str, list[int]] = defaultdict(list)
    for doc, slug in enumerate(slugs):
        for token in dict.fromkeys(name_tokens(slug)):
            postings[token].append(doc)
    common = sorted(t for t, ids in postings.items() if len(ids) > MAX_DF)
    for token in common:
        del postings[token]
    return slugs, postings, common


def encode(ids: list[int]) -> str:
    """Sorted doc ids as base36 gaps: 12,15,40 -> "c,3,p"."""
    out, prev = [], 0
    for i in ids:
        out.append(b36(i - prev))
        prev = i
    return ",".join(out)


def _q(s: str) -> str:
    return "'" + s.replace("'", "''") + "'"


def statements(slugs: list[str], postings: dict[str, list[int]], common: list[str]) -> list[str]:
    # Built into *_new tables and swapped in by the last statements (SWAP), so
    # an upload that fails halfway — it happened: the login expired mid-run —
    # leaves the live index untouched instead of half rebuilt.
    stmts = [
        "DROP TABLE IF EXISTS cartup_docs_new;",
        "DROP TABLE IF EXISTS cartup_postings_new;",
        "CREATE TABLE cartup_docs_new (block INTEGER PRIMARY KEY, data TEXT NOT NULL);",
        "CREATE TABLE cartup_postings_new (shard INTEGER NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (shard, part));",
        "CREATE TABLE IF NOT EXISTS cartup_meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);",
    ]
    for block in range(0, len(slugs), DOC_BLOCK):
        data = json.dumps(slugs[block : block + DOC_BLOCK], ensure_ascii=False, separators=(",", ":"))
        stmts.append(f"INSERT INTO cartup_docs_new (block, data) VALUES ({block // DOC_BLOCK}, {_q(data)});")

    by_shard: dict[int, dict[str, str]] = defaultdict(dict)
    for token, ids in postings.items():
        by_shard[shard_of(token)][token] = encode(ids)
    for shard, tokens in sorted(by_shard.items()):
        part, current, size = 0, {}, 2
        for token, enc in sorted(tokens.items()):
            entry = len(token) + len(enc) + 6
            if current and size + entry > MAX_ROW_CHARS:
                stmts.append(_posting_row(shard, part, current))
                part, current, size = part + 1, {}, 2
            current[token] = enc
            size += entry
        if current:
            stmts.append(_posting_row(shard, part, current))

    meta = {
        "built": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
        "docs": len(slugs),
        "docBlock": DOC_BLOCK,
        "shards": SHARDS,
        "common": common,
    }
    return stmts + swap(meta)


SWAP_MARK = "DROP TABLE IF EXISTS cartup_docs;"


def swap(meta: dict) -> list[str]:
    return [
        SWAP_MARK,
        "DROP TABLE IF EXISTS cartup_postings;",
        "ALTER TABLE cartup_docs_new RENAME TO cartup_docs;",
        "ALTER TABLE cartup_postings_new RENAME TO cartup_postings;",
        f"INSERT OR REPLACE INTO cartup_meta (key, value) VALUES ('index', {_q(json.dumps(meta, separators=(',', ':')))});",
    ]


def _posting_row(shard: int, part: int, tokens: dict[str, str]) -> str:
    data = json.dumps(tokens, separators=(",", ":"))
    return f"INSERT INTO cartup_postings_new (shard, part, data) VALUES ({shard}, {part}, {_q(data)});"


def upload(stmts: list[str], chunk_chars: int = 8_000_000) -> int:
    """Run the statements in batches (one wrangler call per ~8MB of SQL), the
    swap last and on its own; a failed batch is retried once."""
    cut = stmts.index(SWAP_MARK)
    batches: list[str] = []
    chunk: list[str] = []
    size = 0
    for stmt in stmts[:cut]:
        if chunk and size + len(stmt) > chunk_chars:
            batches.append("\n".join(chunk))
            chunk, size = [], 0
        chunk.append(stmt)
        size += len(stmt)
    if chunk:
        batches.append("\n".join(chunk))
    batches.append("\n".join(stmts[cut:]))
    for batch in batches:
        for attempt in range(2):
            try:
                execute(batch)
                break
            except subprocess.CalledProcessError:
                if attempt:
                    raise
                time.sleep(10)
    return len(batches)


def categories() -> list[str]:
    """Cartup's category slugs ("detergent", "monitors_499", "mice"), from its category sitemap."""
    index = requests.get(CATEGORY_INDEX, headers={"User-Agent": UA}, timeout=60).text
    slugs: list[str] = []
    for url in re.findall(r"<loc>([^<]+)</loc>", index):
        xml = requests.get(url, headers={"User-Agent": UA}, timeout=60).text
        slugs += re.findall(r"/category/([^<\s/?#]+)</loc>", xml)
        time.sleep(1)
    return sorted(set(slugs))


def category_statements(slugs: list[str]) -> list[str]:
    """The category list as meta rows ('categories:0', ...), each under D1's statement limit."""
    rows, current = [], []
    for slug in slugs:
        current.append(slug)
        if len(json.dumps(current)) > MAX_ROW_CHARS:
            rows.append(current[:-1])
            current = [slug]
    rows.append(current)
    return ["DELETE FROM cartup_meta WHERE key LIKE 'categories:%';"] + [
        f"INSERT INTO cartup_meta (key, value) VALUES ('categories:{i}', {_q(json.dumps(r, separators=(',', ':')))});" for i, r in enumerate(rows)
    ]


def run(push: bool = True) -> dict:
    t0 = time.time()
    paths = download()
    slugs, postings, common = build(paths)
    stmts = statements(slugs, postings, common)
    longest = max(len(s) for s in stmts)
    if longest > 100_000:
        raise ValueError(f"a statement is {longest} chars; D1 allows 100KB")
    stats = {
        "files": len(paths),
        "products": len(slugs),
        "tokens": len(postings),
        "too_common": len(common),
        "rows": len(stmts),
        "sql_mb": round(sum(map(len, stmts)) / 1e6, 1),
        "longest_statement": longest,
    }
    cats = categories()
    stats["categories"] = len(cats)
    if push:
        stats["uploads"] = upload(stmts)
        execute("\n".join(category_statements(cats)))
    stats["seconds"] = round(time.time() - t0)
    return stats
