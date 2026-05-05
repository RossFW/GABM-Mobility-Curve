# Paper 3 Roadmap — GABM Mobility Curve

*Last updated: April 28, 2026*

## One-Line Summary

Cross-sectional probe: 100 frozen agents × 40 infection levels × 21 LLM configs × 5 reps =
**420,000 responses**. Compares mobility behavior across LLM providers, sizes,
generations, reasoning levels, and training-data eras.

---

## Where We Are (April 2026)

The infrastructure, data collection, analysis, and dashboard are all complete.
**Phase 5 — paper writing — is the active phase.** Methods (§4) is drafted in
`viz/paper.html`. Results (§5) is scaffolded in paper order with per-RQ bullets that
remain TBD until Key Findings are filled in. The next concrete step is walking through
RQ1 → RQ16 to commit Key Findings.

### What's Done

- Probe design, provider layer, full data collection (420K responses, 0 format errors).
- All three logistic-regression specifications fit per config (fixed-effects,
  random-effects, random-effects with mention flags); diagnostics in Appendix C.
- All NLP analyses done (trait mentions with yes/no/diff splits; concept categories;
  verbosity; rep agreement; Jaccard; persona-similarity 5/5-unanimity rewrite).
- Dashboard polished across 5 tabs (RQ, Mobility, Persona, Response, Appendix) with
  caption / terminology cleanup pass complete.
- Paper outline scaffold (`viz/paper.html`) with Methods (§4) drafted.
- Figure 2 (sample demographics) shares the dashboard's `renderFig21Demographics()`
  so edits to either side propagate.

### What's Next (Phase 5 Pipeline)

1. **Key Findings, RQ1 → RQ16.** Walk through each RQ; commit a 1–2 sentence finding to
   the Research Questions tab table. Discuss screenshots + regression numbers when
   needed.
2. **Expand `paper.html` §5.x.** Once a Key Finding is settled, expand the matching
   bullet in §5 into a paragraph of paper prose.
3. **Lock paper figure numbering.** Currently §5 references dashboard numbers
   (Figs 8, 9 for RQ1, etc.). When Results prose is drafted, renumber as paper figures.
4. **Discussion (§6).** Once headline findings are clear, draft Discussion bullets
   into prose. Anchor on: provider differences dominate; reasoning is a small
   modulator; persona individuation varies dramatically; cross-model consistency.
5. **Conclusion + Abstract.** Last to write.
6. **References.** Grow `paper.html` §9 as citations are added inline.

---

## Phase Pipeline

### Phase 1 — Infrastructure ✅ COMPLETE
Probe design, provider layer, validation. Details in `docs/STATUS.md` Phase 1.

### Phase 2 — Data Collection ✅ COMPLETE
21 configs × 20,000 responses = 420,000 rows.
Output: `data/{provider}_{model}_{reasoning}/probe_results_{macro,micro}.csv`.

### Phase 3 — Analysis ✅ COMPLETE
- Three logistic-regression specifications per config (R/lme4).
- All NLP analyses (trait mentions with yes/no/diff splits; concept categories;
  verbosity; rep agreement; Jaccard; embedding-based persona similarity).
- Per-figure OLS comparisons for Theme A.

### Phase 4 — Dashboard ✅ COMPLETE
- 5 tabs: Research Questions, Mobility Curves, Persona Analysis, Response Analysis, Appendix.
- Appendix structure: A (mobility OLS) / B.1 (base logits) / B.2 (mention-flag logits) / C (diagnostics) / D (statistical reference walkthroughs).
- Caption / terminology cleanup pass complete.

### Phase 5 — Paper Writing 🔄 ACTIVE
- Live in `viz/paper.html` (top-level page reachable from site nav: *Introduction /
  Methodology / Simulation / Analytics / Paper*).
- §1–§3, §6–§7 are placeholders.
- §4 Methods drafted in journal-paper prose.
- §5 Results scaffolded; Key Findings TBD.
- §8 Appendices map to dashboard appendices.
- §9 References uses numeric `[N]` format; starter entries in place.

---

## The Research Figures (current dashboard layout)

| Tab | Figures | Topic |
|-----|---------|-------|
| Mobility Curves | 1–7 | Reasoning, size, evolution comparisons |
| Mobility Curves | 8–9 | Cross-provider flagship + variation |
| Mobility Curves | 10–14 | Knowledge-cutoff comparisons |
| Mobility Curves | 15–18 | Release-date comparisons |
| Mobility Curves | 19–21 | Agent decision heatmap, rep agreement, comparison tool |
| Persona Analysis | 22–24 | Sample demographics, regression, ranking accuracy |
| Persona Analysis | 25–27 | Decision anatomy, log-odds landscape, cross-model trait effects |
| Persona Analysis | 28–30 | Per-trait power ratio, importance ranking, agent consistency |
| Response Analysis | 31 | Agent spotlight |
| Response Analysis | 32–34 | Trait mentions, mention-flag regression, mention-effects forest |
| Response Analysis | 35–36 | Verbosity by model, verbosity × infection level |
| Response Analysis | 37 | Decision themes (concept frequency) |
| Response Analysis | 38–40 | Rep-to-rep agreement, response text similarity, persona individuation |

---

## 16 Research Questions (5 themes)

See dashboard Research Questions tab for the live table. Summary:

- **Theme A — Comparing LLM Mobility Curves** (RQ1–6): Does provider / reasoning level / size /
  evolution / provider / knowledge cutoff / release date affect mobility curves?
- **Theme B — Trait Interpretation** (RQ7–8): How do agent traits affect mobility
  curves? Are personality effects larger than infection effects?
- **Theme C — Cross-Model Consistency** (RQ9–10): Do LLMs agree on which predictors
  matter? Do they agree on which agents are most cautious?
- **Theme D — Reasoning Text Analysis** (RQ11–13): How do trait mentions shape the
  decision? Which concept categories dominate stay-home vs. go-out reasoning? How
  does reasoning length vary across LLMs and infection levels?
- **Theme E — Response Heterogeneity** (RQ14–16): Do models give the same decision
  across repetitions? Same reasoning text? Is reasoning persona-specific or templated?

---

## Connection to Papers 1 & 2

- **Paper 1** (arXiv:2307.04986): GPT-3.5 only, full epidemic simulation — established the GABM method.
- **Paper 2**: Prompt sensitivity analysis — showed LLM behavior is sensitive to prompt design.
- **Paper 3 (this)**: Controlled probe across 21 LLM configs — same agents, same prompts,
  same infection levels; only the LLM changes. Primary claims target between-LLM
  variation in mobility behavior, persona interpretation, cross-model consistency,
  and reasoning-text content.

---

## Repo Structure

```
GABM mobility curve/                  ← THIS REPO (Paper 3)
├── probe_mobility.py                 ← main data collection script
├── combine_data.py                   ← per-config CSVs → viz/data/real/all_macro.csv
├── validate_data.py                  ← checks all 21 configs for completeness
├── agents/
│   ├── agents.json                   ← frozen agent pool (DO NOT MODIFY)
│   └── generate_agents.py            ← seed-42 generator (50/50 Big Five, age weights from census.gov/popclock)
├── analysis/
│   ├── compute_regressions.R         ← all three logit specifications
│   ├── compute_trait_mentions.py     ← trait/context mention rates (with yes/no/diff splits)
│   ├── compute_decision_drivers.py   ← Fig 37 concept-category mentions
│   ├── compute_verbosity_stats.py    ← Figs 35/36 token distributions
│   ├── compute_response_text_similarity.py  ← Figs 38/39 rep agreement + Jaccard
│   └── compute_persona_similarity.py ← Fig 40 5/5-unanimity within-vs-across cosine
├── data/
│   ├── {provider}_{model}_{reasoning}/   ← per-config probe results
│   │   ├── probe_results_macro.csv
│   │   └── probe_results_micro.csv
│   └── metadata/models.csv           ← alias, pinned version, dates, pricing
├── viz/                              ← interactive site
│   ├── index.html                    ← Introduction
│   ├── methodology.html              ← Methodology page
│   ├── town.html                     ← Phaser 3 town view (Simulation)
│   ├── analytics.html                ← Dashboard (Research Questions / Mobility / Persona / Response / Appendix)
│   ├── paper.html                    ← Paper outline (Methods drafted; Results scaffolded)
│   ├── nav.js                        ← Top-level page nav
│   ├── analytics-shared.js           ← Shared globals + utilities
│   ├── analytics-curves.js           ← Mobility Curves tab
│   ├── analytics-cohort.js           ← Persona Analysis tab (largest file)
│   ├── analytics-responses.js        ← Response Analysis tab
│   ├── analytics-author.js           ← Statistical-reference renderers (Appendix D)
│   ├── analytics-init.js             ← Tab switching + lazy-render entry points
│   ├── config.js                     ← 21 models, colors, infection levels
│   └── data/real/                    ← real probe data (populated by combine_data.py)
├── site/coverage.html                ← model coverage matrix
└── docs/
    ├── ROADMAP.md                    ← this file
    ├── STATUS.md                     ← phase tracker
    ├── MODEL_CARD.md                 ← all 21 configs with versions, dates, pricing
    ├── SETUP.md                      ← new machine setup instructions
    ├── SAMPLING.md                   ← 40-level design justification
    └── DESIGN.md                     ← scientific rationale for probe design

../GABM-Epidemic/                     ← provider infrastructure (NOT Paper 3)
├── providers/                        ← imported by probe_mobility.py
├── venv/                             ← shared virtual environment
└── .env                              ← API keys (copy manually, never commit)
```
