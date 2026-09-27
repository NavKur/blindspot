"""Step 17: publish writes the plugin contract and agent context without touching other text."""
import json

from blindspot import publish

SRC = '''class Table:
    """Doc."""

    def insert(self, doc):
        return 1

    def update(self, fields, cond=None):
        if cond is None:
            return []
        return [1]
'''


def row(entity, correct, p, text="Q?", truth=True, answer=None, excluded=False):
    return {"id": f"{entity}{correct}{p}{text}", "module": "tinydb.table", "path": "tinydb/table.py",
            "entity": entity, "family": "calls", "type": "tf", "text": text, "truth": truth,
            "answer": truth if correct else (not truth if answer is None else answer),
            "correct": correct, "p": p, "excluded": excluded}


def dest(tmp_path):
    d = tmp_path / "tinydb_repo"
    (d / "tinydb").mkdir(parents=True)
    (d / "tinydb" / "table.py").write_text(SRC, encoding="utf-8")
    return d


ROWS = [row("tinydb.table:Table.insert", 1, 0.9), row("tinydb.table:Table.insert", 1, 0.8),
        row("tinydb.table:Table.update", 0, 0.95, text="Does update raise?"),
        row("tinydb.table:Table.update", 1, 0.7),
        row("tinydb.table:Table.update_all", 0, 0.9, text="Has update_all?"),   # fake method -> class
        row("tinydb.table:<module>", 1, 0.9)]


def test_gate_thresholds_match_plugin():
    assert publish.gate(0.85) == "yes" and publish.gate(0.84) == "with_notes"
    assert publish.gate(0.65) == "with_notes" and publish.gate(0.64) == "no"


def test_context_matches_contract(tmp_path):
    d = dest(tmp_path)
    ctx = publish.build_context(ROWS, d, "abc", 0.02)
    assert ctx["version"] == 1 and ctx["repo"]["commit"] == "abc"
    fns = {f["name"]: f for f in ctx["functions"]}
    assert fns["Table.insert"]["status"] == "ok" and fns["Table.insert"]["line_start"] == 4
    upd = fns["Table.update"]
    assert upd["status"] == "wrong" and upd["readiness"] == 0.5 and (upd["line_start"], upd["line_end"]) == (7, 10)
    assert upd["misconceptions"][0]["confidence"] == 0.95
    table = fns["Table"]                              # the fake method's question lands on its class header
    assert table["status"] == "wrong" and table["line_end"] <= 3
    for f in ctx["functions"]:
        assert 1 <= f["line_start"] <= f["line_end"] and 0 <= f["readiness"] <= 1
    ids = [f["id"] for f in ctx["findings"]]
    assert ids == sorted(ids) and ids[0] == "F001"
    for f in ctx["findings"]:
        assert f["bob_allowed"] in ("yes", "with_notes", "no") and f["severity"] in ("high", "medium", "low")
        assert f["type"] in ("review_risk", "test_gap") and f["line_end"] >= f["line_start"]
    assert {f["status"] for f in ctx["files"]} <= {"ready", "review", "not_ready"}


def test_publish_writes_files_and_keeps_agents_text(tmp_path):
    d = dest(tmp_path)
    (d / "AGENTS.md").write_text("# My notes\n\nKeep me.\n", encoding="utf-8")
    results = tmp_path / "results"
    results.mkdir()
    (results / "report_latest.json").write_text("{}", encoding="utf-8")
    written = publish.publish(ROWS, "train_C1_r1", results, d, "abc", simulated=False)
    names = {p.relative_to(d).as_posix() for p in written}
    assert {".bob/context/readiness.json", ".bob/rules/readiness-context.md", "AGENTS.md",
            ".bob/blindspot/report_latest.json"} <= names
    agents = (d / "AGENTS.md").read_text(encoding="utf-8")
    assert agents.startswith("# My notes") and "Keep me." in agents and publish.BLOCK_START in agents
    publish.publish(ROWS, "train_C1_r1", results, d, "abc", simulated=False)     # second publish replaces
    assert (d / "AGENTS.md").read_text(encoding="utf-8").count(publish.BLOCK_START) == 1
    facts = (d / ".bob" / "rules" / "readiness-context.md").read_text(encoding="utf-8")
    assert "Does update raise?" in facts and "SIMULATED" not in facts
    json.loads((d / ".bob" / "context" / "readiness.json").read_text(encoding="utf-8"))


def test_simulated_is_labelled(tmp_path):
    d = dest(tmp_path)
    publish.publish(ROWS, "sim", tmp_path, d, None, simulated=True)
    assert "SIMULATED" in (d / ".bob" / "rules" / "readiness-context.md").read_text(encoding="utf-8")
