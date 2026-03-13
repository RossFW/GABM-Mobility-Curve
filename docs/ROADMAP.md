# Paper 3 Roadmap — GABM Mobility Curve

*Last updated: March 13 2026*

## One-Line Summary

Cross-sectional probe: 100 frozen agents × 40 infection levels × 22 LLM configs =
440,000 API calls. Generates "mobility curves" for cross-provider LLM comparison.

---

## Where We Are (March 2026)

### ✅ Done
- Probe design finalized: 40 levels, 22 configs, 100 agents, 5 reps
- Provider layer complete: Anthropic, OpenAI, Gemini with reasoning budget control
- Gemini migrated to `google-genai` SDK: `thinking_budget=0` for 2.5-flash/lite at off; temp=1 for all thinking models
- Coverage matrix documented: `site/coverage.html`
- GitHub repo live: RossFW/GABM-Mobility-Curve
- Visualization built: `viz/town.html` (Phaser town) + `viz/analytics.html` (research dashboard) with mock data
- Test run validated: `gemini-2.0-flash off` (900 responses, 100% format_valid, $0.06)

### 🔲 Immediate Next: Full Data Collection
Run on command from Ross. Multi-machine recommended:

| Machine | Provider | Configs | Est. time |
|---------|----------|---------|-----------|
| A (this Mac) | Anthropic | 5 | ~5–6h |
| B | Gemini | 6 | ~8–10h |
| C | OpenAI | 11 | ~20–30h |

```bash
# On each machine (after cloning repo and copying .env):
source ../GABM-Epidemic/venv/bin/activate
python probe_mobility.py --provider <name> --resume
```

---

## Phase Pipeline

### Phase 2 — Data Collection (~440K API calls, ~$150–220)
22 configs, one provider per machine. `--resume` is safe — crash-recoverable.
Output: `data/{provider}_{model}_{reasoning}/probe_results_micro.csv` + `probe_results_macro.csv`

### Phase 3 — Combine + Analyze
Write two new scripts:

**`combine_results.py`**
- Reads all 22 config dirs
- Outputs `data/combined/all_micro.csv` (all ~440K rows) and `data/combined/all_macro.csv` (880 rows)

**`analyze_results.py`**
- Reads combined CSVs, generates 5 figures (see below)
- Output: `figures/*.png` (300 DPI) and `figures/*.html` (Plotly interactive)

### Phase 4 — Viz with Real Data
- Replace `viz/data/mock/` contents with real combined data
- Both `town.html` and `analytics.html` load from the same paths — no code changes needed

### Phase 5 — Paper Writing
- Methods: probe design, agent pool, 22 configs, temperature decisions
- Results: 5 figures + statistical model
- Discussion: connect to Papers 1 & 2, implications for LLM-based ABMs

---

## The 5 Research Figures

| # | Figure | Key question |
|---|--------|-------------|
| 1 | All mobility curves (22 models overlaid) | Do different LLMs produce different curves? |
| 2 | Effective mobility rate (`1 - pct_stay_home`) | How does each LLM's curve map to GABM contact rates? |
| 3 | Cross-model agent comparison (same agent, different LLMs) | Does the same agent behave differently across providers? |
| 4 | Rep consistency check (variance across 5 reps) | Which models are non-deterministic at temp=0? |
| 5 | Age/trait regression (OLS per model) | Do older or more neurotic agents stay home more? |

**Figure 2 note:** `effective_contacts = (1 - pct_stay_home/100) × 5` (contact_rate=5 from GABM).
Overlay against Round #2 Full Feedback empirical mobility scatter for validation.

---

## Statistical Approach

- Primary: exponential decay fit `p = a × e^{b × level}` per model (matches Paper 2 methodology)
- Alternative: logistic sigmoid `logit(p) = a + b × level` (more principled for probability)
- Compare fitted parameters across models:
  - `b` (decay rate): sensitivity to infection — larger |b| = stronger behavioral response
  - `a` (intercept): baseline mobility at 0% infection
- Uncertainty: Wilson CI or bootstrap CI (resample 100 agents, 1000× iterations)
- 100 agents gives adequate precision: SE ≈ 5% at p=0.5, detects large LLM differences easily

---

## 4 Research Dimensions (from coverage matrix)

| DIM | Question | Models |
|-----|----------|--------|
| 1 | Cross-provider reasoning sweep | gpt-5.2 vs gemini-3-flash (off/low/med/high) |
| 2 | Reasoning intensity within OpenAI | gpt-5.1+5.2 off→high, o3 required |
| 3 | Generational change (off only, all providers) | gpt-3.5→4o→4.1→5.1→5.2; haiku-3→sonnet-4-0→haiku/sonnet-4-5→opus-4-5; 2.0-flash→2.5-flash→3-flash |
| 4 | Model size within generation (off only) | haiku/sonnet/opus-4-5; 2.5-flash-lite→3-flash |

---

## Connection to Papers 1 & 2

**Paper 1** (arXiv 2307.04986): GPT-3.5 only, full epidemic simulation → established the GABM method.
Agents stayed home when infection rose; epidemic curves were realistic.

**Paper 2**: Prompt sensitivity analysis → showed LLM behavior is sensitive to prompt design.
Raises question: is it also sensitive to which LLM you use?

**Paper 3 (this)**: Controlled probe across 22 LLM configs → answers the question.
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
GABM mobility curve/       ← THIS REPO (Paper 3)
├── probe_mobility.py      ← main data collection script
├── agents/agents.json     ← frozen agent pool (DO NOT MODIFY)
├── data/                  ← gitignored, sync with rsync
├── viz/                   ← interactive visualizations
│   ├── town.html          ← Phaser 3 town view
│   ├── analytics.html     ← research dashboard (5 figures)
│   └── data/mock/         ← synthetic data (replace with real after collection)
├── site/coverage.html     ← model coverage matrix
├── docs/
│   ├── ROADMAP.md         ← this file
│   ├── STATUS.md          ← phase tracker
│   ├── SETUP.md           ← new machine setup instructions
│   ├── SAMPLING.md        ← 40-level design justification
│   └── DESIGN.md          ← scientific rationale for probe design

../GABM-Epidemic/          ← provider infrastructure (NOT Paper 3)
├── providers/             ← imported by probe_mobility.py
├── venv/                  ← shared virtual environment
└── .env                   ← API keys (copy manually, never commit)
```
