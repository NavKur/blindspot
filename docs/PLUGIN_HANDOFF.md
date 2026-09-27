# Plugin handoff: what the Bob IDE plugin reads and what it needs from the engine

For the engine side (Python). Written by the plugin side after merging main on 27 September.
The plugin lives in `plugin/`. It never calls Bob or the statistics code on its own: it reads
files, and it runs exactly one CLI command (`publish`) when a person clicks a button.

**Status, 27 September (later the same day):** everything asked for below exists. `python cli.py
publish` (`blindspot/publish.py`) writes `.bob/context/readiness.json`, the notes, the `AGENTS.md`
block and report copies under `.bob/blindspot/`; the plugin reads all of them from either the
repository root or `target/tinydb`. See `docs/HOW_IT_WORKS.md` sections 6 and 7 for the current
picture. The rest of this file is kept as the record of the handoff.

## 1. What already works today

Open the repository root in Bob IDE with the plugin installed:

- Explorer colouring from `results/report_latest.json` following REPORT_SCHEMA.md: red badge
  when `red` is true, colour by `heat` otherwise, `?` when `low_n`, neutral when not examined,
  folders from `directories`. Paths are mapped onto `target/tinydb` (from `target.lock.json`).
- Exam tab: simulated banner, run, counts, overall metrics, reliability bins, change over time
  from `history.jsonl` (one line per condition), modules worst first with per-file sparklines,
  `worst_entities` (click opens the file), Compare runs across `report_<run>.json` files,
  Publish button, Reload button. Status bar item "Blindspot 89% C2".
- The plugin watches `results/report_latest.json` and `history.jsonl` and recolours on change.
  While `results/report_latest.json` does not exist it falls back to `results/sim/` and says so.

## 2. What the plugin needs from the engine

### 2a. `python cli.py publish` (step 23)

The Publish button runs `bobReadiness.publishCommand` (default `python cli.py publish`) in the
repository root, using `.venv/bin/python` automatically when present, and shows stdout and
stderr in the Exam tab and the Output channel. Requirements:

- Exit code 0 on success, non zero on failure, plain text output, no interactive prompts.
- Refuse (non zero, one line explaining why) when an exam is running, so the plugin can show it.
- Print what was written, one path per line, so the person can see which files Bob will read.

### 2b. The readiness context: `.bob/context/readiness.json` (Cartographer output)

The second half of the plugin (line highlighting, hover cards, CodeLens, Problems panel, the
Review, Testing, Release, Modernize and Onboarding tabs, and the approve, run Bob on a branch,
test, keep or discard flow) reads a per-function file. Its contract is `plugin/BUILD_PLAN.md`
section 2 and the zod schema in `plugin/src/contract.ts`. Field names are fixed. In short:

```jsonc
{
  "version": 1,
  "repo": { "name": "tinydb", "commit": "1e39ad3", "generated_at": "2026-09-27T12:00:00Z" },
  "summary": { "readiness": 0.73, "questions": 160, "sure_but_wrong": 7, "bobcoins_spent": 14.2 },
  "setup": { "install": ["pip install -e ."], "test": "pytest -q" },
  "notes_markdown_path": ".bob/rules/readiness-context.md",
  "files": [ { "path": "tinydb/table.py", "readiness": 0.70, "status": "review", "imports": [] } ],
  "functions": [ { "id": "tinydb/table.py::Table.update", "file": "tinydb/table.py", "name": "Table.update",
                   "line_start": 422, "line_end": 524, "readiness": 0.25, "status": "wrong", "tested": true,
                   "misconceptions": [ { "believed": "...", "truth": "...", "confidence": 0.92 } ] } ],
  "findings": [ { "id": "F001", "type": "review_risk", "severity": "high", "file": "tinydb/table.py",
                  "line_start": 422, "line_end": 428, "function_id": "tinydb/table.py::Table.update",
                  "title": "...", "detail": "...", "recommendation": "...", "bob_allowed": "with_notes",
                  "estimated_coins": 0.9 } ],
  "starter_tasks": [ { "title": "...", "file": "tinydb/storages.py", "why": "..." } ]
}
```

Enums: `files[].status` ready | review | not_ready; `functions[].status` ok | part | wrong;
`findings[].type` review_risk | test_gap | modernize | release_risk; `severity` high | medium | low;
`bob_allowed` yes | with_notes | no. Line numbers are 1 based and inclusive. Paths are relative
to the examined repository with forward slashes, the same convention as the report.

Mapping from the exam data, as a suggestion:

| Readiness field | From the exam |
|---|---|
| `functions[]` | one per entity that received questions (`marked/*.jsonl` `entity` and `path`); `line_start`/`line_end` from the scanner index |
| `functions[].readiness` | Wilson lower bound of that entity's accuracy (`1 - heat` in your terms) |
| `functions[].status` | `wrong` when it has a confidently wrong answer, `part` when accuracy is under 1 without one, else `ok` |
| `functions[].misconceptions[]` | each confidently wrong answer: what Bob answered (`believed`), the true answer (`truth`), `p` as `confidence` |
| `findings[]` type `review_risk` | one per `wrong` function; `bob_allowed` from the gate: readiness 0.85+ yes, 0.65 to 0.84 with_notes, below no |
| `findings[]` type `test_gap` | functions without tests (coverage.py), ranked by risk |
| `findings[]` type `modernize` | ast based patterns, optional |
| `summary.readiness` | overall accuracy or its lower bound; `sure_but_wrong` = `cw_count`; `bobcoins_spent` = sum of `session_costs` |
| `notes_markdown_path` | the Cartographer's context file that Bob loads (rules folder) |
| `starter_tasks[]` | small functions in high readiness files, optional |

Write it to `<target repo>/.bob/context/readiness.json` and the notes to the path named in
`notes_markdown_path`. The plugin validates the file and shows the first three problems if it is
wrong, keeping the last valid version.

### 2c. Two conventions to keep

- Report paths and readiness paths must both be relative to the examined repository root.
- Mark anything fake with `"simulated": true` (report) or a `repo.commit` of `SAMPLE` (readiness)
  so the plugin can label it.

## 3. How to test against the plugin without Bob IDE

```
cd plugin
npm install
npm run build && npm test && npm run lint
npm run smoke        # drives the whole plugin with fake Bob and with ../results/sim
```

`npm test` includes `test/reportContract.test.ts`, which validates `plugin/fixtures/report.sample.json`
(a copy of `results/sim/report_latest.json`). If you change the report schema, update
`plugin/src/report/reportContract.ts` and that fixture together.

## 4. A prompt you can paste into your AI assistant

> Read docs/REPORT_SCHEMA.md and docs/PLUGIN_HANDOFF.md. Implement `python cli.py publish`
> (step 23): copy the final Cartographer context into the files each coding agent reads
> (AGENTS.md, .bob/rules/…, CLAUDE.md as applicable) inside a marked block that never overwrites
> user content, exit non zero with one line of explanation when an exam is running, print one
> line per file written, exit 0 otherwise. Add tests. Then write the Cartographer output in the
> readiness.json format from section 2b of PLUGIN_HANDOFF.md using the mapping table, validate
> it against plugin/src/contract.ts (`cd plugin && npm test`), and write it to
> target/tinydb/.bob/context/readiness.json. Never call Bob while doing this. Never paste
> credentials into prompts; BOB_API_KEY comes from .env.
