# The Bob Readiness plugin: a brief for presenting it

This document explains the Bob IDE plugin, the part of Blindspot that lives in `plugin/`.
It is written for a teammate who did not build the plugin and needs to present it. It covers
what the plugin is for, how it fits into Blindspot, what a developer sees, how the safety
rules work, how it is built, and a demo script with suggested slides.

---

## 1. The one-paragraph version

Blindspot measures where IBM Bob (an AI coding assistant) is confidently wrong about a
codebase. It does that by generating an exam from the code, having Bob sit it, and marking
the answers. The plugin is the part a developer actually sees. It is a VS Code extension that
runs inside Bob IDE and turns those exam results into things in the editor: coloured files in
the Explorer, red highlights on functions Bob misunderstands, hover cards that say what Bob
believed and what is actually true, a side panel that ranks the risky work, and a guarded
flow for handing Bob only the tasks it is ready for, with a person approving every step.

The pitch in one sentence: **"See where Bob is sure but wrong, before you rely on it."**

---

## 2. Where the plugin sits in Blindspot

Blindspot has two halves, built by two people.

| Half | Language | Owner | What it does |
|---|---|---|---|
| The engine | Python (`cli.py`, `blindspot/`) | Teammate | Generates the exam from the code's syntax tree, runs Bob against it, marks the answers, computes the statistics, writes the report files |
| The plugin | TypeScript (`plugin/`) | Aziz | Reads the report files and shows them inside Bob IDE; runs the human in the loop flow |

The two halves talk only through files on disk. This is a deliberate design choice and a good
talking point: the plugin never imports the statistics code, never generates questions, and
never calls Bob on its own. It reads two JSON files and spawns Bob only after a person clicks
"Approve and run".

### The two input files

**File 1: the exam report** (`results/report_latest.json`, `results/history.jsonl`, and one
`report_<run>.json` per run). Written by `python cli.py report`. Contract in
`docs/REPORT_SCHEMA.md`. This is module level data: per file, how accurate Bob was, whether
the file is "red" (confidently wrong too often), reliability bins, worst entities. Drives the
Explorer colouring, the Exam tab, the Heatmap over runs, and the status bar score.

**File 2: the readiness context** (`.bob/context/readiness.json` plus a markdown notes file).
Written by the Cartographer, the engine's context writer (still in progress on the engine
side). Contract in `plugin/BUILD_PLAN.md` section 2 and the zod schema in
`plugin/src/contract.ts`. This is function level data: per function, its readiness score, its
status (ok, part, wrong), Bob's misconceptions with what it believed versus the truth, and a
list of findings (review risks, test gaps, modernization candidates, release risks), each
tagged with whether Bob is allowed to work on it. Drives the line highlights, hover cards,
CodeLens, Problems panel, the Review, Testing, Release, Modernize and Onboarding tabs, and
the approval flow.

Either file may be missing. Each part of the plugin stays empty until its file exists. While
the real report does not exist yet, the plugin falls back to simulated data in `results/sim/`
and shows a clear "simulated" banner.

---

## 3. What the developer sees

Group these into three areas when presenting.

### 3a. In the editor and Explorer (passive, always on)

- **File tree coloured by heat.** Five bands from green to red. A `!` badge on red modules, a
  `?` when there were too few answers to be sure, neutral when the file was not examined.
  Folders take the colour of their directory entry. Editor tabs carry the same colour.
- **Whole-function line tints.** Red with a red left border where Bob was sure but wrong. Blue
  where it was only partly right. Nothing where Bob knows the code.
- **Inline note on the def line.** Dimmed text such as: "Sure but wrong (92%): Bob believed
  update() raises ValueError when no condition is given. Actually, it raises nothing."
- **Yellow gutter dots** on lines with findings.
- **Hover cards.** Function name, readiness percentage, status, what Bob believed against the
  truth, each finding with its recommendation, and an "Add to Bob queue" link or a "Needs a
  person" label.
- **CodeLens** above functions with findings: "Add to Bob queue (N)" and "Why Bob is unsure".
- **Problems panel.** One entry per finding, severity mapped to Warning, Information or Hint,
  with quick fixes (light bulb): add to queue, open the study notes, copy the context.
- **Status bar.** A "Readiness: On/Off" toggle (Cmd+Alt+R) that hides everything at once;
  overall readiness; Bobcoins spent this session; the exam score such as "Blindspot 89% C2";
  and a warning "Bob: confidently wrong here N times" while a risky file is open.
- **Right click a file:** "Copy Bob Context for This File" (Cmd+Alt+C) puts a ready-to-paste
  prompt preamble on the clipboard with the exam numbers, every misconception and its
  correction, the open findings and the study notes. "Queue All Allowed Findings in This
  File" adds them in one go.

### 3b. The side panel (activity bar "Bob Readiness", seven tabs)

| Tab | What it shows | Data source |
|---|---|---|
| Exam | Simulated banner if applicable, run name, counts, accuracy with 95% interval, confidently wrong rate, Brier score, ECE, overconfidence, reliability bins, change over time (one line per condition), modules worst first with sparklines, worst functions and classes, Compare runs, Publish, Reload | Report |
| Heatmap | GitHub style squares. Files across exam runs (one column per run), and functions by file. Hover for numbers, click to jump to the code | Report history plus context |
| Onboarding | Setup commands, good first tasks, and a chat answered by Bob from the study notes. Three question presets by role: new to the repo, reviewing a change, about to release. Answers are cached so repeats are free | Context, Bob (read only) |
| Review | Findings of type review_risk, sorted by severity then readiness, each with a gate label | Context |
| Testing | Findings of type test_gap, same layout | Context |
| Modernize | Findings of type modernize, same layout | Context |
| Release | Commits since the last tag, changed functions mapped to the context, readiness bars per changed file, a fixed verdict ("Ready to release", "Ready, with items to check", "Not ready"), draft release notes grouped Fixed / Added / Other, Run tests, Copy release notes | Git plus context |

Review, Testing and Modernize share **one queue**. Ticking in any tab, hover link or CodeLens
adds to the same selection. The footer shows "Selected: N (across tabs)", the estimated cost
in Bobcoins, and the "Send to Bob" button.

### 3c. The human in the loop flow (the centrepiece)

This is the part to demo live if you can. Six steps:

1. **Tick findings** anywhere, then "Send to Bob" (Cmd+Alt+B). A modal lists every item, the
   new branch name `bob/readiness-<yyyymmdd-hhmm>`, the estimated cost and the session budget.
2. **The plugin refuses** when the working tree is dirty, when the branch already exists, or
   when the estimate would push the session over its Bobcoin budget.
3. **One prompt for all items.** Study notes are included for items that need them, plus the
   rule to change only what is listed. Bob runs headless in the repository and streams to the
   "Bob Readiness" Output channel with timestamps. Cancel from the progress notification.
4. **Results.** Changed files with +/- counts. The diff of the first file opens automatically.
   "Review all changes" opens the rest. The configured test command runs and a box shows pass
   or fail.
5. **Keep or Discard.** Keep commits on the branch and offers a draft pull request (via the
   GitHub CLI when installed, otherwise title and body go to the clipboard and an editor).
   Discard resets, returns to the base branch and deletes the branch. The queue clears either
   way.
6. **Feedback loop.** When the engine rewrites the report or the context, a toast says what
   changed ("1 function improved, 2 new sure but wrong") with a button to the relevant tab.

---

## 4. The readiness gate (the key idea to explain)

Every finding carries a `bob_allowed` value set by the engine from the function's readiness.
The plugin enforces it everywhere.

| Function readiness | `bob_allowed` | Label in the UI | What the plugin does |
|---|---|---|---|
| 85% or more | yes | "Bob can do this" (green) | Can be sent to Bob |
| 65% to 84% | with_notes | "Bob with notes, review needed" (blue) | Sent with the study notes, result flagged for review |
| Below 65% | no | "Needs a person" (red) | Checkbox disabled. Can never be sent |

The message for the audience: the plugin does not just show risk, it **routes work**. Safe
tasks go to Bob. Borderline tasks go to Bob with extra context and a review flag. Risky tasks
stay with a human. The decision is based on measured evidence (the exam), not on Bob's own
confidence, which is exactly the thing that cannot be trusted.

---

## 5. Safety rules built in

Worth a slide of their own. These are hard rules, not settings a user might forget.

- Bob runs only after explicit approval in a modal dialog.
- Bob only edits on a fresh branch. The plugin refuses to start on a dirty working tree.
- Findings marked `no` can never be sent, from any entry point.
- A per-session Bobcoin budget is checked before the modal is shown.
- No network calls of any kind except spawning the configured Bob command.
- A fake Bob (`scripts/fake-bob.js`) is the default. Real Bob costs credits and has to be
  switched on deliberately with the `useFakeBob` setting.
- The webview uses a strict Content Security Policy with a nonce, communicates only by
  postMessage, and uses VS Code theme variables so light and dark themes both work.
- The context file is validated with a zod schema. A broken file shows the first three
  problems and the plugin keeps the last valid version.

---

## 6. How it is built (for a technical audience)

- **Stack:** TypeScript strict, bundled with esbuild, tested with vitest, linted with eslint,
  packaged as a `.vsix`. About 5,200 lines of source across 49 modules.
- **Layout:** one feature per file in `src/`. Pure logic (parsing, line ranges, sorting,
  prompt building, release verdicts, heatmap layout, diff parsing) has no VS Code dependency
  and is unit tested. The VS Code facing modules are thin wrappers.
- **Tests:** 86 unit tests in 20 files, all passing. One integration test runs real git plus
  fake Bob in a temporary repository. A smoke script (`npm run smoke`) drives the bundled
  extension against a stub of the VS Code API through two full scenarios: fake Bob in a copy of
  the demo workspace, then the simulated report plus a fake context in a copy of the repo
  layout. It covers activation, the panel, the queue, CodeLens, hovers, Release, onboarding
  chat and cache, approve then keep, approve then discard, branch collision, dirty tree
  refusal and modal cancel.
- **Data flow:** two stores watch their files (`contextStore.ts`, `report/reportStore.ts`)
  and fire change events. Everything else subscribes. Paths in both files are relative to the
  examined repository, which the plugin resolves as `target/<repo>` from `target.lock.json`,
  the workspace root, or the `targetRoot` setting.
- **Notable modules:**
  - `contract.ts` and `report/reportContract.ts`: the two zod schemas, the only interface with the engine.
  - `decorations.ts`, `hover.ts`, `codelens.ts`, `diagnostics.ts`: the editor surface.
  - `panel/`: the webview (HTML with CSP, pure state computation, provider).
  - `approval.ts`, `bobRunner.ts`, `git.ts`, `testRunner.ts`, `pullRequest.ts`: the human in the loop flow.
  - `releaseLogic.ts`: maps `git diff -U0` ranges onto context functions and computes the verdict.
  - `report/treeDecorations.ts`: the FileDecorationProvider that colours the Explorer.
- **Settings:** eleven, all under `bobReadiness.*`. The ones to mention: `bobCommand` (the
  headless Bob command), `useFakeBob`, `testCommand`, `sessionBudget`, `resultsPath`.

---

## 7. Status and honest caveats

Say these plainly if asked.

- Built in a very short window against a Sunday 27 September deadline. Phases 0 to 6 of the
  build plan are done and packaged as `bob-readiness-0.0.1.vsix`.
- The **engine side of the readiness context (the Cartographer output) is still in progress**.
  Today the function level features run on a hand-aligned sample context
  (`fixtures/readiness.sample.json`) against a tinydb checkout. The report side runs on
  simulated data until real exam runs land. The plugin labels both as simulated or sample.
- The Publish button runs `python cli.py publish`, which the engine has not implemented yet.
- Real Bob has been tested by a go/no-go check (Bob answers headless, edits files on disk,
  returns a JSON result with a cost). The full approval flow has been exercised end to end
  with fake Bob and by the smoke script, and still needs a hand run inside Bob IDE with real
  Bob (planned phase 7).
- Layout, colours and the modal were verified against the reference mockups in
  `plugin/references/`, and by the smoke script, but not yet clicked through in a live Bob IDE
  window in the latest session.

---

## 8. Demo script (about five minutes)

Setup beforehand: install the `.vsix` in Bob IDE, open the Blindspot repository root after
`python cli.py target`, and have `../demo-tinydb` prepared as in the plugin README. Fake Bob
stays on.

1. **Explorer.** Point at the coloured tree under `target/tinydb`. Red badge on
   `tinydb/utils.py` and `__init__.py`, a `?` on `operations.py`. "Green means Bob knows this
   code. Red means it is confidently wrong about it."
2. **Exam tab.** Open the side panel. Show the simulated banner, accuracy with its interval,
   the confidently wrong rate, the reliability bins, and the change over time chart with one
   line per condition. Click Compare runs and pick C1 against C2.
3. **Heatmap tab.** Files across runs, then functions by file. Click a red square to jump.
4. **Editor.** Switch to the demo workspace, open `tinydb/table.py`. `update()` is red with
   the inline note; `search()` is blue. Hover for the card. Show the CodeLens. Open Problems.
   Toggle "Readiness: Off" in the status bar and everything disappears; toggle it back.
5. **Right click, Copy Bob Context.** Paste into any text box to show the preamble.
6. **The flow.** Review tab: tick two findings. Note one row is disabled with "Needs a
   person". Press Send to Bob. Read the modal aloud: items, branch name, cost. Approve. Show
   the Output channel streaming. The diff opens. Tests show 226 passed. Press Keep, show the
   draft PR. Then, optionally, repeat and press Discard to show the branch vanish.
7. **Release tab.** Since the last tag, commits, changed functions with readiness bars, the
   verdict, and Copy release notes.

If anything goes wrong live, the `npm run smoke` output is a safe fallback to show the same
scenarios running.

---

## 9. Suggested slide order

1. Title: "Bob Readiness. See where Bob is sure but wrong."
2. The problem: AI assistants are confident whether or not they are right. Developers cannot tell which is which.
3. Blindspot in one diagram: exam, engine, two files, plugin. Highlight the plugin box.
4. What the developer sees: one screenshot each of Explorer colouring, editor highlight with hover, side panel.
5. The readiness gate table (section 4).
6. The human in the loop flow, six steps (section 3c).
7. Safety rules (section 5).
8. How it is built: stack, one-feature-per-file, tests and smoke (section 6).
9. Status and next steps (section 7): Cartographer output, publish command, phase 7 with real Bob.
10. Live demo or recorded clip.

---

## 10. Where to look for more

- `plugin/README.md`: features, settings, install, demo workspace setup.
- `plugin/BUILD_PLAN.md`: the original spec, phase by phase, and the context file contract.
- `plugin/PROGRESS.md`: what is done, known issues, what still needs a hand check.
- `plugin/references/`: the four UI mockups the plugin was built to match.
- `docs/REPORT_SCHEMA.md` and `docs/PLUGIN_HANDOFF.md`: the two file contracts with the engine.
- `PREREGISTRATION.md` at the repo root: the experiment the whole project is built around.
