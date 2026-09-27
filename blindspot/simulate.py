"""Step 12: a simulated examinee, so the statistics, the report and the Bob IDE plugin can be built
and tested before any real Bob run.

Nothing here calls Bob. Every file it writes is marked "simulated": true and lives in results/sim/,
never in results/marked/ or results/report_latest.json, so fake data cannot be mistaken for real results.

How the fake examinee behaves (all deterministic from SEED):
- Each module has a hidden skill between 0.55 and 0.92 (some modules are weak, as Bob's will be).
- Each question has a hidden difficulty, shared across conditions, so C1 and C2 answers are paired
  and mostly agree, as real repeated exams do. That matters for McNemar in step 13.
- C0 is a bit worse than C1. C2 improves the modules C1 flagged red (mimicking the Cartographer)
  and is less overconfident.
- Stated probabilities are overconfident on purpose, so the calibration charts have something to show.
- About 1% of answers are marked excluded, to exercise that path.
"""
import hashlib
import json
import shutil
from datetime import datetime, timedelta, timezone

import numpy as np

from blindspot import config, report

SIM_DIR = config.RESULTS_DIR / "sim"
SKILL_RANGE = (0.55, 0.92)
CONDITION_SHIFT = {"C0": -0.06, "C1": 0.0, "C2": 0.0}
C2_BOOST_TARGETED = 0.15      # improvement on modules the Cartographer wrote context for
C2_BOOST_OTHER = 0.02
OVERCONFIDENCE = {"C0": 0.14, "C1": 0.12, "C2": 0.06}
EXCLUDE_RATE = 0.01
REPEAT_NOISE = 0.10           # share of questions whose difficulty is redrawn in each run


def _unit(*parts) -> float:
    """Deterministic number in [0, 1) from any labels (stable across machines and Python versions)."""
    h = hashlib.sha256("|".join(str(p) for p in parts).encode()).hexdigest()
    return int(h[:12], 16) / 16 ** 12


def module_skill(module, seed=config.SEED) -> float:
    lo, hi = SKILL_RANGE
    return lo + (hi - lo) * _unit("skill", module, seed)


def answer_questions(questions, condition, repeat=1, seed=config.SEED, targeted=()) -> list:
    """Fake marked answers in the same format step 16 will produce."""
    rng = np.random.default_rng([seed, repeat, config.CONDITIONS.index(condition)])
    out = []
    for q in questions:
        a = module_skill(q["module"], seed) + CONDITION_SHIFT[condition]
        if condition == "C2":
            a += C2_BOOST_TARGETED if q["module"] in targeted else C2_BOOST_OTHER
        a = float(np.clip(a, 0.05, 0.98))

        u = _unit("difficulty", q["id"], seed)
        if rng.random() < REPEAT_NOISE:
            u = rng.random()
        correct = int(u < a)

        floor = 0.5 if q.get("type", "tf") == "tf" else 0.05
        p = a + OVERCONFIDENCE[condition] + (0.05 if correct else -0.05) + rng.normal(0, 0.07)
        p = round(float(np.clip(p, floor, 0.99)), 2)

        truth = q.get("truth", True)
        if correct:
            answer = truth
        elif isinstance(truth, bool):
            answer = not truth
        else:
            answer = "'<simulated wrong value>'"
        out.append({"id": q["id"], "module": q["module"], "path": q["path"], "entity": q["entity"],
                    "family": q["family"], "type": q.get("type", "tf"), "text": q.get("text", ""),
                    "truth": truth, "answer": answer, "correct": correct, "p": p,
                    "excluded": bool(rng.random() < EXCLUDE_RATE), "simulated": True})
    return out


def pick_targets(rep) -> list:
    """What the Cartographer would target: red modules, else the worst by confidently-wrong rate."""
    if rep["red_modules"]:
        return rep["red_modules"][: config.MAX_CARTO_MODULES]      # already ordered worst first
    worst = sorted(rep["modules"], key=report.severity)
    return [m["module"] for m in worst[: config.MAX_CARTO_MODULES]]


def run_scenario(questions, qset="train", out_dir=SIM_DIR, seed=config.SEED, now=None, commit=None) -> dict:
    """C0, then C1, then C2 (targeting C1's red modules), one hour apart, so history.jsonl shows change over time."""
    if out_dir.exists():
        shutil.rmtree(out_dir)             # a rerun gives exactly the same files, not duplicated history
    (out_dir / "marked").mkdir(parents=True)
    now = now or datetime.now(timezone.utc).replace(microsecond=0)

    reports, targeted = {}, []
    for i, cond in enumerate(("C0", "C1", "C2")):
        marked = answer_questions(questions, cond, 1, seed, targeted if cond == "C2" else ())
        name = report.run_name(qset, cond, 1)
        with open(out_dir / "marked" / f"{name}.jsonl", "w", encoding="utf-8", newline="\n") as f:
            f.writelines(json.dumps(r, sort_keys=True) + "\n" for r in marked)
        rep = report.build_report(marked, qset, cond, 1, commit=commit,
                                  now=now - timedelta(hours=2 - i), simulated=True)
        if cond == "C2":
            rep["targeted_modules"] = targeted
        report.write_report(rep, results_dir=out_dir)
        reports[cond] = rep
        if cond == "C1":
            targeted = pick_targets(rep)
    return {"reports": reports, "targeted": targeted}


def main(qset="train") -> int:
    path = config.EXAMS_DIR / f"{qset}.jsonl"
    if not path.exists():
        print(f"{path.name} not found. Run `python cli.py split` (and `pilot` for the pilot set) first.")
        return 1
    questions = [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]
    res = run_scenario(questions, qset, commit=report.target_commit())
    for cond, rep in res["reports"].items():
        o = rep["overall"]
        print(f"  {cond}: accuracy {o['accuracy']:.1%}, Brier {o['brier']:.3f}, "
              f"confidently wrong {o['cw_rate']:.1%}, red {rep['red_modules']}")
    print(f"C2 targeted: {res['targeted']}")
    print(f"SIMULATED data written to {SIM_DIR} (report_latest.json, history.jsonl, per-run reports).")
    return 0
