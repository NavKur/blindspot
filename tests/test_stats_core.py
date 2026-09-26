"""Step 10: core statistics, checked against hand-worked or published values."""
import numpy as np
import pytest

from blindspot import stats


def test_wilson_matches_published_values():
    # Reference values from the Wilson (1927) formula, as given by statsmodels proportion_confint(method="wilson").
    lo, hi = stats.wilson_interval(8, 10)
    assert lo == pytest.approx(0.4902, abs=1e-4) and hi == pytest.approx(0.9433, abs=1e-4)
    lo, hi = stats.wilson_interval(0, 10)
    assert lo == 0.0 and hi == pytest.approx(0.2775, abs=1e-4)
    lo, hi = stats.wilson_interval(10, 10)
    assert lo == pytest.approx(0.7225, abs=1e-4) and hi == 1.0


def test_wilson_rejects_bad_counts():
    with pytest.raises(ValueError):
        stats.wilson_interval(0, 0)
    with pytest.raises(ValueError):
        stats.wilson_interval(11, 10)


def test_brier_reference_points():
    assert stats.brier_score([1, 1, 0], [1, 1, 0]) == 0.0              # perfect and certain
    assert stats.brier_score([0.5] * 4, [1, 0, 1, 0]) == 0.25          # always 0.5
    assert stats.brier_score([0.9, 0.9], [0, 0]) == pytest.approx(0.81)  # confidently wrong is punished hard


def test_bins_edges_and_top_bin():
    idx = stats.bin_index([0.0, 0.19, 0.2, 0.6, 0.79, 0.8, 1.0])
    assert idx.tolist() == [0, 0, 1, 3, 3, 4, 4]


def test_reliability_rows_and_empty_bins():
    rows = stats.reliability_bins([0.9, 0.9, 0.9, 0.9, 0.5], [1, 1, 1, 0, 1])
    assert len(rows) == 5 and sum(r["n"] for r in rows) == 5
    top = rows[4]
    assert top["n"] == 4 and top["accuracy"] == 0.75 and top["mean_p"] == pytest.approx(0.9)
    assert rows[0]["n"] == 0 and rows[0]["accuracy"] is None


def test_ece_hand_worked():
    # Bin 4: 4 answers, mean_p 0.9, accuracy 0.75 -> gap 0.15, weight 4/5.
    # Bin 2: 1 answer, mean_p 0.5, accuracy 1.0 -> gap 0.5, weight 1/5.
    # ECE = 0.8*0.15 + 0.2*0.5 = 0.22
    assert stats.ece([0.9, 0.9, 0.9, 0.9, 0.5], [1, 1, 1, 0, 1]) == pytest.approx(0.22)


def test_ece_near_zero_when_calibrated():
    rng = np.random.default_rng(0)
    p = rng.choice([0.3, 0.5, 0.7, 0.9], size=20000)
    correct = (rng.random(p.size) < p).astype(int)      # right exactly as often as it claims
    assert stats.ece(p, correct) < 0.02


def test_confidently_wrong_uses_threshold_inclusive():
    p = [0.8, 0.79, 0.95, 0.95]
    correct = [0, 0, 1, 0]
    assert stats.confidently_wrong(p, correct).tolist() == [1, 0, 0, 1]
    assert stats.confidently_wrong_rate(p, correct) == 0.5            # denominator is all 4 answers


def test_summarise_overconfidence_sign():
    out = stats.summarise([0.9] * 10, [1] * 6 + [0] * 4)
    assert out["accuracy"] == 0.6 and out["overconfidence"] == pytest.approx(0.3)
    assert out["cw_count"] == 4 and len(out["reliability"]) == 5


@pytest.mark.parametrize("p, correct", [
    ([], []),                  # empty
    ([0.5], [1, 0]),           # length mismatch
    ([1.2], [1]),              # p out of range
    ([float("nan")], [1]),     # missing p
    ([0.5], [2]),              # correct not 0/1
])
def test_bad_input_is_rejected(p, correct):
    with pytest.raises(ValueError):
        stats.brier_score(p, correct)
