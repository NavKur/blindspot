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
CONDITIONS = ("C0", "C1", "C2")   # no context | /init AGENTS.md | /init + Blindspot context
