# Bob Readiness extension: instructions for Claude Code (autonomous mode)

## Your job
Build the whole VS Code extension described in BUILD_PLAN.md, phases 0 to 6, on your own.
Do not stop after each step to ask me. Keep going until phase 6 is finished or you are
genuinely blocked.

Before writing any UI code, open every image in references/ and read references/README.md.
The UI must match those images: layout, wording, colours and behaviour.

## What this is
A VS Code extension that runs inside IBM Bob IDE (a VS Code based editor). It reads a
context file (.bob/context/readiness.json) produced by a separate tool, and:
- highlights code where Bob is sure but wrong or only partly right, in any open file,
- shows hover cards, CodeLens actions and Problems panel entries,
- has a side panel with five tabs: Onboarding (chat), Review, Testing, Release, Modernize,
- lets a developer tick findings, approve in a modal, and send them to Bob, which edits the
  code on a new git branch, then runs the tests; the developer keeps or discards.

## How to work
1. Follow BUILD_PLAN.md phase by phase. The text in each step's grey box is your spec for
   that step. Section 2 (context file contract) is fixed: never add or rename fields.
2. After every step run: npm run build, npm test, npm run lint. Fix every failure before
   moving on. Write vitest unit tests for all pure logic (parsing, ranges, sorting, costs,
   verdict rules, prompt building).
3. Keep PROGRESS.md up to date after every step: what is done, what is next, known issues,
   and anything I must check by hand. If a session ends, the next session resumes from it.
4. Git: commit once at the end of each phase, with a short conventional message such as
   "feat: phase 2 highlighting, hovers, CodeLens and Problems panel". Ignore the per-step
   commit lines in BUILD_PLAN.md. Do not push.
5. If you are blocked on something only I can do (anything in Bob IDE itself, real Bob, the
   go/no-go checks), write it under "Needs Aziz" in PROGRESS.md, stub it cleanly, and carry on
   with the rest.
6. When phase 6 is done, run the full build, tests and packaging (npm run package), then
   reply with a short checklist of what I should click through by hand in Bob IDE.

## Hard rules
- TypeScript strict. Bundle with esbuild. Tests with vitest. Validate the context with zod.
- Never call real Bob. Development always uses scripts/fake-bob.js. The setting
  bobReadiness.useFakeBob defaults to true. Real Bob costs limited credits; I switch it myself.
- Bob only runs after explicit approval in a modal dialog.
- Bob only edits on a new branch named bob/readiness-<yyyymmdd-hhmm>. Refuse to start if the
  working tree has uncommitted changes.
- Findings with bob_allowed "no" can never be sent to Bob.
- No network calls except spawning the configured Bob command.
- Webview: strict Content Security Policy with a nonce, postMessage only, VS Code theme
  variables for colours so light and dark themes both work.
- Plain English UI text. No em dashes anywhere in UI text.
- Small modules: one feature per file in src/, as listed in BUILD_PLAN.md section 3.

## Demo workspace
The sample context is fixtures/readiness.sample.json with notes in
fixtures/readiness-context.sample.md. Its line numbers are placeholders until
scripts/fix-fixture-lines.py (phase 1, step 1.2) aligns them with a tinydb checkout at
../demo-tinydb. Clone it there yourself if it is missing (git clone
https://github.com/msiemens/tinydb ../demo-tinydb), run the script, and copy the files into
../demo-tinydb/.bob/context/readiness.json and ../demo-tinydb/.bob/rules/readiness-context.md.
Make ../demo-tinydb a git repo with one initial commit so the approval flow can create branches.

## Commands
npm install
npm run build        # esbuild bundle to dist/
npm test             # vitest
npm run lint
npm run package      # produces bob-readiness-<version>.vsix
