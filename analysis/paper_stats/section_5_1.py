#!/usr/bin/env python3
"""
Reproduce numerical claims cited in §5.1 of viz/paper.html.

Reads:
  viz/data/real/all_macro.csv  (mobility curve data: 21 configs × 40 infection levels)
  viz/data/metadata/models.csv (per-config release date and knowledge cutoff)

Run from the GABM mobility curve project root:
  python analysis/paper_stats/section_5_1.py

Output is a plain-text report grouped by paper subsection. Every printed
value corresponds to a specific claim in the paper prose. The §5.1 prose
makes more visual / qualitative claims than §5.2, so this script focuses
on the concretely verifiable numbers (per-config mean stay-home rate,
reasoning-ladder differences, knowledge-cutoff and release-date windows).
"""

import csv
import os
import statistics
from collections import defaultdict
from datetime import datetime

HERE = os.path.dirname(os.path.abspath(__file__))            # analysis/paper_stats/
ROOT = os.path.dirname(os.path.dirname(HERE))                # GABM mobility curve/
MACRO_PATH = os.path.join(ROOT, 'viz', 'data', 'real', 'all_macro.csv')
META_PATH = os.path.join(ROOT, 'viz', 'data', 'metadata', 'models.csv')


# ── helpers ───────────────────────────────────────────────────────────────────

def load_macro():
    """Returns dict[config_key] = list of dicts with infection and stay-home rate."""
    data = defaultdict(list)
    with open(MACRO_PATH) as f:
        for row in csv.DictReader(f):
            key = (row['provider'], row['model'], row['reasoning'])
            data[key].append({
                'infection': float(row['infection_level']),
                'stay_home': float(row['pct_stay_home']),  # 0–100
            })
    # Sort each config's rows by infection level
    for key in data:
        data[key].sort(key=lambda r: r['infection'])
    return data


def load_meta():
    """Returns dict[config_key] = {release_date, knowledge_cutoff} as datetimes."""
    data = {}
    with open(META_PATH) as f:
        for row in csv.DictReader(f):
            key = (row['provider'], row['alias'], row['reasoning'])
            release = row['release_date']
            cutoff = row['knowledge_cutoff']
            # Cutoff is "YYYY-MM"; pad to first of month
            cutoff_dt = datetime.strptime(cutoff + '-01', '%Y-%m-%d') if cutoff else None
            release_dt = datetime.strptime(release, '%Y-%m-%d') if release else None
            data[key] = {'release': release_dt, 'cutoff': cutoff_dt}
    return data


def mean_stay_home(rows):
    """Mean stay-home rate (0–100) across all infection levels for one config."""
    return statistics.mean(r['stay_home'] for r in rows)


def stay_home_at(rows, infection):
    """Stay-home rate at the row whose infection level is closest to `infection`."""
    best = min(rows, key=lambda r: abs(r['infection'] - infection))
    return best['stay_home'], best['infection']


def fmt_label(key):
    return f"{key[1]} ({key[2]})" if key[2] != 'off' else key[1]


def is_canonical_reasoning(key):
    """True if this config's reasoning level is the canonical rung for its base model.
    For era analyses (§5.1.5, §5.1.6) we collapse reasoning ladders since reasoning
    level is orthogonal to release/cutoff date. Keep 'off' and 'required' (o3); skip
    'low', 'medium', 'high' variants of GPT-5.2 and Gemini 3 Flash Preview."""
    return key[2].lower() not in {'low', 'medium', 'high'}


# ── load data ─────────────────────────────────────────────────────────────────
macro = load_macro()
meta = load_meta()
configs = sorted(macro.keys())  # 21 configs

# Per-config mean stay-home rate
mean_sh = {key: mean_stay_home(rows) for key, rows in macro.items()}

# ─────────────────────────────────────────────────────────────────────────────
# §5.1.1 — Cross-provider differences (RQ1)
# ─────────────────────────────────────────────────────────────────────────────
print("=" * 78)
print("§5.1.1 — Cross-provider differences (RQ1)")
print("=" * 78)
print()

print("Mean stay-home rate per config (% across all 40 infection levels), by provider:")
for provider in ['anthropic', 'openai', 'gemini']:
    cfgs = [k for k in configs if k[0] == provider]
    cfgs.sort(key=lambda k: -mean_sh[k])  # most cautious first
    print(f"  {provider} (n={len(cfgs)}):")
    for k in cfgs:
        print(f"    {fmt_label(k):40s}  mean stay-home = {mean_sh[k]:5.1f}%")

print()
print("Provider-level extremes:")
for provider in ['anthropic', 'openai', 'gemini']:
    cfgs = [k for k in configs if k[0] == provider]
    cautious = max(cfgs, key=lambda k: mean_sh[k])
    mobile   = min(cfgs, key=lambda k: mean_sh[k])
    print(f"  {provider}: most cautious = {fmt_label(cautious)} ({mean_sh[cautious]:.1f}%); "
          f"most mobile = {fmt_label(mobile)} ({mean_sh[mobile]:.1f}%)")

# Flagship comparison (paper Fig 4)
print()
print("Flagship comparison at reasoning=off:")
flagships = [
    ('anthropic', 'claude-opus-4-5', 'off'),
    ('openai',    'gpt-5.2',         'off'),
    ('gemini',    'gemini-3-flash-preview', 'off'),
]
for k in flagships:
    rows = macro[k]
    sh_at_0, inf_at_0 = stay_home_at(rows, 0.0)
    sh_at_03, inf_at_03 = stay_home_at(rows, 0.3)
    sh_at_7, inf_at_7 = stay_home_at(rows, 7.0)
    print(f"  {fmt_label(k):40s}  mean = {mean_sh[k]:5.1f}%  "
          f"@infection={inf_at_0:.2f}: {sh_at_0:5.1f}%  "
          f"@infection={inf_at_03:.2f}: {sh_at_03:5.1f}%  "
          f"@infection={inf_at_7:.2f}: {sh_at_7:5.1f}%")

# Mobility band for Claude Opus 4.5 and Gemini 3 Flash Preview (paper claim: 75-90%)
print()
print("Mobility-band check (paper claims 75–90% mobility = 10–25% stay-home):")
for k in [('anthropic', 'claude-opus-4-5', 'off'),
          ('gemini', 'gemini-3-flash-preview', 'off')]:
    rows = macro[k]
    sh_vals = [r['stay_home'] for r in rows]
    print(f"  {fmt_label(k):40s}  stay-home min={min(sh_vals):.1f}%  "
          f"max={max(sh_vals):.1f}%  median={statistics.median(sh_vals):.1f}%")

# ─────────────────────────────────────────────────────────────────────────────
# §5.1.2 — Reasoning level (RQ2)
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 78)
print("§5.1.2 — Reasoning level (RQ2)")
print("=" * 78)
print()

print("Mean stay-home rate by reasoning level:")
for label, model_id in [('GPT-5.2', ('openai', 'gpt-5.2')),
                         ('Gemini 3 Flash Preview', ('gemini', 'gemini-3-flash-preview'))]:
    print(f"  {label}:")
    levels = []
    for r in ['off', 'low', 'medium', 'high']:
        k = model_id + (r,)
        if k in mean_sh:
            print(f"    reasoning = {r:6s}  mean stay-home = {mean_sh[k]:5.1f}%")
            levels.append((r, mean_sh[k]))
    if len(levels) >= 2:
        diff = levels[-1][1] - levels[0][1]
        # Mobility = 100 - stay_home, so mobility shift = -(stay_home shift)
        mob_diff = -diff
        print(f"    off → high stay-home shift = {diff:+.1f} pp  "
              f"(mobility shift = {mob_diff:+.1f} pp)")

# ─────────────────────────────────────────────────────────────────────────────
# §5.1.3 — Model size (RQ3)
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 78)
print("§5.1.3 — Model size (RQ3)")
print("=" * 78)
print()

print("Anthropic Claude 4.5 family:")
for k in [('anthropic', 'claude-haiku-4-5', 'off'),
          ('anthropic', 'claude-sonnet-4-5', 'off'),
          ('anthropic', 'claude-opus-4-5', 'off')]:
    print(f"  {fmt_label(k):30s}  mean stay-home = {mean_sh[k]:5.1f}%")

print()
print("Gemini 2.5 family:")
for k in [('gemini', 'gemini-2.5-flash-lite', 'off'),
          ('gemini', 'gemini-2.5-flash', 'off')]:
    print(f"  {fmt_label(k):30s}  mean stay-home = {mean_sh[k]:5.1f}%")

# ─────────────────────────────────────────────────────────────────────────────
# §5.1.4 — Model evolution (RQ4)
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 78)
print("§5.1.4 — Model evolution (RQ4)")
print("=" * 78)
print()

print("Anthropic evolution sequence:")
for k in [('anthropic', 'claude-sonnet-4-0', 'off'),
          ('anthropic', 'claude-sonnet-4-5', 'off')]:
    print(f"  {fmt_label(k):30s}  mean stay-home = {mean_sh[k]:5.1f}%")

print()
print("OpenAI evolution sequence (chronological):")
for k in [('openai', 'gpt-3.5-turbo', 'off'),
          ('openai', 'gpt-4o', 'off'),
          ('openai', 'gpt-4.1', 'off'),
          ('openai', 'gpt-5.1', 'off'),
          ('openai', 'gpt-5.2', 'off')]:
    print(f"  {fmt_label(k):30s}  mean stay-home = {mean_sh[k]:5.1f}%")

print()
print("Gemini evolution sequence:")
for k in [('gemini', 'gemini-2.0-flash', 'off'),
          ('gemini', 'gemini-2.5-flash', 'off'),
          ('gemini', 'gemini-3-flash-preview', 'off')]:
    print(f"  {fmt_label(k):30s}  mean stay-home = {mean_sh[k]:5.1f}%")

# ─────────────────────────────────────────────────────────────────────────────
# §5.1.5 — Knowledge cutoff (RQ5)
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 78)
print("§5.1.5 — Knowledge cutoff (RQ5)")
print("=" * 78)
print()

print("Per-config knowledge cutoff and mean stay-home rate (sorted by cutoff;")
print("filtered to canonical reasoning rung — reasoning=off, or o3 at required):")
sorted_by_cutoff = sorted(
    [(k, meta[k]['cutoff'], mean_sh[k])
     for k in configs
     if k in meta and meta[k]['cutoff'] and is_canonical_reasoning(k)],
    key=lambda x: x[1]
)
for k, cutoff, sh in sorted_by_cutoff:
    print(f"  {cutoff.strftime('%Y-%m'):8s}  {fmt_label(k):40s}  mean stay-home = {sh:5.1f}%")

# Era group windows
print()
print("Era group windows (paper §5.1.5 mentions 3-month windows):")
era_groups = [
    ('Pre-2024',  '2021-01', '2024-01'),
    ('Mid-2024',  '2024-06', '2024-09'),
    ('Early-2025','2025-01', '2025-03'),
    ('Late-2025', '2025-08', '2025-08'),
]
for label, start, end in era_groups:
    s = datetime.strptime(start + '-01', '%Y-%m-%d')
    e = datetime.strptime(end + '-01', '%Y-%m-%d')
    members = [(k, sh) for k, c, sh in sorted_by_cutoff if s <= c <= e]
    if not members:
        continue
    sh_vals = [sh for _, sh in members]
    print(f"  {label} ({start}…{end}): {len(members)} configs, "
          f"stay-home min={min(sh_vals):.1f}%, max={max(sh_vals):.1f}%, "
          f"spread={max(sh_vals) - min(sh_vals):.1f} pp")
    for k, sh in members:
        print(f"    {fmt_label(k):40s}  stay-home = {sh:5.1f}%")

# ─────────────────────────────────────────────────────────────────────────────
# §5.1.6 — Release date (RQ6)
# ─────────────────────────────────────────────────────────────────────────────
print()
print("=" * 78)
print("§5.1.6 — Release date (RQ6)")
print("=" * 78)
print()

print("Per-config release date and mean stay-home rate (sorted by release;")
print("filtered to canonical reasoning rung — reasoning=off, or o3 at required):")
sorted_by_release = sorted(
    [(k, meta[k]['release'], mean_sh[k])
     for k in configs
     if k in meta and meta[k]['release'] and is_canonical_reasoning(k)],
    key=lambda x: x[1]
)
for k, release, sh in sorted_by_release:
    print(f"  {release.strftime('%Y-%m-%d'):10s}  {fmt_label(k):40s}  mean stay-home = {sh:5.1f}%")

print()
print("Release-era windows (paper §5.1.6: legacy / early 2025 / late 2025):")
release_groups = [
    ('Legacy (pre-2025)', '2024-01-01', '2024-12-31'),
    ('Early 2025',        '2025-02-01', '2025-06-30'),
    ('Late 2025',         '2025-09-01', '2025-12-31'),
]
for label, start, end in release_groups:
    s = datetime.strptime(start, '%Y-%m-%d')
    e = datetime.strptime(end, '%Y-%m-%d')
    members = [(k, sh) for k, r, sh in sorted_by_release if s <= r <= e]
    if not members:
        continue
    sh_vals = [sh for _, sh in members]
    months = (e.year * 12 + e.month) - (s.year * 12 + s.month) + 1
    print(f"  {label} ({months}-month window {start}…{end}): {len(members)} configs, "
          f"stay-home min={min(sh_vals):.1f}%, max={max(sh_vals):.1f}%, "
          f"spread={max(sh_vals) - min(sh_vals):.1f} pp")
    for k, sh in members:
        print(f"    {fmt_label(k):40s}  stay-home = {sh:5.1f}%")
