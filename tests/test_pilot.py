import pytest

from blindspot import pilot


def q(i, fam, sub, mod="m.a", truth=True, qtype="tf"):
    return {"id": f"q{i}", "family": fam, "subkind": sub, "module": mod, "entity": f"{mod}:e{i}",
            "type": qtype, "truth": truth}


def data():
    cands = [q(i, "calls", "true", f"m.{'ab'[i % 2]}") for i in range(20)]
    cands += [q(100 + i, "calls", "false", truth=False) for i in range(20)]
    cands += [q(200 + i, "defaults", "value", qtype="value", truth="None") for i in range(6)]
    train = [c for c in cands if c["id"] in {"q0", "q1", "q100", "q200", "q201", "q202"}]
    test = [c for c in cands if c["id"] in {"q2", "q3", "q101", "q203", "q204", "q205"}]
    return cands, train, test


def test_pilot_never_uses_test_and_borrows_only_from_train():
    cands, train, test = data()
    p = pilot.build(cands, train, test, {("calls", "true"): 5, ("calls", "false"): 5},
                    {("defaults", "value"): 2}, seed=7)
    ids = {x["id"] for x in p}
    assert len(p) == 12
    assert not ids & {x["id"] for x in test}
    tf_ids = {x["id"] for x in p if x["type"] == "tf"}
    assert not tf_ids & {x["id"] for x in train}             # true/false pilot items are leftovers
    assert {x["id"] for x in p if x["type"] == "value"} <= {x["id"] for x in train}
    assert all(x["set"] == "pilot" for x in p)


def test_pilot_shortfall_raises():
    cands, train, test = data()
    with pytest.raises(ValueError):
        pilot.build(cands, train, test, {("calls", "true"): 50}, {}, seed=7)
