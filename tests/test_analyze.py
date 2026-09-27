"""Step 22: final analysis on fake TEST runs."""
from blindspot import analyze


def row(i, module, correct, p, entity="e", excluded=False):
    return {"id": f"q{i}", "module": module, "path": module.replace(".", "/") + ".py", "entity": entity,
            "text": f"Question {i}?", "answer": True, "truth": bool(correct), "correct": correct,
            "p": p, "excluded": excluded}


def test_analysis_primary_pairs_and_direction():
    c1 = {f"q{i}": row(i, "a" if i % 2 else "b", 1 if i < 60 else 0, 0.9, entity=f"e{i % 25}") for i in range(100)}
    c2 = {f"q{i}": row(i, "a" if i % 2 else "b", 1 if i < 80 else 0, 0.9, entity=f"e{i % 25}") for i in range(100)}
    c2["q99"]["excluded"] = True
    res = analyze.analyse({"C0": None, "C1": c1, "C2": c2})
    assert res["n_paired"] == 99 and res["dropped_unpaired"] == 1
    p = res["primary"]
    assert p["only_a"] == 0 and p["only_b"] == 20 and p["significant"] and p["direction"] == "C2 better"
    assert "acc_C1_vs_C0" not in res["secondary"]
    assert all("p_holm" in v for v in res["secondary"].values())
