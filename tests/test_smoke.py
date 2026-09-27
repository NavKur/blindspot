import pytest

import cli
from blindspot import config


def test_config_values():
    assert config.N_TRAIN == 120 and config.N_TEST == 200
    assert config.CONDITIONS == ("C0", "C1", "C2")


@pytest.mark.parametrize("argv", [
    ["cartographer"],
])
def test_every_subcommand_parses(argv):
    assert cli.main(argv) == 0


def test_exam_mark_publish_parse():
    p = cli.build_parser()
    a = p.parse_args(["exam", "--condition", "C1", "--set", "pilot", "--repeat", "2"])
    assert (a.qset, a.condition, a.repeat, a.allow_ide) == ("pilot", "C1", 2, False)
    a = p.parse_args(["mark", "--condition", "C2", "--set", "train"])
    assert a.repeat == 1


def test_exam_refuses_without_api_key(monkeypatch):
    monkeypatch.delenv("BOB_API_KEY", raising=False)
    monkeypatch.delenv("BOB_BIN", raising=False)
    assert cli.main(["exam", "--condition", "C1", "--set", "pilot"]) == 2


def test_report_parses_and_needs_a_run():
    args = cli.build_parser().parse_args(["report", "--set", "train", "--condition", "C1"])
    assert (args.qset, args.condition, args.repeat) == ("train", "C1", 1)
    with pytest.raises(SystemExit):
        cli.main(["report"])          # set and condition are required


def test_bad_condition_rejected():
    with pytest.raises(SystemExit):
        cli.main(["exam", "--condition", "C9", "--set", "test"])


def test_bobignore_hides_answer_keys():
    lines = {l.strip() for l in (config.ROOT / ".bobignore").read_text().splitlines()
             if l.strip() and not l.startswith("#")}
    for required in ("exams/", "results/", ".cache/", ".env"):
        assert required in lines, f".bobignore must contain {required}"
    assert config.EXAMS_DIR.name + "/" in lines and config.RESULTS_DIR.name + "/" in lines
