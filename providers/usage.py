"""
Token usage tracking data classes for LLM providers.
"""

from dataclasses import dataclass, field
from typing import Optional, Any


@dataclass
class UsageStats:
    """Token usage statistics for a single API call."""
    input_tokens: int = 0
    output_tokens: int = 0
    reasoning_tokens: int = 0  # Thinking/reasoning tokens (Claude extended thinking, o-series)
    total_tokens: int = 0
    cached_tokens: int = 0
    model: str = ""
    provider: str = ""

    def __post_init__(self):
        """Calculate total if not provided."""
        if self.total_tokens == 0:
            self.total_tokens = self.input_tokens + self.output_tokens


@dataclass
class CompletionResult:
    """Result from LLM completion including text and usage stats."""
    text: str
    usage: UsageStats = field(default_factory=UsageStats)

    # For debugging/analysis
    raw_response: Optional[Any] = None  # Full API response object


def empty_usage() -> UsageStats:
    """Create an empty UsageStats object."""
    return UsageStats()
