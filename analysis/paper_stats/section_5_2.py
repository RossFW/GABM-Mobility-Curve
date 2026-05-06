#!/usr/bin/env python3
"""
Reproduce every numerical claim cited in §5.2 of viz/paper.html.

Reads:
  viz/data/real/regressions/*.json     (per-LLM random-effects logit coefficients)
  viz/data/real/agent_consistency.json (per-agent stay-home rate per LLM config)

Run from the GABM mobility curve project root:
  python analysis/paper_stats/section_5_2.py

Output is a plain-text report grouped by paper subsection. Every printed
value corresponds to a specific claim in the paper prose.
"""

import json
import math
import os
import statistics
from collections import Counter
from glob import glob

# ── paths ─────────────────────────────────────────────────────────────────────
HERE = os.path.dirname(os.path.abspath(__file__))            # analysis/paper_stats/
ROOT = os.path.dirname(os.path.dirname(HERE))                # GABM mobility curve/
REG_DIR = os.path.join(ROOT, 'viz', 'data', 'real', 'regressions')
CONSISTENCY_PATH = os.path.join(ROOT, 'viz', 'data', 'real', 'agent_consistency.json')

BIG_FIVE = ['extraverted', 'agreeable', 'conscientious', 'emot_stable', 'open_to_exp']
BIG_FIVE_LABELS = {
    'extraverted': 'Extraversion',
    'agreeable': 'Agreeableness',
    'conscientious': 'Conscientiousness',
    'emot_stable': 'Emotional stability',
    'open_to_exp': 'Openness',
}

# ── helpers ───────────────────────────────────────────────────────────────────

def sigmoid(x):
    return 1.0 / (1.0 + math.exp(-x))


def load_regs():
    """Return dict[config_key] = {provider, label, coeffs}."""
    out = {}
    for path in sorted(glob(os.path.join(REG_DIR, '*.json'))):
        d = json.load(open(path))
        if 'model2' not in d or 'coefficients' not in d['model2']:
            continue
        c = d['model2']['coefficients']
        if 'infection_pct' not in c or 'infection_pct_sq' not in c:
            continue
        key = os.path.basename(path).replace('.json', '')
        provider = key.split('_', 1)[0]
        out[key] = {'provider': provider, 'label': key, 'coeffs': c}
    return out


def infection_log_odds_range(c):
    bI = c['infection_pct']['estimate']
    bI2 = c['infection_pct_sq']['estimate']
    vals = [bI * lv + bI2 * lv * lv for lv in range(8)]
    return max(vals) - min(vals)


def beta_over_inf_ratio(c, key):
    inf = infection_log_odds_range(c)
    if inf == 0:
        return float('nan')
    if key == 'infection':
        return 1.0
    if key == 'age':
        return abs(c['age']['estimate'] * 47) / inf
    if key not in c:
        return float('nan')
    return abs(c[key]['estimate']) / inf


def personality_extremes(c):
    """Sum |β| across persona predictors with sign aligned to push stay-home.

    Returns (theoMin, theoMax) — the most-mobile and most-cautious persona
    log-odds *before* adding intercept and infection.
    """
    theoMax, theoMin = 0.0, 0.0
    for key in BIG_FIVE:
        if key in c:
            b = c[key]['estimate']
            if b > 0: theoMax += b
            else: theoMin += b
    if 'male' in c:
        b = c['male']['estimate']
        if b > 0: theoMax += b
        else: theoMin += b
    if 'age' in c:
        b = c['age']['estimate']
        if b > 0: theoMax += b * 65; theoMin += b * 18
        else: theoMin += b * 65; theoMax += b * 18
    return theoMin, theoMax


def ranks_with_ties(vals):
    """Average-rank tie handling. Higher value → smaller rank (rank 1 = max)."""
    n = len(vals)
    order = sorted(range(n), key=lambda i: -vals[i])
    r = [0.0] * n
    i = 0
    while i < n:
        j = i
        while j + 1 < n and vals[order[j + 1]] == vals[order[i]]:
            j += 1
        avg = (i + 1 + j + 1) / 2.0
        for k in range(i, j + 1):
            r[order[k]] = avg
        i = j + 1
    return r


def fmt_pct(x):
    if x < 0.01: return '<1%'
    if x > 0.99: return '>99%'
    return f"{x * 100:.1f}%"


# ── load data ─────────────────────────────────────────────────────────────────
regs = load_regs()
consistency = json.load(open(CONSISTENCY_PATH))

# ─────────────────────────────────────────────────────────────────────────────
# §5.2.1 — Trait effect directions (RQ7)
# ─────────────────────────────────────────────────────────────────────────────
print("=" * 78)
print("§5.2.1 — Trait effect directions (RQ7)")
print("=" * 78)
print()
print(f"Total configs: {len(regs)}")
print()
print("Per-trait sign counts across 21 configs (significance at p < 0.05):")
print(f"  {'predictor':22s}  {'pos':>4s}  {'neg':>4s}  {'sig':>4s}  {'sig+':>5s}  {'sig-':>5s}")
for trait in BIG_FIVE + ['male', 'age']:
    pos = neg = sig = sig_pos = sig_neg = 0
    for info in regs.values():
        c = info['coeffs']
        if trait not in c:
            continue
        b = c[trait]['estimate']
        p = c[trait].get('p', 1.0)
        if b > 0: pos += 1
        else: neg += 1
        if p < 0.05:
            sig += 1
            if b > 0: sig_pos += 1
            else: sig_neg += 1
    print(f"  {trait:22s}  {pos:>4d}  {neg:>4d}  {sig:>4d}  {sig_pos:>5d}  {sig_neg:>5d}")

# Per-provider sign agreement on the four reliably-signed traits
print()
print("Per-provider sign agreement on the four reliably-signed traits "
      "(extraverted, agreeable, conscientious, emot_stable):")
provs = sorted({info['provider'] for info in regs.values()})
for prov in provs:
    cfgs = [info for info in regs.values() if info['provider'] == prov]
    print(f"  {prov} (n={len(cfgs)})")
    for trait in ['extraverted', 'agreeable', 'conscientious', 'emot_stable']:
        signs = []
        for info in cfgs:
            b = info['coeffs'].get(trait, {}).get('estimate', 0)
            signs.append('+' if b > 0 else '-')
        print(f"    {trait:18s}  {''.join(signs)}")

print()
print("Age significance, OpenAI breakdown:")
oai = [info for info in regs.values() if info['provider'] == 'openai']
sig_count = sum(
    1 for info in oai
    if info['coeffs'].get('age', {}).get('p', 1.0) < 0.05
)
print(f"  {sig_count} of {len(oai)} OpenAI configurations have significant age effects")

# ─────────────────────────────────────────────────────────────────────────────
# §5.2.2 — Predictor importance (RQ9)
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 78)
print("§5.2.2 — Predictor importance (RQ9)")
print("=" * 78)
print()

# Per-provider median |β|/infection ratio for Big Five
print("Median |β|/infection ratio for each Big Five trait, by provider:")
print(f"  {'provider':10s}  " + "  ".join(f"{BIG_FIVE_LABELS[t][:13]:>13s}" for t in BIG_FIVE))
for prov in provs:
    cfgs = [info for info in regs.values() if info['provider'] == prov]
    row = [prov]
    for trait in BIG_FIVE:
        ratios = [beta_over_inf_ratio(info['coeffs'], trait) for info in cfgs]
        ratios = [r for r in ratios if not math.isnan(r)]
        med = statistics.median(ratios) if ratios else float('nan')
        row.append(f"{med:13.2f}")
    print(f"  {row[0]:10s}  " + "  ".join(row[1:]))

# Anthropic exception: Claude Opus 4.5's conscientiousness ratio
opus = next((info for info in regs.values() if 'opus-4-5' in info['label']), None)
if opus:
    r = beta_over_inf_ratio(opus['coeffs'], 'conscientious')
    print(f"\nClaude Opus 4.5 conscientiousness |β|/infection: {r:.2f}×")

# Configs whose Big Five trait ratios all stay below 1×
print()
print("Configurations where no Big Five trait ratio reaches 1×:")
for info in regs.values():
    if all(beta_over_inf_ratio(info['coeffs'], t) < 1.0 for t in BIG_FIVE):
        print(f"  {info['label']}  (provider={info['provider']})")

# Rank-1 predictor per config
print()
print("Rank-1 predictor (largest |β|/infection ratio, including infection itself) per config:")
rank1 = {prov: Counter() for prov in provs}
all_predictors = BIG_FIVE + ['male', 'age', 'infection']
for info in regs.values():
    ratios = [(t, beta_over_inf_ratio(info['coeffs'], t)) for t in all_predictors]
    ratios = [(t, r) for t, r in ratios if not math.isnan(r)]
    ratios.sort(key=lambda x: -x[1])
    top = ratios[0][0]
    rank1[info['provider']][top] += 1

for prov in provs:
    cfgs = [info for info in regs.values() if info['provider'] == prov]
    print(f"  {prov} (n={len(cfgs)}):  " + ", ".join(
        f"{k}={v}" for k, v in rank1[prov].most_common()
    ))

# ─────────────────────────────────────────────────────────────────────────────
# §5.2.3 — Persona vs. infection magnitude (RQ8)
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 78)
print("§5.2.3 — Persona vs. infection magnitude (RQ8)")
print("=" * 78)
print()

# Per-LLM persona-to-infection ratio + range endpoints in P(stay home) space
ratios_by_prov = {prov: [] for prov in provs}
endpoints_by_prov = {prov: [] for prov in provs}
print(f"  {'config':50s}  {'p2i ratio':>10s}  {'lo_min':>8s}  {'lo_max':>8s}  {'P_min':>8s}  {'P_max':>8s}")
for info in sorted(regs.values(), key=lambda x: x['label']):
    c = info['coeffs']
    theoMin, theoMax = personality_extremes(c)
    inf = infection_log_odds_range(c)
    ratio = (theoMax - theoMin) / inf if inf else float('nan')
    intercept = c.get('intercept', {}).get('estimate', 0.0)
    lo_min = theoMin + intercept
    lo_max = theoMax + intercept
    P_min = sigmoid(lo_min)
    P_max = sigmoid(lo_max)
    ratios_by_prov[info['provider']].append((info['label'], ratio))
    endpoints_by_prov[info['provider']].append({
        'label': info['label'], 'lo_min': lo_min, 'lo_max': lo_max,
        'P_min': P_min, 'P_max': P_max,
    })
    print(f"  {info['label'][:50]:50s}  {ratio:10.2f}  {lo_min:8.2f}  {lo_max:8.2f}  {P_min:8.3f}  {P_max:8.3f}")

# Aggregate
print()
all_ratios = [r for v in ratios_by_prov.values() for _, r in v]
above_1 = sum(1 for r in all_ratios if r > 1.0)
below_1 = [(lab, r) for v in ratios_by_prov.values() for lab, r in v if r < 1.0]
print(f"Configs with persona-to-infection ratio above 1×: {above_1} of {len(all_ratios)}")
print(f"Median persona-to-infection ratio across all configs: {statistics.median(all_ratios):.2f}×")
print(f"Configs below 1×:  " + ", ".join(f"{lab} ({r:.2f}×)" for lab, r in below_1))

print()
print("Per-provider persona-to-infection ratio summaries:")
for prov in provs:
    rs = [r for _, r in ratios_by_prov[prov]]
    print(f"  {prov}:  median={statistics.median(rs):.2f}×  "
          f"min={min(rs):.2f}× ({min(ratios_by_prov[prov], key=lambda x: x[1])[0]})  "
          f"max={max(rs):.2f}× ({max(ratios_by_prov[prov], key=lambda x: x[1])[0]})")

# Personality range crosses 50% threshold or not
print()
print("Personality range placement at 0% infection:")
above = below = crosses = []
above, below, crosses = [], [], []
for prov, eps in endpoints_by_prov.items():
    for ep in eps:
        if ep['P_min'] >= 0.5:
            above.append(ep['label'])
        elif ep['P_max'] < 0.5:
            below.append(ep['label'])
        else:
            crosses.append(ep['label'])
print(f"  Entire range above 50% (most-mobile persona ≥ 50%):  {len(above)} configs")
for lab in above: print(f"    {lab}")
print(f"  Entire range below 50% (most-cautious persona < 50%): {len(below)} configs")
for lab in below:
    ep = next(e for v in endpoints_by_prov.values() for e in v if e['label'] == lab)
    print(f"    {lab}  P_max = {ep['P_max']:.3f}")
print(f"  Range crosses 50%:                                    {len(crosses)} configs")

# ─────────────────────────────────────────────────────────────────────────────
# §5.2.4 — Agent identity agreement (RQ10)
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 78)
print("§5.2.4 — Agent identity agreement (RQ10)")
print("=" * 78)
print()

rates = consistency['rates']           # rates[configIdx][agentIdx]
n_configs = len(rates)
n_agents = len(rates[0])

# Per-agent within-config ranks (one rank per LLM config, 21 ranks total)
agent_ranks = [[0.0] * n_configs for _ in range(n_agents)]
for c in range(n_configs):
    rs = ranks_with_ties(rates[c])
    for a in range(n_agents):
        agent_ranks[a][c] = rs[a]

# Per-agent summary stats: median, IQR, range
per_agent = []
for a in range(n_agents):
    arr = sorted(agent_ranks[a])
    median = arr[len(arr) // 2]
    p25 = arr[int(len(arr) * 0.25)]
    p75 = arr[int((len(arr) - 1) * 0.75)]
    per_agent.append({
        'a': a,
        'median': median,
        'p25': p25,
        'p75': p75,
        'iqr': p75 - p25,
        'min': arr[0],
        'max': arr[-1],
        'range': arr[-1] - arr[0],
    })

# Sort by median rank for position-group analysis
per_agent.sort(key=lambda s: s['median'])

iqrs = [s['iqr'] for s in per_agent]
ranges = [s['range'] for s in per_agent]

print(f"All 100 agents:")
print(f"  median IQR:    {statistics.median(iqrs):.1f}")
print(f"  median range:  {statistics.median(ranges):.1f}")
print(f"  smallest range across the 21 LLMs: {min(ranges):.1f}")
print(f"  largest range across the 21 LLMs:  {max(ranges):.1f}")

# Position-stratified IQR/range
print()
print("Position-stratified summary (sorted by median rank):")
for label, group in [
    ('Top 25 (most cautious)', per_agent[:25]),
    ('Middle 50',              per_agent[25:75]),
    ('Bottom 25 (most mobile)',per_agent[75:]),
]:
    g_iqr = [s['iqr'] for s in group]
    g_rng = [s['range'] for s in group]
    print(f"  {label:28s}  median IQR = {statistics.median(g_iqr):4.1f}   "
          f"median range = {statistics.median(g_rng):4.1f}")
