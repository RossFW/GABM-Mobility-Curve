# LLM Providers for GABM Epidemic Simulation

This directory contains provider implementations for OpenAI, Anthropic (Claude), and Google (Gemini) models.

## Quick Start

```bash
# Basic usage (uses defaults: openai/gpt-4o, no reasoning)
python main.py

# Specify provider and model
python main.py --provider anthropic --model claude-sonnet-4-5

# Enable reasoning (low/medium/high)
python main.py --provider openai --model gpt-5.2 --reasoning high

# List all supported models
python main.py --list-models
```

## Supported Models

### OpenAI
| Model | Reasoning | Notes |
|-------|-----------|-------|
| gpt-5.2 | Optional | Latest flagship, Aug 2025 cutoff |
| gpt-5.1 | Optional | Oct 2024 cutoff |
| gpt-4.1 | None | Jun 2024 cutoff |
| gpt-4o | None | Oct 2023 cutoff (default) |
| gpt-4 | None | Legacy, Sep 2021 cutoff |
| gpt-3.5-turbo | None | Legacy, Sep 2021 cutoff |
| o3 | **Required** | Advanced reasoning, always on |
| o1 | **Required** | Original reasoning model, always on |

### Anthropic (Claude)
| Model | Reasoning | Notes |
|-------|-----------|-------|
| claude-opus-4-5 | Optional | Most capable, Early 2025 cutoff |
| claude-sonnet-4-5 | Optional | Balanced (default), Apr 2024 cutoff |
| claude-haiku-4-5 | Optional | Fast, Apr 2024 cutoff |
| claude-opus-4-1 | Optional | Previous opus |
| claude-sonnet-4-0 | Optional | Previous sonnet |
| claude-opus-4-0 | Optional | Earlier opus |
| claude-3-haiku-20240307 | None | Legacy haiku |

### Google (Gemini)
| Model | Reasoning | Notes |
|-------|-----------|-------|
| gemini-3-pro-preview | Optional | Preview, Jan 2025 cutoff |
| gemini-3-flash-preview | Optional | Fast preview |
| gemini-2.5-pro | Optional | Flagship |
| gemini-2.5-flash | Optional | Fast (default) |
| gemini-2.5-flash-lite | Optional | Lightweight |
| gemini-2.0-flash | None | Deprecating Mar 2026 |

## Reasoning Levels

Use `--reasoning` to control reasoning behavior:

| Level | Description |
|-------|-------------|
| `off` | No reasoning (default). Uses temperature=0 |
| `low` | Light reasoning |
| `medium` | Moderate reasoning |
| `high` | Maximum reasoning depth |

**Note:** For models with **Required** reasoning (o3, o1), the reasoning level is ignored - they always use full reasoning.

## Examples

```bash
# Run with GPT-5.2 and high reasoning
python main.py --provider openai --model gpt-5.2 --reasoning high --no_days 30

# Run with Claude Sonnet, no reasoning (temperature=0)
python main.py --provider anthropic --model claude-sonnet-4-5 --no_days 30

# Run with Claude Opus, medium reasoning
python main.py --provider anthropic --model claude-opus-4-5 --reasoning medium --no_days 30

# Run with o3 (reasoning always on)
python main.py --provider openai --model o3 --no_days 30

# Run with Gemini 2.5 Flash, high reasoning
python main.py --provider gemini --model gemini-2.5-flash --reasoning high --no_days 30

# Multiple runs for comparison
python main.py --provider openai --model gpt-4o --no_of_runs 5
```

## Environment Variables

Create a `.env` file in the project root with your API keys:

```
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_API_KEY=AIza...
```

## Model Combinations

See `model_combinations.txt` for a complete list of all 62 possible model+reasoning combinations.

## Architecture

```
providers/
├── __init__.py          # Package exports
├── base.py              # Abstract base class with reasoning support
├── factory.py           # Factory functions for creating providers
├── openai_provider.py   # OpenAI implementation
├── anthropic_provider.py # Anthropic implementation
├── gemini_provider.py   # Gemini implementation
├── model_combinations.txt # All valid combinations
└── README.md            # This file
```

## Programmatic Usage

```python
from providers import create_provider

# Create provider with reasoning
provider = create_provider(
    provider_name="anthropic",
    model="claude-sonnet-4-5",
    reasoning="high"  # "off", "low", "medium", "high"
)

# Get completion
response = provider.get_completion(
    messages=[{"role": "user", "content": "Hello!"}],
    temperature=0  # Ignored if reasoning is enabled
)
```
