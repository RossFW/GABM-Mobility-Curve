"""
validate_data.py — Data quality check for probe_results CSVs.

Usage:
    python3 validate_data.py                        # checks all data/ subdirs
    python3 validate_data.py gemini_gemini-2_0-flash_off  # specific config dir
"""

import csv
import os
import re
import sys
from collections import defaultdict

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")

EXPECTED_LEVELS = [
    0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
    1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9,
    2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9,
    3.0, 3.1, 3.2, 3.3, 3.4, 3.5,
    4.0, 5.0, 6.0, 7.0,
]
EXPECTED_LEVELS_SET = set(round(l, 1) for l in EXPECTED_LEVELS)
EXPECTED_AGENTS = 100
EXPECTED_REPS = 5
EXPECTED_ROWS = len(EXPECTED_LEVELS) * EXPECTED_AGENTS * EXPECTED_REPS  # 20,000

# Patterns that suggest API errors leaked into response/reasoning text
ERROR_PATTERNS = re.compile(
    r'\b(500 Internal Server Error|503 UNAVAILABLE|429 Too Many Requests|'
    r'Rate limit exceeded|RESOURCE_EXHAUSTED|InternalServerError|'
    r'ServiceUnavailable|APIError|api_error)\b',
    re.IGNORECASE
)

SKIP_DIRS = {"ping_tests", "character_tests", "spot_tests", "combined", "archive"}


def validate_config(config_dir: str) -> dict:
    name = os.path.basename(config_dir)
    micro_path = os.path.join(config_dir, "probe_results_micro.csv")
    macro_path = os.path.join(config_dir, "probe_results_macro.csv")

    issues = []
    warnings = []
    stats = {}

    # ── Micro CSV ──────────────────────────────────────────────────────────────
    if not os.path.exists(micro_path):
        issues.append("MISSING micro CSV")
        return {"name": name, "issues": issues, "warnings": warnings, "stats": stats}

    rows = []
    with open(micro_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(row)

    total_rows = len(rows)
    stats["total_rows"] = total_rows

    if total_rows != EXPECTED_ROWS:
        issues.append(f"Row count: {total_rows} (expected {EXPECTED_ROWS})")

    # Check response values — should only ever be "yes" or "no"
    response_counts = defaultdict(int)
    for r in rows:
        response_counts[r.get("response", "")] += 1

    n_yes = response_counts.get("yes", 0)
    n_no = response_counts.get("no", 0)
    n_empty = response_counts.get("", 0)
    unexpected = {k: v for k, v in response_counts.items() if k not in ("yes", "no", "")}

    n_format_invalid = sum(1 for r in rows if r.get("format_valid", "True") == "False")
    format_error_rate = n_format_invalid / total_rows * 100 if total_rows else 0

    stats["n_yes"] = n_yes
    stats["n_no"] = n_no
    stats["n_empty_response"] = n_empty
    stats["format_invalid"] = n_format_invalid
    stats["format_error_rate_pct"] = round(format_error_rate, 2)

    if unexpected:
        issues.append(f"Unexpected response values: {unexpected}")
    if n_empty > 0:
        issues.append(f"{n_empty} empty responses (format parse failures)")
    if format_error_rate > 2:
        warnings.append(f"High format error rate: {format_error_rate:.1f}%")

    # Check for API error strings leaked into responses
    n_error_in_response = 0
    n_error_in_reasoning = 0
    for r in rows:
        if ERROR_PATTERNS.search(r.get("response", "")):
            n_error_in_response += 1
        if ERROR_PATTERNS.search(r.get("reasoning_text", "")):
            n_error_in_reasoning += 1
    if n_error_in_response > 0:
        issues.append(f"{n_error_in_response} rows with API error text in response field")
    if n_error_in_reasoning > 0:
        warnings.append(f"{n_error_in_reasoning} rows with API error text in reasoning_text field")

    # Check levels present
    levels_found = set(round(float(r["infection_level"]), 1) for r in rows if r.get("infection_level"))
    missing_levels = EXPECTED_LEVELS_SET - levels_found
    extra_levels = levels_found - EXPECTED_LEVELS_SET
    if missing_levels:
        issues.append(f"Missing levels: {sorted(missing_levels)}")
    if extra_levels:
        warnings.append(f"Unexpected levels: {sorted(extra_levels)}")

    # Check agents and reps per level
    level_agent_rep = defaultdict(lambda: defaultdict(set))
    for r in rows:
        try:
            lvl = round(float(r["infection_level"]), 1)
            aid = r["agent_id"]
            rep = r["rep"]
            level_agent_rep[lvl][aid].add(rep)
        except (ValueError, KeyError):
            pass

    levels_with_wrong_agent_count = []
    levels_with_missing_reps = []
    for lvl in EXPECTED_LEVELS:
        lvl = round(lvl, 1)
        agents_at_level = level_agent_rep.get(lvl, {})
        n_agents = len(agents_at_level)
        if n_agents != EXPECTED_AGENTS:
            levels_with_wrong_agent_count.append(f"{lvl}%({n_agents})")
        for aid, reps in agents_at_level.items():
            if len(reps) != EXPECTED_REPS:
                levels_with_missing_reps.append(f"{lvl}%/agent{aid}({len(reps)} reps)")

    if levels_with_wrong_agent_count:
        issues.append(f"Wrong agent count at levels: {levels_with_wrong_agent_count[:5]}"
                      + (" ..." if len(levels_with_wrong_agent_count) > 5 else ""))
    if levels_with_missing_reps:
        warnings.append(f"Missing reps at {len(levels_with_missing_reps)} agent-level pairs "
                        f"(first 3: {levels_with_missing_reps[:3]})")

    # Check token counts (should all be > 0)
    n_zero_tokens = sum(1 for r in rows if int(r.get("input_tokens", 1) or 1) == 0)
    if n_zero_tokens > 0:
        warnings.append(f"{n_zero_tokens} rows with 0 input tokens")

    # ── Macro CSV ──────────────────────────────────────────────────────────────
    if not os.path.exists(macro_path):
        warnings.append("No macro CSV (run incomplete or killed before finishing)")
        stats["macro"] = "MISSING"
    else:
        macro_rows = []
        with open(macro_path, newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            for row in reader:
                macro_rows.append(row)

        stats["macro_rows"] = len(macro_rows)
        if len(macro_rows) != len(EXPECTED_LEVELS):
            issues.append(f"Macro has {len(macro_rows)} rows (expected {len(EXPECTED_LEVELS)})")

        # Check n_total per level = 500
        bad_totals = [r for r in macro_rows if int(r.get("n_total", 500)) != EXPECTED_AGENTS * EXPECTED_REPS]
        if bad_totals:
            for bt in bad_totals:
                issues.append(f"Level {bt['infection_level']}%: n_total={bt['n_total']} "
                               f"(expected {EXPECTED_AGENTS * EXPECTED_REPS}) — "
                               f"{int(bt['n_total'])} responses collected, "
                               f"{EXPECTED_AGENTS * EXPECTED_REPS - int(bt['n_total'])} lost to errors")

        # Mobility curve sanity: pct_stay_home should generally trend upward
        pcts = [(float(r["infection_level"]), float(r["pct_stay_home"])) for r in macro_rows]
        pcts.sort()
        low_half = [p for l, p in pcts if l <= 1.5]
        high_half = [p for l, p in pcts if l >= 2.0]
        if low_half and high_half:
            avg_low = sum(low_half) / len(low_half)
            avg_high = sum(high_half) / len(high_half)
            if avg_high < avg_low - 5:
                warnings.append(
                    f"Mobility curve may be inverted: avg stay-home at low levels "
                    f"({avg_low:.1f}%) > high levels ({avg_high:.1f}%). "
                    f"Check for 503 error bias."
                )
        stats["macro"] = "OK"
        stats["pct_stay_home_at_0pct"] = pcts[0][1] if pcts else None
        stats["pct_stay_home_at_3pct"] = next((p for l, p in pcts if l == 3.0), None)
        stats["pct_stay_home_at_7pct"] = pcts[-1][1] if pcts else None

    return {"name": name, "issues": issues, "warnings": warnings, "stats": stats}


def print_result(result: dict):
    name = result["name"]
    issues = result["issues"]
    warnings = result["warnings"]
    stats = result["stats"]

    status = "PASS" if not issues else "FAIL"
    print(f"\n{'='*60}")
    print(f"{'[PASS]' if not issues else '[FAIL]'}  {name}")
    print(f"{'='*60}")

    s = stats
    if "total_rows" in s:
        print(f"  Rows:          {s['total_rows']:,} / {EXPECTED_ROWS:,} expected")
        yes_pct = s['n_yes'] / s['total_rows'] * 100 if s['total_rows'] else 0
        print(f"  Responses:     yes={s.get('n_yes',0):,} ({yes_pct:.1f}%)  no={s.get('n_no',0):,}  empty={s.get('n_empty_response',0):,}")
        if s.get('format_invalid', 0) > 0:
            print(f"  Format errors: {s['format_invalid']} ({s.get('format_error_rate_pct', 0):.1f}%)")
    if "macro" in s:
        print(f"  Macro CSV:     {s['macro']}")
    if s.get("pct_stay_home_at_0pct") is not None:
        print(f"  Stay-home:     {s['pct_stay_home_at_0pct']:.1f}% @ 0%  ->  "
              f"{s.get('pct_stay_home_at_3pct', '?')}% @ 3%  ->  "
              f"{s.get('pct_stay_home_at_7pct', '?')}% @ 7%")

    for issue in issues:
        print(f"  [X] {issue}")
    for warning in warnings:
        print(f"  [!] {warning}")
    if not issues and not warnings:
        print("  All checks passed.")

    return status


def main():
    if len(sys.argv) > 1:
        target = sys.argv[1]
        config_dir = os.path.join(DATA_DIR, target) if not os.path.isabs(target) else target
        if not os.path.isdir(config_dir):
            print(f"Directory not found: {config_dir}")
            sys.exit(1)
        result = validate_config(config_dir)
        print_result(result)
    else:
        config_dirs = sorted([
            os.path.join(DATA_DIR, d)
            for d in os.listdir(DATA_DIR)
            if os.path.isdir(os.path.join(DATA_DIR, d)) and d not in SKIP_DIRS
        ])
        if not config_dirs:
            print("No config directories found in data/")
            sys.exit(0)
        print(f"Validating {len(config_dirs)} config(s) in data/...\n")
        results = [validate_config(d) for d in config_dirs]

        # Print individual results
        statuses = []
        for r in results:
            s = print_result(r)
            statuses.append((r, s))

        # Summary table
        n_fail = sum(1 for r in results if r["issues"])
        n_warn = sum(1 for r in results if r["warnings"])
        print(f"\n{'='*80}")
        print(f"SUMMARY: {len(results)} configs | {len(results) - n_fail} passed | {n_fail} failed | {n_warn} with warnings")
        print(f"{'='*80}")
        print(f"{'Config':<50} {'Rows':>7} {'Yes%':>6} {'FmtErr':>6} {'Status':>8}")
        print(f"{'-'*50} {'-'*7} {'-'*6} {'-'*6} {'-'*8}")
        for r, status in statuses:
            s = r["stats"]
            rows = s.get("total_rows", 0)
            yes_pct = s["n_yes"] / rows * 100 if rows and "n_yes" in s else 0
            fmt_err = s.get("format_error_rate_pct", 0)
            tag = "PASS" if not r["issues"] else "FAIL"
            print(f"{r['name']:<50} {rows:>7} {yes_pct:>5.1f}% {fmt_err:>5.1f}% {tag:>8}")


if __name__ == "__main__":
    main()
