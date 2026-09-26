"""Build question candidates from the repo index (steps 6 and 7: five families).

Families produce ALL candidate questions they can verify. Step 8 (split.py) samples from
them to get balanced TRAIN and TEST sets.
"""
import collections
import json
import sys

from blindspot import config
from blindspot.families import calls, defaults, exists, imports, raises

FAMILIES = [imports, exists, defaults, raises, calls]


def build_candidates(index: dict) -> list:
    """All families' questions. Identical questions (same family and text, e.g. a fake name
    reachable from two real names) are kept once. Conflicting truths for the same text are a bug."""
    questions, seen = [], {}
    for fam in FAMILIES:
        for q in fam.generate(index):
            if q["id"] in seen:
                if seen[q["id"]]["truth"] != q["truth"]:
                    raise ValueError(f"conflicting truth for {q['id']}: {q['text']}")
                continue
            seen[q["id"]] = q
            questions.append(q)
    return questions


def summary(questions: list) -> str:
    by_fam = collections.Counter((q["family"], q["subkind"]) for q in questions)
    by_mod = collections.Counter(q["module"] for q in questions)
    lines = ["family      subkind     count"]
    lines += [f"{f:<11} {s:<11} {n}" for (f, s), n in sorted(by_fam.items())]
    lines += ["", "module               count"]
    lines += [f"{m:<20} {n}" for m, n in sorted(by_mod.items())]
    lines += ["", f"total candidates: {len(questions)}"]
    return "\n".join(lines)


def main() -> int:
    index_path = config.EXAMS_DIR / "index.json"
    if not index_path.exists():
        print("No index found. Run `python cli.py scan` first.")
        return 1
    index = json.loads(index_path.read_text(encoding="utf-8"))
    questions = build_candidates(index)
    out = config.EXAMS_DIR / "candidates.jsonl"
    out.write_text("\n".join(json.dumps(q) for q in questions) + "\n", encoding="utf-8")
    print(summary(questions))
    print(f"Saved to {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
