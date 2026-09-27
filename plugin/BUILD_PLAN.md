# Bob Readiness extension: build plan

Owner: Aziz (extension). Partner: context manager (teammate).
Deadline: Sunday 27 September, 15:00 UTC (4pm UK). Aim to freeze features by Sunday 10am.

How to use this file (autonomous mode):
1. Put this folder at `plugin/` and open Claude Code inside it.
2. Paste the kickoff prompt from KICKOFF.md. Claude Code reads CLAUDE.md, this plan and the
   images in references/, then builds phases 0 to 6 on its own, testing as it goes and
   committing once per phase. Progress is tracked in PROGRESS.md.
3. The steps below are the spec for each part. The "Checks" lines tell Claude Code what to
   verify; anything that needs Bob IDE or real Bob is listed for you to do by hand at the end.
4. You do section 4 (go/no-go) and phase 7 (real Bob, packaging, demo) yourself.

---

## 1. What we are building

A VS Code extension, installed in IBM Bob IDE from a `.vsix` file.

| Feature | What the developer sees | Where the data comes from |
|---|---|---|
| Highlighting | Coloured line backgrounds, gutter markers and hover cards in any open file. A status bar button turns it on and off | Context file: functions and findings with line ranges |
| Problems panel | Every finding also appears in VS Code's Problems list | Context file findings |
| Side panel, Code review tab | Risky functions ranked, with Bob's misconception and a recommended fix | Findings of type `review_risk` |
| Side panel, Testing tab | Untested functions ranked by risk | Findings of type `test_gap` |
| Side panel, Release tab | Commits since the last tag, changed functions, readiness of changed areas, a release verdict, draft release notes | Computed by the extension from git plus the context file |
| Side panel, Modernization tab | Old code patterns per file and whether Bob may edit them | Findings of type `modernize` |
| Side panel, Onboarding tab | A chat for new developers, answered by Bob using the context | Bob headless, with the context summary |
| Human in the loop | Tick findings, see a confirmation with what will change and the rough cost, approve, Bob edits the code on a new branch, tests run, keep or discard | Bob headless in the workspace |

The readiness gate (applies everywhere):

| Readiness of the function | `bob_allowed` | What the extension does |
|---|---|---|
| 85% or more | `yes` | Can be sent to Bob |
| 65% to 84% | `with_notes` | Can be sent; the prompt includes the study notes and the result is flagged for review |
| Below 65% | `no` | Checkbox disabled, labelled "Needs a person" |

---

## 2. Context file contract (agree this with your teammate tonight)

Location in the target repo: `.bob/context/readiness.json`
Also written by the context manager: `.bob/rules/readiness-context.md` (a readable summary Bob loads automatically).

Line numbers are 1-based and inclusive. File paths are relative to the repo root with forward slashes.

```json
{
  "version": 1,
  "repo": { "name": "tinydb", "commit": "3f2a1c9", "generated_at": "2026-09-26T21:05:00Z" },
  "summary": {
    "readiness": 0.73,
    "questions": 160,
    "sure_but_wrong": 7,
    "bobcoins_spent": 14.2
  },
  "setup": { "install": ["pip install -e ."], "test": "pytest -q" },
  "notes_markdown_path": ".bob/rules/readiness-context.md",
  "files": [
    { "path": "tinydb/table.py", "readiness": 0.70, "status": "review", "imports": ["tinydb/utils.py", "tinydb/queries.py"] }
  ],
  "functions": [
    {
      "id": "tinydb/table.py::Table.update",
      "file": "tinydb/table.py",
      "name": "Table.update",
      "line_start": 380,
      "line_end": 452,
      "readiness": 0.25,
      "status": "wrong",
      "tested": true,
      "misconceptions": [
        { "believed": "update() raises ValueError when no condition is given",
          "truth": "It raises nothing: with no condition it updates every document",
          "confidence": 0.92 }
      ]
    }
  ],
  "findings": [
    {
      "id": "F001",
      "type": "review_risk",
      "severity": "high",
      "file": "tinydb/table.py",
      "line_start": 380,
      "line_end": 386,
      "function_id": "tinydb/table.py::Table.update",
      "title": "Bob was sure but wrong about update()",
      "detail": "Bob believed update() raises ValueError with no condition. It updates every document.",
      "recommendation": "Review any Bob change to update() closely. Add a test for the no-condition case.",
      "bob_allowed": "with_notes",
      "estimated_coins": 0.9
    }
  ],
  "starter_tasks": [
    { "title": "Add a test for MemoryStorage.write()", "file": "tinydb/storages.py", "why": "ready area, small function" }
  ]
}
```

Enums:
- `files[].status`: `ready` | `review` | `not_ready`
- `functions[].status`: `ok` | `part` | `wrong`
- `findings[].type`: `review_risk` | `test_gap` | `modernize` | `release_risk`
- `findings[].severity`: `high` | `medium` | `low`
- `findings[].bob_allowed`: `yes` | `with_notes` | `no`

Who produces what (default, change if you agree otherwise):
- Context manager: everything in the file, including test gaps (via coverage.py) and modernize findings (via ast).
- Extension: the Release tab is computed live from git plus this file. `release_risk` findings are optional.

---

## 3. Architecture of the extension

```
plugin/
  package.json            # contributes: commands, settings, views, status bar
  src/
    extension.ts          # activate(): wires everything together
    contract.ts           # zod schema + TypeScript types for the context file
    contextStore.ts       # finds, loads, validates, watches the context file
    decorations.ts        # line highlights + gutter icons, toggle on/off
    hover.ts              # hover cards for highlighted lines
    diagnostics.ts        # Problems panel entries
    codelens.ts           # "Add to Bob queue" above functions with findings
    queue.ts              # selected findings, persisted in workspaceState
    git.ts                # branch, diff, log, tags (child_process git)
    release.ts            # release tab data from git + context
    bobRunner.ts          # spawns Bob (or fake Bob), streams output, parses result
    approval.ts           # the human-in-the-loop flow
    onboarding.ts         # onboarding chat: prompt building, cache
    panel/
      PanelProvider.ts    # WebviewViewProvider for the side panel
      html.ts             # panel HTML/CSS/JS (tabs, lists, checkboxes, chat)
  media/                  # gutter icons (svg)
  scripts/
    fake-bob.js           # stand-in for Bob during development
    fix-fixture-lines.py  # rewrites fixture line numbers from the real tinydb code
  test/                   # vitest unit tests
  fixtures/
    readiness.sample.json # sample context file (given to you)
```

Settings (all under `bobReadiness.`):

| Setting | Default | Meaning |
|---|---|---|
| `contextPath` | `.bob/context/readiness.json` | Where the context file lives in the workspace |
| `highlightOnStartup` | `true` | Show highlights when the IDE opens |
| `bobCommand` | `bob run --format json` | Headless Bob command (exact flags from the go/no-go test) |
| `useFakeBob` | `true` | Use scripts/fake-bob.js instead of real Bob |
| `testCommand` | `pytest -q` | Run after Bob makes changes |
| `baseBranch` | `main` | Branch to return to when discarding |

The human-in-the-loop flow:

```
Developer ticks findings (panel checkboxes or CodeLens)
  -> "Send to Bob" button shows count and estimated coins
  -> Modal: "Bob will change N places in M files on a new branch
     bob/readiness-20260927-1015. Estimated cost about X Bobcoins. Approve?"
  -> Approve:
       1. check the working tree is clean (else stop and explain)
       2. create and switch to the new branch
       3. build ONE prompt for all selected findings (cheaper than one call each),
          including the readiness-context.md notes for with_notes items
       4. run Bob headless in the repo root, stream output to an Output channel
       5. show changed files (git diff --stat) in the panel
       6. run the test command, show pass/fail
       7. buttons: "Keep changes" (commit on the branch) or "Discard" (reset, back to base)
```

---

## 4. Go/no-go checks (do these before Phase 1, about 30 minutes)

Do these by hand in a terminal and in Bob IDE. Write the answers in `docs/gonogo.md`.

1. Bob IDE installs a VS Code extension from a `.vsix`. (You said yes. Re-check with the Phase 0 build.)
2. `bob run --help`: find the exact flags for JSON output, allowing file edits in headless mode, limiting turns and limiting cost. Put the exact command in the `bobCommand` setting.
3. In a scratch copy of tinydb, run one headless Bob task that edits one line. Confirm the file actually changed on disk. This is the most important check. If headless Bob cannot edit files, use the fallback in section 7.
4. Note the coin cost of that one call (from the JSON output or the Bob dashboard).

Commit: `docs: go/no-go results for headless Bob`.

---

## 5. Build steps with Claude Code prompts

Each step: paste the prompt, let Claude Code finish, run the checks, commit.
Push at the end of each phase.

### Phase 0: Scaffold (about 30 minutes)

**Step 0.1: project skeleton**

```
Read CLAUDE.md and BUILD_PLAN.md sections 1 to 3. Create the extension skeleton in this
folder (do not use yo code). package.json with name bob-readiness, displayName
"Bob Readiness", engines.vscode ^1.90.0, main dist/extension.js, activationEvents
onStartupFinished, scripts build/watch (esbuild), test (vitest), lint (eslint), package
(vsce package --no-dependencies). tsconfig strict. src/extension.ts with an activate()
that registers one command "bobReadiness.hello" showing an information message
"Bob Readiness is running". Add .vscodeignore, .gitignore, eslint config and a
.vscode/launch.json for the Extension Development Host. Install dependencies:
typescript, esbuild, vitest, eslint, @types/vscode, @types/node, zod, @vscode/vsce.
```

Checks:
- `npm run build` succeeds, `npm test` runs (no tests yet is fine).
- Press F5 in VS Code: the Extension Development Host opens; run "Bob Readiness: Hello".
- `npm run package` creates a `.vsix`. Install it in Bob IDE (Extensions, "Install from VSIX"). Run the Hello command there.

Commit: `chore: scaffold VS Code extension with esbuild and vitest`. Push.

### Phase 1: The contract (about 1 hour)

**Step 1.1: schema and loader**

```
Read BUILD_PLAN.md section 2 (Context file contract). Create src/contract.ts with a zod
schema and exported TypeScript types that match the contract exactly, including all
enums. Create src/contextStore.ts: finds the file at the bobReadiness.contextPath setting
in the first workspace folder, loads and validates it, exposes getContext(),
functionsForFile(relPath), findingsForFile(relPath), and an onDidChange event, and
watches the file so edits reload automatically. On validation failure, show ONE error
message listing the first 3 problems, and keep the last valid context. Add unit tests in
test/contract.test.ts using fixtures/readiness.sample.json (valid) and 3 broken copies
made inside the test (missing field, bad enum, line_end before line_start).
```

Checks: `npm test` passes. Add `"bobReadiness.contextPath"` to a test workspace settings and confirm a broken file shows one clear error.

Commit: `feat(contract): zod schema and context store with file watching`.

**Step 1.2: demo workspace and correct line numbers**

```
Create scripts/fix-fixture-lines.py. It takes the path to a tinydb checkout and the
fixture file, parses each Python file with ast, and rewrites line_start/line_end of every
function and finding in the fixture to the real line numbers of the named function
(finding ranges: start at the function's def line, end 6 lines later or at the function
end, whichever is first). Print any function it cannot find. Do not change anything else.
Then document in README.md how to set up the demo workspace:
git clone https://github.com/msiemens/tinydb ../demo-tinydb, run the script, copy the
fixture to ../demo-tinydb/.bob/context/readiness.json, and copy
fixtures/readiness-context.sample.md to ../demo-tinydb/.bob/rules/readiness-context.md.
Note: every line number in the sample fixture starts as a placeholder (1 to 2) until this
script has run.
```

Checks: run it; open `demo-tinydb/tinydb/table.py` and confirm the fixture's `Table.update` lines point at the real `def update`.

Commit: `chore: script to align fixture line numbers with the demo codebase`. Push.

### Phase 2: Highlighting in any file (about 1.5 hours)

**Step 2.1: decorations and toggle**

```
Create src/decorations.ts. Three decoration types: "wrong" (background
rgba(250,77,86,0.14), left border 3px solid #fa4d56, whole line), "part" (background
rgba(69,137,255,0.10), left border 3px solid #4589ff), "finding" (no background, a gutter
icon from media/finding.svg, overview ruler colour #f1c21b). Apply to every visible
editor: function ranges with status wrong or part, and findings' ranges get the finding
gutter icon. Update on editor change, document change and context change. Add a toggle:
command "bobReadiness.toggleHighlights" and a status bar item on the left showing
"$(eye) Readiness: On" or "$(eye-closed) Readiness: Off"; clicking it toggles. Remember
the state in workspaceState. Respect bobReadiness.highlightOnStartup. Create
media/finding.svg (a small filled circle). Unit test the pure function that turns a
context plus a file path into ranges per decoration type.
```

Checks: in the demo workspace, open `tinydb/table.py`: `update()` shows red, partly known functions blue. Toggle with the status bar. Open another file: highlights appear there too.

Commit: `feat(highlight): readiness decorations with status bar toggle`.

**Step 2.2: hover cards**

```
Create src/hover.ts, a HoverProvider for python files. When hovering a highlighted line,
show a MarkdownString with: the function name and readiness percentage; for wrong status,
"Bob was N% sure that <believed>. Actually: <truth>."; any findings on that line with
title and recommendation; and a command link "Add to Bob queue" that runs
bobReadiness.queueFinding with the finding id (disabled text "Needs a person" if
bob_allowed is no). Only show hovers when highlights are on.
```

Checks: hover over `update()`; the card matches the context; the link adds to the queue (use a temporary information message until the queue exists).

Commit: `feat(highlight): hover cards with misconceptions and recommendations`.

**Step 2.3: Problems panel and CodeLens**

```
Create src/diagnostics.ts: a DiagnosticCollection "Bob Readiness" with one diagnostic
per finding (high = Warning, medium = Information, low = Hint), source "Bob Readiness",
code = finding type. Create src/codelens.ts: above the first line of each function that
has findings, show "Add to Bob queue (N)" or "Needs a person" when bob_allowed is no.
Both follow the highlight toggle.
```

Checks: the Problems panel lists findings; clicking one jumps to the line; CodeLens shows above the right functions.

Commit: `feat(ide): Problems panel entries and CodeLens actions`. Push.

### Phase 3: The side panel (about 2.5 hours)

**Step 3.1: panel shell with five tabs**

```
Create src/panel/PanelProvider.ts (WebviewViewProvider) and src/panel/html.ts. Contribute
an activity bar container "Bob Readiness" with one webview view. The webview has five
tabs: Onboarding, Code review, Testing, Release, Modernization. Style it with VS Code
theme variables (var(--vscode-foreground), var(--vscode-editor-background),
var(--vscode-button-background) and so on) so it matches the IDE in dark and light,
sharp corners, 13px text, IBM Plex Sans if installed else the editor font. At the top:
repo name, overall readiness, sure-but-wrong count, and Bobcoins spent from the context
summary. Use a strict Content Security Policy with a nonce. Communicate with
postMessage only.
```

Checks: the panel opens from the activity bar; tabs switch; it looks right in dark and light themes.

Commit: `feat(panel): side panel with five tabs and summary header`.

**Step 3.2: findings tabs (Code review, Testing, Modernization)**

```
In the panel, render findings of type review_risk, test_gap and modernize in their tabs,
sorted by severity then readiness (lowest first). Each row: checkbox, severity marker,
function name, file:line, title, a one-line recommendation, a readiness gate label
("Bob can do this", "Bob with notes, review needed", "Needs a person"). Checkbox disabled
for bob_allowed no. Clicking a row opens the file at the line. Create src/queue.ts holding
selected finding ids in workspaceState; checkboxes, hover links and CodeLens all use it.
At the bottom of each findings tab: "Selected: N, estimated cost about X Bobcoins" and a
"Send to Bob" button (disabled when nothing is selected). Add unit tests for sorting and
cost totals.
```

Checks: tick items in two tabs; the total updates; hover link and CodeLens tick the same items; reload the IDE and selections persist.

Commit: `feat(panel): findings tabs with shared selection queue`. Push.

### Phase 4: Human in the loop, Bob makes the changes (about 2.5 hours)

**Step 4.1: fake Bob**

```
Create scripts/fake-bob.js, a Node script that stands in for headless Bob. It reads the
prompt from its last argument, finds lines like "FILE: <path> LINE: <n>" in the prompt,
appends a comment "# fake-bob: reviewed" after that line in each file, and prints JSON in
the same shape as real Bob's output recorded in docs/gonogo.md, including a cost field of
0.0. Exit code 0.
```

Commit: `test: fake Bob script for development`.

**Step 4.2: git helpers and Bob runner**

```
Create src/git.ts (child_process, cwd = workspace root): isClean(), currentBranch(),
createBranch(name), diffStat(), changedFiles(), commitAll(message), discardAndReturn(base),
logSinceLastTag(), lastTag(). Create src/bobRunner.ts: runBob(prompt) spawns
bobReadiness.bobCommand with the prompt as the last argument (or node scripts/fake-bob.js
when useFakeBob is true), cwd = workspace root, streams stdout/stderr to an Output channel
"Bob Readiness", has a 10 minute timeout and a cancel option, parses the JSON result and
cost, and returns { ok, cost, summary }. Add a running total of coins spent this session,
shown in the panel header. Unit test prompt parsing and cost parsing with recorded output.
```

Commit: `feat(bob): git helpers and headless Bob runner with output channel`.

**Step 4.3: approval flow**

```
Create src/approval.ts implementing the human-in-the-loop flow in BUILD_PLAN.md section 3.
"Send to Bob" opens a modal (showWarningMessage with modal: true) listing the number of
changes, files, the new branch name bob/readiness-<yyyymmdd-hhmm>, and the estimated cost,
with buttons "Approve and run" and "Cancel". On approve: refuse if the working tree is not
clean; create the branch; build ONE prompt that includes, for each selected finding:
"FILE: <path> LINE: <line_start>", the finding title, detail and recommendation, and for
with_notes items the contents of notes_markdown_path; tell Bob to change only what is
listed, keep public function names and parameters unchanged, and add or update tests
where the finding is a test_gap. Run Bob with a progress notification. Then show in the
panel: changed files with diff stats, then run testCommand and show pass/fail and the last
20 lines of output. Offer "Keep changes" (commitAll with a message listing finding ids)
and "Discard" (discardAndReturn to baseBranch). Clear the queue after keep or discard.
```

Checks, with fake Bob:
- Tick 2 findings, approve: a new branch exists, the 2 files have the fake comment, tests run, Keep commits on the branch.
- Repeat and Discard: you are back on the base branch with no changes.
- Try with a dirty working tree: it refuses with a clear message.

Commit: `feat(hitl): approve, run Bob on a new branch, test, keep or discard`. Push.

### Phase 5: Release tab (about 1 hour)

**Step 5.1: release data**

```
Create src/release.ts. Using git.ts: last tag (or first commit if none), commits since then
(subject lines), changed files, and changed line ranges per file (git diff -U0 base..HEAD).
Map changed lines to functions using the context file. Compute: number of commits, changed
functions, readiness of each changed file, and a verdict with fixed rules: "Ready to
release" if tests pass and no changed function has status wrong; "Ready, with items to
check" if a changed function has status wrong or part but is tested; "Not ready" if a
changed function has status wrong and tested is false. Draft release notes grouped as
Fixed (subjects starting fix), Added (feat), Other, from commit subjects. Render all of it
in the Release tab with a "Run tests" button that uses testCommand. Unit test the verdict
rules and the commit grouping.
```

Checks: in the demo workspace, make two small commits touching `table.py`, then open the Release tab: commits, changed functions and verdict make sense.

Commit: `feat(release): release readiness from git and the context file`. Push.

### Phase 6: Onboarding chat (about 1.5 hours)

**Step 6.1: chat tab**

```
Create src/onboarding.ts and the Onboarding tab UI. The tab shows: setup steps from
context.setup, starter tasks from context.starter_tasks (each opens its file), and a chat.
Each question builds a prompt: "You are helping a new developer understand this repository.
Answer in plain English in under 150 words. Do not edit any files." plus the contents of
notes_markdown_path, plus a short architecture list from context.files, plus the question.
Run it with bobRunner (read-only: never on a new branch, never modifies files). Show the
answer, the cost, and cache answers by question text in workspaceState so repeated
questions are free. Show 3 suggested questions as buttons. Add a notice under the input:
"Each new question costs about 1 Bobcoin".
```

Checks with fake Bob: questions return (fake) answers, repeated questions are instant and free.

Commit: `feat(onboarding): onboarding chat answered by Bob from the context`. Push.

### Phase 7: Real Bob, packaging and the demo (Sunday morning)

**Step 7.1: switch to real Bob, carefully**

Do by hand:
1. Set `bobReadiness.useFakeBob` to false and `bobCommand` to the command from the go/no-go.
2. Ask ONE onboarding question. Check the answer and the cost.
3. Tick ONE small, safe finding (a `test_gap` in a ready file). Approve. Check the branch, the diff and the tests.
4. Record both runs with the screen recorder for the video. Do not repeat them: coins are limited.

Commit: `chore: switch to real Bob for the demo run` (settings only).

**Step 7.2: package and polish**

```
Add a README.md for the extension: what it does, screenshots placeholders, install from
.vsix, settings table, the readiness gate table, and how the human-in-the-loop flow works.
Bump version to 0.1.0 and run npm run package. Fix any lint errors.
```

Checks: install the new `.vsix` in Bob IDE from scratch and click through every tab.

Commit: `docs: extension README and 0.1.0 package`. Tag: `git tag v0.1.0`. Push with tags.

---

## 6. Where Bob is used on your side (for judging) and the coin budget

The extension is built with Claude Code, so Bob's value on your side is at runtime and in review. Keep screenshots of every Bob task in `bob_sessions/`.

| Bob use | When | Coins |
|---|---|---|
| Headless Bob implementing approved findings (the core demo) | Phase 7, one run | about 1 to 2 |
| Onboarding chat questions | Phase 7, one or two questions | about 1 to 2 |
| Bob code review of the extension in Bob IDE (Review workflow) | Sunday morning, once | about 1 |
| Bob writes the final commit message and PR description | Sunday | small |

Team budget of 40 coins, suggested split:

| Use | Coins |
|---|---|
| Context manager: testing Bob and refining (teammate) | about 22 |
| Extension demo runs (approval + onboarding) | about 4 |
| Bob code review and PR | about 2 |
| Go/no-go checks | about 2 |
| Reserve | about 10 |

Rules to protect coins:
- Develop everything with `useFakeBob: true`.
- One Bob call per approval, batching all selected findings into one prompt.
- Cache onboarding answers.
- The context manager's run is expensive: run it once for the demo and commit the resulting `readiness.json`.

---

## 7. Fallbacks

| Problem | Fallback |
|---|---|
| Headless Bob cannot edit files | On approve, the extension writes the full prompt to `.bob/tasks/<branch>.md`, copies it to the clipboard, opens Bob's chat, and tells the developer to paste it. Bob's own approve-each-edit step then applies. Still human in the loop. |
| Bob IDE extension install fails | Run the extension in VS Code's Extension Development Host for the demo, and use Bob IDE for the Bob parts. Say so in the video. |
| Context manager not ready in time | Keep using `fixtures/readiness.sample.json` (aligned to real line numbers) and label it sample data. |
| Tests fail after Bob's change | That is a valid demo outcome: show the failure and the Discard button. |

---

## 8. Commit and push rhythm

- Commit after every step whose checks pass (about 18 commits over the build).
- Push at the end of every phase (about 8 pushes).
- Conventional commit messages: `feat(scope): ...`, `fix(scope): ...`, `test: ...`, `docs: ...`, `chore: ...`.
- Never commit with failing tests. If a step breaks something, fix it before committing, as `fix(scope): ...`.
- Freeze features at Sunday 10am. After that only `fix:` and `docs:` commits.

## 9. Final checklist (Sunday)

- [ ] `.vsix` installs cleanly in Bob IDE
- [ ] Highlighting toggles on and off in any file
- [ ] Hover cards, Problems panel and CodeLens all work
- [ ] Code review, Testing and Modernization tabs list findings; selection works everywhere
- [ ] One real approval recorded: branch created, change made, tests run, kept or discarded
- [ ] Release tab shows a verdict and draft notes
- [ ] One real onboarding answer recorded
- [ ] README with screenshots
- [ ] All Bob task screenshots in `bob_sessions/`
