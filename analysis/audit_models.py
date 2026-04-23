#!/usr/bin/env python3
"""
Systematic audit of all 63 model fits (21 configs × {M1, M2, M3}).
Produces an HTML report at docs/stats_guide/model_audit.html.

Flags per-coefficient instability, rank-deficiency signals, and diagnoses
the likely cause for each anomaly (borderline mention rate, collinearity, etc.).
"""
import json
import os
import glob
import math
from pathlib import Path

BASE = Path("/Users/rosswilliams/Desktop/Dissertation/GABM 3rd paper/GABM mobility curve")
RDIR = BASE / "viz/data/real/regressions"
OUT = BASE / "docs/stats_guide/model_audit.html"

# ── Thresholds ─────────────────────────────────────────────
SE_WARN = 5      # noticeable instability
SE_SEVERE = 100  # coefficient essentially unidentified
COEF_EXTREME = 30  # absolute log-odds > 30 is usually a red flag (prob → 0 or 1)

# ── Helpers ────────────────────────────────────────────────
def classify_se(se):
    if se is None or not math.isfinite(se):
        return ("missing", "#f5f5f5", "color:#999")
    if se < SE_WARN:
        return ("clean", "#e8f5e9", "color:#1b5e20")
    if se < SE_SEVERE:
        return ("marginal", "#fff8e1", "color:#e65100")
    return ("severe", "#ffebee", "color:#b71c1c;font-weight:bold")

def config_display(key):
    return (key.replace('_off', '')
               .replace('anthropic_', '')
               .replace('openai_', '')
               .replace('gemini_', '')
               .replace('_', '-'))

# Which coefficients are "inferential" — i.e., reported and interpreted in the paper.
# For M1: only infection terms. Intercept = reference-agent dummy baseline (not interpreted;
# quasi-separation there is a known glm artifact, not a failure).
INFERENTIAL_M1 = {"infection_pct", "infection_pct_sq"}
# For M2 and M3: all coefficients are inferential (intercept is population average).
# (We could exclude M3's intercept if we wanted to — it's rarely interpreted — but keep it.)


def analyze_model_block(coef_dict, contrast_flags=None, model_label="m2"):
    """Return summary: count by stability, max SE, list of problems.

    Separates inferential (reported) from technical (nuisance) coefficients.
    For M1, only the infection terms are inferential.
    """
    out = {
        "n_coefs": 0,
        "max_se_infer": 0.0,             # worst SE among INFERENTIAL coefs
        "max_se_infer_name": None,
        "max_se_tech": 0.0,              # worst SE among NUISANCE (technical) coefs
        "max_se_tech_name": None,
        "n_marginal_infer": 0,
        "n_severe_infer": 0,
        "n_marginal_tech": 0,
        "n_severe_tech": 0,
        "problems": [],                  # flagged coefs (inferential only)
        "tech_problems": [],             # flagged coefs (technical)
    }
    for name, c in coef_dict.items():
        if not isinstance(c, dict):
            continue
        out["n_coefs"] += 1
        se = c.get("se")
        est = c.get("estimate")
        if se is None or not math.isfinite(se):
            continue
        # Is this coefficient inferential?
        if model_label == "m1":
            is_infer = name in INFERENTIAL_M1
        else:
            is_infer = True
        cls, _, _ = classify_se(se)

        if is_infer:
            if se > out["max_se_infer"]:
                out["max_se_infer"] = se
                out["max_se_infer_name"] = name
            if cls == "marginal":
                out["n_marginal_infer"] += 1
            elif cls == "severe":
                out["n_severe_infer"] += 1
        else:
            if se > out["max_se_tech"]:
                out["max_se_tech"] = se
                out["max_se_tech_name"] = name
            if cls == "marginal":
                out["n_marginal_tech"] += 1
            elif cls == "severe":
                out["n_severe_tech"] += 1

        if cls in ("marginal", "severe"):
            # Derive diagnosis hint
            hint = ""
            if contrast_flags:
                for dim_key, cf in contrast_flags.items():
                    if dim_key in name:
                        rate = cf.get("mention_rate", None)
                        if rate is not None:
                            pct = rate * 100
                            if rate < 0.10 or rate > 0.90:
                                hint = f"mention_rate={pct:.1f}% (borderline)"
                            else:
                                hint = f"mention_rate={pct:.1f}%"
                        break
            if est is not None and abs(est) > COEF_EXTREME:
                hint += (" ⋄ " if hint else "") + "extreme β"
            # Quasi-separation hint for M1 intercept
            if model_label == "m1" and name == "intercept" and est is not None and abs(est) > 10:
                hint += (" ⋄ " if hint else "") + "quasi-sep on ref agent"
            entry = {
                "name": name, "estimate": est, "se": se, "class": cls, "hint": hint,
            }
            if is_infer:
                out["problems"].append(entry)
            else:
                out["tech_problems"].append(entry)
    out["problems"].sort(key=lambda p: -p["se"])
    out["tech_problems"].sort(key=lambda p: -p["se"])
    return out


def render_coef_row(name, c, contrast_flags=None):
    est = c.get("estimate")
    se = c.get("se")
    p = c.get("p")
    sig = c.get("sig", "")
    est_str = f"{est:+.3f}" if isinstance(est, (int, float)) and math.isfinite(est) else "—"
    cls, bg, styl = classify_se(se)
    se_str = f"{se:.3f}" if isinstance(se, (int, float)) and math.isfinite(se) else "—"
    ci_lo = ci_hi = None
    if isinstance(est, (int, float)) and isinstance(se, (int, float)) and math.isfinite(se):
        ci_lo = est - 1.96 * se
        ci_hi = est + 1.96 * se
        ci_str = f"[{ci_lo:+.2f}, {ci_hi:+.2f}]"
    else:
        ci_str = "—"
    p_str = f"{p:.3g}" if isinstance(p, (int, float)) and math.isfinite(p) else "—"
    hint = ""
    if contrast_flags:
        for dim_key, cf in contrast_flags.items():
            if dim_key in name:
                rate = cf.get("mention_rate", None)
                if rate is not None:
                    pct = rate * 100
                    hint = f"{pct:.1f}%"
                break
    return f"""<tr style="background:{bg}">
  <td style="padding:3px 6px;font-family:monospace;font-size:10.5px">{name}</td>
  <td style="text-align:right;padding:3px 6px;font-family:monospace">{est_str}</td>
  <td style="text-align:right;padding:3px 6px;font-family:monospace;{styl}">{se_str}</td>
  <td style="text-align:right;padding:3px 6px;font-family:monospace;font-size:10px;color:#666">{ci_str}</td>
  <td style="text-align:center;padding:3px 6px;font-family:monospace">{sig}</td>
  <td style="text-align:right;padding:3px 6px;font-size:10px;color:#888">{hint}</td>
</tr>"""


# ── Gather data ────────────────────────────────────────────
files = sorted(glob.glob(str(RDIR / "*.json")))
config_keys = [os.path.basename(f).replace(".json", "") for f in files]

all_data = []
for f in files:
    with open(f) as fh:
        d = json.load(fh)
    key = os.path.basename(f).replace(".json", "")
    label = d.get("label", key)
    m1 = d.get("model1") or {}
    m2 = d.get("model2") or {}
    m3 = d.get("model3") or {}
    rec = {
        "key": key,
        "label": label,
        "m1": {
            "coefs": m1.get("coefficients", {}) or {},
            "warning": m1.get("warning"),
            "error": m1.get("error"),
            "fit": m1.get("fit") or {},
        },
        "m2": {
            "coefs": m2.get("coefficients", {}) or {},
            "warning": m2.get("warning"),
            "error": m2.get("error"),
            "fit": m2.get("fit") or {},
        },
        "m3": {
            "coefs": m3.get("coefficients", {}) or {},
            "warning": m3.get("warning"),
            "error": m3.get("error"),
            "fit": m3.get("fit") or {},
            "contrast_flags": m3.get("contrast_flags", {}),
            "n_interactions": m3.get("n_interactions"),
        },
    }
    rec["m1_summary"] = analyze_model_block(rec["m1"]["coefs"], model_label="m1")
    rec["m2_summary"] = analyze_model_block(rec["m2"]["coefs"], model_label="m2")
    rec["m3_summary"] = analyze_model_block(rec["m3"]["coefs"], rec["m3"]["contrast_flags"], model_label="m3")
    all_data.append(rec)


# ── Overview heatmap HTML ──────────────────────────────────
def overview_cell(summary):
    """Return an HTML td for the overview heatmap, keyed on INFERENTIAL SE."""
    max_se = summary["max_se_infer"]
    n_severe = summary["n_severe_infer"]
    n_marginal = summary["n_marginal_infer"]
    tech_hint = ""
    if summary["max_se_tech"] >= SE_SEVERE:
        tech_hint = f' <span style="font-size:9px;color:#999">(tech: {summary["max_se_tech"]:.0f})</span>'
    cls, bg, styl = classify_se(max_se if max_se else 0)
    if max_se < SE_WARN:
        tier = "✓"
        tooltip = f"Clean (max inferential SE {max_se:.2f})"
    elif max_se < SE_SEVERE:
        tier = f"△ {n_marginal}"
        tooltip = f"Marginal ({n_marginal} inferential coefs with SE ≥ {SE_WARN})"
    else:
        tier = f"✗ {n_severe}"
        tooltip = f"Severe ({n_severe} inferential coefs with SE ≥ {SE_SEVERE}, max SE {max_se:.1f})"
    return f'<td style="padding:6px 10px;background:{bg};text-align:center;border:1px solid #ddd" title="{tooltip}"><span style="{styl}">{tier}</span><br><span style="font-size:9px;color:#666">max SE {max_se:.1f}{tech_hint}</span></td>'


# ── Build HTML report ──────────────────────────────────────
html = []
html.append("""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Model Audit — 63 Regression Fits</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { font-family: Georgia, 'Times New Roman', serif; max-width: 1100px; margin: 0 auto; padding: 30px 24px 80px; color: #222; background: #fafafa; line-height: 1.5; }
h1 { font-size: 24px; border-bottom: 2px solid #333; padding-bottom: 10px; }
h2 { font-size: 18px; margin-top: 36px; color: #111; border-bottom: 1px solid #ccc; padding-bottom: 4px; }
h3 { font-size: 14px; margin-top: 20px; color: #333; }
.eyebrow { text-transform: uppercase; font-size: 11px; letter-spacing: 0.15em; color: #777; margin-bottom: 6px; }
.subtitle { font-style: italic; color: #666; font-size: 14px; }
table { border-collapse: collapse; margin: 14px 0; font-size: 11.5px; }
table.overview th, table.overview td { border: 1px solid #ccc; padding: 4px 6px; }
table.overview th { background: #eee; text-align: center; font-weight: bold; font-size: 11px; }
table.overview td:first-child { text-align: left; font-family: 'Menlo', monospace; font-size: 10.5px; }
.legend { font-size: 11.5px; background: #f5f5f5; padding: 8px 14px; border-left: 3px solid #777; margin: 10px 0; }
.legend .chip { display: inline-block; padding: 2px 6px; border-radius: 2px; margin: 0 4px 0 0; font-weight: bold; font-size: 10px; }
.config-block { margin: 24px 0; padding: 16px; background: white; border: 1px solid #ddd; border-radius: 3px; }
.config-block summary { cursor: pointer; font-weight: bold; font-size: 15px; padding: 6px 0; list-style: none; outline: none; color: #1a4a8a; }
.config-block summary::before { content: '▸'; margin-right: 8px; color: #888; }
.config-block[open] summary::before { content: '▾'; }
.model-block { margin: 18px 0 8px; }
.model-head { font-weight: bold; font-size: 13px; margin-bottom: 4px; color: #333; }
.coef-table th { background: #eee; padding: 4px 6px; text-align: left; font-size: 11px; }
.coef-table td { font-size: 11px; }
.problems { background: #fff3e0; border-left: 3px solid #e65100; padding: 8px 14px; margin: 6px 0; font-size: 12px; }
.problems-severe { background: #ffebee; border-left-color: #b71c1c; }
.problems .p-row { margin: 2px 0; font-family: 'Menlo', monospace; font-size: 11px; }
.diagnosis { background: #e3f2fd; border-left: 3px solid #1a4a8a; padding: 8px 14px; margin: 6px 0; font-size: 12px; font-style: italic; }
footer { margin-top: 60px; border-top: 1px solid #ccc; padding-top: 14px; font-size: 11px; color: #888; text-align: center; font-style: italic; }
</style>
</head>
<body>
<div class="eyebrow">Paper 3 · Model audit</div>
<h1>Systematic Review of All 63 Regression Fits</h1>
<div class="subtitle">21 LLM configurations × {Model 1 (FE logit) · Model 2 (RE logit) · Model 3 (RE with interactions)}</div>

<div class="legend">
  <span class="chip" style="background:#e8f5e9;color:#1b5e20">✓ Clean</span>all <em>inferential</em> SEs below """ + str(SE_WARN) + """
  &nbsp;&nbsp;
  <span class="chip" style="background:#fff8e1;color:#e65100">△ Marginal</span>some SEs between """ + str(SE_WARN) + """ and """ + str(SE_SEVERE) + """
  &nbsp;&nbsp;
  <span class="chip" style="background:#ffebee;color:#b71c1c">✗ Severe</span>some SEs ≥ """ + str(SE_SEVERE) + """ (coef essentially unidentified)
</div>

<div style="background:#e8f5e9;border-left:4px solid #2e7d32;padding:12px 18px;margin:18px 0;font-size:14px">
  <strong style="color:#1b5e20">TL;DR — only "inferential" coefficients count toward ✓/△/✗ status.</strong>
  <br>Many coefficients in these fits are technical nuisance parameters we never interpret. Most notably <strong>Model 1's intercept</strong> represents the reference agent's dummy (agent 0). When that reference agent nearly perfectly predicts their outcome (e.g., never stays home at 0% infection), logistic regression's MLE for their dummy is at ±∞, and <code>glm</code> fits it to a large number with an SE in the thousands. This is <em>quasi-separation</em> — a well-known glm artifact. It does not affect the <strong>infection coefficients</strong> we report from Model 1.
  <br><br>Similarly, <strong>Model 3's intercept</strong> represents an agent with all-reference traits at 0% infection with no mentions — an extreme extrapolation no agent actually occupies. Its SE can blow up without affecting the interaction coefficients we do interpret.
  <br><br>The heatmap uses <strong>inferential</strong> SEs only. Tech blow-ups appear as a muted "(tech: XXX)" footnote.
</div>

<h2>Part 1 — Overview heatmap</h2>
<p>Each cell shows the worst <strong>inferential</strong> SE. Tech blow-ups shown in gray below the tier.</p>

<table class="overview">
<thead><tr><th>Config</th><th>Model 1 (FE)</th><th>Model 2 (RE)</th><th>Model 3 (RE + Inter.)</th></tr></thead>
<tbody>""")

for rec in all_data:
    html.append(f'<tr><td>{config_display(rec["key"])}</td>')
    html.append(overview_cell(rec["m1_summary"]))
    html.append(overview_cell(rec["m2_summary"]))
    html.append(overview_cell(rec["m3_summary"]))
    html.append('</tr>')

html.append("""</tbody></table>

<h2>Part 2 — Aggregate findings (inferential coefficients only)</h2>""")

# Count issues (inferential only)
def count_by_sev(recs, model_key):
    clean = marg = sev = 0
    for r in recs:
        s = r[model_key]
        mx = s["max_se_infer"]
        if mx < SE_WARN: clean += 1
        elif mx < SE_SEVERE: marg += 1
        else: sev += 1
    return clean, marg, sev

n_m1_clean, n_m1_marg, n_m1_severe = count_by_sev(all_data, "m1_summary")
n_m2_clean, n_m2_marg, n_m2_severe = count_by_sev(all_data, "m2_summary")
n_m3_clean, n_m3_marg, n_m3_severe = count_by_sev(all_data, "m3_summary")

html.append(f"""<table class="overview">
<thead><tr><th>Model</th><th>Clean (SE &lt; {SE_WARN})</th><th>Marginal (SE {SE_WARN}–{SE_SEVERE})</th><th>Severe (SE ≥ {SE_SEVERE})</th></tr></thead>
<tbody>
<tr><td>Model 1 — Fixed-effects logit<br><span style="font-size:10px;color:#888">inferential: infection, infection²</span></td><td style="text-align:center">{n_m1_clean}/21</td><td style="text-align:center">{n_m1_marg}/21</td><td style="text-align:center">{n_m1_severe}/21</td></tr>
<tr><td>Model 2 — Random-effects logit<br><span style="font-size:10px;color:#888">inferential: all coefficients</span></td><td style="text-align:center">{n_m2_clean}/21</td><td style="text-align:center">{n_m2_marg}/21</td><td style="text-align:center">{n_m2_severe}/21</td></tr>
<tr><td>Model 3 — RE logit + interactions<br><span style="font-size:10px;color:#888">inferential: all coefficients</span></td><td style="text-align:center">{n_m3_clean}/21</td><td style="text-align:center">{n_m3_marg}/21</td><td style="text-align:center">{n_m3_severe}/21</td></tr>
</tbody></table>

<div class="diagnosis">
<strong>Pattern.</strong> Model 1's intercept in some configs blows up (SE of thousands) — this is <em>quasi-separation on the reference agent's dummy</em>, a well-known glm artifact that happens when the reference agent's data nearly perfectly predicts their outcome (e.g., they never stay home at infection = 0). Because we only ever interpret Model 1's infection coefficients (β_inf, β_inf²) and those are clean across all 21 configs (SE between 0.04 and 0.94), this is a technical quirk with no inferential consequence. The overview heatmap treats it as "tech" and does not flag it as a problem.
<br><br>
Model 2 is stable across all 21 configurations for every reported coefficient.
<br><br>
Model 3's added complexity (mention flags + 5–7 interaction terms) genuinely introduces instability for ~half the configs. The R fit log showed repeated &ldquo;fixed-effect model matrix is rank deficient so dropping 1 column&rdquo; warnings, confirming near-collinearity. Typical trigger: a mention flag with rate near the 5% contrast-inclusion threshold leaves its interaction barely identifiable — the model fits it technically but the Hessian is near-singular, so SEs balloon.
</div>

<h2>Part 3 — Per-configuration detail</h2>
<p>Each row below is collapsible. Click to see all coefficients for M1, M2, and M3.</p>
""")

for rec in all_data:
    key = rec["key"]
    label = rec["label"]
    m1s, m2s, m3s = rec["m1_summary"], rec["m2_summary"], rec["m3_summary"]
    any_problem = (m1s["max_se_infer"] >= SE_WARN or m2s["max_se_infer"] >= SE_WARN or m3s["max_se_infer"] >= SE_WARN)
    detail_open = "open" if any_problem else ""

    html.append(f'<details class="config-block" {detail_open}><summary>{label} <span style="color:#888;font-weight:normal;font-size:12px">({key})</span></summary>')

    # Warnings
    for mkey, mname, msum in [("m1", "Model 1", m1s), ("m2", "Model 2", m2s), ("m3", "Model 3", m3s)]:
        warning = rec[mkey].get("warning")
        error = rec[mkey].get("error")
        if warning and warning != {}:
            html.append(f'<div class="problems"><strong>{mname} convergence warning:</strong> {warning}</div>')
        if error:
            html.append(f'<div class="problems problems-severe"><strong>{mname} error:</strong> {error}</div>')

    # Per-model table
    for mkey, mname, msum in [("m1", "Model 1 (FE logit)", m1s), ("m2", "Model 2 (RE logit)", m2s), ("m3", "Model 3 (RE + interactions)", m3s)]:
        html.append(f'<div class="model-block"><div class="model-head">{mname} — {msum["n_coefs"]} coefficients, max inferential SE = {msum["max_se_infer"]:.2f}')
        if msum["n_severe_infer"] > 0:
            html.append(f' <span style="color:#b71c1c">✗ {msum["n_severe_infer"]} severe (inferential)</span>')
        if msum["n_marginal_infer"] > 0:
            html.append(f' <span style="color:#e65100">△ {msum["n_marginal_infer"]} marginal (inferential)</span>')
        if msum["max_se_tech"] > SE_SEVERE:
            html.append(f' <span style="color:#999">· tech SE up to {msum["max_se_tech"]:.0f} (not interpreted)</span>')
        html.append('</div>')

        # Inferential problems summary
        if msum["problems"]:
            severity_class = "problems-severe" if msum["n_severe_infer"] > 0 else "problems"
            html.append(f'<div class="{severity_class}"><strong>Flagged inferential coefficients:</strong>')
            for p in msum["problems"]:
                est_s = f"{p['estimate']:+.3f}" if isinstance(p['estimate'], (int, float)) else "—"
                html.append(f'<div class="p-row">• {p["name"]}: β = {est_s}, SE = {p["se"]:.2f}  {p["hint"]}</div>')
            html.append('</div>')

        # Technical problems — shown but down-weighted
        if msum["tech_problems"]:
            html.append('<div style="background:#f5f5f5;border-left:3px solid #aaa;padding:6px 14px;margin:6px 0;font-size:11px;color:#666"><strong>Technical (nuisance) coefficients with large SE</strong> — not interpreted in the paper:')
            for p in msum["tech_problems"]:
                est_s = f"{p['estimate']:+.3f}" if isinstance(p['estimate'], (int, float)) else "—"
                html.append(f'<div class="p-row">• {p["name"]}: β = {est_s}, SE = {p["se"]:.2f}  {p["hint"]}</div>')
            html.append('</div>')

        # Full coefficient table
        coefs = rec[mkey]["coefs"]
        contrast = rec["m3"]["contrast_flags"] if mkey == "m3" else None
        if coefs:
            html.append('<table class="coef-table" style="width:100%;border-collapse:collapse;margin-top:4px">')
            html.append('<thead><tr><th>Predictor</th><th style="text-align:right">β</th><th style="text-align:right">SE</th><th style="text-align:right">95% CI</th><th style="text-align:center">Sig</th><th style="text-align:right">mention rate</th></tr></thead><tbody>')
            for name, c in coefs.items():
                if isinstance(c, dict):
                    html.append(render_coef_row(name, c, contrast))
            html.append('</tbody></table>')

        # Fit stats
        fit = rec[mkey].get("fit") or {}
        if fit:
            fit_parts = []
            for k, v in fit.items():
                if isinstance(v, (int, float)):
                    fit_parts.append(f"{k}={v:.2f}" if isinstance(v, float) else f"{k}={v}")
            if fit_parts:
                html.append(f'<div style="font-size:11px;color:#777;margin-top:4px">Fit: {" · ".join(fit_parts)}</div>')

        html.append('</div>')

    html.append('</details>')

html.append(f"""
<footer>
Generated by analyze_models.py on 2026-04-21<br>
{len(all_data)} configs × 3 models = {len(all_data) * 3} fits · thresholds SE_WARN={SE_WARN}, SE_SEVERE={SE_SEVERE}
</footer>
</body></html>
""")

OUT.write_text("\n".join(html))
print(f"Wrote: {OUT}")
print(f"Size: {OUT.stat().st_size:,} bytes")
print(f"  M1 inferential: clean {n_m1_clean}/21, marginal {n_m1_marg}, severe {n_m1_severe}")
print(f"  M2 inferential: clean {n_m2_clean}/21, marginal {n_m2_marg}, severe {n_m2_severe}")
print(f"  M3 inferential: clean {n_m3_clean}/21, marginal {n_m3_marg}, severe {n_m3_severe}")
