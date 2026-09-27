# Bob Readiness (the Blindspot plugin)

A VS Code extension for IBM Bob IDE, living in `plugin/` at the root of the Blindspot repository.
It reads two files produced by the Blindspot engine and never calls the statistics code:

- `results/report_latest.json` plus `results/history.jsonl` (docs/REPORT_SCHEMA.md): the exam
  results. The plugin colours the file tree by heat, marks red modules, and shows the Exam tab
  with overall metrics, reliability, modules worst first, worst functions, change over time,
  run comparison and a Publish button. While no real run exists, `results/sim/` (simulated data
  from `python cli.py simulate`) is used and labelled with a banner.
- `.bob/context/readiness.json` (BUILD_PLAN.md section 2): per-function readiness and findings.
  This drives line highlighting, hover cards, CodeLens, the Problems panel and the Review,
  Testing, Release, Modernize and Onboarding tabs, and the human-in-the-loop flow where a
  developer approves findings and Bob edits the code on a new git branch.

Either file may be missing: each part of the plugin simply stays empty until its file exists.

Screenshots: see `references/` for the target look (real screenshots come in phase 7).

## Exam tab and tree colouring (report contract)

- Explorer: red badge `!` for modules where `red` is true, colour by `heat` otherwise (five
  bands, green to red), `?` when `low_n` is true (few answers). Files with no entry stay neutral.
  Folders use the `directories` entries. Colours are theme colours `blindspot.red` and
  `blindspot.heat0` to `blindspot.heat4`, so they can be changed in `workbench.colorCustomizations`.
- Exam tab: banner when the data is simulated, run name, condition, generated time, target
  commit, overall accuracy with the 95% interval, confidently wrong rate, Brier, ECE,
  overconfidence, reliability bins, change over time (one line per condition), modules worst
  first with per-file sparklines and family accuracy, worst functions and classes (click opens
  the file), Compare runs (any two `report_<run>.json`), Publish context (runs
  `bobReadiness.publishCommand` and shows its output) and Reload report.
- Status bar: "Blindspot 89% C2" opens the Exam tab.
- Paths in the report are relative to the examined repository. The plugin maps them onto
  `target/<repo>` when `target.lock.json` exists (fetch it with `python cli.py target`), or onto
  the workspace root, or onto `bobReadiness.targetRoot`.

## What you get from the readiness context

- Highlighting in any open file listed in the context: red tint and left border for functions
  where Bob was sure but wrong, blue for partly known, nothing for known. Yellow gutter dots on
  lines with findings. A dimmed inline note on the def line of wrong functions.
- Hover cards: readiness, what Bob believed and what is true, findings, "Add to Bob queue".
- CodeLens above functions with findings: "Add to Bob queue (N)" and "Why Bob is unsure", or
  "Needs a person".
- Problems panel entries for every finding (high = Warning, medium = Information, low = Hint).
- Status bar: "Readiness: On/Off" toggle on the left; overall readiness and Bobcoins spent this
  session on the right.
- Side panel with five tabs: Onboarding (setup, first tasks, chat answered by Bob), Review,
  Testing, Release (computed from git plus the context), Modernize.
- Human in the loop: tick findings across tabs, "Send to Bob", approve in a modal, Bob works on
  a new branch, tests run, Keep or Discard.

## Install from .vsix

1. Build: `npm install && npm run package` produces `bob-readiness-<version>.vsix`.
2. In Bob IDE: Extensions view, the "..." menu, "Install from VSIX", pick the file.
3. Open a repository that has `.bob/context/readiness.json`. The panel is in the activity bar.

## Settings

| Setting | Default | Meaning |
|---|---|---|
| `bobReadiness.contextPath` | `.bob/context/readiness.json` | Where the context file lives in the workspace |
| `bobReadiness.highlightOnStartup` | `true` | Show highlights when the IDE opens |
| `bobReadiness.bobCommand` | `bob run --format json` | Headless Bob command. The prompt is passed as the last argument and on stdin |
| `bobReadiness.useFakeBob` | `true` | Use `scripts/fake-bob.js` instead of real Bob. Real Bob costs Bobcoins |
| `bobReadiness.testCommand` | `pytest -q` | Run after Bob makes changes, and by "Run tests" in the Release tab |
| `bobReadiness.baseBranch` | `main` | Branch to return to when discarding |
| `bobReadiness.resultsPath` | `results` | Folder with `report_latest.json` and `history.jsonl`. Falls back to `<folder>/sim` |
| `bobReadiness.targetRoot` | empty | Folder the report paths map onto. Empty means `target/<repo>` from `target.lock.json`, else the workspace root |
| `bobReadiness.publishCommand` | `python cli.py publish` | Run by the Publish button, in the workspace root. A workspace `.venv` python is used automatically |

## The readiness gate

| Readiness of the function | `bob_allowed` | What the extension does |
|---|---|---|
| 85% or more | `yes` | "Bob can do this": can be sent to Bob |
| 65% to 84% | `with_notes` | "Bob with notes, review needed": sent with the study notes, result flagged for review |
| Below 65% | `no` | "Needs a person": checkbox disabled, never sent to Bob |

## How the human-in-the-loop flow works

1. Tick findings in the panel, from a hover card or from CodeLens. One shared queue.
2. "Send to Bob" shows a modal: the findings, the new branch name
   `bob/readiness-<yyyymmdd-hhmm>`, the estimated cost. Nothing runs until "Approve and run".
3. The working tree must be clean, otherwise the extension refuses and explains.
4. The branch is created. One prompt is built for all findings (with the study notes for
   `with_notes` items) and Bob runs once, headless, in the repository root. Progress streams to
   the "Bob Readiness" Output channel with timestamps.
5. The panel shows the changed files with +/- counts, then the test result.
6. "Keep changes" commits on the branch. "Discard" resets, returns to the base branch and
   deletes the branch. Either way the queue is cleared.

Onboarding questions are read-only, never on a new branch, and cached per question in the
workspace, so repeated questions are free.

## Development

    npm install
    npm run build        # esbuild bundle to dist/
    npm test             # vitest unit tests (pure logic) plus a git integration test
    npm run lint
    npm run smoke        # drives the bundled extension with fake Bob in a scratch copy of ../demo-tinydb,
                         # then the Exam tab and tree colouring from ../results/sim
    npm run package      # produces bob-readiness-<version>.vsix

Press F5 in VS Code to start the Extension Development Host with `../demo-tinydb` open. To see the
Exam tab and tree colouring instead, open the Blindspot repository root as the workspace (after
`python cli.py target`), or point `bobReadiness.resultsPath` at the results folder.

## Demo workspace

The sample context is `fixtures/readiness.sample.json`. Every line number in it starts as a
placeholder (1 to 2) until `scripts/fix-fixture-lines.py` aligns it with a real tinydb checkout.

    git clone https://github.com/msiemens/tinydb ../demo-tinydb
    python3 scripts/fix-fixture-lines.py ../demo-tinydb fixtures/readiness.sample.json
    mkdir -p ../demo-tinydb/.bob/context ../demo-tinydb/.bob/rules
    cp fixtures/readiness.sample.json ../demo-tinydb/.bob/context/readiness.json
    cp fixtures/readiness-context.sample.md ../demo-tinydb/.bob/rules/readiness-context.md
    cd ../demo-tinydb && git branch -m master main && git add .bob && git commit -m "chore: add Bob readiness context"

The demo workspace must be a git repository with a clean working tree, because the approval
flow creates a branch. The `baseBranch` setting defaults to `main`, so rename tinydb's `master`
branch as shown above or change the setting.

Tests in the demo workspace need a virtualenv: `python3 -m venv .venv && .venv/bin/pip install -e . pytest pytest-cov pyyaml`.
The demo's `.vscode/settings.json` sets `bobReadiness.testCommand` to `.venv/bin/python -m pytest -q`.
