#!/usr/bin/env python3
"""
GABM Mobility Curve — Trait Mention Pre-computation

Scans all 420K reasoning texts for Big Five trait keyword mentions.
Output: viz/data/real/trait_mentions.json

Used by Figures 33-34 (Trait Utilization) in analytics.html.
"""

import csv
import json
import os
import re
from pathlib import Path

from configs import CONFIGS

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "viz" / "data" / "real"
AGENTS_FILE = PROJECT_DIR / "agents" / "agents.json"
OUT_FILE = DATA_DIR / "trait_mentions.json"

# Big Five keyword dictionary
# Each dimension maps to poles, each pole maps to search patterns
TRAIT_KEYWORDS = {
    "extraversion": {
        "positive": ["extroverted", "extrovert", "extraverted", "extravert",
                      "extraversion", "extroversion"],
        "negative": ["introverted", "introvert", "introversion"],
        # Which agent trait values map to positive pole
        "agent_positive": ["extroverted"],
        "agent_negative": ["introverted"],
    },
    "agreeableness": {
        "positive": ["agreeable", "agreeableness"],
        "negative": ["antagonistic", "antagonism", "disagreeable"],
        "agent_positive": ["agreeable"],
        "agent_negative": ["antagonistic"],
    },
    "conscientiousness": {
        "positive": ["conscientious", "conscientiousness"],
        "negative": ["unconscientious"],
        "agent_positive": ["conscientious"],
        "agent_negative": ["unconscientious"],
    },
    "neuroticism": {
        "positive": ["neurotic", "neuroticism"],
        "negative": ["emotionally stable", "emotional stability"],
        "agent_positive": ["neurotic"],
        "agent_negative": ["emotionally stable"],
    },
    "openness": {
        "positive": ["open to experience", "openness"],
        "negative": ["closed to experience", "closed-minded"],
        "agent_positive": ["open to experience"],
        "agent_negative": ["closed to experience"],
    },
}


def build_agent_trait_map(agents):
    """Build a map: agent_id -> {dimension: "positive"/"negative"} for each Big Five dimension."""
    trait_map = {}
    for agent in agents:
        aid = agent["agent_id"]
        trait_map[aid] = {}
        for dim, info in TRAIT_KEYWORDS.items():
            for trait_val in agent["traits"]:
                if trait_val in info["agent_positive"]:
                    trait_map[aid][dim] = "positive"
                    break
                elif trait_val in info["agent_negative"]:
                    trait_map[aid][dim] = "negative"
                    break
    return trait_map


def compile_patterns():
    """Pre-compile regex patterns for each dimension and pole."""
    patterns = {}
    for dim, info in TRAIT_KEYWORDS.items():
        # Combined pattern for any mention of this dimension
        all_terms = info["positive"] + info["negative"]
        patterns[dim] = {
            "any": re.compile("|".join(re.escape(t) for t in all_terms), re.IGNORECASE),
            "positive": re.compile("|".join(re.escape(t) for t in info["positive"]), re.IGNORECASE),
            "negative": re.compile("|".join(re.escape(t) for t in info["negative"]), re.IGNORECASE),
        }
    return patterns


def process_config(micro_path, patterns, agent_trait_map):
    """Process one config's micro CSV. Returns mention_rates, echo_rates, pole_rates."""
    # Counters
    total = 0
    dim_mentions = {d: 0 for d in TRAIT_KEYWORDS}  # any mention of dimension
    pole_mentions = {}
    for dim in TRAIT_KEYWORDS:
        pole_mentions[f"{dim}_positive"] = 0
        pole_mentions[f"{dim}_negative"] = 0

    # Echo tracking: assigned vs unassigned mentions per dimension
    echo = {d: {"assigned_mentions": 0, "assigned_total": 0,
                "unassigned_mentions": 0, "unassigned_total": 0}
            for d in TRAIT_KEYWORDS}

    with open(micro_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            total += 1
            text = row.get("reasoning_text", "")
            aid = int(row["agent_id"])

            for dim, pats in patterns.items():
                has_any = bool(pats["any"].search(text))
                has_pos = bool(pats["positive"].search(text))
                has_neg = bool(pats["negative"].search(text))

                if has_any:
                    dim_mentions[dim] += 1
                if has_pos:
                    pole_mentions[f"{dim}_positive"] += 1
                if has_neg:
                    pole_mentions[f"{dim}_negative"] += 1

                # Echo analysis: does the agent have this trait assigned?
                agent_pole = agent_trait_map.get(aid, {}).get(dim)
                if agent_pole == "positive":
                    echo[dim]["assigned_total"] += 1
                    if has_pos:
                        echo[dim]["assigned_mentions"] += 1
                    # Check if model mentions the OPPOSITE pole (hallucination)
                    echo[dim]["unassigned_total"] += 1  # they don't have negative
                    if has_neg:
                        echo[dim]["unassigned_mentions"] += 1
                elif agent_pole == "negative":
                    echo[dim]["assigned_total"] += 1
                    if has_neg:
                        echo[dim]["assigned_mentions"] += 1
                    echo[dim]["unassigned_total"] += 1
                    if has_pos:
                        echo[dim]["unassigned_mentions"] += 1

    # Compute rates
    mention_rates = {d: round(dim_mentions[d] / total, 4) if total else 0
                     for d in TRAIT_KEYWORDS}

    echo_rates = {}
    for d in TRAIT_KEYWORDS:
        e = echo[d]
        echo_rates[d] = {
            "assigned": round(e["assigned_mentions"] / e["assigned_total"], 4) if e["assigned_total"] else 0,
            "unassigned": round(e["unassigned_mentions"] / e["unassigned_total"], 4) if e["unassigned_total"] else 0,
        }

    pole_rates = {}
    for dim in TRAIT_KEYWORDS:
        pole_rates[f"{dim}_positive"] = round(pole_mentions[f"{dim}_positive"] / total, 4) if total else 0
        pole_rates[f"{dim}_negative"] = round(pole_mentions[f"{dim}_negative"] / total, 4) if total else 0

    return mention_rates, echo_rates, pole_rates


def main():
    # Load agents
    with open(AGENTS_FILE) as f:
        agents = json.load(f)
    agent_trait_map = build_agent_trait_map(agents)
    patterns = compile_patterns()

    configs_out = []
    labels_out = []
    providers_out = []
    mention_rates_out = {}
    echo_rates_out = {}
    pole_rates_out = {}

    for cfg in CONFIGS:
        micro_path = DATA_DIR / cfg["dir"] / "probe_results_micro.csv"
        if not micro_path.exists():
            print(f"SKIP: {cfg['dir']} — no micro CSV")
            continue

        print(f"Processing {cfg['dir']}...", end=" ", flush=True)
        mention_rates, echo_rates, pole_rates = process_config(
            micro_path, patterns, agent_trait_map)

        configs_out.append(cfg["dir"])
        labels_out.append(cfg["label"])
        providers_out.append(cfg["provider"])
        mention_rates_out[cfg["dir"]] = mention_rates
        echo_rates_out[cfg["dir"]] = echo_rates
        pole_rates_out[cfg["dir"]] = pole_rates

        top_dim = max(mention_rates, key=mention_rates.get)
        print(f"top dimension: {top_dim} ({mention_rates[top_dim]:.1%})")

    result = {
        "configs": configs_out,
        "labels": labels_out,
        "providers": providers_out,
        "dimensions": list(TRAIT_KEYWORDS.keys()),
        "mention_rates": mention_rates_out,
        "echo_rates": echo_rates_out,
        "pole_rates": pole_rates_out,
    }

    with open(OUT_FILE, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\nWritten {len(configs_out)} configs to {OUT_FILE}")
    print(f"File size: {os.path.getsize(OUT_FILE):,} bytes")


if __name__ == "__main__":
    main()
