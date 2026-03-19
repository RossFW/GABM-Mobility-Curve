# GABM Mobility Curve — CLAUDE.md

## What This Is

**This is Paper 3.** Probe study for Ross Williams' PhD dissertation. Cross-sectional design:
each of 100 frozen agents answers one yes/no question at each of 40 infection levels,
across 21 LLM configurations (Anthropic, OpenAI, Gemini). Generates the "mobility curve"
showing how LLM-driven agents respond to rising infection rates.

**Data collection is complete** (March 2026): 420,000 rows across all 21 configs, validated
and backed up to GitHub. Next phase: OLS regression on macro data.

**Sibling repo:** `../GABM-Epidemic/` — contains the provider abstraction layer
(`providers/`) that this repo imports. Both must be cloned at the same directory level.

## Key Files

```
probe_mobility.py          Main probe script (100 agents × 5 reps × 40 levels = 20K calls/config)
combine_data.py            Populates viz/data/real/ from data/ — run after collection
validate_data.py           Checks all 21 configs for completeness
agents/agents.json         100 frozen agent personas (age, traits) — do not modify without discussion
data/metadata/models.csv   All 21 configs: alias, pinned version, release date, knowledge cutoff, pricing
docs/ROADMAP.md            Master "where we are and what we're pursuing" doc — read this first
docs/STATUS.md             Phase tracker — update as phases complete
docs/MODEL_CARD.md         All 21 model configs with version IDs, release dates, knowledge cutoffs
docs/SETUP.md              Full setup & run instructions for a new machine
docs/SAMPLING.md           Justification for 40-level design (0–3.5% + 4–7%)
site/coverage.html         Model coverage matrix (open in browser)
viz/methodology.html       Methodology page — research design, prompt, configs, analysis approach
viz/town.html              Interactive Phaser 3 town view — agents respond to infection levels
viz/analytics.html         Academic analytics dashboard — 20 research figures (real data)
viz/data/real/             Real probe data (populated by combine_data.py)
```

## Quick Start (new machine)

See `docs/SETUP.md` for full instructions. Short version:

```bash
# Activate GABM-Epidemic venv
source ../GABM-Epidemic/venv/bin/activate

# Dry run — verify setup, no API calls
python probe_mobility.py --dry-run

# Test run — one cheap config, 3 levels, 3 reps
python probe_mobility.py --test --model gemini-2.0-flash --reasoning off

# Full provider run
python probe_mobility.py --provider gemini --resume

# Viz dev server
cd viz && python3 -m http.server 8000   # then open localhost:8000/town.html or analytics.html
```

**The .env file** (in `../GABM-Epidemic/.env`) is gitignored — copy it manually.
Must contain the key(s) for the provider you're running:
- `ANTHROPIC_API_KEY=sk-ant-...`
- `OPENAI_API_KEY=sk-...`
- `GOOGLE_API_KEY=...`

## 21 Configs (all collected)

| Provider | Models | Reasoning levels |
|----------|--------|-----------------|
| Anthropic (5) | opus-4-5, sonnet-4-5, haiku-4-5, sonnet-4-0, claude-3-haiku | off only |
| OpenAI (10) | gpt-5.2 (×4), gpt-5.1, gpt-4.1, gpt-4o, gpt-3.5-turbo, o3 | off/low/med/high/required |
| Gemini (6) | gemini-3-flash-preview (×4), gemini-2.5-flash-lite, gemini-2.5-flash, gemini-2.0-flash | off/low/med/high |

Full details: `docs/MODEL_CARD.md` and `data/metadata/models.csv`

## Rate Limits & Workers (March 2026)

| Provider | Plan | RPM | Default workers |
|----------|------|-----|----------------|
| Anthropic | Custom Plan | 4,000 | 20 |
| OpenAI | Tier 5 | very high | 20 |
| Gemini | Paid tier 3 | 1,000+ | 10 |

Workers auto-selected per provider. Override: `--workers N`.

## Pause / Resume

**Ctrl+C** to pause. Data is crash-safe — micro CSV written after each level.

**Resume:** `python probe_mobility.py --provider gemini --resume`

`--resume` uses the **macro CSV** as the "done" signal (written only on full config
completion). Partially-completed configs (interrupted mid-run) restart from level 0.

## Output Structure

```
data/
└── {provider}_{model}_{reasoning}/
    ├── probe_results_micro.csv   ← one row per (agent × level × rep) — appended per level
    └── probe_results_macro.csv  ← one row per level (aggregate) — written at completion
```

Micro CSV written incrementally (crash-safe at level granularity).
Macro CSV written only on full config completion — used by --resume as "done" check.

## Visualization

Four pages served from `viz/`, linked by shared nav bar (`nav.js`):

```bash
cd viz && python3 -m http.server 8000
```

- **`index.html`** — Introduction page: abstract (placeholder), site guide, dissertation context.

- **`methodology.html`** — Research design, prompt template, agent population, 21 LLM
  configs, infection levels, analysis dimensions, statistical approach.

- **`town.html`** — Phaser 3 town view (Dewberry Hollow). 100 agents on circle map,
  model selector, bio panel, scrubable infection levels. Uses real probe data.

- **`analytics.html`** — Research dashboard with 20 figures across 5 tabs:
  - **Mobility Curves**: Reasoning (2) · Size (2) · Evolution (3) · Provider (2) ·
    Knowledge Cutoff (4) · Release Date (4) · Agent Analysis (1) · Comparison Tool (1)
  - **Model Characteristics**: placeholder
  - **Agent Analysis**: placeholder (future agent-level regression)
  - **Author Notes**: timelines, OLS diagnostics, internal notes
  File: `analytics.js`, `config.js`

## Multi-Machine Strategy

Run **one provider per machine** — never the same provider on two machines with the same
API key (rate limits are per key, not per machine).

Recommended split:
- Machine A (this Mac): Anthropic (~5–6h with Custom Plan 4K RPM)
- Machine B: Gemini (~8–10h)
- Machine C: OpenAI (~20–30h, o3 and high-reasoning dominate)

Consolidate data afterward with rsync (see `docs/SETUP.md`).

## Critical Rules

1. **Never modify `agents/agents.json`** without discussing with Ross first — it's the
   fixed agent population for the study. Changes invalidate comparability across configs.
2. **Confirm before any API calls** — they cost real money. Always dry-run first.
3. **`data/` is committed to GitHub** (collection complete). Do NOT delete data files.
4. **The .env file** lives in `../GABM-Epidemic/.env` — never commit it.
5. **Never modify `cost_estimates.xlsx`** — read-only master workbook.

## Next Steps (Phase 3 — OLS Regression)

1. Write `combine_results.py` — merges all 21 macro CSVs into `data/combined/all_macro.csv` (840 rows)
2. Write `analyze_results.py` — OLS regression per model config, export LaTeX table
3. See `docs/ROADMAP.md` for full statistical approach

## Dissertation Context

- Paper 1: Original GABM epidemic (GPT-3.5) — published arXiv 2307.04986
- Paper 2: Prompt sensitivity analysis — complete
- Paper 3 (this): Cross-provider LLM probe, 21 configs — data collection phase
