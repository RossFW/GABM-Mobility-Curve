#!/usr/bin/env python3
"""
GABM Mobility Curve — Response Text Similarity Pre-computation

Groups micro data by (agent_id, infection_level) → 5 reps.
Computes decision agreement rates and text similarity metrics.

Metrics (unanimous groups only — all 5 reps same decision):
  - exact_match: character-identical responses
  - jaccard:     word-overlap (Jaccard) similarity

Output: viz/data/real/response_text_similarity.json
"""

import csv
import json
import os
from collections import defaultdict
from itertools import combinations
from pathlib import Path

from configs import CONFIGS

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "viz" / "data" / "real"
OUT_FILE = DATA_DIR / "response_text_similarity.json"


def tokenize(text):
    return set(text.lower().split())


def pairwise_jaccard(texts):
    token_sets = [tokenize(t) for t in texts]
    sims = []
    for a, b in combinations(range(len(token_sets)), 2):
        sa, sb = token_sets[a], token_sets[b]
        union = sa | sb
        sims.append(len(sa & sb) / len(union) if union else 1.0)
    return sum(sims) / len(sims) if sims else 0.0


def process_config(micro_path):
    groups = defaultdict(lambda: {"responses": [], "texts": []})

    with open(micro_path, newline="") as f:
        for row in csv.DictReader(f):
            key = (int(row["agent_id"]), row["infection_level"])
            groups[key]["responses"].append(row["response"].strip().lower())
            groups[key]["texts"].append(row.get("reasoning_text", ""))

    total_groups = 0
    agreed_groups = 0
    exact_eligible = 0
    exact_count = 0
    jac_sum = 0.0;   jac_n = 0
    jac_yes_sum = 0.0; jac_yes_n = 0
    jac_no_sum  = 0.0; jac_no_n  = 0

    by_level = defaultdict(lambda: {"total": 0, "agreed": 0, "jac_sum": 0.0, "jac_n": 0})

    for (aid, level), data in groups.items():
        total_groups += 1
        responses = data["responses"]
        texts = data["texts"]

        all_agree = len(set(responses)) == 1
        if all_agree:
            agreed_groups += 1
        by_level[level]["total"] += 1
        if all_agree:
            by_level[level]["agreed"] += 1

        if all_agree and len(texts) >= 2:
            exact_eligible += 1
            if len(set(texts)) == 1:
                exact_count += 1

            jac = pairwise_jaccard(texts)
            jac_sum += jac
            jac_n += 1
            by_level[level]["jac_sum"] += jac
            by_level[level]["jac_n"] += 1

            decision = responses[0]  # all same since all_agree
            if decision == "yes":
                jac_yes_sum += jac; jac_yes_n += 1
            elif decision == "no":
                jac_no_sum  += jac; jac_no_n  += 1

    level_stats = {}
    for level in sorted(by_level.keys(), key=float):
        bl = by_level[level]
        level_stats[level] = {
            "agreement": round(bl["agreed"] / bl["total"], 4) if bl["total"] else 0,
            "jaccard":   round(bl["jac_sum"] / bl["jac_n"], 4) if bl["jac_n"] else None,
        }

    return {
        "agreement_rate":    round(agreed_groups / total_groups, 4) if total_groups else 0,
        "exact_match_rate":  round(exact_count / exact_eligible, 4) if exact_eligible else 0,
        "mean_jaccard":      round(jac_sum     / jac_n,     4) if jac_n     else None,
        "mean_jaccard_yes":  round(jac_yes_sum / jac_yes_n, 4) if jac_yes_n else None,
        "mean_jaccard_no":   round(jac_no_sum  / jac_no_n,  4) if jac_no_n  else None,
        "by_level":          level_stats,
    }


def main():
    out = {
        "configs": [], "labels": [], "providers": [], "temperature": [],
        "decision_agreement": {}, "exact_text_match": {},
        "mean_jaccard": {}, "mean_jaccard_yes": {}, "mean_jaccard_no": {},
        "by_level": {},
    }

    for cfg in CONFIGS:
        micro_path = DATA_DIR / cfg["dir"] / "probe_results_micro.csv"
        if not micro_path.exists():
            print(f"SKIP {cfg['dir']} — no micro CSV")
            continue

        print(f"  {cfg['dir']}...", end=" ", flush=True)
        r = process_config(micro_path)
        k = cfg["dir"]
        out["configs"].append(k)
        out["labels"].append(cfg["label"])
        out["providers"].append(cfg["provider"])
        out["temperature"].append(cfg["temp"])
        out["decision_agreement"][k] = r["agreement_rate"]
        out["exact_text_match"][k] = r["exact_match_rate"]
        out["mean_jaccard"][k]     = r["mean_jaccard"]
        out["mean_jaccard_yes"][k] = r["mean_jaccard_yes"]
        out["mean_jaccard_no"][k]  = r["mean_jaccard_no"]
        out["by_level"][k] = r["by_level"]

        jy = f"{r['mean_jaccard_yes']:.3f}" if r["mean_jaccard_yes"] is not None else "n/a"
        jn = f"{r['mean_jaccard_no']:.3f}"  if r["mean_jaccard_no"]  is not None else "n/a"
        print(f"agree={r['agreement_rate']:.1%}  exact={r['exact_match_rate']:.1%}  "
              f"jaccard={r['mean_jaccard']:.3f}  yes={jy}  no={jn}")

    with open(OUT_FILE, "w") as f:
        json.dump(out, f, indent=2)
    print(f"\nWrote {OUT_FILE}  ({os.path.getsize(OUT_FILE):,} bytes)")


if __name__ == "__main__":
    main()
