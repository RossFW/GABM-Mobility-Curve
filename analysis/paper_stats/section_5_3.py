#!/usr/bin/env python3
"""
Reproduce every numerical claim cited in §5.3 of viz/paper.html.

Reads:
  viz/data/real/trait_mentions.json              (mention rates per dimension/pole)
  viz/data/real/regressions/*.json               (model3 — mention-flag logit)
  viz/data/real/decision_drivers.json            (concept-category mention rates)
  viz/data/real/response_persona_similarity.json (within/across cosines, Δ)

Run from the GABM mobility curve project root:
  python analysis/paper_stats/section_5_3.py

Output is a plain-text report grouped by paper subsection. Every printed
value corresponds to a specific claim in the paper prose.
"""

import json
import os
import statistics
from collections import Counter
from glob import glob

HERE = os.path.dirname(os.path.abspath(__file__))            # analysis/paper_stats/
ROOT = os.path.dirname(os.path.dirname(HERE))                # GABM mobility curve/
TRAIT_PATH = os.path.join(ROOT, 'viz', 'data', 'real', 'trait_mentions.json')
REG_DIR    = os.path.join(ROOT, 'viz', 'data', 'real', 'regressions')
DRIVERS_PATH = os.path.join(ROOT, 'viz', 'data', 'real', 'decision_drivers.json')
PERSONA_PATH = os.path.join(ROOT, 'viz', 'data', 'real', 'response_persona_similarity.json')

PROVS = ['anthropic', 'openai', 'gemini']
BIG_FIVE = ['extraversion', 'agreeableness', 'conscientiousness', 'neuroticism', 'openness']

POLE_CANDIDATES = [
    'mentioned_extroverted', 'mentioned_introverted',
    'mentioned_agreeable',   'mentioned_antagonistic',
    'mentioned_conscientious', 'mentioned_unconscientious',
    'mentioned_emot_stable', 'mentioned_neurotic',
    'mentioned_open',        'mentioned_closed',
    'mentioned_infection',   'mentioned_age',
]


def load_regs():
    out = {}
    for path in sorted(glob(os.path.join(REG_DIR, '*.json'))):
        d = json.load(open(path))
        if 'model3' not in d or 'coefficients' not in d['model3']:
            continue
        key = os.path.basename(path).replace('.json', '')
        provider = key.split('_', 1)[0]
        out[key] = {'provider': provider, 'label': key, 'coeffs': d['model3']['coefficients']}
    return out


# ── load data ─────────────────────────────────────────────────────────────────
trait_data    = json.load(open(TRAIT_PATH))
drivers_data  = json.load(open(DRIVERS_PATH))
persona_data  = json.load(open(PERSONA_PATH))
regs          = load_regs()


# ─────────────────────────────────────────────────────────────────────────────
# §5.3.1 — Trait mention rates (RQ11)
# §5.3.2 — Mention amplification (RQ12)
# (computed in one block since both subsections share the same mention-rate
#  and mention-flag-logit data sources)
# ─────────────────────────────────────────────────────────────────────────────
print("=" * 78)
print("§5.3.1 — Trait mention rates (RQ11)")
print("§5.3.2 — Mention amplification (RQ12)")
print("=" * 78)
print()

# Per-dimension mention rate stats
print("Per-dimension mention rate across the 21 configurations:")
dims = trait_data['dimensions']  # ['extraversion', 'agreeableness', ..., 'infection', 'age']
print(f"  {'dimension':20s}  {'mean':>7s}  {'min':>7s}  {'max':>7s}")
for dim in dims:
    rates = [trait_data['mention_rates'][cfg][dim] for cfg in trait_data['configs']]
    print(f"  {dim:20s}  {statistics.mean(rates)*100:6.1f}%  {min(rates)*100:6.1f}%  {max(rates)*100:6.1f}%")

# Per-provider average Big Five mention rate
print()
print("Average Big Five mention rate per provider:")
provs_bf = {p: [] for p in PROVS}
for cfg in trait_data['configs']:
    p = cfg.split('_')[0]
    bf = statistics.mean([trait_data['mention_rates'][cfg][k] for k in BIG_FIVE])
    provs_bf[p].append(bf)
for p in PROVS:
    print(f"  {p:10s}  n={len(provs_bf[p])}  mean = {statistics.mean(provs_bf[p])*100:.1f}%")

# GPT-3.5 Turbo outlier
print()
gpt35 = 'openai_gpt-3_5-turbo_off'
if gpt35 in trait_data['mention_rates']:
    rates = trait_data['mention_rates'][gpt35]
    bf_avg = statistics.mean([rates[k] for k in BIG_FIVE])
    print(f"GPT-3.5 Turbo mention rates: infection = {rates['infection']*100:.1f}%, "
          f"Big Five mean = {bf_avg*100:.1f}%, age = {rates['age']*100:.1f}%")

# Configs where infection mention flag enters the mention-flag logit
print()
print("Configurations where each mention flag enters model3 (mention rate ∈ [15%, 85%]):")
print(f"  {'pole':30s} {'incl':>5s} {'sig+':>5s} {'sig-':>5s}")
for pole in POLE_CANDIDATES:
    incl = sig_pos = sig_neg = 0
    for info in regs.values():
        c = info['coeffs']
        if pole in c:
            incl += 1
            if c[pole].get('p', 1.0) < 0.05:
                if c[pole]['estimate'] > 0:
                    sig_pos += 1
                else:
                    sig_neg += 1
    print(f"  {pole:30s} {incl:>5d} {sig_pos:>5d} {sig_neg:>5d}")

# Polarity check: stay-home pole vs mobile pole
print()
print("Polarity check — direction-aligned pairs (per RQ7 trait directions):")
print(f"  {'stay-home pole':25s} {'sig+':>5s} {'sig-':>5s}    {'mobile pole':25s} {'sig+':>5s} {'sig-':>5s}")
PAIRS = [
    ('mentioned_introverted',     'mentioned_extroverted'),
    ('mentioned_agreeable',       'mentioned_antagonistic'),
    ('mentioned_conscientious',   'mentioned_unconscientious'),
    ('mentioned_neurotic',        'mentioned_emot_stable'),
    ('mentioned_open',            'mentioned_closed'),
]
for sh, mob in PAIRS:
    counts = {}
    for pole in (sh, mob):
        sp = sn = 0
        for info in regs.values():
            c = info['coeffs']
            if pole in c and c[pole].get('p', 1.0) < 0.05:
                if c[pole]['estimate'] > 0: sp += 1
                else: sn += 1
        counts[pole] = (sp, sn)
    print(f"  {sh:25s} {counts[sh][0]:>5d} {counts[sh][1]:>5d}    {mob:25s} {counts[mob][0]:>5d} {counts[mob][1]:>5d}")


# ─────────────────────────────────────────────────────────────────────────────
# §5.3.3 — Decision themes (RQ13)
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 78)
print("§5.3.3 — Decision themes (RQ13)")
print("=" * 78)
print()

# Trait-pole Δ medians (Figure 18)
print("Trait-pole Δ medians (stay-home minus go-out, percentage points; Figure 18):")
poles = list(trait_data['pole_rates'][trait_data['configs'][0]].keys())
for pole in poles:
    deltas = []
    for cfg in trait_data['configs']:
        y = trait_data['pole_rates_yes'][cfg].get(pole, 0)
        n = trait_data['pole_rates_no'][cfg].get(pole, 0)
        deltas.append(y - n)
    print(f"  {pole:30s}  median Δ = {statistics.median(deltas)*100:+6.1f} pp")

# Concept-category Δ (Figure 19)
print()
print("Concept-category Δ medians (Figure 19, excl. Traits which is dropped from paper Fig 19):")
print(f"  {'concept':22s}  {'overall':>8s}  {'anthropic':>9s}  {'openai':>9s}  {'gemini':>9s}")
concepts = drivers_data['concepts']  # 6 concepts incl. Traits
for c in concepts:
    deltas_all = []
    deltas_p = {p: [] for p in PROVS}
    for cfg in drivers_data['by_config']:
        bd = drivers_data['by_config'][cfg]['by_decision']
        d = bd['yes'].get(c, 0) - bd['no'].get(c, 0)
        deltas_all.append(d)
        prov = cfg.split('_')[0]
        deltas_p[prov].append(d)
    overall = statistics.median(deltas_all) * 100
    medians = {p: statistics.median(deltas_p[p]) * 100 for p in PROVS}
    note = ' (dropped from paper Fig 19)' if c == 'Traits' else ''
    print(f"  {c:22s}  {overall:+7.1f}pp  {medians['anthropic']:+8.1f}pp  {medians['openai']:+8.1f}pp  {medians['gemini']:+8.1f}pp{note}")


# ─────────────────────────────────────────────────────────────────────────────
# §5.3.4 — Persona individuation (RQ14, was dashboard's RQ16)
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 78)
print("§5.3.4 — Persona individuation (RQ14)")
print("=" * 78)
print()

# Persona individuation Δ per config
print(f"  {'config':50s}  {'within':>7s}  {'across':>7s}  {'Δ':>7s}")
for cfg in sorted(persona_data.keys()):
    info = persona_data[cfg]
    w = info.get('within_mean')
    a = info.get('across_mean')
    d = info.get('delta')
    if w is None: continue
    print(f"  {cfg[:50]:50s}  {w:7.4f}  {a:7.4f}  {d:+7.4f}")

deltas_all = [persona_data[c].get('delta') for c in persona_data if persona_data[c].get('delta') is not None]
print()
print(f"All-21 stats: {sum(1 for d in deltas_all if d > 0)} of {len(deltas_all)} have Δ > 0; "
      f"median = {statistics.median(deltas_all):.4f}")

# Per-provider summaries
print()
print("Per-provider summary:")
for p in PROVS:
    ds = [info.get('delta', 0) for cfg, info in persona_data.items()
          if cfg.split('_')[0] == p and info.get('delta') is not None]
    print(f"  {p:10s}  median Δ = {statistics.median(ds):.3f}   "
          f"min = {min(ds):.3f}   max = {max(ds):.3f}")

# OpenAI reasoning-ladder breakdown
print()
print("OpenAI reasoning-ladder breakdown (highlighted in §5.3.3 prose):")
for cfg in ['openai_gpt-5_2_off', 'openai_gpt-5_2_low', 'openai_gpt-5_2_medium',
            'openai_gpt-5_2_high', 'openai_o3_required',
            'openai_gpt-4o_off', 'openai_gpt-4_1_off']:
    info = persona_data.get(cfg, {})
    d = info.get('delta')
    if d is not None:
        print(f"  {cfg:30s}  Δ = {d:.3f}")
