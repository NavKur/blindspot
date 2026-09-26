# Kickoff prompt for Claude Code

Open a terminal in the extension/ folder, start Claude Code, and paste everything in the box.

```
Read CLAUDE.md and BUILD_PLAN.md fully. Then open every image in references/ one by one
and read references/README.md. Before writing any code, reply with a short summary of:
(1) what the extension does, (2) what each reference image shows and the key UI details
you will copy from it, and (3) your build order. Then, without waiting for me, build the
whole extension, phases 0 to 6 of BUILD_PLAN.md, following CLAUDE.md. Set up the demo
workspace at ../demo-tinydb as described in CLAUDE.md. After every step run build, tests
and lint and fix all failures. Keep PROGRESS.md updated. Commit once at the end of each
phase. Never call real Bob; use scripts/fake-bob.js. When phase 6 is done, package the
.vsix and give me a short checklist of what to test by hand in Bob IDE.
```

If Claude Code stops early (for example the session runs out of context), start a new
session and paste:

```
Read CLAUDE.md, BUILD_PLAN.md, references/README.md and PROGRESS.md. Continue building
from where PROGRESS.md says you stopped, following the same rules.
```

Things only you can do (in parallel or afterwards):
1. BUILD_PLAN.md section 4, go/no-go with real Bob: check headless Bob can edit a file on
   disk, and put the exact command into the setting bobReadiness.bobCommand.
2. Install the packaged .vsix in Bob IDE (Extensions, Install from VSIX) and click through
   the checklist Claude Code gives you.
3. Phase 7: switch useFakeBob off, run one real approval and one onboarding question, and
   record them for the video.
