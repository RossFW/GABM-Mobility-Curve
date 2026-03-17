# Model Card — Paper 3 Probe Study

All 21 model configurations used in the cross-provider LLM probe study.
Data collected March 2026. Alias → pinned version mappings verified against
official provider documentation and confirmed via screenshots.

---

## Anthropic (5 configurations)

| Alias passed to API       | Pinned Version ID                  | Reasoning |
|---------------------------|------------------------------------|-----------|
| `claude-opus-4-5`         | `claude-opus-4-5-20251101`         | off       |
| `claude-sonnet-4-5`       | `claude-sonnet-4-5-20250929`       | off       |
| `claude-haiku-4-5`        | `claude-haiku-4-5-20251001`        | off       |
| `claude-sonnet-4-0`       | `claude-sonnet-4-20250514`         | off       |
| `claude-3-haiku-20240307` | `claude-3-haiku-20240307`          | off       |

> Note: `claude-3-haiku-20240307` is already a pinned dated ID — no alias.
> `claude-sonnet-4-0` alias drops the trailing zero in the underlying snapshot ID.

---

## OpenAI (10 configurations — 6 model IDs × reasoning levels)

| Alias passed to API | Pinned Version ID        | Reasoning          |
|---------------------|--------------------------|--------------------|
| `gpt-5.2`           | `gpt-5.2-2025-12-11`     | off, low, med, high|
| `gpt-5.1`           | `gpt-5.1-2025-11-13`     | off                |
| `gpt-4.1`           | `gpt-4.1-2025-04-14`     | off                |
| `gpt-4o`            | `gpt-4o-2024-11-20`      | off                |
| `gpt-3.5-turbo`     | `gpt-3.5-turbo-0125`     | off                |
| `o3`                | `o3-2025-04-16`          | required           |

> Note: OpenAI reasoning levels (low/medium/high) are passed as a separate
> `reasoning_effort` parameter — the underlying model ID is the same for all
> four gpt-5.2 configurations.

---

## Gemini (7 configurations — 4 model IDs × reasoning levels)

| Alias passed to API        | Pinned Version ID           | Reasoning          |
|----------------------------|-----------------------------|--------------------|
| `gemini-3-flash-preview`   | `gemini-3-flash-preview`    | off, low, med, high|
| `gemini-2.5-flash`         | `gemini-2.5-flash`          | off                |
| `gemini-2.5-flash-lite`    | `gemini-2.5-flash-lite`     | off                |
| `gemini-2.0-flash`         | `gemini-2.0-flash-001`      | off                |

> Note: Gemini 2.5-generation models do not use numeric version suffixes —
> the stable alias string is itself the canonical identifier.
> Gemini 2.0 Flash alias resolves to the `-001` pinned version.
> Reasoning levels passed via `thinking_budget` parameter (google-genai SDK).

---

## Summary

| Provider  | Configs | Model IDs | Reasoning variants |
|-----------|---------|-----------|-------------------|
| Anthropic | 5       | 5         | off only          |
| OpenAI    | 10      | 6         | off/low/med/high/required |
| Gemini    | 7       | 4         | off/low/med/high  |
| **Total** | **21**  | **15**    |                   |

All data: 100 agents × 5 repetitions × 40 infection levels = 20,000 rows per configuration.
Grand total: 420,000 rows across all 21 configurations.
