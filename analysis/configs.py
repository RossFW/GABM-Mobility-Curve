"""
Shared config list for all 21 LLM probe configurations.

Imported by compute_trait_mentions.py, compute_verbosity_stats.py,
compute_response_text_similarity.py, and compute_agent_consistency.py.
"""

CONFIGS = [
    {"dir": "anthropic_claude-opus-4-5_off",         "label": "Claude Opus 4.5",          "provider": "anthropic", "temp": "0"},
    {"dir": "anthropic_claude-sonnet-4-5_off",       "label": "Claude Sonnet 4.5",        "provider": "anthropic", "temp": "0"},
    {"dir": "anthropic_claude-haiku-4-5_off",        "label": "Claude Haiku 4.5",         "provider": "anthropic", "temp": "0"},
    {"dir": "anthropic_claude-sonnet-4-0_off",       "label": "Claude Sonnet 4.0",        "provider": "anthropic", "temp": "0"},
    {"dir": "anthropic_claude-3-haiku-20240307_off", "label": "Claude 3 Haiku",           "provider": "anthropic", "temp": "0"},
    {"dir": "openai_gpt-5_2_off",                    "label": "GPT-5.2",                  "provider": "openai",    "temp": "0"},
    {"dir": "openai_gpt-5_2_low",                    "label": "GPT-5.2 (low)",            "provider": "openai",    "temp": "1"},
    {"dir": "openai_gpt-5_2_medium",                 "label": "GPT-5.2 (med)",            "provider": "openai",    "temp": "1"},
    {"dir": "openai_gpt-5_2_high",                   "label": "GPT-5.2 (high)",           "provider": "openai",    "temp": "1"},
    {"dir": "openai_gpt-5_1_off",                    "label": "GPT-5.1",                  "provider": "openai",    "temp": "0"},
    {"dir": "openai_gpt-4_1_off",                    "label": "GPT-4.1",                  "provider": "openai",    "temp": "0"},
    {"dir": "openai_gpt-4o_off",                     "label": "GPT-4o",                   "provider": "openai",    "temp": "0"},
    {"dir": "openai_gpt-3_5-turbo_off",              "label": "GPT-3.5 Turbo",            "provider": "openai",    "temp": "0"},
    {"dir": "openai_o3_required",                    "label": "o3",                        "provider": "openai",    "temp": "1"},
    {"dir": "gemini_gemini-3-flash-preview_off",     "label": "Gemini 3 Flash",           "provider": "gemini",    "temp": "1"},
    {"dir": "gemini_gemini-3-flash-preview_low",     "label": "Gemini 3 Flash (low)",     "provider": "gemini",    "temp": "1"},
    {"dir": "gemini_gemini-3-flash-preview_medium",  "label": "Gemini 3 Flash (med)",     "provider": "gemini",    "temp": "1"},
    {"dir": "gemini_gemini-3-flash-preview_high",    "label": "Gemini 3 Flash (high)",    "provider": "gemini",    "temp": "1"},
    {"dir": "gemini_gemini-2_5-flash-lite_off",      "label": "Gemini 2.5 Flash Lite",    "provider": "gemini",    "temp": "0"},
    {"dir": "gemini_gemini-2_5-flash_off",           "label": "Gemini 2.5 Flash",         "provider": "gemini",    "temp": "0"},
    {"dir": "gemini_gemini-2_0-flash_off",           "label": "Gemini 2.0 Flash",         "provider": "gemini",    "temp": "0"},
]
