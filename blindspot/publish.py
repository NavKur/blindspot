"""Step 17: publish what Blindspot learned into the target repo, for the Bob IDE plugin and for
every coding agent working there.

Writes into the destination repo (default target/tinydb):
  .bob/context/readiness.json      the plugin's context contract (plugin/BUILD_PLAN.md section 2)
  .bob/rules/readiness-context.md  readable facts; Bob loads .bob/rules automatically
  AGENTS.md                        a marked Blindspot block (other text in the file is kept)
  .bob/blindspot/                  report_latest.json, history.jsonl and per-run reports, so the
                                   plugin's Exam tab works when the target repo is the workspace

Safe for the experiment: exams run in fresh copies with all agent files removed (runner.py),
so nothing published here can reach an exam.
"""
import ast
import json
import shutil
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import Path

from blindspot import config, report

BLOCK_START = "<!-- blindspot:start -->"
BLOCK_END = "<!-- blindspot:end -->"
READY, REVIEW = 0.85, 0.65          # the plugin's readiness gate (BUILD_PLAN.md section 1)
EST_COINS = 0.05                    # rough cost of one Bob fix call, shown in the plugin
MAX_FACTS = 40


def gate(readiness) -> str:
    return "yes" if readiness >= READY else "with_notes" if readiness >= REVIEW else "no"


def file_status(readiness) -> str:
    return "ready" if readiness >= READY else "review" if readiness >= REVIEW else "not_ready"


def fmt(value) -> str:
    if value is True:
        return "yes"
    if value is False:
        return "no"
    return str(value)


def find_node(tree, qualname):
    """Deepest def/class matching the dotted name (last definition wins, like the scanner).
    Falls back to the longest existing prefix, so a question about a fake method maps to its class."""
    body, found = tree.body, None
    for part in qualname.split("."):
        match = None
        for node in body:
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)) and node.name == part:
                match = node
        if match is None:
            break
        found, body = match, match.body
    return found


def locate(dest, rows) -> dict:
    """entity -> (file, name, line_start, line_end) for entities that map onto a def or class."""
    trees, out = {}, {}
    for r in rows:
        ent = r["entity"]
        if ent in out or ":" not in ent:
            continue
        _, qual = ent.split(":", 1)
        if qual.startswith("<"):
            continue
        if r["path"] not in trees:
            src = dest / r["path"]
            trees[r["path"]] = ast.parse(src.read_text(encoding="utf-8")) if src.exists() else None
        tree = trees[r["path"]]
        node = find_node(tree, qual) if tree else None
        if node is not None:
            name = qual if qual.split(".")[-1] == node.name else qual.rsplit(".", 1)[0]
            end = node.end_lineno or node.lineno
            if isinstance(node, ast.ClassDef):
                # a class covers all its methods; highlight only its header, not the whole body
                first = next((n.lineno for n in node.body if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef))), None)
                end = max(node.lineno, (first - 1) if first else end)
                end = min(end, node.lineno + 10)
            out[ent] = (r["path"], name, node.lineno, end)
    return out


def tests_text(dest) -> str:
    tests = dest / "tests"
    if not tests.exists():
        return ""
    return "\n".join(p.read_text(encoding="utf-8", errors="replace") for p in sorted(tests.rglob("*.py")))


def build_context(rows, dest, commit, bobcoins=0.0, simulated=False, now=None) -> dict:
    scored = [r for r in rows if not r["excluded"]]
    if not scored:
        raise ValueError("no scored answers to publish")
    rep = report.build_report(rows, "publish", "C1", 1, commit=commit)
    places = locate(dest, scored)
    tests = tests_text(dest)

    by_fn = defaultdict(list)
    for r in scored:
        if r["entity"] in places:
            file, name, _, _ = places[r["entity"]]
            by_fn[(file, name)].append(r)
    spans = {}
    for ent, (file, name, a, b) in places.items():
        s = spans.get((file, name))
        spans[(file, name)] = (min(a, s[0]), max(b, s[1])) if s else (a, b)

    functions, findings = [], []
    for (file, name), rs in sorted(by_fn.items()):
        start, end = spans[(file, name)]
        acc = sum(r["correct"] for r in rs) / len(rs)
        wrong = sorted((r for r in rs if not r["correct"]), key=lambda r: -r["p"])
        sure_wrong = [r for r in wrong if r["p"] >= config.CONFIDENT_P]
        status = "wrong" if sure_wrong else "part" if wrong else "ok"
        fid = f"{file}::{name}"
        functions.append({
            "id": fid, "file": file, "name": name, "line_start": start, "line_end": end,
            "readiness": round(acc, 3), "status": status,
            "tested": name.split(".")[-1] in tests,
            "misconceptions": [{"believed": f"{r['text']} Bob answered: {fmt(r['answer'])}.",
                                "truth": f"The correct answer is: {fmt(r['truth'])}.",
                                "confidence": r["p"]} for r in wrong[:5]],
        })
        head_end = min(end, start + 4)
        if wrong:
            top = wrong[0]
            findings.append({
                "type": "review_risk",
                "severity": "high" if sure_wrong and top["p"] >= 0.9 else "medium" if sure_wrong else "low",
                "file": file, "line_start": start, "line_end": head_end, "function_id": fid,
                "title": f"Bob was sure but wrong about {name}" if sure_wrong else f"Bob is unsure about {name}",
                "detail": f"{top['text']} Bob answered {fmt(top['answer'])} ({top['p']:.0%} sure). "
                          f"Correct: {fmt(top['truth'])}.",
                "recommendation": f"Review any Bob change to {name} closely. The correct facts are in "
                                  f".bob/rules/readiness-context.md.",
                "bob_allowed": gate(acc), "estimated_coins": EST_COINS,
            })
        if not functions[-1]["tested"] and acc < READY:
            findings.append({
                "type": "test_gap", "severity": "medium" if sure_wrong else "low",
                "file": file, "line_start": start, "line_end": head_end, "function_id": fid,
                "title": f"No test mentions {name}",
                "detail": f"Bob's readiness here is {acc:.0%} and no file under tests/ mentions it (name search).",
                "recommendation": f"Add a test that pins down the behaviour of {name}.",
                "bob_allowed": gate(acc), "estimated_coins": EST_COINS,
            })
    order = {"high": 0, "medium": 1, "low": 2}
    findings.sort(key=lambda f: (order[f["severity"]], f["file"], f["line_start"]))
    for i, f in enumerate(findings, 1):
        f["id"] = f"F{i:03d}"
        f.update({k: f.pop(k) for k in list(f) if k != "id"})   # keep id first for readability

    index_path = config.EXAMS_DIR / "index.json"
    imports = {}
    if index_path.exists():
        idx = json.loads(index_path.read_text(encoding="utf-8"))
        mod_path = {m["module"]: m["path"] for m in idx["modules"]}
        imports = {m["path"]: sorted({mod_path[i] for i in m["internal_imports"] if i in mod_path})
                   for m in idx["modules"]}
    files = [{"path": m["path"], "readiness": round(m["accuracy"], 3), "status": file_status(m["accuracy"]),
              "imports": imports.get(m["path"], [])} for m in rep["modules"]]

    ready_files = {f["path"] for f in files if f["status"] == "ready"}
    starters = sorted((f for f in functions if f["status"] == "ok" and f["file"] in ready_files),
                      key=lambda f: f["line_end"] - f["line_start"])[:3]
    o = rep["overall"]
    return {
        "version": 1,
        "repo": {"name": dest.name, "commit": commit or "unknown",
                 "generated_at": (now or datetime.now(timezone.utc)).isoformat(timespec="seconds")},
        "summary": {"readiness": round(o["accuracy"], 3), "questions": o["n"],
                    "sure_but_wrong": o["cw_count"], "bobcoins_spent": round(bobcoins, 4)},
        "setup": {"install": ["pip install -e ."], "test": "pytest -q"},
        "notes_markdown_path": ".bob/rules/readiness-context.md",
        "files": files,
        "functions": functions,
        "findings": findings,
        "starter_tasks": [{"title": f"Small change in {f['name']}", "file": f["file"],
                           "why": "Bob answered every question about it correctly"} for f in starters],
        "_blindspot": {"simulated": simulated, "red_modules": rep["red_modules"]},
    }


def facts_markdown(rows, ctx, source) -> str:
    wrong = sorted((r for r in rows if not r["excluded"] and not r["correct"]), key=lambda r: -r["p"])
    lines = [f"# What Bob should know about {ctx['repo']['name']}", "",
             f"Generated by Blindspot from exam run `{source}` at {ctx['repo']['generated_at']}.",
             "Each item is a question Bob answered wrongly in a closed-book exam, with the correct answer",
             "checked against the code. Trust these over your own memory of this repository.", ""]
    if ctx["_blindspot"]["simulated"]:
        lines += ["**SIMULATED DATA: for building the plugin only. Do not rely on these facts.**", ""]
    red = ctx["_blindspot"]["red_modules"]
    if red:
        lines += ["## Modules where Bob is weakest", ""] + [f"- `{m}`" for m in red] + [""]
    lines += ["## Facts Bob got wrong", ""]
    for r in wrong[:MAX_FACTS]:
        lines.append(f"- `{r['path']}`: {r['text']} Correct answer: **{fmt(r['truth'])}** "
                     f"(Bob said {fmt(r['answer'])}, {r['p']:.0%} sure).")
    return "\n".join(lines) + "\n"


def agents_block(ctx) -> str:
    s = ctx["summary"]
    return "\n".join([
        BLOCK_START,
        "## Blindspot: where AI agents misread this code",
        "",
        f"Measured readiness {s['readiness']:.0%} over {s['questions']} checked questions; "
        f"{s['sure_but_wrong']} answers were confidently wrong.",
        "Before changing code in the files below, read `.bob/rules/readiness-context.md` for the correct facts.",
        "",
        *[f"- `{f['path']}`: readiness {f['readiness']:.0%} ({f['status'].replace('_', ' ')})"
          for f in sorted(ctx["files"], key=lambda f: f["readiness"])],
        BLOCK_END,
    ]) + "\n"


def merge_block(existing: str, block: str, start: str = BLOCK_START, end: str = BLOCK_END) -> str:
    """Replace the marked block in `existing`, or append it; text outside the markers is kept."""
    if start in existing and end in existing:
        head, rest = existing.split(start, 1)
        tail = rest.split(end, 1)[1].lstrip("\n")
        return head + block + tail
    sep = "" if not existing or existing.endswith("\n\n") else ("\n" if existing.endswith("\n") else "\n\n")
    return existing + sep + block


def pick_source(sim=False, run=None):
    base = config.RESULTS_DIR / "sim" if sim else config.RESULTS_DIR
    marked = base / "marked"
    if run:
        path = marked / f"{run}.jsonl"
        return (path, base) if path.exists() else (None, base)
    files = sorted(marked.glob("*.jsonl"), key=lambda p: p.stat().st_mtime) if marked.exists() else []
    return (files[-1] if files else None, base)


def bobcoins_spent() -> float:
    path = config.RESULTS_DIR / "costs.jsonl"
    if not path.exists():
        return 0.0
    total = 0.0
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            total += float(json.loads(line).get("cost") or 0)
    return total


EXCLUDE_START = "# blindspot:start (written by `python cli.py publish`; keeps the tree clean for the plugin)"
EXCLUDE_END = "# blindspot:end"
EXCLUDE_ENTRIES = (".bob/", "AGENTS.md")


def exclude_from_git(dest) -> Path | None:
    """Add the published files to <dest>/.git/info/exclude so `git status` stays clean.

    The plugin's "Send to Bob" flow refuses to start on a dirty tree, and the published files are
    not the developer's work, so they should not show up as untracked. Only a real clone (a .git
    folder) is touched; the exclude file is local metadata and is never pushed. Idempotent."""
    git_dir = dest / ".git"
    if not git_dir.is_dir():
        return None
    exclude = git_dir / "info" / "exclude"
    exclude.parent.mkdir(parents=True, exist_ok=True)
    old = exclude.read_text(encoding="utf-8") if exclude.exists() else ""
    block = "\n".join([EXCLUDE_START, *EXCLUDE_ENTRIES, EXCLUDE_END]) + "\n"
    exclude.write_text(merge_block(old, block, EXCLUDE_START, EXCLUDE_END), encoding="utf-8", newline="\n")
    return exclude


def publish(rows, source, results_base, dest, commit, simulated) -> list:
    ctx = build_context(rows, dest, commit, 0.0 if simulated else bobcoins_spent(), simulated)
    written = []
    ctx_path = dest / ".bob" / "context" / "readiness.json"
    ctx_path.parent.mkdir(parents=True, exist_ok=True)
    ctx_path.write_text(json.dumps(ctx, indent=2), encoding="utf-8", newline="\n")
    written.append(ctx_path)
    md = dest / ".bob" / "rules" / "readiness-context.md"
    md.parent.mkdir(parents=True, exist_ok=True)
    md.write_text(facts_markdown(rows, ctx, source), encoding="utf-8", newline="\n")
    written.append(md)
    agents = dest / "AGENTS.md"
    old = agents.read_text(encoding="utf-8") if agents.exists() else ""
    agents.write_text(merge_block(old, agents_block(ctx)), encoding="utf-8", newline="\n")
    written.append(agents)
    rep_dir = dest / ".bob" / "blindspot"
    rep_dir.mkdir(parents=True, exist_ok=True)
    for f in list(results_base.glob("report_*.json")) + [results_base / "history.jsonl"]:
        if f.exists():
            shutil.copyfile(f, rep_dir / f.name)
            written.append(rep_dir / f.name)
    exclude_from_git(dest)
    return written


def main(sim=False, run=None, dest=None) -> int:
    dest = Path(dest) if dest else config.TARGET_DIR
    if not dest.exists():
        print(f"Destination {dest} not found. Run `python cli.py target` first, or pass --dest.")
        return 1
    src, base = pick_source(sim, run)
    if src is None:
        print("No marked answers found. Run an exam first, or use --sim to publish simulated data.")
        return 1
    rows = [json.loads(l) for l in src.read_text(encoding="utf-8").splitlines() if l.strip()]
    simulated = sim or any(r.get("simulated") for r in rows)
    commit = report.target_commit()
    written = publish(rows, src.stem, base, dest, commit, simulated)
    print(f"Published {'SIMULATED ' if simulated else ''}context from {src.stem} into {dest}:")
    for p in written:
        print(f"  {p.relative_to(dest).as_posix()}")
    if (dest / ".git").is_dir():
        print("These files are listed in .git/info/exclude there, so the working tree stays clean for the plugin.")
    print("Exams are not affected: they run in fresh copies with agent files removed.")
    return 0
