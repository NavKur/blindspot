# Bob Readiness (the Blindspot plugin)

A VS Code extension for IBM Bob IDE, in `plugin/` at the root of the Blindspot repository. It
shows a developer where Bob is sure but wrong before they rely on it, and lets them hand Bob
only the work Bob is ready for, with a person approving every step.

The plugin never calls the statistics code and never calls Bob on its own. It reads two files
written by the Blindspot engine, and it spawns Bob only after an explicit approval.

| File | Written by | What the plugin does with it |
|---|---|---|
| `results/report_latest.json`, `results/history.jsonl`, `results/report_<run>.json` (docs/REPORT_SCHEMA.md) | `python cli.py report` (or `simulate` for fake data in `results/sim/`) | Explorer colours by heat, red badges, Exam tab, Heatmap over runs, status bar item, update toasts |
| `.bob/context/readiness.json` and the notes file it names (BUILD_PLAN.md section 2) | The Cartographer (in progress on the engine side) | Line highlights, hover cards, CodeLens, Problems entries and quick fixes, Heatmap of functions, Review, Testing, Release, Modernize and Onboarding tabs, the approval flow |

Either file may be missing. Each part stays empty until its file exists. Paths in both files are
relative to the examined repository, which the plugin finds as `target/<repo>` from
`target.lock.json`, or the workspace root, or the `bobReadiness.targetRoot` setting.

## Features

**Explorer and editor**

- File tree coloured by exam heat (five bands, green to red), `!` badge on red modules, `?` when
  there were few answers, folders from the report's directory entries, neutral when a file was
  not examined. Files only in the readiness context are coloured by their readiness status.
  Tabs carry the same colour and badge.
- Whole-function line tints: red with a left border where Bob was sure but wrong, blue where it
  was only partly right, nothing where it knows the code. Yellow gutter dots on lines with
  findings. A dimmed note on the def line: "Sure but wrong (92%): Bob believed ... Actually ...".
- Hover cards: function, readiness, what Bob believed against the truth, findings with
  recommendations, "Add to Bob queue" or "Needs a person".
- CodeLens above functions with findings: "Add to Bob queue (N)" and "Why Bob is unsure".
- Problems panel entry per finding, with quick fixes: add to the queue, open the study notes,
  copy context for the file.
- Status bar: "Readiness: On/Off" toggle (Cmd+Alt+R), overall readiness, Bobcoins this session,
  "Blindspot 89% C2" for the exam, and a warning "Bob: confidently wrong here N times" while a
  risky file is active. Clicking the warning explains why and offers to copy the context.
- Right click a file or editor: "Copy Bob Context for This File" (Cmd+Alt+C) puts a prompt
  preamble on the clipboard with the exam numbers, every misconception and its truth, open
  findings and the study notes. "Queue All Allowed Findings in This File" adds them in one go.

**Side panel** (activity bar "Bob Readiness", seven tabs)

- Exam: banner when the data is simulated, run, counts, accuracy with the 95% interval,
  confidently wrong rate, Brier, ECE, overconfidence, reliability bins, change over time (one
  line per condition), modules worst first with sparklines and family accuracy, worst functions
  and classes, Compare runs, Publish context, Reload report.
- Heatmap: GitHub style squares. Files over exam runs (one column per run) and functions by
  file (one square per function from the readiness context). Hover for numbers, click to jump.
- Onboarding: setup commands, good first tasks, a chat answered by Bob from the study notes and
  the architecture list, three question presets (new to the repo, reviewing a change, about to
  release), answers cached so repeats are free.
- Review, Testing, Modernize: findings sorted by severity then readiness, with the gate label
  ("Bob can do this", "Bob with notes, review needed", "Needs a person"), one shared queue
  across tabs, hover links and CodeLens, and a footer with the count and the estimated cost.
- Release: commits since the last tag, changed functions mapped to the context, readiness bars,
  a fixed verdict ("Ready to release", "Ready, with items to check", "Not ready"), draft release
  notes grouped Fixed / Added / Other, Run tests, Copy release notes.

**Human in the loop**

1. Tick findings anywhere. "Send to Bob" (Cmd+Alt+B) shows a modal with each item, the new
   branch `bob/readiness-<yyyymmdd-hhmm>`, the estimated cost and the session budget.
2. The plugin refuses when the working tree is dirty, when the branch exists, or when the
   estimate would take the session over `bobReadiness.sessionBudget`.
3. One prompt for all items, with the study notes for `with_notes` items and the rule to change
   only what is listed. Bob runs headless in the repository, streaming to the "Bob Readiness"
   Output channel with timestamps. Cancel from the progress notification.
4. Changed files with +/- counts, the diff of the first file opens automatically, "Review all
   changes" opens the rest. The test command runs and the result box shows pass or fail.
5. "Keep changes" commits on the branch and offers a draft pull request: through the GitHub CLI
   when available, otherwise the title and body go to the clipboard and an editor. "Discard"
   resets, returns to the base branch and deletes the branch. The queue clears either way.
6. Findings with `bob_allowed: no` can never be sent. Fake Bob (`scripts/fake-bob.js`) is the
   default; real Bob costs Bobcoins and is switched on by the `useFakeBob` setting.

**Feedback loop**: when the engine rewrites the report or the context, a toast says what changed
("1 function improved, 2 new sure but wrong", "no longer red: tinydb.queries") with a button to
the Heatmap or Exam tab.

A "Getting started" walkthrough (Help, Welcome) covers the four steps.

## Try it in a browser

`docs/demo/index.html` at the repository root is a self-contained web version: the plugin's real
side panel with the real exam data for tinydb, an editor view with the highlights, and a scripted
fake Bob for the approval flow. Build it with `npm run web-demo`; see `docs/demo/README.md` for
the links to share.

## Install from .vsix

1. `npm install && npm run package` produces `bob-readiness-<version>.vsix`.
2. In Bob IDE: Extensions view, the "..." menu, "Install from VSIX", pick the file.
3. Run `python cli.py publish --run test_C1_r1` in the Blindspot repository, then open either
   `target/tinydb` (highlights, hovers, CodeLens, Problems, every tab, Exam tab from
   `.bob/blindspot`, Publish button) or the repository root (Exam tab from `results/`, tree
   colouring and highlights inside `target/tinydb`). Any other repository with a
   `.bob/context/readiness.json` also gets highlights and the approval flow.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `bobReadiness.contextPath` | `.bob/context/readiness.json` | Readiness context, looked up in the target repository first, then the workspace |
| `bobReadiness.highlightOnStartup` | `true` | Show highlights when the IDE opens |
| `bobReadiness.bobCommand` | `bob run --format json` | Headless Bob command. The prompt is passed as the last argument and on stdin |
| `bobReadiness.useFakeBob` | `true` | Use `scripts/fake-bob.js` instead of real Bob |
| `bobReadiness.testCommand` | `pytest -q` | Run after Bob makes changes, and by "Run tests" |
| `bobReadiness.baseBranch` | `main` | Branch to return to when discarding |
| `bobReadiness.sessionBudget` | `5` | Bobcoins the plugin may spend this session. 0 means no limit. Ignored with fake Bob |
| `bobReadiness.openDiffAfterRun` | `true` | Open the first changed file's diff when Bob and the tests finish |
| `bobReadiness.resultsPath` | `results` | Folder with `report_latest.json` and `history.jsonl`. Falls back to `<folder>/sim`, then to `.bob/blindspot` (the copies `python cli.py publish` writes into the examined repository) |
| `bobReadiness.targetRoot` | empty | Folder the report and context paths map onto. Empty means `target/<repo>` from `target.lock.json`, else the workspace |
| `bobReadiness.publishCommand` | `python cli.py publish` | Run by the Publish button in the Blindspot engine folder (the workspace or the nearest parent with `cli.py`), with that folder's `.venv` python and `--dest` for the repository being shown |

## The readiness gate

| Readiness of the function | `bob_allowed` | What the plugin does |
|---|---|---|
| 85% or more | `yes` | "Bob can do this": can be sent to Bob |
| 65% to 84% | `with_notes` | "Bob with notes, review needed": sent with the study notes, flagged for review |
| Below 65% | `no` | "Needs a person": checkbox disabled, never sent |

## Development

    npm install
    npm run build        # esbuild bundle to dist/
    npm test             # vitest: pure logic plus a git integration test
    npm run lint
    npm run smoke        # drives the bundled plugin against a stub VS Code API: fake Bob in a copy of
                         # ../demo-tinydb, then results/sim plus a fake context in a copy of the repo layout,
                         # then target/tinydb as the workspace after a real `cli.py publish --sim`
    npm run package      # bob-readiness-<version>.vsix

Press F5 in VS Code to start the Extension Development Host with `../demo-tinydb` open.

Layout: one feature per file in `src/`. Pure logic (parsing, ranges, sorting, prompts, verdicts,
heatmap, diffs) has no VS Code dependency and is unit tested; the VS Code facing modules are thin.

## Demo workspace

The sample context is `fixtures/readiness.sample.json`. Line numbers start as placeholders until
`scripts/fix-fixture-lines.py` aligns them with a tinydb checkout.

    git clone https://github.com/msiemens/tinydb ../demo-tinydb
    python3 scripts/fix-fixture-lines.py ../demo-tinydb fixtures/readiness.sample.json
    mkdir -p ../demo-tinydb/.bob/context ../demo-tinydb/.bob/rules
    cp fixtures/readiness.sample.json ../demo-tinydb/.bob/context/readiness.json
    cp fixtures/readiness-context.sample.md ../demo-tinydb/.bob/rules/readiness-context.md
    cd ../demo-tinydb && git branch -m master main && git add .bob && git commit -m "chore: add Bob readiness context"
    python3 -m venv .venv && .venv/bin/pip install -e . pytest pytest-cov pyyaml

The demo's `.vscode/settings.json` points `testCommand` at that virtualenv. The approval flow
needs a clean git working tree.
