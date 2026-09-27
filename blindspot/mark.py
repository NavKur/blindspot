"""Step 16: mark Bob's answers against the machine-checked truth.

Input : exams/<set>.jsonl (questions + truth) and results/answers/<run>.jsonl (from the runner).
Output: results/marked/<run>.jsonl, which the report (step 11) and publish (step 17) read.
Each marked line keeps the question text, Bob's answer and the truth, so the published context
can say exactly what Bob believed and what is actually true.
"""
import ast
import json

from blindspot import config

MARKED_DIR = config.RESULTS_DIR / "marked"


def _literal(text):
    """(type name, value) of a Python literal, or None if it is not one. Type matters: 0 != False."""
    try:
        v = ast.literal_eval(str(text).strip())
    except (ValueError, SyntaxError, TypeError, MemoryError, RecursionError):
        return None
    return (type(v).__name__, v)


def is_correct(question, answer) -> bool:
    if answer is None:
        return False
    if question["type"] == "tf":
        return isinstance(answer, bool) and answer == question["truth"]
    want, got = _literal(question["truth"]), _literal(answer)
    if want is not None and got is not None:
        return want == got
    return str(answer).strip() == str(question["truth"]).strip()


def mark(questions, answers) -> list:
    """One marked row per question. Questions with no answer line at all are excluded as missing."""
    by_id = {a["id"]: a for a in answers}
    rows = []
    for q in sorted(questions, key=lambda x: x["id"]):
        a = by_id.get(q["id"], {"answer": None, "p": None, "excluded": True, "reason": "missing"})
        excluded = bool(a.get("excluded"))
        rows.append({
            "id": q["id"], "module": q["module"], "path": q["path"], "entity": q["entity"],
            "family": q["family"], "type": q["type"], "text": q["text"], "truth": q["truth"],
            "answer": a.get("answer"), "p": a.get("p"),
            "correct": 0 if excluded else int(is_correct(q, a.get("answer"))),
            "excluded": excluded, "reason": a.get("reason"),
        })
    return rows


def write(rows, name, out_dir=None):
    out_dir = out_dir or MARKED_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"{name}.jsonl"
    with open(path, "w", encoding="utf-8", newline="\n") as f:
        f.writelines(json.dumps(r, sort_keys=True) + "\n" for r in rows)
    return path


def read_jsonl(path) -> list:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def main(qset, condition, repeat=1) -> int:
    from blindspot import runner
    name = runner.run_name(qset, condition, repeat)
    qpath = config.EXAMS_DIR / f"{qset}.jsonl"
    apath = runner.ANSWERS_DIR / f"{name}.jsonl"
    for p in (qpath, apath):
        if not p.exists():
            print(f"{p} not found.")
            return 1
    rows = mark(read_jsonl(qpath), read_jsonl(apath))
    path = write(rows, name)
    scored = [r for r in rows if not r["excluded"]]
    acc = sum(r["correct"] for r in scored) / len(scored) if scored else float("nan")
    print(f"Marked {name}: {len(scored)} scored, {len(rows) - len(scored)} excluded, accuracy {acc:.1%}. Saved {path.name}")
    return 0
