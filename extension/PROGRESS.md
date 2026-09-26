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

## Next
- Phase 4, step 4.1: scripts/fake-bob.js.

## Known issues
- none

## Needs Aziz
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
