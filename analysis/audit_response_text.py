#!/usr/bin/env python3
"""Phase 0: Audit response text to validate keyword lists before regression pipeline.

Samples responses from all 21 configs and reports:
1. N-values per keyword (how many of 20K responses match each word)
2. Context samples (keyword in ±40 chars of surrounding text)
3. Age number mentions (do agents cite their actual age?)
4. Infection context (restating prompt vs. reasoning?)
5. Summary table per config

Output: analysis/audit_results.txt
"""

import csv
import os
import re
import random
from collections import defaultdict

random.seed(42)

DATA_DIR = os.path.join(os.path.dirname(__file__), '..', 'viz', 'data', 'real')

# ── Keywords to audit ──────────────────────────────────────────
# Big Five (existing, already validated — included for completeness)
BIG_FIVE = {
    'extraversion': {
        'positive': ['extroverted', 'extrovert', 'extraverted', 'extravert', 'extraversion', 'extroversion'],
        'negative': ['introverted', 'introvert', 'introversion'],
    },
    'agreeableness': {
        'positive': ['agreeable', 'agreeableness'],
        'negative': ['antagonistic', 'antagonism', 'disagreeable'],
    },
    'conscientiousness': {
        'positive': ['conscientious', 'conscientiousness'],
        'negative': ['unconscientious'],
    },
    'neuroticism': {
        'positive': ['neurotic', 'neuroticism'],
        'negative': ['emotionally stable', 'emotional stability'],
    },
    'openness': {
        'positive': ['open to experience', 'openness', 'open-minded'],
        'negative': ['closed to experience', 'closed-minded'],
    },
}

# New keywords to audit
INFECTION_KEYWORDS = ['infection', 'infected', 'cases', 'diagnosed', 'diagnoses']
# Infection rate number pattern: matches "X.X%" or "X%" or "X percent"
INFECTION_RATE_PATTERN = re.compile(r'\b\d+\.?\d*\s*(%|percent)', re.IGNORECASE)
# Word-boundary patterns for age keywords to avoid false positives
# (e.g., "engage" matching "age", "told" matching "old")
AGE_KEYWORDS_SIMPLE = ['years old', 'young']  # no word-boundary issues
AGE_KEYWORDS_WB = ['age', 'old']  # need \b word boundaries
AGE_WB_PATTERNS = {kw: re.compile(r'\b' + re.escape(kw) + r'\b', re.IGNORECASE) for kw in AGE_KEYWORDS_WB}
# Age number pattern: matches 2-digit numbers 18-69
AGE_NUMBER_PATTERN = re.compile(r'\b([1-6]\d)\b')

# How many context samples per keyword per config
N_SAMPLES = 5
# How many configs to show full context for
CONTEXT_CONFIGS = ['anthropic_claude-opus-4-5_off', 'openai_gpt-5_2_off', 'gemini_gemini-3-flash-preview_off',
                   'openai_gpt-3_5-turbo_off', 'gemini_gemini-2_5-flash-lite_off',
                   'openai_o3_required', 'anthropic_claude-sonnet-4-5_off']


def extract_context(text, keyword, window=50):
    """Extract keyword in context (±window chars)."""
    idx = text.lower().find(keyword.lower())
    if idx == -1:
        return None
    start = max(0, idx - window)
    end = min(len(text), idx + len(keyword) + window)
    prefix = '...' if start > 0 else ''
    suffix = '...' if end < len(text) else ''
    snippet = text[start:end]
    # Highlight the keyword
    kw_start = idx - start
    kw_end = kw_start + len(keyword)
    highlighted = snippet[:kw_start] + '>>>' + snippet[kw_start:kw_end] + '<<<' + snippet[kw_end:]
    return f"{prefix}{highlighted}{suffix}"


def audit_config(config_dir):
    """Audit one config's micro CSV."""
    micro_path = os.path.join(DATA_DIR, config_dir, 'probe_results_micro.csv')
    if not os.path.exists(micro_path):
        return None

    results = {
        'config': config_dir,
        'total_rows': 0,
        'keyword_counts': defaultdict(int),       # keyword -> count
        'dimension_counts': defaultdict(int),      # dimension -> count (any keyword)
        'keyword_contexts': defaultdict(list),     # keyword -> [context snippets]
        'age_number_count': 0,
        'age_number_correct': 0,  # mentions own age
        'age_number_contexts': [],
        'age_number_wrong_contexts': [],  # mentions a number that's NOT their age
        'infection_rate_count': 0,  # mentions a percentage number
        'infection_rate_contexts': [],
        'no_mention_samples': [],  # responses that mention ZERO keywords
    }

    with open(micro_path, 'r') as f:
        reader = csv.DictReader(f)
        rows = list(reader)

    results['total_rows'] = len(rows)

    for row in rows:
        text = row.get('reasoning_text', '') or ''
        text_lower = text.lower()
        agent_age = row.get('age', '')

        # Big Five keywords
        any_big5 = False
        for dim, poles in BIG_FIVE.items():
            dim_matched = False
            for pole, keywords in poles.items():
                for kw in keywords:
                    if kw.lower() in text_lower:
                        results['keyword_counts'][f"{dim}/{pole}/{kw}"] += 1
                        if len(results['keyword_contexts'][f"{dim}/{pole}/{kw}"]) < N_SAMPLES * 2:
                            ctx = extract_context(text, kw)
                            if ctx:
                                results['keyword_contexts'][f"{dim}/{pole}/{kw}"].append(ctx)
                        dim_matched = True
            if dim_matched:
                results['dimension_counts'][dim] += 1
                any_big5 = True

        # Infection keywords
        inf_matched = False
        for kw in INFECTION_KEYWORDS:
            if kw.lower() in text_lower:
                results['keyword_counts'][f"infection/{kw}"] += 1
                if len(results['keyword_contexts'][f"infection/{kw}"]) < N_SAMPLES * 2:
                    ctx = extract_context(text, kw)
                    if ctx:
                        results['keyword_contexts'][f"infection/{kw}"].append(ctx)
                inf_matched = True
        if inf_matched:
            results['dimension_counts']['infection'] += 1

        # Age keywords (simple substring match for unambiguous terms)
        age_matched = False
        for kw in AGE_KEYWORDS_SIMPLE:
            if kw.lower() in text_lower:
                results['keyword_counts'][f"age_word/{kw}"] += 1
                if len(results['keyword_contexts'][f"age_word/{kw}"]) < N_SAMPLES * 2:
                    ctx = extract_context(text, kw)
                    if ctx:
                        results['keyword_contexts'][f"age_word/{kw}"].append(ctx)
                age_matched = True
        # Word-boundary match for ambiguous terms ("age", "old")
        for kw, pattern in AGE_WB_PATTERNS.items():
            if pattern.search(text):
                results['keyword_counts'][f"age_wb/{kw}"] += 1
                if len(results['keyword_contexts'][f"age_wb/{kw}"]) < N_SAMPLES * 2:
                    m = pattern.search(text)
                    if m:
                        ctx = extract_context(text, m.group())
                        if ctx:
                            results['keyword_contexts'][f"age_wb/{kw}"].append(ctx)
                age_matched = True
        if age_matched:
            results['dimension_counts']['age_words'] += 1

        # Age number pattern
        age_nums = AGE_NUMBER_PATTERN.findall(text)
        if age_nums:
            results['age_number_count'] += 1
            if agent_age and str(agent_age) in age_nums:
                results['age_number_correct'] += 1
                if len(results['age_number_contexts']) < N_SAMPLES * 2:
                    ctx = extract_context(text, str(agent_age))
                    if ctx:
                        results['age_number_contexts'].append(f"[agent age={agent_age}] {ctx}")
            else:
                # Matched a number but not their own age
                if len(results['age_number_wrong_contexts']) < N_SAMPLES:
                    for num in age_nums[:1]:
                        ctx = extract_context(text, num)
                        if ctx:
                            results['age_number_wrong_contexts'].append(f"[agent age={agent_age}, matched={num}] {ctx}")

        # Combined age (words OR number)
        if age_matched or age_nums:
            results['dimension_counts']['age_any'] += 1

        # Infection rate number pattern (e.g., "0.0%", "1.2%", "7%", "3 percent")
        rate_match = INFECTION_RATE_PATTERN.search(text)
        if rate_match:
            results['infection_rate_count'] += 1
            if len(results['infection_rate_contexts']) < N_SAMPLES * 2:
                ctx = extract_context(text, rate_match.group())
                if ctx:
                    results['infection_rate_contexts'].append(ctx)

        # Combined infection flag: words OR rate number
        if inf_matched or rate_match:
            results['dimension_counts']['infection_combined'] += 1

        # Track responses that mention ZERO keywords (no Big Five, no infection words/rate, no age)
        any_mention = any_big5 or inf_matched or bool(rate_match) or age_matched or bool(age_nums)
        if not any_mention and len(results['no_mention_samples']) < N_SAMPLES * 3:
            # Store the full response (truncated to 200 chars) for inspection
            results['no_mention_samples'].append(text[:300] if text else '[EMPTY]')

    return results


def format_report(all_results):
    """Format audit results as a readable report."""
    lines = []
    lines.append("=" * 80)
    lines.append("PHASE 0: RESPONSE TEXT KEYWORD AUDIT")
    lines.append("=" * 80)
    lines.append("")

    # ── Summary table ──
    lines.append("SUMMARY TABLE: Dimension mention rates (% of 20K responses)")
    lines.append("-" * 120)
    header = f"{'Config':<45} {'Extrav':>7} {'Agree':>7} {'Consc':>7} {'Neuro':>7} {'Open':>7} {'InfWrd':>7} {'Inf#%':>7} {'InfAll':>7} {'AgeWrd':>7} {'AgeNum':>7} {'AgeAny':>7}"
    lines.append(header)
    lines.append("-" * 140)

    for r in all_results:
        n = r['total_rows']
        pct = lambda dim: f"{r['dimension_counts'].get(dim, 0) / n * 100:.1f}%" if n > 0 else 'N/A'
        inf_rate_pct = f"{r['infection_rate_count']/n*100:.1f}%" if n > 0 else 'N/A'
        line = f"{r['config']:<45} {pct('extraversion'):>7} {pct('agreeableness'):>7} {pct('conscientiousness'):>7} {pct('neuroticism'):>7} {pct('openness'):>7} {pct('infection'):>7} {inf_rate_pct:>7} {pct('infection_combined'):>7} {pct('age_words'):>7} {r['age_number_count']/n*100:.1f}%{' ':>1} {pct('age_any'):>7}"
        lines.append(line)
    lines.append("")

    # ── Per-keyword breakdown (selected configs) ──
    lines.append("=" * 80)
    lines.append("PER-KEYWORD BREAKDOWN (selected configs)")
    lines.append("=" * 80)

    for r in all_results:
        if r['config'] not in CONTEXT_CONFIGS:
            continue

        lines.append("")
        lines.append(f"{'─' * 80}")
        lines.append(f"CONFIG: {r['config']}  (n={r['total_rows']})")
        lines.append(f"{'─' * 80}")

        # Group by category
        categories = defaultdict(list)
        for key, count in sorted(r['keyword_counts'].items()):
            cat = key.split('/')[0]
            categories[cat].append((key, count))

        for cat, items in sorted(categories.items()):
            lines.append(f"\n  [{cat}]")
            for key, count in sorted(items, key=lambda x: -x[1]):
                pct = count / r['total_rows'] * 100
                lines.append(f"    {key:<50} n={count:>6}  ({pct:>5.1f}%)")

        # Age number stats
        lines.append(f"\n  [age_numbers]")
        lines.append(f"    Any 2-digit number (18-69):                      n={r['age_number_count']:>6}  ({r['age_number_count']/r['total_rows']*100:>5.1f}%)")
        lines.append(f"    Matches agent's OWN age:                         n={r['age_number_correct']:>6}  ({r['age_number_correct']/r['total_rows']*100:>5.1f}%)")

    # ── Context samples (selected configs) ──
    lines.append("")
    lines.append("=" * 80)
    lines.append("CONTEXT SAMPLES — How do models use these words?")
    lines.append("=" * 80)

    for r in all_results:
        if r['config'] not in CONTEXT_CONFIGS:
            continue

        lines.append(f"\n{'─' * 80}")
        lines.append(f"CONFIG: {r['config']}")
        lines.append(f"{'─' * 80}")

        # Big Five contexts (sample top keywords per dimension)
        for dim in ['extraversion', 'agreeableness', 'conscientiousness', 'neuroticism', 'openness']:
            # Find all keyword keys for this dimension, pick the top 2 by count
            dim_keys = [(k, r['keyword_counts'][k]) for k in r['keyword_counts'] if k.startswith(dim + '/')]
            dim_keys.sort(key=lambda x: -x[1])
            for kw_key, count in dim_keys[:2]:
                contexts = r['keyword_contexts'].get(kw_key, [])
                if contexts:
                    lines.append(f"\n  [{kw_key}] (n={count}) — {N_SAMPLES} samples:")
                    for ctx in random.sample(contexts, min(N_SAMPLES, len(contexts))):
                        lines.append(f"    • {ctx}")

        # Infection word contexts
        for kw in INFECTION_KEYWORDS:
            kw_key = f"infection/{kw}"
            contexts = r['keyword_contexts'].get(kw_key, [])
            if contexts:
                count = r['keyword_counts'].get(kw_key, 0)
                lines.append(f"\n  [{kw_key}] (n={count}) — {N_SAMPLES} samples:")
                for ctx in random.sample(contexts, min(N_SAMPLES, len(contexts))):
                    lines.append(f"    • {ctx}")

        # Infection rate number contexts
        if r['infection_rate_contexts']:
            lines.append(f"\n  [infection_rate_number] (n={r['infection_rate_count']}) — {N_SAMPLES} samples:")
            for ctx in random.sample(r['infection_rate_contexts'], min(N_SAMPLES, len(r['infection_rate_contexts']))):
                lines.append(f"    • {ctx}")

        # Age word contexts
        for kw in AGE_KEYWORDS_SIMPLE + [f for f in AGE_KEYWORDS_WB]:
            kw_key = f"age_word/{kw}" if kw in AGE_KEYWORDS_SIMPLE else f"age_wb/{kw}"
            contexts = r['keyword_contexts'].get(kw_key, [])
            if contexts:
                lines.append(f"\n  [{kw_key}] — {N_SAMPLES} samples:")
                for ctx in random.sample(contexts, min(N_SAMPLES, len(contexts))):
                    lines.append(f"    • {ctx}")

        # Age number contexts (own age)
        if r['age_number_contexts']:
            lines.append(f"\n  [age_number — OWN age] — samples:")
            for ctx in random.sample(r['age_number_contexts'], min(N_SAMPLES, len(r['age_number_contexts']))):
                lines.append(f"    • {ctx}")

        # Age number contexts (wrong age)
        if r['age_number_wrong_contexts']:
            lines.append(f"\n  [age_number — NOT own age (potential false positive)] — samples:")
            for ctx in r['age_number_wrong_contexts'][:N_SAMPLES]:
                lines.append(f"    • {ctx}")

        # No-mention samples (responses with zero keyword matches)
        if r['no_mention_samples']:
            lines.append(f"\n  [NO KEYWORDS MATCHED — what do these responses look like?] — samples:")
            for sample in r['no_mention_samples'][:N_SAMPLES]:
                lines.append(f"    • {sample}")

    return '\n'.join(lines)


def main():
    configs = sorted([d for d in os.listdir(DATA_DIR)
                      if os.path.isdir(os.path.join(DATA_DIR, d)) and not d.startswith('.')])

    print(f"Auditing {len(configs)} configs...")
    all_results = []
    for i, cfg in enumerate(configs):
        print(f"  [{i+1}/{len(configs)}] {cfg}...", end='', flush=True)
        result = audit_config(cfg)
        if result:
            all_results.append(result)
            print(f" done ({result['total_rows']} rows)")
        else:
            print(" SKIPPED (no micro CSV)")

    report = format_report(all_results)

    out_path = os.path.join(os.path.dirname(__file__), 'audit_results.txt')
    with open(out_path, 'w') as f:
        f.write(report)
    print(f"\nReport saved to {out_path}")
    print(f"\n{'=' * 60}")
    print(report[:5000])
    print(f"\n... (truncated, see full report at {out_path})")


if __name__ == '__main__':
    main()
