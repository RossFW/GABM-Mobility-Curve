#!/usr/bin/env python3
"""
Produce three example response pairs from Claude Opus 4.5 at known cosine
similarities, anchoring the cosine-scale interpretation in §5.3.3 (Figure 20).

Reads:
  viz/data/real/anthropic_claude-opus-4-5_off/response_embeddings.npz
  viz/data/real/anthropic_claude-opus-4-5_off/probe_results_micro.csv

Writes:
  viz/data/real/cosine_examples.json

Run from the GABM mobility curve project root:
  python analysis/paper_stats/cosine_examples.py

The three example pairs span:
  - within-agent (same agent, two reps):   cosine ≈ 0.99
  - across-agent, same decision (mid):     cosine ≈ 0.85
  - across-agent, same decision (low):     cosine ≈ 0.65

All three pairs are constrained to the same go-out decision (the dominant
decision at infection 3.5%) so they reflect the population Fig 21's persona-
individuation calculation actually operates on (within unanimous-direction
subsets).

The infection level is held fixed at 3.5% (mid-range) for comparability.
"""

import csv
import json
import os
import numpy as np

HERE = os.path.dirname(os.path.abspath(__file__))            # analysis/paper_stats/
ROOT = os.path.dirname(os.path.dirname(HERE))                # GABM mobility curve/
CFG_DIR = os.path.join(ROOT, 'viz', 'data', 'real', 'anthropic_claude-opus-4-5_off')
EMB_PATH = os.path.join(CFG_DIR, 'response_embeddings.npz')
CSV_PATH = os.path.join(CFG_DIR, 'probe_results_micro.csv')
OUT_PATH = os.path.join(ROOT, 'viz', 'data', 'real', 'cosine_examples.json')

INFECTION_TARGET = 3.5
TARGETS = [
    {'cosine_target': 0.99, 'label': 'Within-agent (two reps of the same agent)',
     'require_same_agent': True, 'require_same_decision': True, 'require_decision': 'no'},
    {'cosine_target': 0.85, 'label': 'Across agents, same decision',
     'require_same_agent': False, 'require_same_decision': True, 'require_decision': 'no'},
    {'cosine_target': 0.65, 'label': 'Across agents, same decision (low cosine)',
     'require_same_agent': False, 'require_same_decision': True, 'require_decision': 'no'},
]


def load_texts():
    """Load reasoning text + decision per row index from probe_results_micro.csv."""
    rows = []
    with open(CSV_PATH) as f:
        for r in csv.DictReader(f):
            rows.append({
                'agent_id':       int(r['agent_id']),
                'agent_name':     r.get('agent_name', ''),
                'rep':            int(r['rep']),
                'infection_level': float(r['infection_level']),
                'decision':       r['response'].strip().lower(),
                'reasoning':      r.get('reasoning_text', ''),
                'traits':         r.get('traits', ''),
                'age':            r.get('age', ''),
            })
    return rows


def main():
    print(f'Loading {EMB_PATH}…')
    emb_data = np.load(EMB_PATH)
    embeddings = emb_data['embedding']
    agent_ids = emb_data['agent_id']
    reps = emb_data['rep']
    infs = emb_data['infection_level']
    row_idx = emb_data['row_idx']

    texts = load_texts()
    norms = np.linalg.norm(embeddings, axis=1, keepdims=True)
    normed = embeddings / norms

    # Restrict to the target infection level
    mask = np.isclose(infs, INFECTION_TARGET)
    inf_indices = np.where(mask)[0]
    sub_norm = normed[mask]
    cos_full = sub_norm @ sub_norm.T

    # For each target, find best matching pair
    selected = []
    used_rows = set()
    for tgt in TARGETS:
        best = None
        best_diff = float('inf')
        n = len(inf_indices)
        for i in range(n):
            for j in range(i + 1, n):
                a = inf_indices[i]; b = inf_indices[j]
                if int(row_idx[a]) in used_rows or int(row_idx[b]) in used_rows:
                    continue
                same_agent = agent_ids[a] == agent_ids[b]
                if tgt['require_same_agent'] != same_agent:
                    continue
                ta = texts[int(row_idx[a])]
                tb = texts[int(row_idx[b])]
                same_decision = ta['decision'] == tb['decision']
                if tgt['require_same_decision'] != same_decision:
                    continue
                req_dec = tgt.get('require_decision')
                if req_dec is not None and (ta['decision'] != req_dec or tb['decision'] != req_dec):
                    continue
                c = float(cos_full[i, j])
                diff = abs(c - tgt['cosine_target'])
                if diff < best_diff:
                    best_diff = diff
                    best = (a, b, c, ta, tb)
        if best is None:
            print(f'WARNING: no pair found for target {tgt}')
            continue
        a, b, c, ta, tb = best
        used_rows.add(int(row_idx[a])); used_rows.add(int(row_idx[b]))
        selected.append({
            'cosine': round(c, 3),
            'cosine_target': tgt['cosine_target'],
            'label': tgt['label'],
            'response_a': {
                'agent_id': ta['agent_id'], 'agent_name': ta['agent_name'],
                'rep': ta['rep'], 'decision': ta['decision'],
                'traits': ta['traits'], 'age': ta['age'],
                'reasoning': ta['reasoning'],
            },
            'response_b': {
                'agent_id': tb['agent_id'], 'agent_name': tb['agent_name'],
                'rep': tb['rep'], 'decision': tb['decision'],
                'traits': tb['traits'], 'age': tb['age'],
                'reasoning': tb['reasoning'],
            },
        })
        print(f"  found pair at cosine ≈ {tgt['cosine_target']}: actual = {c:.3f}")

    output = {
        'config': 'anthropic_claude-opus-4-5_off',
        'config_label': 'Claude Opus 4.5',
        'infection_level': INFECTION_TARGET,
        'embedding_model': 'text-embedding-3-large',
        'pairs': selected,
    }

    os.makedirs(os.path.dirname(OUT_PATH), exist_ok=True)
    with open(OUT_PATH, 'w') as f:
        json.dump(output, f, indent=2)
    print(f'\nWrote {OUT_PATH} with {len(selected)} pairs.')


if __name__ == '__main__':
    main()
