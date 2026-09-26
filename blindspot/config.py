"""Central settings. Change values here, not scattered through the code."""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TARGET_DIR = ROOT / "target"          # demo repo lives here (step 2)
EXAMS_DIR = ROOT / "exams"            # questions + true answers; hidden from Bob by .bobignore
RESULTS_DIR = ROOT / "results"        # answers + stats JSON, committed; hidden from Bob
CACHE_DIR = ROOT / ".cache" / "bob"   # cached Bob responses, not committed
BOB_DIR = ROOT / ".bob"               # custom modes, Skill, rules

SEED = 7                  # exam generation seed (fixed in PREREGISTRATION.md)
BATCH_SIZE = 20           # questions per bob run call
N_TRAIN = 120
N_TEST = 120
CONDITIONS = ("C0", "C1", "C2")   # no context | /init AGENTS.md | /init + Blindspot context
