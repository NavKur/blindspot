import pytest

import cli
from blindspot import config


def test_config_values():
    assert config.N_TRAIN == 120 and config.N_TEST == 200
    assert config.CONDITIONS == ("C0", "C1", "C2")


@pytest.mark.parametrize("argv", [
    ["exam", "--condition", "C1", "--set", "pilot"],
    ["mark", "--condition", "C1", "--set", "pilot"],
    ["report"],
    ["cartographer"],
])
def test_every_subcommand_parses(argv):
    assert cli.main(argv) == 0


def test_bad_condition_rejected():
    with pytest.raises(SystemExit):
        cli.main(["exam", "--condition", "C9", "--set", "test"])


def test_bobignore_hides_answer_keys():
    lines = {l.strip() for l in (config.ROOT / ".bobignore").read_text().splitlines()
             if l.strip() and not l.startswith("#")}
    for required in ("exams/", "results/", ".cache/", ".env"):
        assert required in lines, f".bobignore must contain {required}"
    assert config.EXAMS_DIR.name + "/" in lines and config.RESULTS_DIR.name + "/" in lines
