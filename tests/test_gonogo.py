import json
import sys
from pathlib import Path

from blindspot import gonogo


def test_parse_result_skips_log_lines():
    out = 'starting...\n{"type": "result", "status": "success", "last_message": "hi", "stats": {}}\n'
    assert gonogo.parse_result(out)["last_message"] == "hi"
    assert gonogo.parse_result("no json here") is None


def test_extract_json_array_handles_fences():
    assert gonogo.extract_json_array('```json\n[{"id": "a"}]\n```') == [{"id": "a"}]
    assert gonogo.extract_json_array("sorry, I can't") is None


def test_check_batch_flags_missing_and_bad_p():
    good = [{"id": q, "answer": t, "p": 0.8} for q, _, t in gonogo.BATCH_QUESTIONS]
    assert gonogo.check_batch(json.dumps(good))["ok"]
    bad = good[:-1] + [{"id": "g20", "answer": True, "p": 1.7}]
    res = gonogo.check_batch(json.dumps(bad))
    assert not res["ok"] and res["bad_p"] == ["g20"]


def test_full_run_with_fake_bob(monkeypatch, tmp_path):
    fake = Path(__file__).with_name("fake_bob.py")
    # Point the tool straight at the fake Bob as a ready-made argument list (no string parsing).
    monkeypatch.setattr(gonogo, "bob_command", lambda: [sys.executable, str(fake)])
    monkeypatch.setenv("BOB_API_KEY", "fake-key-for-tests")
    monkeypatch.setattr(gonogo.config, "RESULTS_DIR", tmp_path)
    monkeypatch.setattr(gonogo, "WS", tmp_path / "ws")
    assert gonogo.main() == 0
    saved = json.loads((tmp_path / "gonogo.json").read_text())
    assert all(r["pass"] for r in saved.values())


def test_missing_api_key_stops_early(monkeypatch):
    monkeypatch.delenv("BOB_API_KEY", raising=False)
    monkeypatch.delenv("BOB_BIN", raising=False)
    assert gonogo.main() == 2
