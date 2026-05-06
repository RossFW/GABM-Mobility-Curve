# Paper-stats reproducibility scripts

These scripts reproduce every numerical claim cited in the body of `viz/paper.html`,
so reviewers can verify any figure caption, in-text statistic, or per-provider
summary against the underlying data.

## Contents

| Script | What it reproduces | Reads |
|--------|--------------------|-------|
| `section_5_1.py` | All numerical claims in §5.1 (Mobility Curve Results, RQ1–6) | `viz/data/real/all_macro.csv`, `viz/data/metadata/models.csv` |
| `section_5_2.py` | All numerical claims in §5.2 (Persona Results, RQ7–10) | `viz/data/real/regressions/*.json`, `viz/data/real/agent_consistency.json` |
| `section_5_3.py` | All numerical claims in §5.3 (Response Results, RQ11–13) | `viz/data/real/trait_mentions.json`, `viz/data/real/regressions/*.json`, `viz/data/real/decision_drivers.json`, `viz/data/real/response_persona_similarity.json` |
| `cosine_examples.py` | Generates `cosine_examples.json` (three reference response pairs from Claude Opus 4.5 at known cosine similarities) used by Figure 20 in §5.3.3 | `viz/data/real/anthropic_claude-opus-4-5_off/response_embeddings.npz`, `viz/data/real/anthropic_claude-opus-4-5_off/probe_results_micro.csv` |

## How they relate to the rest of `analysis/`

The other `compute_*.py` and `compute_*.R` scripts in `analysis/` produce the
data files that the visualization layer (`viz/`) consumes. The scripts in this
directory **do not produce data files**; they compute summary statistics from
the existing data files and print a verification report to stdout.

Think of `compute_*` scripts as the data pipeline and `paper_stats/section_*.py`
as the reproducibility audit layer that sits on top.

## Running

From the project root (`GABM mobility curve/`):

```bash
python analysis/paper_stats/section_5_1.py
python analysis/paper_stats/section_5_2.py
python analysis/paper_stats/section_5_3.py
python analysis/paper_stats/cosine_examples.py   # writes viz/data/real/cosine_examples.json
```

Output is plain text, organized by paper subsection. Each printed value
corresponds to a specific claim in the paper prose; values not appearing in
the prose are still computed and shown so reviewers can spot-check.
