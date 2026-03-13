# Project Status — GABM Mobility Curve

*Last updated: March 13 2026*

---

## Phase 1: Infrastructure ✅ COMPLETE

### Probe Design
- [x] 22 configs finalized — see `site/coverage.html`
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

### Validation
- [x] Test run: `gemini-2.0-flash off` — 3 levels × 100 agents × 5 reps = 900 responses
  - 100% format_valid, 0 errors, $0.06 cost
  - 8/300 agent-level pairs inconsistent across reps (genuine Gemini stochasticity at temp=0)

### Infrastructure
- [x] GitHub repo: RossFW/GABM-Mobility-Curve (public)
- [x] Visualization: `viz/town.html` (Phaser 3 town) + `viz/analytics.html` (5-figure dashboard)
- [x] Mock data: 21 config dirs in `viz/data/mock/` for viz development
- [x] Coverage matrix: `site/coverage.html` with notes on thinking situation per model

---

## Phase 2: Full Data Collection 🔲 NOT STARTED

Run order (cheapest first):
- [ ] Anthropic: 5 configs (off only) — ~5–6h, Custom Plan 4K RPM
- [ ] Gemini: 6 configs (off + 4×reasoning) — ~8–10h, Paid Tier 3
- [ ] OpenAI: 11 configs (off + ladder + o3) — ~20–30h, Tier 5

```bash
python probe_mobility.py --provider anthropic --resume
```

Multi-machine recommended — one provider per machine (see `docs/SETUP.md`).

---

## Phase 3: Combine + Analyze 🔲 NOT STARTED

- [ ] Write `combine_results.py` — merges all 22 config dirs into unified CSVs
  - `data/combined/all_micro.csv` — all ~440K rows
  - `data/combined/all_macro.csv` — 22 configs × 40 levels = 880 rows
- [ ] Write `analyze_results.py` — generates 5 research figures (see `docs/ROADMAP.md`)
- [ ] Charts to `figures/` as PNG (300 DPI) + HTML (Plotly interactive)

---

## Phase 4: Viz with Real Data 🔲 NOT STARTED

- [ ] Replace `viz/data/mock/` with real combined data
- [ ] Test both viz pages with real data

---

## Phase 5: Paper Writing 🔲 NOT STARTED

- [ ] Methods section
- [ ] Results section (5 figures)
- [ ] Discussion — connect to Papers 1 & 2
- [ ] Submission

---

## Cost Tracking (22 configs × 20K calls)

| Provider | Configs | Calls | Estimated cost | Actual |
|----------|---------|-------|----------------|--------|
| Anthropic | 5 | 100K | ~$50–80 | TBD |
| OpenAI | 11 | 220K | ~$80–120 actual (after 2.5x caching correction) | TBD |
| Gemini | 6 | 120K | ~$10–20 (2.5-flash-lite cheap; 3-flash thinking adds cost) | TBD |
| **Total** | **22** | **440K** | **~$150–220** | TBD |

*OpenAI estimates are 2.5x actual due to automatic prompt caching (upper bound).*
*Gemini thinking tokens billed at output rate — run cost test before full run.*

---

## Key Decisions Made (locked)

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Method | Controlled probe (cross-sectional) | Cleaner comparison, ~4× cheaper than full simulation |
| Infection levels | 40: 0–3.5% at 0.1% + {4,5,6,7}% | Justified by Round #2 Full Feedback data (max 3.4%) |
| Agent pool | 100 fixed agents, seed=42 | Same agents across all 22 configs |
| Reps | 5 per agent-level | Captures stochasticity + format-failure safety |
| Temperature | 0 for non-thinking, 1 for reasoning/thinking models | API requirements + Google recommendations |
| Anthropic reasoning | Off only | Too expensive for full ladder; off suffices for cross-provider comparison |
| Gemini SDK | `google-genai` (Mar 2026) | Thinking budget control; deprecated `google.generativeai` couldn't set budget=0 |
