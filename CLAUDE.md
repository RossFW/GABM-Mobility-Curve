# GABM Mobility Curve — CLAUDE.md

## What This Is

Probe study for **Paper 3** of Ross Williams' PhD dissertation. Cross-sectional design:
each of 100 frozen agents answers one yes/no question at each of 40 infection levels,
across 22 LLM configurations (Anthropic, OpenAI, Gemini). Generates the "mobility curve"
showing how LLM-driven agents respond to rising infection rates.

**Sibling repo:** `../GABM-Epidemic/` — contains the provider abstraction layer
(`providers/`) that this repo imports. Both must be cloned at the same directory level.

## Key Files

```
probe_mobility.py     Main probe script (100 agents × 5 reps × 40 levels = 20K calls/config)
ping_models.py        Connectivity test for all 22 configs (~$0.01 total)
character_test.py     Single-agent sanity check, outputs site/character_test.html
agents/agents.json    100 frozen agent personas (age, traits) — do not modify without discussion
docs/SETUP.md         Full setup & run instructions for a new machine
docs/SAMPLING.md      Justification for 40-level design (0–3.5% + 4–7%)
docs/STATUS.md        Current run status — update as configs complete
site/coverage.html    Model coverage matrix (open in browser)
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
```

**The .env file** (in `../GABM-Epidemic/.env`) is gitignored — copy it manually.
Must contain the key(s) for the provider you're running:
- `ANTHROPIC_API_KEY=sk-ant-...`
- `OPENAI_API_KEY=sk-...`
- `GOOGLE_API_KEY=...`

## 22 Configs to Run

| Provider | Models | Reasoning levels |
|----------|--------|-----------------|
| Anthropic (5) | opus-4-5, sonnet-4-5, haiku-4-5, sonnet-4-0, claude-3-haiku | off only |
| OpenAI (11) | gpt-5.2 (×4), gpt-5.1 (×2), gpt-4.1, gpt-4o, gpt-3.5-turbo, o3 | off/low/med/high/required |
| Gemini (6) | gemini-3-flash-preview (×4), gemini-2.5-flash-lite, gemini-2.5-flash, gemini-2.0-flash | off/low/med/high |

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

## Multi-Machine Strategy

Run **one provider per machine** — never the same provider on two machines with the same
API key (rate limits are per key, not per machine).

Recommended split:
- Machine A (this Mac): Anthropic (~5–6h with Custom Plan 4K RPM)
- Machine B: Gemini (~23–25h)
- Machine C: OpenAI (~37–42h, o3 and high-reasoning dominate)

Consolidate data afterward with rsync (see `docs/SETUP.md`).

## Critical Rules

1. **Never modify `agents/agents.json`** without discussing with Ross first — it's the
   fixed agent population for the study. Changes invalidate comparability across configs.
2. **Confirm before any API calls** — they cost real money. Always dry-run first.
3. **Don't commit `data/`** — gitignored. Sync with rsync after runs complete.
4. **The .env file** lives in `../GABM-Epidemic/.env` — never commit it.

## Next Steps After Data Collection

1. Run `combine_results.py` (to be written) — merges all config data dirs into
   `data/combined/all_micro.csv` and `data/combined/all_macro.csv`
2. Run `analyze_results.py` (to be written) — generates 5 charts (see plan)
3. Charts saved to `figures/` as PNG (300 DPI) and HTML (Plotly interactive)

## Dissertation Context

- Paper 1: Original GABM epidemic (GPT-3.5) — published arXiv 2307.04986
- Paper 2: Prompt sensitivity analysis — complete
- Paper 3 (this): Cross-provider LLM comparison, probe design — data collection phase
- Full context: `../GABM-Epidemic/AGENTS.md` and `../GABM-Epidemic/docs/RESEARCH.md`
