// ============================================================
// GABM Mobility Curve — Config
// ============================================================

'use strict';

const CONFIG = {
  // Data source (relative to town.html)
  DATA_BASE: 'data/real',           // base dir containing per-config folders
  ALL_MACRO: 'data/real/all_macro.csv',  // combined macro for comparison chart

  // World settings
  WORLD_NAME: 'Dewberry Hollow',

  // 21 model configurations (provider, model, reasoning, display label, color, dash, generation)
  MODELS: [
    // Anthropic — distinct hues across purple→pink spectrum
    { provider: 'anthropic', model: 'claude-opus-4-5',          reasoning: 'off',      label: 'Claude Opus 4.5',    color: '#7C3AED', dash: null,      generation: 3 },
    { provider: 'anthropic', model: 'claude-sonnet-4-5',        reasoning: 'off',      label: 'Claude Sonnet 4.5',  color: '#A855F7', dash: null,      generation: 3 },
    { provider: 'anthropic', model: 'claude-haiku-4-5',         reasoning: 'off',      label: 'Claude Haiku 4.5',   color: '#EC4899', dash: null,      generation: 3 },
    { provider: 'anthropic', model: 'claude-sonnet-4-0',        reasoning: 'off',      label: 'Claude Sonnet 4.0',  color: '#F472B6', dash: '6,3',     generation: 2 },
    { provider: 'anthropic', model: 'claude-3-haiku-20240307',  reasoning: 'off',      label: 'Claude 3 Haiku',     color: '#FCA5A1', dash: '4,4',     generation: 1 },
    // OpenAI — greens for modern, warm accents for older models
    { provider: 'openai',    model: 'gpt-5.2',                  reasoning: 'off',      label: 'GPT-5.2',           color: '#22C55E', dash: null,      generation: 4 },
    { provider: 'openai',    model: 'gpt-5.2',                  reasoning: 'low',      label: 'GPT-5.2 (low)',     color: '#22C55E', dash: '8,3',     generation: 4 },
    { provider: 'openai',    model: 'gpt-5.2',                  reasoning: 'medium',   label: 'GPT-5.2 (med)',     color: '#22C55E', dash: '5,3',     generation: 4 },
    { provider: 'openai',    model: 'gpt-5.2',                  reasoning: 'high',     label: 'GPT-5.2 (high)',    color: '#22C55E', dash: '2,3',     generation: 4 },
    { provider: 'openai',    model: 'gpt-5.1',                  reasoning: 'off',      label: 'GPT-5.1',           color: '#059669', dash: null,      generation: 3 },
    // gpt-5.1 high CUT (too expensive at ~$400)
    { provider: 'openai',    model: 'gpt-4.1',                  reasoning: 'off',      label: 'GPT-4.1',           color: '#84CC16', dash: null,      generation: 2 },
    { provider: 'openai',    model: 'gpt-4o',                   reasoning: 'off',      label: 'GPT-4o',            color: '#EAB308', dash: null,      generation: 2 },
    { provider: 'openai',    model: 'gpt-3.5-turbo',            reasoning: 'off',      label: 'GPT-3.5 Turbo',     color: '#F59E0B', dash: '4,4',     generation: 1 },
    { provider: 'openai',    model: 'o3',                       reasoning: 'required', label: 'o3',                 color: '#14B8A6', dash: null,      generation: 3 },
    // Gemini — blues for flash, red for anomaly (lite), purple for older
    { provider: 'gemini',    model: 'gemini-3-flash-preview',   reasoning: 'off',      label: 'Gemini 3 Flash',    color: '#3B82F6', dash: null,      generation: 3 },
    { provider: 'gemini',    model: 'gemini-3-flash-preview',   reasoning: 'low',      label: 'Gem 3 Flash (low)', color: '#3B82F6', dash: '8,3',     generation: 3 },
    { provider: 'gemini',    model: 'gemini-3-flash-preview',   reasoning: 'medium',   label: 'Gem 3 Flash (med)', color: '#3B82F6', dash: '5,3',     generation: 3 },
    { provider: 'gemini',    model: 'gemini-3-flash-preview',   reasoning: 'high',     label: 'Gem 3 Flash (high)',color: '#3B82F6', dash: '2,3',     generation: 3 },
    { provider: 'gemini',    model: 'gemini-2.5-flash-lite',    reasoning: 'off',      label: 'Gemini 2.5 Lite',   color: '#F43F5E', dash: null,      generation: 2 },
    { provider: 'gemini',    model: 'gemini-2.5-flash',         reasoning: 'off',      label: 'Gemini 2.5 Flash',  color: '#06B6D4', dash: null,      generation: 2 },
    { provider: 'gemini',    model: 'gemini-2.0-flash',         reasoning: 'off',      label: 'Gemini 2.0 Flash',  color: '#8B5CF6', dash: '4,4',     generation: 1 },
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
