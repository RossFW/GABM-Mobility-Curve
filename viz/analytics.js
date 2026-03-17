// ============================================================
// GABM Mobility Curve — Analytics  (Paper 3 — academic style)
// Pure SVG charts, no Phaser dependency.
// Depends on: papaparse.min.js, config.js (CONFIG.MODELS, etc.)
// ============================================================
'use strict';

let macroData = [];   // all_macro.csv rows
let microCache = {};  // dirKey → micro CSV rows (loaded on demand)

// ── Chart geometry ───────────────────────────────────────────
const CW = 860, CH = 360, PAD = { t: 28, r: 24, b: 48, l: 58 };
const FIG_CW = 860, FIG_CH = 360, FIG_PAD = { t: 28, r: 24, b: 48, l: 58 };
const SMALL_CW = 252, SMALL_CH = 240, SMALL_PAD = { t: 22, r: 16, b: 40, l: 46 };

// Academic color constants
const AX_COLOR  = '#333333';   // axis text + tick marks
const GRID_COLOR = '#e5e5e5';  // gridlines
const SVG_BG    = '#ffffff';   // chart background

const LEVELS = CONFIG.INFECTION_LEVELS;

// ── Helpers ──────────────────────────────────────────────────
function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function levelToX(level, w, pad) {
  const idx = LEVELS.indexOf(+level);
  if (idx < 0) return pad.l;
  return pad.l + (idx / (LEVELS.length - 1)) * (w - pad.l - pad.r);
}

function pctToY(pct, h, pad) {
  return pad.t + (1 - pct / 100) * (h - pad.t - pad.b);
}

function modelKey(m) {
  return `${m.provider}|${m.model}|${m.reasoning}`;
}

function groupByModel(data) {
  const map = {};
  data.forEach(r => {
    const k = `${r.provider}|${r.model}|${r.reasoning}`;
    if (!map[k]) map[k] = [];
    map[k].push(r);
  });
  return map;
}

// ── SVG axis helpers (academic style) ────────────────────────
const SERIF = "Georgia,'Times New Roman',serif";

function xAxisTicks(w, h, pad) {
  const ticks = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0, 7.0];
  return ticks.map(t => {
    const x = levelToX(t, w, pad);
    return `<text x="${x}" y="${h - pad.b + 14}" fill="${AX_COLOR}" font-size="10" font-family="${SERIF}" text-anchor="middle">${t}%</text>` +
           `<line x1="${x}" y1="${h - pad.b}" x2="${x}" y2="${h - pad.b + 4}" stroke="${AX_COLOR}" stroke-width="0.8"/>`;
  }).join('');
}

function yAxisTicks(w, h, pad) {
  return [0, 25, 50, 75, 100].map(v => {
    const y = pctToY(v, h, pad);
    return `<text x="${pad.l - 8}" y="${y + 4}" fill="${AX_COLOR}" font-size="10" font-family="${SERIF}" text-anchor="end">${v}%</text>` +
           `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="${GRID_COLOR}" stroke-width="0.8"/>`;
  }).join('');
}

function axisLabels(w, h, pad, xlabel, ylabel) {
  return `<text x="${(pad.l + w - pad.r) / 2}" y="${h - 6}" fill="${AX_COLOR}" font-size="11" font-family="${SERIF}" text-anchor="middle" font-style="italic">${xlabel}</text>` +
         `<text x="12" y="${(pad.t + h - pad.b) / 2}" fill="${AX_COLOR}" font-size="11" font-family="${SERIF}" text-anchor="middle" font-style="italic" transform="rotate(-90,12,${(pad.t + h - pad.b) / 2})">${ylabel}</text>`;
}

function svgBorder(w, h) {
  return `<rect x="0" y="0" width="${w}" height="${h}" fill="none" stroke="#ccc" stroke-width="1"/>`;
}

// ── Build polyline from sorted rows ──────────────────────────
function makePolyline(rows, w, h, pad) {
  const sorted = [...rows].sort((a, b) => a.infection_level - b.infection_level);
  return sorted.map(r =>
    `${levelToX(r.infection_level, w, h, pad).toFixed ? levelToX(r.infection_level, w, pad).toFixed(1) : levelToX(r.infection_level, w, pad)},${pctToY(r.pct_stay_home, h, pad).toFixed(1)}`
  ).join(' ');
}

// ── Tooltip wiring ───────────────────────────────────────────
function wireTooltips(container) {
  const tooltip = document.createElement('div');
  tooltip.className = 'svg-tooltip';
  container.style.position = 'relative';
  container.appendChild(tooltip);

  container.addEventListener('mousemove', e => {
    const target = e.target.closest('.hit-target');
    if (!target) { tooltip.style.display = 'none'; return; }
    const label = target.dataset.label;
    const color = target.dataset.color;
    const extra = target.dataset.extra || '';
    const rect = container.getBoundingClientRect();
    tooltip.innerHTML = `<span style="color:${color};font-weight:bold">${label}</span>${extra ? '<br>' + extra : ''}`;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX - rect.left + 14) + 'px';
    tooltip.style.top  = (e.clientY - rect.top  - 28) + 'px';
  });
  container.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
}

// ── Build legend HTML ─────────────────────────────────────────
function legendHTML(items) {
  return items.map(item => {
    const bg = item.dash
      ? `background:repeating-linear-gradient(90deg,${item.color} 0px,${item.color} 5px,transparent 5px,transparent 8px)`
      : `background:${item.color}`;
    return `<div class="legend-item"><div class="legend-swatch" style="${bg}"></div><span>${item.label}</span></div>`;
  }).join('');
}

// ── SVG wrapper ───────────────────────────────────────────────
function makeSVG(w, h, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="display:block;background:${SVG_BG}">
    ${svgBorder(w, h)}
    ${inner}
  </svg>`;
}

// ═══════════════════════════════════════════════════════════════
// S0: Headline Summary Card
// ═══════════════════════════════════════════════════════════════
function renderS0() {
  const el = document.getElementById('s0-card');
  const grouped = groupByModel(macroData);

  const modelRates = [];
  CONFIG.MODELS.forEach(m => {
    const k = modelKey(m);
    const rows = grouped[k];
    if (!rows) return;
    const totalYes = rows.reduce((s, r) => s + (parseFloat(r.n_yes) || 0), 0);
    const totalN   = rows.reduce((s, r) => s + (parseFloat(r.n_total) || 0), 0);
    if (totalN === 0) return;
    modelRates.push({ m, rate: totalYes / totalN * 100 });
  });

  if (modelRates.length === 0) { el.innerHTML = '<div style="color:#777">No data loaded</div>'; return; }

  modelRates.sort((a, b) => b.rate - a.rate);
  const highest = modelRates[0];
  const lowest  = modelRates[modelRates.length - 1];
  const spread  = highest.rate - lowest.rate;

  const cards = [
    { val: `${highest.rate.toFixed(1)}%`, lbl: `${highest.m.label} — highest overall stay-home rate`, color: highest.m.color },
    { val: `${lowest.rate.toFixed(1)}%`,  lbl: `${lowest.m.label} — lowest overall stay-home rate`,  color: lowest.m.color  },
    { val: `${spread.toFixed(0)} pp`,     lbl: `Spread between most and least cautious model`,        color: '#111'          },
    { val: `${modelRates.length}`,        lbl: `Model configurations with complete data`,             color: '#111'          },
  ];

  el.innerHTML = cards.map(c =>
    `<div class="summary-stat"><div class="val" style="color:${c.color}">${c.val}</div><div class="lbl">${c.lbl}</div></div>`
  ).join('');

  document.getElementById('s0-section').style.display = 'block';
}

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
  providerSvg += yAxisTicks(w, h, pad) + xAxisTicks(w, h, pad) + axisLabels(w, h, pad, 'Infection level (% population)', '% agents staying home');

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
              axisLabels(w, h, pad, 'Infection level (% population)', '% agents staying home');
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
              axisLabels(w, h, pad, 'Infection level (% population)', '% agents staying home');
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
function renderFigC() {
  const el       = document.getElementById('figC-chart');
  const legendEl = document.getElementById('figC-legend');
  const w = FIG_CW, h = FIG_CH, pad = FIG_PAD;
  const grouped  = groupByModel(macroData);

  // Explicit ordered list: oldest → newest
  const targets = [
    { model: 'gpt-3.5-turbo', reasoning: 'off', label: 'GPT-3.5 Turbo',  color: '#000000' },
    { model: 'gpt-4o',        reasoning: 'off', label: 'GPT-4o',          color: '#E69F00' },
    { model: 'gpt-5.1',       reasoning: 'off', label: 'GPT-5.1',         color: '#0072B2' },
    { model: 'gpt-5.2',       reasoning: 'off', label: 'GPT-5.2',         color: '#009E73' },
  ];

  let inner = yAxisTicks(w, h, pad) + xAxisTicks(w, h, pad) +
              axisLabels(w, h, pad, 'Infection level (% population)', '% agents staying home');
  const legendItems = [];

  targets.forEach(t => {
    const k    = `openai|${t.model}|${t.reasoning}`;
    const rows = grouped[k];
    if (!rows || rows.length === 0) return;
    const pts = makePolyline(rows, w, h, pad);
    inner += `<polyline points="${pts}" stroke="${t.color}" stroke-width="2" fill="none" opacity="0.92"/>`;
    inner += `<polyline points="${pts}" stroke="transparent" stroke-width="14" fill="none" class="hit-target" data-label="${t.label}" data-color="${t.color}"/>`;
    legendItems.push({ label: t.label, color: t.color });
  });

  el.innerHTML = makeSVG(w, h, inner);
  wireTooltips(el);
  legendEl.innerHTML = legendHTML(legendItems);
  document.getElementById('figC-section').style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
// Figure D: Gemini Generational Progression (reasoning = off, no Lite)
// 3 distinct Okabe-Ito colors
// ═══════════════════════════════════════════════════════════════
function renderFigD() {
  const el       = document.getElementById('figD-chart');
  const legendEl = document.getElementById('figD-legend');
  const w = FIG_CW, h = FIG_CH, pad = FIG_PAD;
  const grouped  = groupByModel(macroData);

  // Explicit ordered list: oldest → newest (no Flash Lite)
  const targets = [
    { model: 'gemini-2.0-flash',       reasoning: 'off', label: 'Gemini 2.0 Flash',         color: '#000000' },
    { model: 'gemini-2.5-flash',       reasoning: 'off', label: 'Gemini 2.5 Flash',          color: '#D55E00' },
    { model: 'gemini-3-flash-preview', reasoning: 'off', label: 'Gemini 3 Flash Preview',    color: '#0072B2' },
  ];

  let inner = yAxisTicks(w, h, pad) + xAxisTicks(w, h, pad) +
              axisLabels(w, h, pad, 'Infection level (% population)', '% agents staying home');
  const legendItems = [];

  targets.forEach(t => {
    const k    = `gemini|${t.model}|${t.reasoning}`;
    const rows = grouped[k];
    if (!rows || rows.length === 0) return;
    const pts = makePolyline(rows, w, h, pad);
    inner += `<polyline points="${pts}" stroke="${t.color}" stroke-width="2" fill="none" opacity="0.92"/>`;
    inner += `<polyline points="${pts}" stroke="transparent" stroke-width="14" fill="none" class="hit-target" data-label="${t.label}" data-color="${t.color}"/>`;
    legendItems.push({ label: t.label, color: t.color });
  });

  el.innerHTML = makeSVG(w, h, inner);
  wireTooltips(el);
  legendEl.innerHTML = legendHTML(legendItems);
  document.getElementById('figD-section').style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
// S2: Paper 1 Legacy Comparison
// ═══════════════════════════════════════════════════════════════
function renderS2() {
  const el       = document.getElementById('s2-chart');
  const legendEl = document.getElementById('s2-legend');
  const w = CW, h = CH, pad = PAD;
  const grouped  = groupByModel(macroData);

  const gpt35 = CONFIG.MODELS.find(m => m.model === 'gpt-3.5-turbo');
  const modernReps = [
    CONFIG.MODELS.find(m => m.model === 'claude-sonnet-4-5'),
    CONFIG.MODELS.find(m => m.model === 'gpt-5.2'               && m.reasoning === 'off'),
    CONFIG.MODELS.find(m => m.model === 'gemini-3-flash-preview' && m.reasoning === 'off'),
  ].filter(Boolean);

  const highlightKeys = new Set();
  if (gpt35) highlightKeys.add(modelKey(gpt35));
  modernReps.forEach(m => highlightKeys.add(modelKey(m)));

  let inner = yAxisTicks(w, h, pad) + xAxisTicks(w, h, pad) +
              axisLabels(w, h, pad, 'Infection level (% population)', '% agents staying home');
  let hitTargets = '';
  const legendItems = [];

  CONFIG.MODELS.forEach(m => {
    const k    = modelKey(m);
    const rows = grouped[k];
    if (!rows || rows.length === 0) return;
    if (highlightKeys.has(k)) return;
    const pts      = makePolyline(rows, w, h, pad);
    const dashAttr = m.dash ? ` stroke-dasharray="${m.dash}"` : '';
    inner      += `<polyline points="${pts}" stroke="#888" stroke-width="1" fill="none" opacity="0.35"${dashAttr}/>`;
    hitTargets += `<polyline points="${pts}" stroke="transparent" stroke-width="14" fill="none" class="hit-target" data-label="${esc(m.label)}" data-color="#666"/>`;
  });

  modernReps.forEach(m => {
    const k    = modelKey(m);
    const rows = grouped[k];
    if (!rows || rows.length === 0) return;
    const pts = makePolyline(rows, w, h, pad);
    inner      += `<polyline points="${pts}" stroke="${m.color}" stroke-width="2" fill="none" opacity="0.9"/>`;
    hitTargets += `<polyline points="${pts}" stroke="transparent" stroke-width="14" fill="none" class="hit-target" data-label="${esc(m.label)}" data-color="${m.color}"/>`;
    legendItems.push({ label: m.label, color: m.color });
  });

  if (gpt35) {
    const k    = modelKey(gpt35);
    const rows = grouped[k];
    if (rows && rows.length > 0) {
      const pts = makePolyline(rows, w, h, pad);
      inner      += `<polyline points="${pts}" stroke="#E69F00" stroke-width="3" fill="none" opacity="1" stroke-dasharray="8,4"/>`;
      hitTargets += `<polyline points="${pts}" stroke="transparent" stroke-width="14" fill="none" class="hit-target" data-label="GPT-3.5 Turbo (Paper 1 baseline)" data-color="#E69F00"/>`;
      legendItems.unshift({ label: 'GPT-3.5 Turbo (Paper 1 baseline)', color: '#E69F00', dash: '8,4' });
    }
  }

  el.innerHTML = makeSVG(w, h, inner + hitTargets);
  wireTooltips(el);
  legendEl.innerHTML = legendHTML(legendItems);
  document.getElementById('s2-section').style.display = 'block';
}

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
                axisLabels(w, h, pad, 'Infection level', '% stay home');
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
function renderS6() {
  const el      = document.getElementById('s6-cards');
  const grouped = groupByModel(macroData);

  const modelStats = {};
  CONFIG.MODELS.forEach(m => {
    const k    = modelKey(m);
    const rows = grouped[k];
    if (!rows) return;
    const totalYes = rows.reduce((s, r) => s + (parseFloat(r.n_yes)   || 0), 0);
    const totalN   = rows.reduce((s, r) => s + (parseFloat(r.n_total) || 0), 0);
    const rate0    = rows.find(r => parseFloat(r.infection_level) === 0);
    modelStats[k]  = {
      m, overallRate: totalN > 0 ? totalYes / totalN * 100 : 0,
      stayHomeAt0: rate0 ? parseFloat(rate0.pct_stay_home) : null, rows,
    };
  });

  const outliers = [];

  const gpt4o = Object.values(modelStats).find(s => s.m.model === 'gpt-4o');
  if (gpt4o) {
    outliers.push({
      title: `GPT-4o: ${gpt4o.overallRate.toFixed(1)}% overall stay-home rate`,
      desc:  'Nearly never stays home regardless of infection level — the most "go out" model in the study.',
      color: gpt4o.m.color, rows: gpt4o.rows,
    });
  }

  const lite = Object.values(modelStats).find(s => s.m.model === 'gemini-2.5-flash-lite');
  if (lite) {
    const low  = lite.rows.filter(r => parseFloat(r.infection_level) <= 1.0);
    const high = lite.rows.filter(r => parseFloat(r.infection_level) >= 3.0);
    const avgLow  = low.length  > 0 ? low.reduce( (s,r) => s + parseFloat(r.pct_stay_home), 0) / low.length  : 0;
    const avgHigh = high.length > 0 ? high.reduce((s,r) => s + parseFloat(r.pct_stay_home), 0) / high.length : 0;
    outliers.push({
      title: 'Gemini 2.5 Flash Lite: Inverted response curve',
      desc:  `Average stay-home at low infection: ${avgLow.toFixed(1)}% vs. high infection: ${avgHigh.toFixed(1)}%. The curve runs backwards — more cautious at low than high infection.`,
      color: lite.m.color, rows: lite.rows,
    });
  }

  const gpt35 = Object.values(modelStats).find(s => s.m.model === 'gpt-3.5-turbo');
  if (gpt35 && gpt35.stayHomeAt0 !== null) {
    outliers.push({
      title: `GPT-3.5 at 0% infection: ${gpt35.stayHomeAt0.toFixed(1)}% stay home`,
      desc:  'Over half of agents stay home even with zero reported cases. The Paper 1 model is extremely cautious by default.',
      color: '#E69F00', rows: gpt35.rows,
    });
  }

  const miniW = 260, miniH = 130, miniPad = { t: 14, r: 12, b: 28, l: 38 };
  el.innerHTML = outliers.map(o => {
    let miniSvg = '';
    if (o.rows) {
      const pts = makePolyline(o.rows, miniW, miniH, miniPad);
      const miniInner = yAxisTicks(miniW, miniH, miniPad) +
        `<polyline points="${pts}" stroke="${o.color}" stroke-width="2" fill="none" opacity="0.9"/>`;
      miniSvg = makeSVG(miniW, miniH, miniInner);
    }
    return `<div class="outlier-card">
      <div class="oc-title" style="color:${o.color}">${o.title}</div>
      <div class="oc-desc">${o.desc}</div>
      ${miniSvg}
    </div>`;
  }).join('');

  document.getElementById('s6-section').style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
// S7: Agent-Level Analysis — Heatmap + Concordance
// ═══════════════════════════════════════════════════════════════
let s7SelectedIdx = 0;

function buildModelPicker(containerId, selectedIdx, onChange) {
  const el        = document.getElementById(containerId);
  const providers = ['anthropic', 'openai', 'gemini'];
  const labels    = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini' };

  let html = '<select class="model-picker">';
  providers.forEach(p => {
    html += `<optgroup label="${labels[p]}">`;
    CONFIG.MODELS.forEach((m, i) => {
      if (m.provider !== p) return;
      html += `<option value="${i}"${i === selectedIdx ? ' selected' : ''}>${m.label}</option>`;
    });
    html += '</optgroup>';
  });
  html += '</select>';
  el.innerHTML = html;
  el.querySelector('select').addEventListener('change', e => onChange(+e.target.value));
}

function loadMicro(modelIdx, callback) {
  const m      = CONFIG.MODELS[modelIdx];
  const dirKey = configDirKey(m);
  if (microCache[dirKey]) { callback(microCache[dirKey], m); return; }

  const path = `${CONFIG.DATA_BASE}/${dirKey}/probe_results_micro.csv`;
  Papa.parse(path, {
    download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
    complete({ data }) {
      microCache[dirKey] = data;
      callback(data, m);
    },
    error() {
      const hmEl = document.getElementById('s7-heatmap');
      if (hmEl) hmEl.innerHTML = `<div style="color:#c00;padding:20px;font-size:12px">Failed to load micro data for ${esc(m.label)}</div>`;
    },
  });
}

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

  const yLabel = `<text x="10" y="${oy + nAgents * cellH / 2}" fill="${AX_COLOR}" font-size="10" text-anchor="middle" font-family="${SERIF}" font-style="italic" transform="rotate(-90,10,${oy + nAgents * cellH / 2})">Agents (sorted)</text>`;
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

  const agentLevelVotes = {};
  microRows.forEach(r => {
    if (!agentLevelVotes[r.agent_id]) agentLevelVotes[r.agent_id] = {};
    if (!agentLevelVotes[r.agent_id][r.infection_level])
      agentLevelVotes[r.agent_id][r.infection_level] = { yes: 0, no: 0 };
    agentLevelVotes[r.agent_id][r.infection_level][r.response]++;
  });

  const agentIds = Object.keys(agentLevelVotes).map(Number);
  const nAgents  = agentIds.length;

  const unanimousData = [], strongData = [], bareData = [];
  LEVELS.forEach(level => {
    let unanimous = 0, strong = 0, bare = 0;
    agentIds.forEach(id => {
      const v = agentLevelVotes[id]?.[level];
      if (!v) return;
      const mx = Math.max(v.yes, v.no);
      if (mx === 5) unanimous++;
      if (mx >= 4)  strong++;
      if (mx >= 3)  bare++;
    });
    unanimousData.push({ level, pct: (unanimous / nAgents) * 100 });
    strongData.push({    level, pct: (strong    / nAgents) * 100 });
    bareData.push({      level, pct: (bare      / nAgents) * 100 });
  });

  const panels = [
    { title: 'Unanimous (5/5)',        data: unanimousData, color: '#0072B2' },
    { title: 'Strong majority (\u22654/5)', data: strongData,    color: '#56B4E9' },
    { title: 'Bare majority (\u22653/5)',   data: bareData,      color: '#888888' },
  ];

  const w = SMALL_CW, h = SMALL_CH, pad = SMALL_PAD;

  el.innerHTML = `<div style="display:flex;gap:20px;flex-wrap:wrap">` +
    panels.map(p => {
      const pts = p.data.map(d =>
        `${levelToX(d.level, w, pad).toFixed(1)},${pctToY(d.pct, h, pad).toFixed(1)}`
      ).join(' ');
      const inner = yAxisTicks(w, h, pad) + xAxisTicks(w, h, pad) +
        axisLabels(w, h, pad, 'Infection level', '% agents') +
        `<polyline points="${pts}" stroke="${p.color}" stroke-width="2" fill="none" opacity="0.9"/>`;
      return `<div style="flex:1;min-width:220px">
        <div style="font-size:12px;font-weight:bold;color:#333;text-align:center;margin-bottom:6px">${p.title}</div>
        ${makeSVG(w, h, inner)}
      </div>`;
    }).join('') +
  `</div>`;
}

function renderS7(microRows, cfg) {
  renderS7Heatmap(microRows, cfg);
  renderS7Concordance(microRows, cfg);
}

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
function init() {
  Papa.parse(CONFIG.ALL_MACRO, {
    download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
    complete({ data }) {
      macroData = data;
      document.getElementById('loading').style.display = 'none';

      renderS0();
      renderS1();
      renderFigA();
      renderFigB();
      renderFigC();
      renderFigD();
      renderS2();
      renderS3();
      renderS6();

      // S7: agent-level (needs micro data, lazy-loaded)
      document.getElementById('s7-section').style.display = 'block';
      buildModelPicker('s7-model-select', s7SelectedIdx, idx => {
        s7SelectedIdx = idx;
        loadMicro(idx, renderS7);
      });
      loadMicro(s7SelectedIdx, renderS7);
    },
    error() {
      document.getElementById('loading').innerHTML =
        '<span style="color:#c00">Failed to load macro data. Is the HTTP server running from the viz/ directory?</span>';
    },
  });
}

init();
