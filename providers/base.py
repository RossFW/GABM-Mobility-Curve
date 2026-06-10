"""
Abstract base class for LLM providers.
Implements the Strategy pattern for multi-provider support.
"""

from abc import ABC, abstractmethod
from typing import List, Dict, Optional, Literal
import os
import time
import logging

from .usage import UsageStats, CompletionResult

logger = logging.getLogger(__name__)

# Reasoning effort levels for models that support it
ReasoningLevel = Literal["off", "low", "medium", "high"]


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    PROVIDER_NAME: str = ""
    ENV_VAR_NAME: str = ""
    SUPPORTED_MODELS: List[str] = []

    # Models where reasoning is REQUIRED (cannot disable)
    REQUIRED_REASONING_MODELS: List[str] = []

    # Models where reasoning is OPTIONAL (can enable/disable)
    OPTIONAL_REASONING_MODELS: List[str] = []

    def __init__(
        self,
        model: str,
        max_retries: int = 30,
        retry_delay: float = 0.5,
        reasoning: ReasoningLevel = "off",
    ):
        """
        Initialize the LLM provider.

        Args:
            model: The model identifier to use
            max_retries: Maximum number of retries on failure
            retry_delay: Delay between retries in seconds
            reasoning: Reasoning level - "off", "low", "medium", or "high"
        """
        self.model = model
        self.max_retries = max_retries
        self.retry_delay = retry_delay
        self.reasoning = reasoning
        self.api_key = self._get_api_key()
        self._validate_model()
        self._initialize_client()

    def _get_api_key(self) -> str:
        """Get API key from environment variable."""
        api_key = os.environ.get(self.ENV_VAR_NAME)
        if not api_key:
            raise ValueError(
                f"API key not found. Set {self.ENV_VAR_NAME} environment variable."
            )
        return api_key

    def _validate_model(self) -> None:
        """Validate that the model is supported."""
        if self.SUPPORTED_MODELS and self.model not in self.SUPPORTED_MODELS:
            logger.warning(
                f"Model '{self.model}' not in known supported models for {self.PROVIDER_NAME}. "
                f"Proceeding anyway - you may have access to newer models."
            )

    @abstractmethod
    def _initialize_client(self) -> None:
        """Initialize the provider-specific client."""
        pass

    @abstractmethod
    def _make_request(self, messages: List[Dict[str, str]], temperature: float) -> CompletionResult:
        """Make the actual API request. To be implemented by subclasses.

        Returns:
            CompletionResult containing text and usage stats.
        """
        pass

    def has_required_reasoning(self) -> bool:
        """Check if this model ALWAYS uses reasoning (cannot disable)."""
        return self.model in self.REQUIRED_REASONING_MODELS

    def has_optional_reasoning(self) -> bool:
        """Check if this model supports optional reasoning."""
        return self.model in self.OPTIONAL_REASONING_MODELS

    def is_reasoning_enabled(self) -> bool:
        """Check if reasoning is currently enabled for this request."""
        if self.has_required_reasoning():
            return True
        if self.has_optional_reasoning() and self.reasoning != "off":
            return True
        return False

    def get_completion(self, messages: List[Dict[str, str]], temperature: float = 0) -> CompletionResult:
        """
        Get completion from the LLM with retry logic.

        Args:
            messages: List of message dicts with 'role' and 'content' keys
            temperature: Sampling temperature (may be overridden for reasoning models)

        Returns:
            CompletionResult containing text and usage stats
        """
        for retry in range(self.max_retries):
            try:
                result = self._make_request(messages, temperature)
                # Ensure provider and model are set in usage stats
                result.usage.provider = self.PROVIDER_NAME
                result.usage.model = self.model
                return result
            except Exception as e:
                err_str = str(e)
                is_rate_limit = (
                    "429" in err_str or
                    "rate limit" in err_str.lower() or
                    "too many requests" in err_str.lower() or
                    "quota" in err_str.lower()
                )
                is_fatal = any(code in err_str for code in ("401", "403"))

                if is_fatal:
                    logger.error(f"Fatal API error (auth/permissions): {e}")
                    raise  # Don't retry auth errors

                if is_rate_limit:
                    # Exponential backoff: 5s, 10s, 20s, 40s, 60s (capped)
                    wait = min(60.0, 5.0 * (2 ** retry))
                    logger.warning(f"Rate limited. Waiting {wait:.0f}s before retry {retry + 1}/{self.max_retries}...")
                    print(f"  ⏳ Rate limited. Waiting {wait:.0f}s...")
                    time.sleep(wait)
                else:
                    logger.warning(f"Error: {e}\nRetrying ({retry + 1}/{self.max_retries})...")
                    print(f"Error: {e}\nRetrying ({retry + 1}/{self.max_retries})...")
                    if retry < self.max_retries - 1:
                        time.sleep(self.retry_delay)

        raise RuntimeError(f"Failed after {self.max_retries} retries")

    def get_provider_model_slug(self) -> str:
        """Return a filesystem-safe slug for output directories."""
        safe_model = self.model.replace("/", "_").replace(":", "_").replace(".", "-")
        reasoning_suffix = f"_reasoning-{self.reasoning}" if self.is_reasoning_enabled() else ""
        return f"{self.PROVIDER_NAME}_{safe_model}{reasoning_suffix}"

    def __repr__(self) -> str:
        return f"{self.__class__.__name__}(model='{self.model}', reasoning='{self.reasoning}')"
