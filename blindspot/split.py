"""Step 8: draw a balanced exam from the candidates and split it into TRAIN and TEST.

1. Draw: for each (family, stratum) in config.QUOTAS, pick that many candidates, spreading the
   picks across modules and then across entities (round-robin), so no single module or function
   dominates. True/false balance comes from equal quotas for "true" and "false" strata.
2. Split: sort the drawn questions by (family, stratum, module) with a seeded random tie-break,
   then assign TEST to every question where floor((i+1)*N_TEST/N) > floor(i*N_TEST/N). This is
   systematic sampling: exactly N_TEST questions go to TEST and every stratum is split in proportion.
3. Seal: write exams/train.jsonl and exams/test.jsonl and record the SHA-256 of the TEST file, so
   anyone can later prove TEST was not changed after results were seen.
"""
import collections
import hashlib
import json
import random
import sys

from blindspot import config


class NotEnoughCandidates(ValueError):
    pass


def _round_robin(items, key, rng):
    """Interleave items so consecutive picks come from different groups."""
    groups = collections.defaultdict(list)
    for it in items:
        groups[key(it)].append(it)
    order = sorted(groups)
    rng.shuffle(order)
    for g in order:
        rng.shuffle(groups[g])
    out = []
    while any(groups[g] for g in order):
        for g in order:
            if groups[g]:
                out.append(groups[g].pop())
    return out


def draw(candidates: list, quotas: dict, seed: int) -> list:
    rng = random.Random(seed)
    by_stratum = collections.defaultdict(list)
    for q in candidates:
        by_stratum[(q["family"], q["subkind"])].append(q)

    picked, shortfalls = [], []
    for stratum in sorted(quotas):
        need = quotas[stratum]
        pool = sorted(by_stratum.get(stratum, []), key=lambda q: q["id"])   # stable before shuffling
        if len(pool) < need:
            shortfalls.append(f"{stratum}: need {need}, have {len(pool)}")
            continue
        # Spread across modules first, then across entities inside each module.
        per_module = collections.defaultdict(list)
        for q in pool:
            per_module[q["module"]].append(q)
        module_queues = {m: _round_robin(qs, lambda q: q["entity"], rng) for m, qs in per_module.items()}
        modules = sorted(module_queues)
        rng.shuffle(modules)
        chosen = []
        while len(chosen) < need:
            for m in modules:
                if module_queues[m] and len(chosen) < need:
                    chosen.append(module_queues[m].pop(0))
        picked.extend(chosen)
    if shortfalls:
        raise NotEnoughCandidates("Not enough candidates for: " + "; ".join(shortfalls))
    return picked


def split(questions: list, n_test: int, seed: int):
    rng = random.Random(seed + 1)
    keyed = [((q["family"], q["subkind"], q["module"]), rng.random(), q) for q in questions]
    keyed.sort(key=lambda t: (t[0], t[1]))
    n = len(keyed)
    train, test = [], []
    for i, (_, _, q) in enumerate(keyed):
        (test if (i + 1) * n_test // n > i * n_test // n else train).append(q)
    return train, test


def _write(path, questions):
    text = "".join(json.dumps(q, sort_keys=True) + "\n" for q in sorted(questions, key=lambda q: q["id"]))
    path.write_text(text, encoding="utf-8", newline="\n")
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def report(train, test) -> dict:
    def counts(qs, key):
        return dict(sorted(collections.Counter(key(q) for q in qs).items()))
    tf = lambda qs: counts([q for q in qs if q["type"] == "tf"], lambda q: str(q["truth"]))
    return {
        "n_train": len(train), "n_test": len(test),
        "family_train": counts(train, lambda q: q["family"]), "family_test": counts(test, lambda q: q["family"]),
        "truth_train": tf(train), "truth_test": tf(test),
        "module_train": counts(train, lambda q: q["module"]), "module_test": counts(test, lambda q: q["module"]),
        "entities": len({q["entity"] for q in train + test}),
    }


def main() -> int:
    path = config.EXAMS_DIR / "candidates.jsonl"
    if not path.exists():
        print("No candidates found. Run `python cli.py generate` first.")
        return 1
    candidates = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    total = sum(config.QUOTAS.values())
    if total != config.N_TRAIN + config.N_TEST:
        print(f"QUOTAS add up to {total}, but N_TRAIN + N_TEST = {config.N_TRAIN + config.N_TEST}.")
        return 1
    exam = draw(candidates, config.QUOTAS, config.SEED)
    train, test = split(exam, config.N_TEST, config.SEED)
    for q in train:
        q["set"] = "train"
    for q in test:
        q["set"] = "test"
    train_hash = _write(config.EXAMS_DIR / "train.jsonl", train)
    test_hash = _write(config.EXAMS_DIR / "test.jsonl", test)
    rep = report(train, test)
    rep.update({"seed": config.SEED, "sha256_train": train_hash, "sha256_test": test_hash})
    (config.EXAMS_DIR / "split_report.json").write_text(json.dumps(rep, indent=2), encoding="utf-8")

    print(f"TRAIN {rep['n_train']}   TEST {rep['n_test']}   distinct entities {rep['entities']}")
    print(f"true/false  TRAIN {rep['truth_train']}   TEST {rep['truth_test']}")
    print("family      train  test")
    for fam in sorted(rep["family_test"]):
        print(f"{fam:<11} {rep['family_train'].get(fam, 0):>5}  {rep['family_test'][fam]:>4}")
    print("module               train  test")
    for mod in sorted(set(rep["module_train"]) | set(rep["module_test"])):
        print(f"{mod:<20} {rep['module_train'].get(mod, 0):>5}  {rep['module_test'].get(mod, 0):>4}")
    print(f"\nSHA-256 of test.jsonl: {test_hash}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
