#!/usr/bin/env python3
"""
GABM Mobility Curve — Response Text Similarity Pre-computation

Groups micro data by (agent_id, infection_level) → 5 reps.
Computes decision agreement rates and text similarity metrics.
Output: viz/data/real/response_text_similarity.json

Used by Figures 38-39 (Response Consistency) in analytics.html.
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
    """Simple word tokenization for Jaccard similarity."""
    return set(text.lower().split())


def pairwise_jaccard(texts):
    """Compute mean pairwise Jaccard similarity across all C(n,2) pairs."""
    token_sets = [tokenize(t) for t in texts]
    similarities = []
    for a, b in combinations(range(len(token_sets)), 2):
        sa, sb = token_sets[a], token_sets[b]
        union = sa | sb
        if not union:
            similarities.append(1.0)
        else:
            similarities.append(len(sa & sb) / len(union))
    return sum(similarities) / len(similarities) if similarities else 0


def process_config(micro_path):
    """Process one config. Returns agreement rate, exact match rate, mean Jaccard, and by-level stats."""
    # Group by (agent_id, infection_level)
    groups = defaultdict(lambda: {"responses": [], "texts": []})

    with open(micro_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            key = (int(row["agent_id"]), row["infection_level"])
            groups[key]["responses"].append(row["response"])
            groups[key]["texts"].append(row.get("reasoning_text", ""))

    total_groups = 0
    agreed_groups = 0
    exact_match_count = 0
    exact_match_eligible = 0
    jaccard_sum = 0.0
    jaccard_count = 0

    # By-level tracking
    by_level = defaultdict(lambda: {"total": 0, "agreed": 0, "jaccard_sum": 0.0, "jaccard_n": 0})

    for (aid, level), data in groups.items():
        total_groups += 1
        responses = data["responses"]
        texts = data["texts"]

        # Decision agreement: all 5 reps same answer
        all_agree = len(set(responses)) == 1
        if all_agree:
            agreed_groups += 1

        by_level[level]["total"] += 1
        if all_agree:
            by_level[level]["agreed"] += 1

        # Text similarity — only for unanimous groups
        if all_agree and len(texts) >= 2:
            exact_match_eligible += 1

            # Exact match: all texts identical
            if len(set(texts)) == 1:
                exact_match_count += 1

            # Jaccard similarity
            jac = pairwise_jaccard(texts)
            jaccard_sum += jac
            jaccard_count += 1

            by_level[level]["jaccard_sum"] += jac
            by_level[level]["jaccard_n"] += 1

    agreement_rate = agreed_groups / total_groups if total_groups else 0
    exact_match_rate = exact_match_count / exact_match_eligible if exact_match_eligible else 0
    mean_jaccard = jaccard_sum / jaccard_count if jaccard_count else 0

    level_stats = {}
    for level in sorted(by_level.keys(), key=float):
        bl = by_level[level]
        level_stats[level] = {
            "agreement": round(bl["agreed"] / bl["total"], 4) if bl["total"] else 0,
            "jaccard": round(bl["jaccard_sum"] / bl["jaccard_n"], 4) if bl["jaccard_n"] else 0,
        }

    return (round(agreement_rate, 4), round(exact_match_rate, 4),
            round(mean_jaccard, 4), level_stats)


def main():
    configs_out = []
    labels_out = []
    providers_out = []
    temps_out = []
    decision_agreement = {}
    exact_text_match = {}
    mean_jaccard = {}
    by_level = {}

    for cfg in CONFIGS:
        micro_path = DATA_DIR / cfg["dir"] / "probe_results_micro.csv"
        if not micro_path.exists():
            print(f"SKIP: {cfg['dir']} — no micro CSV")
            continue

        print(f"Processing {cfg['dir']}...", end=" ", flush=True)
        agree, exact, jac, levels = process_config(micro_path)

        configs_out.append(cfg["dir"])
        labels_out.append(cfg["label"])
        providers_out.append(cfg["provider"])
        temps_out.append(cfg["temp"])
        decision_agreement[cfg["dir"]] = agree
        exact_text_match[cfg["dir"]] = exact
        mean_jaccard[cfg["dir"]] = jac
        by_level[cfg["dir"]] = levels

        print(f"agreement={agree:.1%}, exact_match={exact:.1%}, jaccard={jac:.3f}")

    result = {
        "configs": configs_out,
        "labels": labels_out,
        "providers": providers_out,
        "temperature": temps_out,
        "decision_agreement": decision_agreement,
        "exact_text_match": exact_text_match,
        "mean_jaccard": mean_jaccard,
        "by_level": by_level,
    }

    with open(OUT_FILE, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\nWritten {len(configs_out)} configs to {OUT_FILE}")
    print(f"File size: {os.path.getsize(OUT_FILE):,} bytes")


if __name__ == "__main__":
    main()
