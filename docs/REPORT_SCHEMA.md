# Blindspot report contract (schema_version 1)

This is the only interface between the Blindspot engine (Python) and the dashboard / Bob IDE plugin.
The plugin never calls Bob or the statistics code. It reads these files and, for publishing, runs one CLI command.

All paths are relative to the target repo root and use forward slashes (e.g. `tinydb/table.py`),
so they map directly onto the workspace file tree.

## Files

| File | What it is | Plugin use |
|---|---|---|
| `results/report_latest.json` | Newest report, full detail | Watch it; recolour the tree when it changes |
| `results/report_<set>_<condition>_r<repeat>.json` | One report per run | Compare runs (e.g. C1 vs C2) |
| `results/history.jsonl` | One compact line per report, appended | Change-over-time chart |
| `results/sim/...` | The same three files, SIMULATED (step 12) | Build and test the plugin before real runs exist |

## `report_latest.json`

```jsonc
{
  "schema_version": 1,
  "simulated": false,                             // true = fake data from `cli.py simulate`; show a clear banner
  "generated_at": "2026-09-27T12:00:00+00:00",   // UTC
  "target_commit": "1e39ad3a...",                 // commit of the repo that was examined
  "run": {"set": "train", "condition": "C1", "repeat": 1, "name": "train_C1_r1"},
  "counts": {"answers": 120, "scored": 118, "excluded": 2},
  "thresholds": {"confident_p": 0.8, "red_acc_lower": 0.6, "red_cw_rate": 0.2},
  "overall": { /* metrics (below) plus "reliability": [5 bins] */ },
  "modules": [
    { "module": "tinydb.table", "path": "tinydb/table.py",
      /* metrics */,
      "red": true, "red_reasons": ["confidently-wrong rate 0.33 > 0.2"],
      "by_family": {"calls": 0.71, "exists": 0.9} }
  ],
  "directories": [ { "path": "tinydb", /* metrics */ } ],
  "red_modules": ["tinydb.queries"],   // worst first (highest confidently-wrong rate, then lowest ci_low)
  "worst_entities": [ {"entity": "Query.test", "module": "tinydb.queries", "path": "tinydb/queries.py",
                       "n": 6, "accuracy": 0.33, "cw_count": 3} ]
}
```

**metrics** (every module and directory):
`k, n, accuracy, ci_low, ci_high` (Wilson 95%), `brier`, `ece`, `cw_rate`, `cw_count`, `mean_p`,
`overconfidence` (mean_p minus accuracy, positive = overconfident), `low_n` (n < 10, interval very wide),
`heat` (0 fine to 1 worst, equal to 1 minus ci_low).

**Colouring rule for the tree:** `red == true` gives a red badge. Otherwise colour by `heat`.
Show a "few answers" marker when `low_n` is true. Files with no entry were not examined, so show them as neutral, not green.

## `history.jsonl` (one JSON object per line)

```jsonc
{"generated_at": "...", "simulated": false, "target_commit": "...", "run": "train_C1_r1", "set": "train", "condition": "C1", "repeat": 1,
 "accuracy": 0.74, "brier": 0.18, "cw_rate": 0.12, "n": 118,
 "modules": {"tinydb/table.py": {"accuracy": 0.7, "cw_rate": 0.2, "heat": 0.45, "red": true}}}
```

Plot `accuracy` / `cw_rate` over `generated_at`, one line per `condition`. A per-file sparkline uses `modules[path]`.

## Publishing context to other agents (step 23)

`python cli.py publish` copies the final Cartographer context into the files each coding agent reads,
inside a marked block so user content is never overwritten. The plugin's "Publish" button runs that command
and shows its output. Publishing is never done while an exam is running, because it would change the conditions.
