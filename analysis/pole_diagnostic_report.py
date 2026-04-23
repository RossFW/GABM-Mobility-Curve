#!/usr/bin/env python3
"""
Generate a per-config diagnostic HTML showing:
  - Pole-level mention rates (like Fig 32)
  - Which poles are included/excluded under the 15% threshold
  - The Model 3 pole-level coefficients with SE, CI, and instability highlighting

Output: docs/stats_guide/pole_model_diagnostic.html
Served on localhost:8002 (independent of main dashboard).
"""
import json
import glob
import os
import math
from pathlib import Path

BASE = Path("/Users/rosswilliams/Desktop/Dissertation/GABM 3rd paper/GABM mobility curve")
RDIR = BASE / "viz/data/real/regressions"
OUT = BASE / "docs/stats_guide/pole_model_diagnostic.html"

SE_WARN = 5
SE_SEVERE = 100

# Load all current JSONs
files = sorted(glob.glob(str(RDIR / "*.json")))

def classify_se(se):
    if se is None or not math.isfinite(se):
        return "missing", "#f5f5f5"
    if se < SE_WARN: return "clean", "#e8f5e9"
    if se < SE_SEVERE: return "marginal", "#fff8e1"
    return "severe", "#ffebee"

def fmt(v, dec=3):
    if v is None: return "—"
    try:
        if not math.isfinite(v): return "—"
        return f"{v:+.{dec}f}" if dec > 0 else f"{v:.{dec}f}"
    except: return "—"

html = ["""<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Pole-Model Diagnostic — 21 Configs</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
body { font-family: Georgia, serif; max-width: 1200px; margin: 0 auto; padding: 24px; color: #222; background: #fafafa; }
h1 { border-bottom: 2px solid #333; padding-bottom: 8px; }
h2 { margin-top: 36px; border-bottom: 1px solid #ccc; padding-bottom: 4px; color: #1a4a8a; }
h3 { font-size: 14px; margin: 14px 0 4px; color: #333; }
table { border-collapse: collapse; margin: 10px 0; font-size: 11.5px; }
th, td { border: 1px solid #ddd; padding: 4px 8px; }
th { background: #eee; text-align: left; }
td.num { text-align: right; font-family: monospace; }
.pole-row { font-size: 11px; }
.pole-in { color: #1b5e20; font-weight: bold; }
.pole-out { color: #b71c1c; }
.sev-severe { background: #ffebee !important; }
.sev-marginal { background: #fff8e1 !important; }
.sev-clean { background: #e8f5e9 !important; }
.coef-pair { border: 2px solid #c00; }
details { margin: 14px 0; }
details summary { cursor: pointer; font-weight: bold; font-size: 15px; color: #1a4a8a; padding: 6px 0; }
details summary::-webkit-details-marker { display: none; }
details summary::before { content: '▸'; margin-right: 8px; color: #888; }
details[open] summary::before { content: '▾'; }
.tag { display: inline-block; padding: 2px 6px; border-radius: 2px; font-size: 10px; font-weight: bold; margin-right: 4px; }
.tag-clean { background: #e8f5e9; color: #1b5e20; }
.tag-severe { background: #ffebee; color: #b71c1c; }
.tag-marginal { background: #fff8e1; color: #e65100; }
.note { background: #e3f2fd; border-left: 3px solid #1a4a8a; padding: 8px 14px; margin: 8px 0; font-size: 12px; font-style: italic; }
</style></head><body>
<h1>Pole-Model Diagnostic</h1>
<p style="font-style:italic;color:#666">For each LLM config: Figure 32-style pole mention rates, then the resulting Model 3 (pole-level, 15% threshold) coefficients with stability highlighting.</p>
<div class="note">
  <strong>How to read:</strong> Rows marked <span class="pole-in">✓ IN</span> had mention rate in [15%, 85%] and were included in the model. Rows marked <span class="pole-out">✗ OUT</span> were excluded.
  Coefficient SEs are color-coded: <span class="tag tag-clean">clean</span> SE&lt;5, <span class="tag tag-marginal">marginal</span> 5-100, <span class="tag tag-severe">severe</span> SE≥100.
  Coefficient pairs with IDENTICAL huge SE indicate perfect collinearity (main effect ⟷ interaction).
</div>
"""]

pole_order = [
    ("extroverted",     "extraverted"),
    ("introverted",     "extraverted"),
    ("agreeable",       "agreeable"),
    ("antagonistic",    "agreeable"),
    ("conscientious",   "conscientious"),
    ("unconscientious", "conscientious"),
    ("neurotic",        "emot_stable"),
    ("emot_stable",     "emot_stable"),
    ("open",            "open_to_exp"),
    ("closed",          "open_to_exp"),
]

# Aggregate summary table
html.append('<h2>Summary — config-level stability</h2>')
html.append('<table><thead><tr><th>Config</th><th>Type</th><th>Threshold</th><th># poles IN</th><th># main</th><th># interactions</th><th>Max SE</th><th>Status</th><th>Disp</th></tr></thead><tbody>')

config_data = []
for f in files:
    with open(f) as fh:
        d = json.load(fh)
    key = os.path.basename(f).replace('.json','')
    label = d.get('label', key)
    m3 = d.get('model3') or {}
    m3_type = m3.get('type', '—')
    threshold = m3.get('threshold', '—')
    pole_flags = m3.get('pole_flags', {})
    context_flags = m3.get('context_flags', {})
    coefs = m3.get('coefficients', {})
    dh = m3.get('dharma', {})
    n_mention = m3.get('n_mention_main', 0)
    n_inter = m3.get('n_interactions', 0)
    n_poles_in = sum(1 for p in pole_flags.values() if p.get('sufficient'))
    n_ctx_in = sum(1 for c in context_flags.values() if c.get('sufficient'))
    # max SE
    ses = [c.get('se', 0) for c in coefs.values() if isinstance(c, dict) and c.get('se') is not None and math.isfinite(c.get('se', 0))]
    max_se = max(ses) if ses else 0
    disp = dh.get('dispersion_ratio')
    if max_se < SE_WARN: status_cls, status_txt = 'clean', 'Clean'
    elif max_se < SE_SEVERE: status_cls, status_txt = 'marginal', 'Marginal'
    else: status_cls, status_txt = 'severe', 'SEVERE'
    row_bg = '#fafafa' if len(config_data) % 2 == 0 else 'white'
    html.append(f'<tr style="background:{row_bg}"><td>{label}</td><td style="font-size:10px">{m3_type}</td>')
    html.append(f'<td class="num">{threshold}</td>')
    html.append(f'<td class="num">{n_poles_in}/10 + {n_ctx_in}/2 ctx</td>')
    html.append(f'<td class="num">{n_mention}</td><td class="num">{n_inter}</td>')
    html.append(f'<td class="num sev-{status_cls}">{max_se:.2f}</td>')
    html.append(f'<td><span class="tag tag-{status_cls}">{status_txt}</span></td>')
    html.append(f'<td class="num">{disp:.2f}</td>' if disp is not None else '<td>—</td>')
    html.append('</tr>')
    config_data.append((key, label, m3, max_se, status_cls))
html.append('</tbody></table>')

# Per-config detail, most-problematic first
config_data.sort(key=lambda x: -x[3])
html.append('<h2>Per-config detail (worst first)</h2>')

for key, label, m3, max_se, status_cls in config_data:
    pole_flags = m3.get('pole_flags', {})
    context_flags = m3.get('context_flags', {})
    coefs = m3.get('coefficients', {})
    dh = m3.get('dharma', {})
    detail_open = 'open' if status_cls != 'clean' else ''

    html.append(f'<details {detail_open}><summary>{label}  <span class="tag tag-{status_cls}">{status_cls}</span>  max SE = {max_se:.2f}</summary>')

    # Pole rates table (Fig 32 style, dimension level)
    html.append('<h3>Pole mention rates (Fig 32)</h3>')
    html.append('<table><thead><tr><th>Pole</th><th>Paired trait</th><th class="num">Rate</th><th>Status (15% threshold)</th></tr></thead><tbody>')
    for pole, paired in pole_order:
        info = pole_flags.get(pole, {})
        rate = info.get('mention_rate', 0)
        suf = info.get('sufficient', False)
        status = '<span class="pole-in">✓ IN</span>' if suf else '<span class="pole-out">✗ OUT</span>'
        html.append(f'<tr class="pole-row"><td>{pole}</td><td>{paired}</td><td class="num">{rate*100:.1f}%</td><td>{status}</td></tr>')
    # Context (infection, age)
    for ctx, info in context_flags.items():
        rate = info.get('mention_rate', 0)
        suf = info.get('sufficient', False)
        status = '<span class="pole-in">✓ IN</span>' if suf else '<span class="pole-out">✗ OUT</span>'
        html.append(f'<tr class="pole-row"><td>{ctx} <em>(context)</em></td><td>{info.get("paired","—")}</td><td class="num">{rate*100:.1f}%</td><td>{status}</td></tr>')
    html.append('</tbody></table>')

    # Identify coefficient pairs with matching SE (indicates collinearity)
    paired_ses = {}
    for name, c in coefs.items():
        if isinstance(c, dict) and c.get('se') and math.isfinite(c.get('se', 0)) and c['se'] > SE_WARN:
            paired_ses.setdefault(round(c['se'], 3), []).append(name)
    collinear_pairs = {se: names for se, names in paired_ses.items() if len(names) >= 2}

    if collinear_pairs:
        html.append('<h3 style="color:#b71c1c">⚠ Collinear coefficient groups (identical SE — model cannot distinguish these)</h3>')
        html.append('<ul style="font-size:12px">')
        for se, names in sorted(collinear_pairs.items(), key=lambda kv: -kv[0]):
            html.append(f'<li><strong>SE = {se}</strong>: ' + ', '.join(f'<code>{n}</code>' for n in names) + '</li>')
        html.append('</ul>')

    # All coefficients table, sorted by SE desc
    html.append('<h3>Coefficients (sorted by SE desc)</h3>')
    html.append('<table><thead><tr><th>Coefficient</th><th class="num">β</th><th class="num">SE</th><th class="num">95% CI</th><th>Sig</th></tr></thead><tbody>')
    for name, c in sorted(coefs.items(), key=lambda kv: -kv[1].get('se',0) if isinstance(kv[1],dict) and kv[1].get('se') is not None else 0):
        if not isinstance(c, dict): continue
        est = c.get('estimate')
        se = c.get('se')
        sig = c.get('sig', '')
        cls, _ = classify_se(se)
        if est is not None and se is not None and math.isfinite(se):
            ci_lo = est - 1.96*se
            ci_hi = est + 1.96*se
            ci_str = f"[{ci_lo:+.2f}, {ci_hi:+.2f}]"
        else:
            ci_str = "—"
        # Highlight row for extreme SE
        row_bg = f'sev-{cls}' if cls in ('severe', 'marginal') else ''
        est_s = fmt(est)
        se_s = fmt(se, 3) if se is not None else '—'
        html.append(f'<tr class="{row_bg}"><td style="font-family:monospace;font-size:10.5px">{name}</td>')
        html.append(f'<td class="num">{est_s}</td>')
        html.append(f'<td class="num">{se_s if se is None or se < 100 else f"{se:.0f}"}</td>')
        html.append(f'<td class="num" style="font-size:10px">{ci_str}</td>')
        html.append(f'<td>{sig}</td></tr>')
    html.append('</tbody></table>')

    html.append('</details>')

html.append("""<footer style="margin-top:60px;font-size:11px;color:#888;text-align:center;border-top:1px solid #ccc;padding-top:14px;font-style:italic">Generated by pole_diagnostic_report.py · 2026-04-21</footer>
</body></html>""")

OUT.write_text("\n".join(html))
print(f"Wrote: {OUT}")
print(f"Size: {OUT.stat().st_size:,} bytes")
