"""
ping_models.py
--------------
Lightweight connectivity test for all 23 USEFUL_CONFIGS.

Sends one API call per config: 'Say "Hi." and briefly state which AI model you are.'
Reports: status, response snippet, token counts, cost, and any routing clues.
Especially useful for detecting if gemini-3-flash-preview is live or has been
deprecated/rerouted (like gemini-3-pro-preview was on March 9, 2026).

Usage:
    # Dry run — show configs, no API calls
    python ping_models.py --dry-run

    # Ping all 23 configs (costs ~$0.01 total)
    python ping_models.py

    # Ping a single provider
    python ping_models.py --provider gemini

    # Ping a specific model
    python ping_models.py --model gemini-3-flash-preview

Saves results to: data/ping_tests/ping_YYYYMMDD_HHMMSS.csv

DO NOT RUN WITHOUT USER APPROVAL — this makes real API calls.
"""

import argparse
import csv
import sys
import time
from datetime import datetime
from pathlib import Path

# ── Provider import (from sibling GABM-Epidemic repo) ─────────────────────────
sys.path.insert(0, str(Path(__file__).parent.parent / "GABM-Epidemic"))
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / "GABM-Epidemic" / ".env")

from providers import create_provider, calculate_cost

# ── 23 configs to ping ────────────────────────────────────────────────────────
USEFUL_CONFIGS = [
    # ── Anthropic — off only ──────────────────────────────────────────────────
    ("anthropic", "claude-opus-4-5",          "off"),
    ("anthropic", "claude-sonnet-4-5",         "off"),
    ("anthropic", "claude-haiku-4-5",          "off"),
    ("anthropic", "claude-sonnet-4-0",         "off"),
    ("anthropic", "claude-3-haiku-20240307",   "off"),
    # ── OpenAI ───────────────────────────────────────────────────────────────
    ("openai",    "gpt-5.2",                   "off"),
    ("openai",    "gpt-5.2",                   "low"),
    ("openai",    "gpt-5.2",                   "medium"),
    ("openai",    "gpt-5.2",                   "high"),
    ("openai",    "gpt-5.1",                   "off"),
    ("openai",    "gpt-5.1",                   "high"),
    ("openai",    "gpt-4.1",                   "off"),
    ("openai",    "gpt-4o",                    "off"),
    ("openai",    "gpt-3.5-turbo",             "off"),
    ("openai",    "o3",                        "required"),
    # ── Gemini ───────────────────────────────────────────────────────────────
    # NOTE: gemini-3-flash-preview was alive as of early March 2026.
    # gemini-3-pro-preview was shut down March 9, 2026. Ping these first.
    ("gemini",    "gemini-3-flash-preview",    "off"),
    ("gemini",    "gemini-3-flash-preview",    "low"),
    ("gemini",    "gemini-3-flash-preview",    "medium"),
    ("gemini",    "gemini-3-flash-preview",    "high"),
    ("gemini",    "gemini-2.5-flash-lite",     "off"),
    ("gemini",    "gemini-2.5-flash",          "off"),
    ("gemini",    "gemini-2.0-flash",          "off"),
]

PING_MESSAGE = 'Say "Hi." and briefly state which AI model you are (e.g. model family and version if known).'

OUTPUT_FIELDS = [
    "provider", "model", "reasoning",
    "status",           # ok / error
    "response",         # first 200 chars of response text
    "error_msg",        # error details if status=error
    "routing_note",     # any routing/version clues from response
    "input_tokens", "output_tokens", "reasoning_tokens",
    "cost_usd",
    "latency_s",
    "timestamp",
]


def ping_one(provider_name: str, model: str, reasoning: str) -> dict:
    """Send one ping call and return result dict."""
    base = {
        "provider": provider_name,
        "model": model,
        "reasoning": reasoning,
        "timestamp": datetime.now().isoformat(timespec="seconds"),
    }

    try:
        provider = create_provider(provider_name, model, reasoning=reasoning, max_retries=2)
    except Exception as e:
        return {**base, "status": "error", "response": "", "error_msg": f"create_provider: {e}",
                "routing_note": "", "input_tokens": 0, "output_tokens": 0,
                "reasoning_tokens": 0, "cost_usd": 0.0, "latency_s": 0.0}

    messages = [{"role": "user", "content": PING_MESSAGE}]
    t0 = time.time()
    try:
        result = provider.get_completion(messages, temperature=0)
        latency = round(time.time() - t0, 2)

        text = result.text or ""
        usage = result.usage
        cost = calculate_cost(provider_name, model,
                              usage.input_tokens, usage.output_tokens,
                              reasoning_tokens=usage.reasoning_tokens)

        # Look for routing clues in the response (e.g. "Gemini 3.1" or "Gemini 1.5")
        routing_note = ""
        text_lower = text.lower()
        for clue in ["3.1", "3.0", "2.5", "2.0", "1.5", "flash-lite", "flash preview",
                     "pro preview", "sonnet", "haiku", "opus", "gpt-5", "gpt-4", "o3"]:
            if clue in text_lower:
                routing_note = f"mentions '{clue}'"
                break

        return {
            **base,
            "status": "ok",
            "response": text[:200].replace("\n", " "),
            "error_msg": "",
            "routing_note": routing_note,
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "reasoning_tokens": usage.reasoning_tokens,
            "cost_usd": round(cost, 8),
            "latency_s": latency,
        }

    except Exception as e:
        latency = round(time.time() - t0, 2)
        return {
            **base,
            "status": "error",
            "response": "",
            "error_msg": str(e)[:300],
            "routing_note": "",
            "input_tokens": 0, "output_tokens": 0, "reasoning_tokens": 0,
            "cost_usd": 0.0,
            "latency_s": latency,
        }


def main():
    parser = argparse.ArgumentParser(description="Ping all 23 probe model configs")
    parser.add_argument("--dry-run",  action="store_true", help="Show plan, no API calls")
    parser.add_argument("--provider", default=None, help="Filter to one provider")
    parser.add_argument("--model",    default=None, help="Filter to one model (all reasoning levels)")
    args = parser.parse_args()

    configs = USEFUL_CONFIGS
    if args.provider:
        configs = [(p, m, r) for p, m, r in configs if p == args.provider]
    if args.model:
        configs = [(p, m, r) for p, m, r in configs if m == args.model]

    print("=" * 65)
    print(f"GABM Mobility Curve — Model Ping ({len(configs)} configs)")
    print("=" * 65)
    print(f"Message: \"{PING_MESSAGE[:60]}...\"")
    print()

    if args.dry_run:
        print("[DRY RUN — no API calls]\n")
        for i, (p, m, r) in enumerate(configs, 1):
            print(f"  {i:2d}. {p:10s} {m:35s} [{r}]")
        print(f"\nTotal: {len(configs)} configs")
        return

    print(f"{'#':>3}  {'PROVIDER':10s} {'MODEL':35s} {'REASONING':8s}  {'STATUS':6s}  {'LATENCY':8s}  {'COST':10s}")
    print("-" * 90)

    results = []
    total_cost = 0.0
    n_ok = 0
    n_err = 0

    for i, (provider_name, model, reasoning) in enumerate(configs, 1):
        print(f"  {i:2d}. {provider_name:10s} {model:35s} [{reasoning:8s}]  ", end="", flush=True)

        row = ping_one(provider_name, model, reasoning)
        results.append(row)

        if row["status"] == "ok":
            n_ok += 1
            total_cost += row["cost_usd"]
            routing = f"  ← {row['routing_note']}" if row["routing_note"] else ""
            print(f"  OK    {row['latency_s']:5.1f}s  ${row['cost_usd']:.6f}{routing}")
            # Show response on next line if it contains something interesting
            resp = row["response"]
            if resp:
                print(f"       └─ {resp[:100]}")
        else:
            n_err += 1
            print(f"  ERROR  ---    $0.000000")
            print(f"       └─ {row['error_msg'][:100]}")

    # Save results
    out_dir = Path(__file__).parent / "data" / "ping_tests"
    out_dir.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_path = out_dir / f"ping_{timestamp}.csv"

    with open(out_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=OUTPUT_FIELDS)
        writer.writeheader()
        writer.writerows(results)

    print("\n" + "=" * 65)
    print(f"Results: {n_ok} OK, {n_err} ERRORS")
    print(f"Total cost: ${total_cost:.6f}")
    print(f"Saved: {out_path}")

    # Flag Gemini 3 status explicitly
    gemini3 = [r for r in results if "gemini-3" in r["model"]]
    if gemini3:
        print("\nGemini-3 model status:")
        for r in gemini3:
            status_str = "✓ LIVE" if r["status"] == "ok" else "✗ DEAD"
            note = f"  ({r['routing_note']})" if r["routing_note"] else ""
            print(f"  {status_str}  {r['model']} [{r['reasoning']}]{note}")
            if r["status"] == "error":
                print(f"         Error: {r['error_msg'][:80]}")


if __name__ == "__main__":
    main()
