"""Step 9: a 30-question pilot set for testing the Bob pipeline (prompt, JSON parsing, marking).

- Most pilot questions come from candidates that are in neither TRAIN nor TEST.
- The scarce value-type questions (defaults) are all used by the exam, so a few are borrowed
  from TRAIN, which is the development set and may be looked at. TEST is never touched.
- Uses a different seed from the exam, and refuses to run if TEST's hash has changed.
"""
import hashlib
import json
import random
import sys

from blindspot import config
from blindspot.split import _round_robin

PILOT_SEED_OFFSET = 1000


def _read(path):
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def build(candidates, train, test, quotas, from_train, seed) -> list:
    rng = random.Random(seed + PILOT_SEED_OFFSET)
    used = {q["id"] for q in train} | {q["id"] for q in test}
    leftovers = [q for q in candidates if q["id"] not in used]

    def take(pool, stratum, n):
        items = sorted((q for q in pool if (q["family"], q["subkind"]) == stratum), key=lambda q: q["id"])
        items = _round_robin(items, lambda q: q["module"], rng)
        if len(items) < n:
            raise ValueError(f"pilot: need {n} of {stratum}, have {len(items)}")
        return items[:n]

    pilot = []
    for stratum, n in sorted(quotas.items()):
        pilot += take(leftovers, stratum, n)
    for stratum, n in sorted(from_train.items()):
        pilot += take(train, stratum, n)

    test_ids = {q["id"] for q in test}
    assert not any(q["id"] in test_ids for q in pilot), "pilot must never contain TEST questions"
    out = []
    for q in pilot:
        q = dict(q)
        q["set"] = "pilot"
        out.append(q)
    return out


def main() -> int:
    ex = config.EXAMS_DIR
    needed = [ex / "candidates.jsonl", ex / "train.jsonl", ex / "test.jsonl", ex / "split_report.json"]
    if not all(p.exists() for p in needed):
        print("Run `python cli.py generate` and `python cli.py split` first.")
        return 1
    report = json.loads((ex / "split_report.json").read_text(encoding="utf-8"))
    actual = hashlib.sha256((ex / "test.jsonl").read_bytes()).hexdigest()
    if actual != report["sha256_test"]:
        print("TEST file does not match its recorded SHA-256. Stop: TEST may have been changed.")
        return 1

    pilot = build(_read(ex / "candidates.jsonl"), _read(ex / "train.jsonl"), _read(ex / "test.jsonl"),
                  config.PILOT_QUOTAS, config.PILOT_FROM_TRAIN, config.SEED)
    (ex / "pilot.jsonl").write_text("".join(json.dumps(q, sort_keys=True) + "\n" for q in pilot),
                                    encoding="utf-8", newline="\n")
    tf = [q for q in pilot if q["type"] == "tf"]
    print(f"Pilot: {len(pilot)} questions ({sum(q['truth'] is True for q in tf)} true, "
          f"{sum(q['truth'] is False for q in tf)} false, {len(pilot) - len(tf)} value), "
          f"{len({q['module'] for q in pilot})} modules. TEST hash verified.")
    print(f"Saved to {ex / 'pilot.jsonl'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
