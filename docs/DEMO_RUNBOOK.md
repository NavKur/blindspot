# Demo runbook: real Bob, real exam data, and what to record

For Aziz. Everything below is prepared; you only open folders in Bob IDE and click. Written on
27 September 2026 after the C1 and C2 TEST runs were published.

## What is already set up

| Thing | Where | State |
|---|---|---|
| Plugin package | `plugin/bob-readiness-0.0.1.vsix` | Built from the merged branch, 100 unit tests and the smoke script passing |
| Presentation copy of tinydb | `presentation-tinydb/` | Clone of the examined commit `1e39ad3`, branch `main`, tag `v4.9.0`, own `.venv` (219 tests pass), one commit with the demo settings |
| Real exam context | `presentation-tinydb/.bob/context/readiness.json`, `.bob/rules/readiness-context.md`, `AGENTS.md`, `.bob/blindspot/` | Published from `test_C1_r1` (Bob before Blindspot's notes: 89 percent, 22 wrong answers). Listed in `.git/info/exclude`, so the tree is clean |
| Real Bob settings | `presentation-tinydb/.vscode/settings.json` | Fake Bob off, headless command from the go/no-go test with edits allowed, test command on the copy's `.venv`, session budget 2 Bobcoins |
| Reset script | `plugin/scripts/demo-reset.sh [run]` | Back to `main`, Bob branches deleted, context republished (default `test_C1_r1`) |

Not touched: `target/tinydb` (the examined checkout, keep it for `cli.py target --check`) and
`demo-tinydb` (the fake Bob fixture the smoke script uses). Never point Bob at `target/tinydb`.

## Before you start (once)

1. Install the plugin: Bob IDE, Extensions view, the "..." menu, "Install from VSIX",
   `plugin/bob-readiness-0.0.1.vsix`. Reload when asked.
2. Make sure Bob can be called headless from the folder Bob IDE inherits its environment from.
   The plugin does not read `.env`; it spawns `bob` with the environment Bob IDE was started with.
   Test in a terminal first, then start Bob IDE from that same terminal:

       cd /Users/zyzzmac/blindspot/presentation-tinydb
       bob run --format json --trust --accept-license --max-turns 1 --max-cost 0.1 "Reply with the single word ok"

   You want one JSON line with `"status": "success"` and a `session_costs` number. If it asks
   for a key, export `BOB_API_KEY` in that terminal and start Bob IDE from it.
3. Open the folder `presentation-tinydb` in Bob IDE (File, Open Folder). Nothing else.

## The test, in order

Each step says what to click, what should happen, and what to record. Record with a screen
recording of the whole IDE window; take stills where marked (photo).

### Step 1. Passive features, no Bobcoins

- Explorer: `tinydb/operations.py` and `tinydb/__init__.py` carry the red `!` badge, the other
  tinydb files are tinted green to yellow, `README.rst` is neutral. (photo)
- Open `tinydb/operations.py`. `subtract` (line 36) and `decrement` (line 66) are red with the
  dimmed note on the def line. Hover `subtract`: the card says Bob answered "no" at 80 percent to
  whether the function exists, and that the truth is yes. (photo of the hover)
- Status bar: "Blindspot 89% C1", the readiness figure, and the warning "Bob: confidently wrong
  here N times" while `operations.py` is active. Toggle "Readiness: Off" and back with Cmd+Alt+R.
- Problems panel: 19 entries from Bob Readiness. Click the light bulb on one to show the quick fixes.
- Side panel, Exam tab: the notice that it is reading published copies, run `test_C1_r1`,
  89 percent with the interval 84 to 93, 6 confidently wrong, reliability bins, modules worst
  first (`tinydb/__init__.py`, `operations.py`). Compare runs `test_C1_r1` against `test_C2_r1`:
  storages +7, table +8, database +10, utils +8 points. (photo of the comparison)
- Heatmap tab: files over the four runs, functions by file with five red squares.
- Review tab: the rows. Three are "Bob with notes, review needed" (F004, F011, F014 below); the
  rest are "Needs a person" with the checkbox disabled. (photo)

Record: that every surface loaded from the real C1 data, and anything that looked wrong.

### Step 2. Bob reads the published context on its own (a few cents)

Open Bob's chat in the IDE (not the plugin) and ask, word for word:

    Does tinydb/__init__.py contain an import from tinydb.table? Answer yes or no and say where you got the answer.

In the closed-book exam Bob said yes at 90 percent. The correct answer is no, and the correction
is in `.bob/rules/readiness-context.md`, which Bob loads from `.bob/rules` automatically. A
second good one:

    Does JSONStorage.close in tinydb/storages.py call write()? Answer yes or no.

Correct answer: no (Bob said yes at 85 percent). Optional: right click `tinydb/storages.py`,
"Copy Bob Context for This File", paste it into the chat as a preamble and ask again.

Record: Bob's answers, whether it mentioned the readiness notes, and the cost shown by Bob.

### Step 3. Onboarding chat through the plugin (about one Bobcoin)

Onboarding tab. Pick the preset "new to the repo" and ask the first suggested question, or ask
"How do queries work in this repository?". A pending row appears, then the answer with the cost
label "Answered by Bob, X Bobcoins". Ask the same question again: "Answered before, free".
Check the Source Control view: no changes.

Record: the answer, the cost, the free repeat, and that the tree stayed clean.

### Step 4. Send to Bob, approve, keep (the centrepiece, about one Bobcoin)

The three findings the gate allows, all "with notes":

| Id | Function | What Bob got wrong | Readiness |
|---|---|---|---|
| F004 | `tinydb/storages.py` `JSONStorage.close` (lines 122 to 123) | Believed `close()` calls `write()`; it does not | 75 percent |
| F011 | `tinydb/storages.py` `JSONStorage.write` (lines 142 to 161) | Believed it does not raise `IOError`; it does | 83 percent |
| F014 | `tinydb/table.py` `Table.upsert` (lines 560 to 600) | Believed it does not raise `ValueError`; it does | 67 percent |

1. Review tab: tick F004 and F011 (same file, cheapest run). Try to tick a "Needs a person" row:
   it is disabled and a message explains why. (photo)
2. Footer shows "Selected: 2" and the estimate. Press "Send to Bob" (or Cmd+Alt+B).
3. Modal: two items, branch `bob/readiness-<date>-<time>`, estimated cost, "Session so far 0.0 of
   a 2.0 Bobcoin budget". Read it aloud on the recording. (photo) Press "Approve and run".
4. Output channel "Bob Readiness" opens and streams: the branch, "Bob: reading
   .bob/rules/readiness-context.md", the bob command, Bob's lines, the cost.
5. When Bob finishes: the panel lists changed files with +/- counts, the diff of the first file
   opens, then "Running tests", then "Tests passed" (219) or "Tests failed" with the output.
   (photo of the diff and the test box)
6. Press "Keep changes". The commit lands on the branch and a draft pull request is offered. With
   no GitHub CLI the title and body go to the clipboard and open in an editor. (photo)
7. Source Control: you are on the `bob/readiness-...` branch with one commit. Do not push it.

Record, this is the go/no-go evidence `plugin/docs/gonogo.md` still lists as open:

- the exact `bobCommand` that worked (copy from the Output channel),
- that Bob edited files on disk (the diff), and what it changed,
- the cost of the call from the Output channel line "Bob: done. Cost X Bobcoins",
- the test result,
- how long Bob took.

### Step 5. Discard path (optional, another Bobcoin)

Run `plugin/scripts/demo-reset.sh` first, or wait one minute so the branch name differs. Tick
F014 alone, Send to Bob, approve, and this time press "Discard". Expect: back on `main`, the
branch gone, `tinydb/table.py` unchanged. Then tick something, make the tree dirty by editing any
file without committing, press Send to Bob: the plugin refuses with "the working tree has
uncommitted changes". Undo the edit.

Record: the refusal message and that Discard left nothing behind.

### Step 6. The before and after (no Bobcoins)

With the IDE still open, in a terminal at the repository root:

    .venv/bin/python cli.py publish --run test_C2_r1 --dest presentation-tinydb

Within a second the plugin reloads and a toast says what changed in the context (functions
improved, fewer sure but wrong). The status bar becomes "Blindspot 95% C2", the Explorer
loses red on `storages.py`, and the Review tab shrinks. Wrong answers fell from 22 to 10; the
same six files improved (storages 93 to 100, database 87 to 97, table 85 to 93, utils 88 to 96).
Publish `test_C1_r1` again to go back. (photo of the toast and the new status bar)

Record: the toast text and the two status bar values.

## What to write down afterwards

Fill in `plugin/docs/gonogo.md` (the three open boxes) and add a dated entry to
`plugin/PROGRESS.md` under a heading "Real Bob run, 27 September": command, cost per call,
files edited, tests, anything that failed. Attach the photos to the slides in
`plugin/docs/PRESENTATION_BRIEF.md` section 9. Update section 7 of that brief: the Cartographer
output, the publish command and the real exam data all exist now.

## If something goes wrong

| Symptom | Cause | Fix |
|---|---|---|
| Send to Bob says the tree has uncommitted changes | Something untracked in `presentation-tinydb` | `git -C presentation-tinydb status`; commit or delete it, or run the reset script |
| Output channel: Bob asks for a key or exits non zero | Bob IDE was not started from a terminal with `BOB_API_KEY` | Quit Bob IDE, export the key in a terminal, start Bob IDE from it |
| Bob finished but changed no files | Prompt too strict or Bob refused | Keep the run anyway (nothing to commit) and read Bob's summary in the panel; try one item at a time |
| Tests fail after Bob's edit | Bob broke something | That is a valid demo outcome: press Discard and show the branch vanish |
| Over budget message | Session budget of 2 Bobcoins reached | Raise `bobReadiness.sessionBudget` in `presentation-tinydb/.vscode/settings.json` |
| Nothing coloured, panel empty | Wrong folder open | Open `presentation-tinydb` itself, not the repository root |

To rehearse again from zero: `plugin/scripts/demo-reset.sh`.
