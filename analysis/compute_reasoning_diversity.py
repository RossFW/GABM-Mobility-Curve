#!/usr/bin/env python3
"""
Reasoning diversity via K-Means silhouette analysis.

Research Q: does each LLM generate genuinely varied reasoning, or does it
recycle a small number of templates?

Metric: Effective reasoning modes — K-Means with K ∈ [2, 20], pick K that
maximises silhouette score (Rousseeuw 1987). Run separately for:
  - yes-only responses (reasoning used when agent stays home)
  - no-only responses (reasoning used when agent goes out)
  - overall (all responses combined)

Higher best_k = more distinct reasoning modes. Comparing yes vs no reveals
whether models have different template repertoires per decision.

PCA projection from 3072 → 128 dims preserves clustering structure while
cutting K-Means + silhouette compute by ~20× (Aggarwal et al. 2001).

Output: viz/data/real/response_diversity.json
"""
from __future__ import annotations

import csv
import json
import time
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans
from sklearn.decomposition import PCA
from sklearn.metrics import silhouette_score

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "viz" / "data" / "real"
OUT = DATA / "response_diversity.json"

SAMPLE_SIZE = 3000
K_RANGE = list(range(2, 21))
SIL_SAMPLE = 1000
PCA_DIMS = 128
SEED = 42


def load_decisions(csv_path: Path) -> list[str]:
    decisions = []
    with open(csv_path, newline="") as f:
        for row in csv.DictReader(f):
            decisions.append(row["response"].strip().lower())
    return decisions


def best_k_by_silhouette(emb: np.ndarray, rng: np.random.Generator, label: str) -> dict:
    """Fit K-Means for each K in K_RANGE on PCA-reduced subsample; pick best silhouette."""
    n_all = emb.shape[0]
    if n_all < 10:
        return {"best_k": None, "best_silhouette": None, "scores_by_k": {},
                "pca_variance_explained": None, "n_used": n_all}
    n_use = min(SAMPLE_SIZE, n_all)
    idx = rng.choice(n_all, size=n_use, replace=False)
    X = emb[idx].astype(np.float32)
    pca = PCA(n_components=min(PCA_DIMS, X.shape[1]), random_state=SEED)
    Xp = pca.fit_transform(X)
    scores = {}
    for k in K_RANGE:
        if k >= n_use:
            continue
        try:
            km = KMeans(n_clusters=k, n_init=3, random_state=SEED).fit(Xp)
            s = silhouette_score(Xp, km.labels_,
                                 sample_size=min(SIL_SAMPLE, n_use), random_state=SEED)
            scores[k] = float(s)
        except Exception:
            scores[k] = None
    valid = {k: s for k, s in scores.items() if s is not None}
    best_k = max(valid, key=lambda k: valid[k]) if valid else None
    return {
        "best_k": best_k,
        "best_silhouette": round(valid[best_k], 4) if best_k is not None else None,
        "scores_by_k": {int(k): (round(v, 4) if v is not None else None) for k, v in scores.items()},
        "pca_variance_explained": round(float(pca.explained_variance_ratio_.sum()), 4),
        "n_used": n_use,
    }


def process_config(npz_path: Path, csv_path: Path) -> dict:
    d = np.load(npz_path, allow_pickle=False)
    emb = d["embedding"]
    row_idx = d["row_idx"]

    all_decisions = load_decisions(csv_path)
    decision = np.array([all_decisions[ri] for ri in row_idx])

    yes_mask = decision == "yes"
    no_mask  = decision == "no"

    rng = np.random.default_rng(SEED)

    t0 = time.time()
    overall = best_k_by_silhouette(emb, rng, "overall")
    yes_res  = best_k_by_silhouette(emb[yes_mask], rng, "yes")
    no_res   = best_k_by_silhouette(emb[no_mask],  rng, "no")
    elapsed  = round(time.time() - t0, 1)

    return {
        "n_responses": int(emb.shape[0]),
        "n_yes": int(yes_mask.sum()),
        "n_no":  int(no_mask.sum()),
        "overall": {
            "best_k": overall["best_k"],
            "best_silhouette": overall["best_silhouette"],
            "silhouette_by_k": overall["scores_by_k"],
            "pca_variance_explained": overall["pca_variance_explained"],
        },
        "yes_only": {
            "best_k": yes_res["best_k"],
            "best_silhouette": yes_res["best_silhouette"],
            "silhouette_by_k": yes_res["scores_by_k"],
        },
        "no_only": {
            "best_k": no_res["best_k"],
            "best_silhouette": no_res["best_silhouette"],
            "silhouette_by_k": no_res["scores_by_k"],
        },
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
        print(f"  overall best_k={r['overall']['best_k']}  "
              f"yes best_k={r['yes_only']['best_k']}  "
              f"no best_k={r['no_only']['best_k']}  "
              f"({r['elapsed_s']}s)", flush=True)
        results[cd.name] = r
        OUT.write_text(json.dumps(results, indent=2))
    print(f"\nWrote {OUT}", flush=True)


if __name__ == "__main__":
    main()
