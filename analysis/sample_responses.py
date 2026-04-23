#!/usr/bin/env python3
"""Print random reasoning_text samples to stdout for manual inspection.

Used to pick decision-driver keyword vocabulary for Fig 1 (idea 1).
"""
import csv
import random
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "viz" / "data" / "real"

N_PER_CONFIG = 5
SEED = 0

configs = sorted([d for d in DATA.iterdir() if d.is_dir() and (d / "probe_results_micro.csv").exists()])
rng = random.Random(SEED)

for cd in configs:
    with open(cd / "probe_results_micro.csv", newline="") as f:
        rows = [r for r in csv.DictReader(f) if (r.get("reasoning_text") or "").strip()]
    sample = rng.sample(rows, min(N_PER_CONFIG, len(rows)))
    print(f"\n{'='*70}\n{cd.name}  ({len(rows):,} responses)\n{'='*70}")
    for r in sample:
        aid = r.get("agent_id"); lv = r.get("infection_level"); dec = r.get("response")
        print(f"\n--- agent {aid} · infection {lv} · decision={dec} ---")
        print((r.get("reasoning_text") or "")[:500])
