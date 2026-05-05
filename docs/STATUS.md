# Project Status — GABM Mobility Curve

*Last updated: April 28, 2026*

---

## Phase 1: Infrastructure ✅ COMPLETE

### Probe Design
- [x] 21 configs finalized — see `docs/MODEL_CARD.md`
- [x] 40 infection levels (0–3.5% at 0.1% steps + 4, 5, 6, 7%)
- [x] 100 frozen agents (seed=42, ages 18–65, Big Five traits) — `agents/agents.json`
- [x] 5 reps per agent × infection level
- [x] Prompt template finalized — Williams et al. (2023) style with two simplifications: static health string and one-shot decision (no day counter, no SEIR memory)

### Provider Layer
- [x] Anthropic, OpenAI, Gemini providers (from `../GABM-Epidemic/providers/`)
- [x] Gemini: migrated to `google-genai` SDK with `thinking_budget` control
- [x] Temperature: 0 for non-reasoning configs where the API allows; 1 for reasoning-capable models (Anthropic API-required, Google recommended); o-series accepts no temperature
- [x] `--resume` works correctly (checks macro CSV, not micro)
- [x] Workers: Anthropic 20, OpenAI 20, Gemini 10

---

## Phase 2: Data Collection ✅ COMPLETE (March 2026)

21 LLM configurations × 20,000 responses = **420,000 total**, 0 format errors.

| Provider | Count | Configurations |
|---|---|---|
| OpenAI | 9 | GPT-3.5 Turbo, GPT-4o, GPT-4.1, GPT-5.1, GPT-5.2 (off/low/med/high), o3 |
| Anthropic | 5 | Claude 3 Haiku, Claude Sonnet 4.0, Claude Sonnet 4.5, Claude Haiku 4.5, Claude Opus 4.5 |
| Google | 7 | Gemini 2.0 Flash, Gemini 2.5 Flash, Gemini 2.5 Flash Lite, Gemini 3 Flash Preview (off/low/med/high) |

GPT-5.1 high-reasoning was cut (cost-prohibitive at ~$400); base GPT-5.1 (off) is in the corpus.

---

## Phase 3: Analysis Pipeline ✅ COMPLETE

### Regression
- [x] R script: `analysis/compute_regressions.R` runs all three logit specifications per config:
    - Fixed-effects (`glm` with agent dummies)
    - Random-effects (`glmer` with `(1 | agent_id)` and trait/age/gender)
    - Random-effects with mention flags (15–85% inclusion gate)
- [x] All 21 configs processed; per-config JSONs in `viz/data/real/regressions/`.
- [x] Diagnostics computed for all three specifications (DHARMa, calibration, BLUPs, residuals).

### NLP / Text Analysis
- [x] `compute_trait_mentions.py` — trait/context mention rates per config, **including yes/no/diff decision-split tables** (added April 2026 for Fig 32 toggle).
- [x] `compute_decision_drivers.py` — concept-category mentions for Fig 37 (Traits, Work, Community, Virus Properties, Self Health, Virus Prevalence).
- [x] `compute_verbosity_stats.py` — token distribution stats for Figs 35–36.
- [x] `compute_response_text_similarity.py` — rep agreement + Jaccard for Figs 38–39.
- [x] `compute_persona_similarity.py` — **5/5-unanimity within-vs-across cosine similarity** for Fig 40 (rewritten April 2026).

### OLS Mobility-Curve Comparisons
- [x] Per-figure dummy-variable OLS regressions for Theme A figure pairs; per-comparison tables in Appendix A of the dashboard.

---

## Phase 4: Dashboard ✅ COMPLETE

- [x] **5 tabs**: Research Questions, Mobility Curves (Figs 1–21), Persona Analysis (Figs 22–30), Response Analysis (Figs 31–40), Appendix.
- [x] **Appendix A**: Mobility-curve OLS regressions.
- [x] **Appendix B**: split into B.1 (fixed-effects + random-effects logit, 21 tables) and B.2 (random-effects logit with mention flags, 21 tables).
- [x] **Appendix C**: Three diagnostic figures (C1, C2, C3) covering all three specifications.
- [x] **Appendix D**: Statistical Reference (Understanding Logit Regression and Understanding Spearman's ρ as static walkthroughs).
- [x] Caption / terminology pass complete: dropped jargon (pole, dimension-level, within-group rate, mention-interaction); standardized on "trait label" / "mention flag"; removed editorial framing throughout.
- [x] Fig 32 yes/no/diff toggle implemented; Fig 37 in-SVG title moved out for parallel framing.

---

## Phase 5: Paper Writing 🔄 IN PROGRESS

Live in `viz/paper.html` (separate top-level page; navigate to "Paper" in site nav).

- [x] **Title & Abstract** (§1) — placeholder.
- [x] **Introduction** (§2) — skeleton bullets.
- [x] **Background & Related Work** (§3) — skeleton bullets.
- [x] **Methods (§4)** — drafted in journal-paper prose:
    - 4.1 Simulation setup (one-shot decision, static health, simplifications vs. Williams et al.)
    - 4.2 Agent population (Big Five sampling 50/50 per dimension; age from U.S. population clock; 50/50 gender; seed = 42)
    - 4.3 Probe design (40 levels × 5 reps × 100 agents per config)
    - 4.4 LLM configurations (9 OpenAI / 5 Anthropic / 7 Google with reasoning-level breakdown)
    - 4.5 Prompt template (Figure 1, boxed)
    - 4.6 Response collection and parsing
    - 4.7 Analytical methods (mobility curves, OLS dummy regression, three logits, Spearman, embedding cosine)
- [x] **Figure 2** (sample demographics) embedded; renders from the same `agents/agents.json` and same `renderFig21Demographics()` function as dashboard Fig 22 — edits propagate to both.
- [ ] **Results (§5)** — paper-order scaffold in place (5.1 leads with Cross-Provider RQ4, then RQ1/2/3/5/6 → §5.2 trait effects → §5.3 cross-model consistency → §5.4 reasoning text → §5.5 response heterogeneity). Per-RQ Key Findings remain TBD; RQ1 has a draft framing in conversation but not yet committed to the doc.
- [ ] **Discussion (§6)** — placeholder bullets.
- [ ] **Conclusion (§7)** — placeholder.
- [x] **Appendices (§8)** — pointers to dashboard appendices A/B.1/B.2/C/D.
- [x] **References (§9)** — numeric format `[N]`. Two starter entries: [1] Williams et al. (2023) arXiv:2307.04986; [2] U.S. Census Bureau Population Clock (source of age weights).

### Immediate Next Steps for Phase 5

1. Walk through RQ1 → RQ16 with Ross, drafting the Key Finding for each (1–2 sentences) into the Research Questions tab table.
2. Once Key Findings settle, expand `paper.html` §5.x bullets into prose.
3. Commit to paper-figure numbering (currently §5 references dashboard numbers; Figs 1 and 2 in paper are prompt and demographics).
4. Draft Discussion (§6) once headline findings are clear.

---

## Key Decisions Made (locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Method | Controlled probe (cross-sectional) | Cleaner comparison than full simulation |
| Infection levels | 40 (0–3.5% at 0.1% + 4/5/6/7%) | Dense low-range coverage |
| Agent pool | 100 fixed agents, seed=42 | Same agents across all 21 configs |
| Reps | 5 per agent × infection level | Stochasticity + format-failure margin |
| Temperature | 0 for non-reasoning where allowed; 1 for reasoning-capable | API requirements + Google recommendation |
| Anthropic reasoning | Off only | Reasoning ladder too expensive |
| Gemini SDK | `google-genai` | Required for `thinking_budget = 0` |
| Persona-similarity gate | 5/5 unanimity, same-direction match | Removes yes-vs-no text confound (rewritten April 2026) |
| Trait-mention figure | 12 columns: 10 Big Five poles + 2 context (Infection, Age) for all toggle modes | Pole-level lets you ask whether introverts mention extraversion more on stay-home vs. go-out |
