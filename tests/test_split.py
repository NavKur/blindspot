import collections

import pytest

from blindspot import split


def fake_candidates():
    out = []
    for mod in ("m.a", "m.b", "m.c"):
        for i in range(30):
            ent = f"{mod}:f{i % 6}"
            out.append({"id": f"{mod}-t{i}", "family": "calls", "subkind": "true", "module": mod,
                        "entity": ent, "type": "tf", "truth": True})
            out.append({"id": f"{mod}-f{i}", "family": "calls", "subkind": "false", "module": mod,
                        "entity": ent, "type": "tf", "truth": False})
        for i in range(10):
            out.append({"id": f"{mod}-v{i}", "family": "defaults", "subkind": "value", "module": mod,
                        "entity": f"{mod}:g{i}", "type": "value", "truth": "None"})
    return out


QUOTAS = {("calls", "true"): 30, ("calls", "false"): 30, ("defaults", "value"): 15}


def test_draw_meets_quotas_and_spreads_modules():
    exam = split.draw(fake_candidates(), QUOTAS, seed=7)
    c = collections.Counter((q["family"], q["subkind"]) for q in exam)
    assert c == collections.Counter(QUOTAS)
    per_mod = collections.Counter(q["module"] for q in exam if q["subkind"] == "true")
    assert set(per_mod.values()) == {10}                   # 30 true spread evenly over 3 modules
    assert len({q["id"] for q in exam}) == len(exam)


def test_split_exact_sizes_disjoint_and_stratified():
    exam = split.draw(fake_candidates(), QUOTAS, seed=7)
    train, test = split.split(exam, n_test=45, seed=7)
    assert len(test) == 45 and len(train) == 30
    assert not {q["id"] for q in train} & {q["id"] for q in test}
    assert {q["module"] for q in train} == {q["module"] for q in test} == {"m.a", "m.b", "m.c"}
    t = collections.Counter(q["truth"] for q in test if q["type"] == "tf")
    assert abs(t[True] - t[False]) <= 1


def test_deterministic():
    a = split.split(split.draw(fake_candidates(), QUOTAS, seed=7), 45, 7)
    b = split.split(split.draw(fake_candidates(), QUOTAS, seed=7), 45, 7)
    assert [q["id"] for q in a[1]] == [q["id"] for q in b[1]]


def test_shortfall_is_an_error():
    with pytest.raises(split.NotEnoughCandidates):
        split.draw(fake_candidates(), {("calls", "true"): 500}, seed=7)
