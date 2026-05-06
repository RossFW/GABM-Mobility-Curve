# Paper-stats reproducibility scripts

These scripts reproduce every numerical claim cited in the body of `viz/paper.html`,
so reviewers can verify any figure caption, in-text statistic, or per-provider
summary against the underlying data.

## Contents

| Script | What it reproduces | Reads |
|--------|--------------------|-------|
| `section_5_1.py` | All numerical claims in §5.1 (Mobility Curve Results, RQ1–6) | `viz/data/real/all_macro.csv`, `viz/data/metadata/models.csv` |
| `section_5_2.py` | All numerical claims in §5.2 (Persona Results, RQ7–10) | `viz/data/real/regressions/*.json`, `viz/data/real/agent_consistency.json` |

A `section_5_3.py` will be added when §5.3 (Response Results) is drafted.

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
```

Output is plain text, organized by paper subsection. Each printed value
corresponds to a specific claim in the paper prose; values not appearing in
the prose are still computed and shown so reviewers can spot-check.
