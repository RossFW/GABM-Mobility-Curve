#!/usr/bin/env python3
"""
GABM Mobility Curve — Agent Consistency Pre-computation

Computes per-agent stay-home rates for all 21 configs.
Output: viz/data/real/agent_consistency.json

Used by Figure 27 (Spearman rank correlation matrix) in analytics.html.
"""

import csv
import json
import os
from pathlib import Path

from configs import CONFIGS

# Resolve paths relative to this script
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "viz" / "data" / "real"
OUT_FILE = DATA_DIR / "agent_consistency.json"


def compute_agent_rates(micro_path):
    """Compute per-agent stay-home rate from a micro CSV."""
    agent_counts = {}  # agent_id -> {yes: int, total: int}
    with open(micro_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            aid = int(row["agent_id"])
            if aid not in agent_counts:
                agent_counts[aid] = {"yes": 0, "total": 0}
            agent_counts[aid]["total"] += 1
            if row["response"] == "yes":
                agent_counts[aid]["yes"] += 1

    # Return rates sorted by agent_id (0-99)
    rates = []
    for aid in sorted(agent_counts.keys()):
        c = agent_counts[aid]
        rates.append(round(c["yes"] / c["total"], 6) if c["total"] > 0 else 0)
    return rates


def main():
    configs_out = []
    labels_out = []
    providers_out = []
    rates_out = []

    for cfg in CONFIGS:
        micro_path = DATA_DIR / cfg["dir"] / "probe_results_micro.csv"
        if not micro_path.exists():
            print(f"SKIP: {cfg['dir']} — no micro CSV")
            continue

        rates = compute_agent_rates(micro_path)
        configs_out.append(cfg["dir"])
        labels_out.append(cfg["label"])
        providers_out.append(cfg["provider"])
        rates_out.append(rates)
        print(f"  {cfg['dir']}: {len(rates)} agents, mean rate = {sum(rates)/len(rates):.3f}")

    result = {
        "configs": configs_out,
        "labels": labels_out,
        "providers": providers_out,
        "rates": rates_out,
    }

    with open(OUT_FILE, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\nWritten {len(configs_out)} configs to {OUT_FILE}")
    print(f"File size: {os.path.getsize(OUT_FILE):,} bytes")


if __name__ == "__main__":
    main()
