# GABM Mobility Curve — CLAUDE.md

*Last updated: May 11, 2026*

## Current Phase

**Paper 3 V1 was submitted to the advisor on May 11, 2026.** Awaiting written feedback.

**Until feedback arrives, do NOT make substantive prose changes to `viz/paper.html`.** V1 is the baseline reviewers are working from. Acceptable changes while waiting: typo fixes, citation-format tweaks, figure-rendering bugs, infrastructure cleanup. Anything that materially changes argument or claims should wait for advisor feedback.

When feedback arrives:
1. Read it with the user.
2. Map each comment to a section of `viz/paper.html`.
3. Make revisions section-by-section.
4. Re-export PDF (see "Generating the PDF" below).

In the meantime, the **dissertation draft** is the active workspace — see `../../Dissertation Draft/CLAUDE.md`.

## What This Is

**Paper 3** of Ross Williams' PhD dissertation. Cross-sectional probe study:
100 frozen agents × 40 infection levels × 5 reps × 21 LLM configs = 420,000 responses.

The paper claims: **LLM choice is itself a parameterization of GABM agent behavior.** Title: *LLM Sensitivity of Generative Agents: Evidence from an Epidemic Model.*

**Provider layer:** vendored in `providers/` (was previously imported from the sibling GABM-Epidemic repo; this repo is now self-contained).

## V1 Paper Structure (the document that was submitted)

The submitted PDF was rendered from `viz/paper.html` and includes:

- §1 Introduction (incl. Table 1: 14 RQs)
- §2 Background & Related Work
  - §2.1 Generative agent-based modeling (GABM strict)
  - §2.2 LLM social simulation (broader literature + fidelity-raising methods)
  - §2.3 LLM evaluations (capability benchmarks → shallow probes → this paper)
- §3 Methods (incl. Table 2: 21 LLM configs, Figure 2: prompt template)
- §4 Results — three analyses, Figures 1–21
  - §4.1 Mobility Curve Results (Figs 1–11)
  - §4.2 Persona Results (Figs 12–15)
  - §4.3 Response Results (Figs 16–21)
- §5 Discussion (5.1–5.3 mirror Results, 5.4 Implications, 5.5 Limitations)
- §6 Conclusion
- §7 Appendices A/B/C (regression tables, diagnostics)
- §8 References (Vancouver style, 37 entries)

## Generating the PDF (V1 export workflow)

```bash
cd "GABM 3rd paper/GABM mobility curve/viz"
python3 -m http.server 8000
# Open Chrome at http://localhost:8000/paper.html
# Wait for all 21 figures to render
# Cmd+P → Save as PDF → Background graphics: ON
# Filename defaults to "Paper V1.pdf"
```

## Where the Work Lives

- **Dashboard** (`viz/analytics.html`): tabs with all figures interactive. Used for browsing data figure-by-figure.
- **Paper** (`viz/paper.html`): the V1 document, renders the same figures in paper order. Print-CSS configured for PDF export.

## Research Question Structure

14 RQs across three analyses (Table 1 in paper.html):

| Analysis | RQs | Figures |
|---|---|---|
| Mobility Curve | RQ1–6 (provider, reasoning, size, evolution, knowledge cutoff, release date) | Figs 3–11 |
| Persona | RQ7–10 (direction, importance, persona-vs-infection, agent-identity) | Figs 12–15 |
| Response | RQ11–14 (mention rates, amplification, decision themes, individuation) | Figs 16–21 |

## Key Files

```
agents/agents.json                  100 frozen personas (seed=42, do not modify)
agents/generate_agents.py           Population-clock-weighted age + 50/50 Big Five
probe_mobility.py                   Main probe loop (one-shot prompt per agent×level×rep)
combine_data.py                     Per-config CSVs → viz/data/real/all_macro.csv
data/metadata/models.csv            21 configs metadata
analysis/compute_regressions.R      Fixed-effects + random-effects logit (M1, M2)
analysis/refit_model3_pole_main.R   Mention-flag logit (M3, pole-level main effects) + its diagnostics
analysis/generate_pole_flags.py     Pole-level mention flags (mention_flags_pole.csv) for M3
analysis/compute_trait_mentions.py  Trait/context mention counts
analysis/compute_persona_similarity.py  5/5-unanimity within-vs-across cosine
analysis/compute_decision_drivers.py    Concept-category mentions
analysis/compute_verbosity_stats.py     Token distribution
analysis/compute_response_text_similarity.py  Rep agreement + Jaccard
viz/data/real/regressions/          21 pre-computed regression JSONs
viz/analytics.html                  Dashboard
viz/paper.html                      V1 paper document
viz/analytics-shared.js             Shared globals, SVG helpers, OLS math, data loaders
viz/analytics-curves.js             Mobility Curves tab
viz/analytics-cohort.js             Persona Analysis tab (largest file)
viz/analytics-responses.js          Response Analysis tab
viz/analytics-author.js             Statistical-reference renderers
viz/analytics-init.js               Tab switching + lazy-render entry points
viz/nav.js                          Top-level page nav
viz/config.js                       Shared config (21 models, colors, infection levels)
viz/town.html                       Phaser 3 town view (Dewberry Hollow)
viz/methodology.html                Research design + prompt template
docs/ROADMAP.md                     Master roadmap
docs/STATUS.md                      Phase tracker
```

## Three Regression Specifications

All fit per LLM configuration on the 20,000-row `probe_results_micro.csv`. Pre-computed in R.

- **Fixed-effects logit** (Appendix B.1): `glm(stay_home ~ infection_pct + I(infection_pct^2) + factor(agent_id))`. 99 agent dummies absorb between-agent variation. From `analysis/compute_regressions.R`; diagnostics from `analysis/compute_dharma.R`.
- **Random-effects logit** (Appendix B.1): `glmer(stay_home ~ infection_pct + I(infection_pct^2) + Big Five + male + age + (1 | agent_id))`. Random intercepts per agent allow trait estimation. From `analysis/compute_regressions.R`; diagnostics from `analysis/compute_dharma.R`; calibration bins from `analysis/add_calibration_by_age.R` / `add_calibration_by_infection.R`.
- **Random-effects logit with mention flags** (Appendix B.2): the random-effects spec extended with **pole-level** mention flags (e.g. `mentioned_introverted`, `mentioned_antagonistic`) as **main effects only** — no trait×mention interactions. A pole's flag enters only when its within-trait-group mention rate is in [15%, 85%]. Produced by `analysis/refit_model3_pole_main.R` (which also generates all of model3's C.3 diagnostics in the same fit), reading `mention_flags_pole.csv` from `analysis/generate_pole_flags.py`. This pole-level spec **supersedes** the dimension-level model3 in `compute_regressions.R`; intermediate specs (strict-threshold, pole-with-interactions) were removed in the final cleanup and live in git history.

Diagnostics in Appendix C.

## Variable Coding

- `infection_pct`: raw 0–7%, `age`: raw years 18–65 (no normalization).
- Dummies: `male=1`, `extraverted=1`, `agreeable=1`, `conscientious=1`, `emot_stable=1`, `open_to_exp=1`.
- References: female, introverted, antagonistic, unconscientious, neurotic, closed.

## Critical Rules

1. **Never modify `agents/agents.json`** without discussion — fixed population for the study.
2. **Confirm before any API calls** — they cost real money.
3. **`data/` is committed to GitHub** — do NOT delete data files.
4. **Never modify `cost_estimates.xlsx`** — read-only master workbook.
5. **The .env file** lives at the repo root — gitignored, never commit it.
6. **Paper figure numbering**: paper.html uses paper-order figure numbers 1–21. Internal cross-refs in §4/§5 are consistent.
7. **Don't make substantive Paper 3 prose changes until advisor feedback arrives.** Cosmetic/format fixes are fine.

## Dissertation Context

- Paper 1: Original GABM epidemic (GPT-3.5) — published arXiv:2307.04986.
- Paper 2: Prompt sensitivity analysis — VT preliminary exam (unpublished).
- Paper 3 (this): Cross-provider LLM probe, 21 configs — V1 submitted to advisor May 11, 2026.

When all three are revised and the dissertation framing is written, they get assembled in `Dissertation Draft/` — see that folder's CLAUDE.md.
