#!/usr/bin/env python3
"""
Persona-individuation test via embedding cosine similarity.

Research Q: do LLMs produce persona-specific reasoning, or the same template
regardless of which agent they are asked about?

Method:
  For each config:
    WITHIN-agent similarity  = mean pairwise cosine across the 5 reps of each
                                (agent_id, infection_level) group, restricted
                                to SAME-DECISION pairs only.
    ACROSS-agent similarity  = for each infection_level, sample random pairs
                                of DIFFERENT agents that made the SAME decision,
                                compute mean cosine, then average over levels.
    DELTA = within_mean − across_mean.

Same-decision restriction: mixing yes-vs-no pairs confounds persona similarity
with decision similarity. Restricting to same-decision pairs isolates whether
the MODEL'S REASONING genuinely tracks the persona.

Interpretation:
  DELTA > 0  → reasoning is more consistent within a persona than across personas
               (conditional on the same decision) — the model individuates.
  DELTA ≈ 0 → no individuation; infection level drives the text more than persona.
  DELTA < 0  → inconsistent within persona; very unusual.

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

N_ACROSS_PAIRS_PER_LEVEL = 1000
N_BOOTSTRAP = 200
SEED = 42


def load_decisions(csv_path: Path) -> list[str]:
    """Return list of decisions (yes/no) indexed by CSV row (0-based after header)."""
    decisions = []
    with open(csv_path, newline="") as f:
        for row in csv.DictReader(f):
            decisions.append(row["response"].strip().lower())
    return decisions


def pairwise_cosine(embs: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(embs, axis=1, keepdims=True)
    norm[norm == 0] = 1.0
    en = embs / norm
    sim = en @ en.T
    iu = np.triu_indices(len(embs), k=1)
    return sim[iu]


def within_agent_mean_sim(emb: np.ndarray, agent_id: np.ndarray,
                          infection_level: np.ndarray,
                          decision: np.ndarray) -> tuple[float, list[float]]:
    """Mean cosine across same-decision pairs within each (agent, level) group."""
    sims = []
    key = agent_id.astype(np.int64) * 100_000 + (infection_level * 1000).astype(np.int64)
    unique, inv = np.unique(key, return_inverse=True)
    for g_idx in range(len(unique)):
        rows = np.where(inv == g_idx)[0]
        if len(rows) < 2:
            continue
        # Collect same-decision pairs
        group_sims = []
        for a in range(len(rows)):
            for b in range(a + 1, len(rows)):
                if decision[rows[a]] == decision[rows[b]]:
                    ea = emb[rows[a]]
                    eb = emb[rows[b]]
                    na = np.linalg.norm(ea); nb = np.linalg.norm(eb)
                    if na > 0 and nb > 0:
                        group_sims.append(float(np.dot(ea, eb) / (na * nb)))
        if group_sims:
            sims.append(float(np.mean(group_sims)))
    return (float(np.mean(sims)) if sims else np.nan), sims


def across_agent_mean_sim(emb: np.ndarray, agent_id: np.ndarray,
                          infection_level: np.ndarray, decision: np.ndarray,
                          rng: random.Random) -> tuple[float, list[float]]:
    """Mean cosine for random same-decision pairs of DIFFERENT agents at same level."""
    sims = []
    norm = np.linalg.norm(emb, axis=1, keepdims=True)
    norm[norm == 0] = 1.0
    emb_n = emb / norm

    for lv in np.unique(infection_level):
        level_rows = np.where(infection_level == lv)[0]
        if len(level_rows) < 2:
            continue
        level_agents = agent_id[level_rows]
        level_decs = decision[level_rows]
        lvl_sims = []
        tries = 0
        target = N_ACROSS_PAIRS_PER_LEVEL
        max_tries = target * 10
        while len(lvl_sims) < target and tries < max_tries:
            tries += 1
            i, j = rng.sample(range(len(level_rows)), 2)
            if level_agents[i] == level_agents[j]:
                continue
            if level_decs[i] != level_decs[j]:
                continue
            lvl_sims.append(float(emb_n[level_rows[i]] @ emb_n[level_rows[j]]))
        if lvl_sims:
            sims.append(float(np.mean(lvl_sims)))
    return (float(np.mean(sims)) if sims else np.nan), sims


def bootstrap_ci(values: list[float], n_boot: int = 200, seed: int = 0):
    if not values:
        return None, None
    rng = np.random.default_rng(seed)
    arr = np.asarray(values)
    means = [arr[rng.integers(0, len(arr), len(arr))].mean() for _ in range(n_boot)]
    lo, hi = np.percentile(means, [2.5, 97.5])
    return float(lo), float(hi)


def process_config(npz_path: Path, csv_path: Path, rng: random.Random) -> dict:
    d = np.load(npz_path, allow_pickle=False)
    emb = d["embedding"]
    agent_id = d["agent_id"]
    infection_level = d["infection_level"]
    row_idx = d["row_idx"]

    all_decisions = load_decisions(csv_path)
    decision = np.array([all_decisions[ri] for ri in row_idx])

    t0 = time.time()
    within_mean, within_per_group = within_agent_mean_sim(emb, agent_id, infection_level, decision)
    across_mean, across_per_level = across_agent_mean_sim(emb, agent_id, infection_level, decision, rng)
    elapsed = round(time.time() - t0, 1)

    within_ci = bootstrap_ci(within_per_group, n_boot=N_BOOTSTRAP, seed=SEED)
    across_ci = bootstrap_ci(across_per_level, n_boot=N_BOOTSTRAP, seed=SEED)
    delta = float(within_mean - across_mean) if np.isfinite(within_mean) and np.isfinite(across_mean) else None

    return {
        "n_responses": int(emb.shape[0]),
        "within_mean": round(within_mean, 4),
        "within_ci": [round(within_ci[0], 4), round(within_ci[1], 4)] if within_ci[0] is not None else None,
        "across_mean": round(across_mean, 4),
        "across_ci": [round(across_ci[0], 4), round(across_ci[1], 4)] if across_ci[0] is not None else None,
        "delta": round(delta, 4) if delta is not None else None,
        "n_within_groups": len(within_per_group),
        "n_across_levels": len(across_per_level),
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
        r = process_config(cd / "response_embeddings.npz", cd / "probe_results_micro.csv",
                           random.Random(SEED))
        print(f"  within={r['within_mean']}  across={r['across_mean']}  "
              f"delta={r['delta']}  ({r['elapsed_s']}s)", flush=True)
        results[cd.name] = r
        OUT.write_text(json.dumps(results, indent=2))
    print(f"\nWrote {OUT}", flush=True)


if __name__ == "__main__":
    main()
