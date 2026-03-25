# GABM Mobility Curve — CLAUDE.md

## What This Is

**Paper 3** of Ross Williams' PhD dissertation. Cross-sectional probe study:
100 frozen agents × 40 infection levels × 5 reps × 21 LLM configs = 420,000 rows.

**Data collection is complete** (March 2026). Current phase: **regression analysis + visualization**.

**Sibling repo:** `../GABM-Epidemic/` — provider abstraction layer (`providers/`).

## Key Files

```
agents/agents.json              100 frozen agent personas — do not modify
data/metadata/models.csv        21 configs: alias, version, release date, pricing
analysis/compute_regressions.R  Fixed-effects + random-effects logit (R/lme4)
analysis/compute_trait_mentions.py    Trait keyword scan → viz/data/real/trait_mentions.json
analysis/compute_verbosity_stats.py   Token distribution stats → viz/data/real/verbosity_stats.json
analysis/compute_response_text_similarity.py  Rep agreement + Jaccard → viz/data/real/response_text_similarity.json
viz/data/real/regressions/      21 pre-computed regression JSONs
viz/analytics.html              Research dashboard — 41 figures across 4 tabs
viz/analytics-shared.js         Shared globals, SVG helpers, OLS math, data loaders
viz/analytics-curves.js         Mobility Curves tab rendering
viz/analytics-cohort.js         Cohort Analysis tab rendering (largest file)
viz/analytics-responses.js      Response Analysis tab (Figures 31-41)
viz/analytics-author.js         Author Notes tab rendering
viz/analytics-init.js           Tab switching, nav, init() entry point
viz/config.js                   Shared config (models, colors, infection levels)
viz/town.html                   Phaser 3 town view (Dewberry Hollow)
docs/ROADMAP.md                 Master roadmap — read this first
docs/STATUS.md                  Phase tracker
```

## Regression Analysis

Two models per config, computed in R (`analysis/compute_regressions.R`):

- **Model 1** — Fixed-effects logit: `glm(stay_home ~ infection_pct + I(infection_pct^2) + factor(agent_id))`
  Only infection coefficients reported (99 agent dummies absorb individual variation).

- **Model 2** — Random-effects logit: `glmer(..., (1|agent_id))` via lme4
  Estimates trait + demographic effects with random intercepts per agent.

**Variable coding (no normalization):**
- `infection_pct`: raw 0–7%, `age`: raw years 18–65
- Dummies: male=1, extraverted=1, agreeable=1, conscientious=1, emot_stable=1, open_to_exp=1
- Reference: female, introverted, antagonistic, unconscientious, neurotic, closed

**Run:** `Rscript analysis/compute_regressions.R` (requires R + lme4, data.table, jsonlite)
**Output:** `viz/data/real/regressions/{config_key}.json` — loaded by Fig 25 in analytics-cohort.js

## Visualization

```bash
cd viz && python3 -m http.server 8000
```

- **`analytics.html`** — 41 figures across 4 tabs: Mobility Curves (1–21), Cohort Analysis (22–29), Response Analysis (30–41), Author Notes
- **`town.html`** — Phaser 3 town, model selector, infection scrubber
- **`methodology.html`** — Research design, prompt template, statistical approach

## Critical Rules

1. **Never modify `agents/agents.json`** without discussion — fixed population for the study
2. **Confirm before any API calls** — they cost real money
3. **`data/` is committed to GitHub** — do NOT delete data files
4. **Never modify `cost_estimates.xlsx`** — read-only master workbook
5. **The .env file** lives in `../GABM-Epidemic/.env` — never commit it

## Dissertation Context

- Paper 1: Original GABM epidemic (GPT-3.5) — published arXiv 2307.04986
- Paper 2: Prompt sensitivity analysis — complete
- Paper 3 (this): Cross-provider LLM probe, 21 configs — regression + writing phase
