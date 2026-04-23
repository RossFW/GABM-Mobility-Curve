#!/usr/bin/env python3
"""
Generate per-row pole-level mention flags for Model 3 pole-based regression.

Output: viz/data/real/{config}/mention_flags_pole.csv with columns:
  agent_id, rep, infection_level,
  mentioned_extroverted, mentioned_introverted,
  mentioned_agreeable, mentioned_antagonistic,
  mentioned_conscientious, mentioned_unconscientious,
  mentioned_neurotic, mentioned_emot_stable,
  mentioned_open, mentioned_closed,
  mentioned_infection, mentioned_age

The original mention_flags.csv (dimension-level, OR'd across poles) is unchanged.
"""
import csv
import json
import re
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
DATA_DIR = PROJECT_DIR / "viz" / "data" / "real"
AGENTS_FILE = PROJECT_DIR / "agents" / "agents.json"

# Pole definitions — mirrors compute_trait_mentions.py but each pole = its own column
POLES = {
    "extroverted":    ["extroverted", "extrovert", "extraverted", "extravert", "extraversion", "extroversion"],
    "introverted":    ["introverted", "introvert", "introversion"],
    "agreeable":      ["agreeable", "agreeableness"],
    "antagonistic":   ["antagonistic", "antagonism", "disagreeable"],
    "conscientious":  ["conscientious", "conscientiousness"],
    "unconscientious": ["unconscientious"],
    "neurotic":       ["neurotic", "neuroticism"],
    "emot_stable":    ["emotionally stable", "emotional stability"],
    "open":           ["open to experience", "openness", "open-minded"],
    "closed":         ["closed to experience", "closed-minded"],
}

INFECTION_WORDS = ["infection", "infected", "cases", "diagnosed", "diagnoses"]
INFECTION_RATE_PATTERN = re.compile(r"\b\d+\.?\d*\s*(%|percent)", re.IGNORECASE)
AGE_WORDS_SIMPLE = ["years old", "young"]
AGE_WORDS_WB = ["age", "old"]
AGE_WB_PATTERNS = {kw: re.compile(r"\b" + re.escape(kw) + r"\b", re.IGNORECASE) for kw in AGE_WORDS_WB}


def compile_pole_patterns():
    out = {}
    for pole, terms in POLES.items():
        # Anchor pole terms so "conscientious" doesn't match "unconscientious".
        # For negatively-prefixed poles (introverted, antagonistic, unconscientious, closed) use plain alternation.
        # For positive poles that are substrings of negative (conscientious ⊂ unconscientious),
        # use negative lookbehind to prevent false match.
        if pole == "conscientious":
            pattern = r"(?<!un)(?:conscientious|conscientiousness)"
            out[pole] = re.compile(pattern, re.IGNORECASE)
        elif pole == "open":
            # "open" is tricky — just match "open to experience" + "openness" + "open-minded"
            # to avoid matching generic "open" uses
            out[pole] = re.compile("|".join(re.escape(t) for t in terms), re.IGNORECASE)
        elif pole == "closed":
            out[pole] = re.compile("|".join(re.escape(t) for t in terms), re.IGNORECASE)
        else:
            out[pole] = re.compile("|".join(re.escape(t) for t in terms), re.IGNORECASE)
    out["_infection_words"] = re.compile("|".join(re.escape(w) for w in INFECTION_WORDS), re.IGNORECASE)
    out["_age_simple"] = re.compile("|".join(re.escape(w) for w in AGE_WORDS_SIMPLE), re.IGNORECASE)
    return out


def check_infection(text, pats):
    return bool(pats["_infection_words"].search(text) or INFECTION_RATE_PATTERN.search(text))


def check_age(text, agent_age, pats):
    if pats["_age_simple"].search(text):
        return True
    for p in AGE_WB_PATTERNS.values():
        if p.search(text):
            return True
    if agent_age:
        age_pat = re.compile(r"\b" + re.escape(str(agent_age)) + r"\b")
        if age_pat.search(text):
            return True
    return False


def main():
    with open(AGENTS_FILE) as f:
        agents = json.load(f)
    age_lookup = {a["agent_id"]: a["age"] for a in agents}
    pats = compile_pole_patterns()

    # Iterate all config dirs with a micro CSV
    config_dirs = [d for d in sorted(DATA_DIR.iterdir()) if d.is_dir() and (d / "probe_results_micro.csv").exists()]
    print(f"Found {len(config_dirs)} configs\n")

    pole_names = list(POLES.keys())
    columns = ["agent_id", "rep", "infection_level"] \
        + [f"mentioned_{p}" for p in pole_names] \
        + ["mentioned_infection", "mentioned_age"]

    for cd in config_dirs:
        micro = cd / "probe_results_micro.csv"
        out_csv = cd / "mention_flags_pole.csv"
        n = 0
        rows = []
        counts = {c: 0 for c in columns if c.startswith("mentioned_")}
        with open(micro, newline="") as f:
            rdr = csv.DictReader(f)
            for row in rdr:
                n += 1
                text = row.get("reasoning_text", "") or ""
                aid = int(row["agent_id"])
                agent_age = row.get("age", "") or age_lookup.get(aid)
                infection_level = row.get("infection_level", "")
                rep = row.get("rep", "")
                flags = {"agent_id": aid, "rep": rep, "infection_level": infection_level}
                for pole in pole_names:
                    hit = 1 if pats[pole].search(text) else 0
                    col = f"mentioned_{pole}"
                    flags[col] = hit
                    if hit:
                        counts[col] += 1
                inf_hit = 1 if check_infection(text, pats) else 0
                age_hit = 1 if check_age(text, agent_age, pats) else 0
                flags["mentioned_infection"] = inf_hit
                flags["mentioned_age"] = age_hit
                if inf_hit:
                    counts["mentioned_infection"] += 1
                if age_hit:
                    counts["mentioned_age"] += 1
                rows.append(flags)
        with open(out_csv, "w", newline="") as f:
            w = csv.DictWriter(f, fieldnames=columns)
            w.writeheader()
            w.writerows(rows)
        # Short summary line
        rate_summary = " ".join(f"{c.replace('mentioned_','')}:{counts[c]/n*100:.0f}%" for c in columns if c.startswith("mentioned_"))
        print(f"{cd.name:<40} n={n}  {rate_summary}")

    print(f"\nWrote pole-level mention flags to {len(config_dirs)} configs.")


if __name__ == "__main__":
    main()
