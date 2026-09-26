"""Statistics for Blindspot. Steps 10 to 12 add Wilson, Brier, ECE and McNemar here.

This file currently holds the cluster bootstrap (sensitivity check in PREREGISTRATION.md, section 5).
"""
import numpy as np


def cluster_bootstrap_mean(values, clusters, n_boot=2000, seed=7, level=0.95) -> dict:
    """Bootstrap the mean of per-question values, resampling whole clusters.

    values   : one number per question, e.g. correct_C2 - correct_C1 (in -1, 0, 1),
               or brier_C2 - brier_C1. The mean of these is the paired difference.
    clusters : one label per question (the function/class or module it is about).

    Returns the observed mean, a percentile interval, the cluster-bootstrap standard error,
    the standard error you would get if questions were independent, and the design effect
    (ratio of the two variances). A design effect near 1 means clustering does not matter;
    2 means the independent analysis understates the variance by half.
    """
    values = np.asarray(values, dtype=float)
    clusters = np.asarray(clusters)
    if values.shape != clusters.shape or values.size == 0:
        raise ValueError("values and clusters must be non-empty and the same length")

    # Collapse to per-cluster sums once; each resample is then a cheap weighted sum.
    labels, inverse = np.unique(clusters, return_inverse=True)
    sums = np.bincount(inverse, weights=values)
    counts = np.bincount(inverse).astype(float)
    k = len(labels)

    rng = np.random.default_rng(seed)
    picks = rng.integers(0, k, size=(n_boot, k))
    boot_means = sums[picks].sum(axis=1) / counts[picks].sum(axis=1)

    alpha = 1 - level
    lo, hi = np.quantile(boot_means, [alpha / 2, 1 - alpha / 2])
    se_cluster = float(boot_means.std(ddof=1))
    se_iid = float(values.std(ddof=1) / np.sqrt(values.size)) if values.size > 1 else float("nan")
    design_effect = (se_cluster / se_iid) ** 2 if se_iid > 0 else float("nan")
    return {
        "mean": float(values.mean()),
        "ci_low": float(lo),
        "ci_high": float(hi),
        "se_cluster": se_cluster,
        "se_iid": se_iid,
        "design_effect": float(design_effect),
        "n_questions": int(values.size),
        "n_clusters": int(k),
        "few_clusters_warning": k < 20,
    }
