"""
Pricing lookup and cost calculation for LLM providers.
Prices are per 1M tokens (USD).
"""

from typing import Dict, Tuple

# Pricing data per 1M tokens (USD) - from model_pricing.txt
PRICING: Dict[str, Dict[str, Dict[str, float]]] = {
    "openai": {
        "gpt-5.4": {"input": 2.50, "output": 15.00},
        "gpt-5.3-chat-latest": {"input": 1.75, "output": 14.00},
        "gpt-5.2": {"input": 1.75, "output": 14.00},
        "gpt-5.1": {"input": 1.25, "output": 10.00},
        "gpt-5": {"input": 1.25, "output": 10.00},
        "gpt-5-mini": {"input": 0.25, "output": 2.00},
        "gpt-5-mini-2025-08-07": {"input": 0.25, "output": 2.00},
        "gpt-5-nano": {"input": 0.05, "output": 0.40},
        "gpt-4.1": {"input": 2.00, "output": 8.00},
        "gpt-4o": {"input": 2.50, "output": 10.00},
        "gpt-4": {"input": 30.00, "output": 60.00},
        "gpt-3.5-turbo": {"input": 0.50, "output": 1.50},
        "gpt-3.5-turbo-0301": {"input": 0.50, "output": 1.50},
        "o3": {"input": 2.00, "output": 8.00},
        "o1": {"input": 15.00, "output": 60.00},
    },
    "anthropic": {
        "claude-opus-4-6": {"input": 5.00, "output": 25.00},
        "claude-sonnet-4-6": {"input": 3.00, "output": 15.00},
        "claude-opus-4-5": {"input": 5.00, "output": 25.00},
        "claude-opus-4-1": {"input": 15.00, "output": 75.00},
        "claude-opus-4-0": {"input": 15.00, "output": 75.00},
        "claude-sonnet-4-5": {"input": 3.00, "output": 15.00},
        "claude-sonnet-4-0": {"input": 3.00, "output": 15.00},
        "claude-haiku-4-5": {"input": 1.00, "output": 5.00},
        "claude-3-haiku-20240307": {"input": 0.25, "output": 1.25},
    },
    "gemini": {
        "gemini-3-pro-preview": {"input": 2.00, "output": 12.00},
        "gemini-3-flash-preview": {"input": 0.50, "output": 3.00},
        "gemini-2.5-pro": {"input": 1.25, "output": 10.00},
        "gemini-2.5-flash": {"input": 0.30, "output": 2.50},
        "gemini-2.5-flash-lite": {"input": 0.10, "output": 0.40},
        "gemini-2.0-flash": {"input": 0.10, "output": 0.40},
    }
}


def get_pricing(provider: str, model: str) -> Tuple[float, float]:
    """Get input and output prices per 1M tokens for a model.

    Args:
        provider: Provider name (openai, anthropic, gemini)
        model: Model name

    Returns:
        Tuple of (input_price, output_price) per 1M tokens
    """
    prices = PRICING.get(provider, {}).get(model, {"input": 0, "output": 0})
    return prices["input"], prices["output"]


def calculate_cost(provider: str, model: str, input_tokens: int, output_tokens: int,
                   reasoning_tokens: int = 0) -> float:
    """Calculate cost in USD from token counts.

    Args:
        provider: Provider name (openai, anthropic, gemini)
        model: Model name
        input_tokens: Number of input/prompt tokens
        output_tokens: Number of output/completion tokens
        reasoning_tokens: Number of reasoning/thinking tokens (billed at output rate).
            For Gemini, these are separate from output. For OpenAI/Anthropic,
            reasoning tokens are already included in output_tokens so pass 0.

    Returns:
        Total cost in USD
    """
    input_price, output_price = get_pricing(provider, model)
    input_cost = (input_tokens / 1_000_000) * input_price
    output_cost = ((output_tokens + reasoning_tokens) / 1_000_000) * output_price
    return input_cost + output_cost


def calculate_run_cost(provider: str, model: str, run_stats: dict) -> float:
    """Calculate total cost for a simulation run from run_stats.

    Args:
        provider: Provider name
        model: Model name
        run_stats: Dictionary with total_input_tokens and total_output_tokens

    Returns:
        Total cost in USD
    """
    return calculate_cost(
        provider,
        model,
        run_stats.get("total_input_tokens", 0),
        run_stats.get("total_output_tokens", 0)
    )


def estimate_full_run_cost(
    provider: str,
    model: str,
    avg_input_tokens: float,
    avg_output_tokens: float,
    avg_reasoning_tokens: float = 0,
    num_agents: int = 100,
    num_timesteps: int = 50,
    num_runs: int = 5
) -> dict:
    """Estimate cost for full simulation runs.

    Args:
        provider: Provider name
        model: Model name
        avg_input_tokens: Average input tokens per API call
        avg_output_tokens: Average output tokens per API call
        avg_reasoning_tokens: Average reasoning/thinking tokens per API call
            (billed at output rate, separate from output for Gemini)
        num_agents: Number of agents per simulation
        num_timesteps: Number of timesteps per run
        num_runs: Number of runs to perform

    Returns:
        Dictionary with cost estimates
    """
    calls_per_run = num_agents * num_timesteps
    total_calls = calls_per_run * num_runs

    input_price, output_price = get_pricing(provider, model)

    # Cost per call (reasoning tokens billed at output rate)
    cost_per_call = (
        (avg_input_tokens / 1_000_000) * input_price +
        ((avg_output_tokens + avg_reasoning_tokens) / 1_000_000) * output_price
    )

    return {
        "cost_per_call": cost_per_call,
        "cost_per_run": cost_per_call * calls_per_run,
        "cost_5_runs": cost_per_call * total_calls,
        "total_api_calls_per_run": calls_per_run,
        "total_api_calls_5_runs": total_calls,
    }
