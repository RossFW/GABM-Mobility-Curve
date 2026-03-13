#!/usr/bin/env python3
"""
Generate mock probe data for the Mobility Curve visualization.

Creates realistic sigmoid mobility curves for all 22 model configs,
with agent personality influencing individual thresholds.
Reads agents/agents.json for the 100 frozen agent personas.

Output: viz/data/mock/{config_key}/probe_results_micro.csv + probe_results_macro.csv
Also: viz/data/mock/all_macro.csv (combined for comparison charts)
"""

import json
import csv
import os
import math
import random
from pathlib import Path

# ── 22 model configurations ────────────────────────────────────
CONFIGS = [
    # Anthropic (5)
    ("anthropic", "claude-opus-4-5", "off"),
    ("anthropic", "claude-sonnet-4-5", "off"),
    ("anthropic", "claude-haiku-4-5", "off"),
    ("anthropic", "claude-sonnet-4-0", "off"),
    ("anthropic", "claude-3-haiku-20240307", "off"),
    # OpenAI (11)
    ("openai", "gpt-5.2", "off"),
    ("openai", "gpt-5.2", "low"),
    ("openai", "gpt-5.2", "medium"),
    ("openai", "gpt-5.2", "high"),
    ("openai", "gpt-5.1", "off"),
    ("openai", "gpt-5.1", "high"),
    ("openai", "gpt-4.1", "off"),
    ("openai", "gpt-4o", "off"),
    ("openai", "gpt-3.5-turbo", "off"),
    ("openai", "o3", "required"),
    # Gemini (6)
    ("gemini", "gemini-3-flash-preview", "off"),
    ("gemini", "gemini-3-flash-preview", "low"),
    ("gemini", "gemini-3-flash-preview", "medium"),
    ("gemini", "gemini-3-flash-preview", "high"),
    ("gemini", "gemini-2.5-flash-lite", "off"),
    ("gemini", "gemini-2.5-flash", "off"),
    ("gemini", "gemini-2.0-flash", "off"),
]

# 40 infection levels: 0-3.5% at 0.1%, then 4,5,6,7%
INFECTION_LEVELS = [round(i * 0.1, 1) for i in range(36)] + [4.0, 5.0, 6.0, 7.0]

# ── Model-specific curve parameters ────────────────────────────
# (inflection_point%, slope_steepness, max_stay_home%)
# inflection = infection% where 50% of agents stay home
# slope = steepness of sigmoid (higher = sharper transition)
# max = asymptotic max % staying home
CURVE_PARAMS = {
    # Legacy models: reactive early, steep curves
    ("anthropic", "claude-3-haiku-20240307", "off"): (0.4, 4.0, 95),
    ("openai", "gpt-3.5-turbo", "off"):              (0.5, 3.5, 92),
    ("gemini", "gemini-2.0-flash", "off"):            (0.6, 3.8, 90),

    # Mid-tier: moderate response
    ("anthropic", "claude-sonnet-4-0", "off"):        (1.0, 2.8, 93),
    ("anthropic", "claude-haiku-4-5", "off"):         (0.8, 3.2, 91),
    ("openai", "gpt-4o", "off"):                      (1.2, 2.5, 94),
    ("openai", "gpt-4.1", "off"):                     (1.3, 2.6, 92),
    ("gemini", "gemini-2.5-flash-lite", "off"):       (0.7, 3.5, 88),
    ("gemini", "gemini-2.5-flash", "off"):            (0.9, 3.0, 91),

    # Flagship off: gradual, nuanced response
    ("anthropic", "claude-opus-4-5", "off"):          (1.8, 2.0, 96),
    ("anthropic", "claude-sonnet-4-5", "off"):        (1.5, 2.2, 94),
    ("openai", "gpt-5.2", "off"):                     (1.7, 2.1, 95),
    ("openai", "gpt-5.1", "off"):                     (1.4, 2.3, 93),
    ("gemini", "gemini-3-flash-preview", "off"):      (1.1, 2.5, 92),

    # Reasoning levels: higher reasoning = flatter/later response
    ("openai", "gpt-5.2", "low"):                     (1.9, 1.9, 94),
    ("openai", "gpt-5.2", "medium"):                  (2.1, 1.7, 93),
    ("openai", "gpt-5.2", "high"):                    (2.3, 1.5, 92),
    ("openai", "gpt-5.1", "high"):                    (1.8, 1.8, 91),
    ("openai", "o3", "required"):                     (2.5, 1.4, 90),

    ("gemini", "gemini-3-flash-preview", "low"):      (1.3, 2.3, 91),
    ("gemini", "gemini-3-flash-preview", "medium"):   (1.5, 2.0, 90),
    ("gemini", "gemini-3-flash-preview", "high"):     (1.8, 1.8, 89),
}

# ── Personality modifiers ───────────────────────────────────────
# Each Big 5 trait pole shifts the agent's personal inflection point
TRAIT_SHIFTS = {
    "extroverted":         +0.3,   # stays out longer
    "introverted":         -0.2,   # retreats earlier
    "agreeable":           -0.1,   # cooperative, cautious
    "antagonistic":        +0.25,  # defiant, ignores risk
    "conscientious":       -0.3,   # careful, follows guidelines
    "unconscientious":     +0.2,   # careless
    "neurotic":            -0.35,  # anxious, retreats early
    "emotionally stable":  +0.15,  # calm, less reactive
    "open to experience":  +0.1,   # curious, goes out
    "closed to experience":-0.05,  # routine-bound, slight retreat
}


def sigmoid(x, inflection, slope):
    """Sigmoid curve: returns probability of staying home (0-1)."""
    z = slope * (x - inflection)
    return 1.0 / (1.0 + math.exp(-z))


def agent_inflection(agent, base_inflection):
    """Compute agent-specific inflection point based on personality."""
    shift = 0.0
    for trait in agent["traits"]:
        shift += TRAIT_SHIFTS.get(trait, 0.0)
    return max(0.0, base_inflection + shift)


def generate_config_data(config, agents, rng):
    """Generate micro + macro data for one config."""
    provider, model, reasoning = config
    params = CURVE_PARAMS[config]
    base_inflection, slope, max_pct = params

    micro_rows = []
    macro_rows = []

    for level in INFECTION_LEVELS:
        n_yes = 0
        n_no = 0

        for agent in agents:
            agent_infl = agent_inflection(agent, base_inflection)
            p_stay = sigmoid(level, agent_infl, slope) * (max_pct / 100.0)

            for rep in range(5):
                stays_home = rng.random() < p_stay
                response = "yes" if stays_home else "no"

                # Generate plausible reasoning snippets
                if stays_home:
                    reasons = [
                        f"With {level}% infection rate, staying home is prudent.",
                        f"The {level}% infection rate concerns me. I'll stay home today.",
                        f"Given {level}% new infections, the risk of going out outweighs the benefits.",
                    ]
                else:
                    reasons = [
                        f"At {level}% infection, the risk is manageable. I'll go to work.",
                        f"Despite {level}% infections, I feel healthy and need to work.",
                        f"The {level}% rate is low enough that I'm comfortable going out.",
                    ]
                reasoning_text = rng.choice(reasons)

                micro_rows.append({
                    "provider": provider,
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
                    "input_tokens": 245,
                    "output_tokens": rng.randint(70, 120),
                    "reasoning_tokens": 0,
                    "cost": 0.00006,
                    "format_valid": "True",
                })

                if stays_home:
                    n_yes += 1
                else:
                    n_no += 1

        n_total = n_yes + n_no
        pct = round(100.0 * n_yes / n_total, 2) if n_total > 0 else 0

        macro_rows.append({
            "provider": provider,
            "model": model,
            "reasoning": reasoning,
            "infection_level": level,
            "n_yes": n_yes,
            "n_no": n_no,
            "n_total": n_total,
            "pct_stay_home": pct,
            "total_input_tokens": 245 * n_total,
            "total_output_tokens": 90 * n_total,
            "total_reasoning_tokens": 0,
            "total_cost": round(0.00006 * n_total, 5),
        })

    return micro_rows, macro_rows


def config_key(provider, model, reasoning):
    """Directory name for a config."""
    model_clean = model.replace(".", "_").replace("-", "-")
    return f"{provider}_{model_clean}_{reasoning}"


def main():
    base_dir = Path(__file__).parent.parent
    agents_path = base_dir / "agents" / "agents.json"
    output_dir = Path(__file__).parent / "data" / "mock"

    with open(agents_path) as f:
        agents = json.load(f)

    print(f"Loaded {len(agents)} agents")
    print(f"Generating mock data for {len(CONFIGS)} configs x {len(INFECTION_LEVELS)} levels...")

    all_macro = []
    rng = random.Random(42)

    for config in CONFIGS:
        provider, model, reasoning = config
        key = config_key(provider, model, reasoning)
        cfg_dir = output_dir / key
        cfg_dir.mkdir(parents=True, exist_ok=True)

        micro_rows, macro_rows = generate_config_data(config, agents, rng)
        all_macro.extend(macro_rows)

        # Write micro CSV
        micro_path = cfg_dir / "probe_results_micro.csv"
        with open(micro_path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=micro_rows[0].keys())
            w.writeheader()
            w.writerows(micro_rows)

        # Write macro CSV
        macro_path = cfg_dir / "probe_results_macro.csv"
        with open(macro_path, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=macro_rows[0].keys())
            w.writeheader()
            w.writerows(macro_rows)

        # Quick summary
        mid_level = macro_rows[15]  # ~1.5% infection
        print(f"  {key}: {mid_level['pct_stay_home']}% stay home at {mid_level['infection_level']}%")

    # Write combined macro for all configs
    all_macro_path = output_dir / "all_macro.csv"
    with open(all_macro_path, "w", newline="") as f:
        w = csv.DictWriter(f, fieldnames=all_macro[0].keys())
        w.writeheader()
        w.writerows(all_macro)

    print(f"\nDone! {len(CONFIGS)} configs, {len(all_macro)} total macro rows")
    print(f"Output: {output_dir}")


if __name__ == "__main__":
    main()
