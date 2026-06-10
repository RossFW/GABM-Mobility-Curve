"""
Anthropic Claude API provider implementation.
"""

from typing import List, Dict
from .base import LLMProvider
from .usage import UsageStats, CompletionResult


class AnthropicProvider(LLMProvider):
    """Anthropic Claude API provider."""

    PROVIDER_NAME = "anthropic"
    ENV_VAR_NAME = "ANTHROPIC_API_KEY"

    SUPPORTED_MODELS = [
        # Claude 4.5 Family (Optional reasoning)
        "claude-opus-4-5",
        "claude-sonnet-4-5",
        "claude-haiku-4-5",
        # Claude 4.x Family (Optional reasoning)
        "claude-opus-4-1",
        "claude-sonnet-4-0",
        "claude-opus-4-0",
        # Claude 3.x (No reasoning)
        "claude-3-haiku-20240307",
    ]

    # No Claude models have REQUIRED reasoning
    REQUIRED_REASONING_MODELS = []

    # Claude 3.7+ models support optional extended thinking
    OPTIONAL_REASONING_MODELS = [
        "claude-opus-4-5",
        "claude-sonnet-4-5",
        "claude-haiku-4-5",
        "claude-opus-4-1",
        "claude-sonnet-4-0",
        "claude-opus-4-0",
    ]

    # Map reasoning levels to budget_tokens
    REASONING_BUDGETS = {
        "low": 2000,
        "medium": 5000,
        "high": 10000,
    }

    def _initialize_client(self) -> None:
        """Initialize the Anthropic client."""
        try:
            import anthropic
            self.client = anthropic.Anthropic(api_key=self.api_key)
        except ImportError:
            raise ImportError("anthropic package not installed. Run: pip install anthropic")

    def _make_request(self, messages: List[Dict[str, str]], temperature: float) -> CompletionResult:
        """Make request to Anthropic API."""

        # Separate system message from conversation
        system_content = ""
        conversation_messages = []

        for msg in messages:
            if msg["role"] == "system":
                system_content = msg["content"]
            else:
                conversation_messages.append(msg)

        if not conversation_messages:
            conversation_messages = [{"role": "user", "content": system_content}]
            system_content = ""

        # Determine max_tokens based on reasoning
        reasoning_enabled = self.has_optional_reasoning() and self.reasoning != "off"
        max_tokens = 16000 if reasoning_enabled else 1024

        kwargs = {
            "model": self.model,
            "max_tokens": max_tokens,
            "messages": conversation_messages,
        }

        if system_content:
            kwargs["system"] = system_content

        # Enable extended thinking if reasoning is requested
        if reasoning_enabled:
            budget = self.REASONING_BUDGETS.get(self.reasoning, 5000)
            kwargs["thinking"] = {
                "type": "enabled",
                "budget_tokens": budget
            }
            # Extended thinking requires temperature=1
            kwargs["temperature"] = 1
        else:
            kwargs["temperature"] = temperature

        # Use streaming for extended thinking (required for long operations)
        if reasoning_enabled:
            response = self._make_streaming_request(kwargs)
        else:
            response = self.client.messages.create(**kwargs)

        # Extract usage stats
        reasoning_tokens = 0
        text_content = ""

        # Process response content blocks
        for block in response.content:
            if hasattr(block, 'type'):
                if block.type == "thinking":
                    # Count thinking block tokens (Anthropic provides this in usage)
                    # The thinking content itself is in block.thinking
                    pass  # Thinking tokens are tracked in response.usage
                elif block.type == "text":
                    text_content = block.text

        # Anthropic's extended thinking returns thinking tokens in usage
        # Check for thinking usage in the response
        if hasattr(response, 'usage') and response.usage:
            input_tokens = response.usage.input_tokens
            output_tokens = response.usage.output_tokens

            # Check for thinking-specific usage fields if available
            # Anthropic may include these in newer API versions
            if hasattr(response.usage, 'thinking_tokens'):
                reasoning_tokens = response.usage.thinking_tokens
            elif reasoning_enabled:
                # Estimate: thinking tokens are part of output but not in final text
                # This is an approximation
                pass
        else:
            input_tokens = 0
            output_tokens = 0

        usage = UsageStats(
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            reasoning_tokens=reasoning_tokens,
            model=self.model,
            provider=self.PROVIDER_NAME,
        )

        # Fallback if text_content wasn't found via type checking
        if not text_content:
            for block in response.content:
                if hasattr(block, 'text'):
                    text_content = block.text
                    break

        return CompletionResult(
            text=text_content,
            usage=usage,
            raw_response=response,
        )

    def _make_streaming_request(self, kwargs):
        """Make streaming request for extended thinking (handles >10 min operations)."""
        with self.client.messages.stream(**kwargs) as stream:
            response = stream.get_final_message()
        return response
