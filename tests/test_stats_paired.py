"""Step 13: McNemar, paired bootstrap and Holm, against hand-worked values."""
import numpy as np
import pytest

from blindspot import stats


def pairs(only_a, only_b, both=10, neither=5):
    a = [1] * only_a + [0] * only_b + [1] * both + [0] * neither
    b = [0] * only_a + [1] * only_b + [1] * both + [0] * neither
    return a, b


def test_mcnemar_hand_worked():
    # 1 vs 9 discordant: p = 2 * P(X <= 1), X ~ Bin(10, 0.5) = 2 * 11/1024
    res = stats.mcnemar_exact(*pairs(1, 9))
    assert res["only_a"] == 1 and res["only_b"] == 9 and res["discordant"] == 10
    assert res["p_value"] == pytest.approx(22 / 1024)


def test_mcnemar_no_discordance_and_symmetry():
    assert stats.mcnemar_exact(*pairs(0, 0))["p_value"] == 1.0
    assert stats.mcnemar_exact(*pairs(5, 5))["p_value"] == 1.0
    assert stats.mcnemar_exact(*pairs(3, 8))["p_value"] == stats.mcnemar_exact(*pairs(8, 3))["p_value"]


def test_mcnemar_rejects_unpaired():
    with pytest.raises(ValueError):
        stats.mcnemar_exact([1, 0], [1])


def test_paired_bootstrap_centres_on_difference():
    rng = np.random.default_rng(0)
    a = rng.random(300)
    b = a - 0.05 + rng.normal(0, 0.01, 300)
    res = stats.paired_bootstrap_diff(a, b, n_boot=2000, seed=1)
    assert res["mean_diff"] == pytest.approx(-0.05, abs=0.005)
    assert res["ci_high"] < 0 and res["p_value"] < 0.01


def test_holm_hand_worked():
    adj = stats.holm({"x": 0.01, "y": 0.04, "z": 0.03})
    assert adj["x"] == pytest.approx(0.03)      # 3 * 0.01
    assert adj["z"] == pytest.approx(0.06)      # 2 * 0.03
    assert adj["y"] == pytest.approx(0.06)      # max(1 * 0.04, previous) keeps order
