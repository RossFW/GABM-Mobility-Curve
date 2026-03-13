# Research Design — GABM Mobility Curve (Paper 3)

## Scientific Claim

> "Different LLMs make different behavioral choices under equivalent perceived risk."

This study measures how 38 LLM configurations respond to community infection
risk signals, holding all other context constant. The dependent variable is the
**mobility curve**: the proportion of agents who choose to stay home as a
function of daily new infection rate.

---

## Why Probe Design (Not Full Simulation)

Paper 3 originally planned full epidemic simulations (100 agents × 50 timesteps).
The probe design was chosen instead for two reasons:

1. **Scientific cleanliness**: In a full simulation, mobility curves are
   confounded by the epidemic's own dynamics — if model A spreads infection
   faster, agents face different infection contexts than model B, making
   behavioral comparison hard. Probes hold the context identical.

2. **Cost efficiency**: 7,500 calls/config vs 25,000, roughly 4× cheaper,
   making it feasible to run all 38 useful configs within budget.

The probe approach is methodologically consistent with Paper 2, which also
asked agents "given that X% were newly infected yesterday, do you stay home?"
as the core decision. The only change: health status is fixed at "healthy and
well" (removing self-health as a confound, since we want to isolate the LLM's
social risk calculus, not its rule-following when sick).

---

## Independent Variables

| Variable       | Values                                  |
|----------------|-----------------------------------------|
| Provider       | OpenAI, Anthropic, Google Gemini        |
| Model          | See USEFUL_CONFIGS in probe_mobility.py |
| Reasoning level| off, low, medium, high, required        |
| Infection level| 15 non-uniform levels, 0–25%            |

Note: Anthropic reasoning configs (low/medium/high) excluded — cost too high
for reasoning models ($300–$800/config at full simulation, still expensive for
probes). This is a limitation to note in the paper.

---

## Dependent Variables

**Primary (macro):**
- `pct_stay_home` per infection level — the mobility curve slope

**Secondary (micro):**
- Individual agent responses (enables analysis of which agent traits predict
  stay-home behavior, and whether individual-level effects replicate Paper 2)
- `reasoning_text` — qualitative content for discussion section

**Both logged** in separate CSVs per config.

---

## Agent Pool

- 100 agents, generated once with fixed seed (42) via `agents/generate_agents.py`
- Stored in `agents/agents.json` — same pool for ALL configs
- Big 5 traits (Paper 1 redone methodology)
- Names from `names_dataset` (top US names, 50/50 male/female)
- Ages 18–65 weighted by 2023 US population distribution

---

## Prompt Template

Based on Paper 1 redone (`Epidemic_GABM_redone/agent.py`) for methodological
continuity with Papers 1 and 2. Key changes from Paper 2:

- Health string: hardcoded to "You feel healthy and well." — removes self-health
  as a confound (agents only respond to community risk signal)
- Infection phrasing: "X.X% of Dewberry Hollow's population were diagnosed with
  new infections yesterday" — identical to Paper 2

See `probe_mobility.py: build_prompt()` for the full template.

---

## Statistical Analysis (planned)

Primary model:
```
pct_stay_home ~ infection_level + model_config + model_config × infection_level
```

The interaction term `model_config × infection_level` is the main finding:
does the *slope* of behavioral response to infection risk differ across LLMs?

Secondary analyses:
- Within-provider: reasoning level effect (OpenAI + Gemini only)
- Within-provider: model tier effect (frontier vs. mid vs. cheap)
- Individual-level: Big 5 trait effects on stay-home probability
- Inter-rater reliability: variance across reps for each (agent, level) pair

---

## Open Questions

- [ ] **Primary DV**: Aggregate mobility curve (macro) vs. individual agent
  responses (micro) as the headline result? Both logged; decision deferred.
- [ ] **Reps per level**: Default 5. Revisit after test run — if reasoning
  model variance is high, may increase to 10.
- [ ] **Regression specification**: OLS on aggregated pct? Logistic on
  individual yes/no? Mixed effects? TBD based on data structure.
- [ ] **Anthropic reasoning**: Excluded due to cost. Worth noting as a
  limitation — cannot compare reasoning effects for Anthropic models.
- [ ] **Viz integration**: One full simulation run (cheap model) to be run
  for the town.html visualization. Separate from the probe study.

---

## Execution Plan

1. Run `agents/generate_agents.py` → freeze `agents.json`
2. Test run: `python probe_mobility.py --test --provider openai --model gpt-3.5-turbo`
3. Review output CSV and cost estimate
4. Run all 38 configs: `python probe_mobility.py --all`
5. Analyze with scripts in `analysis/`
6. Write paper
