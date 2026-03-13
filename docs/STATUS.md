# Project Status — GABM Mobility Curve

*Last updated: March 2026*

---

## Phase 1: Infrastructure ✅ COMPLETE

- [x] Project folder created (`GABM 3rd paper/GABM mobility curve/`)
- [x] Agent generation script (`agents/generate_agents.py`)
- [x] Main probe script (`probe_mobility.py`)
- [x] Documentation (`docs/DESIGN.md`, `docs/SAMPLING.md`, `docs/STATUS.md`)
- [x] Generate and freeze `agents/agents.json` — 100 agents, seed=42, ages 19–64 mean 41.5

## Phase 2: Validation 🔲 NOT STARTED

- [ ] Test run: `python probe_mobility.py --test --provider openai --model gpt-3.5-turbo`
- [ ] Inspect output CSV — check prompt, parse quality, token counts
- [ ] Verify cost estimate is in expected range
- [ ] Test with one Gemini config (thinking token tracking)
- [ ] Test with one Anthropic config

## Phase 3: Full Runs 🔲 NOT STARTED

- [ ] Gemini configs (21, cheapest — run first)
- [ ] OpenAI configs (12)
- [ ] Anthropic configs (5, off-reasoning only)

## Phase 4: Analysis 🔲 NOT STARTED

- [ ] Aggregate macro CSVs across all configs
- [ ] Plot mobility curves per provider/model
- [ ] Regression: pct_stay_home ~ infection_level × model_config
- [ ] Reasoning level comparison (OpenAI + Gemini)
- [ ] Model tier comparison within each provider

## Phase 5: Writing 🔲 NOT STARTED

- [ ] Methods section
- [ ] Results section
- [ ] Discussion
- [ ] Connect to Papers 1 & 2

---

## Cost Tracking

| Phase | Estimated | Actual |
|-------|-----------|--------|
| Validation (test runs) | ~$1 | TBD |
| Gemini full (21 configs) | ~$18 | TBD |
| OpenAI full (12 configs) | ~$50 actual (2.5x estimate correction) | TBD |
| Anthropic full (5 configs) | ~$61 | TBD |
| **Total** | **~$130** | TBD |

*Estimates based on: 100 agents × 15 levels × 5 reps = 7,500 calls/config,
scaled from cost_estimation_test results.*

---

## Key Decisions Made

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Method | Controlled probe (not full simulation) | Cleaner comparison, ~4× cheaper |
| Health string | "healthy and well" (fixed) | Remove self-health confound |
| Infection levels | 15 non-uniform (0–25%) | Empirically justified by Paper 2 distribution |
| Agent pool | 100 fixed agents (seed=42) | Same agents for all configs |
| Prompt style | Paper 1 redone | Methodological continuity |
| Reps per level | 5 (default) | Revisit after test run |
| Anthropic reasoning | Excluded | Too expensive |
