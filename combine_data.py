#!/usr/bin/env python3
"""
combine_data.py — Combine completed probe data into viz/data/real/ for analytics.

Reads all data/*/probe_results_macro.csv files (skipping archive/),
creates viz/data/real/all_macro.csv and copies per-config CSVs.

Usage:
    python3 combine_data.py          # combine all complete configs
    python3 combine_data.py --force  # overwrite existing real/ dir
"""

import csv
import os
import sys
import shutil
from pathlib import Path

ROOT = Path(__file__).parent
DATA_DIR = ROOT / "data"
REAL_DIR = ROOT / "viz" / "data" / "real"
SKIP_DIRS = {"archive", "combined"}


def main():
    force = "--force" in sys.argv

    if REAL_DIR.exists():
        if force:
            shutil.rmtree(REAL_DIR)
        else:
            # Clean up old symlinks and all_macro, but don't error
            pass

    REAL_DIR.mkdir(parents=True, exist_ok=True)

    all_macro_rows = []
    configs_combined = 0

    for config_dir in sorted(DATA_DIR.iterdir()):
        if not config_dir.is_dir():
            continue
        if config_dir.name in SKIP_DIRS:
            continue

        macro_path = config_dir / "probe_results_macro.csv"
        micro_path = config_dir / "probe_results_micro.csv"

        if not macro_path.exists():
            print(f"  SKIP (no macro): {config_dir.name}")
            continue

        # Read macro rows
        with open(macro_path, newline="", encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
            all_macro_rows.extend(rows)

        # Copy CSV files to real/ (not symlinks — symlinks break HTTP serving)
        dest_dir = REAL_DIR / config_dir.name
        if dest_dir.exists():
            shutil.rmtree(dest_dir)
        dest_dir.mkdir(parents=True)

        for csv_file in config_dir.glob("*.csv"):
            shutil.copy2(csv_file, dest_dir / csv_file.name)

        configs_combined += 1
        n_rows = len(rows)
        print(f"  OK: {config_dir.name} ({n_rows} levels)")

    if not all_macro_rows:
        print("No complete configs found!")
        sys.exit(1)

    # Write combined all_macro.csv
    all_macro_path = REAL_DIR / "all_macro.csv"
    fieldnames = all_macro_rows[0].keys()
    with open(all_macro_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_macro_rows)

    # Copy agents.json into viz/ so town.html can access it via HTTP
    agents_src = ROOT / "agents" / "agents.json"
    agents_dest = ROOT / "viz" / "agents" / "agents.json"
    if agents_src.exists():
        agents_dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(agents_src, agents_dest)
        print(f"  Copied agents.json → viz/agents/")

    print(f"\nCombined {configs_combined} configs → {len(all_macro_rows)} rows")
    print(f"Output: {all_macro_path}")
    print(f"\nTo use: update viz/config.js DATA_BASE to 'data/real'")


if __name__ == "__main__":
    main()
