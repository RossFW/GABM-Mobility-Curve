# Paper 3 Roadmap — GABM Mobility Curve

*Last updated: March 17 2026*

## One-Line Summary

Cross-sectional probe: 100 frozen agents × 40 infection levels × 21 LLM configs =
420,000 API calls. Generates "mobility curves" for cross-provider LLM comparison.

---

## Where We Are (March 2026)

### ✅ Done
- Probe design finalized: 40 levels, 21 configs, 100 agents, 5 reps
- Provider layer complete: Anthropic, OpenAI, Gemini with reasoning budget control
- Gemini migrated to `google-genai` SDK: `thinking_budget=0` for 2.5-flash/lite at off; temp=1 for all thinking models
- Coverage matrix documented: `site/coverage.html`
- GitHub repo live: RossFW/GABM-Mobility-Curve
- **Phase 2 data collection complete** (March 2026): all 21 configs, 420,000 rows, validated, backed up to GitHub
- Model metadata documented: `data/metadata/models.csv` + `docs/MODEL_CARD.md`
- Visualization live with real data: `viz/analytics.html` (9-figure academic dashboard) + `viz/town.html`

### 🔲 Immediate Next: OLS Regression on Macro Data

```bash
# Step 1: Combine all 21 macro CSVs
python combine_results.py   # → data/combined/all_macro.csv (840 rows)

# Step 2: Run OLS regression
python analyze_results.py   # → figures/ + regression table
```

---

## Phase Pipeline

### Phase 2 — Data Collection ✅ COMPLETE
21 configs × 20,000 calls = 420,000 rows. All macro CSVs present.
Output: `data/{provider}_{model}_{reasoning}/probe_results_macro.csv`

### Phase 3 — OLS Regression Analysis

**Primary: macro-level OLS**
- Merge all 21 macro CSVs → `data/combined/all_macro.csv`
  - 840 rows: 21 configs × 40 infection levels
  - Columns: provider, model, reasoning, infection_level, pct_stay_home, n_total, n_valid, ...
- OLS: `pct_stay_home ~ infection_level` per config
  - Fit separately for each of 21 configs
  - Compare slope β (sensitivity to infection rate) and intercept α (baseline mobility)
  - Fit alternative: `logit(pct_stay_home/100) ~ infection_level` (logistic, more principled)
- Cross-model contrasts: provider effects, reasoning-level effects, generational effects
- Export LaTeX regression table for paper

**Secondary: agent-level OLS**
- Merge all micro CSVs → `data/combined/all_micro.csv` (~420K rows)
- OLS: `stay_home ~ infection_level + age + trait_openness + trait_conscientiousness + ...` per model
- Tests whether demographic/personality predictors vary across LLMs

### Phase 4 — Viz with Real Data ✅ COMPLETE
- `viz/data/real/` populated, analytics and town views rendering with real data

### Phase 5 — Paper Writing
- Methods: probe design, 21 configs, temperature decisions, OLS approach
- Results: mobility curve figures + OLS regression table
- Discussion: connect to Papers 1 & 2, implications for LLM-based ABMs

---

## The Research Figures (analytics.html)

| # | Figure | Key question |
|---|--------|-------------|
| 1 | Provider behavioral envelopes | Do different providers produce different curve families? |
| 2 | GPT-5.2 reasoning ladder (off→high) | How does reasoning budget shift behavior within a model? |
| 3 | Gemini 3 Flash reasoning ladder (off→high) | Same question for Gemini |
| 4 | OpenAI generational progression (off only) | How has GPT behavior changed across generations? |
| 5 | Gemini generational progression (off only) | Same for Gemini 2.0→2.5→3 Flash |
| 6 | Paper 1 baseline: GPT-3.5 vs. modern models | How far have models moved since 2022? |
| 7 | Within-provider model variation | Small multiples per provider |
| 8 | Outlier spotlights | Notable anomalies (e.g. Flash Lite inverted curve) |
| 9 | Agent-level heatmap + concordance | Do individual agents agree? Majority vs. unanimous |

OLS regression output will become an additional figure/table in the paper.

---

## Statistical Approach

- **Primary**: OLS `pct_stay_home ~ infection_level` per model → compare β (slope) and α (intercept)
- **Alternative**: logistic sigmoid `logit(p) ~ infection_level` (more principled for probability)
- **Uncertainty**: Wilson CI per data point; bootstrap CI for regression parameters (resample 100 agents, 1000×)
- 100 agents gives adequate precision: SE ≈ 5% at p=0.5, detects large LLM differences easily

---

## 4 Research Dimensions

| DIM | Question | Models |
|-----|----------|--------|
| 1 | Cross-provider reasoning sweep | gpt-5.2 vs gemini-3-flash (off/low/med/high) |
| 2 | Reasoning intensity within OpenAI | gpt-5.1 off, gpt-5.2 off→high, o3 required |
| 3 | Generational change (off only, all providers) | gpt-3.5→4o→5.1→5.2; haiku-3→sonnet-4-0→haiku/sonnet-4-5→opus-4-5; 2.0-flash→2.5-flash→3-flash |
| 4 | Model size within generation (off only) | haiku/sonnet/opus-4-5; 2.5-flash-lite→3-flash |

---

## Connection to Papers 1 & 2

**Paper 1** (arXiv 2307.04986): GPT-3.5 only, full epidemic simulation → established the GABM method.
Agents stayed home when infection rose; epidemic curves were realistic.

**Paper 2**: Prompt sensitivity analysis → showed LLM behavior is sensitive to prompt design.
Raises question: is it also sensitive to which LLM you use?

**Paper 3 (this)**: Controlled probe across 21 LLM configs → answers the question.
Same agents, same prompts, same infection levels — only the LLM changes.
Primary claims: (1) different LLMs produce meaningfully different mobility curves,
(2) reasoning level affects behavior differently across providers.

---

## Key Locked Decisions

See `docs/STATUS.md` → Key Decisions Made table for full list.
Do not change these without discussion — they define the study's scientific validity.

---

## Repo Structure

```
GABM mobility curve/          ← THIS REPO (Paper 3)
├── probe_mobility.py         ← main data collection script
├── combine_data.py           ← populates viz/data/real/ from data/
├── validate_data.py          ← checks all 21 configs for completeness
├── agents/agents.json        ← frozen agent pool (DO NOT MODIFY)
├── data/
│   ├── {provider}_{model}_{reasoning}/   ← per-config probe results
│   │   ├── probe_results_macro.csv
│   │   └── probe_results_micro.csv
│   └── metadata/models.csv   ← alias, pinned version, dates, pricing
├── viz/                      ← interactive visualizations
│   ├── town.html             ← Phaser 3 town view
│   ├── analytics.html        ← academic research dashboard (9 figures)
│   └── data/real/            ← real probe data (populated by combine_data.py)
├── site/coverage.html        ← model coverage matrix
└── docs/
    ├── ROADMAP.md            ← this file
    ├── STATUS.md             ← phase tracker
    ├── MODEL_CARD.md         ← all 21 configs with versions, dates, pricing
    ├── SETUP.md              ← new machine setup instructions
    ├── SAMPLING.md           ← 40-level design justification
    └── DESIGN.md             ← scientific rationale for probe design

../GABM-Epidemic/             ← provider infrastructure (NOT Paper 3)
├── providers/                ← imported by probe_mobility.py
├── venv/                     ← shared virtual environment
└── .env                      ← API keys (copy manually, never commit)
```
