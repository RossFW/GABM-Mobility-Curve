#!/usr/bin/env python3
"""
Persona-individuation test via embedding cosine similarity.

Research Q: do LLMs produce persona-specific reasoning, or the same template
regardless of which agent they are asked about?

Method (5/5 unanimous + same-direction):
  Inclusion gate — an (agent, infection_level) group qualifies only when all
  5 reps made the SAME decision (5/5 yes or 5/5 no).

  WITHIN-agent similarity = for each qualifying (agent, level) group, mean of
                            all C(5,2) = 10 pairwise cosines among that agent's
                            5 normalized reps. Then averaged across groups.

  ACROSS-agent similarity = at each level, partition qualifying agents into
                            two sets — those who went 5/5 yes and those who
                            went 5/5 no. For each pair (A, B) from the SAME
                            set (same direction, same level), the similarity
                            is the mean of all 5x5 = 25 cross-pairs (one rep
                            from A, one from B). Averaged across all such
                            (A, B, level, direction) tuples.

  DELTA = within_mean − across_mean.

Same-direction matching: prevents the across-agent comparison from being
dominated by the trivial yes-text vs no-text gap. Both halves of the
comparison are now built from agents who decisively committed to the same
choice, so any remaining gap reflects persona-driven reasoning style.

Implementation note: the mean of all 5x5 cross-cosines between two agents
equals (mean_normalized_rep_A) · (mean_normalized_rep_B), so we precompute
per-agent mean-normalized embeddings and do all pairwise dot products in a
single matmul per (level, direction). For within-agent, the mean of all
C(n,2) cosines among n normalized vectors equals (||sum||^2 - n) / (n*(n-1)).

Interpretation:
  DELTA > 0  → within-agent reasoning is more self-similar than between
               agents at the same decision and infection level — persona
               individuation is real.
  DELTA ≈ 0 → the model produces effectively the same reasoning regardless
               of which persona it is asked about; infection level / decision
               drive the text.
  DELTA < 0  → unusual — agents are MORE similar to each other than to
               themselves.

Output: viz/data/real/response_persona_similarity.json
"""
from __future__ import annotations

import csv
import json
import random
import time
from pathlib import Path

import numpy as np

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "viz" / "data" / "real"
OUT = DATA / "response_persona_similarity.json"

N_BOOTSTRAP = 200
SEED = 42


def load_decisions(csv_path: Path) -> list[str]:
    """Return list of decisions (yes/no) indexed by CSV row (0-based after header)."""
    decisions = []
    with open(csv_path, newline="") as f:
        for row in csv.DictReader(f):
            decisions.append(row["response"].strip().lower())
    return decisions


def within_agent_mean_sim(emb_n: np.ndarray, agent_id: np.ndarray,
                          infection_level: np.ndarray,
                          decision: np.ndarray) -> tuple[float, list[float]]:
    """Mean of all C(n,2) rep-pair cosines per 5/5 unanimous (agent, level) group.

    emb_n: row-normalized embeddings.
    """
    sims = []
    key = agent_id.astype(np.int64) * 100_000 + (infection_level * 1000).astype(np.int64)
    unique, inv = np.unique(key, return_inverse=True)
    for g_idx in range(len(unique)):
        rows = np.where(inv == g_idx)[0]
        n = len(rows)
        if n < 2:
            continue
        decs = decision[rows]
        if not np.all(decs == decs[0]):
            continue  # not unanimous → skip
        # Mean pairwise cosine via the sum-norm shortcut:
        #   sum_{i<j} e_i · e_j = (||sum||^2 - n) / 2
        #   mean_pair = (||sum||^2 - n) / (n*(n-1))
        s = emb_n[rows].sum(axis=0)
        denom = n * (n - 1)
        if denom <= 0:
            continue
        mean_pair = (float(np.dot(s, s)) - n) / denom
        sims.append(mean_pair)
    return (float(np.mean(sims)) if sims else np.nan), sims


def across_agent_mean_sim(emb_n: np.ndarray, agent_id: np.ndarray,
                          infection_level: np.ndarray,
                          decision: np.ndarray) -> tuple[float, list[float]]:
    """Mean cross-pair cosine for unanimous + same-direction agent pairs at each level.

    For each (level, direction) bucket, every pair of qualifying agents
    contributes one cosine value = mean of the 25 cross-rep cosines.
    """
    sims = []
    for lv in np.unique(infection_level):
        level_mask = infection_level == lv
        level_rows = np.where(level_mask)[0]
        if len(level_rows) < 2:
            continue
        level_agents = agent_id[level_rows]

        unique_agents = np.unique(level_agents)
        # Per qualifying agent: direction + mean-normalized embedding.
        agent_dir = []
        agent_mean = []
        for aid in unique_agents:
            a_rows = level_rows[level_agents == aid]
            if len(a_rows) < 2:
                continue
            a_decs = decision[a_rows]
            if not np.all(a_decs == a_decs[0]):
                continue  # not unanimous
            agent_dir.append(a_decs[0])
            agent_mean.append(emb_n[a_rows].mean(axis=0))

        if len(agent_dir) < 2:
            continue
        agent_dir_arr = np.array(agent_dir)
        agent_mean_arr = np.array(agent_mean)  # (n_agents, dim)

        for direction in ('yes', 'no'):
            mask = agent_dir_arr == direction
            if mask.sum() < 2:
                continue
            M = agent_mean_arr[mask]  # (k, dim)
            # mean over 5x5 cross-pairs of (A_normed, B_normed) = mean(A_n) · mean(B_n)
            sim_mat = M @ M.T  # (k, k)
            iu = np.triu_indices(len(M), k=1)
            sims.extend(sim_mat[iu].tolist())
    return (float(np.mean(sims)) if sims else np.nan), sims


def bootstrap_ci(values: list[float], n_boot: int = 200, seed: int = 0):
    if not values:
        return None, None
    rng = np.random.default_rng(seed)
    arr = np.asarray(values)
    means = [arr[rng.integers(0, len(arr), len(arr))].mean() for _ in range(n_boot)]
    lo, hi = np.percentile(means, [2.5, 97.5])
    return float(lo), float(hi)


def process_config(npz_path: Path, csv_path: Path) -> dict:
    d = np.load(npz_path, allow_pickle=False)
    emb = d["embedding"]
    agent_id = d["agent_id"]
    infection_level = d["infection_level"]
    row_idx = d["row_idx"]

    # Pre-normalize once.
    norm = np.linalg.norm(emb, axis=1, keepdims=True)
    norm[norm == 0] = 1.0
    emb_n = emb / norm

    all_decisions = load_decisions(csv_path)
    decision = np.array([all_decisions[ri] for ri in row_idx])

    t0 = time.time()
    within_mean, within_per_group = within_agent_mean_sim(emb_n, agent_id, infection_level, decision)
    across_mean, across_per_pair = across_agent_mean_sim(emb_n, agent_id, infection_level, decision)
    elapsed = round(time.time() - t0, 1)

    within_ci = bootstrap_ci(within_per_group, n_boot=N_BOOTSTRAP, seed=SEED)
    across_ci = bootstrap_ci(across_per_pair, n_boot=N_BOOTSTRAP, seed=SEED)
    delta = float(within_mean - across_mean) if np.isfinite(within_mean) and np.isfinite(across_mean) else None

    return {
        "n_responses": int(emb.shape[0]),
        "within_mean": round(within_mean, 4),
        "within_ci": [round(within_ci[0], 4), round(within_ci[1], 4)] if within_ci[0] is not None else None,
        "across_mean": round(across_mean, 4),
        "across_ci": [round(across_ci[0], 4), round(across_ci[1], 4)] if across_ci[0] is not None else None,
        "delta": round(delta, 4) if delta is not None else None,
        "n_within_groups": len(within_per_group),
        "n_across_pairs": len(across_per_pair),
        "elapsed_s": elapsed,
    }


def main():
    configs = sorted([
        d for d in DATA.iterdir()
        if d.is_dir()
        and (d / "response_embeddings.npz").exists()
        and (d / "probe_results_micro.csv").exists()
    ])
    print(f"Configs: {len(configs)}", flush=True)
    results = {}
    for i, cd in enumerate(configs):
        print(f"[{i+1}/{len(configs)}] {cd.name}", flush=True)
        r = process_config(cd / "response_embeddings.npz", cd / "probe_results_micro.csv")
        print(f"  within={r['within_mean']}  across={r['across_mean']}  "
              f"delta={r['delta']}  ({r['elapsed_s']}s)", flush=True)
        results[cd.name] = r
        OUT.write_text(json.dumps(results, indent=2))
    print(f"\nWrote {OUT}", flush=True)


if __name__ == "__main__":
    main()
