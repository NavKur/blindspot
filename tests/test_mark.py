"""Step 16: marking."""
from blindspot import mark

TF = {"id": "a", "type": "tf", "truth": True, "module": "m", "path": "m.py", "entity": "m:f",
      "family": "calls", "text": "Q?"}
VAL = {"id": "b", "type": "value", "truth": "None", "module": "m", "path": "m.py", "entity": "m:f",
       "family": "defaults", "text": "Default?"}


def test_true_false():
    assert mark.is_correct(TF, True)
    assert not mark.is_correct(TF, False)
    assert not mark.is_correct(TF, "true")        # parser already converts; strings are not accepted here
    assert not mark.is_correct(TF, None)


def test_value_literals_normalised_but_typed():
    assert mark.is_correct(VAL, "None")
    assert mark.is_correct(VAL, " None ")
    q = dict(VAL, truth="'abc'")
    assert mark.is_correct(q, '"abc"')            # same string, other quotes
    q = dict(VAL, truth="0")
    assert not mark.is_correct(q, "False")        # 0 == False in Python, but not the same literal
    assert mark.is_correct(dict(VAL, truth="(1, 2)"), "(1,2)")


def test_mark_rows_keep_text_answer_truth_and_exclusions():
    answers = [{"id": "a", "answer": False, "p": 0.9, "excluded": False, "reason": None}]
    rows = {r["id"]: r for r in mark.mark([TF, VAL], answers)}
    assert rows["a"]["correct"] == 0 and rows["a"]["answer"] is False and rows["a"]["text"] == "Q?"
    assert rows["b"]["excluded"] and rows["b"]["reason"] == "missing"


def test_excluded_answer_is_never_scored():
    answers = [{"id": "a", "answer": True, "p": 0.9, "excluded": True, "reason": "tool_use"}]
    row = mark.mark([TF], answers)[0]
    assert row["excluded"] and row["correct"] == 0 and row["reason"] == "tool_use"
