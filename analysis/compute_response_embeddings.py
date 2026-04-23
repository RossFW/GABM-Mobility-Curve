#!/usr/bin/env python3
"""
Embed every reasoning_text response with OpenAI text-embedding-3-large
using a thread pool for parallelism. Writes one .npz per config with
per-row embeddings + the minimal metadata needed by downstream analyses
(idea 3: reasoning diversity; idea 4: within-vs-across persona similarity;
idea 1: decision-driver keyword cross-checks).

Output per config:
  viz/data/real/{config}/response_embeddings.npz
    - agent_id:        int64   [n]
    - rep:             int64   [n]
    - infection_level: float64 [n]
    - embedding:       float32 [n, DIMS]
    - row_idx:         int64   [n]   row in probe_results_micro.csv
  viz/data/real/embedding_meta.json
    - per-config token usage, cost, timing, sha of model name

Resume-safe: if a config's .npz already exists and matches row count, it is
skipped. Delete the file to re-embed.

Usage:
  python analysis/compute_response_embeddings.py --workers 20
  python analysis/compute_response_embeddings.py --only anthropic_claude-opus-4-5_off
  python analysis/compute_response_embeddings.py --dry-run   # prints plan only
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from pathlib import Path
from threading import Lock

import numpy as np
from dotenv import load_dotenv
from openai import OpenAI

MODEL = "text-embedding-3-large"
DIMS = 3072  # native size; downstream can slice to 1024 if needed (Matryoshka)
PRICE_PER_1M = 0.13
BATCH_SIZE = 100
MAX_TPM = 10_000_000  # OpenAI limit shown in user's account

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "viz" / "data" / "real"
ENV_FILE = BASE.parent / "GABM-Epidemic" / ".env"
META_FILE = DATA / "embedding_meta.json"

load_dotenv(ENV_FILE)
API_KEY = os.getenv("OPENAI_API_KEY")
if not API_KEY:
    sys.exit(f"OPENAI_API_KEY not found in {ENV_FILE}")


def load_config_rows(config_dir: Path):
    """Return list of dicts {row_idx, agent_id, rep, infection_level, text}"""
    micro = config_dir / "probe_results_micro.csv"
    if not micro.exists():
        return []
    rows = []
    with open(micro, newline="") as f:
        rdr = csv.DictReader(f)
        for i, r in enumerate(rdr):
            text = (r.get("reasoning_text") or "").strip()
            rows.append({
                "row_idx": i,
                "agent_id": int(r["agent_id"]),
                "rep": int(r.get("rep", 0)),
                "infection_level": float(r.get("infection_level", 0.0)),
                "text": text,
            })
    return rows


def embed_batch(client, texts, retries=4):
    """Call embeddings endpoint with retry on transient errors."""
    delay = 2.0
    for attempt in range(retries):
        try:
            resp = client.embeddings.create(model=MODEL, input=texts)
            return resp
        except Exception as e:
            if attempt == retries - 1:
                raise
            time.sleep(delay)
            delay *= 2


def process_config(client, config_dir: Path, workers: int, verbose=True):
    """Embed all responses for one config. Writes response_embeddings.npz."""
    out_file = config_dir / "response_embeddings.npz"
    rows = load_config_rows(config_dir)
    n = len(rows)
    if n == 0:
        return {"skipped": True, "reason": "no micro CSV"}

    # Resume guard: if existing file matches row count, skip.
    if out_file.exists():
        try:
            existing = np.load(out_file, allow_pickle=False)
            if existing["embedding"].shape == (n, DIMS):
                return {"skipped": True, "reason": "already done", "n": n}
        except Exception:
            pass  # file corrupt — re-embed

    # Build batches preserving order: batches[i] = list of (row_idx, text)
    batches = []
    for i in range(0, n, BATCH_SIZE):
        chunk = rows[i:i + BATCH_SIZE]
        batches.append((i, [(r["row_idx"], r["text"]) for r in chunk]))

    # Pre-allocate output array
    embeddings = np.zeros((n, DIMS), dtype=np.float32)
    token_counter = {"total": 0, "lock": Lock()}
    errors = []

    t0 = time.time()

    def do_batch(batch_tuple):
        start_idx, batch = batch_tuple
        texts = [t for (_i, t) in batch]
        try:
            resp = embed_batch(client, texts)
        except Exception as e:
            return (start_idx, None, 0, f"{type(e).__name__}: {e}")
        # fill embeddings
        for local_i, item in enumerate(resp.data):
            embeddings[start_idx + local_i] = np.asarray(item.embedding, dtype=np.float32)
        return (start_idx, len(batch), resp.usage.total_tokens, None)

    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = [ex.submit(do_batch, b) for b in batches]
        done = 0
        for fut in as_completed(futures):
            start_idx, got, tokens, err = fut.result()
            if err:
                errors.append((start_idx, err))
                continue
            done += got
            with token_counter["lock"]:
                token_counter["total"] += tokens
            if verbose and done % 2000 == 0:
                elapsed = time.time() - t0
                print(f"  [{config_dir.name}] {done:>6,}/{n:,}  "
                      f"tokens={token_counter['total']:>10,}  "
                      f"{elapsed:5.1f}s  {done/elapsed:.0f}/s")

    elapsed = time.time() - t0

    if errors:
        print(f"  [{config_dir.name}] ERRORS: {len(errors)} batches failed")
        for idx, msg in errors[:5]:
            print(f"    batch@{idx}: {msg}")
        return {"error": f"{len(errors)} batches failed"}

    # Write npz
    np.savez_compressed(
        out_file,
        agent_id=np.array([r["agent_id"] for r in rows], dtype=np.int64),
        rep=np.array([r["rep"] for r in rows], dtype=np.int64),
        infection_level=np.array([r["infection_level"] for r in rows], dtype=np.float64),
        row_idx=np.array([r["row_idx"] for r in rows], dtype=np.int64),
        embedding=embeddings,
    )
    size_mb = out_file.stat().st_size / 1e6
    cost = token_counter["total"] / 1_000_000 * PRICE_PER_1M
    return {
        "n": n,
        "tokens": token_counter["total"],
        "cost_usd": round(cost, 4),
        "elapsed_s": round(elapsed, 1),
        "file_mb": round(size_mb, 1),
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--workers", type=int, default=20)
    ap.add_argument("--only", default=None, help="config substring filter")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    configs = sorted([d for d in DATA.iterdir() if d.is_dir() and (d / "probe_results_micro.csv").exists()])
    if args.only:
        configs = [c for c in configs if args.only in c.name]
    print(f"Model: {MODEL}  dims={DIMS}  price=${PRICE_PER_1M}/1M tokens")
    print(f"Workers: {args.workers}  batch_size={BATCH_SIZE}")
    print(f"Configs: {len(configs)}")
    print()

    if args.dry_run:
        for c in configs:
            print(f"  will embed: {c.name}")
        return

    client = OpenAI(api_key=API_KEY)
    meta = {}
    if META_FILE.exists():
        meta = json.loads(META_FILE.read_text())

    t_start = time.time()
    total_tokens = 0
    total_cost = 0.0

    for i, cd in enumerate(configs):
        print(f"[{i+1}/{len(configs)}] {cd.name}")
        result = process_config(client, cd, workers=args.workers)
        print(f"  → {result}")
        meta[cd.name] = {"model": MODEL, **result, "ts": time.time()}
        # Persist meta after each config so a crash still records progress
        META_FILE.write_text(json.dumps(meta, indent=2))
        if "tokens" in result:
            total_tokens += result["tokens"]
            total_cost += result["cost_usd"]

    total_elapsed = time.time() - t_start
    print()
    print("─" * 60)
    print(f"TOTAL")
    print("─" * 60)
    print(f"Tokens     {total_tokens:>12,}")
    print(f"Cost       ${total_cost:>11.2f}")
    print(f"Wall time  {total_elapsed/60:>11.1f} min")


if __name__ == "__main__":
    main()
