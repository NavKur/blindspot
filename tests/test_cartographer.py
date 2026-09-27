"""Steps 19 to 21: Cartographer prompt and assembly, without Bob."""
from blindspot import cartographer


def row(i, module, correct, p, entity="e", excluded=False):
    return {"id": f"q{i}", "module": module, "path": module.replace(".", "/") + ".py", "entity": entity,
            "text": f"Question {i}?", "answer": True, "truth": bool(correct), "correct": correct,
            "p": p, "excluded": excluded}


def test_failure_summary_only_wrong_answers_in_module_most_confident_first():
    rows = [row(1, "a", 0, 0.6), row(2, "a", 0, 0.95), row(3, "a", 1, 0.9), row(4, "b", 0, 0.99),
            row(5, "a", 0, 0.99, excluded=True)]
    s = cartographer.failure_summary(rows, "a")
    assert [m["question"] for m in s] == ["Question 2?", "Question 1?"]


def test_prompt_mentions_file_and_mistakes_and_mode_can_only_read():
    p = cartographer.build_prompt("tinydb.table", "tinydb/table.py",
                                  [{"question": "Q?", "bob_answered": True, "confidence": 0.9}])
    assert "tinydb/table.py" in p and "Q? (it answered True, 90% sure)" in p
    assert "edit" in cartographer.FLAGS[1] and "- read" in cartographer.MODES_YAML


def test_assemble_keeps_c1_and_adds_one_section():
    out = cartographer.assemble("# C1 notes\n\nfrom init\n", [("tinydb.table", "tinydb/table.py", "- fact", "bob")])
    assert out.startswith("# C1 notes") and out.count(cartographer.SECTION_TITLE) == 1 and "- fact" in out


def test_pick_modules_only_where_bob_erred_worst_first():
    rep = {"modules": [
        {"module": "x", "path": "x.py", "red": True, "cw_rate": 0.0, "ci_low": 0.44, "n": 3, "k": 3},   # red by tiny n only
        {"module": "y", "path": "y.py", "red": False, "cw_rate": 0.05, "ci_low": 0.7, "n": 20, "k": 19},
        {"module": "z", "path": "z.py", "red": False, "cw_rate": 0.12, "ci_low": 0.64, "n": 16, "k": 14},
    ]}
    assert [m for m, _ in cartographer.pick_modules(rep)] == ["z", "y"]
