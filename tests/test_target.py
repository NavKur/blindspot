import os

import pytest

from blindspot import config, target


def test_remove_agent_context(tmp_path):
    (tmp_path / "AGENTS.md").write_text("context")
    (tmp_path / ".bob" / "rules").mkdir(parents=True)
    (tmp_path / ".github").mkdir()
    (tmp_path / ".github" / "copilot-instructions.md").write_text("x")
    (tmp_path / ".bobrules-code").write_text("x")
    (tmp_path / "README.rst").write_text("keep me")
    removed = target.remove_agent_context(tmp_path)
    assert set(removed) == {"AGENTS.md", ".bob", ".github/copilot-instructions.md", ".bobrules-code"}
    assert (tmp_path / "README.rst").exists()
    assert not (tmp_path / "AGENTS.md").exists()


def test_pin_is_a_full_commit_hash():
    assert len(target.EXPECTED_COMMIT) == 40
    assert config.TARGET_DIR.name == target.PACKAGE


@pytest.mark.skipif(not os.environ.get("RUN_NETWORK_TESTS"), reason="set RUN_NETWORK_TESTS=1 to clone tinydb")
def test_fetch_real_repo(monkeypatch, tmp_path):
    monkeypatch.setattr(config, "TARGET_DIR", tmp_path / "tinydb")
    monkeypatch.setattr(config, "TARGET_LOCK", tmp_path / "target.lock.json")
    info = target.fetch()
    assert info["commit"] == target.EXPECTED_COMMIT
    assert info["n_python_files"] >= 9
