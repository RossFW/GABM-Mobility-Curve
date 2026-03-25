#!/usr/bin/env python3
"""
GABM Mobility Curve — Trait Mention Pre-computation

Scans all 420K reasoning texts for Big Five trait keyword mentions,
plus infection and age keyword mentions.

Output:
  1. viz/data/real/trait_mentions.json  (aggregate rates for Figures 33-34)
  2. viz/data/real/{config}/mention_flags.csv  (per-response flags for Model 3 regression)

Used by Figures 33-36 (Trait Utilization + Amplification) in analytics.html.
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

# ── Big Five keyword dictionary ──────────────────────────────────
# Each dimension maps to poles, each pole maps to search patterns
TRAIT_KEYWORDS = {
    "extraversion": {
        "positive": ["extroverted", "extrovert", "extraverted", "extravert",
                      "extraversion", "extroversion"],
        "negative": ["introverted", "introvert", "introversion"],
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
        "positive": ["open to experience", "openness", "open-minded"],
        "negative": ["closed to experience", "closed-minded"],
        "agent_positive": ["open to experience"],
        "agent_negative": ["closed to experience"],
    },
}

# ── Infection keywords ───────────────────────────────────────────
# Combined flag: infection words OR rate number pattern
INFECTION_WORDS = ["infection", "infected", "cases", "diagnosed", "diagnoses"]
INFECTION_RATE_PATTERN = re.compile(r'\b\d+\.?\d*\s*(%|percent)', re.IGNORECASE)

# ── Age keywords ─────────────────────────────────────────────────
# Combined flag: age words OR agent's own age number
AGE_WORDS_SIMPLE = ["years old", "young"]  # safe substring match
AGE_WORDS_WB = ["age", "old"]  # need \b word boundaries
AGE_WB_PATTERNS = {kw: re.compile(r'\b' + re.escape(kw) + r'\b', re.IGNORECASE)
                   for kw in AGE_WORDS_WB}

# ── All 7 dimension names for mention_flags.csv ──────────────────
ALL_DIMENSIONS = list(TRAIT_KEYWORDS.keys()) + ["infection", "age"]
FLAG_COLUMNS = [f"mentioned_{d[:3]}" for d in TRAIT_KEYWORDS] + ["mentioned_infection", "mentioned_age"]
# mentioned_ext, mentioned_agr, mentioned_con, mentioned_neu, mentioned_ope, mentioned_infection, mentioned_age


def build_agent_lookup(agents):
    """Build agent_id -> {trait_map, age} for quick lookup."""
    lookup = {}
    for agent in agents:
        aid = agent["agent_id"]
        trait_map = {}
        for dim, info in TRAIT_KEYWORDS.items():
            for trait_val in agent["traits"]:
                if trait_val in info["agent_positive"]:
                    trait_map[dim] = "positive"
                    break
                elif trait_val in info["agent_negative"]:
                    trait_map[dim] = "negative"
                    break
        lookup[aid] = {"traits": trait_map, "age": agent["age"]}
    return lookup


def compile_patterns():
    """Pre-compile regex patterns for Big Five dimensions."""
    patterns = {}
    for dim, info in TRAIT_KEYWORDS.items():
        all_terms = info["positive"] + info["negative"]
        patterns[dim] = {
            "any": re.compile("|".join(re.escape(t) for t in all_terms), re.IGNORECASE),
            "positive": re.compile("|".join(re.escape(t) for t in info["positive"]), re.IGNORECASE),
            "negative": re.compile("|".join(re.escape(t) for t in info["negative"]), re.IGNORECASE),
        }
    # Infection words (combined alternation)
    patterns["_infection_words"] = re.compile(
        "|".join(re.escape(w) for w in INFECTION_WORDS), re.IGNORECASE)
    # Age simple words (combined alternation)
    patterns["_age_simple"] = re.compile(
        "|".join(re.escape(w) for w in AGE_WORDS_SIMPLE), re.IGNORECASE)
    return patterns


def check_infection(text, patterns):
    """Check if response mentions infection (words OR rate number)."""
    if patterns["_infection_words"].search(text):
        return True
    if INFECTION_RATE_PATTERN.search(text):
        return True
    return False


def check_age(text, agent_age, patterns):
    """Check if response mentions age (words OR own age number)."""
    # Simple substring keywords
    if patterns["_age_simple"].search(text):
        return True
    # Word-boundary keywords
    for pat in AGE_WB_PATTERNS.values():
        if pat.search(text):
            return True
    # Agent's own age number
    if agent_age:
        age_pat = re.compile(r'\b' + re.escape(str(agent_age)) + r'\b')
        if age_pat.search(text):
            return True
    return False


def process_config(micro_path, patterns, agent_lookup):
    """Process one config's micro CSV.

    Returns:
        mention_rates: {dim: rate} for all 7 dimensions
        echo_rates: {dim: {assigned, unassigned}} for Big Five only
        pole_rates: {dim_pole: rate} for Big Five only
        flag_rows: list of dicts for mention_flags.csv
    """
    total = 0
    dim_mentions = {d: 0 for d in ALL_DIMENSIONS}
    pole_mentions = {}
    for dim in TRAIT_KEYWORDS:
        pole_mentions[f"{dim}_positive"] = 0
        pole_mentions[f"{dim}_negative"] = 0

    echo = {d: {"assigned_mentions": 0, "assigned_total": 0,
                "unassigned_mentions": 0, "unassigned_total": 0}
            for d in TRAIT_KEYWORDS}

    flag_rows = []

    with open(micro_path, newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            total += 1
            text = row.get("reasoning_text", "") or ""
            aid = int(row["agent_id"])
            agent_info = agent_lookup.get(aid, {"traits": {}, "age": None})
            agent_age = row.get("age", "") or agent_info["age"]
            infection_level = row.get("infection_level", "")
            rep = row.get("rep", "")

            # Per-response flag dict
            flags = {
                "agent_id": aid,
                "rep": rep,
                "infection_level": infection_level,
            }

            # Big Five dimensions
            for dim, pats in list(patterns.items()):
                if dim.startswith("_"):
                    continue  # skip infection/age helper patterns
                has_any = bool(pats["any"].search(text))
                has_pos = bool(pats["positive"].search(text))
                has_neg = bool(pats["negative"].search(text))

                if has_any:
                    dim_mentions[dim] += 1
                if has_pos:
                    pole_mentions[f"{dim}_positive"] += 1
                if has_neg:
                    pole_mentions[f"{dim}_negative"] += 1

                # Echo analysis
                agent_pole = agent_info["traits"].get(dim)
                if agent_pole == "positive":
                    echo[dim]["assigned_total"] += 1
                    if has_pos:
                        echo[dim]["assigned_mentions"] += 1
                    echo[dim]["unassigned_total"] += 1
                    if has_neg:
                        echo[dim]["unassigned_mentions"] += 1
                elif agent_pole == "negative":
                    echo[dim]["assigned_total"] += 1
                    if has_neg:
                        echo[dim]["assigned_mentions"] += 1
                    echo[dim]["unassigned_total"] += 1
                    if has_pos:
                        echo[dim]["unassigned_mentions"] += 1

                # Flag: dimension-level mention (0 or 1)
                dim_short = dim[:3]
                flags[f"mentioned_{dim_short}"] = 1 if has_any else 0

            # Infection
            has_infection = check_infection(text, patterns)
            if has_infection:
                dim_mentions["infection"] += 1
            flags["mentioned_infection"] = 1 if has_infection else 0

            # Age
            has_age = check_age(text, agent_age, patterns)
            if has_age:
                dim_mentions["age"] += 1
            flags["mentioned_age"] = 1 if has_age else 0

            flag_rows.append(flags)

    # Compute rates
    mention_rates = {d: round(dim_mentions[d] / total, 4) if total else 0
                     for d in ALL_DIMENSIONS}

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

    return mention_rates, echo_rates, pole_rates, flag_rows


def main():
    # Load agents
    with open(AGENTS_FILE) as f:
        agents = json.load(f)
    agent_lookup = build_agent_lookup(agents)
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
        mention_rates, echo_rates, pole_rates, flag_rows = process_config(
            micro_path, patterns, agent_lookup)

        configs_out.append(cfg["dir"])
        labels_out.append(cfg["label"])
        providers_out.append(cfg["provider"])
        mention_rates_out[cfg["dir"]] = mention_rates
        echo_rates_out[cfg["dir"]] = echo_rates
        pole_rates_out[cfg["dir"]] = pole_rates

        # Write mention_flags.csv
        flags_path = DATA_DIR / cfg["dir"] / "mention_flags.csv"
        flag_cols = ["agent_id", "rep", "infection_level"] + FLAG_COLUMNS
        with open(flags_path, "w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=flag_cols)
            writer.writeheader()
            writer.writerows(flag_rows)

        top_dim = max(mention_rates, key=mention_rates.get)
        inf_rate = mention_rates["infection"]
        age_rate = mention_rates["age"]
        print(f"top: {top_dim} ({mention_rates[top_dim]:.1%})  "
              f"inf={inf_rate:.1%}  age={age_rate:.1%}  "
              f"→ {flags_path.name} ({len(flag_rows)} rows)")

    result = {
        "configs": configs_out,
        "labels": labels_out,
        "providers": providers_out,
        "dimensions": ALL_DIMENSIONS,
        "mention_rates": mention_rates_out,
        "echo_rates": echo_rates_out,
        "pole_rates": pole_rates_out,
    }

    with open(OUT_FILE, "w") as f:
        json.dump(result, f, indent=2)

    print(f"\nWritten {len(configs_out)} configs to {OUT_FILE}")
    print(f"File size: {os.path.getsize(OUT_FILE):,} bytes")
    print(f"Dimensions: {ALL_DIMENSIONS}")
    print(f"Flag columns: {FLAG_COLUMNS}")


if __name__ == "__main__":
    main()
