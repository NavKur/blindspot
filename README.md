# Blindspot

**Find where your AI coding agent is confidently wrong about your code, fix it with targeted context, and prove the fix works.**

Built for the IBM Bob 2.0 Hackathon (lablab.ai, September 2026). Bob is the examinee, Bob writes the baseline context,
a custom Bob mode writes the fix, and a plugin shows everything inside Bob IDE.

---

## The result

On a sealed, pre-registered test of 200 questions about [tinydb](https://github.com/msiemens/tinydb) v4.9.0,
Bob answered closed book under two conditions:

| Condition | Context Bob had | Accuracy (95% interval) | Wrong answers | Brier score |
|---|---|---|---|---|
| C1 | `AGENTS.md` written by Bob's own `/init` | 89.0% (83.9 to 92.6) | 22 | 0.086 |
| **C2** | the same file **plus Blindspot's targeted notes** | **95.0% (91.0 to 97.3)** | **10** | **0.041** |

- Bob changed its answer on 22 questions between the conditions. Blindspot's notes **fixed 17 and broke 5**.
- Exact McNemar test: **p = 0.017** (pre-registered threshold 0.05).
- Mistakes more than halved (22 to 10) and calibration improved (Brier halved, Holm-corrected p < 0.001).
- Robustness check grouping questions by function: +6.0 points (2.1 to 10.1).

What did **not** improve: the confidently wrong rate stayed at 3.0%. The notes fixed Bob's uncertain mistakes, not its
most confident ones. Limits are listed [below](#limitations).

Cost: about 0.01 Bobcoins per batch of 20 questions. Every call's cost is logged in `results/costs.jsonl`.

---

## Why this matters

Teams hand real work to AI agents without knowing how well the agent understands *their* code. Agents rarely say
"I don't know"; a confident wrong answer becomes a confident wrong change. The usual fix is a context file like
`AGENTS.md`, but nobody measures whether it helps, and research on repository context files suggests it often does not
([arXiv 2602.11988](https://arxiv.org/abs/2602.11988)).

Blindspot measures instead of guessing.

---

## How it works

```
 your repo ──scan (Python ast)──> exam of machine-checked questions
                                        │
                     Bob answers closed book, with a confidence per answer
                                        │
                          marked automatically against the code
                                        │
            ┌───────────────────────────┼─────────────────────────────┐
     per-file / per-function     Cartographer (custom Bob mode)    sealed TEST set
     accuracy, calibration,      reads only the weak modules,      C1 vs C2, exact McNemar,
     confidently wrong rate      writes targeted notes             pre-registered
            │                           │                             │
            └────────── publish ────────┴──> AGENTS.md, .bob/rules, plugin in Bob IDE
```

1. **Exam.** Five question families generated from the syntax tree, no AI involved: imports, whether a name exists
   (including plausible fakes), default values, exceptions raised, and calls made. Every truth comes from the code.
   2,268 candidates for tinydb, balanced 50/50 on yes/no questions.
2. **Closed-book Bob.** Headless Bob Shell with every tool group disabled and a custom `blindspot-examinee` mode. A
   go/no-go test proved Bob could not read a planted secret file while `AGENTS.md` still reached it.
3. **Measure.** Accuracy with Wilson intervals, Brier score, calibration bins, and the confidently wrong rate
   (wrong with p ≥ 0.8), per file, folder and function.
4. **Fix.** The `blindspot-cartographer` Bob mode reads only the modules where Bob made mistakes on the TRAIN set and
   writes short, verified facts aimed at those mistakes. They are appended to Bob's own `/init` file to form C2.
5. **Prove.** A sealed TEST set Bob and the Cartographer never saw, the same questions under both conditions, and a
   pre-registered exact McNemar test.
6. **Share.** `publish` writes the findings where every agent and developer will see them, and the plugin shows them.

---

## The Bob Readiness plugin (Bob IDE)

A VS Code extension in [`plugin/`](plugin/), installed in Bob IDE from a `.vsix`.

- **File tree heatmap:** files coloured by how well Bob understands them, red badge on problem modules.
- **In the editor:** functions where Bob was sure but wrong are highlighted, with hover cards showing what Bob
  believed and what is actually true. CodeLens and Problems panel entries for every finding.
- **Exam tab:** accuracy, calibration, change over time, modules ranked worst first, and C1 vs C2 comparison.
- **Human in the loop:** tick findings, approve, and Bob fixes them on a new branch; tests run; keep or discard.
  Areas where Bob is weak are gated as "Needs a person".

See [`plugin/README.md`](plugin/README.md) for install and settings.

---

## Quick start

Requires Python 3.10+, git, and (for real runs) [IBM Bob Shell](https://bob.ibm.com) with an API key.

```bash
python -m venv .venv
.venv\Scripts\activate            # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
pytest -q                          # about 97 tests, no Bob calls

python cli.py target               # fetch tinydb at the pinned commit into target/tinydb
python cli.py publish --run test_C1_r1   # write the real results into target/tinydb
```

Then open `target/tinydb` in Bob IDE with the plugin installed.

To explore without Bob: `python cli.py simulate` and `python cli.py publish --sim` (clearly labelled fake data).

---

## Reproducing the experiment

Bob calls must run from a standalone terminal (not the Bob IDE terminal) with `BOB_API_KEY` set.

```bash
python cli.py target                              # pinned tinydb v4.9.0
python cli.py scan && python cli.py generate && python cli.py split   # TEST SHA-256 must be 4bd2c649...
python cli.py exam --condition C0 --set pilot     # pipeline check
# C1: run /init in Bob IDE on a clean target/tinydb, move AGENTS.md to contexts/C1/AGENTS.md
python cli.py exam --condition C1 --set train
python cli.py cartographer                        # writes contexts/C2/AGENTS.md
git tag freeze                                    # TEST is locked until this exists
python cli.py exam --condition C1 --set test
python cli.py exam --condition C2 --set test
python cli.py analyze                             # results/final_analysis.json
```

Every Bob reply is cached and saved in `results/raw/` for audit, and every call's cost is in `results/costs.jsonl`.
Exams run in fresh copies of the target with all agent files removed, so nothing published can leak into an exam.

---

## Doing it scientifically

- **Pre-registered.** [`PREREGISTRATION.md`](PREREGISTRATION.md) fixed the question, conditions, test, thresholds and
  sample sizes before any result existed; its git timestamp is the proof. A test fails if the code's parameters drift from it.
- **Sealed test set.** 120 TRAIN and 200 TEST questions; TEST is hash-sealed and the runner refuses it before the `freeze` tag.
- **Paired design.** Identical questions, batches and prompts across conditions; only the context file differs.
- **Deviations logged, not hidden.** Four changes are recorded with reasons, all made before any TEST answer existed:
  one repeat instead of three (time), C2 delivered through `AGENTS.md` (the only channel proven closed book),
  red modules ranked worst first, and Cartographer targets chosen by actual TRAIN mistakes because the red rule was
  too blunt at small sample sizes.

---

## Limitations

- One repository, one run per condition.
- tinydb is popular; Bob scored 90% with no context at all, so it probably saw this code in training.
- C2 contains more text than C1 and there was no length-matched control, so part of the gain may come from more detail
  rather than from targeting.
- The confidently wrong rate did not improve.
- The plugin's "send to Bob" fix flow has been tested with a stand-in for Bob; the exam pipeline used real Bob throughout.
- Python codebases only, for now.

---

## Repository guide

| Path | What |
|---|---|
| `blindspot/` | Python engine: scan, question families, split, runner, marking, stats, report, Cartographer, analysis, publish |
| `cli.py` | All commands (`python cli.py --help`) |
| `plugin/` | Bob Readiness VS Code extension for Bob IDE |
| `exams/` | Generated questions and answer keys (hidden from Bob) |
| `contexts/` | C1 and C2 `AGENTS.md` files used in the experiment |
| `results/` | Every answer, raw Bob reply, report, cost and the final analysis |
| `docs/HOW_IT_WORKS.md` | Full technical walkthrough, file formats and rules |
| `docs/REPORT_SCHEMA.md` | Contract between the engine and the plugin |
| `PREREGISTRATION.md` | The experiment plan and deviations |

---

## Built with

IBM Bob IDE and Bob Shell (headless, custom modes, `/init`), Python (ast, numpy, scipy), TypeScript and the VS Code
extension API. Target codebase: [tinydb](https://github.com/msiemens/tinydb) (MIT).
