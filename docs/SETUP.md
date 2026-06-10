# Setup Guide — GABM Mobility Curve Probe

This repo is **self-contained**: the LLM provider abstraction layer is vendored
in `providers/` (Anthropic, OpenAI, Gemini behind a common interface, plus
pricing/cost helpers). No sibling repos required.

## First-time setup on a new machine

```bash
# 1. Clone the repo
git clone https://github.com/RossFW/GABM-Mobility-Curve.git "GABM mobility curve"
cd "GABM mobility curve"

# 2. Create and activate a venv
python3 -m venv venv
source venv/bin/activate

# 3. Install dependencies
pip install -r requirements.txt

# 4. Create a .env file at the repo root (never committed — copy manually)
#    Must contain at least the key(s) for the provider you're running:
#      ANTHROPIC_API_KEY=sk-ant-...
#      OPENAI_API_KEY=sk-...
#      GOOGLE_API_KEY=...

# 5. Verify connectivity (no API calls)
python probe_mobility.py --dry-run
```

## Running the probe

```bash
# Single cheap config — validate output before full run
python probe_mobility.py --test --model gemini-2.0-flash --reasoning off

# Full provider run
python probe_mobility.py --provider gemini
python probe_mobility.py --provider anthropic
python probe_mobility.py --provider openai

# All 21 configs
python probe_mobility.py --all
```

## Pausing and resuming

Ctrl+C stops the run at any point. Data is crash-safe:
- The micro CSV (`probe_results_micro.csv`) is written **incrementally after each
  infection level** — so at most one level's worth of calls is lost on interrupt.
- The macro CSV (`probe_results_macro.csv`) is written only when a config fully
  completes.

To resume after interruption:

```bash
python probe_mobility.py --provider gemini --resume
```

`--resume` checks for the **macro CSV** to decide if a config is done. This means:
- **Fully completed configs** (macro CSV exists) → skipped ✓
- **Partially completed configs** (micro CSV exists, no macro) → re-run from scratch
  (you lose the partial level progress but not completed configs)

**Implication:** If interrupted mid-config, that config restarts from level 0.
The data from completed levels is overwritten. This is safe — just slightly wasteful.
Within-level resumption is not supported.

## Multi-machine strategy

Each machine runs a **different provider** using the same API key:
- Machine A: `python probe_mobility.py --provider anthropic`
- Machine B: `python probe_mobility.py --provider gemini`
- Machine C: `python probe_mobility.py --provider openai`

**Never run the same provider on two machines with the same API key** — both
machines' requests count toward the same rate limit.

After all machines finish, consolidate data with rsync:

```bash
# On Machine A — pull data from B and C
rsync -avz user@machine-b:"path/to/GABM mobility curve/data/" data/
rsync -avz user@machine-c:"path/to/GABM mobility curve/data/" data/
```

Then run `combine_data.py` (see Phase 4 in the plan).

## Rate limits (as of March 2026)

| Provider | Plan | RPM | Default workers |
|----------|------|-----|----------------|
| Anthropic | Custom | 4,000 | 20 |
| OpenAI | Tier 5 | very high | 20 |
| Gemini | Paid tier 3 | 1,000+ | 10 |

Workers are set automatically per provider. Override with `--workers N`.

## Expected run times

| Provider | Configs | Est. wall time |
|----------|---------|---------------|
| Anthropic | 5 | ~5–6h (upgraded from ~33h after Custom Plan) |
| OpenAI | 11 | ~37–42h (o3 and high-reasoning dominate) |
| Gemini | 6 | ~23–25h |
| **Total** | **22** | **~65–73h** |
