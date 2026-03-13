// ============================================================
// GABM Mobility Curve — Config
// ============================================================

'use strict';

const CONFIG = {
  // Data source (relative to town.html)
  DATA_BASE: 'data/mock',           // base dir containing per-config folders
  ALL_MACRO: 'data/mock/all_macro.csv',  // combined macro for comparison chart

  // World settings
  WORLD_NAME: 'Dewberry Hollow',

  // 22 model configurations (provider, model, reasoning, display label, color)
  MODELS: [
    // Anthropic
    { provider: 'anthropic', model: 'claude-opus-4-5',          reasoning: 'off',      label: 'Claude Opus 4.5',    color: '#A855F7' },
    { provider: 'anthropic', model: 'claude-sonnet-4-5',        reasoning: 'off',      label: 'Claude Sonnet 4.5',  color: '#C084FC' },
    { provider: 'anthropic', model: 'claude-haiku-4-5',         reasoning: 'off',      label: 'Claude Haiku 4.5',   color: '#D8B4FE' },
    { provider: 'anthropic', model: 'claude-sonnet-4-0',        reasoning: 'off',      label: 'Claude Sonnet 4.0',  color: '#E9D5FF' },
    { provider: 'anthropic', model: 'claude-3-haiku-20240307',  reasoning: 'off',      label: 'Claude 3 Haiku',     color: '#F3E8FF' },
    // OpenAI
    { provider: 'openai',    model: 'gpt-5.2',                  reasoning: 'off',      label: 'GPT-5.2',           color: '#22C55E' },
    { provider: 'openai',    model: 'gpt-5.2',                  reasoning: 'low',      label: 'GPT-5.2 (low)',     color: '#4ADE80' },
    { provider: 'openai',    model: 'gpt-5.2',                  reasoning: 'medium',   label: 'GPT-5.2 (med)',     color: '#86EFAC' },
    { provider: 'openai',    model: 'gpt-5.2',                  reasoning: 'high',     label: 'GPT-5.2 (high)',    color: '#BBF7D0' },
    { provider: 'openai',    model: 'gpt-5.1',                  reasoning: 'off',      label: 'GPT-5.1',           color: '#16A34A' },
    { provider: 'openai',    model: 'gpt-5.1',                  reasoning: 'high',     label: 'GPT-5.1 (high)',    color: '#34D399' },
    { provider: 'openai',    model: 'gpt-4.1',                  reasoning: 'off',      label: 'GPT-4.1',           color: '#059669' },
    { provider: 'openai',    model: 'gpt-4o',                   reasoning: 'off',      label: 'GPT-4o',            color: '#10B981' },
    { provider: 'openai',    model: 'gpt-3.5-turbo',            reasoning: 'off',      label: 'GPT-3.5 Turbo',     color: '#D1FAE5' },
    { provider: 'openai',    model: 'o3',                       reasoning: 'required', label: 'o3',                 color: '#6EE7B7' },
    // Gemini
    { provider: 'gemini',    model: 'gemini-3-flash-preview',   reasoning: 'off',      label: 'Gemini 3 Flash',    color: '#3B82F6' },
    { provider: 'gemini',    model: 'gemini-3-flash-preview',   reasoning: 'low',      label: 'Gem 3 Flash (low)', color: '#60A5FA' },
    { provider: 'gemini',    model: 'gemini-3-flash-preview',   reasoning: 'medium',   label: 'Gem 3 Flash (med)', color: '#93C5FD' },
    { provider: 'gemini',    model: 'gemini-3-flash-preview',   reasoning: 'high',     label: 'Gem 3 Flash (high)',color: '#BFDBFE' },
    { provider: 'gemini',    model: 'gemini-2.5-flash-lite',    reasoning: 'off',      label: 'Gemini 2.5 Lite',   color: '#2563EB' },
    { provider: 'gemini',    model: 'gemini-2.5-flash',         reasoning: 'off',      label: 'Gemini 2.5 Flash',  color: '#1D4ED8' },
    { provider: 'gemini',    model: 'gemini-2.0-flash',         reasoning: 'off',      label: 'Gemini 2.0 Flash',  color: '#DBEAFE' },
  ],

  // Provider colors (for chart legend grouping)
  PROVIDER_COLORS: {
    anthropic: '#A855F7',
    openai:    '#22C55E',
    gemini:    '#3B82F6',
  },

  // Infection levels (must match generate_mock_data.py)
  INFECTION_LEVELS: [
    0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9,
    1.0, 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9,
    2.0, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9,
    3.0, 3.1, 3.2, 3.3, 3.4, 3.5,
    4.0, 5.0, 6.0, 7.0,
  ],

  // Animation
  DEFAULT_FPS: 3,
  SPEED_STEPS: [0.5, 1, 2, 4],

  // Canvas dimensions
  CANVAS_W: 960,
  CANVAS_H: 640,
};

// Compute config directory key from model entry
function configDirKey(m) {
  const modelClean = m.model.replace(/\./g, '_');
  return `${m.provider}_${modelClean}_${m.reasoning}`;
}
