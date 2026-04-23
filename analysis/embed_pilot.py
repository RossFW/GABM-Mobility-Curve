#!/usr/bin/env python3
"""
Pilot embedding run — takes a random sample of N reasoning_text responses
across all configs, calls OpenAI text-embedding-3-large, and reports actual
token usage + cost so we can extrapolate to the full 420k.

Usage:
  python analysis/embed_pilot.py --n 500
  python analysis/embed_pilot.py --n 20000

Output: prints a summary; does NOT save embeddings (this is a dry-run for cost).
"""
import argparse
import csv
import os
import random
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI

# Pricing as of April 2026
PRICE_PER_1M = {
    "text-embedding-3-small": 0.02,
    "text-embedding-3-large": 0.13,
}

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "viz" / "data" / "real"
ENV_FILE = BASE.parent / "GABM-Epidemic" / ".env"

load_dotenv(ENV_FILE)
API_KEY = os.getenv("OPENAI_API_KEY")
if not API_KEY:
    sys.exit(f"OPENAI_API_KEY not found in {ENV_FILE}")


def collect_sample(n_total: int, seed: int = 0) -> list[tuple[str, str]]:
    """Return a random sample of (config_key, reasoning_text) across all configs."""
    all_rows = []
    config_dirs = [d for d in sorted(DATA.iterdir()) if d.is_dir() and (d / "probe_results_micro.csv").exists()]
    for cd in config_dirs:
        with open(cd / "probe_results_micro.csv", newline="") as f:
            rdr = csv.DictReader(f)
            for row in rdr:
                text = (row.get("reasoning_text") or "").strip()
                if text:
                    all_rows.append((cd.name, text))
    rng = random.Random(seed)
    rng.shuffle(all_rows)
    return all_rows[:n_total]


def embed_batch(client, texts, model="text-embedding-3-large"):
    """Batch embed texts, return (embeddings, usage dict)."""
    resp = client.embeddings.create(model=model, input=texts)
    return resp.data, resp.usage


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=500)
    ap.add_argument("--model", default="text-embedding-3-large")
    ap.add_argument("--batch-size", type=int, default=100)
    args = ap.parse_args()

    client = OpenAI(api_key=API_KEY)
    sample = collect_sample(args.n)
    print(f"Collected {len(sample):,} responses across all configs")
    print(f"Model: {args.model}")
    print(f"Batch size: {args.batch_size}")
    print()

    total_tokens = 0
    total_chars = 0
    start = time.time()
    for i in range(0, len(sample), args.batch_size):
        batch = sample[i:i + args.batch_size]
        texts = [t for (_cfg, t) in batch]
        total_chars += sum(len(t) for t in texts)
        try:
            _data, usage = embed_batch(client, texts, args.model)
            total_tokens += usage.total_tokens
        except Exception as e:
            print(f"Batch {i} error: {e}")
            sys.exit(1)
        done = min(i + args.batch_size, len(sample))
        if done % 500 == 0 or done == len(sample):
            elapsed = time.time() - start
            rate = done / elapsed if elapsed else 0
            print(f"  {done:>6,}/{len(sample):,}  tokens={total_tokens:>9,}  elapsed={elapsed:5.1f}s  rate={rate:.0f}/s")
    elapsed = time.time() - start

    price_per_M = PRICE_PER_1M.get(args.model, 0.13)
    actual_cost = total_tokens / 1_000_000 * price_per_M
    avg_tokens = total_tokens / len(sample)

    print()
    print("─" * 60)
    print(f"PILOT SUMMARY  ({args.model})")
    print("─" * 60)
    print(f"Responses embedded         {len(sample):>10,}")
    print(f"Total tokens               {total_tokens:>10,}")
    print(f"Avg tokens / response      {avg_tokens:>10.1f}")
    print(f"Avg chars / response       {total_chars/len(sample):>10.1f}")
    print(f"Price                      ${price_per_M:>9.2f} / 1M tokens")
    print(f"Pilot cost                 ${actual_cost:>10.4f}")
    print(f"Wall time                  {elapsed:>10.1f}s")
    print(f"Throughput                 {len(sample)/elapsed:>10.1f} responses/s")
    print()
    # Extrapolate to the full corpus
    total_responses = 420_000
    proj_tokens = int(avg_tokens * total_responses)
    proj_cost = proj_tokens / 1_000_000 * price_per_M
    proj_time = total_responses / (len(sample) / elapsed) if elapsed else 0
    print(f"EXTRAPOLATION to {total_responses:,} responses:")
    print(f"  Projected tokens         {proj_tokens:>10,}")
    print(f"  Projected cost           ${proj_cost:>10.2f}")
    print(f"  Projected wall time      {proj_time/60:>10.1f} min")


if __name__ == "__main__":
    main()
