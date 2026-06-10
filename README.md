# LLM Sensitivity of Generative Agents

**Paper 3** of the PhD dissertation *Epidemic Modeling with Generative Agents*
by Ross Williams (Virginia Tech) — *LLM Sensitivity of Generative Agents:
Evidence from an Epidemic Model.*

### 📄 Read the paper / explore the figures → **https://rossfw.github.io/GABM-Mobility-Curve/**

A cross-provider probe study: do different LLMs, used as the "brain" of a
generative agent, produce different behavior in the same epidemic model? We
freeze a population of **100 agents** and ask each one — across **40 infection
levels × 5 repetitions × 21 LLM configurations** (Anthropic, OpenAI, Gemini) —
whether it would stay home. That's **420,000 responses**, analyzed as mobility
curves, persona effects, and response content. The finding: **LLM choice is
itself a parameterization of agent behavior.**

## What's here

```
probe_mobility.py        Main probe loop (one-shot prompt per agent × level × rep)
providers/               Vendored LLM provider layer (Anthropic / OpenAI / Gemini)
combine_data.py          Per-config CSVs → viz/data/real/all_macro.csv
agents/                  100 frozen personas (seed=42) + generator
analysis/                Regression + NLP analysis (R + Python)
viz/
  paper.html             The paper document (rendered to the live site)
  analytics.html         Interactive dashboard (all figures, by tab)
  data/real/             Probe results + 21 precomputed regression JSONs
docs/                    Roadmap, setup, model card, methodology, stats guide
```

## Run it

The repo is **self-contained** (provider layer vendored — no sibling repos needed):

```bash
python3 -m venv venv && source venv/bin/activate
pip install -r requirements.txt
# Put API keys in a root .env (gitignored): ANTHROPIC_API_KEY=…, OPENAI_API_KEY=…, GOOGLE_API_KEY=…
python probe_mobility.py --dry-run        # plan, no API calls
```

View the paper locally: `cd viz && python3 -m http.server 8000` → `localhost:8000/paper.html`.

## Dissertation context

This is Chapter 4 of the dissertation
([Dissertation-Epidemic-Modeling-Generative-Agents](https://github.com/RossFW/Dissertation-Epidemic-Modeling-Generative-Agents)),
which builds on **Paper 1** (the GABM epidemic model;
[Paper 1](https://github.com/RossFW/Paper1-Epidemic-Generative-Agent-Based-Model),
arXiv:2307.04986) and **Paper 2** (prompt sensitivity;
[Paper 2](https://github.com/RossFW/Paper2-Prompt-Sensitivity-of-Generative-Agents)).
