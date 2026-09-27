"""Step 12: the simulated examinee is deterministic, paired, clearly labelled and kept out of real results."""
import json
from datetime import datetime, timezone

from blindspot import config, simulate

NOW = datetime(2026, 9, 27, 12, 0, tzinfo=timezone.utc)


def fake_questions(n_per_module=40):
    qs = []
    for mod in ("tinydb.table", "tinydb.queries", "tinydb.storages", "tinydb.utils"):
        for i in range(n_per_module):
            qs.append({"id": f"{mod}-{i}", "module": mod, "path": mod.replace(".", "/") + ".py",
                       "entity": f"{mod}:f{i % 8}", "family": "calls", "type": "tf"})
    return qs


def test_same_seed_same_answers():
    qs = fake_questions()
    assert simulate.answer_questions(qs, "C1") == simulate.answer_questions(qs, "C1")


def test_answers_are_paired_across_conditions():
    qs = fake_questions()
    c0 = [a["correct"] for a in simulate.answer_questions(qs, "C0")]
    c1 = [a["correct"] for a in simulate.answer_questions(qs, "C1")]
    agree = sum(x == y for x, y in zip(c0, c1)) / len(qs)
    assert agree > 0.8                       # mostly concordant, like real repeated exams


def test_stated_p_in_range_and_marked_simulated():
    for a in simulate.answer_questions(fake_questions(), "C0"):
        assert 0.5 <= a["p"] <= 0.99 and a["simulated"] is True


def test_scenario_files_labelled_and_separate(tmp_path):
    out = tmp_path / "sim"
    res = simulate.run_scenario(fake_questions(), out_dir=out, now=NOW)
    latest = json.loads((out / "report_latest.json").read_text(encoding="utf-8"))
    assert latest["simulated"] is True and latest["run"]["condition"] == "C2"
    history = [json.loads(l) for l in (out / "history.jsonl").read_text(encoding="utf-8").splitlines()]
    assert [h["condition"] for h in history] == ["C0", "C1", "C2"]
    assert history[0]["generated_at"] < history[1]["generated_at"] < history[2]["generated_at"]
    assert all(h["simulated"] for h in history)
    assert res["targeted"] and len(res["targeted"]) <= config.MAX_CARTO_MODULES


def test_c2_improves_targeted_modules(tmp_path):
    res = simulate.run_scenario(fake_questions(80), out_dir=tmp_path / "sim", now=NOW)
    c1 = {m["module"]: m["accuracy"] for m in res["reports"]["C1"]["modules"]}
    c2 = {m["module"]: m["accuracy"] for m in res["reports"]["C2"]["modules"]}
    gains = [c2[m] - c1[m] for m in res["targeted"]]
    assert sum(gains) / len(gains) > 0.05


def test_rerun_does_not_duplicate_history(tmp_path):
    out = tmp_path / "sim"
    simulate.run_scenario(fake_questions(), out_dir=out, now=NOW)
    simulate.run_scenario(fake_questions(), out_dir=out, now=NOW)
    assert len((out / "history.jsonl").read_text(encoding="utf-8").splitlines()) == 3


def test_real_results_dir_is_not_touched():
    assert simulate.SIM_DIR != config.RESULTS_DIR / "marked"
    assert simulate.SIM_DIR.parent == config.RESULTS_DIR and simulate.SIM_DIR.name == "sim"
