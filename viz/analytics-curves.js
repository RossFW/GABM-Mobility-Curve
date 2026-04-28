'use strict';
// analytics-curves.js — Mobility Curves tab rendering
// Extracted from analytics.js during refactor (March 2026)

// ═══════════════════════════════════════════════════════════════
// S0: Headline Summary Card
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// S1: Provider Envelopes
// ═══════════════════════════════════════════════════════════════
let s1HiddenProviders = new Set();

function renderS1() {
  const el       = document.getElementById('s1-chart');
  const legendEl = document.getElementById('s1-legend');
  const w = CW, h = CH, pad = PAD;
  const grouped = groupByModel(macroData);

  const providers  = ['anthropic', 'openai', 'gemini'];
  const provLabels = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini' };

  const providerLevelData = {};
  providers.forEach(p => { providerLevelData[p] = {}; });

  CONFIG.MODELS.forEach(m => {
    const k = modelKey(m);
    const rows = grouped[k];
    if (!rows) return;
    rows.forEach(r => {
      const pct = parseFloat(r.pct_stay_home);
      if (isNaN(pct)) return;
      if (!providerLevelData[m.provider][r.infection_level])
        providerLevelData[m.provider][r.infection_level] = [];
      providerLevelData[m.provider][r.infection_level].push(pct);
    });
  });

  let providerSvg = '';
  // Draw axis grid first
  providerSvg += yAxisTicks(w, h, pad) + xAxisTicks(w, h, pad) + axisLabels(w, h, pad, 'New cases (% population)', 'Mobility');

  providers.forEach(p => {
    if (s1HiddenProviders.has(p)) return;
    const color    = CONFIG.PROVIDER_COLORS[p];
    const levelMap = providerLevelData[p];
    const sortedLevels = Object.keys(levelMap).map(Number).sort((a, b) => a - b);
    if (sortedLevels.length === 0) return;

    const stats = sortedLevels.map(level => {
      const vals = levelMap[level];
      const avg  = vals.reduce((s, v) => s + v, 0) / vals.length;
      return { level, avg, min: Math.min(...vals), max: Math.max(...vals) };
    });

    const upper = stats.map(s => `${levelToX(s.level, w, pad).toFixed(1)},${pctToY(s.max, h, pad).toFixed(1)}`);
    const lower = [...stats].reverse().map(s => `${levelToX(s.level, w, pad).toFixed(1)},${pctToY(s.min, h, pad).toFixed(1)}`);
    providerSvg += `<polygon points="${[...upper, ...lower].join(' ')}" fill="${color}" opacity="0.12"/>`;

    const avgLine = stats.map(s => `${levelToX(s.level, w, pad).toFixed(1)},${pctToY(s.avg, h, pad).toFixed(1)}`).join(' ');
    providerSvg += `<polyline points="${avgLine}" stroke="${color}" stroke-width="2.5" fill="none" opacity="0.9"/>`;
    providerSvg += `<polyline points="${avgLine}" stroke="transparent" stroke-width="16" fill="none" class="hit-target" data-label="${provLabels[p]} (mean)" data-color="${color}"/>`;
  });

  el.innerHTML = makeSVG(w, h, providerSvg);
  wireTooltips(el);

  legendEl.innerHTML = providers.map(p => {
    const hidden = s1HiddenProviders.has(p);
    const color  = CONFIG.PROVIDER_COLORS[p];
    return `<div class="legend-item" data-provider="${p}" style="opacity:${hidden ? 0.3 : 1}">
      <div class="legend-swatch" style="background:${color}"></div>
      <span style="color:${color};font-weight:bold">${provLabels[p]}</span>
    </div>`;
  }).join('');

  legendEl.querySelectorAll('.legend-item').forEach(item => {
    item.addEventListener('click', () => {
      const p = item.dataset.provider;
      if (s1HiddenProviders.has(p)) s1HiddenProviders.delete(p);
      else s1HiddenProviders.add(p);
      renderS1();
    });
  });

  document.getElementById('s1-section').style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
// Figure A: GPT-5.2 — Reasoning Level Comparison
// Okabe-Ito blue sequential: dark → light
// ═══════════════════════════════════════════════════════════════
function renderFigA() {
  const el       = document.getElementById('figA-chart');
  const legendEl = document.getElementById('figA-legend');
  const w = FIG_CW, h = FIG_CH, pad = FIG_PAD;
  const grouped  = groupByModel(macroData);

  const reasoningOrder = ['off', 'low', 'medium', 'high'];
  const reasoningLabels = { off: 'Off', low: 'Low', medium: 'Medium', high: 'High' };
  // Okabe blue sequential (dark → light), dashed for medium/high
  const colors = ['#003f6b', '#0072B2', '#56B4E9', '#a8d5f0'];
  const dashes = { off: null, low: null, medium: '6,3', high: '6,3' };

  const models = CONFIG.MODELS
    .filter(m => m.model === 'gpt-5.2')
    .sort((a, b) => reasoningOrder.indexOf(a.reasoning) - reasoningOrder.indexOf(b.reasoning));

  let inner = yAxisTicks(w, h, pad) + xAxisTicks(w, h, pad) +
              axisLabels(w, h, pad, 'New cases (% population)', 'Mobility');
  const legendItems = [];

  models.forEach((m, i) => {
    const k    = modelKey(m);
    const rows = grouped[k];
    if (!rows || rows.length === 0) return;
    const pts   = makePolyline(rows, w, h, pad);
    const color = colors[i] || m.color;
    const dash  = dashes[m.reasoning];
    const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
    inner += `<polyline points="${pts}" stroke="${color}" stroke-width="2" fill="none" opacity="0.92"${dashAttr}/>`;
    inner += `<polyline points="${pts}" stroke="transparent" stroke-width="14" fill="none" class="hit-target" data-label="GPT-5.2 (reasoning: ${reasoningLabels[m.reasoning]})" data-color="${color}"/>`;
    legendItems.push({ label: `Reasoning: ${reasoningLabels[m.reasoning]}`, color, dash });
  });

  el.innerHTML = makeSVG(w, h, inner);
  wireTooltips(el);
  legendEl.innerHTML = legendHTML(legendItems);
  document.getElementById('figA-section').style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
// Figure B: Gemini 3 Flash — Reasoning Level Comparison
// Okabe-Ito green sequential: dark → light
// ═══════════════════════════════════════════════════════════════
function renderFigB() {
  const el       = document.getElementById('figB-chart');
  const legendEl = document.getElementById('figB-legend');
  const w = FIG_CW, h = FIG_CH, pad = FIG_PAD;
  const grouped  = groupByModel(macroData);

  const reasoningOrder = ['off', 'low', 'medium', 'high'];
  const reasoningLabels = { off: 'Off', low: 'Low', medium: 'Medium', high: 'High' };
  // Okabe green sequential (dark → light), dashed for medium/high
  const colors = ['#004d38', '#009E73', '#47c9a2', '#a3e4d0'];
  const dashes = { off: null, low: null, medium: '6,3', high: '6,3' };

  const models = CONFIG.MODELS
    .filter(m => m.model === 'gemini-3-flash-preview')
    .sort((a, b) => reasoningOrder.indexOf(a.reasoning) - reasoningOrder.indexOf(b.reasoning));

  let inner = yAxisTicks(w, h, pad) + xAxisTicks(w, h, pad) +
              axisLabels(w, h, pad, 'New cases (% population)', 'Mobility');
  const legendItems = [];

  models.forEach((m, i) => {
    const k    = modelKey(m);
    const rows = grouped[k];
    if (!rows || rows.length === 0) return;
    const pts   = makePolyline(rows, w, h, pad);
    const color = colors[i] || m.color;
    const dash  = dashes[m.reasoning];
    const dashAttr = dash ? ` stroke-dasharray="${dash}"` : '';
    inner += `<polyline points="${pts}" stroke="${color}" stroke-width="2" fill="none" opacity="0.92"${dashAttr}/>`;
    inner += `<polyline points="${pts}" stroke="transparent" stroke-width="14" fill="none" class="hit-target" data-label="Gemini 3 Flash (reasoning: ${reasoningLabels[m.reasoning]})" data-color="${color}"/>`;
    legendItems.push({ label: `Reasoning: ${reasoningLabels[m.reasoning]}`, color, dash });
  });

  el.innerHTML = makeSVG(w, h, inner);
  wireTooltips(el);
  legendEl.innerHTML = legendHTML(legendItems);
  document.getElementById('figB-section').style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
// Figure C: OpenAI Generational Progression (reasoning = off)
// 4 distinct Okabe-Ito colors
// ═══════════════════════════════════════════════════════════════
// ── Generic model comparison figure renderer ──────────────────
// targets: [{ provider, model, reasoning, label, color }, ...]
function renderModelCompFig(chartId, legendId, sectionId, targets) {
  const el       = document.getElementById(chartId);
  const legendEl = document.getElementById(legendId);
  if (!el) return;
  const w = FIG_CW, h = FIG_CH, pad = FIG_PAD;
  const grouped  = groupByModel(macroData);
  let inner = yAxisTicks(w, h, pad) + xAxisTicks(w, h, pad) +
              axisLabels(w, h, pad, 'New cases (% population)', 'Mobility');
  const legendItems = [];
  targets.forEach(t => {
    const k    = `${t.provider}|${t.model}|${t.reasoning}`;
    const rows = grouped[k];
    if (!rows || rows.length === 0) return;
    const pts = makePolyline(rows, w, h, pad);
    inner += `<polyline points="${pts}" stroke="${t.color}" stroke-width="2" fill="none" opacity="0.92"/>`;
    inner += `<polyline points="${pts}" stroke="transparent" stroke-width="14" fill="none" class="hit-target" data-label="${t.label}" data-color="${t.color}"/>`;
    legendItems.push({ label: t.label, color: t.color });
  });
  el.innerHTML = makeSVG(w, h, inner);
  wireTooltips(el);
  if (legendEl) legendEl.innerHTML = legendHTML(legendItems);
  if (sectionId) document.getElementById(sectionId).style.display = 'block';
}

function renderFigC() {
  renderModelCompFig('figC-chart', 'figC-legend', 'figC-section', [
    { provider: 'openai', model: 'gpt-3.5-turbo', reasoning: 'off', label: 'GPT-3.5 Turbo', color: '#000000' },
    { provider: 'openai', model: 'gpt-4o',        reasoning: 'off', label: 'GPT-4o',        color: '#E69F00' },
    { provider: 'openai', model: 'gpt-5.1',       reasoning: 'off', label: 'GPT-5.1',       color: '#0072B2' },
    { provider: 'openai', model: 'gpt-5.2',       reasoning: 'off', label: 'GPT-5.2',       color: '#009E73' },
  ]);
}

// ═══════════════════════════════════════════════════════════════
// Figure D: Gemini Generational Progression (reasoning = off, no Lite)
// 3 distinct Okabe-Ito colors
// ═══════════════════════════════════════════════════════════════
function renderFigD() {
  renderModelCompFig('figD-chart', 'figD-legend', 'figD-section', [
    { provider: 'gemini', model: 'gemini-2.0-flash',       reasoning: 'off', label: 'Gemini 2.0 Flash',      color: '#000000' },
    { provider: 'gemini', model: 'gemini-2.5-flash',       reasoning: 'off', label: 'Gemini 2.5 Flash',      color: '#D55E00' },
    { provider: 'gemini', model: 'gemini-3-flash-preview', reasoning: 'off', label: 'Gemini 3 Flash Preview', color: '#0072B2' },
  ]);
}

// ═══════════════════════════════════════════════════════════════
// Figure 3: Anthropic Model Comparison (reasoning = off)
// Haiku 4.5 → Sonnet 4.5 → Opus 4.5
// ═══════════════════════════════════════════════════════════════
function renderFigAnthro() {
  renderModelCompFig('figAnthro-chart', 'figAnthro-legend', 'figAnthro-section', [
    { provider: 'anthropic', model: 'claude-haiku-4-5',  reasoning: 'off', label: 'Claude Haiku 4.5',  color: '#EC4899' },
    { provider: 'anthropic', model: 'claude-sonnet-4-5', reasoning: 'off', label: 'Claude Sonnet 4.5', color: '#A855F7' },
    { provider: 'anthropic', model: 'claude-opus-4-5',   reasoning: 'off', label: 'Claude Opus 4.5',   color: '#7C3AED' },
  ]);
}

// ═══════════════════════════════════════════════════════════════
// Figure 5: Gemini Flash Lite vs Flash (reasoning = off)
// ═══════════════════════════════════════════════════════════════
function renderFigGeminiLite() {
  renderModelCompFig('figGeminiLite-chart', 'figGeminiLite-legend', 'figGeminiLite-section', [
    { provider: 'gemini', model: 'gemini-2.5-flash-lite', reasoning: 'off', label: 'Gemini 2.5 Flash Lite', color: '#F43F5E' },
    { provider: 'gemini', model: 'gemini-2.5-flash',      reasoning: 'off', label: 'Gemini 2.5 Flash',      color: '#06B6D4' },
  ]);
}

// ═══════════════════════════════════════════════════════════════
// Figure 6: Anthropic Sonnet Generational Progression (reasoning = off)
// Sonnet 4.0 → Sonnet 4.5
// ═══════════════════════════════════════════════════════════════
function renderFigAnthroGen() {
  renderModelCompFig('figAnthroGen-chart', 'figAnthroGen-legend', 'figAnthroGen-section', [
    { provider: 'anthropic', model: 'claude-sonnet-4-0', reasoning: 'off', label: 'Claude Sonnet 4.0', color: '#000000' },
    { provider: 'anthropic', model: 'claude-sonnet-4-5', reasoning: 'off', label: 'Claude Sonnet 4.5', color: '#A855F7' },
  ]);
}

// ═══════════════════════════════════════════════════════════════
// Figure 8: Cross-Provider Flagship Comparison (reasoning = off)
// One flagship per provider: Opus 4.5, GPT-5.2, Gemini 3 Flash
// ═══════════════════════════════════════════════════════════════
function renderFigFlagship() {
  renderModelCompFig('figFlagship-chart', 'figFlagship-legend', 'figFlagship-section', [
    { provider: 'anthropic', model: 'claude-opus-4-5',       reasoning: 'off', label: 'Claude Opus 4.5', color: '#7C3AED' },
    { provider: 'openai',    model: 'gpt-5.2',               reasoning: 'off', label: 'GPT-5.2',         color: '#22C55E' },
    { provider: 'gemini',    model: 'gemini-3-flash-preview', reasoning: 'off', label: 'Gemini 3 Flash',  color: '#3B82F6' },
  ]);
}

// ═══════════════════════════════════════════════════════════════
// Figures 11–13: Knowledge Cutoff Groupings
// ═══════════════════════════════════════════════════════════════
function renderFigCutPre24() {
  renderModelCompFig('figCutPre24-chart', 'figCutPre24-legend', 'figCutPre24-section', [
    { provider: 'openai',    model: 'gpt-3.5-turbo',          reasoning: 'off', label: 'GPT-3.5 Turbo (Sep 2021)',  color: '#000000' },
    { provider: 'anthropic', model: 'claude-3-haiku-20240307', reasoning: 'off', label: 'Claude 3 Haiku (Aug 2023)', color: '#E69F00' },
    { provider: 'openai',    model: 'gpt-4o',                  reasoning: 'off', label: 'GPT-4o (Oct 2023)',         color: '#0072B2' },
  ]);
}

function renderFigCutMid24() {
  renderModelCompFig('figCutMid24-chart', 'figCutMid24-legend', 'figCutMid24-section', [
    { provider: 'openai', model: 'gpt-4.1',            reasoning: 'off',      label: 'GPT-4.1 (Jun 2024)',           color: '#000000' },
    { provider: 'openai', model: 'o3',                  reasoning: 'required', label: 'o3 (Jun 2024)',                color: '#E69F00' },
    { provider: 'gemini', model: 'gemini-2.0-flash',    reasoning: 'off',      label: 'Gemini 2.0 Flash (Jun 2024)', color: '#0072B2' },
    { provider: 'openai', model: 'gpt-5.1',             reasoning: 'off',      label: 'GPT-5.1 (Sep 2024)',          color: '#009E73' },
  ]);
}

function renderFigCutEarly25() {
  renderModelCompFig('figCutEarly25-chart', 'figCutEarly25-legend', 'figCutEarly25-section', [
    { provider: 'anthropic', model: 'claude-sonnet-4-5',       reasoning: 'off', label: 'Sonnet 4.5 (Jan 2025)',    color: '#000000' },
    { provider: 'anthropic', model: 'claude-haiku-4-5',        reasoning: 'off', label: 'Haiku 4.5 (Feb 2025)',     color: '#E69F00' },
    { provider: 'anthropic', model: 'claude-sonnet-4-0',       reasoning: 'off', label: 'Sonnet 4.0 (Mar 2025)',    color: '#56B4E9' },
    { provider: 'gemini',    model: 'gemini-2.5-flash',        reasoning: 'off', label: 'Gemini 2.5 Flash (Jan 2025)',      color: '#009E73' },
    { provider: 'gemini',    model: 'gemini-2.5-flash-lite',   reasoning: 'off', label: 'Gemini 2.5 Flash Lite (Jan 2025)', color: '#D55E00' },
    { provider: 'gemini',    model: 'gemini-3-flash-preview',  reasoning: 'off', label: 'Gemini 3 Flash (Jan 2025)',        color: '#CC79A7' },
  ]);
}

function renderFigCutLate25() {
  renderModelCompFig('figCutLate25-chart', 'figCutLate25-legend', 'figCutLate25-section', [
    { provider: 'anthropic', model: 'claude-opus-4-5', reasoning: 'off', label: 'Claude Opus 4.5 (Aug 2025)', color: '#000000' },
    { provider: 'openai',    model: 'gpt-5.2',         reasoning: 'off', label: 'GPT-5.2 (Aug 2025)',         color: '#E69F00' },
  ]);
}

// ═══════════════════════════════════════════════════════════════
// Figures 16–19: Release Date Groupings
// ═══════════════════════════════════════════════════════════════
function renderFigRelLegacy() {
  renderModelCompFig('figRelLegacy-chart', 'figRelLegacy-legend', 'figRelLegacy-section', [
    { provider: 'openai',    model: 'gpt-3.5-turbo',          reasoning: 'off', label: 'GPT-3.5 Turbo',  color: '#000000' },
    { provider: 'anthropic', model: 'claude-3-haiku-20240307', reasoning: 'off', label: 'Claude 3 Haiku', color: '#E69F00' },
    { provider: 'openai',    model: 'gpt-4o',                  reasoning: 'off', label: 'GPT-4o',         color: '#0072B2' },
  ]);
}

function renderFigRelSpring() {
  renderModelCompFig('figRelSpring-chart', 'figRelSpring-legend', 'figRelSpring-section', [
    { provider: 'gemini',    model: 'gemini-2.0-flash',       reasoning: 'off',      label: 'Gemini 2.0 Flash',  color: '#000000' },
    { provider: 'openai',    model: 'gpt-4.1',                reasoning: 'off',      label: 'GPT-4.1',           color: '#E69F00' },
    { provider: 'openai',    model: 'o3',                     reasoning: 'required', label: 'o3',                 color: '#56B4E9' },
    { provider: 'anthropic', model: 'claude-sonnet-4-0',      reasoning: 'off',      label: 'Claude Sonnet 4.0', color: '#009E73' },
    { provider: 'gemini',    model: 'gemini-2.5-flash',       reasoning: 'off',      label: 'Gemini 2.5 Flash',  color: '#D55E00' },
    { provider: 'gemini',    model: 'gemini-2.5-flash-lite',  reasoning: 'off',      label: 'Gemini 2.5 Flash Lite',  color: '#CC79A7' },
  ]);
}

function renderFigRelLate() {
  renderModelCompFig('figRelLate-chart', 'figRelLate-legend', 'figRelLate-section', [
    { provider: 'anthropic', model: 'claude-sonnet-4-5',      reasoning: 'off', label: 'Claude Sonnet 4.5', color: '#000000' },
    { provider: 'anthropic', model: 'claude-haiku-4-5',       reasoning: 'off', label: 'Claude Haiku 4.5',  color: '#E69F00' },
    { provider: 'anthropic', model: 'claude-opus-4-5',        reasoning: 'off', label: 'Claude Opus 4.5',   color: '#56B4E9' },
    { provider: 'openai',    model: 'gpt-5.1',                reasoning: 'off', label: 'GPT-5.1',           color: '#009E73' },
    { provider: 'openai',    model: 'gpt-5.2',                reasoning: 'off', label: 'GPT-5.2',           color: '#D55E00' },
    { provider: 'gemini',    model: 'gemini-3-flash-preview', reasoning: 'off', label: 'Gemini 3 Flash',    color: '#CC79A7' },
  ]);
}

// ═══════════════════════════════════════════════════════════════
// S2: Paper 1 Legacy Comparison
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// S3: Small Multiples by Provider
// ═══════════════════════════════════════════════════════════════
function renderS3() {
  const facets  = document.getElementById('s3-facets');
  const grouped = groupByModel(macroData);
  const w = SMALL_CW, h = SMALL_CH, pad = SMALL_PAD;

  const groups = [
    { title: 'Anthropic', filter: m => m.provider === 'anthropic' },
    { title: 'OpenAI',    filter: m => m.provider === 'openai'    },
    { title: 'Gemini',    filter: m => m.provider === 'gemini'    },
  ];

  facets.innerHTML = groups.map(g => {
    const models = CONFIG.MODELS.filter(g.filter);
    let inner = yAxisTicks(w, h, pad) + xAxisTicks(w, h, pad) +
                axisLabels(w, h, pad, 'New cases (%)', 'Mobility');
    let hitTargets = '';
    const legendItems = [];

    models.forEach(m => {
      const k    = modelKey(m);
      const rows = grouped[k];
      if (!rows || rows.length === 0) return;
      const pts      = makePolyline(rows, w, h, pad);
      const dashAttr = m.dash ? ` stroke-dasharray="${m.dash}"` : '';
      inner      += `<polyline points="${pts}" stroke="${m.color}" stroke-width="1.5" fill="none" opacity="0.85"${dashAttr}/>`;
      hitTargets += `<polyline points="${pts}" stroke="transparent" stroke-width="12" fill="none" class="hit-target" data-label="${esc(m.label)}" data-color="${m.color}"/>`;
      legendItems.push({ label: m.label, color: m.color, dash: m.dash });
    });

    return `<div class="facet-panel">
      <div class="facet-title">${g.title}</div>
      <div class="chart-container">${makeSVG(w, h, inner + hitTargets)}</div>
      <div class="legend" style="margin-top:6px;font-size:11px">${legendHTML(legendItems)}</div>
    </div>`;
  }).join('');

  facets.querySelectorAll('.chart-container').forEach(wireTooltips);
  document.getElementById('s3-section').style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
// S6: Outlier Spotlights
// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// S7: Agent-Level Analysis — Heatmap + Concordance
// ═══════════════════════════════════════════════════════════════

function renderS7Heatmap(microRows, cfg) {
  const el = document.getElementById('s7-heatmap');

  const agentLevelVotes = {};
  microRows.forEach(r => {
    if (!agentLevelVotes[r.agent_id]) agentLevelVotes[r.agent_id] = {};
    if (!agentLevelVotes[r.agent_id][r.infection_level])
      agentLevelVotes[r.agent_id][r.infection_level] = { yes: 0, no: 0 };
    agentLevelVotes[r.agent_id][r.infection_level][r.response]++;
  });

  const agentIds = Object.keys(agentLevelVotes).map(Number).sort((a, b) => a - b);

  const transitionPoints = agentIds.map(id => {
    for (let li = 0; li < LEVELS.length; li++) {
      const v = agentLevelVotes[id]?.[LEVELS[li]];
      if (v && v.yes > v.no) return { id, tp: li };
    }
    return { id, tp: LEVELS.length };
  });
  transitionPoints.sort((a, b) => a.tp - b.tp);
  const sortedIds = transitionPoints.map(t => t.id);

  const nLevels = LEVELS.length, nAgents = sortedIds.length;
  const ox = 50, oy = 20, legendW = 130;
  const containerW = el.parentElement?.offsetWidth || 800;
  const availW  = Math.max(120, containerW - ox - legendW - 20);
  const cellW   = Math.max(4, Math.floor(availW / nLevels));
  const cellH   = Math.max(2, Math.round(cellW * 0.17));
  const hmW = nLevels * cellW + ox + legendW, hmH = nAgents * cellH + 60;

  function cellColor(votes) {
    if (!votes) return '#f0f0f0';
    const total    = votes.yes + votes.no;
    const majority = votes.yes > votes.no ? 'home' : 'out';
    const conf     = Math.max(votes.yes, votes.no) / total;
    if (majority === 'home') {
      if (conf >= 0.95) return '#D55E00';
      if (conf >= 0.75) return '#E69F00';
      return '#f0c97a';
    } else {
      if (conf >= 0.95) return '#0072B2';
      if (conf >= 0.75) return '#56B4E9';
      return '#a8d5f0';
    }
  }

  let cells = '';
  for (let ai = 0; ai < sortedIds.length; ai++) {
    for (let li = 0; li < nLevels; li++) {
      cells += `<rect x="${ox + li * cellW}" y="${oy + ai * cellH}" width="${cellW}" height="${cellH}" fill="${cellColor(agentLevelVotes[sortedIds[ai]]?.[LEVELS[li]])}"/>`;
    }
  }

  const xTicks  = [0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0];
  const xLabels = xTicks.map(t => {
    const idx = LEVELS.indexOf(t);
    if (idx < 0) return '';
    return `<text x="${ox + idx * cellW + cellW / 2}" y="${oy + nAgents * cellH + 14}" fill="${AX_COLOR}" font-size="9" text-anchor="middle" font-family="${SERIF}">${t}%</text>`;
  }).join('');

  const yLabel = `<text x="10" y="${oy + nAgents * cellH / 2}" fill="${AX_COLOR}" font-size="10" text-anchor="middle" font-family="${SERIF}" font-style="italic" transform="rotate(-90,10,${oy + nAgents * cellH / 2})">Agents</text>`;
  const xLabel = `<text x="${ox + nLevels * cellW / 2}" y="${oy + nAgents * cellH + 28}" fill="${AX_COLOR}" font-size="10" text-anchor="middle" font-family="${SERIF}" font-style="italic">Infection level</text>`;

  const lx = ox + nLevels * cellW + 10, ly = oy + 4;
  const legendSvg = [
    [lx, ly,    '#D55E00', 'Home (5/5)'],
    [lx, ly+14, '#E69F00', 'Home (4/5)'],
    [lx, ly+28, '#f0c97a', 'Home (3/5)'],
    [lx, ly+48, '#0072B2', 'Out (5/5)' ],
    [lx, ly+62, '#56B4E9', 'Out (4/5)' ],
    [lx, ly+76, '#a8d5f0', 'Out (3/5)' ],
  ].map(([x, y, c, t]) =>
    `<rect x="${x}" y="${y}" width="8" height="8" fill="${c}" stroke="#ccc" stroke-width="0.5"/><text x="${x+12}" y="${y+7}" fill="${AX_COLOR}" font-size="9" font-family="${SERIF}">${t}</text>`
  ).join('');

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${hmW}" height="${hmH}" style="display:block;background:${SVG_BG};width:100%;max-width:${hmW}px;border:1px solid #ccc">
    ${cells}${xLabels}${yLabel}${xLabel}${legendSvg}
  </svg>`;
}

function renderS7Concordance(microRows, cfg) {
  const el = document.getElementById('s7-concordance');

  // Build per-agent per-level vote tallies
  const agentLevelVotes = {};
  microRows.forEach(r => {
    if (!agentLevelVotes[r.agent_id]) agentLevelVotes[r.agent_id] = {};
    if (!agentLevelVotes[r.agent_id][r.infection_level])
      agentLevelVotes[r.agent_id][r.infection_level] = { yes: 0, no: 0 };
    agentLevelVotes[r.agent_id][r.infection_level][r.response]++;
  });

  const agentIds = Object.keys(agentLevelVotes).map(Number);
  const nAgents  = agentIds.length;

  // Concordance series (exact values, not cumulative) + majority direction per level
  const unanimousData = [], exactFourData = [], exactThreeData = [];
  const majorityHome = [];  // true = majority staying home at this level
  LEVELS.forEach(level => {
    let unanimous = 0, exactFour = 0, exactThree = 0;
    let totalYes = 0, totalVotes = 0;
    agentIds.forEach(id => {
      const v = agentLevelVotes[id]?.[level];
      if (!v) return;
      const mx = Math.max(v.yes, v.no);
      if (mx === 5) unanimous++;
      if (mx === 4) exactFour++;
      if (mx === 3) exactThree++;
      totalYes   += v.yes;
      totalVotes += v.yes + v.no;
    });
    unanimousData.push({ level, pct: (unanimous  / nAgents) * 100 });
    exactFourData.push({ level, pct: (exactFour  / nAgents) * 100 });
    exactThreeData.push({ level, pct: (exactThree / nAgents) * 100 });
    majorityHome.push(totalVotes > 0 && totalYes / totalVotes > 0.5);
  });

  const w = CW, h = CH, pad = PAD;

  // ── Majority-direction strip — 8px band just inside the top of the chart ──
  const stripH = 8;
  const stripY = pad.t;  // sits at the 100% line
  let stripSvg = '';
  LEVELS.forEach((level, i) => {
    const x1 = levelToX(level, w, pad);
    const x2 = i + 1 < LEVELS.length ? levelToX(LEVELS[i + 1], w, pad) : x1 + 4;
    const col = majorityHome[i] ? '#D55E00' : '#0072B2';  // amber=home, blue=out
    stripSvg += `<rect x="${x1.toFixed(1)}" y="${stripY}" width="${(x2 - x1).toFixed(1)}" height="${stripH}" fill="${col}" opacity="0.45"/>`;
  });

  // ── Three concordance lines ──
  const series = [
    { label: 'Unanimous (5/5)', data: unanimousData,  color: '#111111', dash: null,  sw: 2.0 },
    { label: 'Exact 4/5',       data: exactFourData,  color: '#0072B2', dash: null,  sw: 1.75 },
    { label: 'Exact 3/5',       data: exactThreeData, color: '#888888', dash: '5,3', sw: 1.5  },
  ];

  let inner = yAxisTicks(w, h, pad) + xAxisTicks(w, h, pad) +
    axisLabels(w, h, pad, 'New cases (%)', '% agents') +
    stripSvg;

  series.forEach(s => {
    const pts = s.data.map(d =>
      `${levelToX(d.level, w, pad).toFixed(1)},${pctToY(d.pct, h, pad).toFixed(1)}`
    ).join(' ');
    const dashAttr = s.dash ? `stroke-dasharray="${s.dash}"` : '';
    inner += `<polyline points="${pts}" stroke="${s.color}" stroke-width="${s.sw}" fill="none" opacity="0.9" ${dashAttr}/>`;
  });

  // ── Legend ──
  const legendItems = series.map(s => {
    const dashStyle = s.dash ? `border-top:2px dashed ${s.color}` : `border-top:2.5px solid ${s.color}`;
    return `<span style="display:flex;align-items:center;gap:5px;font-size:11px;color:#333">
      <span style="display:inline-block;width:22px;height:0;${dashStyle}"></span>${s.label}
    </span>`;
  }).join('');

  const majLegend = `
    <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:#333">
      <span style="display:inline-block;width:14px;height:8px;background:#D55E00;opacity:0.6;border-radius:1px"></span>Majority staying home (low mobility)
    </span>
    <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:#333">
      <span style="display:inline-block;width:14px;height:8px;background:#0072B2;opacity:0.6;border-radius:1px"></span>Majority going out
    </span>`;

  el.innerHTML = `
    <div class="chart-container">${makeSVG(w, h, inner)}</div>
    <div class="legend" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:16px">${legendItems}${majLegend}</div>`;
}

function renderS7(microRows, cfg) {
  renderS7Heatmap(microRows, cfg);
}

function renderFig22bConcordance(microRows, cfg) {
  const el = document.getElementById('concordance-chart');

  // Build per-agent per-level vote tallies
  const agentLevelVotes = {};
  microRows.forEach(r => {
    if (!agentLevelVotes[r.agent_id]) agentLevelVotes[r.agent_id] = {};
    if (!agentLevelVotes[r.agent_id][r.infection_level])
      agentLevelVotes[r.agent_id][r.infection_level] = { yes: 0, no: 0 };
    agentLevelVotes[r.agent_id][r.infection_level][r.response]++;
  });

  const agentIds = Object.keys(agentLevelVotes).map(Number);
  const nAgents  = agentIds.length;

  // Concordance series (exact values, not cumulative) + majority direction per level
  const unanimousData = [], exactFourData = [], exactThreeData = [];
  const majorityHome = [];
  LEVELS.forEach(level => {
    let unanimous = 0, exactFour = 0, exactThree = 0;
    let totalYes = 0, totalVotes = 0;
    agentIds.forEach(id => {
      const v = agentLevelVotes[id]?.[level];
      if (!v) return;
      const mx = Math.max(v.yes, v.no);
      if (mx === 5) unanimous++;
      if (mx === 4) exactFour++;
      if (mx === 3) exactThree++;
      totalYes   += v.yes;
      totalVotes += v.yes + v.no;
    });
    unanimousData.push({ level, pct: (unanimous  / nAgents) * 100 });
    exactFourData.push({ level, pct: (exactFour  / nAgents) * 100 });
    exactThreeData.push({ level, pct: (exactThree / nAgents) * 100 });
    majorityHome.push(totalVotes > 0 && totalYes / totalVotes > 0.5);
  });

  const w = CW, h = CH, pad = PAD;

  const stripH = 8;
  const stripY = pad.t;
  let stripSvg = '';
  LEVELS.forEach((level, i) => {
    const x1 = levelToX(level, w, pad);
    const x2 = i + 1 < LEVELS.length ? levelToX(LEVELS[i + 1], w, pad) : x1 + 4;
    const col = majorityHome[i] ? '#D55E00' : '#0072B2';
    stripSvg += `<rect x="${x1.toFixed(1)}" y="${stripY}" width="${(x2 - x1).toFixed(1)}" height="${stripH}" fill="${col}" opacity="0.45"/>`;
  });

  const series = [
    { label: 'Unanimous (5/5)', data: unanimousData,  color: '#111111', dash: null,  sw: 2.0 },
    { label: 'Exact 4/5',       data: exactFourData,  color: '#0072B2', dash: null,  sw: 1.75 },
    { label: 'Exact 3/5',       data: exactThreeData, color: '#888888', dash: '5,3', sw: 1.5  },
  ];

  let inner = yAxisTicks(w, h, pad) + xAxisTicks(w, h, pad) +
    axisLabels(w, h, pad, 'New cases (%)', '% agents') +
    stripSvg;

  series.forEach(s => {
    const pts = s.data.map(d =>
      `${levelToX(d.level, w, pad).toFixed(1)},${pctToY(d.pct, h, pad).toFixed(1)}`
    ).join(' ');
    const dashAttr = s.dash ? `stroke-dasharray="${s.dash}"` : '';
    inner += `<polyline points="${pts}" stroke="${s.color}" stroke-width="${s.sw}" fill="none" opacity="0.9" ${dashAttr}/>`;
  });

  const legendItems = series.map(s => {
    const dashStyle = s.dash ? `border-top:2px dashed ${s.color}` : `border-top:2.5px solid ${s.color}`;
    return `<span style="display:flex;align-items:center;gap:5px;font-size:11px;color:#333">
      <span style="display:inline-block;width:22px;height:0;${dashStyle}"></span>${s.label}
    </span>`;
  }).join('');

  const majLegend = `
    <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:#333">
      <span style="display:inline-block;width:14px;height:8px;background:#D55E00;opacity:0.6;border-radius:1px"></span>Majority staying home
    </span>
    <span style="display:flex;align-items:center;gap:5px;font-size:11px;color:#333">
      <span style="display:inline-block;width:14px;height:8px;background:#0072B2;opacity:0.6;border-radius:1px"></span>Majority going out
    </span>`;

  el.innerHTML = `
    <div class="chart-container">${makeSVG(w, h, inner)}</div>
    <div class="legend" style="margin-top:10px;display:flex;flex-wrap:wrap;gap:16px">${legendItems}${majLegend}</div>`;
}

// ── S3 provider OLS range table ───────────────────────────────
function renderS3OLSTable() {
  const el = document.getElementById('s3-ols');
  if (!el) return;
  const providers = ['anthropic', 'openai', 'gemini'];
  const rows = providers.map(p => {
    const configs = olsResults.filter(r => r.provider === p);
    if (!configs.length) return '';
    const betas = configs.map(r => r.beta);
    const minB = Math.min(...betas), maxB = Math.max(...betas);
    const minM = configs[betas.indexOf(minB)].label;
    const maxM = configs[betas.indexOf(maxB)].label;
    return `<tr>
      <td style="text-transform:capitalize">${p}</td>
      <td>${minB.toFixed(2)} (${esc(minM)})</td>
      <td>${maxB.toFixed(2)} (${esc(maxM)})</td>
      <td>${(maxB - minB).toFixed(2)}</td>
    </tr>`;
  }).join('');
  el.innerHTML = `
    <thead><tr>
      <th>Provider</th>
      <th>Min &beta;</th>
      <th>Max &beta;</th>
      <th>Range</th>
    </tr></thead>
    <tbody>${rows}</tbody>`;
}

// ═══════════════════════════════════════════════════════════════
// REGRESSION TAB — Dummy Variable OLS Tables
// ═══════════════════════════════════════════════════════════════

// configs = [off_key, low_key, med_key, high_key]
function renderReasoningRegTable(containerId, configs) {
  const el = document.getElementById(containerId);
  if (!el || !macroData.length) return;

  const [offKey, lowKey, medKey, highKey] = configs;
  const reasoningMap = { [offKey]: 'off', [lowKey]: 'low', [medKey]: 'medium', [highKey]: 'high' };

  // Build stacked dataset: 40 levels × 4 configs = 160 rows
  const rows = [];
  configs.forEach(key => {
    const r = key.split('_');
    // key format: provider_model_reasoning — find matching macro rows
    const olsR = olsResults.find(o => o.key === key);
    if (!olsR) return;
    const reasoning = reasoningMap[key];
    macroData.filter(d =>
      d.provider === olsR.provider && d.model === olsR.model && d.reasoning === olsR.reasoning
    ).forEach(d => {
      const nc = +d.infection_level;
      const y  = 100 - +d.pct_stay_home;
      rows.push({
        nc, y,
        d_low:  reasoning === 'low'    ? 1 : 0,
        d_med:  reasoning === 'medium' ? 1 : 0,
        d_high: reasoning === 'high'   ? 1 : 0,
      });
    });
  });

  if (rows.length < 10) { el.innerHTML = '<p style="color:#999">Insufficient data.</p>'; return; }

  const Y = rows.map(r => r.y);

  // Model 1: no interaction — [1, NC, NC², D_low, D_med, D_high]
  const X1 = rows.map(r => [1, r.nc, r.nc*r.nc, r.d_low, r.d_med, r.d_high]);
  const fit1 = fitMultipleOLS(X1, Y);

  // Model 2: with NC interactions — [1, NC, NC², D_low, NC×D_low, D_med, NC×D_med, D_high, NC×D_high]
  const X2 = rows.map(r => [
    1, r.nc, r.nc*r.nc,
    r.d_low,  r.nc*r.d_low,
    r.d_med,  r.nc*r.d_med,
    r.d_high, r.nc*r.d_high,
  ]);
  const fit2 = fitMultipleOLS(X2, Y);

  if (!fit1 || !fit2) { el.innerHTML = '<p style="color:#999">Regression failed (singular matrix).</p>'; return; }

  const fmt = (v, digits=2) => (v >= 0 ? '+' : '') + v.toFixed(digits);
  const cell = (fit, idx) => {
    if (!fit || idx >= fit.betas.length) return '<td></td>';
    const b = fit.betas[idx], p = fit.ps[idx];
    const stars = pStars(p);
    const cls = stars === 'ns' ? '' : ' class="ols-sig"';
    return `<td${cls}>${fmt(b)}${stars !== 'ns' ? `<sup>${stars}</sup>` : ''}</td>`;
  };

  // Row definitions: [label, model1_idx, model2_idx, isKeyRow]
  const rowDefs = [
    ['Constant',         0, 0, false],
    ['New Cases',        1, 1, false],
    ['New Cases²',       2, 2, false],
    ['Low',              3, 3, true],
    ['New Cases × Low',  null, 4, true],
    ['Medium',           4, 5, true],
    ['New Cases × Med',  null, 6, true],
    ['High',             5, 7, true],
    ['New Cases × High', null, 8, true],
  ];

  const bodyRows = rowDefs.map(([label, i1, i2, key]) => {
    const c1 = i1 !== null ? cell(fit1, i1) : '<td style="color:#ccc">—</td>';
    const c2 = i2 !== null ? cell(fit2, i2) : '<td style="color:#ccc">—</td>';
    const tr = key ? ' class="ols-key-row"' : '';
    return `<tr${tr}><td>${label}</td>${c1}${c2}</tr>`;
  }).join('');

  const eq1 = 'Mobility = &beta;&#x2080; + &beta;&#x2081;&thinsp;NC + &beta;&#x2082;&thinsp;NC&sup2; + &beta;&#x2083;&thinsp;Low + &beta;&#x2084;&thinsp;Medium + &beta;&#x2085;&thinsp;High';
  const eq2 = 'Mobility = &beta;&#x2080; + &beta;&#x2081;&thinsp;NC + &beta;&#x2082;&thinsp;NC&sup2; + &beta;&#x2083;&thinsp;Low + &beta;&#x2084;&thinsp;NC&thinsp;&times;&thinsp;Low + &beta;&#x2085;&thinsp;Medium + &beta;&#x2086;&thinsp;NC&thinsp;&times;&thinsp;Medium + &beta;&#x2087;&thinsp;High + &beta;&#x2088;&thinsp;NC&thinsp;&times;&thinsp;High';

  el.innerHTML = `
    <div style="font-size:11px;color:#666;font-style:italic;margin-bottom:10px;line-height:1.7">
      <strong style="font-style:normal">(1) Baseline shift:</strong> ${eq1}<br>
      <strong style="font-style:normal">(2) Baseline + slope shift:</strong> ${eq2}
    </div>
    <div class="ols-table-wrap" style="overflow-x:auto">
      <table class="ols-table" style="min-width:420px">
        <thead>
          <tr>
            <th style="text-align:left">Variable</th>
            <th>(1) Baseline shift</th>
            <th>(2) Baseline + slope shift</th>
          </tr>
        </thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr>
            <td>R²</td>
            <td>${fit1.r2.toFixed(3)}</td>
            <td>${fit2.r2.toFixed(3)}</td>
          </tr>
          <tr>
            <td>N</td>
            <td>${rows.length}</td>
            <td>${rows.length}</td>
          </tr>
          <tr>
            <td colspan="3" style="font-size:10px;color:#999;font-style:italic">
              Baseline = reasoning off. Highlighted rows = reasoning level tests.
              <sup>***</sup> p&lt;0.001 &nbsp; <sup>**</sup> p&lt;0.01 &nbsp; <sup>*</sup> p&lt;0.05
            </td>
          </tr>
        </tfoot>
      </table>
    </div>`;
}

// General dummy-variable regression table for model comparisons
// configs[0] = baseline, configs[1..n] = dummies; dummyLabels names each dummy
function renderModelDummyRegTable(containerId, configs, dummyLabels, baselineLabel) {
  const el = document.getElementById(containerId);
  if (!el || !macroData.length) return;

  const nDummies = configs.length - 1;
  const subs = ['&#x2080;','&#x2081;','&#x2082;','&#x2083;','&#x2084;','&#x2085;','&#x2086;','&#x2087;','&#x2088;','&#x2089;'];

  const rows = [];
  configs.forEach((key, idx) => {
    const olsR = olsResults.find(o => o.key === key);
    if (!olsR) return;
    macroData.filter(d =>
      d.provider === olsR.provider && d.model === olsR.model && d.reasoning === olsR.reasoning
    ).forEach(d => {
      const nc = +d.infection_level;
      const y  = 100 - +d.pct_stay_home;
      const dummies = Array(nDummies).fill(0);
      if (idx > 0) dummies[idx - 1] = 1;
      rows.push({ nc, y, dummies });
    });
  });

  if (rows.length < 10) { el.innerHTML = '<p style="color:#999">Insufficient data.</p>'; return; }

  const Y  = rows.map(r => r.y);
  const X1 = rows.map(r => [1, r.nc, r.nc*r.nc, ...r.dummies]);
  const X2 = rows.map(r => {
    const cols = [1, r.nc, r.nc*r.nc];
    r.dummies.forEach(d => { cols.push(d); cols.push(r.nc * d); });
    return cols;
  });

  const fit1 = fitMultipleOLS(X1, Y);
  const fit2 = fitMultipleOLS(X2, Y);
  if (!fit1 || !fit2) { el.innerHTML = '<p style="color:#999">Regression failed (singular matrix).</p>'; return; }

  const fmt  = (v) => (v >= 0 ? '+' : '') + v.toFixed(2);
  const cell = (fit, idx) => {
    if (!fit || idx === null || idx >= fit.betas.length) return '<td></td>';
    const b = fit.betas[idx], p = fit.ps[idx];
    const stars = pStars(p);
    const cls = stars === 'ns' ? '' : ' class="ols-sig"';
    return `<td${cls}>${fmt(b)}${stars !== 'ns' ? `<sup>${stars}</sup>` : ''}</td>`;
  };

  const rowDefs = [
    ['Constant',   0, 0, false],
    ['New Cases',  1, 1, false],
    ['New Cases²', 2, 2, false],
  ];
  dummyLabels.forEach((lbl, i) => {
    rowDefs.push([lbl,                   3 + i,     3 + i*2,     true]);
    rowDefs.push([`New Cases × ${lbl}`,  null,      4 + i*2,     true]);
  });

  const bodyRows = rowDefs.map(([label, i1, i2, isKey]) => {
    const c1 = i1 !== null ? cell(fit1, i1) : '<td style="color:#ccc">—</td>';
    const c2 = i2 !== null ? cell(fit2, i2) : '<td style="color:#ccc">—</td>';
    return `<tr${isKey ? ' class="ols-key-row"' : ''}><td>${label}</td>${c1}${c2}</tr>`;
  }).join('');

  let eq1 = `Mobility = &beta;${subs[0]} + &beta;${subs[1]}&thinsp;NC + &beta;${subs[2]}&thinsp;NC&sup2;`;
  let eq2 = eq1;
  dummyLabels.forEach((lbl, i) => {
    eq1 += ` + &beta;${subs[3+i]}&thinsp;${lbl}`;
    eq2 += ` + &beta;${subs[3+i*2]}&thinsp;${lbl} + &beta;${subs[4+i*2]}&thinsp;NC&thinsp;&times;&thinsp;${lbl}`;
  });

  el.innerHTML = `
    <div style="font-size:11px;color:#666;font-style:italic;margin-bottom:10px;line-height:1.7">
      <strong style="font-style:normal">(1) Baseline shift:</strong> ${eq1}<br>
      <strong style="font-style:normal">(2) Baseline + slope shift:</strong> ${eq2}
    </div>
    <div class="ols-table-wrap" style="overflow-x:auto">
      <table class="ols-table" style="min-width:420px">
        <thead><tr>
          <th style="text-align:left">Variable</th>
          <th>(1) Baseline shift</th>
          <th>(2) Baseline + slope shift</th>
        </tr></thead>
        <tbody>${bodyRows}</tbody>
        <tfoot>
          <tr><td>R²</td><td>${fit1.r2.toFixed(3)}</td><td>${fit2.r2.toFixed(3)}</td></tr>
          <tr><td>N</td><td>${rows.length}</td><td>${rows.length}</td></tr>
          <tr><td colspan="3" style="font-size:10px;color:#999;font-style:italic">
            Baseline = ${baselineLabel}. Highlighted rows = model comparison tests.
            <sup>***</sup> p&lt;0.001 &nbsp; <sup>**</sup> p&lt;0.01 &nbsp; <sup>*</sup> p&lt;0.05
          </td></tr>
        </tfoot>
      </table>
    </div>`;
}

function renderTabRegression() {
  renderReasoningRegTable('reg-gpt52', [
    'openai_gpt-5_2_off', 'openai_gpt-5_2_low',
    'openai_gpt-5_2_medium', 'openai_gpt-5_2_high',
  ]);
  renderReasoningRegTable('reg-gemini3flash', [
    'gemini_gemini-3-flash-preview_off', 'gemini_gemini-3-flash-preview_low',
    'gemini_gemini-3-flash-preview_medium', 'gemini_gemini-3-flash-preview_high',
  ]);
}

// ── Figure 13 state ───────────────────────────────────────────
let figJMicroA = null; // cached micro rows for currently selected config A
let figJMicroB = null;
let figJKeyA   = null;
let figJKeyB   = null;

function initFigJ() {
  const selA = document.getElementById('figJ-configA');
  const selB = document.getElementById('figJ-configB');
  if (!selA || !selB) return;

  // Populate dropdowns with all 21 models
  CONFIG.MODELS.forEach((m, i) => {
    [selA, selB].forEach(sel => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = m.label;
      sel.appendChild(opt);
    });
  });
  // Default: first two distinct configs
  selB.selectedIndex = Math.min(1, CONFIG.MODELS.length - 1);

  document.getElementById('figJ-run').addEventListener('click', runFigJ);
  // Auto-run with defaults
  runFigJ();
}

function runFigJ() {
  const idxA = +document.getElementById('figJ-configA').value;
  const idxB = +document.getElementById('figJ-configB').value;
  if (idxA === idxB) {
    document.getElementById('figJ-results').innerHTML =
      '<p style="color:#c00;font-size:13px">Please select two different model configurations.</p>';
    return;
  }
  const mA = CONFIG.MODELS[idxA], mB = CONFIG.MODELS[idxB];
  const keyA = configDirKey(mA), keyB = configDirKey(mB);
  const loading = document.getElementById('figJ-loading');
  loading.style.display = 'block';
  document.getElementById('figJ-results').innerHTML = '';
  document.getElementById('figJ-scatter').innerHTML = '';

  let microA = null, microB = null;
  let loaded = 0;

  function tryRender() {
    if (++loaded < 2) return;
    loading.style.display = 'none';
    drawFigJ(microA, microB, mA, mB);
  }

  // Load micro CSVs (read-only from data/)
  Papa.parse(`data/real/${keyA}/probe_results_micro.csv`, {
    download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
    complete({ data }) { microA = data; tryRender(); },
    error() {
      // Fallback: try alternative path
      Papa.parse(`../data/${keyA}/probe_results_micro.csv`, {
        download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
        complete({ data }) { microA = data; tryRender(); },
        error() { loading.innerHTML = '<span style="color:#c00">Failed to load micro data for Config A.</span>'; },
      });
    },
  });
  Papa.parse(`data/real/${keyB}/probe_results_micro.csv`, {
    download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
    complete({ data }) { microB = data; tryRender(); },
    error() {
      Papa.parse(`../data/${keyB}/probe_results_micro.csv`, {
        download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
        complete({ data }) { microB = data; tryRender(); },
        error() { loading.innerHTML = '<span style="color:#c00">Failed to load micro data for Config B.</span>'; },
      });
    },
  });
}

function drawFigJ(microA, microB, mA, mB) {
  const repsA = aggregateMicroToReps(microA);
  const repsB = aggregateMicroToReps(microB);
  const all   = [...repsA.map(r => ({...r, d: 0})), ...repsB.map(r => ({...r, d: 1}))];

  // ── Scatter SVG ─────────────────────────────────────────────
  const W = CW, H = 320;
  const pad = { t: 28, r: 20, b: 50, l: 55 };
  const xMin = 0, xMax = 0.08; // NC range 0–0.07 (7% max)
  const yMin = 0, yMax = 1.0;

  const toX = nc  => pad.l + (nc  - xMin) / (xMax - xMin) * (W - pad.l - pad.r);
  const toY = mob => H - pad.b - (mob - yMin) / (yMax - yMin) * (H - pad.t - pad.b);

  let svg = '';

  // Grid lines
  [0, 0.25, 0.5, 0.75, 1.0].forEach(v => {
    const y = toY(v);
    svg += `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W - pad.r}" y2="${y.toFixed(1)}" stroke="${GRID_COLOR}" stroke-width="1"/>`;
    svg += `<text x="${(pad.l - 5).toFixed(1)}" y="${(y + 4).toFixed(1)}" fill="${AX_COLOR}" font-size="9" font-family="${SERIF}" text-anchor="end">${v.toFixed(2)}</text>`;
  });
  [0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07].forEach(v => {
    const x = toX(v);
    svg += `<line x1="${x.toFixed(1)}" y1="${pad.t}" x2="${x.toFixed(1)}" y2="${H - pad.b}" stroke="${GRID_COLOR}" stroke-width="1"/>`;
    svg += `<text x="${x.toFixed(1)}" y="${(H - pad.b + 14).toFixed(1)}" fill="${AX_COLOR}" font-size="9" font-family="${SERIF}" text-anchor="middle">${(v * 100).toFixed(0)}%</text>`;
  });

  // Axis labels
  svg += `<text x="${((pad.l + W - pad.r) / 2).toFixed(1)}" y="${(H - 6).toFixed(1)}" fill="${AX_COLOR}" font-size="10" font-family="${SERIF}" text-anchor="middle">New Cases (% of Population)</text>`;
  svg += `<text x="12" y="${((pad.t + H - pad.b) / 2).toFixed(1)}" fill="${AX_COLOR}" font-size="10" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,12,${((pad.t + H - pad.b) / 2).toFixed(1)})">Mobility</text>`;

  // Per-config quadratic OLS fit lines
  function fitQuad(pts) {
    const n = pts.length;
    const X = pts.map(p => [1, p.nc, p.nc * p.nc]);
    const y = pts.map(p => p.mob);
    return fitMultipleOLS(X, y);
  }

  function drawFitLine(pts, color, dash) {
    const fit = fitQuad(pts);
    if (!fit) return '';
    const [b0, b1, b2] = fit.betas;
    const steps = 80;
    const points = Array.from({length: steps + 1}, (_, i) => {
      const nc = xMin + (xMax - xMin) * i / steps;
      const mob = Math.min(1, Math.max(0, b0 + b1 * nc + b2 * nc * nc));
      return `${toX(nc).toFixed(1)},${toY(mob).toFixed(1)}`;
    }).join(' ');
    return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2" stroke-dasharray="${dash || ''}" opacity="0.8"/>`;
  }

  // Circles (draw A then B so B is on top)
  repsA.forEach(r => {
    svg += `<circle cx="${toX(r.nc).toFixed(1)}" cy="${toY(r.mob).toFixed(1)}" r="4" fill="none" stroke="${mA.color}" stroke-width="1.5" opacity="0.7"/>`;
  });
  repsB.forEach(r => {
    svg += `<circle cx="${toX(r.nc).toFixed(1)}" cy="${toY(r.mob).toFixed(1)}" r="4" fill="none" stroke="${mB.color}" stroke-width="1.5" opacity="0.7"/>`;
  });

  // Fit lines
  svg += drawFitLine(repsA, mA.color, '');
  svg += drawFitLine(repsB, mB.color, '6,3');

  // Legend
  const legY = pad.t - 10;
  svg += `<circle cx="${pad.l + 10}" cy="${legY}" r="4" fill="none" stroke="${mA.color}" stroke-width="1.5"/><text x="${pad.l + 18}" y="${legY + 4}" fill="${AX_COLOR}" font-size="10" font-family="${SERIF}">${esc(mA.label)} (D=0)</text>`;
  svg += `<circle cx="${pad.l + 160}" cy="${legY}" r="4" fill="none" stroke="${mB.color}" stroke-width="1.5"/><text x="${pad.l + 168}" y="${legY + 4}" fill="${AX_COLOR}" font-size="10" font-family="${SERIF}">${esc(mB.label)} (D=1)</text>`;

  document.getElementById('figJ-scatter').innerHTML =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="display:block;background:${SVG_BG}">${svgBorder(W, H)}${svg}</svg>`;

  // ── Regression table ─────────────────────────────────────────
  const nc  = all.map(r => r.nc);
  const nc2 = all.map(r => r.nc * r.nc);
  const d   = all.map(r => r.d);
  const mob = all.map(r => r.mob);

  const X1 = all.map((_, i) => [1, nc[i], nc2[i], d[i]]);
  const X2 = all.map((_, i) => [1, nc[i], nc2[i], d[i], d[i] * nc[i]]);

  const m1 = fitMultipleOLS(X1, mob);
  const m2 = fitMultipleOLS(X2, mob);

  if (!m1 || !m2) {
    document.getElementById('figJ-results').innerHTML =
      '<p style="color:#c00">OLS computation failed (singular matrix).</p>';
    return;
  }

  const names1 = ['β₀ (intercept)', 'β₁ (NC)', 'β₂ (NC²)', '★ β₃ (D)'];
  const names2 = ['β₀ (intercept)', 'β₁ (NC)', 'β₂ (NC²)', '★ β₃ (D)', '★ β₄ (D·NC)'];

  function fmtB(v) { return (v >= 0 ? '+' : '') + v.toFixed(4); }
  function fmtSE(v) { return v.toFixed(4); }
  function fmtT(v) { return v.toFixed(2); }
  function fmtP(p, stars) { return `${p < 0.001 ? '<0.001' : p.toFixed(3)} ${stars}`; }

  const rows1 = m1.betas.map((b, j) => {
    const stars = pStars(m1.ps[j]);
    const star = names1[j].startsWith('★');
    return `<tr${star ? ' class="ols-key-row"' : ''}>
      <td>${names1[j]}</td>
      <td>${fmtB(b)}</td><td>${fmtSE(m1.ses[j])}</td><td>${fmtT(m1.ts[j])}</td><td>${fmtP(m1.ps[j], stars)}</td>
      <td>${fmtB(m2.betas[j])}</td><td>${fmtSE(m2.ses[j])}</td><td>${fmtT(m2.ts[j])}</td><td>${fmtP(m2.ps[j], pStars(m2.ps[j]))}</td>
    </tr>`;
  });
  // β₄ row (Model 2 only)
  const b4stars = pStars(m2.ps[4]);
  rows1.push(`<tr class="ols-key-row">
    <td>★ β₄ (D·NC)</td>
    <td colspan="4" style="color:#999;text-align:center">—</td>
    <td>${fmtB(m2.betas[4])}</td><td>${fmtSE(m2.ses[4])}</td><td>${fmtT(m2.ts[4])}</td><td>${fmtP(m2.ps[4], b4stars)}</td>
  </tr>`);

  // Interpretation
  const beta3sig = m1.ps[3] < 0.05;
  const beta4sig = m2.ps[4] < 0.05;
  let interp = `N = ${all.length} (${repsA.length} obs per config × 2). `;
  interp += beta3sig
    ? `The two configurations differ significantly in baseline mobility (β₃ = ${m1.betas[3].toFixed(3)}, p ${m1.ps[3] < 0.001 ? '< 0.001' : '= ' + m1.ps[3].toFixed(3)}).`
    : 'No significant difference in baseline mobility (β₃ ns).';
  interp += ' ';
  interp += beta4sig
    ? `Their sensitivity to new cases also differs significantly (β₄ = ${m2.betas[4].toFixed(3)}, p ${m2.ps[4] < 0.001 ? '< 0.001' : '= ' + m2.ps[4].toFixed(3)}).`
    : 'No significant difference in sensitivity slope (β₄ ns).';

  document.getElementById('figJ-results').innerHTML = `
    <div class="ols-table-wrap" style="overflow-x:auto">
      <table class="ols-table" style="min-width:700px">
        <thead>
          <tr>
            <th rowspan="2">Coefficient</th>
            <th colspan="4" style="text-align:center;border-bottom:1px solid #ccc">No interaction</th>
            <th colspan="4" style="text-align:center;border-bottom:1px solid #ccc">With D&middot;NC interaction</th>
          </tr>
          <tr>
            <th>β</th><th>SE</th><th>t</th><th>p</th>
            <th>β</th><th>SE</th><th>t</th><th>p</th>
          </tr>
        </thead>
        <tbody>${rows1.join('')}</tbody>
        <tfoot>
          <tr><td colspan="9" style="padding-top:6px;font-size:11px;color:#555">
            R² (no interaction) = ${m1.r2.toFixed(3)} &nbsp;|&nbsp; R² (with interaction) = ${m2.r2.toFixed(3)} &nbsp;|&nbsp;
            df = ${m1.df} (no int.), ${m2.df} (with int.) &nbsp;|&nbsp;
            ★ = key test rows &nbsp;|&nbsp; *** p&lt;0.001, ** p&lt;0.01, * p&lt;0.05
          </td></tr>
        </tfoot>
      </table>
    </div>
    <div class="ols-table-label" style="margin-top:10px;font-style:normal;text-transform:none;font-weight:normal;font-size:12px;color:#333;letter-spacing:0">${interp}</div>`;
}
