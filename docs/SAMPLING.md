# Infection Level Sampling — Justification

## Prior Work Context

| Paper | Pop | Model | Infection range observed |
|-------|-----|-------|--------------------------|
| Paper 1 (GABM original) | 100 agents | GPT-3.5 | 0–73% (runaway epidemic, minimal behavioral response) |
| Paper 2 (prompt sensitivity) | 100 agents | GPT-3.5 | Similar epidemic range, right-skewed, 58% of days at 0% |
| **Paper 3 (this study)** | 100 agents | Multi-provider probe | 0–3.5% (ecologically valid) + 4–7% (saturation) |

Papers 1 & 2 used full simulation runs where agents did not effectively suppress
transmission. The unconstrained epidemic produced high infection rates (up to 73%) that
are ecologically unrealistic when agents have behavioral feedback.

---

## Primary Justification: Round #2 Full Feedback Data

Source: `_archive/GABM Epidemic Round #2/Data Raw/Full Feedback/` — 10 runs, 1000 agents each.
This is the most analogous condition to our probe design: agents received full infection
rate information and made behavioral decisions accordingly.

| Range | Days | % of total |
|-------|------|------------|
| 0–0.5% | 684 | 68.7% |
| 0.5–1.0% | 218 | 21.9% |
| 1.0–1.5% | 56 | 5.6% |
| 1.5–2.0% | 28 | 2.8% |
| 2.0–3.5% | 9 | 0.9% |
| **Above 3.5%** | **0** | **0.0%** |

**Max observed: 3.40%** across all 10 runs. Zero days exceeded 3.5%.

When agents have behavioral feedback (the condition most analogous to our probe),
infection is suppressed to a 0–3.5% range. This is the ecologically valid range.

---

## The 40 Chosen Levels

```
0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9,
2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9,
3.0, 3.1, 3.2, 3.3, 3.4, 3.5,
4.0, 5.0, 6.0, 7.0
```

- **0–3.5% at 0.1% intervals (36 levels):** Dense coverage of the ecologically valid range.
  Resolution matches the 1000-agent simulation (1 person = 0.1%).
- **4–7% (4 levels):** Sparse extension to characterize where the mobility curve saturates
  (at what infection rate do all agents stay home?). These levels do not occur in Full
  Feedback runs but complete the response function shape for the paper.

**Calls per config:** 100 agents × 5 reps × 40 levels = 20,000
