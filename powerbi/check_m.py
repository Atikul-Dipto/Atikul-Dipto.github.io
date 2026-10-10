"""
Lint the M queries embedded in every TMDL partition under powerbi/.

    python check_m.py

Power BI Desktop validates M only when it builds the model, after TMDL parses,
so an M syntax error is a separate failure from a TMDL one and shows up on a
later open. Desktop does not redistribute a usable M parser either -- its
engine assembly exposes an AST but no public entry point to parse an
expression -- so this is a structural check of the `let ... in` subset these
projects generate, not a real parser.

It exists because of a real failure: two partitions ended their last binding
with a comma before `in`, which Desktop reported only as

    M Engine error: A ',' cannot precede a 'in'.

with no file, no line, and no query name. The generator now assembles bindings
as a list and joins them, so that specific bug cannot recur, but the check is
cheap and the next hand-edit does not get the same guarantee.

What it checks per query:

  - balanced (), {}, [] and an even number of quote marks
  - a `let` and an `in`
  - no comma immediately before `in`
  - every binding name is unique
  - every bare local name referenced is defined earlier in the same query, or
    is a shared expression declared in expressions.tmdl

That last one catches the mistake where a step is renamed in one place and
still referenced by its old name in another -- which M reports as a runtime
failure rather than a syntax error, so it survives every other check here.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent

# M keywords and type literals. An identifier in this set is never a reference
# to a local binding.
M_KEYWORDS = {
    "let", "in", "type", "true", "false", "null", "each", "if", "then", "else",
    "and", "or", "not", "as", "is", "meta", "try", "otherwise", "error",
    "section", "shared", "optional", "nullable",
    "text", "number", "logical", "table", "record", "list", "date", "datetime",
    "datetimezone", "duration", "time", "binary", "any", "anynonnull",
    "function", "none",
}

PAIRS = {")": "(", "}": "{", "]": "["}
OPENERS = set(PAIRS.values())

failures: list[str] = []
checks = 0


def check(ok: bool, label: str, detail: str = "") -> None:
    global checks
    checks += 1
    if not ok:
        failures.append(f"{label}{(chr(10) + '        ' + detail) if detail else ''}")
        print(f"  FAIL  {label}")
        if detail:
            print(f"        {detail}")


def strip_strings(code: str) -> str:
    """Blank out string literals so punctuation inside them is not counted.

    M has no backslash escaping -- a literal quote is written as "" -- so a
    simple toggle on the quote character is correct here.
    """
    out, in_str, i = [], False, 0
    while i < len(code):
        c = code[i]
        if c == '"':
            if in_str and i + 1 < len(code) and code[i + 1] == '"':
                out.append("  ")
                i += 2
                continue
            in_str = not in_str
            out.append(" ")
        else:
            out.append(" " if in_str else c)
        i += 1
    return "".join(out)


def extract_partitions(path: Path) -> list[tuple[str, str]]:
    """Return (partition name, M source) for every `= m` partition in a file."""
    lines = path.read_text(encoding="utf-8").splitlines()
    found, i = [], 0
    while i < len(lines):
        m = re.match(r"\tpartition (\S+) = m\s*$", lines[i])
        if not m:
            i += 1
            continue
        name = m.group(1)
        # The query is the indented block after `source =`, ending at the first
        # line that is neither blank nor more deeply indented.
        j = i + 1
        while j < len(lines) and not lines[j].strip().startswith("source ="):
            j += 1
        j += 1
        body = []
        while j < len(lines):
            line = lines[j]
            if line.strip() == "":
                nxt = next((x for x in lines[j + 1:] if x.strip()), "")
                if not nxt.startswith("\t\t\t"):
                    break
                body.append(line)
            elif line.startswith("\t\t\t"):
                body.append(line)
            else:
                break
            j += 1
        found.append((name, "\n".join(body)))
        i = j
    return found


def shared_expressions() -> set[str]:
    names = set()
    for f in ROOT.rglob("expressions.tmdl"):
        names |= set(re.findall(r"^expression (\S+)", f.read_text(encoding="utf-8"), re.M))
    return names


def lint(label: str, code: str, shared: set[str]) -> None:
    bare = strip_strings(code)

    check(code.count('"') % 2 == 0, f"{label}: quotes balanced",
          f'{code.count(chr(34))} quote marks')

    stack: list[str] = []
    bad_close = None
    for ch in bare:
        if ch in OPENERS:
            stack.append(ch)
        elif ch in PAIRS:
            if not stack or stack[-1] != PAIRS[ch]:
                bad_close = ch
                break
            stack.pop()
    check(bad_close is None and not stack, f"{label}: brackets balanced",
          f"unclosed {stack}" if stack else f"unexpected '{bad_close}'")

    check(re.search(r"\blet\b", bare) is not None, f"{label}: has a let")
    check(re.search(r"\bin\b", bare) is not None, f"{label}: has an in")

    # The failure that prompted this script.
    check(re.search(r",\s*\n\s*in\b", bare) is None,
          f"{label}: no comma before in",
          "M rejects a trailing comma on the last let binding")

    # Split into the bindings and the result expression.
    parts = re.split(r"\n\s*in\s*\n", bare, maxsplit=1)
    if len(parts) != 2:
        return
    head, result = parts
    head = re.sub(r"^\s*let\s*\n", "", head)

    # Bindings are top-level `Name =` at the start of a line in the block.
    binding_names = re.findall(r"^\s*([A-Za-z_][\w.]*)\s*=", head, re.M)
    check(len(binding_names) == len(set(binding_names)),
          f"{label}: binding names unique", str(binding_names))

    defined = set(binding_names) | shared
    # A reference is a dotted-free identifier not followed by '=' (which would
    # make it a binding or a record field) and not an M keyword.
    for scope_name, scope in (("bindings", head), ("result", result)):
        for m in re.finditer(r"(?<![\w.])([A-Za-z_]\w*)(?!\s*=)(?![\w.])", scope):
            ident = m.group(1)
            if ident in M_KEYWORDS or ident in defined:
                continue
            # Skip anything that is part of a dotted call like Table.Foo, and
            # enum members like QuoteStyle.Csv -- those have a dot before or
            # after and the lookarounds above already exclude them.
            check(False, f"{label}: '{ident}' in {scope_name} is defined",
                  f"not a let binding or shared expression; defined are "
                  f"{sorted(defined)}")

    check(result.strip() in defined or not result.strip(),
          f"{label}: result '{result.strip()}' is a defined binding",
          f"defined: {sorted(defined)}")


def main() -> None:
    shared = shared_expressions()
    print(f"Shared expressions: {sorted(shared) or '(none)'}\n")
    total = 0
    for tmdl in sorted(ROOT.rglob("*.tmdl")):
        for name, code in extract_partitions(tmdl):
            total += 1
            rel = tmdl.relative_to(ROOT)
            lint(f"{rel.parent.parent.parent.name}/{name}", code, shared)
    print(f"{total} M partitions, {checks} checks, {len(failures)} failed")
    if failures:
        print("\nFAILURES:")
        for f in failures:
            print(f"  - {f}")
    sys.exit(1 if failures else 0)


if __name__ == "__main__":
    main()
