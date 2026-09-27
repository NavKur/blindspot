"""Step 16: `python cli.py exam` = sit (runner) + mark + report, in one command.

Run it from a standalone PowerShell window with BOB_API_KEY set, never from the Bob IDE terminal.
"""
import hashlib
import json

from blindspot import config, mark, report, runner


def test_hash_ok() -> bool:
    rep = json.loads((config.EXAMS_DIR / "split_report.json").read_text(encoding="utf-8"))
    actual = hashlib.sha256((config.EXAMS_DIR / "test.jsonl").read_bytes()).hexdigest()
    return actual == rep["sha256_test"]


def main(qset, condition, repeat=1, allow_ide=False) -> int:
    problem = runner.preflight(qset, allow_ide)
    if problem:
        print(problem)
        return 2
    qpath = config.EXAMS_DIR / f"{qset}.jsonl"
    if not qpath.exists():
        print(f"{qpath.name} not found. Run split (and pilot) first.")
        return 1
    if qset == "test" and not test_hash_ok():
        print("TEST file does not match its recorded SHA-256. Stop: TEST may have been changed.")
        return 1
    questions = mark.read_jsonl(qpath)
    name = runner.run_name(qset, condition, repeat)
    print(f"Sitting {name}: {len(questions)} questions in batches of {config.BATCH_SIZE} ...")
    try:
        res = runner.sit(questions, qset, condition, repeat)
    except FileNotFoundError as e:
        print(e)
        return 1
    print(f"Done: {res['questions'] - res['excluded']} answered, {res['excluded']} excluded, "
          f"new cost {res['cost']} Bobcoins.")
    rc = mark.main(qset, condition, repeat)
    if rc:
        return rc
    return report.main(qset, condition, repeat)
