#!/usr/bin/env python3
"""
GABM Mobility Curve — Verbosity Stats Pre-computation

Computes output token distribution stats per model and per model×infection level.
Output: viz/data/real/verbosity_stats.json

Used by Figures 35-36 (Verbosity) in analytics.html.
"""

import csv
import json
import os
from collections import defaultdict
from pathlib import Path

from configs import CONFIGS

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "viz" / "data" / "real"
OUT_FILE = DATA_DIR / "verbosity_stats.json"


def percentile(sorted_vals, p):
    """Compute percentile from sorted list."""
    if not sorted_vals:
        return 0
    k = (len(sorted_vals) - 1) * p / 100.0
    f = int(k)
    c = f + 1 if f + 1 < len(sorted_vals) else f
    d = k - f
    return sorted_vals[f] + d * (sorted_vals[c] - sorted_vals[f])


def compute_dist_stats(values):
    """Compute distribution stats from a list of numeric values."""
    if not values:
        return {"mean": 0, "median": 0, "p10": 0, "p25": 0, "p75": 0, "p90": 0, "min": 0, "max": 0}
    s = sorted(values)
    n = len(s)
    return {
        "mean": round(sum(s) / n, 1),
        "median": round(percentile(s, 50), 1),
        "p10": round(percentile(s, 10), 1),
        "p25": round(percentile(s, 25), 1),
        "p75": round(percentile(s, 75), 1),
        "p90": round(percentile(s, 90), 1),
        "min": s[0],
        "max": s[-1],
    }


def process_config(micro_path):
    """Process one config. Returns by_model stats and by_level stats."""
    output_tokens = []
    reasoning_tokens = []
    total_cost = 0.0
    by_level = defaultdict(lambda: {"output": [], "reasoning": []})

    with open(micro_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            ot = int(row["output_tokens"])
            rt = int(row["reasoning_tokens"])
            cost = float(row["cost"])
            level = row["infection_level"]

            output_tokens.append(ot)
            reasoning_tokens.append(rt)
            total_cost += cost
            by_level[level]["output"].append(ot)
            by_level[level]["reasoning"].append(rt)

    model_stats = {
        "output_tokens": compute_dist_stats(output_tokens),
        "reasoning_tokens": compute_dist_stats(reasoning_tokens),
        "total_cost_usd": round(total_cost, 2),
    }

    level_stats = {}
    for level in sorted(by_level.keys(), key=float):
        vals = by_level[level]
        n = len(vals["output"])
        level_stats[level] = {
            "mean_output": round(sum(vals["output"]) / n, 1) if n else 0,
            "mean_reasoning": round(sum(vals["reasoning"]) / n, 1) if n else 0,
        }

    return model_stats, level_stats


def main():
    configs_out = []
    labels_out = []
    providers_out = []
    by_model = {}
    by_model_by_level = {}

    for cfg in CONFIGS:
        micro_path = DATA_DIR / cfg["dir"] / "probe_results_micro.csv"
        if not micro_path.exists():
            print(f"SKIP: {cfg['dir']} — no micro CSV")
            continue

        print(f"Processing {cfg['dir']}...", end=" ", flush=True)
        model_stats, level_stats = process_config(micro_path)

        configs_out.append(cfg["dir"])
        labels_out.append(cfg["label"])
        providers_out.append(cfg["provider"])
        by_model[cfg["dir"]] = model_stats
        by_model_by_level[cfg["dir"]] = level_stats

        ot = model_stats["output_tokens"]
        print(f"output tokens: median={ot['median']}, mean={ot['mean']}, cost=${model_stats['total_cost_usd']}")

    result = {
        "configs": configs_out,
        "labels": labels_out,
        "providers": providers_out,
        "by_model": by_model,
        "by_model_by_level": by_model_by_level,
    }

    with open(OUT_FILE, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\nWritten {len(configs_out)} configs to {OUT_FILE}")
    print(f"File size: {os.path.getsize(OUT_FILE):,} bytes")


if __name__ == "__main__":
    main()
