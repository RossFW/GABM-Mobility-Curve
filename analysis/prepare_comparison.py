"""
prepare_comparison.py
─────────────────────
Dummy-variable OLS comparison of two LLM model configurations.
Replicates the analysis shown interactively in viz/analytics.html Figure 13.

Reads from data/ (READ-ONLY — never modifies existing files).
Writes results to analysis/output/.

Usage
─────
    python analysis/prepare_comparison.py <config_A> <config_B> [--data-dir data]

Examples
────────
    python analysis/prepare_comparison.py openai_gpt-5_2_off openai_gpt-5_2_high
    python analysis/prepare_comparison.py anthropic_claude-sonnet-4-5_off gemini_gemini-3-flash-preview_off

Models
──────
    Y   = Mobility = 1 − pct_stay_home   (proportion going outside, 0–1)
    NC  = infection_level / 100           (new cases as fraction of population)
    NC² = NC²
    D   = 0 for Config A, 1 for Config B

    Model 1: Mobility = β₀ + β₁·NC + β₂·NC² + β₃·D
    Model 2: Mobility = β₀ + β₁·NC + β₂·NC² + β₃·D + β₄·D·NC

    β₃ significant → configs differ in baseline mobility
    β₄ significant → configs differ in sensitivity to new cases (KEY result)

Observation unit
────────────────
    One rep at one infection level: proportion of 100 agents going outside.
    N = 40 levels × 5 reps × 2 configs = 400 per comparison.
"""

import sys
import json
import argparse
from pathlib import Path

import pandas as pd
import numpy as np
import statsmodels.api as sm


# ── Data loading ──────────────────────────────────────────────────────────────

def load_micro(config_key: str, data_dir: Path) -> pd.DataFrame:
    """Load probe_results_micro.csv for a config (READ-ONLY)."""
    path = data_dir / config_key / "probe_results_micro.csv"
    if not path.exists():
        raise FileNotFoundError(f"Micro CSV not found: {path}")
    return pd.read_csv(path)


def aggregate_to_reps(df: pd.DataFrame, dummy_value: int) -> pd.DataFrame:
    """
    Aggregate micro data to (infection_level, rep) level.
    Returns one row per rep per infection level: proportion going outside.
    """
    df = df.copy()
    # micro CSV: response = "yes" means stay home, "no" means go outside
    df["go_outside_ind"] = (df["response"].str.strip().str.lower() == "no").astype(int)
    grp = (
        df.groupby(["infection_level", "rep"])
        .agg(
            go_outside=("go_outside_ind", "mean"),
            n_agents=("go_outside_ind", "count"),
        )
        .reset_index()
    )
    grp["d"] = dummy_value
    grp["nc"] = grp["infection_level"] / 100.0
    grp["nc2"] = grp["nc"] ** 2
    return grp


# ── OLS fitting ───────────────────────────────────────────────────────────────

def fit_model(df: pd.DataFrame, formula_cols: list[str], outcome: str = "go_outside"):
    """Fit OLS using statsmodels. Returns the fitted result."""
    X = sm.add_constant(df[formula_cols].values, has_constant="add")
    X = pd.DataFrame(X, columns=["const"] + formula_cols)
    y = df[outcome]
    return sm.OLS(y, X).fit()


def summarize_model(result, param_names: list[str]) -> dict:
    """Extract key statistics from a statsmodels OLS result."""
    return {
        "params": dict(zip(param_names, result.params.tolist())),
        "se":     dict(zip(param_names, result.bse.tolist())),
        "t":      dict(zip(param_names, result.tvalues.tolist())),
        "p":      dict(zip(param_names, result.pvalues.tolist())),
        "r2":     float(result.rsquared),
        "r2_adj": float(result.rsquared_adj),
        "n":      int(result.nobs),
        "df_resid": int(result.df_resid),
        "f_stat": float(result.fvalue),
        "f_pval": float(result.f_pvalue),
    }


# ── Main ──────────────────────────────────────────────────────────────────────

def run_comparison(key_a: str, key_b: str, data_dir: Path) -> dict:
    print(f"Loading micro data for: {key_a}")
    micro_a = load_micro(key_a, data_dir)
    print(f"Loading micro data for: {key_b}")
    micro_b = load_micro(key_b, data_dir)

    reps_a = aggregate_to_reps(micro_a, dummy_value=0)
    reps_b = aggregate_to_reps(micro_b, dummy_value=1)

    df = pd.concat([reps_a, reps_b], ignore_index=True)
    df["d_nc"] = df["d"] * df["nc"]

    n_per_config = len(reps_a)
    assert len(reps_a) == len(reps_b), "Configs have different numbers of observations"
    print(f"N = {len(df)} ({n_per_config} obs per config × 2)")

    # Model 1: β₀ + β₁·NC + β₂·NC² + β₃·D
    m1 = fit_model(df, ["nc", "nc2", "d"])
    names1 = ["β₀ (intercept)", "β₁ (NC)", "β₂ (NC²)", "β₃ (D)"]

    # Model 2: β₀ + β₁·NC + β₂·NC² + β₃·D + β₄·D·NC
    m2 = fit_model(df, ["nc", "nc2", "d", "d_nc"])
    names2 = ["β₀ (intercept)", "β₁ (NC)", "β₂ (NC²)", "β₃ (D)", "β₄ (D·NC)"]

    result = {
        "config_a": key_a,
        "config_b": key_b,
        "n_per_config": n_per_config,
        "n_total": len(df),
        "model1": summarize_model(m1, names1),
        "model2": summarize_model(m2, names2),
        "interpretation": {
            "beta3_sig_m1": bool(m1.pvalues["d"] < 0.05),
            "beta3_p":  float(m1.pvalues["d"]),
            "beta3_val": float(m1.params["d"]),
            "beta4_sig_m2": bool(m2.pvalues["d_nc"] < 0.05),
            "beta4_p":  float(m2.pvalues["d_nc"]),
            "beta4_val": float(m2.params["d_nc"]),
        },
    }

    return result


def print_table(result: dict) -> None:
    """Pretty-print the regression results to stdout."""
    m1 = result["model1"]
    m2 = result["model2"]

    def stars(p):
        if p < 0.001: return "***"
        if p < 0.01:  return "**"
        if p < 0.05:  return "*"
        return "ns"

    print(f"\n{'='*75}")
    print(f"  Config A (D=0): {result['config_a']}")
    print(f"  Config B (D=1): {result['config_b']}")
    print(f"  N = {result['n_total']} ({result['n_per_config']} obs/config × 2)")
    print(f"{'='*75}")
    print(f"{'Coefficient':<22} {'β (M1)':>10} {'p':>8} {'sig':>4}  {'β (M2)':>10} {'p':>8} {'sig':>4}")
    print(f"{'-'*75}")
    params1 = list(m1["params"].items())
    params2 = list(m2["params"].items())
    for i, (name, b1) in enumerate(params1):
        p1 = list(m1["p"].values())[i]
        b2_val = list(m2["params"].values())[i]
        p2 = list(m2["p"].values())[i]
        marker = " ★" if "β₃" in name else "  "
        print(f"{marker}{name:<20} {b1:>+10.4f} {p1:>8.4f} {stars(p1):>4}  {b2_val:>+10.4f} {p2:>8.4f} {stars(p2):>4}")
    # β₄ (M2 only)
    b4 = list(m2["params"].values())[4]
    p4 = list(m2["p"].values())[4]
    print(f" ★{'β₄ (D·NC)':<20} {'—':>10} {'—':>8} {'—':>4}  {b4:>+10.4f} {p4:>8.4f} {stars(p4):>4}")
    print(f"{'-'*75}")
    print(f"{'R²':<22} {m1['r2']:>10.4f} {'':>13}  {m2['r2']:>10.4f}")
    print(f"{'R² adj':<22} {m1['r2_adj']:>10.4f} {'':>13}  {m2['r2_adj']:>10.4f}")
    print(f"{'df (residual)':<22} {m1['df_resid']:>10} {'':>13}  {m2['df_resid']:>10}")
    print(f"{'='*75}")
    interp = result["interpretation"]
    b3_str = f"β₃={interp['beta3_val']:+.4f}, p={'<0.001' if interp['beta3_p'] < 0.001 else f'{interp[\"beta3_p\"]:.3f}'}"
    b4_str = f"β₄={interp['beta4_val']:+.4f}, p={'<0.001' if interp['beta4_p'] < 0.001 else f'{interp[\"beta4_p\"]:.3f}'}"
    print(f"\nBaseline mobility differs: {'YES (' + b3_str + ')' if interp['beta3_sig_m1'] else 'No (' + b3_str + ')'}")
    print(f"Sensitivity slope differs: {'YES (' + b4_str + ')' if interp['beta4_sig_m2'] else 'No (' + b4_str + ')'}")
    print()


def main():
    parser = argparse.ArgumentParser(description="Dummy-variable OLS comparison of two LLM configs")
    parser.add_argument("config_a", help="Config directory key for Config A (e.g. openai_gpt-5_2_off)")
    parser.add_argument("config_b", help="Config directory key for Config B (e.g. openai_gpt-5_2_high)")
    parser.add_argument("--data-dir", default="data", help="Path to data directory (default: data)")
    parser.add_argument("--no-save", action="store_true", help="Print results only, don't write JSON")
    args = parser.parse_args()

    data_dir = Path(args.data_dir)
    if not data_dir.exists():
        print(f"Error: data directory not found: {data_dir}", file=sys.stderr)
        sys.exit(1)

    result = run_comparison(args.config_a, args.config_b, data_dir)
    print_table(result)

    if not args.no_save:
        out_dir = Path("analysis/output")
        out_dir.mkdir(parents=True, exist_ok=True)
        out_path = out_dir / f"comparison_{args.config_a}_vs_{args.config_b}.json"
        with open(out_path, "w") as f:
            json.dump(result, f, indent=2)
        print(f"Saved to {out_path}")


if __name__ == "__main__":
    main()
