# GABM Mobility Curve — CLAUDE.md

*Last updated: April 28, 2026*

## What This Is

**Paper 3** of Ross Williams' PhD dissertation. Cross-sectional probe study:
100 frozen agents × 40 infection levels × 5 reps × 21 LLM configs = 420,000 responses.

**Current phase:** **Paper writing.** Methods (§4) is drafted in `viz/paper.html`.
Results (§5) is scaffolded but Key Findings per RQ are still TBD. Discussion and
Conclusion are placeholders.

**Sibling repo:** `../GABM-Epidemic/` — provider abstraction layer (`providers/`).

## Where the Work Lives

- **Dashboard** (`viz/analytics.html`): 5 tabs — Research Questions, Mobility Curves
  (Figs 1–21), Persona Analysis (Figs 22–30), Response Analysis (Figs 31–40),
  Appendix (A–D). Used for browsing the data figure-by-figure.
- **Paper outline** (`viz/paper.html`, separate top-level page): paper-order
  scaffold with Title/Abstract, Intro, Background, Methods, Results, Discussion,
  Conclusion, Appendices, References. Methods (§4) is mostly drafted; Results bullets
  point to the dashboard figures and remain TBD until Key Findings are filled in.

## Research Question Structure (current)

16 RQs across 5 themes (see Research Questions tab in dashboard for the full list):

| Theme | Count | Topic |
|-------|-------|-------|
| A — Comparing LLM Mobility Curves | 6 | Reasoning level, size, evolution, provider, knowledge cutoff, release date — does each affect the mobility curve? |
| B — Trait Interpretation | 2 | How traits affect curves; magnitude of personality vs. infection effects |
| C — Cross-Model Consistency | 2 | Do LLMs agree on which predictors matter and which agents are cautious? |
| D — Reasoning Text Analysis | 3 | Trait mentions and behavioral effect; decision themes; verbosity |
| E — Response Heterogeneity | 3 | Decision repeatability, text repeatability, persona individuation |

## Key Files

```
agents/agents.json                  100 frozen personas (seed=42, do not modify)
agents/generate_agents.py           Population-clock-weighted age + 50/50 Big Five
probe_mobility.py                   Main probe loop (one-shot prompt per agent×level×rep)
combine_data.py                     Per-config CSVs → viz/data/real/all_macro.csv
data/metadata/models.csv            21 configs metadata
analysis/compute_regressions.R      Fixed-effects + random-effects logit + mention-flag logit
analysis/compute_trait_mentions.py  Trait/context mention counts (with yes/no/diff splits)
analysis/compute_persona_similarity.py  5/5-unanimity within-vs-across cosine (Fig 40)
analysis/compute_decision_drivers.py    Concept-category mentions (Fig 37)
analysis/compute_verbosity_stats.py     Token distribution (Figs 35, 36)
analysis/compute_response_text_similarity.py  Rep agreement + Jaccard (Figs 38, 39)
viz/data/real/regressions/          21 pre-computed regression JSONs
viz/analytics.html                  Dashboard (5 tabs, ~40 figures)
viz/paper.html                      Paper-order scaffold (separate top-level page)
viz/analytics-shared.js             Shared globals, SVG helpers, OLS math, data loaders
viz/analytics-curves.js             Mobility Curves tab
viz/analytics-cohort.js             Persona Analysis tab (largest file; filename retained)
viz/analytics-responses.js          Response Analysis tab
viz/analytics-author.js             Statistical-reference renderers (Coefficient bars,
                                    Probability calculator) — used in Appendix D
viz/analytics-init.js               Tab switching + lazy-render entry points
viz/nav.js                          Top-level page nav (Intro / Methodology /
                                    Simulation / Analytics / Paper)
viz/config.js                       Shared config (21 models, colors, infection levels)
viz/town.html                       Phaser 3 town view (Dewberry Hollow)
viz/methodology.html                Research design + prompt template (top-level page)
docs/ROADMAP.md                     Master roadmap
docs/STATUS.md                      Phase tracker
```

## Three Regression Specifications

All fit per LLM configuration on the 20,000-row `probe_results_micro.csv`. Pre-computed
in R (`analysis/compute_regressions.R`).

- **Fixed-effects logit** (Fig 23 left, Appendix B.1): `glm(stay_home ~ infection_pct + I(infection_pct^2) + factor(agent_id))`. 99 agent dummies absorb between-agent variation.
- **Random-effects logit** (Fig 23 right, Appendix B.1): `glmer(stay_home ~ infection_pct + I(infection_pct^2) + Big Five + male + age + (1 | agent_id))`. Random intercepts per agent allow trait estimation.
- **Random-effects logit with mention flags** (Fig 33, Appendix B.2): the random-effects spec extended with one binary flag per Big Five trait label and per context category (infection, age). A flag enters only when its overall mention rate is in [15%, 85%].

Diagnostics for all three in Appendix C (calibration, DHARMa Q-Q, random-intercept
normality, BLUPs, residuals by predictor).

## Variable Coding

- `infection_pct`: raw 0–7%, `age`: raw years 18–65 (no normalization).
- Dummies: `male=1`, `extraverted=1`, `agreeable=1`, `conscientious=1`, `emot_stable=1`, `open_to_exp=1`.
- References: female, introverted, antagonistic, unconscientious, neurotic, closed.

## Visualization

```bash
cd viz && python3 -m http.server 8000
# then open localhost:8000/index.html (or analytics.html for dashboard, paper.html for outline)
```

## Critical Rules

1. **Never modify `agents/agents.json`** without discussion — fixed population for the study.
2. **Confirm before any API calls** — they cost real money.
3. **`data/` is committed to GitHub** — do NOT delete data files.
4. **Never modify `cost_estimates.xlsx`** — read-only master workbook.
5. **The .env file** lives in `../GABM-Epidemic/.env` — never commit it.
6. **Figure numbering**: dashboard figures are 1–40 (current canonical numbering).
   Paper figures are renumbered as the paper draft fills in (Fig 1 = prompt template,
   Fig 2 = sample demographics, etc.). Cross-references in `paper.html` use **dashboard
   numbers** as placeholders until paper figure numbering is locked.

## Dissertation Context

- Paper 1: Original GABM epidemic (GPT-3.5) — published arXiv:2307.04986.
- Paper 2: Prompt sensitivity analysis — complete.
- Paper 3 (this): Cross-provider LLM probe, 21 configs — paper writing phase
  (Methods drafted; Results bullets scaffolded; Key Findings TBD).
