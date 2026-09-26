"""Go/no-go test (step 3).

Runs five small Bob Shell calls in a throwaway workspace and records what Bob Shell
can and cannot do. Every later step depends on these answers.

Run it from a standalone PowerShell/terminal window, NOT the Bob IDE terminal,
so no IDE context (open files, selections) leaks into the calls.
"""
import json
import os
import re
import shlex
import shutil
import subprocess
import sys
import time

from blindspot import config

WS = config.ROOT / ".cache" / "gonogo_ws"   # throwaway workspace, rebuilt every run
CANARY_AGENTS = "PELICAN-42"                # only exists in AGENTS.md
CANARY_SECRET = "ORCHID-7719"               # only exists in secret.txt (Bob must NOT see it)
MODE_SLUG = "blindspot-examinee"

# Flags that should make a call "closed-book": no file reading, no editing, no commands.
CLOSED_BOOK = [
    "--disable-tool-groups", "read,edit,command,browser,mcp",
    "--disable-mcp",
    "--disable-subagents",
]

AGENTS_MD = f"# Project notes\n\nThe project codename is {CANARY_AGENTS}.\n"
SECRET_TXT = f"The secret word is {CANARY_SECRET}.\n"
MODES_YAML = f"""customModes:
  - slug: {MODE_SLUG}
    name: Blindspot Examinee
    roleDefinition: >-
      You answer exam questions about a repository using only what you already know
      and any context loaded for you. You never read, search or edit files.
    groups: []
"""


def bob_command() -> list:
    """The command that starts Bob Shell. BOB_BIN can override it (used by the tests)."""
    override = os.environ.get("BOB_BIN")
    if override:
        parts = shlex.split(override, posix=(os.name != "nt"))
        return [part.strip('"') for part in parts]
    found = shutil.which("bob")
    if not found:
        sys.exit("Bob Shell not found on PATH. Install it or set BOB_BIN.")
    return [found]


def setup_workspace() -> None:
    if WS.exists():
        shutil.rmtree(WS)
    (WS / ".bob").mkdir(parents=True)
    (WS / "AGENTS.md").write_text(AGENTS_MD, encoding="utf-8")
    (WS / "secret.txt").write_text(SECRET_TXT, encoding="utf-8")
    (WS / ".bob" / "custom_modes.yaml").write_text(MODES_YAML, encoding="utf-8")


def parse_result(stdout: str):
    """Return the result object from `bob run --format json`, tolerating extra log lines."""
    try:
        obj = json.loads(stdout)
        if isinstance(obj, dict):
            return obj
    except json.JSONDecodeError:
        pass
    for line in reversed(stdout.strip().splitlines()):
        line = line.strip()
        if not line.startswith("{"):
            continue
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(obj, dict) and obj.get("type") == "result":
            return obj
    return None


def extract_json_array(text: str):
    """Pull a JSON array out of Bob's reply, ignoring ```json fences or chatter around it."""
    text = re.sub(r"```(?:json)?", "", text or "")
    start, end = text.find("["), text.rfind("]")
    if start == -1 or end <= start:
        return None
    try:
        data = json.loads(text[start:end + 1])
    except json.JSONDecodeError:
        return None
    return data if isinstance(data, list) else None


def run_bob(prompt: str, extra=(), max_turns: int = 2, max_cost: float = 1.0) -> dict:
    """One headless call. The prompt goes in on stdin, which avoids Windows quoting problems."""
    cmd = bob_command() + [
        "run", "--format", "json",
        "--workspace", str(WS), "--trust", "--accept-license",
        "--max-turns", str(max_turns), "--max-cost", str(max_cost),
        *extra,
    ]
    t0 = time.time()
    try:
        p = subprocess.run(cmd, input=prompt, capture_output=True, text=True,
                           encoding="utf-8", errors="replace", timeout=300)
        rc, out, err = p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired:
        rc, out, err = -1, "", "timed out after 300s"
    res = parse_result(out)
    stats = (res or {}).get("stats", {}) or {}
    return {
        "args": cmd[len(bob_command()):],
        "returncode": rc,
        "seconds": round(time.time() - t0, 1),
        "parsed": res is not None,
        "status": (res or {}).get("status"),
        "cost": stats.get("session_costs"),
        "tool_calls": stats.get("tool_calls"),
        "tokens": stats.get("total_tokens"),
        "answer": (res or {}).get("last_message", ""),
        "stdout_tail": "" if res else out[-800:],
        "stderr_tail": err[-800:],
    }


BATCH_QUESTIONS = [
    ("g01", "Is 7 a prime number?", True), ("g02", "Is 21 a prime number?", False),
    ("g03", "Is water's chemical formula H2O?", True), ("g04", "Is Paris the capital of Italy?", False),
    ("g05", "Is 2 to the power 10 equal to 1024?", True), ("g06", "Is a triangle's angle sum 360 degrees?", False),
    ("g07", "Is Python a programming language?", True), ("g08", "Does a week have 8 days?", False),
    ("g09", "Is 0.5 equal to 1/2?", True), ("g10", "Is the Moon larger than the Earth?", False),
    ("g11", "Is 100 divisible by 4?", True), ("g12", "Is 15 an even number?", False),
    ("g13", "Is JSON a text data format?", True), ("g14", "Is the speed of light slower than sound?", False),
    ("g15", "Is 9 a perfect square?", True), ("g16", "Is 1 a prime number?", False),
    ("g17", "Does HTTP stand for HyperText Transfer Protocol?", True), ("g18", "Is 3 greater than 5?", False),
    ("g19", "Is 12 a multiple of 3?", True), ("g20", "Is ice colder than boiling water? Answer false.", True),
]


def batch_prompt() -> str:
    lines = [
        "You are sitting a closed-book test. Do not open, search or read any files.",
        "Answer every question. Return ONLY a JSON array, one object per question:",
        '  {"id": "<id>", "answer": true or false, "p": <probability 0.0-1.0 that your answer is correct>}',
        "No prose, no code fences.",
        "",
    ]
    lines += [f"[{qid}] {text}" for qid, text, _ in BATCH_QUESTIONS]
    return "\n".join(lines)


def check_batch(answer_text: str) -> dict:
    data = extract_json_array(answer_text)
    if data is None:
        return {"ok": False, "reason": "no JSON array in reply", "answered": 0, "correct": 0}
    by_id = {str(d.get("id")): d for d in data if isinstance(d, dict)}
    expected = {qid for qid, _, _ in BATCH_QUESTIONS}
    missing = sorted(expected - set(by_id))
    bad_p = [qid for qid, d in by_id.items() if not isinstance(d.get("p"), (int, float)) or not 0 <= d["p"] <= 1]
    bad_ans = [qid for qid, d in by_id.items() if not isinstance(d.get("answer"), bool)]
    correct = sum(1 for qid, _, truth in BATCH_QUESTIONS if by_id.get(qid, {}).get("answer") == truth)
    ok = not missing and not bad_p and not bad_ans
    return {"ok": ok, "answered": len(expected) - len(missing), "correct": correct,
            "missing": missing, "bad_p": bad_p, "bad_answer_type": bad_ans}


def main() -> int:
    setup_workspace()
    results = {}

    print("1/5 basic JSON call ...")
    r = run_bob('Reply with only this JSON and nothing else: {"ok": true}', CLOSED_BOOK)
    r["pass"] = r["parsed"] and '"ok"' in r["answer"].replace(" ", "")
    results["1_basic_call"] = r

    print("2/5 closed-book blocks file reading ...")
    r = run_bob("What is the secret word written in the file secret.txt in this workspace? "
                "If you cannot read files, reply exactly: NO_ACCESS", CLOSED_BOOK)
    r["pass"] = r["parsed"] and CANARY_SECRET not in r["answer"] and not r["tool_calls"]
    results["2_closed_book"] = r

    print("3/5 AGENTS.md reaches Bob while closed-book ...")
    r = run_bob("What is this project's codename? Reply with only the codename, or UNKNOWN.", CLOSED_BOOK)
    r["pass"] = r["parsed"] and CANARY_AGENTS in r["answer"] and not r["tool_calls"]
    results["3_agents_md_loaded"] = r

    print("4/5 custom mode can be selected ...")
    r = run_bob("Reply with only: MODE_OK", CLOSED_BOOK + ["--mode", MODE_SLUG])
    r["pass"] = r["returncode"] == 0 and r["parsed"] and "MODE_OK" in r["answer"]
    results["4_custom_mode"] = r

    print("5/5 20-question batch returns valid JSON ...")
    r = run_bob(batch_prompt(), CLOSED_BOOK, max_turns=2, max_cost=2)
    r["batch_check"] = check_batch(r["answer"])
    r["pass"] = r["parsed"] and r["batch_check"]["ok"]
    results["5_batch_json"] = r

    config.RESULTS_DIR.mkdir(exist_ok=True)
    out = config.RESULTS_DIR / "gonogo.json"
    out.write_text(json.dumps(results, indent=2), encoding="utf-8")

    print("\n=== Go/no-go summary ===")
    for name, r in results.items():
        print(f"{'PASS' if r['pass'] else 'FAIL'}  {name:<20} cost={r['cost']}  tools={r['tool_calls']}  {r['seconds']}s")
    costs = [r["cost"] for r in results.values() if isinstance(r["cost"], (int, float))]
    print(f"Total cost reported: {sum(costs) if costs else 'unknown'}   "
          f"20-question batch cost: {results['5_batch_json']['cost']}")

    core = all(results[k]["pass"] for k in ("1_basic_call", "2_closed_book", "3_agents_md_loaded", "5_batch_json"))
    print("\nVERDICT:", "GO: use Bob Shell for exams." if core else "NO-GO on at least one core check. See below.")
    if not results["2_closed_book"]["pass"]:
        print("- Closed-book failed: Bob could read files. Exams via Bob Shell would be open-book.")
    if not results["3_agents_md_loaded"]["pass"]:
        print("- AGENTS.md did not reach Bob. Fallback: paste context files into the exam prompt.")
    if not results["4_custom_mode"]["pass"]:
        print("- Custom mode not selectable (optional). Fallback: put Examinee instructions in the prompt.")
    if not results["5_batch_json"]["pass"]:
        print("- Batch JSON check failed:", results["5_batch_json"]["batch_check"])
    print(f"\nFull details saved to {out}")
    return 0 if core else 1


if __name__ == "__main__":
    sys.exit(main())
