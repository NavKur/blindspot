"""Steps 19 to 21: TRAIN failure summary, Cartographer calls, and the C2 context.

1. Read TRAIN results under C1 (results/marked/train_C1_r1.jsonl). Never TEST.
2. Pick up to MAX_CARTO_MODULES modules where Bob made mistakes on TRAIN, worst first.
3. For each, Bob in the `blindspot-cartographer` mode may READ that module's source (no edit, no
   commands) and writes compact notes aimed at the mistakes Bob made on TRAIN.
   If a call fails, notes are generated from the scanner's index instead, and this is logged.
4. contexts/C2/AGENTS.md = contexts/C1/AGENTS.md + a "Blindspot notes" section.
Everything is saved under results/cartographer/ for the audit trail.
"""
import json
import shutil

from blindspot import config, mark, report, runner, target

MODE_SLUG = "blindspot-cartographer"
MODES_YAML = f"""customModes:
  - slug: {MODE_SLUG}
    name: Blindspot Cartographer
    roleDefinition: >-
      You write short, factual notes about one Python module for another AI agent that will have
      to answer questions about it without reading the code. You read the source; you never edit
      files or run commands.
    groups:
      - read
"""
FLAGS = ["--disable-tool-groups", "edit,command,browser,mcp", "--disable-mcp", "--disable-subagents",
         "--mode", MODE_SLUG]
OUT_DIR = config.RESULTS_DIR / "cartographer"
C2_FILE = runner.CONTEXTS_DIR / "C2" / "AGENTS.md"
SECTION_TITLE = "## Blindspot notes (facts checked against the code)"
MAX_MISTAKES = 12


def pick_modules(rep) -> list:
    """Modules where Bob made at least one mistake on TRAIN, worst first, at most MAX_CARTO_MODULES.

    Deviation (logged in PREREGISTRATION.md): the red rule was too blunt at TRAIN sample sizes
    (a module with 3/3 correct was red only because n was tiny), so targets are chosen by actual
    mistakes, ranked with report.severity (confidently-wrong rate, then Wilson lower bound).
    """
    mods = sorted((m for m in rep["modules"] if m["n"] - m["k"] > 0), key=report.severity)
    return [(m["module"], m["path"]) for m in mods[: config.MAX_CARTO_MODULES]]


def failure_summary(rows, module) -> list:
    """TRAIN questions in this module Bob got wrong, most confident first (text, Bob's answer, p)."""
    wrong = [r for r in rows if r["module"] == module and not r["excluded"] and not r["correct"]]
    wrong.sort(key=lambda r: -(r["p"] or 0))
    return [{"question": r["text"], "bob_answered": r["answer"], "confidence": r["p"]} for r in wrong[:MAX_MISTAKES]]


def build_prompt(module, path, mistakes) -> str:
    lines = [
        f"Read the file `{path}` (module `{module}`) in this workspace. Then write compact Markdown notes,",
        "at most 40 lines, for an AI agent that must answer detailed questions about this module WITHOUT",
        "reading the code. Cover exactly:",
        "- every class with its bases and the names of the methods it defines itself",
        "- every function or method's parameters with their default values",
        "- which exceptions each function or method raises in its own code (say 'none' when it raises none)",
        "- which names each function or method calls, when that is surprising",
        "- names that do NOT exist but sound plausible, if you can think of any",
        "Only write facts you verified in the file. No introduction, no code blocks, only the notes.",
    ]
    if mistakes:
        lines += ["", "An agent recently got these questions about this module wrong. Make sure your notes "
                  "settle them, without copying the questions:"]
        lines += [f"- {m['question']} (it answered {m['bob_answered']}, {m['confidence']:.0%} sure)" for m in mistakes]
    return "\n".join(lines)


def index_notes(module) -> str:
    """Fallback notes straight from the scanner's index (used only if the Bob call fails)."""
    idx = json.loads((config.EXAMS_DIR / "index.json").read_text(encoding="utf-8"))
    m = next(x for x in idx["modules"] if x["module"] == module)
    out = []
    for c in m["classes"]:
        names = ", ".join(meth["qualname"].split(".", 1)[1] for meth in c["methods"]) or "none"
        out.append(f"- class `{c['qualname']}` (bases: {', '.join(c['bases']) or 'none'}) defines: {names}")
    for f in m["functions"] + [meth for c in m["classes"] for meth in c["methods"]]:
        params = ", ".join(f"{p}={f['defaults'][p]}" if p in f["defaults"] else p for p in f["params"])
        raises = ", ".join(f["raises"]) or "none"
        out.append(f"- `{f['qualname']}({params})` raises: {raises}")
    return "\n".join(out)


def workspace():
    ws = config.ROOT / ".cache" / "carto_ws"
    if ws.exists():
        shutil.rmtree(ws)
    shutil.copytree(config.TARGET_DIR, ws, ignore=shutil.ignore_patterns(".git"))
    target.remove_agent_context(ws)
    (ws / ".bob").mkdir()
    (ws / ".bob" / "custom_modes.yaml").write_text(MODES_YAML, encoding="utf-8")
    return ws


def assemble(c1_text, sections) -> str:
    body = [c1_text.rstrip(), "", SECTION_TITLE, ""]
    for module, path, notes, source in sections:
        body += [f"### `{path}` ({module})", "", notes.strip(), ""]
    return "\n".join(body).rstrip() + "\n"


def main(dry_run=False, allow_ide=False) -> int:
    c1 = runner.context_file("C1")
    src = mark.MARKED_DIR / "train_C1_r1.jsonl"
    for p in (c1, src):
        if not p.exists():
            print(f"{p.relative_to(config.ROOT)} is missing. Run step 18 (C1 context) and the TRAIN exam under C1 first.")
            return 1
    rows = mark.read_jsonl(src)
    if any(r.get("simulated") for r in rows):
        print("Refusing: the TRAIN results are simulated.")
        return 1
    rep = report.build_report(rows, "train", "C1", 1)
    chosen = pick_modules(rep)
    print("Cartographer targets (worst first): " + ", ".join(m for m, _ in chosen))
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    if dry_run:
        for module, path in chosen:
            print(f"\n--- prompt for {module} ---\n" + build_prompt(module, path, failure_summary(rows, module)))
        return 0
    problem = runner.preflight("train", allow_ide)
    if problem:
        print(problem)
        return 2
    ws = workspace()
    sections, log, cost = [], [], 0.0
    for module, path in chosen:
        prompt = build_prompt(module, path, failure_summary(rows, module))
        r = runner.cached_call(("carto", module, prompt), prompt, ws, FLAGS, max_turns=12, max_cost=1.0)
        cost += 0.0 if r["cached"] else float(r["cost"] or 0)
        notes = (r.get("reply") or "").strip()
        source = "bob"
        if not (r["parsed"] and r["status"] == "success" and len(notes) > 40):
            notes, source = index_notes(module), "index_fallback"
        sections.append((module, path, notes, source))
        (OUT_DIR / f"{module}.md").write_text(notes + "\n", encoding="utf-8", newline="\n")
        log.append({"module": module, "source": source, "cost": r["cost"], "cached": r["cached"],
                    "tool_calls": r["tool_calls"], "seconds": r["seconds"], "prompt": prompt})
        print(f"  {module}: {source}, {len(notes.splitlines())} lines, cost {r['cost']}, tools {r['tool_calls']}")
    C2_FILE.parent.mkdir(parents=True, exist_ok=True)
    C2_FILE.write_text(assemble(c1.read_text(encoding="utf-8"), sections), encoding="utf-8", newline="\n")
    (OUT_DIR / "log.json").write_text(json.dumps({"targets": [m for m, _ in chosen], "calls": log},
                                                 indent=2), encoding="utf-8", newline="\n")
    print(f"Wrote {C2_FILE.relative_to(config.ROOT)} (new cost {round(cost, 4)} Bobcoins). Read it before freezing.")
    return 0
