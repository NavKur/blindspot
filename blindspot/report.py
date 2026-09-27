"""Step 11: per-module analysis, the red module rule, and the report file the dashboard reads.

Input : marked answers, one JSON object per line, in results/marked/<set>_<condition>_r<repeat>.jsonl
        (written by step 16). Each has at least: id, module, path, entity, family, correct (0/1), p.
        Excluded answers (tool use, unparseable) carry "excluded": true and are counted, never scored.
Output: results/report_<set>_<condition>_r<repeat>.json   one run, full detail (schema: docs/REPORT_SCHEMA.md)
        results/report_latest.json                         copy of the newest report, for the plugin to watch
        results/history.jsonl                              one compact line per report, for change over time

The report is the only contract with the dashboard / Bob IDE plugin. Paths in it are relative to the
target repo root (e.g. "tinydb/table.py"), so the plugin can map them straight onto the file tree.
"""
import json
import shutil
from collections import defaultdict
from datetime import datetime, timezone
from pathlib import PurePosixPath

from blindspot import config, stats

SCHEMA_VERSION = 1
MARKED_DIR = config.RESULTS_DIR / "marked"
HISTORY = config.RESULTS_DIR / "history.jsonl"
LATEST = config.RESULTS_DIR / "report_latest.json"
LOW_N = 10          # display-only flag: fewer answers than this means the interval is very wide
TOP_ENTITIES = 10   # how many worst functions/classes to list for drill-down


def run_name(qset, condition, repeat) -> str:
    return f"{qset}_{condition}_r{repeat}"


def load_marked(path) -> list:
    with open(path, encoding="utf-8") as f:
        return [json.loads(line) for line in f if line.strip()]


def group_metrics(rows) -> dict:
    """Metrics for one group of scored answers, without the per-bin reliability table."""
    p = [r["p"] for r in rows]
    correct = [int(r["correct"]) for r in rows]
    s = stats.summarise(p, correct)
    s.pop("reliability")
    s["low_n"] = s["n"] < LOW_N
    # heat: 0 = fine, 1 = worst. One minus the Wilson lower bound, so small uncertain groups
    # do not look safe just because they got lucky. The plugin colours files by this.
    s["heat"] = 1 - s["ci_low"]
    return s


def red_rule(m) -> list:
    """PREREGISTRATION.md section 5. Returns the reasons a module is red (empty list = not red)."""
    reasons = []
    if m["ci_low"] < config.RED_ACC_LOWER:
        reasons.append(f"accuracy lower bound {m['ci_low']:.2f} < {config.RED_ACC_LOWER}")
    if m["cw_rate"] > config.RED_CW_RATE:
        reasons.append(f"confidently-wrong rate {m['cw_rate']:.2f} > {config.RED_CW_RATE}")
    return reasons


def by_key(rows, key) -> dict:
    groups = defaultdict(list)
    for r in rows:
        groups[r[key]].append(r)
    return groups


def directory_nodes(rows) -> list:
    """Aggregate every folder from its answers (not by averaging child scores), for the tree heatmap."""
    groups = defaultdict(list)
    for r in rows:
        for parent in PurePosixPath(r["path"]).parents:
            if str(parent) != ".":
                groups[str(parent)].append(r)
    return [dict(path=d, **group_metrics(rs)) for d, rs in sorted(groups.items())]


def build_report(marked, qset, condition, repeat, commit=None, now=None) -> dict:
    scored = [r for r in marked if not r.get("excluded")]
    if not scored:
        raise ValueError("no scored answers: nothing to report")

    modules = []
    for mod, rs in sorted(by_key(scored, "module").items()):
        m = dict(module=mod, path=rs[0]["path"], **group_metrics(rs))
        m["red_reasons"] = red_rule(m)
        m["red"] = bool(m["red_reasons"])
        m["by_family"] = {fam: group_metrics(fr)["accuracy"] for fam, fr in sorted(by_key(rs, "family").items())}
        modules.append(m)

    entities = []
    for ent, rs in by_key(scored, "entity").items():
        e = group_metrics(rs)
        entities.append(dict(entity=ent, module=rs[0]["module"], path=rs[0]["path"],
                             n=e["n"], accuracy=e["accuracy"], cw_count=e["cw_count"]))
    entities.sort(key=lambda e: (-e["cw_count"], e["accuracy"], e["entity"]))

    overall = stats.summarise([r["p"] for r in scored], [int(r["correct"]) for r in scored])
    return {
        "schema_version": SCHEMA_VERSION,
        "generated_at": (now or datetime.now(timezone.utc)).isoformat(timespec="seconds"),
        "target_commit": commit,
        "run": {"set": qset, "condition": condition, "repeat": repeat, "name": run_name(qset, condition, repeat)},
        "counts": {"answers": len(marked), "scored": len(scored), "excluded": len(marked) - len(scored)},
        "thresholds": {"confident_p": config.CONFIDENT_P, "red_acc_lower": config.RED_ACC_LOWER,
                       "red_cw_rate": config.RED_CW_RATE},
        "overall": overall,
        "modules": modules,
        "directories": directory_nodes(scored),
        "red_modules": [m["module"] for m in modules if m["red"]],
        "worst_entities": entities[:TOP_ENTITIES],
    }


def history_line(report) -> dict:
    """Compact snapshot for the change-over-time chart."""
    o = report["overall"]
    return {
        "generated_at": report["generated_at"],
        "target_commit": report["target_commit"],
        "run": report["run"]["name"],
        "set": report["run"]["set"], "condition": report["run"]["condition"], "repeat": report["run"]["repeat"],
        "accuracy": o["accuracy"], "brier": o["brier"], "cw_rate": o["cw_rate"], "n": o["n"],
        "modules": {m["path"]: {"accuracy": m["accuracy"], "cw_rate": m["cw_rate"], "heat": m["heat"], "red": m["red"]}
                    for m in report["modules"]},
    }


def write_report(report, results_dir=None) -> dict:
    out_dir = results_dir or config.RESULTS_DIR
    out_dir.mkdir(parents=True, exist_ok=True)
    path = out_dir / f"report_{report['run']['name']}.json"
    path.write_text(json.dumps(report, indent=2), encoding="utf-8", newline="\n")
    latest = out_dir / LATEST.name
    shutil.copyfile(path, latest)
    with open(out_dir / HISTORY.name, "a", encoding="utf-8", newline="\n") as f:
        f.write(json.dumps(history_line(report), sort_keys=True) + "\n")
    return {"report": path, "latest": latest, "history": out_dir / HISTORY.name}


def target_commit():
    try:
        return json.loads(config.TARGET_LOCK.read_text(encoding="utf-8"))["commit"]
    except (OSError, KeyError, ValueError):
        return None


def main(qset, condition, repeat=1) -> int:
    src = MARKED_DIR / f"{run_name(qset, condition, repeat)}.jsonl"
    if not src.exists():
        print(f"No marked answers at {src}. Run the exam and marking first (steps 15 to 16).")
        return 1
    report = build_report(load_marked(src), qset, condition, repeat, commit=target_commit())
    paths = write_report(report)
    o = report["overall"]
    print(f"{report['run']['name']}: accuracy {o['accuracy']:.1%} "
          f"[{o['ci_low']:.1%}, {o['ci_high']:.1%}], Brier {o['brier']:.3f}, "
          f"confidently wrong {o['cw_rate']:.1%}, excluded {report['counts']['excluded']}")
    for m in report["modules"]:
        flag = "RED " if m["red"] else "    "
        print(f"  {flag}{m['module']:<24} n={m['n']:<3} acc {m['accuracy']:.0%} "
              f"(low {m['ci_low']:.2f})  cw {m['cw_rate']:.0%}")
    print(f"Wrote {paths['report'].name}, {paths['latest'].name}, appended {paths['history'].name}")
    return 0
