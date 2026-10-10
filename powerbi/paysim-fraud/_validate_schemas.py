"""
Validate every JSON file in this project against Microsoft's published Fabric
schemas.

    pip install jsonschema
    python _validate_schemas.py

Each file names its own contract in its "$schema" property. This script
fetches that schema, follows every $ref it contains (resolving relative refs
against each schema's own $id, which is how the Fabric schemas are written),
and validates. Schemas are cached in _schema_cache/ so later runs are offline.

What this catches: unknown properties, missing required properties, wrong
types, bad enum values. What it cannot catch: a visualType that does not
exist, or a data role name a given visual does not use -- the schema leaves
both of those open. Those only show up in Power BI Desktop.
"""

from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from pathlib import Path

try:
    from jsonschema import Draft7Validator
    from referencing import Registry, Resource
    from referencing.jsonschema import DRAFT7
except ImportError:
    sys.exit("pip install jsonschema")

ROOT = Path(__file__).resolve().parent
CACHE = ROOT / "_schema_cache"


def fetch(url: str) -> dict:
    CACHE.mkdir(exist_ok=True)
    key = urllib.parse.quote(url, safe="")
    path = CACHE / f"{key}.json"
    if path.exists():
        return json.loads(path.read_text(encoding="utf-8"))
    print(f"    fetching {url.rsplit('/definition/', 1)[-1]}")
    with urllib.request.urlopen(url, timeout=60) as r:  # noqa: S310 - fixed host
        body = r.read().decode("utf-8")
    path.write_text(body, encoding="utf-8")
    return json.loads(body)


def refs_in(obj) -> list[str]:
    found = []
    if isinstance(obj, dict):
        for k, v in obj.items():
            if k == "$ref" and isinstance(v, str):
                found.append(v)
            else:
                found += refs_in(v)
    elif isinstance(obj, list):
        for v in obj:
            found += refs_in(v)
    return found


def load_all(start_urls: list[str]) -> Registry:
    """Fetch the given schemas and everything they reference, transitively."""
    seen: dict[str, dict] = {}
    queue = list(start_urls)
    while queue:
        url = queue.pop()
        if url in seen:
            continue
        schema = fetch(url)
        seen[url] = schema
        base = schema.get("$id", url)
        for ref in refs_in(schema):
            target = urllib.parse.urljoin(base, ref.split("#", 1)[0])
            if target.startswith("http") and target not in seen:
                # Fabric refs sometimes omit the trailing .json path segment
                if not target.endswith(".json"):
                    target += ".json"
                queue.append(target)
    reg = Registry()
    for url, schema in seen.items():
        resource = Resource.from_contents(schema, default_specification=DRAFT7)
        reg = reg.with_resource(schema.get("$id", url), resource)
        if schema.get("$id") and schema["$id"] != url:
            # Register under the URL we fetched it from as well, so a $schema
            # that differs from the schema's own $id still resolves.
            reg = reg.with_resource(url, resource)
    print(f"  loaded {len(seen)} schemas")
    return reg


def main() -> None:
    files = sorted(
        list(ROOT.glob("*.pbip"))
        + list(ROOT.rglob("*.pbism"))
        + list(ROOT.rglob("*.pbir"))
        + [p for p in ROOT.rglob("*.json") if CACHE not in p.parents]
    )
    docs = []
    for p in files:
        try:
            obj = json.loads(p.read_text(encoding="utf-8"))
        except json.JSONDecodeError as e:
            print(f"  INVALID JSON  {p.relative_to(ROOT)}: {e}")
            sys.exit(1)
        if "$schema" not in obj:
            print(f"  NO $schema    {p.relative_to(ROOT)}")
            sys.exit(1)
        docs.append((p, obj))

    print(f"Validating {len(docs)} files")
    registry = load_all(sorted({o["$schema"] for _, o in docs}))

    failures = 0
    by_schema: dict[str, int] = {}
    for p, obj in docs:
        url = obj["$schema"]
        validator = Draft7Validator(fetch(url), registry=registry)
        errors = sorted(validator.iter_errors(obj), key=lambda e: list(e.path))
        name = url.rsplit("/definition/", 1)[-1].rsplit("/", 2)[0] or url.rsplit("/", 3)[1]
        by_schema[name] = by_schema.get(name, 0) + 1
        if errors:
            failures += 1
            print(f"\n  FAIL {p.relative_to(ROOT)}  ({name})")
            for e in errors[:6]:
                loc = "/".join(str(x) for x in e.path) or "(root)"
                print(f"       {loc}: {e.message[:180]}")

    print()
    for name, n in sorted(by_schema.items()):
        print(f"  {n:>3} x {name}")
    print(f"\n{len(docs)} files, {failures} failed schema validation")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
