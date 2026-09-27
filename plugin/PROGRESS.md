# Progress

Resume rule: read CLAUDE.md, BUILD_PLAN.md, references/README.md and this file, then continue
from "Next".

## Done
- Phase 0: scaffold. package.json, tsconfig (strict), esbuild bundle, vitest, eslint flat config,
  .vscodeignore, .gitignore, .vscode/launch.json (opens ../demo-tinydb), hello command.
  npm run build / test / lint / package all pass. Packaging tested: bob-readiness-0.0.1.vsix.

- Phase 1: src/contract.ts (zod schema, types, labels), src/contextIndex.ts (pure lookups),
  src/contextStore.ts (load, validate, watch, one error popup, keeps last valid context),
  src/settings.ts, settings contributed in package.json. scripts/fix-fixture-lines.py aligned all
  20 functions and 10 findings with the tinydb checkout. Demo workspace ../demo-tinydb: cloned,
  branch renamed master to main, .bob/context/readiness.json and .bob/rules/readiness-context.md
  committed, .venv with tinydb, pytest, pytest-cov and pyyaml (226 tests pass),
  .vscode/settings.json sets testCommand to ".venv/bin/python -m pytest -q".

- Phase 2: src/ranges.ts (pure ranges per decoration type, inline hint text, clamping),
  src/decorations.ts (wrong red, part blue, finding gutter dot from media/finding.svg, dimmed
  after-line hint on the def line of wrong functions), src/hoverText.ts + src/hover.ts (hover
  cards with misconception, findings and Add to Bob queue command link), src/diagnostics.ts
  (Problems panel, high Warning, medium Information, low Hint), src/codelensText.ts +
  src/codelens.ts ("Add to Bob queue (N)" or "Needs a person", plus "Why Bob is unsure"),
  src/highlightState.ts (toggle in workspaceState), src/statusBar.ts (left toggle, right
  readiness and Bobcoins this session), src/queue.ts (shared selection in workspaceState,
  refuses bob_allowed no), src/session.ts, src/commands.ts. Everything follows the toggle.

- Phase 3: src/panel/state.ts (pure: sorting by severity then readiness, rows, header, footer),
  src/panel/html.ts (page with strict CSP, theme variables, tab strip, findings rows, footer,
  plus the render code for release, onboarding and run result views used by later phases),
  src/panel/PanelProvider.ts (WebviewViewProvider, postMessage only, remembers the active tab,
  extras hook for later features). Activity bar container "Bob Readiness" with media/icon.svg.
  Header shows session Bobcoins as "Bobcoins used" (tooltip has the study cost from the context).

- Phase 4: scripts/fake-bob.js (edits after FILE/LINE targets, canned onboarding answers,
  prints the recorded Bob JSON shape with cost 0.0; prompt from last argument or stdin),
  docs/gonogo.md (draft from results/gonogo.json, Aziz fills the rest), src/bobOutput.ts
  (result and cost parsing, command splitting), src/prompt.ts (one prompt for all findings,
  onboarding prompt, branch name, commit message), src/gitParse.ts + src/git.ts (isClean,
  createBranch, diffStat with untracked files, commitAll, discardAndReturn, tags, log, -U0
  ranges), src/shell.ts (streaming process runner with timeout and cancel), src/output.ts
  (timestamped Output channel), src/bobRunner.ts (10 minute timeout, cancel, session coin
  total), src/testRunner.ts, src/approval.ts (modal, clean tree check, branch, one prompt,
  progress notification, diff stats, tests, Keep or Discard, queue cleared). Integration test
  in test/git.test.ts runs real git plus fake Bob in a temp repo.

- Phase 5: src/releaseLogic.ts (pure: changed functions from -U0 ranges, changed files with
  readiness, fixed verdict rules, commit grouping Fixed/Added/Other, notes markdown),
  src/release.ts (reads git since the last tag or first commit, recomputes when the Release tab
  is shown, the context changes or a Bob run finishes; Run tests and Copy release notes).
  Verdict when tests have not run yet: "Ready, with items to check" asking to run them.

- Phase 6: src/onboardingLogic.ts (question normalisation, answer cache, cost labels, three
  suggested questions), src/onboarding.ts (setup lines, starter tasks, chat; runs Bob read-only
  with the onboarding prompt, caches answers in workspaceState, warns if the tree changed).
- scripts/smoke.js (npm run smoke): drives dist/extension.js against a stub of the VS Code API
  in a scratch copy of ../demo-tinydb with fake Bob. Covers activation, panel state, queue,
  CodeLens and hover commands, Release tab, onboarding chat and cache, approve + keep,
  branch name collision, approve + discard, dirty tree refusal and modal cancel. All pass.
- README.md: features, install from .vsix, settings, gate table, flow, development, demo setup.
- Packaged: bob-readiness-0.0.1.vsix (version bump to 0.1.0 is phase 7, by Aziz).

- 27 Sep: merged origin/main (report contract, simulated results, scan, stats, target lock),
  moved extension/ to plugin/ (main's .gitignore and .bobignore already expected that path).
  Added the report contract as a second data source: src/report/reportContract.ts (zod for
  report_latest.json and history.jsonl), reportLogic.ts (heat buckets, tree colouring rule,
  worst-first ordering, run comparison, history series, sparkline points), reportStore.ts
  (results folder with results/sim fallback, target root from target.lock.json, watching,
  per-run reports), treeDecorations.ts (FileDecorationProvider: red badge, heat colour, few
  answers marker, neutral when not examined), examFeature.ts + Exam tab in the panel (banner,
  overview, reliability, change over time, modules, worst entities, compare runs, Publish,
  reload), status bar "Blindspot 89% C2". Smoke script scenario 2 covers all of it against
  results/sim and target/tinydb. Python suite on the merged tree: 68 passed, 1 skipped.

- 27 Sep, developer workflow batch: Heatmap tab (src/heatmap.ts, heatmapFeature.ts: files over
  exam runs from history.jsonl, functions by file from the readiness context, GitHub style
  squares, click to jump); status bar warning while a risky file is active
  (activeFileWarning.ts) with an explanation dialog; "Copy Bob Context for This File"
  (fileContext.ts, fileCommands.ts, Cmd+Alt+C, editor and explorer menus); "Queue All Allowed
  Findings in This File"; Problems quick fixes (codeActions.ts); diff opens automatically after
  a run plus "Review all changes"; draft pull request on Keep (pullRequest.ts, GitHub CLI or
  clipboard plus untitled document); session Bobcoin budget (budget.ts, setting sessionBudget,
  refused before the modal, ignored with fake Bob); update toasts when the context or report is
  regenerated (changes.ts, updates.ts); onboarding question presets by role; tree colours from
  the readiness context for files the exam did not cover; keybindings; Getting Started
  walkthrough (media/walkthrough). Shared target root resolution (targetRoot.ts): the context
  file is looked up in target/<repo> then the workspace, study notes likewise (store.readNotes).
  Smoke scenario 2 now builds a temp copy of the repo layout with a fake, line-aligned readiness
  context next to results/sim and covers every feature above.

- 27 Sep, merged main with the finished experiment (real TEST runs, `cli.py publish`,
  Cartographer, analysis). Wired the two halves together: src/report/resultsLocation.ts (pure:
  results, results/sim, then .bob/blindspot lookup; engine root discovery by walking up to
  cli.py; publish command with the engine .venv and --dest), reportStore reads and watches all
  three places and reports `source`, the Exam tab says when it reads published copies, the
  Publish button runs in the engine folder from a target/tinydb workspace and reloads the
  reports afterwards, or explains when no engine is around. Engine side: publish adds `.bob/`
  and `AGENTS.md` to the target's .git/info/exclude so Send to Bob starts from a clean tree.
  Smoke scenario 3 covers target/tinydb as the workspace after a real `publish --sim`;
  test/publishedContext.test.ts validates what is really published in target/tinydb.

## Next
- Phase 7 (Aziz): go/no-go with real Bob, switch useFakeBob off for one approval and one
  onboarding question, screenshots, version 0.1.0, tag.

## Known issues
- Not yet run inside a real VS Code or Bob IDE window in this session (no display here). The
  smoke script stubs the VS Code API, so layout, colours, hover rendering and the modal must be
  checked by hand.
- Hover cards use <span style="color:var(--vscode-...)"> which VS Code allows in supportHtml
  markdown; if a Bob IDE build strips it, the text still shows, only without colour.
- The Release tab recomputes when the tab is shown, the context changes or a Bob run ends. New
  commits made in a terminal show up the next time the Release tab is opened.
- Onboarding with real Bob: the read-only guarantee relies on the prompt and on the flags in
  bobReadiness.bobCommand. Add Bob's flag that disables edits for onboarding if one exists.

## Needs Aziz
- New features by hand: Heatmap tab in both windows, status bar warning on tinydb/table.py,
  right click Copy Bob Context, quick fix light bulb on a Problems entry, the diff opening after
  a fake Bob run, "Create pull request" after Keep (clipboard path, no gh installed here), the
  Help, Welcome walkthrough. Check the heatmap squares are readable in the light theme.
- Exam tab by hand: open the repository root in Bob IDE after `python cli.py target`. The
  Explorer shows target/tinydb/tinydb/utils.py and __init__.py with a red badge, other tinydb
  files tinted by heat, operations.py with a "?" marker. The Exam tab shows the simulated
  banner, metrics, chart, modules, compare and Publish (which fails until step 23 exists).
- Phase 5 by hand: make two small commits touching tinydb/table.py in the demo workspace, open
  the Release tab: since v4.9.0, commits, changed functions, readiness bars, verdict and notes.
  Run tests shows 226 passed. Copy release notes puts markdown on the clipboard.
- Phase 4 by hand with fake Bob in the demo workspace: tick 2 findings, Send to Bob, approve;
  a bob/readiness-* branch exists, the files have "# fake-bob: reviewed", tests run, Keep commits.
  Repeat with Discard: back on main, branch gone. Dirty tree: refuses with a clear message.
- Phase 3 by hand: panel opens from the activity bar, tabs switch, dark and light themes look
  right, ticking in Review and Testing updates the shared footer, hover link and CodeLens tick
  the same items, selections survive a reload.
- Phase 2 by hand in the demo workspace: open tinydb/table.py, update() is red with a dimmed
  inline hint on the def line, search() blue, hover shows the card, CodeLens above update(),
  Problems panel lists 10 findings, status bar toggle hides everything.
- Install bob-readiness-<version>.vsix in Bob IDE and run "Bob Readiness: Hello" (phase 0 check).
- Go/no-go (BUILD_PLAN.md section 4): confirm the exact headless command and that Bob edits files
  on disk. Put the command in the bobReadiness.bobCommand setting. Recorded output shape from
  results/gonogo.json in the repo root: {"type":"result","status":"success","last_message":"...",
  "stats":{"session_costs":0.0096,...}}. The prompt was passed on stdin in that test.
