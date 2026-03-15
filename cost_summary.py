#!/usr/bin/env python3
"""Summarize costs across all completed probe runs + project remaining costs."""

import csv
from pathlib import Path

data_dir = Path(__file__).parent / "data"

# All 22 configs from USEFUL_CONFIGS
ALL_CONFIGS = [
    ("anthropic", "claude-opus-4-5",          "off"),
    ("anthropic", "claude-sonnet-4-5",        "off"),
    ("anthropic", "claude-haiku-4-5",         "off"),
    ("anthropic", "claude-sonnet-4-0",        "off"),
    ("anthropic", "claude-3-haiku-20240307",  "off"),
    ("openai",    "gpt-5.2",       "off"),
    ("openai",    "gpt-5.2",       "low"),
    ("openai",    "gpt-5.2",       "medium"),
    ("openai",    "gpt-5.2",       "high"),
    ("openai",    "gpt-5.1",       "off"),
    ("openai",    "gpt-4.1",       "off"),
    ("openai",    "gpt-4o",        "off"),
    ("openai",    "gpt-3.5-turbo", "off"),
    ("openai",    "o3",            "required"),
    ("gemini",    "gemini-3-flash-preview",   "off"),
    ("gemini",    "gemini-3-flash-preview",   "low"),
    ("gemini",    "gemini-3-flash-preview",   "medium"),
    ("gemini",    "gemini-3-flash-preview",   "high"),
    ("gemini",    "gemini-2.5-flash-lite",    "off"),
    ("gemini",    "gemini-2.5-flash",         "off"),
    ("gemini",    "gemini-2.0-flash",         "off"),
]

# Pricing per 1M tokens (input, output)
PRICING = {
    "claude-opus-4-5":          (5.00, 25.00),
    "claude-sonnet-4-5":        (3.00, 15.00),
    "claude-haiku-4-5":         (1.00, 5.00),
    "claude-sonnet-4-0":        (3.00, 15.00),
    "claude-3-haiku-20240307":  (0.25, 1.25),
    "gpt-5.2":       (1.75, 14.00),
    "gpt-5.1":       (1.25, 10.00),
    "gpt-4.1":       (2.00, 8.00),
    "gpt-4o":        (2.50, 10.00),
    "gpt-3.5-turbo": (0.50, 1.50),
    "o3":            (2.00, 8.00),
    "gemini-3-flash-preview":   (0.50, 3.00),
    "gemini-2.5-flash-lite":    (0.10, 0.40),
    "gemini-2.5-flash":         (0.30, 2.50),
    "gemini-2.0-flash":         (0.10, 0.40),
}

# Baseline: ~242 input tokens, ~86 output tokens per call (from gpt-5.2 off)
# Reasoning multipliers for output tokens (estimated from o3 data)
REASONING_OUTPUT_MULT = {"off": 1.0, "low": 2.0, "medium": 3.5, "high": 5.0, "required": 5.4}
BASE_INPUT_TOKENS = 242
BASE_OUTPUT_TOKENS = 86
CALLS_PER_CONFIG = 20_000


def dir_name(provider, model, reasoning):
    safe_model = model.replace(".", "_").replace("-", "-")
    # Match actual directory naming convention
    return f"{provider}_{model.replace('.', '_')}_{reasoning}"


def get_actual_cost(config_dir_path):
    """Read actual cost from macro or micro CSV. Returns (calls, cost, is_complete)."""
    macro = config_dir_path / "probe_results_macro.csv"
    micro = config_dir_path / "probe_results_micro.csv"

    if not macro.exists() and not micro.exists():
        return 0, 0.0, False

    total_cost = 0.0
    n_calls = 0
    is_complete = macro.exists()

    if macro.exists():
        with open(macro) as f:
            for row in csv.DictReader(f):
                total_cost += float(row.get("total_cost") or 0)
                n_calls += int(row.get("n_total") or 0)
    else:
        with open(micro) as f:
            for row in csv.DictReader(f):
                try:
                    total_cost += float(row.get("cost") or 0)
                except (ValueError, TypeError):
                    pass
                n_calls += 1

    return n_calls, total_cost, is_complete


def estimate_cost(model, reasoning):
    """Estimate cost for a full 20K call config."""
    if model not in PRICING:
        return 0.0
    inp_price, out_price = PRICING[model]
    mult = REASONING_OUTPUT_MULT.get(reasoning, 1.0)
    input_cost = BASE_INPUT_TOKENS * CALLS_PER_CONFIG / 1_000_000 * inp_price
    output_cost = BASE_OUTPUT_TOKENS * mult * CALLS_PER_CONFIG / 1_000_000 * out_price
    return input_cost + output_cost


print(f"{'Config':<50} {'Status':>10} {'Calls':>7} {'Actual $':>10} {'Est. $':>10}")
print("=" * 92)

actual_total = 0.0
estimated_remaining = 0.0
all_estimated = 0.0

for provider, model, reasoning in ALL_CONFIGS:
    dname = f"{provider}_{model.replace('.', '_')}_{reasoning}"
    config_path = data_dir / dname
    calls, actual, is_complete = get_actual_cost(config_path)
    est = estimate_cost(model, reasoning)
    all_estimated += est

    if is_complete:
        status = "DONE"
        actual_total += actual
        print(f"{dname:<50} {status:>10} {calls:>7} ${actual:>9.2f} ${est:>9.2f}")
    elif calls > 0:
        status = "partial"
        actual_total += actual
        remaining_est = est * (1 - calls / CALLS_PER_CONFIG)
        estimated_remaining += remaining_est
        print(f"{dname:<50} {status:>10} {calls:>7} ${actual:>9.2f} ${est:>9.2f}")
    else:
        status = "pending"
        estimated_remaining += est
        print(f"{dname:<50} {status:>10} {'—':>7} {'—':>10} ${est:>9.2f}")

print("=" * 92)
print(f"{'Spent so far':<50} {'':>10} {'':>7} ${actual_total:>9.2f}")
print(f"{'Est. remaining':<50} {'':>10} {'':>7} ${estimated_remaining:>9.2f}")
print(f"{'Est. grand total':<50} {'':>10} {'':>7} ${actual_total + estimated_remaining:>9.2f}")
print(f"\nNote: OpenAI dashboard cost is ~40-60% of tracked (prompt caching).")
print(f"      Anthropic matches dashboard exactly.")
print(f"      Reasoning multipliers are estimates — actual may vary.")
