# Project Status — GABM Mobility Curve

*Last updated: March 17 2026*

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

## Phase 3: OLS Regression Analysis 🔲 NEXT

Primary analysis on macro data:

- [ ] Write `combine_results.py` — merges all 21 macro CSVs into `data/combined/all_macro.csv` (840 rows: 21 configs × 40 levels)
- [ ] OLS regression: `pct_stay_home ~ infection_level` per model config
  - Compare slope (sensitivity) and intercept (baseline) across all 21 configs
  - Provider fixed effects and reasoning-level contrasts
  - Also fit sigmoid: `logit(pct_stay_home) ~ infection_level`
- [ ] Export regression table for paper (LaTeX format)
- [ ] Uncertainty: Wilson CIs or bootstrap (resample 100 agents, 1000× iterations)

Secondary: agent-level analysis
- [ ] `data/combined/all_micro.csv` — full 420K row merge
- [ ] OLS: `stay_home ~ infection_level + age + trait_*` per model
- [ ] Compare how demographic predictors differ across LLMs

---

## Phase 4: Viz with Real Data ✅ COMPLETE

- [x] `viz/data/real/` populated via `combine_data.py`
- [x] `analytics.html` — 20 figures rendering with real data (academic LaTeX style)
- [x] `town.html` — real agent data loaded (Phaser 3 town view)

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
