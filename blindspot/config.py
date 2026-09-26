"""Central settings. Change values here, not scattered through the code."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET_DIR = ROOT / "target" / "tinydb"   # demo repo, fetched by `python cli.py target` (step 2)
TARGET_LOCK = ROOT / "target.lock.json"  # records exactly which commit we tested (committed)
EXAMS_DIR = ROOT / "exams"            # questions + true answers; hidden from Bob by .bobignore
RESULTS_DIR = ROOT / "results"        # answers + stats JSON, committed; hidden from Bob
CACHE_DIR = ROOT / ".cache" / "bob"   # cached Bob responses, not committed
BOB_DIR = ROOT / ".bob"               # custom modes, Skill, rules

# The values below are fixed by PREREGISTRATION.md. tests/test_prereg.py fails if they drift.
SEED = 7                  # exam generation + TRAIN/TEST split seed
BATCH_SIZE = 20           # questions per bob run call
N_TRAIN = 120
N_TEST = 200
REPEATS = 3               # times each condition sits the TEST set (repeat 1 is the primary analysis)
ALPHA = 0.05
CONFIDENT_P = 0.8         # "confident" means stated probability >= this
RED_ACC_LOWER = 0.60      # module is red if the Wilson lower bound on accuracy is below this ...
RED_CW_RATE = 0.20        # ... or its confidently-wrong rate is above this
MAX_CARTO_MODULES = 5
N_BOOT = 2000             # bootstrap resamples (paired and cluster)
CONDITIONS = ("C0", "C1", "C2")   # no context | /init AGENTS.md | /init + Blindspot context

# Exam scope (step 6). Modules with fewer lines than this, or listed here, get no questions.
MIN_MODULE_LOC = 10
EXCLUDE_MODULES = ("tinydb.mypy_plugin",)   # type-checker add-on, not part of the library's behaviour

# Exam composition (step 8). Keys are (family, stratum); values are how many questions to draw.
# True/false families are 50/50 by construction. Totals must equal N_TRAIN + N_TEST.
QUOTAS = {
    ("imports", "true"): 11, ("imports", "false"): 11,
    ("raises", "true"): 15, ("raises", "false"): 15,
    ("defaults", "value"): 21,
    ("calls", "true"): 55, ("calls", "false"): 55,
    ("exists", "real"): 69,
    ("exists", "misplaced"): 27, ("exists", "near_miss"): 27, ("exists", "mutation"): 14,
}
