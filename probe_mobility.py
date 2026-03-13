"""
probe_mobility.py
-----------------
Main probe script for the GABM Mobility Curve study (Paper 3).

For each model config, asks each of 100 frozen agents what they would do
at each of 40 infection levels. Records both micro (per-agent) and macro
(aggregate) responses.

Usage:
    # Dry run — shows config list and estimated call count, no API calls
    python probe_mobility.py --dry-run

    # Single-config test run (cheap validation before full run)
    python probe_mobility.py --test --provider openai --model gpt-3.5-turbo --reasoning off

    # Full run for a single provider
    python probe_mobility.py --provider gemini

    # Full run for all 38 useful configs
    python probe_mobility.py --all

    # Resume interrupted run (skips configs that already have output)
    python probe_mobility.py --all --resume

Options:
    --reps N        Reps per agent per level (default: 5)
    --test-levels N Infection levels to use in --test mode (default: 3)
    --test-reps N   Reps in --test mode (default: 3)
"""

import argparse
import csv
import json
import os
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from pathlib import Path

# ── Provider import (from sibling GABM-Epidemic repo) ─────────────────────────
sys.path.insert(0, str(Path(__file__).parent.parent / "GABM-Epidemic"))
from dotenv import load_dotenv
load_dotenv(Path(__file__).parent.parent / "GABM-Epidemic" / ".env")
from providers import create_provider, calculate_cost

# ── Constants ─────────────────────────────────────────────────────────────────

AGENTS_FILE = Path(__file__).parent / "agents" / "agents.json"
DATA_DIR    = Path(__file__).parent / "data"

# Default parallel workers per provider (based on rate limit tier).
# Override with --workers N on the CLI.
#   Anthropic Custom Plan: 4K RPM → 20 workers (latency-bound, not rate-bound)
#   OpenAI    Tier 5:      very high limits → 20 workers fine
#   Gemini    Paid tier 3: 1000+ RPM → 10 workers fine
PROVIDER_DEFAULT_WORKERS = {
    "anthropic": 20,
    "openai":    20,
    "gemini":    10,
}

# 40 infection levels: 0–3.5% in 0.1% steps (ecologically valid range per Round #2
# Full Feedback data, max 3.4%), plus 4–7% to characterize curve saturation.
# See docs/SAMPLING.md for full justification.
INFECTION_LEVELS = [
    0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
    1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9,
    2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9,
    3.0, 3.1, 3.2, 3.3, 3.4, 3.5,
    4.0, 5.0, 6.0, 7.0,
]

# Model configs marked "useful" in cost_estimates.xlsx
USEFUL_CONFIGS = [
    # ── Anthropic — off only (reasoning too expensive) ─────────────────────────
    # Cross-sectional baselines across Anthropic model tiers and generations
    ("anthropic", "claude-opus-4-5",          "off"),   # flagship
    ("anthropic", "claude-sonnet-4-5",         "off"),   # mid (Sep 2025)
    ("anthropic", "claude-haiku-4-5",          "off"),   # lite (Oct 2025)
    ("anthropic", "claude-sonnet-4-0",         "off"),   # mid (May 2025, prev gen)
    ("anthropic", "claude-3-haiku-20240307",   "off"),   # legacy baseline (Papers 1&2 era)

    # ── OpenAI ─────────────────────────────────────────────────────────────────
    # Pair A: gpt-5.2 full reasoning sweep (Jan 2026, matched with gemini-3-flash)
    ("openai",    "gpt-5.2",       "off"),
    ("openai",    "gpt-5.2",       "low"),
    ("openai",    "gpt-5.2",       "medium"),
    ("openai",    "gpt-5.2",       "high"),
    # Pair B: gpt-5.1 off + high only (longitudinal: Nov 2025 vs Jan 2026)
    ("openai",    "gpt-5.1",       "off"),
    ("openai",    "gpt-5.1",       "high"),
    # Cross-sectional baselines
    ("openai",    "gpt-4.1",       "off"),
    ("openai",    "gpt-4o",        "off"),
    ("openai",    "gpt-3.5-turbo", "off"),   # Papers 1&2 legacy baseline
    # Reasoning anchor
    ("openai",    "o3",            "required"),

    # ── Gemini ─────────────────────────────────────────────────────────────────
    # Pair A: gemini-3-flash-preview full reasoning sweep (Jan 2026, matched with gpt-5.2)
    # NOTE: verify gemini-3-flash-preview is still live before running
    ("gemini",    "gemini-3-flash-preview",    "off"),
    ("gemini",    "gemini-3-flash-preview",    "low"),
    ("gemini",    "gemini-3-flash-preview",    "medium"),
    ("gemini",    "gemini-3-flash-preview",    "high"),
    # Size comparison — flash-lite tier (Dim 4)
    ("gemini",    "gemini-2.5-flash-lite",     "off"),   # lite/small tier (Jun 2025)
    # Cross-sectional baselines
    ("gemini",    "gemini-2.5-flash",          "off"),   # prev gen flash (May 2025)
    ("gemini",    "gemini-2.0-flash",          "off"),   # legacy, no thinking
]

MICRO_FIELDS = [
    "provider", "model", "reasoning",
    "agent_id", "agent_name", "age", "traits",
    "infection_level", "rep",
    "response", "reasoning_text",
    "input_tokens", "output_tokens", "reasoning_tokens", "cost",
    "format_valid",
]

MACRO_FIELDS = [
    "provider", "model", "reasoning",
    "infection_level",
    "n_yes", "n_no", "n_total",
    "pct_stay_home",
    "total_input_tokens", "total_output_tokens", "total_reasoning_tokens",
    "total_cost",
]


# ── Prompt builder ─────────────────────────────────────────────────────────────

def build_prompt(agent: dict, infection_pct: float) -> str:
    return f"""You are {agent['name']}. You are {agent['age']} years old.
You are a person who is {agent['traits_str']}.
You live in the town of Dewberry Hollow. You have a job and go to the office for work every day.
You feel healthy and well.
You know about the Catasat virus spreading across the country. It is an airborne virus causing an infectious disease that spreads from human to human. The deadliness of the virus is unknown.
You check the newspaper and find that {infection_pct:.1f}% of Dewberry Hollow's population were diagnosed with new infections of the Catasat virus yesterday.
Should you stay at home for the entire day? Please provide your reasoning.

If the answer is "Yes", please state your reasoning as "Reasoning: [explanation]."
If the answer is "No", please state your reasoning as "Reasoning: [explanation]."

The format should be as follows:
Reasoning:
Response:

Example:
Reasoning: You are tired.
Response: Yes

You have to provide Response in a single word; it must be either "Yes" or "No"."""


# ── Response parser ────────────────────────────────────────────────────────────

def parse_response(text: str) -> tuple[str, str, bool]:
    """Returns (response, reasoning_text, format_valid)."""
    reasoning = ""
    response = ""
    format_valid = True
    try:
        if "Reasoning:" in text:
            parts = text.split("Reasoning:", 1)[1]
            if "Response:" in parts:
                reasoning = parts.split("Response:", 1)[0].strip()
                response_raw = parts.split("Response:", 1)[1].strip().split()[0]
                response = response_raw.rstrip(".,;").lower()
            else:
                format_valid = False
        else:
            format_valid = False

        if response not in ("yes", "no"):
            format_valid = False
            response = ""
    except Exception:
        format_valid = False

    return response, reasoning, format_valid


# ── Config output path ─────────────────────────────────────────────────────────

def config_dir(provider: str, model: str, reasoning: str) -> Path:
    safe_model = model.replace("/", "_").replace(".", "_")
    return DATA_DIR / f"{provider}_{safe_model}_{reasoning}"


def micro_csv_path(provider: str, model: str, reasoning: str) -> Path:
    return config_dir(provider, model, reasoning) / "probe_results_micro.csv"


def macro_csv_path(provider: str, model: str, reasoning: str) -> Path:
    return config_dir(provider, model, reasoning) / "probe_results_macro.csv"


# ── Core probe loop ────────────────────────────────────────────────────────────

def run_config(
    provider_name: str,
    model: str,
    reasoning: str,
    agents: list,
    levels: list,
    reps: int,
    workers: int = 10,
) -> None:
    label = f"{provider_name}/{model} [{reasoning}]"
    total_calls = len(agents) * len(levels) * reps
    print(f"\n{'='*60}")
    print(f"Running: {label}")
    print(f"  {len(agents)} agents × {len(levels)} levels × {reps} reps = "
          f"{total_calls} API calls  (workers={workers})")

    out_dir = config_dir(provider_name, model, reasoning)
    out_dir.mkdir(parents=True, exist_ok=True)

    micro_path = micro_csv_path(provider_name, model, reasoning)
    macro_path = macro_csv_path(provider_name, model, reasoning)

    macro_rows = []

    try:
        provider = create_provider(provider_name, model, reasoning=reasoning)
    except Exception as e:
        print(f"  ERROR creating provider: {e}")
        return

    # Write micro CSV header immediately — rows appended after each level
    # so data is preserved if run is interrupted mid-config.
    with open(micro_path, "w", newline="") as f:
        csv.DictWriter(f, fieldnames=MICRO_FIELDS).writeheader()

    total_cost = 0.0
    n_calls = 0
    n_errors = 0
    # Counter for live progress display
    completed_counter = [0]
    counter_lock = threading.Lock()

    def call_one(agent: dict, level: float, rep: int) -> dict | None:
        """Run a single (agent, level, rep) call. Returns row dict or None on error."""
        prompt = build_prompt(agent, level)
        messages = [{"role": "user", "content": prompt}]
        try:
            result = provider.get_completion(messages, temperature=0)
            text = result.text
            usage = result.usage
        except Exception as e:
            with counter_lock:
                completed_counter[0] += 1
            print(f"  WARNING: API error agent {agent['agent_id']} "
                  f"level {level}% rep {rep}: {e}")
            return None

        response, reasoning_text, format_valid = parse_response(text)
        call_cost = calculate_cost(
            provider_name, model,
            usage.input_tokens, usage.output_tokens,
            reasoning_tokens=usage.reasoning_tokens,
        )
        with counter_lock:
            completed_counter[0] += 1
        return {
            "provider": provider_name,
            "model": model,
            "reasoning": reasoning,
            "agent_id": agent["agent_id"],
            "agent_name": agent["name"],
            "age": agent["age"],
            "traits": "|".join(agent["traits"]),
            "infection_level": level,
            "rep": rep,
            "response": response,
            "reasoning_text": reasoning_text,
            "input_tokens": usage.input_tokens,
            "output_tokens": usage.output_tokens,
            "reasoning_tokens": usage.reasoning_tokens,
            "cost": round(call_cost, 8),
            "format_valid": format_valid,
        }

    for level in levels:
        # Build all (agent, rep) tasks for this level
        tasks = [(agent, rep) for agent in agents for rep in range(reps)]

        level_rows = []
        n_yes = n_no = 0
        level_input = level_output = level_reasoning = level_cost = 0

        n_tasks = len(tasks)
        level_done = 0
        print(f"  Level {level:4.1f}%  [0/{n_tasks}]", end="", flush=True)

        with ThreadPoolExecutor(max_workers=workers) as executor:
            futures = {
                executor.submit(call_one, agent, level, rep): (agent["agent_id"], rep)
                for agent, rep in tasks
            }
            for future in as_completed(futures):
                row = future.result()
                level_done += 1
                if level_done % 50 == 0 or level_done == n_tasks:
                    print(f"\r  Level {level:4.1f}%  [{level_done}/{n_tasks}]", end="", flush=True)
                if row is None:
                    n_errors += 1
                    continue
                level_rows.append(row)
                if row["response"] == "yes":
                    n_yes += 1
                elif row["response"] == "no":
                    n_no += 1
                level_input     += row["input_tokens"]
                level_output    += row["output_tokens"]
                level_reasoning += row["reasoning_tokens"]
                level_cost      += row["cost"]
                total_cost      += row["cost"]
                n_calls         += 1

        n_total = n_yes + n_no
        pct = (n_yes / n_total * 100) if n_total > 0 else 0
        macro_rows.append({
            "provider": provider_name,
            "model": model,
            "reasoning": reasoning,
            "infection_level": level,
            "n_yes": n_yes,
            "n_no": n_no,
            "n_total": n_total,
            "pct_stay_home": round(pct, 2),
            "total_input_tokens": level_input,
            "total_output_tokens": level_output,
            "total_reasoning_tokens": level_reasoning,
            "total_cost": round(level_cost, 6),
        })
        # Append this level's rows to micro CSV immediately (crash-safe)
        with open(micro_path, "a", newline="") as f:
            csv.DictWriter(f, fieldnames=MICRO_FIELDS).writerows(level_rows)

        print(f"\r  Level {level:4.1f}%: {pct:5.1f}% stay home "
              f"(yes={n_yes}, no={n_no}, cost=${level_cost:.4f})  [{n_calls} calls total]")

    # Write macro CSV
    with open(macro_path, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=MACRO_FIELDS)
        writer.writeheader()
        writer.writerows(macro_rows)

    print(f"  Completed: {n_calls} calls, {n_errors} errors, total cost ${total_cost:.4f}")
    print(f"  Saved: {micro_path.name}, {macro_path.name}")


# ── CLI ────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="GABM Mobility Curve Probe")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--dry-run",  action="store_true", help="Show plan, no API calls")
    mode.add_argument("--test",     action="store_true", help="Single-config test run")
    mode.add_argument("--all",      action="store_true", help="Run all useful configs")
    mode.add_argument("--provider", metavar="PROVIDER",  help="Run all configs for one provider")

    parser.add_argument("--model",       default=None,  help="Model name (with --test)")
    parser.add_argument("--reasoning",   default="off", help="Reasoning level (with --test)")
    parser.add_argument("--reps",        type=int, default=5,  help="Reps per agent per level")
    parser.add_argument("--workers",     type=int, default=None,
                        help="Parallel API workers per level (default: 3/anthropic, 20/openai, 10/gemini)")
    parser.add_argument("--test-levels", type=int, default=3,  help="Levels to use in --test mode")
    parser.add_argument("--test-reps",   type=int, default=3,  help="Reps in --test mode")
    parser.add_argument("--resume",      action="store_true",  help="Skip completed configs")

    args = parser.parse_args()

    # Load agents
    if not AGENTS_FILE.exists():
        print(f"ERROR: {AGENTS_FILE} not found. Run agents/generate_agents.py first.")
        sys.exit(1)
    with open(AGENTS_FILE) as f:
        agents = json.load(f)
    print(f"Loaded {len(agents)} agents from {AGENTS_FILE.name}")

    # Determine configs and levels to run
    if args.dry_run:
        print(f"\n{'='*60}")
        print(f"DRY RUN — {len(USEFUL_CONFIGS)} useful configs")
        print(f"Levels: {INFECTION_LEVELS}")
        print(f"Reps: {args.reps}")
        calls_per_config = len(agents) * len(INFECTION_LEVELS) * args.reps
        total_calls = calls_per_config * len(USEFUL_CONFIGS)
        print(f"\nCalls per config: {calls_per_config:,}")
        print(f"Total calls (all configs): {total_calls:,}")
        print("\nConfigs:")
        for p, m, r in USEFUL_CONFIGS:
            done = micro_csv_path(p, m, r).exists()
            status = "DONE" if done else "pending"
            print(f"  [{status:7s}] {p:10s} {m:35s} {r}")
        return

    if args.test:
        if not args.model:
            parser.error("--test requires --model")
        # find provider for this model
        provider_name = args.provider
        if not provider_name:
            for p, m, r in USEFUL_CONFIGS:
                if m == args.model:
                    provider_name = p
                    break
        if not provider_name:
            parser.error(f"Could not find provider for model '{args.model}'. "
                         "Specify with --provider.")
        levels = INFECTION_LEVELS[:args.test_levels]
        reps = args.test_reps
        configs = [(provider_name, args.model, args.reasoning)]

    elif args.all:
        levels = INFECTION_LEVELS
        reps = args.reps
        configs = USEFUL_CONFIGS

    else:  # --provider
        levels = INFECTION_LEVELS
        reps = args.reps
        configs = [(p, m, r) for p, m, r in USEFUL_CONFIGS if p == args.provider]
        if not configs:
            print(f"No configs found for provider '{args.provider}'")
            sys.exit(1)

    # Confirmation
    calls_per_config = len(agents) * len(levels) * reps
    total_calls = calls_per_config * len(configs)
    print(f"\nAbout to run {len(configs)} config(s):")
    print(f"  {len(agents)} agents × {len(levels)} levels × {reps} reps = "
          f"{calls_per_config:,} calls/config")
    print(f"  Total: {total_calls:,} API calls")
    print(f"  Levels: {levels}")

    if not args.test:
        confirm = input("\nType 'yes' to proceed: ")
        if confirm.lower() != "yes":
            print("Aborted.")
            return

    # Run
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    for provider_name, model, reasoning in configs:
        if args.resume and macro_csv_path(provider_name, model, reasoning).exists():
            print(f"Skipping (already done): {provider_name}/{model} [{reasoning}]")
            continue
        workers = args.workers if args.workers is not None else PROVIDER_DEFAULT_WORKERS.get(provider_name, 10)
        run_config(provider_name, model, reasoning, agents, levels, reps, workers=workers)

    print("\nAll done.")


if __name__ == "__main__":
    main()
