"""
Google Gemini API provider implementation.
Uses google-genai SDK (replacement for deprecated google-generativeai).
"""

from typing import List, Dict
from .base import LLMProvider
from .usage import UsageStats, CompletionResult


class GeminiProvider(LLMProvider):
    """Google Gemini API provider."""

    PROVIDER_NAME = "gemini"
    ENV_VAR_NAME = "GOOGLE_API_KEY"

    SUPPORTED_MODELS = [
        # Gemini 3 Preview (minimum thinking = "minimal", cannot fully disable)
        "gemini-3-pro-preview",
        "gemini-3-flash-preview",
        # Gemini 2.5 (optional thinking: budget=0 disables for flash/lite, not pro)
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
        # Gemini 2.0 (no thinking at all)
        "gemini-2.0-flash",
    ]

    REQUIRED_REASONING_MODELS = []

    OPTIONAL_REASONING_MODELS = [
        "gemini-3-pro-preview",
        "gemini-3-flash-preview",
        "gemini-2.5-pro",
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
    ]

    # Models that always think internally even at reasoning="off".
    # gemini-3.x: "off" maps to minimum "minimal" (not true zero).
    # gemini-2.5-pro: thinking cannot be disabled at all.
    ALWAYS_THINKS = {
        "gemini-3-pro-preview",
        "gemini-3-flash-preview",
        "gemini-2.5-pro",
    }

    # Models where thinking_budget=0 truly disables thinking.
    CAN_DISABLE_THINKING = {
        "gemini-2.5-flash",
        "gemini-2.5-flash-lite",
    }

    # Thinking token budget by reasoning level.
    # For ALWAYS_THINKS models, "off" sends budget=0 but API enforces its minimum.
    # For CAN_DISABLE_THINKING models, "off" genuinely disables thinking.
    THINKING_BUDGETS = {
        "off":      0,
        "low":   1024,
        "medium": 8192,
        "high":  24576,
    }

    def _initialize_client(self) -> None:
        """Initialize the Google GenAI client."""
        try:
            from google import genai
            from google.genai import types as genai_types
            self.client = genai.Client(
                api_key=self.api_key,
                http_options=genai_types.HttpOptions(timeout=120_000),  # 120s per call
            )
            self.genai_types = genai_types
        except ImportError:
            raise ImportError(
                "google-genai package not installed. "
                "Run: pip install google-genai"
            )

    def _make_request(self, messages: List[Dict[str, str]], temperature: float) -> CompletionResult:
        """Make request to Google Gemini API."""

        # Combine messages into prompt
        prompt_parts = []
        for msg in messages:
            role = msg["role"]
            content = msg["content"]
            if role == "system":
                prompt_parts.append(f"Instructions: {content}")
            elif role == "user":
                prompt_parts.append(content)
            elif role == "assistant":
                prompt_parts.append(f"Previous response: {content}")

        combined_prompt = "\n\n".join(prompt_parts)

        types = self.genai_types
        is_thinking_model = (
            self.model in self.ALWAYS_THINKS or
            self.model in self.CAN_DISABLE_THINKING
        )

        if is_thinking_model:
            budget = self.THINKING_BUDGETS.get(self.reasoning, 0)
            thinking_config = types.ThinkingConfig(thinking_budget=budget)
            # Use temp=0 only if thinking is genuinely disabled (2.5-flash/lite at off).
            # All other thinking configs require temp=1 per Google docs.
            if budget == 0 and self.model in self.CAN_DISABLE_THINKING:
                use_temperature = temperature
            else:
                use_temperature = 1.0
        else:
            thinking_config = None
            use_temperature = temperature

        config_kwargs = {"temperature": use_temperature}
        if thinking_config is not None:
            config_kwargs["thinking_config"] = thinking_config

        config = types.GenerateContentConfig(**config_kwargs)

        response = self.client.models.generate_content(
            model=self.model,
            contents=combined_prompt,
            config=config,
        )

        # Extract usage stats
        input_tokens = 0
        output_tokens = 0
        reasoning_tokens = 0

        if hasattr(response, 'usage_metadata') and response.usage_metadata:
            input_tokens = getattr(response.usage_metadata, 'prompt_token_count', 0) or 0
            output_tokens = getattr(response.usage_metadata, 'candidates_token_count', 0) or 0
            # New SDK exposes thoughts_token_count directly
            reasoning_tokens = getattr(response.usage_metadata, 'thoughts_token_count', 0) or 0
            # Fallback: derive from total if thoughts_token_count unavailable
            if reasoning_tokens == 0:
                total_tokens = getattr(response.usage_metadata, 'total_token_count', 0) or 0
                if total_tokens > input_tokens + output_tokens:
                    reasoning_tokens = total_tokens - input_tokens - output_tokens

        usage = UsageStats(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            reasoning_tokens=reasoning_tokens,
            model=self.model,
            provider=self.PROVIDER_NAME,
        )

        return CompletionResult(
            text=response.text,
            usage=usage,
            raw_response=response,
        )
