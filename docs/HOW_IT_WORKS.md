# How Blindspot works

This document is for anyone (a person or an AI coding agent) working on this repository, especially on the
Bob IDE plugin in `plugin/`. Read it before changing anything. Section 9 lists the rules that must not be broken.

Status: 27 September 2026, after the final TEST runs. The experiment is finished and frozen (git tag `freeze`).


## 1. What Blindspot is, in one paragraph

Blindspot measures how well an AI coding agent (IBM Bob) understands a specific codebase. It generates an exam about
the code directly from the code's syntax tree, so every answer is checked automatically. Bob sits the exam closed book,
giving an answer and a confidence for each question. Blindspot marks the answers, finds the files and functions where Bob
is wrong (especially confidently wrong), shows them in Bob IDE through the plugin, writes targeted context to fix them,
and tests whether that context helped with a pre-registered experiment on a sealed test set.

The repository has two halves that only talk through files:

| Half | Language | Folder | Owner | What it does |
|---|---|---|---|---|
| Engine | Python | `blindspot/`, `cli.py`, `tests/` | Nacky | Generates exams, runs Bob, marks, does statistics, writes result files |
| Plugin ("Bob Readiness") | TypeScript, VS Code extension | `plugin/` | Aziz | Reads those files and shows them inside Bob IDE; lets a developer send findings to Bob |

The plugin never imports Python and never runs the statistics. The only command it runs from the engine is
`python cli.py publish` (the Publish button).


## 2. Repository layout

```
blindspot/            Python engine (one module per job, listed in section 4)
cli.py                command line entry point: python cli.py <command>
tests/                pytest suite for the engine (about 97 tests)
PREREGISTRATION.md    the experiment plan, committed before any results; Deviations section at the bottom
docs/REPORT_SCHEMA.md contract for the exam report files (plugin reads these)
docs/HOW_IT_WORKS.md  this file
exams/                generated questions and answer keys (hidden from Bob by .bobignore)
  index.json            scanner output: modules, classes, functions, params, defaults, raises, calls
  candidates.jsonl      every generated question (2,268 for tinydb)
  train.jsonl           120 TRAIN questions
  test.jsonl            200 TEST questions, sealed by SHA-256 (never edit)
  split_report.json     counts and the TEST hash
  pilot.jsonl           30 pilot questions (never drawn from TEST)
contexts/
  C1/AGENTS.md          context for condition C1: written by Bob's own /init on tinydb
  C2/AGENTS.md          context for condition C2: C1 plus the Cartographer's notes
results/              everything produced by runs (committed, hidden from Bob by .bobignore)
  answers/<run>.jsonl   Bob's raw parsed answers per question
  raw/<run>/*.json      Bob's full reply and stats for every call (audit trail)
  marked/<run>.jsonl    answers joined with questions and marked correct or wrong
  report_<run>.json     per-run report (see docs/REPORT_SCHEMA.md)
  report_latest.json    copy of the newest report
  history.jsonl         one summary line per report, for change over time
  costs.jsonl           one line per Bob call with its Bobcoin cost
  cartographer/         the Cartographer's notes per module and a log.json
  final_analysis.json   the pre-registered analysis of TEST
  sim/                  SIMULATED versions of the report files (fake data, labelled "simulated": true)
target/tinydb/        the codebase under test: tinydb v4.9.0, pinned commit (ignored by git, fetched by a command)
target.lock.json      records exactly which commit was examined
plugin/               the VS Code extension (see plugin/README.md, plugin/BUILD_PLAN.md)
.cache/               exam workspaces and cached Bob replies (ignored by git)
.bob/                 Bob configuration for this repo
.bobignore            hides exams/, results/, .cache/ and secrets from Bob (plugin/ should be listed too)
```

A run is named `<set>_<condition>_r<repeat>`, for example `test_C2_r1`.


## 3. The target codebase

- Repository: https://github.com/msiemens/tinydb, tag `v4.9.0`, commit `1e39ad3a2d9eca57efd9019fd089b5a04676da95` (MIT licence).
- Only the `tinydb/` package is examined. `tinydb/mypy_plugin.py` and tiny modules are excluded.
- Fetched into `target/tinydb` by `python cli.py target`. `python cli.py target --force` deletes and re-clones it clean.
  `python cli.py target --check` verifies the commit and that no agent context files (AGENTS.md, .bob, CLAUDE.md, ...) are present.
- `target/` is ignored by the outer git repo. `target/tinydb` is its own git clone.

All file paths in every result file are relative to the tinydb repo root, with forward slashes, for example `tinydb/table.py`.
That is why the plugin should have `target/tinydb` open as its workspace (see section 7).


## 4. The pipeline, command by command

Run commands from the repository root with the virtual environment active. Anything that calls Bob must be run from a
standalone PowerShell window (not the Bob IDE terminal) with `BOB_API_KEY` set; the runner refuses otherwise.

| Order | Command | Module | Calls Bob? | Reads | Writes |
|---|---|---|---|---|---|
| 1 | `target` | `target.py` | no | GitHub | `target/tinydb`, `target.lock.json` |
| 2 | `gonogo` | `gonogo.py` | yes, 5 small calls | | `results/gonogo.json` |
| 3 | `scan` | `scan.py` | no | `target/tinydb` | `exams/index.json` |
| 4 | `generate` | `generate.py`, `families/*` | no | `index.json` | `exams/candidates.jsonl` |
| 5 | `split` | `split.py` | no | candidates | `train.jsonl`, `test.jsonl`, `split_report.json` |
| 6 | `pilot` | `pilot.py` | no | candidates, train | `exams/pilot.jsonl` |
| 7 | `exam --condition C --set S` | `exam.py` = `runner.py` + `mark.py` + `report.py` | yes | questions, contexts | answers, raw, marked, report, history, costs |
| 8 | `cartographer` | `cartographer.py` | yes, 5 calls | `results/marked/train_C1_r1.jsonl` | `contexts/C2/AGENTS.md`, `results/cartographer/` |
| 9 | `git tag freeze` | | | | locks the experiment; TEST cannot run without it |
| 10 | `analyze` | `analyze.py` | no | `results/marked/test_*.jsonl` | `results/final_analysis.json` |
| any | `simulate` | `simulate.py` | no | `exams/train.jsonl` | `results/sim/` (fake, labelled) |
| any | `report --set S --condition C` | `report.py` | no | marked run | report files |
| any | `publish [--run NAME] [--sim] [--dest PATH]` | `publish.py` | no | a marked run | files inside the target repo (section 6) |

### 4.1 Question generation (no AI involved)

`scan.py` parses every module with Python's `ast` and records modules, classes (with bases and methods), functions
(params, literal defaults, exceptions raised in their own code, names they call) and imports. `@overload` stubs are
skipped and the last definition of a name wins.

Five question families (`blindspot/families/`), every truth taken from the index:

| Family | Example | Answer type |
|---|---|---|
| imports | Does `tinydb/queries.py` import from `tinydb.table`? | yes/no |
| exists | Does class `Table` have a method named `update_all`? (real names, names moved from another class, near misses, mutations) | yes/no |
| defaults | What is the default value of parameter `cond` of `Table.update`? | Python literal |
| raises | Does `LRUCache.__getitem__` contain a `raise` for `KeyError` in its own code? | yes/no |
| calls | Does `Query.__ne__` contain a call to something named `_generate_test`? | yes/no |

Yes/no families are balanced 50/50. Ambiguous cases (re-exports, inherited built-in methods, one-hop raises) are skipped
so that every truth is defensible. Each question has an `id`, `family`, `subkind`, `module`, `path`, `entity`
(for example `tinydb.table:Table.update`, or `tinydb.table:<module>` for module-level questions), `type` (`tf` or `value`),
`text` and `truth`.

### 4.2 The three conditions

| Condition | Context Bob gets |
|---|---|
| C0 | nothing |
| C1 | `contexts/C1/AGENTS.md`, produced by Bob's own `/init` run in Bob IDE on a clean `target/tinydb` |
| C2 | `contexts/C2/AGENTS.md` = the C1 file plus a section "Blindspot notes (facts checked against the code)" written by the Cartographer |

Everything else (mode, flags, prompt, batch size, question order) is identical across conditions.

### 4.3 How an exam runs (`runner.py`)

1. A fresh workspace is built at `.cache/exam_ws/<condition>/`: a copy of `target/tinydb`, then every agent context
   file is deleted (AGENTS.md, CLAUDE.md, .bob, .cursor, ...), then `.bob/custom_modes.yaml` with the examinee mode is
   written, then only that condition's AGENTS.md is copied in. Nothing published into `target/tinydb` can reach an exam.
2. Questions are sorted by id, shuffled with seed 7 and cut into batches of 20. The batches are the same for every condition.
3. Each batch is one headless call: `bob run --format json --workspace <ws> --trust --accept-license --max-turns 2 --max-cost 1.0
   --disable-tool-groups read,edit,command,browser,mcp --disable-mcp --disable-subagents --mode blindspot-examinee`,
   with the prompt on stdin. The go/no-go test proved this is closed book (a secret file could not be read) while
   AGENTS.md still reaches Bob.
4. Bob must return a JSON array of `{"id", "answer", "p"}` where `p` is its probability that its own answer is correct.
   Malformed items are dropped and count as missing.
5. If a call used any tool, all its answers are excluded (`reason: tool_use`). If more than 10% are missing, the batch is
   re-run once. Remaining gaps are excluded (`reason: missing`).
6. Replies are cached in `.cache/bob/` so a rerun never pays twice. Every call is logged in `results/costs.jsonl` and saved
   in `results/raw/<run>/`.
7. Running `--set test` is refused unless the git tag `freeze` exists and the TEST file still matches its SHA-256.

### 4.4 Marking (`mark.py`)

Yes/no answers must be JSON booleans equal to the truth. Value answers are compared as Python literals with
`ast.literal_eval`, type included (`0` is not `False`). Each marked row keeps `text`, `truth`, `answer`, `p`, `correct`
(0 or 1), `excluded` and `reason`, so later steps can say exactly what Bob believed.

### 4.5 Reports (`report.py`, contract in `docs/REPORT_SCHEMA.md`)

For the run overall, each module (file) and each folder: accuracy with a Wilson 95% interval, Brier score, ECE,
reliability bins, confidently wrong rate (wrong with `p >= 0.8`), overconfidence (mean `p` minus accuracy), `low_n`
(fewer than 10 answers) and `heat` = 1 minus the Wilson lower bound (0 fine, 1 worst). The red rule marks a module red if
its Wilson lower bound is below 0.60 or its confidently wrong rate is above 0.20. `red_modules` is ordered worst first.
`worst_entities` lists the 10 functions or classes with the most confidently wrong answers.

### 4.6 The Cartographer (`cartographer.py`)

Reads only the TRAIN run under C1 (never TEST). Targets the modules where Bob made at least one mistake on TRAIN, worst
first, at most 5. For each, one Bob call in the custom mode `blindspot-cartographer`, which may read files but not edit or
run anything, asks for at most 40 lines of verified facts about that module (classes and methods, parameters and defaults,
what each function raises, surprising calls, plausible names that do not exist), aimed at the TRAIN mistakes without
copying the questions. If a call fails, notes are generated from `exams/index.json` instead and logged as
`index_fallback`. The notes are appended to the C1 text to make `contexts/C2/AGENTS.md`.

On the real run the targets were `storages, database, table, queries, utils`.

### 4.7 Analysis (`analyze.py`, `stats.py`)

Pairs the same TEST questions across C1 and C2 (a question counts only if scored in both).
Primary: exact McNemar test on the questions where the two conditions disagree, two sided, alpha 0.05.
Secondary with Holm correction: Brier difference (paired bootstrap), confidently wrong rate (McNemar), and C1 vs C0 if C0 was run.
Sensitivity: cluster bootstrap of the accuracy difference by entity and by module.


## 5. Results (real, not simulated)

| Run | Questions | Accuracy | Notes |
|---|---|---|---|
| pilot C0 | 30 | 90.0% | pipeline check, 0.012 Bobcoins |
| train C1 | 120 | 91.7% | 10 wrong, drove the Cartographer, 0.056 Bobcoins |
| test C1 | 200 | 89.0% (83.9 to 92.6) | Brier 0.086, confidently wrong 3.0% |
| test C2 | 200 | 95.0% (91.0 to 97.3) | Brier 0.041, confidently wrong 3.0% |

Primary result: C2 fixed 17 questions and broke 5. Exact McNemar p = 0.017, significant. Wrong answers fell from 22 to 10.
Brier improved (Holm p < 0.001). Confidently wrong rate did not change. Cluster bootstrap by entity: +6.0 points (2.1 to 10.1).

Limitations to state honestly: one repository, one run per condition, a popular library Bob may have seen in training,
and C2 contains more text than C1 with no length-matched control. Deviations are logged in `PREREGISTRATION.md`.


## 6. What `publish` writes (the plugin's second contract)

`python cli.py publish` reads one marked run (default: the newest file in `results/marked/`, which is `test_C2_r1`;
choose with `--run test_C1_r1`; `--sim` uses `results/sim/`) and writes into `target/tinydb` (or `--dest`):

| File | Purpose |
|---|---|
| `.bob/context/readiness.json` | The plugin's context file, format fixed by `plugin/BUILD_PLAN.md` section 2 and `plugin/src/contract.ts` |
| `.bob/rules/readiness-context.md` | Plain English list of facts Bob got wrong with the correct answers. Bob loads `.bob/rules` automatically |
| `AGENTS.md` | A block between `<!-- blindspot:start -->` and `<!-- blindspot:end -->` with readiness per file. Other text is kept; republishing replaces only the block |
| `.bob/blindspot/` | Copies of every `report_*.json` and `history.jsonl`, so the Exam tab works with `target/tinydb` open |

How `readiness.json` is filled from the marked answers:

| Field | Source |
|---|---|
| `repo` | name of the destination folder, pinned commit, time of publishing |
| `summary.readiness` | overall accuracy of the run |
| `summary.questions` | number of scored answers |
| `summary.sure_but_wrong` | number of wrong answers with `p >= 0.8` |
| `summary.bobcoins_spent` | sum of `results/costs.jsonl` (0 for simulated data) |
| `files[]` | one per module: `readiness` = module accuracy, `status` ready (>= 0.85), review (>= 0.65) or not_ready, `imports` from the scanner |
| `functions[]` | one per function, method or class that questions were about. `id` = `<file>::<qualname>`. Line range from the actual source (`ast`); for a class only its header lines. `readiness` = accuracy on its questions. `status` = wrong (any wrong answer with `p >= 0.8`), part (some wrong), ok (all right). `tested` = the short name appears somewhere under `tests/` (a name search, a heuristic). `misconceptions` = up to 5 wrong answers, most confident first: `believed` is the question plus Bob's answer, `truth` is the correct answer, `confidence` is `p` |
| `findings[]` | `review_risk` for every function with a wrong answer (severity high if confidently wrong at `p >= 0.9`, medium if confidently wrong, else low). `test_gap` when readiness is below 0.85 and no test mentions the name. `bob_allowed` uses the gate yes (>= 0.85), with_notes (>= 0.65), no (below). `estimated_coins` is a fixed 0.05. Line range is the first 5 lines of the function. Ids F001, F002, ... in severity order |
| `starter_tasks[]` | up to 3 small functions that Bob answered fully correctly, in files marked ready |
| `setup` | `pip install -e .` and `pytest -q` |
| `_blindspot` | extra key (simulated flag, red modules). The plugin's zod schema strips unknown keys, so it is ignored there |

Choosing the run is a presentation choice: `test_C1_r1` shows Bob before Blindspot's notes (22 mistakes to highlight),
`test_C2_r1` shows after (10 mistakes).


## 7. How the plugin connects

The plugin reads two things, both relative to the open workspace folder:

1. The exam reports (`docs/REPORT_SCHEMA.md`), looked for in this order: `bobReadiness.resultsPath` (default `results`),
   then `results/sim` (shown with a simulated banner), then `.bob/blindspot` (needs the small patch
   `plugin_report_fallback.patch` to `plugin/src/report/reportStore.ts`). Report paths are mapped onto
   `bobReadiness.targetRoot`, else `target/<repo>` from `target.lock.json`, else the workspace root.
2. The readiness context at `bobReadiness.contextPath` (default `.bob/context/readiness.json`), paths relative to the workspace root.

Two ways to open it:

| Open this folder in Bob IDE | Works | Caveat |
|---|---|---|
| `target/tinydb` (recommended for the demo) | Highlights, hovers, CodeLens, Problems, all tabs, and the Exam tab via `.bob/blindspot` (with the patch) | Run `publish` first. The Publish button will not work here because `cli.py` is not in this folder |
| the repository root | Exam tab and tree colouring from `results/`, Publish button | Highlighting finds no context unless `bobReadiness.contextPath` is set to `target/tinydb/.bob/context/readiness.json`, and its paths would then not match files; use the tinydb folder for highlighting |

The Publish button runs `bobReadiness.publishCommand` (default `python cli.py publish`, using `.venv` if present) in the workspace root.

The "Send to Bob" flow creates a branch and needs a clean working tree. `publish` modifies `target/tinydb`, so commit
inside that folder first (`cd target/tinydb; git add -A; git commit -m "Add Blindspot context"`). Do not push that commit.
This flow has only been tested with the plugin's fake Bob so far.


## 8. Common tasks

Demo setup on a fresh machine:
```
git pull
python cli.py target            # fetch tinydb if missing
python cli.py publish --run test_C1_r1
# open target/tinydb in Bob IDE
```

Show the improvement in the video: publish `test_C1_r1`, record, then `python cli.py publish --run test_C2_r1`, record again.
The Exam tab's Compare runs can show `test_C1_r1` against `test_C2_r1` at any time.

Work on the plugin without real data: `python cli.py simulate` then `python cli.py publish --sim`. Afterwards run
`python cli.py target --force` to wipe simulated files out of `target/tinydb`.

Run the engine tests: `pytest -q` (expect about 97 passed, 1 skipped). Plugin: `cd plugin; npm test; npm run build`.


## 9. Rules that must not be broken

1. Never edit `exams/test.jsonl`, `exams/train.jsonl`, `exams/split_report.json`, `contexts/` or anything in `results/`
   except by the commands that produce them. The TEST file is sealed by hash.
2. Do not change the parameters in `blindspot/config.py` that are listed in `PREREGISTRATION.md` section 8;
   `tests/test_prereg.py` fails if they drift.
3. Field names in `docs/REPORT_SCHEMA.md` and in the readiness contract are fixed. Changes go through Nacky and must be
   made on both sides at once.
4. Never run `/init` or any Bob task on `target/tinydb` while it contains published or simulated files; reset with
   `python cli.py target --force` first.
5. Simulated data must always carry `"simulated": true` and be labelled in the UI.
6. Bob exams run only from a standalone terminal, never the Bob IDE terminal.
7. Never commit `.env` or the Bob API key. One branch per change, pull request, merge; no direct commits to `main`.
8. Line endings are LF (`.gitattributes`). On Windows this matters for the TEST hash.
