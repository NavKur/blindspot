"""Step 11: per-module analysis, red rule, report contract and history."""
import json
from datetime import datetime, timezone

import pytest

from blindspot import report


def answer(module, entity, correct, p, family="calls", excluded=False):
    path = module.replace(".", "/") + ".py"
    return {"id": f"q{entity}{correct}{p}", "module": module, "path": path, "entity": entity,
            "family": family, "correct": correct, "p": p, "excluded": excluded}


def sample():
    rows = []
    # tinydb.table: good and humble -> not red
    rows += [answer("tinydb.table", "Table.insert", 1, 0.9) for _ in range(28)]
    rows += [answer("tinydb.table", "Table.insert", 0, 0.6) for _ in range(2)]
    # tinydb.queries: confidently wrong -> red
    rows += [answer("tinydb.queries", "Query.test", 1, 0.9) for _ in range(20)]
    rows += [answer("tinydb.queries", "Query.test", 0, 0.95) for _ in range(10)]
    # one excluded answer (tool use) must be counted but not scored
    rows.append(answer("tinydb.table", "Table.insert", 1, 0.9, excluded=True))
    return rows


NOW = datetime(2026, 9, 27, 12, 0, tzinfo=timezone.utc)


def test_red_rule_and_counts():
    rep = report.build_report(sample(), "train", "C1", 1, commit="abc", now=NOW)
    mods = {m["module"]: m for m in rep["modules"]}
    assert rep["counts"] == {"answers": 61, "scored": 60, "excluded": 1}
    assert not mods["tinydb.table"]["red"]
    assert mods["tinydb.queries"]["red"]
    assert any("confidently-wrong" in r for r in mods["tinydb.queries"]["red_reasons"])
    assert rep["red_modules"] == ["tinydb.queries"]


def test_heat_orders_worse_modules_higher():
    rep = report.build_report(sample(), "train", "C1", 1, now=NOW)
    mods = {m["module"]: m for m in rep["modules"]}
    assert 0 <= mods["tinydb.table"]["heat"] < mods["tinydb.queries"]["heat"] <= 1


def test_low_accuracy_bound_alone_makes_red():
    rows = [answer("tinydb.utils", "f", 1, 0.5) for _ in range(4)] + [answer("tinydb.utils", "f", 0, 0.5) for _ in range(4)]
    rep = report.build_report(rows, "train", "C1", 1, now=NOW)
    m = rep["modules"][0]
    assert m["red"] and m["low_n"] and m["cw_rate"] == 0
    assert "accuracy lower bound" in m["red_reasons"][0]


def test_directories_aggregate_from_answers_not_averages():
    rep = report.build_report(sample(), "train", "C1", 1, now=NOW)
    top = {d["path"]: d for d in rep["directories"]}["tinydb"]
    assert top["n"] == 60 and top["accuracy"] == pytest.approx(48 / 60)


def test_worst_entities_sorted_by_confidently_wrong():
    rep = report.build_report(sample(), "train", "C1", 1, now=NOW)
    assert rep["worst_entities"][0]["entity"] == "Query.test"
    assert rep["worst_entities"][0]["cw_count"] == 10


def test_write_report_files_and_history_appends(tmp_path):
    rep = report.build_report(sample(), "train", "C1", 1, commit="abc", now=NOW)
    paths = report.write_report(rep, results_dir=tmp_path)
    report.write_report(rep, results_dir=tmp_path)
    assert json.loads(paths["latest"].read_text(encoding="utf-8"))["schema_version"] == report.SCHEMA_VERSION
    lines = paths["history"].read_text(encoding="utf-8").splitlines()
    assert len(lines) == 2
    snap = json.loads(lines[0])
    assert snap["run"] == "train_C1_r1" and "tinydb/queries.py" in snap["modules"]
    assert b"\r\n" not in paths["report"].read_bytes()


def test_no_scored_answers_is_an_error():
    with pytest.raises(ValueError):
        report.build_report([answer("m", "e", 1, 0.9, excluded=True)], "train", "C1", 1)
