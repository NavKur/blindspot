"""Step 15: the Bob runner. Sits one question set under one condition, in batches, closed-book.

Exam workspaces are fresh copies of the pinned target in .cache/exam_ws/<condition>/, with every
agent context file removed and then only that condition's context added:
  C0: nothing
  C1: contexts/C1/AGENTS.md  (made by Bob /init on target/tinydb, step 18)
  C2: contexts/C2/AGENTS.md  (C1 plus the Cartographer section, steps 20 to 22)
So whatever is published into target/tinydb (step 17) can never leak into an exam.

Output:
  results/answers/<run>.jsonl     one line per question: answer, p, batch, excluded, reason
  results/raw/<run>/batch_NN.json  Bob's raw reply and stats for every call (audit trail)
  results/costs.jsonl             one line per call (cached calls cost 0)
Cache: .cache/bob/<hash>.json, so a crash or rerun never pays twice for the same call.
"""
import hashlib
import json
import os
import random
import shutil
import subprocess
import time
from datetime import datetime, timezone
from pathlib import Path

from blindspot import config, examinee, gonogo, target

EXAM_WS = config.ROOT / ".cache" / "exam_ws"
CONTEXTS_DIR = config.ROOT / "contexts"
ANSWERS_DIR = config.RESULTS_DIR / "answers"
RAW_DIR = config.RESULTS_DIR / "raw"
COSTS = config.RESULTS_DIR / "costs.jsonl"
MAX_MISSING = 0.10          # PREREGISTRATION.md section 6: re-run a batch once above this
CALL_TIMEOUT = 300
MAX_TURNS = 2
MAX_COST = 1.0


def run_name(qset, condition, repeat) -> str:
    return f"{qset}_{condition}_r{repeat}"


def context_file(condition):
    return None if condition == "C0" else CONTEXTS_DIR / condition / "AGENTS.md"


def build_workspace(condition, root=None) -> Path:
    """Fresh exam workspace for one condition. Raises if the target or the context is missing."""
    root = root or EXAM_WS
    if not (config.TARGET_DIR / "tinydb").exists():
        raise FileNotFoundError("Target not found. Run `python cli.py target` first.")
    ctx = context_file(condition)
    if ctx is not None and not ctx.exists():
        raise FileNotFoundError(f"{ctx.relative_to(config.ROOT)} is missing. See step 18 (C1) or 22 (C2).")
    ws = root / condition
    if ws.exists():
        shutil.rmtree(ws)
    shutil.copytree(config.TARGET_DIR, ws, ignore=shutil.ignore_patterns(".git"))
    target.remove_agent_context(ws)
    (ws / ".bob").mkdir()
    (ws / ".bob" / "custom_modes.yaml").write_text(examinee.MODES_YAML, encoding="utf-8")
    if ctx is not None:
        shutil.copyfile(ctx, ws / "AGENTS.md")
    return ws


def batches(questions, size=config.BATCH_SIZE, seed=config.SEED) -> list:
    """Same order and same batches for every condition and repeat (sorted by id, then a seeded shuffle)."""
    qs = sorted(questions, key=lambda q: q["id"])
    random.Random(seed).shuffle(qs)
    return [qs[i:i + size] for i in range(0, len(qs), size)]


def call_bob(prompt, ws, extra, max_turns=MAX_TURNS, max_cost=MAX_COST) -> dict:
    """One headless call with the prompt on stdin (avoids Windows quoting problems)."""
    cmd = gonogo.bob_command() + [
        "run", "--format", "json", "--workspace", str(ws), "--trust", "--accept-license",
        "--max-turns", str(max_turns), "--max-cost", str(max_cost), *extra,
    ]
    t0 = time.time()
    try:
        p = subprocess.run(cmd, input=prompt, capture_output=True, text=True, encoding="utf-8",
                           errors="replace", timeout=CALL_TIMEOUT)
        rc, out, err = p.returncode, p.stdout, p.stderr
    except subprocess.TimeoutExpired:
        rc, out, err = -1, "", f"timed out after {CALL_TIMEOUT}s"
    res = gonogo.parse_result(out)
    stats = (res or {}).get("stats", {}) or {}
    return {"returncode": rc, "seconds": round(time.time() - t0, 1), "parsed": res is not None,
            "status": (res or {}).get("status"), "cost": stats.get("session_costs") or 0.0,
            "tool_calls": stats.get("tool_calls") or 0, "tokens": stats.get("total_tokens"),
            "reply": (res or {}).get("last_message", ""),
            "stdout_tail": "" if res else out[-800:], "stderr_tail": err[-800:]}


def cached_call(key_parts, prompt, ws, extra, cache_dir=None, **kw) -> dict:
    cache_dir = cache_dir or config.CACHE_DIR
    key = hashlib.sha256("|".join(map(str, key_parts)).encode()).hexdigest()[:24]
    path = cache_dir / f"{key}.json"
    if path.exists():
        data = json.loads(path.read_text(encoding="utf-8"))
        data["cached"] = True
        return data
    data = call_bob(prompt, ws, extra, **kw)
    data["cached"] = False
    if data["parsed"] and data["status"] == "success":    # never cache failures
        cache_dir.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(data, indent=2), encoding="utf-8")
    return data


def _append(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "a", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(obj, sort_keys=True) + "\n")


def sit(questions, qset, condition, repeat=1, log=print) -> dict:
    """Run every batch; returns counts. Writes answers, raw replies and costs."""
    name = run_name(qset, condition, repeat)
    ws = build_workspace(condition)
    ctx = context_file(condition)
    ctx_hash = hashlib.sha256(ctx.read_bytes()).hexdigest()[:12] if ctx else "none"
    raw_dir = RAW_DIR / name
    raw_dir.mkdir(parents=True, exist_ok=True)
    rows, total_cost = [], 0.0
    groups = batches(questions)
    for i, batch in enumerate(groups, 1):
        prompt = examinee.build_prompt(batch)
        for attempt in (1, 2):
            key = (name, i, attempt, ctx_hash, hashlib.sha256(prompt.encode()).hexdigest())
            r = cached_call(key, prompt, ws, examinee.EXAM_FLAGS)
            total_cost += 0.0 if r["cached"] else float(r["cost"] or 0)
            (raw_dir / f"batch_{i:02d}_try{attempt}.json").write_text(json.dumps(r, indent=2), encoding="utf-8")
            _append(COSTS, {"run": name, "batch": i, "attempt": attempt, "cost": 0.0 if r["cached"] else r["cost"],
                            "cached": r["cached"], "seconds": r["seconds"],
                            "at": datetime.now(timezone.utc).isoformat(timespec="seconds")})
            answers = examinee.parse_answers(r["reply"], batch)
            missing = 1 - len(answers) / len(batch)
            log(f"  batch {i}/{len(groups)} try {attempt}: {len(answers)}/{len(batch)} answered, "
                f"tools {r['tool_calls']}, cost {r['cost']}{' (cached)' if r['cached'] else ''}")
            if not r["parsed"]:
                log(f"    Bob output not parsed. stderr: {r['stderr_tail'][-300:]}")
            if r["tool_calls"] == 0 and missing <= MAX_MISSING:
                break
        for q in batch:
            a = answers.get(q["id"])
            if r["tool_calls"]:
                reason = "tool_use"
            elif a is None:
                reason = "missing"
            else:
                reason = None
            rows.append({"id": q["id"], "batch": i, "attempt": attempt,
                         "answer": a["answer"] if a else None, "p": a["p"] if a else None,
                         "excluded": reason is not None, "reason": reason})
    ANSWERS_DIR.mkdir(parents=True, exist_ok=True)
    with open(ANSWERS_DIR / f"{name}.jsonl", "w", encoding="utf-8", newline="\n") as f:
        f.writelines(json.dumps(r, sort_keys=True) + "\n" for r in rows)
    excluded = sum(r["excluded"] for r in rows)
    return {"run": name, "questions": len(rows), "excluded": excluded, "cost": round(total_cost, 4)}


def preflight(qset, allow_ide=False) -> str:
    """Reasons not to run, or '' when it is safe to spend coins."""
    if not os.environ.get("BOB_API_KEY") and not os.environ.get("BOB_BIN"):
        return "BOB_API_KEY is not set. Open a new PowerShell window after setx, or set it for this window."
    if os.environ.get("TERM_PROGRAM") == "vscode" and not allow_ide:
        return ("This looks like the Bob IDE terminal. Run exams from a standalone PowerShell window, "
                "so no IDE context reaches Bob (or pass --allow-ide if you are sure).")
    if qset == "test" and not freeze_tag_exists():
        return "TEST is sealed until the repo is tagged `freeze` (step 22)."
    return ""


def freeze_tag_exists() -> bool:
    try:
        out = subprocess.run(["git", "-c", f"safe.directory={config.ROOT}", "tag", "-l", "freeze"],
                             cwd=config.ROOT, capture_output=True, text=True, timeout=30).stdout
    except (OSError, subprocess.SubprocessError):
        return False
    return out.strip() == "freeze"
