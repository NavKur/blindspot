"""Step 23: the pre-registered analysis on TEST (PREREGISTRATION.md section 5).

Primary   : accuracy C2 vs C1, exact McNemar, repeat 1, alpha = ALPHA.
Secondary : (Holm across the three that can be computed)
            1. accuracy C1 vs C0, McNemar            (only if C0 was run)
            2. Brier C2 vs C1, paired bootstrap
            3. confidently-wrong C2 vs C1, McNemar on the indicator
Sensitivity: cluster bootstrap by entity (primary) and module (secondary) for the C2 - C1 accuracy difference.
Pairs      : a question counts only if it was scored (not excluded) in both runs; the drop count is reported.
Output     : results/final_analysis.json
"""
import json

import numpy as np

from blindspot import config, mark, stats


def load(condition, repeat=1):
    path = mark.MARKED_DIR / f"test_{condition}_r{repeat}.jsonl"
    return {r["id"]: r for r in mark.read_jsonl(path)} if path.exists() else None


def paired(a, b):
    ids = sorted(i for i in a if i in b and not a[i]["excluded"] and not b[i]["excluded"])
    return ids, [a[i] for i in ids], [b[i] for i in ids]


def cw(rows):
    return [int(not r["correct"] and r["p"] >= config.CONFIDENT_P) for r in rows]


def brier_each(rows):
    return [(r["p"] - r["correct"]) ** 2 for r in rows]


def analyse(runs) -> dict:
    c1, c2, c0 = runs.get("C1"), runs.get("C2"), runs.get("C0")
    if not (c1 and c2):
        raise ValueError("need test_C1_r1 and test_C2_r1")
    ids, r1, r2 = paired(c1, c2)
    acc1 = [r["correct"] for r in r1]
    acc2 = [r["correct"] for r in r2]
    primary = stats.mcnemar_exact(acc1, acc2)       # only_b = right under C2 only
    primary["significant"] = primary["p_value"] < config.ALPHA
    primary["direction"] = "C2 better" if primary["only_b"] > primary["only_a"] else \
        "C1 better" if primary["only_a"] > primary["only_b"] else "no difference"

    secondary = {
        "brier_C2_vs_C1": stats.paired_bootstrap_diff(brier_each(r1), brier_each(r2), n_boot=config.N_BOOT, seed=config.SEED),
        "cw_C2_vs_C1": stats.mcnemar_exact([1 - x for x in cw(r1)], [1 - x for x in cw(r2)]),
    }
    if c0:
        _, r0, r1b = paired(c0, c1)
        secondary["acc_C1_vs_C0"] = stats.mcnemar_exact([r["correct"] for r in r0], [r["correct"] for r in r1b])
    adjusted = stats.holm({k: v["p_value"] for k, v in secondary.items()})
    for k, v in secondary.items():
        v["p_holm"] = adjusted[k]

    diff = np.array(acc2) - np.array(acc1)
    sensitivity = {
        "entity": stats.cluster_bootstrap_mean(diff, [r["entity"] for r in r1], n_boot=config.N_BOOT, seed=config.SEED),
        "module": stats.cluster_bootstrap_mean(diff, [r["module"] for r in r1], n_boot=config.N_BOOT, seed=config.SEED),
    }
    summary = {c: stats.summarise([r["p"] for r in rows.values() if not r["excluded"]],
                                  [r["correct"] for r in rows.values() if not r["excluded"]])
               for c, rows in runs.items() if rows}
    for s in summary.values():
        s.pop("reliability", None)
    return {"n_paired": len(ids), "dropped_unpaired": len(set(c1) | set(c2)) - len(ids),
            "primary": primary, "secondary": secondary, "sensitivity": sensitivity, "by_condition": summary,
            "alpha": config.ALPHA}


def main() -> int:
    runs = {c: load(c) for c in config.CONDITIONS}
    try:
        res = analyse(runs)
    except ValueError as e:
        print(e)
        return 1
    out = config.RESULTS_DIR / "final_analysis.json"
    out.write_text(json.dumps(res, indent=2), encoding="utf-8", newline="\n")
    p = res["primary"]
    print(f"TEST, {res['n_paired']} paired questions ({res['dropped_unpaired']} dropped as unpaired).")
    for c, s in res["by_condition"].items():
        print(f"  {c}: accuracy {s['accuracy']:.1%} [{s['ci_low']:.1%}, {s['ci_high']:.1%}], "
              f"Brier {s['brier']:.3f}, confidently wrong {s['cw_rate']:.1%}")
    print(f"PRIMARY C2 vs C1: right only under C1 = {p['only_a']}, only under C2 = {p['only_b']}, "
          f"exact McNemar p = {p['p_value']:.4f} -> {'SIGNIFICANT' if p['significant'] else 'not significant'} "
          f"({p['direction']})")
    for k, v in res["secondary"].items():
        print(f"  secondary {k}: p = {v['p_value']:.4f}, Holm p = {v['p_holm']:.4f}")
    e = res["sensitivity"]["entity"]
    print(f"  cluster bootstrap (entity) C2-C1 accuracy: {e['mean']:+.3f} [{e['ci_low']:+.3f}, {e['ci_high']:+.3f}], "
          f"design effect {e['design_effect']:.2f}")
    print(f"Saved {out.relative_to(config.ROOT)}")
    return 0
