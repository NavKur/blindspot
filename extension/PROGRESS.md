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

## Next
- Phase 2, step 2.1: src/decorations.ts, media/finding.svg, status bar toggle.

## Known issues
- none

## Needs Aziz
- Install bob-readiness-<version>.vsix in Bob IDE and run "Bob Readiness: Hello" (phase 0 check).
- Go/no-go (BUILD_PLAN.md section 4): confirm the exact headless command and that Bob edits files
  on disk. Put the command in the bobReadiness.bobCommand setting. Recorded output shape from
  results/gonogo.json in the repo root: {"type":"result","status":"success","last_message":"...",
  "stats":{"session_costs":0.0096,...}}. The prompt was passed on stdin in that test.
