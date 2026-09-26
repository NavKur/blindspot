import numpy as np
import pytest

from blindspot.stats import cluster_bootstrap_mean


def test_independent_data_has_design_effect_near_one():
    rng = np.random.default_rng(1)
    values = rng.choice([-1, 0, 0, 1], size=400)
    clusters = np.repeat(np.arange(100), 4)          # clusters carry no shared effect
    res = cluster_bootstrap_mean(values, clusters, n_boot=3000, seed=2)
    assert 0.7 < res["design_effect"] < 1.4
    assert res["ci_low"] <= res["mean"] <= res["ci_high"]


def test_clustered_data_widens_the_interval():
    rng = np.random.default_rng(3)
    n_clusters, per = 60, 5
    shared = rng.choice([-1, 0, 1], size=n_clusters, p=[0.3, 0.3, 0.4])   # whole cluster moves together
    values = np.repeat(shared, per).astype(float)
    flip = rng.random(values.size) < 0.1
    values[flip] = 0
    clusters = np.repeat(np.arange(n_clusters), per)
    res = cluster_bootstrap_mean(values, clusters, n_boot=3000, seed=4)
    assert res["design_effect"] > 2.5            # ignoring clustering would badly understate uncertainty
    assert res["n_clusters"] == n_clusters and not res["few_clusters_warning"]


def test_same_seed_same_answer_and_few_cluster_warning():
    values = [1, 0, 0, -1, 1, 1, 0, 0]
    clusters = ["a", "a", "b", "b", "c", "c", "d", "d"]
    r1 = cluster_bootstrap_mean(values, clusters, n_boot=500, seed=9)
    r2 = cluster_bootstrap_mean(values, clusters, n_boot=500, seed=9)
    assert r1 == r2
    assert r1["few_clusters_warning"]


def test_rejects_mismatched_input():
    with pytest.raises(ValueError):
        cluster_bootstrap_mean([1, 0], ["a"])
