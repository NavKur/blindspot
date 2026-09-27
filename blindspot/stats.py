"""Statistics for Blindspot.

Step 10: Wilson intervals, Brier score, reliability bins, ECE, confidently-wrong rate,
and the cluster bootstrap (sensitivity check).
Step 13: exact McNemar, paired bootstrap and Holm correction (PREREGISTRATION.md section 5).

Conventions used everywhere:
  p       : Bob's stated probability that ITS OWN ANSWER is correct, in [0, 1].
  correct : 1 if the answer was marked correct, else 0 (booleans are fine).
Unanswered or excluded questions must be removed by the caller before calling these.
"""
import math

import numpy as np
from scipy.stats import binom, norm

from blindspot.config import CONFIDENT_P

N_RELIABILITY_BINS = 5   # fixed by PREREGISTRATION.md section 5 ("reliability diagram (5 bins)")


def _check(p, correct):
    """Validate and convert inputs. Returns (p, correct) as float arrays."""
    p = np.asarray(p, dtype=float)
    correct = np.asarray(correct, dtype=float)
    if p.ndim != 1 or p.shape != correct.shape:
        raise ValueError("p and correct must be 1-D and the same length")
    if p.size == 0:
        raise ValueError("no answers given")
    if np.isnan(p).any() or (p < 0).any() or (p > 1).any():
        raise ValueError("every p must be a number between 0 and 1")
    if not np.isin(correct, (0.0, 1.0)).all():
        raise ValueError("correct must contain only 0/1 or False/True")
    return p, correct


def wilson_interval(k, n, level=0.95):
    """Wilson score interval for k successes out of n.

    Chosen over the plain p +/- 1.96*SE interval because per-module n is small (often 10 to 40)
    and accuracy can sit near 0 or 1, where the plain interval gives nonsense (below 0, above 1,
    or zero width at k = 0 or k = n).
    """
    if n <= 0:
        raise ValueError("n must be positive")
    if not 0 <= k <= n:
        raise ValueError("k must be between 0 and n")
    z = norm.ppf(1 - (1 - level) / 2)
    phat = k / n
    denom = 1 + z * z / n
    centre = (phat + z * z / (2 * n)) / denom
    half = z * math.sqrt(phat * (1 - phat) / n + z * z / (4 * n * n)) / denom
    lo = 0.0 if k == 0 else max(0.0, float(centre - half))   # exact ends; avoids 0.9999999999999999
    hi = 1.0 if k == n else min(1.0, float(centre + half))
    return lo, hi


def accuracy(correct, level=0.95) -> dict:
    """Share correct, with its Wilson interval."""
    correct = np.asarray(correct, dtype=float)
    n = int(correct.size)
    k = int(correct.sum())
    lo, hi = wilson_interval(k, n, level)
    return {"k": k, "n": n, "accuracy": k / n, "ci_low": lo, "ci_high": hi}


def brier_score(p, correct) -> float:
    """Mean of (p - correct)^2. 0 is perfect, 0.25 is 'always say 0.5', lower is better.

    It rewards being right AND knowing when you are right, which accuracy alone cannot see.
    """
    p, correct = _check(p, correct)
    return float(np.mean((p - correct) ** 2))


def bin_index(p, n_bins=N_RELIABILITY_BINS):
    """Equal-width bins [0, 0.2), [0.2, 0.4), ..., [0.8, 1.0] for 5 bins. p = 1.0 goes in the top bin.

    The tiny epsilon stops values like 0.6 landing in the bin below through float rounding.
    """
    p = np.asarray(p, dtype=float)
    return np.clip(np.floor(p * n_bins + 1e-9), 0, n_bins - 1).astype(int)


def reliability_bins(p, correct, n_bins=N_RELIABILITY_BINS) -> list:
    """One row per bin: how confident Bob said it was vs how often it was actually right.

    A calibrated examinee has mean_p close to accuracy in every bin. Empty bins are kept
    (with None values) so the diagram always has the same x-axis.
    """
    p, correct = _check(p, correct)
    idx = bin_index(p, n_bins)
    rows = []
    for b in range(n_bins):
        mask = idx == b
        n = int(mask.sum())
        row = {"bin": b, "lo": b / n_bins, "hi": (b + 1) / n_bins, "n": n,
               "mean_p": None, "accuracy": None, "ci_low": None, "ci_high": None}
        if n:
            k = int(correct[mask].sum())
            lo, hi = wilson_interval(k, n)
            row.update(mean_p=float(p[mask].mean()), accuracy=k / n, ci_low=lo, ci_high=hi)
        rows.append(row)
    return rows


def ece(p, correct, n_bins=N_RELIABILITY_BINS) -> float:
    """Expected calibration error: sum over bins of (share of answers in bin) * |accuracy - mean_p|.

    Descriptive only (PREREGISTRATION.md). It depends on the binning and is biased upwards
    in small samples, which is why no test is run on it.
    """
    p, correct = _check(p, correct)
    total = 0.0
    for row in reliability_bins(p, correct, n_bins):
        if row["n"]:
            total += row["n"] / p.size * abs(row["accuracy"] - row["mean_p"])
    return float(total)


def confidently_wrong(p, correct, threshold=CONFIDENT_P):
    """Per-question indicator: wrong AND stated p >= threshold. Returns a 0/1 int array."""
    p, correct = _check(p, correct)
    return ((correct == 0) & (p >= threshold)).astype(int)


def confidently_wrong_rate(p, correct, threshold=CONFIDENT_P) -> float:
    """Share of ALL answered questions that were confidently wrong (denominator = all, not just wrong ones)."""
    return float(confidently_wrong(p, correct, threshold).mean())


def summarise(p, correct) -> dict:
    """Everything the dashboard shows for one group of answers (a condition, a module, ...)."""
    p, correct = _check(p, correct)
    out = accuracy(correct)
    out.update(
        brier=brier_score(p, correct),
        ece=ece(p, correct),
        cw_rate=confidently_wrong_rate(p, correct),
        cw_count=int(confidently_wrong(p, correct).sum()),
        mean_p=float(p.mean()),
        overconfidence=float(p.mean()) - out["accuracy"],   # > 0 means Bob thinks it knows more than it does
        reliability=reliability_bins(p, correct),
    )
    return out


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


def mcnemar_exact(a_correct, b_correct) -> dict:
    """Exact two-sided McNemar test on paired 0/1 outcomes (same questions, two conditions).

    Only discordant pairs carry information: b = right under A only, c = right under B only.
    Under the null each discordant pair is a fair coin, so p = 2 * P(Binomial(b + c, 0.5) <= min(b, c)).
    Exact rather than chi-square because b + c may be small.
    """
    a = np.asarray(a_correct, dtype=int)
    b_ = np.asarray(b_correct, dtype=int)
    if a.shape != b_.shape or a.ndim != 1 or a.size == 0:
        raise ValueError("both runs must be 1-D, non-empty and the same length (same questions, same order)")
    only_a = int(((a == 1) & (b_ == 0)).sum())
    only_b = int(((a == 0) & (b_ == 1)).sum())
    n_disc = only_a + only_b
    p = 1.0 if n_disc == 0 else float(min(1.0, 2 * binom.cdf(min(only_a, only_b), n_disc, 0.5)))
    return {"n": int(a.size), "only_a": only_a, "only_b": only_b, "discordant": n_disc,
            "acc_a": float(a.mean()), "acc_b": float(b_.mean()),
            "diff_b_minus_a": float(b_.mean() - a.mean()), "p_value": p}


def paired_bootstrap_diff(a_values, b_values, n_boot=2000, seed=7, level=0.95) -> dict:
    """Percentile interval for mean(b - a), resampling questions (pairs stay together)."""
    a = np.asarray(a_values, dtype=float)
    b_ = np.asarray(b_values, dtype=float)
    if a.shape != b_.shape or a.ndim != 1 or a.size == 0:
        raise ValueError("both runs must be 1-D, non-empty and the same length")
    d = b_ - a
    rng = np.random.default_rng(seed)
    idx = rng.integers(0, d.size, size=(n_boot, d.size))
    boot = d[idx].mean(axis=1)
    alpha = 1 - level
    lo, hi = np.quantile(boot, [alpha / 2, 1 - alpha / 2])
    # two-sided bootstrap p: how often the resampled mean falls on the other side of 0
    p = float(min(1.0, 2 * min((boot <= 0).mean(), (boot >= 0).mean())))
    return {"mean_diff": float(d.mean()), "ci_low": float(lo), "ci_high": float(hi), "p_value": p, "n": int(d.size)}


def holm(p_values: dict) -> dict:
    """Holm step-down adjusted p-values. Input and output: {name: p}."""
    items = sorted(p_values.items(), key=lambda kv: kv[1])
    m = len(items)
    out, running = {}, 0.0
    for i, (name, p) in enumerate(items):
        running = max(running, min(1.0, (m - i) * p))
        out[name] = running
    return out
