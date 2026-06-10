"""
Factory functions for creating LLM providers.
"""

from typing import Optional, Literal
from .base import LLMProvider, ReasoningLevel
from .openai_provider import OpenAIProvider
from .anthropic_provider import AnthropicProvider
from .gemini_provider import GeminiProvider

SUPPORTED_PROVIDERS = {
    "openai": OpenAIProvider,
    "anthropic": AnthropicProvider,
    "gemini": GeminiProvider,
}

# Default models per provider (good balance of capability and speed)
DEFAULT_MODELS = {
    "openai": "gpt-4o",
    "anthropic": "claude-sonnet-4-5",
    "gemini": "gemini-2.5-flash",
}


def create_provider(
    provider_name: str,
    model: Optional[str] = None,
    max_retries: int = 30,
    retry_delay: float = 0.5,
    reasoning: ReasoningLevel = "off",
) -> LLMProvider:
    """
    Factory function to create the appropriate LLM provider.

    Args:
        provider_name: Name of the provider ('openai', 'anthropic', 'gemini')
        model: Model name (uses provider default if not specified)
        max_retries: Maximum number of retries on failure
        retry_delay: Delay between retries in seconds
        reasoning: Reasoning level - "off", "low", "medium", or "high"

    Returns:
        Configured LLMProvider instance

    Raises:
        ValueError: If provider_name is not supported
    """
    provider_name = provider_name.lower()

    if provider_name not in SUPPORTED_PROVIDERS:
        raise ValueError(
            f"Unsupported provider: '{provider_name}'. "
            f"Supported providers: {list(SUPPORTED_PROVIDERS.keys())}"
        )

    # Use default model if not specified
    if model is None:
        model = DEFAULT_MODELS[provider_name]

    provider_class = SUPPORTED_PROVIDERS[provider_name]
    return provider_class(
        model=model,
        max_retries=max_retries,
        retry_delay=retry_delay,
        reasoning=reasoning,
    )


def list_supported_models(provider_name: Optional[str] = None) -> dict:
    """
    List supported models for one or all providers.

    Args:
        provider_name: Specific provider to list, or None for all

    Returns:
        Dictionary of provider -> list of models
    """
    if provider_name:
        provider_name = provider_name.lower()
        if provider_name not in SUPPORTED_PROVIDERS:
            raise ValueError(f"Unknown provider: {provider_name}")
        return {provider_name: SUPPORTED_PROVIDERS[provider_name].SUPPORTED_MODELS}

    return {
        name: cls.SUPPORTED_MODELS
        for name, cls in SUPPORTED_PROVIDERS.items()
    }


def get_provider_names() -> list:
    """Return list of supported provider names."""
    return list(SUPPORTED_PROVIDERS.keys())


def get_reasoning_models() -> dict:
    """Return models grouped by reasoning capability."""
    result = {
        "required": {},  # Models where reasoning is always on
        "optional": {},  # Models where reasoning can be toggled
        "none": {},      # Models with no reasoning
    }

    for name, cls in SUPPORTED_PROVIDERS.items():
        result["required"][name] = cls.REQUIRED_REASONING_MODELS
        result["optional"][name] = cls.OPTIONAL_REASONING_MODELS
        result["none"][name] = [
            m for m in cls.SUPPORTED_MODELS
            if m not in cls.REQUIRED_REASONING_MODELS
            and m not in cls.OPTIONAL_REASONING_MODELS
        ]

    return result
