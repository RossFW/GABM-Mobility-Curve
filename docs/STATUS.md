# Project Status — GABM Mobility Curve

*Last updated: March 20 2026*

---

## Phase 1: Infrastructure ✅ COMPLETE

### Probe Design
- [x] 21 configs finalized — see `docs/MODEL_CARD.md`
- [x] 40 infection levels (0–3.5% at 0.1% steps + 4, 5, 6, 7%)
- [x] 100 frozen agents (seed=42, ages 19–64, Big-5 traits) — `agents/agents.json`
- [x] 5 reps per agent-level (captures stochasticity + format-failure safety)
- [x] Prompt template finalized — Paper 1 style, fixed health string

### Provider Layer
- [x] Anthropic, OpenAI, Gemini providers (from `../GABM-Epidemic/providers/`)
- [x] Gemini: migrated to `google-genai` SDK (thinking_budget control)
  - `gemini-2.5-flash` / `gemini-2.5-flash-lite` at reasoning=off: `thinking_budget=0`, temp=0 (genuinely disabled)
  - `gemini-3-flash-preview` off/low/med/high: minimal thinking floor, temp=1
  - `gemini-2.0-flash`: no thinking, temp=0
- [x] Temperature=1 for all reasoning-capable models (Anthropic API-enforced; Gemini recommendation)
- [x] Dotenv loading from `../GABM-Epidemic/.env`
- [x] --resume bug fixed (checks macro CSV, not micro)
- [x] Workers: Anthropic 20, OpenAI 20, Gemini 10 (per rate plan)
- [x] Gemini HTTP timeout: 120s on `genai.Client()` constructor (`http_options`)

### Validation
- [x] Test run: `gemini-2.0-flash off` — 3 levels × 100 agents × 5 reps = 900 responses
  - 100% format_valid, 0 errors, $0.06 cost
- [x] Full `validate_data.py` pass after all 21 configs complete

### Infrastructure
- [x] GitHub repo: RossFW/GABM-Mobility-Curve (public)
- [x] Visualization: `viz/methodology.html` + `viz/town.html` (Phaser 3 town) + `viz/analytics.html` (20-figure academic dashboard)
- [x] Coverage matrix: `site/coverage.html` with notes on thinking situation per model
- [x] Model metadata: `data/metadata/models.csv` (alias, pinned version, release date, knowledge cutoff, pricing)

---

## Phase 2: Full Data Collection ✅ COMPLETE (March 2026)

### Configs completed (21 total)

**Anthropic (5 configs)**
- [x] claude-opus-4-5 off
- [x] claude-sonnet-4-5 off
- [x] claude-haiku-4-5 off
- [x] claude-sonnet-4-0 off
- [x] claude-3-haiku-20240307 off

**OpenAI (10 configs)**
- [x] gpt-5.2 off / low / medium / high
- [x] gpt-5.1 off
- [x] gpt-4.1 off
- [x] gpt-4o off
- [x] gpt-3.5-turbo off
- [x] o3 required

**Gemini (6 configs)**
- [x] gemini-3-flash-preview off / low / medium / high
- [x] gemini-2.5-flash off
- [x] gemini-2.5-flash-lite off
- [x] gemini-2.0-flash off

### Totals
- 420,000 rows (21 configs × 20,000 calls each)
- All 21 macro CSVs present and validated
- Data backed up to GitHub (241MB, gitignored `data/` line commented out)

---

## Phase 3: Regression Analysis 🔄 IN PROGRESS

Agent-level logistic regression (micro data, 20K obs per config):

- [x] R script: `analysis/compute_regressions.R` — fixed-effects + random-effects logit
- [x] All 21 configs processed — JSON output in `viz/data/real/regressions/`
- [x] Model 1: fixed-effects logit with agent dummies (infection coefficients)
- [x] Model 2: random-effects logit via glmer (trait + demographic effects)
- [x] Fig 25 loads pre-computed regression JSON (replaced client-side IRLS)
- [x] Fig 26: cross-model trait coefficient forest plot (7 panels, all 21 configs)
- [x] Fig 27: agent consistency matrix (Spearman ρ, pre-computed via Python)
- [x] Fig 22 split: heatmap + concordance now separate figures (Fig 22 / Fig 22b)
- [ ] Export regression table for paper (LaTeX format)
- [ ] Macro-level OLS: `pct_stay_home ~ infection_level` per config

---

## Phase 4: Viz with Real Data ✅ COMPLETE

- [x] `viz/data/real/` populated via `combine_data.py`
- [x] `analytics.html` — 28 figures rendering with real data (academic LaTeX style)
- [x] `town.html` — real agent data loaded (Phaser 3 town view)
- [x] Research questions & evidence map (Author Notes)
- [x] Spearman's ρ walkthrough (Author Notes)

---

## Phase 5: Paper Writing 🔲 NOT STARTED

- [ ] Methods section
- [ ] Results section (figures + OLS table)
- [ ] Discussion — connect to Papers 1 & 2
- [ ] Submission

---

## Key Decisions Made (locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Method | Controlled probe (cross-sectional) | Cleaner comparison, ~4× cheaper than full simulation |
| Infection levels | 40: 0–3.5% at 0.1% + {4,5,6,7}% | Justified by Round #2 Full Feedback data (max 3.4%) |
| Agent pool | 100 fixed agents, seed=42 | Same agents across all 21 configs |
| Reps | 5 per agent-level | Captures stochasticity + format-failure safety |
| Temperature | 0 for non-thinking, 1 for reasoning/thinking models | API requirements + Google recommendations |
| Anthropic reasoning | Off only | Too expensive for full ladder; off suffices for cross-provider comparison |
| Gemini SDK | `google-genai` (Mar 2026) | Thinking budget control; deprecated `google.generativeai` couldn't set budget=0 |
