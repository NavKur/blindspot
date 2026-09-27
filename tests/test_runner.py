"""Step 15: runner with a fake Bob. No coins spent."""
import json
import sys

import pytest

from blindspot import config, gonogo, runner

QS = [{"id": f"q{i:02d}", "type": "tf", "text": f"Question {i}?", "module": "m", "path": "m.py",
       "entity": "m:f", "family": "calls", "truth": True} for i in range(25)]

FAKE = r'''
import json, re, sys
prompt = sys.stdin.read()
ids = re.findall(r"^\[(q\d+)\]", prompt, flags=re.M)
mode = "{mode}"
if mode == "half":
    ids = ids[: len(ids) // 2]
ans = [{{"id": i, "answer": True, "p": 0.9}} for i in ids]
tools = 1 if mode == "tools" else 0
print(json.dumps({{"type": "result", "status": "success", "last_message": json.dumps(ans),
                  "stats": {{"session_costs": 0.01, "tool_calls": tools, "total_tokens": 10}}}}))
'''


@pytest.fixture
def sandbox(tmp_path, monkeypatch):
    def make(mode):
        script = tmp_path / f"fake_{mode}.py"
        script.write_text(FAKE.format(mode=mode), encoding="utf-8")
        monkeypatch.setattr(gonogo, "bob_command", lambda: [sys.executable, str(script)])
    monkeypatch.setattr(runner, "EXAM_WS", tmp_path / "ws")
    monkeypatch.setattr(runner, "ANSWERS_DIR", tmp_path / "answers")
    monkeypatch.setattr(runner, "RAW_DIR", tmp_path / "raw")
    monkeypatch.setattr(runner, "COSTS", tmp_path / "costs.jsonl")
    monkeypatch.setattr(config, "CACHE_DIR", tmp_path / "cache")
    monkeypatch.setattr(runner, "build_workspace", lambda cond: tmp_path)
    monkeypatch.setattr(runner, "context_file", lambda cond: None)
    return make


def read(path):
    return [json.loads(l) for l in path.read_text(encoding="utf-8").splitlines()]


def test_batches_are_fixed_and_cover_everything():
    b1, b2 = runner.batches(QS), runner.batches(list(reversed(QS)))
    assert [q["id"] for b in b1 for q in b] == [q["id"] for b in b2 for q in b]
    assert sorted(q["id"] for b in b1 for q in b) == sorted(q["id"] for q in QS)
    assert max(len(b) for b in b1) <= config.BATCH_SIZE


def test_full_run_answers_everything(sandbox, tmp_path):
    sandbox("ok")
    res = runner.sit(QS, "pilot", "C1", log=lambda *_: None)
    assert res["excluded"] == 0 and res["questions"] == 25
    rows = read(tmp_path / "answers" / "pilot_C1_r1.jsonl")
    assert all(r["answer"] is True and r["p"] == 0.9 for r in rows)
    assert len(read(tmp_path / "costs.jsonl")) == 2


def test_rerun_uses_cache(sandbox, tmp_path):
    sandbox("ok")
    runner.sit(QS, "pilot", "C1", log=lambda *_: None)
    res = runner.sit(QS, "pilot", "C1", log=lambda *_: None)
    assert res["cost"] == 0.0
    assert all(c["cached"] for c in read(tmp_path / "costs.jsonl")[2:])


def test_tool_use_excludes_the_batch(sandbox, tmp_path):
    sandbox("tools")
    res = runner.sit(QS, "pilot", "C1", log=lambda *_: None)
    assert res["excluded"] == 25
    assert {r["reason"] for r in read(tmp_path / "answers" / "pilot_C1_r1.jsonl")} == {"tool_use"}


def test_missing_answers_trigger_one_rerun_then_exclusion(sandbox, tmp_path):
    sandbox("half")
    res = runner.sit(QS, "pilot", "C1", log=lambda *_: None)
    costs = read(tmp_path / "costs.jsonl")
    assert [c["attempt"] for c in costs] == [1, 2, 1, 2]
    assert 0 < res["excluded"] < 25


def test_preflight_blocks_ide_terminal_and_sealed_test(monkeypatch):
    monkeypatch.setenv("BOB_API_KEY", "x")
    monkeypatch.setenv("TERM_PROGRAM", "vscode")
    assert "standalone" in runner.preflight("pilot")
    monkeypatch.delenv("TERM_PROGRAM")
    monkeypatch.setattr(runner, "freeze_tag_exists", lambda: False)
    assert "sealed" in runner.preflight("test")
    assert runner.preflight("pilot") == ""
