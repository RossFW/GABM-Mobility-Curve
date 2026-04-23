#!/usr/bin/env python3
"""
Build a green/red brick grid mirroring Figure 32, showing which poles pass
the two-layer filter for Model 3 inclusion:
  Layer 1 (dimension gate): P(pos pole OR neg pole mentioned) must be in [15%, 85%].
                             If outside, BOTH poles excluded.
  Layer 2 (pole gate): within surviving dimensions, each individual pole's
                        mention rate must be in [15%, 85%].

Output: docs/stats_guide/pole_filter_grid.html
Serve on localhost:8003.
"""
import csv
import glob
from pathlib import Path

BASE = Path("/Users/rosswilliams/Desktop/Dissertation/GABM 3rd paper/GABM mobility curve")
DATA = BASE / "viz/data/real"
OUT = BASE / "docs/stats_guide/pole_filter_grid.html"

THRESHOLD = 0.15

DIMENSIONS = [
    ("Extraversion",    ("extroverted",    "introverted")),
    ("Agreeableness",   ("agreeable",      "antagonistic")),
    ("Conscientiousness", ("conscientious", "unconscientious")),
    ("Neuroticism",     ("neurotic",       "emot_stable")),
    ("Openness",        ("open",           "closed")),
]
CONTEXT = [("Infection", "infection"), ("Age", "age")]

def pole_label(pole):
    labels = {
        "extroverted":"Extraverted","introverted":"Introverted",
        "agreeable":"Agreeable","antagonistic":"Antagonistic",
        "conscientious":"Conscientious","unconscientious":"Unconscientious",
        "neurotic":"Neurotic","emot_stable":"Emot. Stable",
        "open":"Open","closed":"Closed",
        "infection":"Infection","age":"Age",
    }
    return labels.get(pole, pole)

PROVIDER_ORDER = [
    ("Anthropic", "anthropic_"),
    ("OpenAI",    "openai_"),
    ("Google",    "gemini_"),
]
PROVIDER_COLOR = {"Anthropic":"#d97706","OpenAI":"#10a37f","Google":"#4285f4"}

# collect configs
configs = []
for cd in sorted(DATA.iterdir()):
    if not cd.is_dir(): continue
    flags = cd / "mention_flags_pole.csv"
    if not flags.exists(): continue
    rows = list(csv.DictReader(open(flags)))
    n = len(rows)
    if n == 0: continue
    key = cd.name
    provider = next((p for p, pre in PROVIDER_ORDER if key.startswith(pre)), "Other")

    # per-dim + per-pole rates
    dim_info = {}
    pole_info = {}
    for dname, poles in DIMENSIONS:
        ca = f"mentioned_{poles[0]}"; cb = f"mentioned_{poles[1]}"
        cntE = sum(1 for r in rows if r[ca]=='1' or r[cb]=='1')
        rE = cntE/n
        dim_pass = THRESHOLD <= rE <= (1-THRESHOLD)
        dim_info[dname] = {"rate": rE, "pass": dim_pass}
        for pole in poles:
            col = f"mentioned_{pole}"
            cnt = sum(1 for r in rows if r[col]=='1')
            rP = cnt/n
            pole_pass = THRESHOLD <= rP <= (1-THRESHOLD)
            included = dim_pass and pole_pass
            pole_info[pole] = {"rate": rP, "pole_pass": pole_pass,
                                "dim_pass": dim_pass, "included": included}
    # context
    ctx_info = {}
    for clabel, ckey in CONTEXT:
        col = f"mentioned_{ckey}"
        if col not in rows[0]:
            ctx_info[ckey] = {"rate": None, "included": False}
            continue
        cnt = sum(1 for r in rows if r[col]=='1')
        rC = cnt/n
        inc = THRESHOLD <= rC <= (1-THRESHOLD)
        ctx_info[ckey] = {"rate": rC, "included": inc}

    configs.append({
        "key": key,
        "provider": provider,
        "n": n,
        "dim": dim_info,
        "pole": pole_info,
        "ctx": ctx_info,
    })

# sort by provider order, then alpha
configs.sort(key=lambda c: (
    [p[0] for p in PROVIDER_ORDER].index(c["provider"]) if c["provider"] in [p[0] for p in PROVIDER_ORDER] else 99,
    c["key"]
))

def short_label(key):
    s = key
    for _, pre in PROVIDER_ORDER:
        if s.startswith(pre): s = s[len(pre):]
    return s

def cell_class(info, kind):
    if kind == "pole":
        if info["included"]: return "cell-in"
        if not info["dim_pass"]: return "cell-out-dim"
        return "cell-out-pole"
    if kind == "ctx":
        return "cell-in" if info["included"] else "cell-out-pole"
    return ""

html = ["""<!DOCTYPE html><html><head><meta charset="utf-8">
<title>Pole Filter Grid — Two-Layer Check</title>
<style>
body { font-family: Georgia, serif; max-width: 1500px; margin: 0 auto; padding: 24px; color: #222; }
h1 { border-bottom: 2px solid #333; padding-bottom: 8px; }
table { border-collapse: collapse; font-size: 11px; margin: 16px 0; }
th, td { border: 1px solid #ccc; padding: 4px 8px; text-align: center; }
th.dim-header { background: #333; color: white; font-size: 12px; }
th.pole-header { background: #eee; font-size: 10px; font-weight: normal; font-style: italic; }
th.config-label { background: #f5f5f5; text-align: left; padding: 4px 10px; font-weight: normal; }
th.ctx-header { background: #555; color: white; font-size: 12px; }
td.cell-in { background: #c8e6c9; color: #1b5e20; font-weight: bold; }
td.cell-out-dim { background: #ffcdd2; color: #b71c1c; }
td.cell-out-pole { background: #fff3e0; color: #e65100; }
.legend { margin: 12px 0; font-size: 12px; }
.legend span { display: inline-block; padding: 3px 10px; border-radius: 3px; margin: 0 6px; font-weight: bold; font-size: 11px; }
.note { background: #e3f2fd; border-left: 3px solid #1a4a8a; padding: 10px 16px; margin: 10px 0; font-size: 12px; }
.dot { display: inline-block; width: 10px; height: 10px; border-radius: 50%; margin-right: 6px; vertical-align: middle; }
</style></head><body>
<h1>Pole Filter Grid — Two-Layer Check</h1>
<div class="note">
  <strong>Rule:</strong> A pole is included in Model 3 iff BOTH<br>
  &nbsp;&nbsp;1. its <em>dimension</em> passes the <strong>either-rate gate</strong>: P(pos OR neg mentioned) ∈ [15%, 85%]<br>
  &nbsp;&nbsp;2. the <em>pole itself</em> passes: its individual mention rate ∈ [15%, 85%]<br>
  If the dimension gate fails (saturation or starvation), BOTH poles are excluded — no contrast baseline available.
</div>
<div class="legend">
  <span class="cell-in">INCLUDED ✓</span>
  <span class="cell-out-pole">excluded (pole rate outside 15–85%)</span>
  <span class="cell-out-dim">excluded (dimension saturated/starved)</span>
</div>
"""]

# Build grid header
html.append('<table>')
header1 = ['<tr><th class="config-label" rowspan="2">Config</th>']
for dname, poles in DIMENSIONS:
    header1.append(f'<th class="dim-header" colspan="2">{dname}</th>')
for clabel, _ in CONTEXT:
    header1.append(f'<th class="ctx-header" rowspan="2">{clabel}</th>')
header1.append('</tr>')
header2 = ['<tr>']
for dname, poles in DIMENSIONS:
    for p in poles:
        header2.append(f'<th class="pole-header">{pole_label(p)}</th>')
header2.append('</tr>')
html.append(''.join(header1))
html.append(''.join(header2))

# Rows per config
for c in configs:
    html.append('<tr>')
    dot = f'<span class="dot" style="background:{PROVIDER_COLOR.get(c["provider"],"#888")}"></span>'
    html.append(f'<th class="config-label">{dot}{short_label(c["key"])}</th>')
    for dname, poles in DIMENSIONS:
        for p in poles:
            pi = c["pole"][p]
            cls = cell_class(pi, "pole")
            rate = pi["rate"] * 100
            title = f'rate {rate:.1f}% · dim either {c["dim"][dname]["rate"]*100:.1f}%'
            html.append(f'<td class="{cls}" title="{title}">{rate:.0f}%</td>')
    for clabel, ckey in CONTEXT:
        ci = c["ctx"][ckey]
        if ci["rate"] is None:
            html.append('<td>—</td>')
        else:
            cls = cell_class(ci, "ctx")
            html.append(f'<td class="{cls}" title="rate {ci["rate"]*100:.1f}%">{ci["rate"]*100:.0f}%</td>')
    html.append('</tr>')
html.append('</table>')

# Summary table
html.append('<h2 style="margin-top:40px">Summary per config</h2>')
html.append('<table><thead><tr><th>Config</th><th># dims included</th><th># poles included</th><th># context included</th><th>Total mention mains in Model 3</th></tr></thead><tbody>')
for c in configs:
    n_dim = sum(1 for d in c["dim"].values() if d["pass"])
    n_pole = sum(1 for p in c["pole"].values() if p["included"])
    n_ctx = sum(1 for x in c["ctx"].values() if x["included"])
    html.append(f'<tr><td style="text-align:left">{short_label(c["key"])}</td>')
    html.append(f'<td>{n_dim}/5</td><td>{n_pole}/10</td><td>{n_ctx}/2</td><td><strong>{n_pole + n_ctx}</strong></td></tr>')
html.append('</tbody></table>')

html.append('</body></html>')

OUT.write_text('\n'.join(html))
print(f"Wrote {OUT}")
print(f"Size: {OUT.stat().st_size:,} bytes")
