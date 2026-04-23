#!/usr/bin/env python3
"""
Decision-driver keyword analysis.

Method: content-analysis-style term frequency. For each response, flag whether
a concept category is mentioned. Per-config aggregate rate gives a "does this
model typically invoke this concept when reasoning about mobility decisions?"

Dictionary chosen after manual inspection of random response samples across
all 21 configs (see analysis/sample_responses.py). Categories group synonyms
into conceptually meaningful buckets.

Output: viz/data/real/decision_drivers.json
  {config_key: {
      overall: {concept: rate},
      by_decision: {"yes"/"no": {concept: rate}}
  }}
"""
from __future__ import annotations

import csv
import json
import re
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "viz" / "data" / "real"
OUT = DATA / "decision_drivers.json"

# Concept categories — chosen from sampling reasoning_text across all 21 configs.
# Each concept is a list of whole-word patterns (case-insensitive). A response
# hits the concept if ANY pattern matches.
CONCEPTS = {
    # Does the model invoke the assigned persona (age + Big 5) in its reasoning?
    "Traits":            [r"\bextrovert\w*\b", r"\bextravert\w*\b", r"\bintrovert\w*\b",
                          r"\bagreeable(?:ness)?\b", r"\bantagonis\w+\b", r"\bdisagreeable\b",
                          r"(?<!un)\bconscientious(?:ness)?\b", r"\bunconscientious\b",
                          r"\bneurotic(?:ism)?\b", r"\bemotionally stable\b", r"\bemotional stability\b",
                          r"\bopen to experience\b", r"\bopenness\b", r"\bopen-minded\b",
                          r"\bclosed to experience\b", r"\bclosed-minded\b",
                          r"\byears old\b", r"\b(young|old)\b(?!\s+(cases|age))"],

    # Does the agent weigh the work obligation the prompt provided?
    "Work":              [r"\bwork\b", r"\bjob\b", r"\boffice\b",
                          r"\bresponsib\w+\b", r"\bcommit\w+\b"],

    # Does the agent infer and consider others? Nouns for people groups + verbs
    # of concern-for-others.
    "Community":         [r"\bcommunity\b", r"\bfamily\b", r"\bothers\b",
                          r"\bpublic\b", r"\bneighbor\w*\b", r"\bloved\s+ones\b",
                          r"\bprotect\w*\b"],

    # Does the agent engage with disease properties (static characteristics of Catasat)?
    "Virus Properties":  [r"\bairborne\b", r"\bvirus\b", r"\bcontagi\w+\b",
                          r"\bdeadl\w+\b", r"\bcatasat\b"],

    # Does the agent consider their own wellness?
    "Self Health":       [r"\bhealthy\b", r"\bwell\b", r"\bmy health\b",
                          r"\bfeel\s+(fine|good|healthy)\b"],

    # Does the agent engage with the current epidemic state (how much disease is
    # circulating in the population right now)?
    "Virus Prevalence":  [r"\binfection\s+rate\b", r"\bcases\b", r"\bdiagnos\w+\b",
                          r"\bspread\w*\b", r"\boutbreak\b", r"\bepidemic\b",
                          r"\bprevalen\w+\b", r"\b\d+\.?\d*\s?%"],
}


def compile_concepts():
    return {name: re.compile("|".join(pats), re.IGNORECASE) for name, pats in CONCEPTS.items()}


def process_config(micro_file: Path, pats: dict) -> dict:
    n = 0
    hits = {k: 0 for k in pats}
    hits_yes = {k: 0 for k in pats}
    hits_no  = {k: 0 for k in pats}
    n_yes = 0
    n_no = 0
    with open(micro_file, newline="") as f:
        for row in csv.DictReader(f):
            text = (row.get("reasoning_text") or "")
            if not text.strip():
                continue
            n += 1
            dec = (row.get("response") or "").strip().lower()
            is_yes = dec == "yes"
            is_no  = dec == "no"
            if is_yes: n_yes += 1
            if is_no:  n_no  += 1
            for k, pat in pats.items():
                if pat.search(text):
                    hits[k] += 1
                    if is_yes: hits_yes[k] += 1
                    if is_no:  hits_no[k] += 1
    return {
        "n": n,
        "n_yes": n_yes,
        "n_no": n_no,
        "overall": {k: round(hits[k] / n, 4) if n else 0 for k in pats},
        "by_decision": {
            "yes": {k: round(hits_yes[k] / n_yes, 4) if n_yes else 0 for k in pats},
            "no":  {k: round(hits_no[k]  / n_no,  4) if n_no  else 0 for k in pats},
        },
    }


def human_keywords(patterns):
    """Convert regex patterns back to readable keywords for display in Fig 32 style."""
    out = []
    for p in patterns:
        s = p
        # strip \b boundaries
        s = s.replace(r"\b", "")
        # wildcard suffix: \w+ and \w* → *
        s = s.replace(r"\w+", "*").replace(r"\w*", "*")
        # whitespace placeholder → regular space
        s = s.replace(r"\s+", " ").replace(r"\s?", " ").replace(r"\s", " ")
        # numeric-pct pattern: replace digit class with N
        s = re.sub(r"\\d\+\\?\.\?\\d\*", "N", s)
        s = re.sub(r"\\d[+*]", "N", s)
        # strip group parens and show alternations like "(a|b)" → "a/b"
        s = re.sub(r"\(([^)]+)\)", lambda m: m.group(1).replace("|", "/"), s)
        # optional chars like "s?" → "s"
        s = re.sub(r"(\w)\?", r"\1", s)
        out.append(s.strip())
    return out


def main():
    pats = compile_concepts()
    configs = sorted([d for d in DATA.iterdir() if d.is_dir() and (d / "probe_results_micro.csv").exists()])
    print(f"Configs: {len(configs)} · Concepts: {len(CONCEPTS)}")
    keywords = {name: human_keywords(pats_list) for name, pats_list in CONCEPTS.items()}
    results = {"concepts": list(CONCEPTS.keys()), "keywords": keywords, "by_config": {}}
    for i, cd in enumerate(configs):
        print(f"[{i+1}/{len(configs)}] {cd.name}", end=" ")
        r = process_config(cd / "probe_results_micro.csv", pats)
        results["by_config"][cd.name] = r
        top = sorted(r["overall"].items(), key=lambda kv: -kv[1])[:3]
        print(f"n={r['n']:,} · top: {', '.join(f'{k}:{v*100:.0f}%' for k,v in top)}")
    OUT.write_text(json.dumps(results, indent=2))
    print(f"\nWrote {OUT}")


if __name__ == "__main__":
    main()
