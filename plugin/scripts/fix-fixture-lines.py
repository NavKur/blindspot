#!/usr/bin/env python3
"""Rewrite fixture line numbers from a real tinydb checkout.

Usage: python3 scripts/fix-fixture-lines.py <path to tinydb checkout> <fixture json>

For every function in the fixture, the file named in "file" is parsed with ast and the
function named in "name" (either "func" or "Class.method") is located. line_start/line_end
are set to the def line and the last line of the function. Every finding is aligned to its
function: it starts at the def line and ends 6 lines later or at the function end, whichever
comes first. Nothing else in the fixture is changed. Functions that cannot be found are
printed and left as they are.
"""
import ast
import json
import sys
from pathlib import Path

FINDING_SPAN = 6


def index_functions(source: str) -> dict:
    """Map "Class.method" and "func" names to (first line, last line)."""
    tree = ast.parse(source)
    found = {}

    def visit(node, prefix):
        for child in ast.iter_child_nodes(node):
            if isinstance(child, (ast.FunctionDef, ast.AsyncFunctionDef)):
                name = f"{prefix}{child.name}"
                # def line, not the first decorator line
                found.setdefault(name, (child.lineno, child.end_lineno or child.lineno))
                visit(child, name + ".")
            elif isinstance(child, ast.ClassDef):
                visit(child, f"{prefix}{child.name}.")
            else:
                visit(child, prefix)

    visit(tree, "")
    return found


def main(argv) -> int:
    if len(argv) != 3:
        print(__doc__)
        return 2
    repo = Path(argv[1])
    fixture_path = Path(argv[2])
    fixture = json.loads(fixture_path.read_text(encoding="utf-8"))

    cache = {}

    def functions_in(rel_path: str) -> dict:
        if rel_path not in cache:
            file_path = repo / rel_path
            if not file_path.is_file():
                print(f"missing file: {rel_path}")
                cache[rel_path] = {}
            else:
                cache[rel_path] = index_functions(file_path.read_text(encoding="utf-8"))
        return cache[rel_path]

    ranges_by_id = {}
    missing = 0
    for fn in fixture["functions"]:
        located = functions_in(fn["file"]).get(fn["name"])
        if located is None:
            print(f"not found: {fn['id']}")
            missing += 1
            continue
        fn["line_start"], fn["line_end"] = located
        ranges_by_id[fn["id"]] = located

    for finding in fixture["findings"]:
        located = ranges_by_id.get(finding["function_id"])
        if located is None:
            print(f"finding {finding['id']}: function {finding['function_id']} not located")
            missing += 1
            continue
        start, end = located
        finding["line_start"] = start
        finding["line_end"] = min(start + FINDING_SPAN, end)

    fixture_path.write_text(json.dumps(fixture, indent=2) + "\n", encoding="utf-8")
    print(f"updated {len(ranges_by_id)} functions and {len(fixture['findings'])} findings"
          + (f", {missing} not found" if missing else ""))
    return 1 if missing else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
