"""
generate_agents.py
------------------
One-time script to generate the 100 frozen agents used across ALL mobility probe configs.
Run once; output saved to agents/agents.json.

Uses the same name/age/trait generation as Paper 1 (Epidemic_GABM_redone/utils.py)
for methodological continuity. Fixed random seed ensures reproducibility.
"""

import json
import random
import numpy as np
from pathlib import Path
from names_dataset import NameDataset

RANDOM_SEED = 42
N_AGENTS = 100
OUTPUT_PATH = Path(__file__).parent / "agents.json"


# ── Big 5 trait generation (from Paper 1 redone utils.py) ─────────────────────

TRAIT_LIST = [
    ["extroverted", "introverted"],
    ["agreeable", "antagonistic"],
    ["conscientious", "unconscientious"],
    ["neurotic", "emotionally stable"],
    ["open to experience", "closed to experience"],
]

def generate_big5_traits(rng):
    return [rng.choice(poles) for poles in TRAIT_LIST]


# ── Age generation (from Paper 1 redone utils.py, 2023 US population weights) ──

AGE_LIKELIHOODS = [
    2.0752895752895800, 2.0752895752895800, 2.1396396396396400,
    2.2844272844272800, 2.2522522522522500, 2.1718146718146700,
    2.1235521235521200, 2.1074646074646100, 2.1074646074646100,
    2.1396396396396400, 2.1718146718146700, 2.2039897039897000,
    2.2522522522522500, 2.2844272844272800, 2.2844272844272800,
    2.2200772200772200, 2.1879021879021900, 2.1557271557271600,
    2.1557271557271600, 2.1557271557271600, 2.1235521235521200,
    2.1557271557271600, 2.1396396396396400, 2.1074646074646100,
    2.1074646074646100, 2.0109395109395100, 1.9787644787644800,
    1.9465894465894500, 1.8822393822393800, 1.8983268983269000,
    1.8661518661518700, 1.8983268983269000, 1.9787644787644800,
    2.0913770913770900, 2.0592020592020600, 1.9787644787644800,
    1.9305019305019300, 1.9465894465894500, 1.9787644787644800,
    2.0431145431145400, 2.0913770913770900, 2.0913770913770900,
    2.0913770913770900, 2.0752895752895800, 2.0431145431145400,
    1.9948519948519900, 1.9948519948519900, 1.9465894465894500,
]
AGE_PROBS = [l / 100.0 for l in AGE_LIKELIHOODS]
AGE_RANGE = list(range(18, 66))

def generate_age(rng):
    return int(rng.choice(AGE_RANGE, p=AGE_PROBS))


# ── Name generation (from Paper 1 redone utils.py) ────────────────────────────

def generate_names(n, country_alpha2="US"):
    """n/2 male + n/2 female names, no repeats, from top 200 US names."""
    nd = NameDataset()
    male_names = nd.get_top_names(100, "Male", country_alpha2)[country_alpha2]["M"]
    female_names = nd.get_top_names(100, "Female", country_alpha2)[country_alpha2]["F"]
    names = random.sample(male_names, k=n // 2) + random.sample(female_names, k=n // 2)
    random.shuffle(names)
    return names


# ── Main ──────────────────────────────────────────────────────────────────────

def main():
    print(f"Generating {N_AGENTS} agents with seed={RANDOM_SEED}...")

    random.seed(RANDOM_SEED)
    np_rng = np.random.default_rng(RANDOM_SEED)

    names = generate_names(N_AGENTS)

    agents = []
    for i, name in enumerate(names):
        traits = generate_big5_traits(np_rng)
        age = generate_age(np_rng)
        agents.append({
            "agent_id": i,
            "name": name,
            "age": age,
            "traits": traits,
            "traits_str": f"{traits[0]}, {traits[1]}, {traits[2]}, {traits[3]}, and {traits[4]}",
        })

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w") as f:
        json.dump(agents, f, indent=2)

    print(f"Saved {len(agents)} agents to {OUTPUT_PATH}")

    # Quick sanity check
    ages = [a["age"] for a in agents]
    print(f"Age range: {min(ages)}-{max(ages)}, mean: {sum(ages)/len(ages):.1f}")
    trait_counts = {}
    for a in agents:
        for t in a["traits"]:
            trait_counts[t] = trait_counts.get(t, 0) + 1
    print("Trait distribution:")
    for t, c in sorted(trait_counts.items(), key=lambda x: -x[1]):
        print(f"  {t}: {c}")


if __name__ == "__main__":
    main()
