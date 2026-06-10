"""
OpenAI API provider implementation.
"""

from typing import List, Dict
from .base import LLMProvider
from .usage import UsageStats, CompletionResult


class OpenAIProvider(LLMProvider):
    """OpenAI API provider."""

    PROVIDER_NAME = "openai"
    ENV_VAR_NAME = "OPENAI_API_KEY"

    SUPPORTED_MODELS = [
        # GPT-5 Series (Optional reasoning via reasoning_effort)
        "gpt-5.2",
        "gpt-5.1",
        # GPT-4 Series (No reasoning)
        "gpt-4.1",
        "gpt-4o",
        "gpt-4",
        # Legacy (No reasoning)
        "gpt-3.5-turbo",
        "gpt-3.5-turbo-0301",
        # O-Series (Required reasoning)
        "o3",
        "o1",
    ]

    # O-series models ALWAYS reason - cannot disable
    REQUIRED_REASONING_MODELS = ["o3", "o1"]

    # GPT-5.x models support optional reasoning via reasoning_effort param
    OPTIONAL_REASONING_MODELS = ["gpt-5.2", "gpt-5.1"]

    def _initialize_client(self) -> None:
        """Initialize the OpenAI client."""
        try:
            from openai import OpenAI
            self.client = OpenAI(api_key=self.api_key)
        except ImportError:
            raise ImportError("openai package not installed. Run: pip install openai>=1.0.0")

    def _make_request(self, messages: List[Dict[str, str]], temperature: float) -> CompletionResult:
        """Make request to OpenAI API."""

        kwargs = {
            "model": self.model,
            "messages": messages,
        }

        # Handle o-series models (required reasoning, no temperature)
        if self.has_required_reasoning():
            # O-series: convert system messages to user messages
            converted = []
            for msg in messages:
                if msg["role"] == "system":
                    converted.append({"role": "user", "content": msg["content"]})
                else:
                    converted.append(msg)
            kwargs["messages"] = converted
            # No temperature for o-series

        # Handle GPT-5.x with optional reasoning
        elif self.has_optional_reasoning():
            if self.reasoning != "off":
                # Enable reasoning via reasoning_effort parameter
                kwargs["reasoning_effort"] = self.reasoning  # "low", "medium", or "high"
                # When reasoning is enabled, temperature might be restricted
            else:
                kwargs["temperature"] = temperature

        # Standard models (GPT-4.x, GPT-3.5)
        else:
            kwargs["temperature"] = temperature

        response = self.client.chat.completions.create(**kwargs)

        # Extract usage stats
        usage = UsageStats(
            input_tokens=response.usage.prompt_tokens if response.usage else 0,
            output_tokens=response.usage.completion_tokens if response.usage else 0,
            total_tokens=response.usage.total_tokens if response.usage else 0,
            # Note: OpenAI doesn't expose reasoning tokens publicly for o-series
            reasoning_tokens=0,
            model=self.model,
            provider=self.PROVIDER_NAME,
        )

        return CompletionResult(
            text=response.choices[0].message.content,
            usage=usage,
            raw_response=response,
        )
