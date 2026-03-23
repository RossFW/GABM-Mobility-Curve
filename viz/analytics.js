// ============================================================
// GABM Mobility Curve — Analytics  (Paper 3 — academic style)
// Pure SVG charts, no Phaser dependency.
// Depends on: papaparse.min.js, config.js (CONFIG.MODELS, etc.)
// ============================================================
'use strict';

let macroData = [];      // all_macro.csv rows
let microCache = {};     // dirKey → micro CSV rows (loaded on demand)
let olsResults = [];     // [{key,provider,model,reasoning,label,color,alpha,beta,r2,alpha_logit,beta_logit}]
let modelMetadata = [];  // rows from data/metadata/models.csv
// tab2Rendered removed — Model Characteristics tab retired
let tab3Rendered = false;
let agentTabRendered = false;
let agentsData = null; // cached agents.json
let tabRegRendered = false;
let comparisonLensRendered = false;
let _comparisonAllRegs = null;
let _comparisonConsistencyData = null;

// ── Model groups for Comparison Lens ─────────────────────────
const MODEL_GROUPS = {
  provider: {
    label: 'Provider',
    groups: [
      { name: 'Anthropic',  filter: m => m.provider === 'anthropic' },
      { name: 'OpenAI',     filter: m => m.provider === 'openai' },
      { name: 'Google',     filter: m => m.provider === 'gemini' },
    ]
  },
  reasoning: {
    label: 'Reasoning',
    groups: [
      { name: 'GPT-5.2 Levels',        filter: m => m.model === 'gpt-5.2' },
      { name: 'Gemini 3 Flash Levels',  filter: m => m.model === 'gemini-3-flash-preview' },
      { name: 'Non-Reasoning Only',     filter: m => m.reasoning === 'off' },
    ]
  },
  size: {
    label: 'Size',
    groups: [
      { name: 'Anthropic 4.5 Family',  filter: m => m.provider === 'anthropic' && m.generation === 3 },
      { name: 'Gemini 2.5 Family',     filter: m => ['gemini-2.5-flash', 'gemini-2.5-flash-lite'].includes(m.model) },
    ]
  },
  evolution: {
    label: 'Evolution',
    groups: [
      { name: 'Anthropic Generations', filter: m => ['claude-3-haiku-20240307', 'claude-sonnet-4-0', 'claude-sonnet-4-5'].includes(m.model) },
      { name: 'OpenAI Generations',    filter: m => m.provider === 'openai' && m.reasoning === 'off' },
      { name: 'Gemini Flash Line',     filter: m => m.provider === 'gemini' && m.reasoning === 'off' },
    ]
  },
  cutoff: {
    label: 'Knowledge Cutoff',
    groups: [
      { name: 'Legacy (Gen 1)',    filter: m => m.generation === 1 },
      { name: 'Mid (Gen 2)',      filter: m => m.generation === 2 },
      { name: 'Current (Gen 3+)', filter: m => m.generation >= 3 },
    ]
  },
  release: {
    label: 'Release Date',
    groups: [
      { name: 'Legacy (Gen 1)',    filter: m => m.generation === 1 },
      { name: 'Mid (Gen 2)',      filter: m => m.generation === 2 },
      { name: 'Current (Gen 3+)', filter: m => m.generation >= 3 },
    ]
  },
};

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
    `${levelToX(r.infection_level, w, h, pad).toFixed ? levelToX(r.infection_level, w, pad).toFixed(1) : levelToX(r.infection_level, w, pad)},${pctToY(100 - r.pct_stay_home, h, pad).toFixed(1)}`
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
// OLS HELPERS
// ═══════════════════════════════════════════════════════════════

function fitOLS(xs, ys) {
  const n = xs.length;
  if (n < 2) return { alpha: 0, beta: 0, r2: 0 };
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  xs.forEach((x, i) => { num += (x - mx) * (ys[i] - my); den += (x - mx) ** 2; });
  const beta = den ? num / den : 0;
  const alpha = my - beta * mx;
  const yhat = xs.map(x => alpha + beta * x);
  const ss_res = ys.reduce((s, y, i) => s + (y - yhat[i]) ** 2, 0);
  const ss_tot = ys.reduce((s, y) => s + (y - my) ** 2, 0);
  const r2 = ss_tot > 0 ? 1 - ss_res / ss_tot : 0;
  return { alpha, beta, r2 };
}

function fitLogisticOLS(xs, ys) {
  // logit-transform ys (treating as 0–100 pct → divide by 100 first, clamp)
  const clamp = p => Math.max(0.01, Math.min(0.99, p / 100));
  const logit_ys = ys.map(y => { const p = clamp(y); return Math.log(p / (1 - p)); });
  return fitOLS(xs, logit_ys);
}

function fitQuadraticOLS(xs, ys) {
  const n = xs.length;
  if (n < 3) return { b0: 0, b1: 0, b2: 0, r2: 0 };
  let sx=0, sx2=0, sx3=0, sx4=0, sy=0, sxy=0, sx2y=0;
  xs.forEach((x, i) => {
    const y = ys[i], x2 = x * x;
    sx += x; sx2 += x2; sx3 += x2 * x; sx4 += x2 * x2;
    sy += y; sxy += x * y; sx2y += x2 * y;
  });
  const A = [[n, sx, sx2], [sx, sx2, sx3], [sx2, sx3, sx4]];
  const b = [sy, sxy, sx2y];
  const det = M =>
    M[0][0] * (M[1][1]*M[2][2] - M[1][2]*M[2][1]) -
    M[0][1] * (M[1][0]*M[2][2] - M[1][2]*M[2][0]) +
    M[0][2] * (M[1][0]*M[2][1] - M[1][1]*M[2][0]);
  const rep = (M, col, v) => M.map((row, i) => row.map((c, j) => j === col ? v[i] : c));
  const D = det(A);
  if (!D) return { b0: 0, b1: 0, b2: 0, r2: 0 };
  const b0 = det(rep(A, 0, b)) / D;
  const b1 = det(rep(A, 1, b)) / D;
  const b2 = det(rep(A, 2, b)) / D;
  const my = sy / n;
  const yhat = xs.map(x => b0 + b1 * x + b2 * x * x);
  const ss_res = ys.reduce((s, y, i) => s + (y - yhat[i]) ** 2, 0);
  const ss_tot = ys.reduce((s, y) => s + (y - my) ** 2, 0);
  const r2 = ss_tot > 0 ? 1 - ss_res / ss_tot : 0;
  return { b0, b1, b2, r2 };
}

// Compute OLS for all 21 configs from macroData, store in olsResults
function computeAllOLS() {
  olsResults = CONFIG.MODELS.map(m => {
    const rows = macroData.filter(r =>
      r.provider === m.provider && r.model === m.model && r.reasoning === m.reasoning
    ).sort((a, b) => a.infection_level - b.infection_level);
    const xs = rows.map(r => +r.infection_level);
    const ys = rows.map(r => 100 - +r.pct_stay_home);
    const lin = fitOLS(xs, ys);
    const quad = fitQuadraticOLS(xs, ys);
    const log = fitLogisticOLS(xs, ys);
    return {
      key: configDirKey(m),
      provider: m.provider, model: m.model, reasoning: m.reasoning,
      label: m.label, color: m.color, dash: m.dash,
      // Linear (kept for scatter/trend charts that use alpha/beta)
      alpha: lin.alpha, beta: lin.beta, r2: lin.r2,
      // Quadratic (primary model: Y = b0 + b1*X + b2*X²)
      b0: quad.b0, b1: quad.b1, b2: quad.b2, r2q: quad.r2,
      alpha_logit: log.alpha, beta_logit: log.beta,
    };
  });
}

// Render a small OLS stat table into a <table> element
function renderOLSTable(tableId, keys, baseline) {
  const el = document.getElementById(tableId);
  if (!el) return;
  const subset = keys.map(k => olsResults.find(r => r.key === k)).filter(Boolean);
  if (!subset.length) return;
  const baseB0 = baseline ? (olsResults.find(r => r.key === baseline)?.b0 ?? 0) : null;
  const baseB1 = baseline ? (olsResults.find(r => r.key === baseline)?.b1 ?? 0) : null;
  const hasBaseline = baseline !== null && baseline !== undefined;
  el.innerHTML = `
    <thead><tr>
      <th>Model</th>
      <th>&beta;&#x2080; (intercept, %)</th>
      <th>&beta;&#x2081; (linear)</th>
      <th>&beta;&#x2082; (quadratic)</th>
      <th>R&sup2;</th>
      ${hasBaseline ? '<th>&Delta;&beta;&#x2080;</th><th>&Delta;&beta;&#x2081;</th>' : ''}
    </tr></thead>
    <tbody>
      ${subset.map(r => `<tr>
        <td>${esc(r.label)}</td>
        <td>${r.b0.toFixed(1)}%</td>
        <td>${r.b1 >= 0 ? '+' : ''}${r.b1.toFixed(2)}</td>
        <td>${r.b2 >= 0 ? '+' : ''}${r.b2.toFixed(3)}</td>
        <td>${r.r2q.toFixed(2)}</td>
        ${hasBaseline ? `<td>${(r.b0 - baseB0) >= 0 ? '+' : ''}${(r.b0 - baseB0).toFixed(1)}%</td>
                         <td>${(r.b1 - baseB1) >= 0 ? '+' : ''}${(r.b1 - baseB1).toFixed(2)}</td>` : ''}
      </tr>`).join('')}
    </tbody>`;
}

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

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
// ── Tab switching ─────────────────────────────────────────────
// ── Section filter sub-nav ────────────────────────────────────
function filterSectionTab(paneId, navId, filter) {
  document.querySelectorAll(`#${navId} .section-link`).forEach(l =>
    l.classList.toggle('active', l.dataset.filter === filter)
  );
  // Section headers only shown in 'all' view
  document.querySelectorAll(`#${paneId} .curve-section-header`).forEach(el => {
    el.style.display = (filter === 'all') ? '' : 'none';
  });
  // Show/hide figure sections by data-section attribute
  document.querySelectorAll(`#${paneId} .section[data-section]`).forEach(el => {
    el.style.display = (filter === 'all' || el.dataset.section === filter) ? 'block' : 'none';
  });
}

function initSectionNavs() {
  document.querySelectorAll('#curves-section-nav .section-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      filterSectionTab('tab-curves', 'curves-section-nav', link.dataset.filter);
    });
  });
  document.querySelectorAll('#agents-section-nav .section-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      filterSectionTab('tab-agents', 'agents-section-nav', link.dataset.filter);
    });
  });
  document.querySelectorAll('#responses-section-nav .section-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      filterSectionTab('tab-responses', 'responses-section-nav', link.dataset.filter);
    });
  });
  document.querySelectorAll('#author-section-nav .section-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      filterSectionTab('tab-author', 'author-section-nav', link.dataset.filter);
    });
  });

  // Initialize all tabs to "all" view so display:none sections become visible
  filterSectionTab('tab-curves', 'curves-section-nav', 'all');
  filterSectionTab('tab-agents', 'agents-section-nav', 'all');
  filterSectionTab('tab-responses', 'responses-section-nav', 'all');
  filterSectionTab('tab-author', 'author-section-nav', 'all');
}

let authorCrossModelRendered = false;
let authorPerModelRendered = false;
function renderAuthorComparisons() {
  // Cross-model charts (27a, 27) — safe to render from any tab (use 860 fallback)
  if (!authorCrossModelRendered) {
    authorCrossModelRendered = true;
    loadAgentsJSON(() => {
      loadAllRegressions(allRegs => {
        renderTraitVsInfectionOR(allRegs, 'comparison-27a-chart');
        renderInfectionORProgression(allRegs, 'comparison-27-chart');
      });
    });
  }
}
function renderAuthorPerModelComparisons() {
  // Per-model charts (28a, 28) — must render when Author Notes tab is visible
  if (authorPerModelRendered) return;
  authorPerModelRendered = true;
  loadAgentsJSON(() => {
    // 28a: waterfall (uses fig36 IDs now in Author Notes)
    buildModelPicker('fig36-model-select', 0, idx => {
      loadMicro(idx, (rows, cfg) => {
        loadRegression(idx, (regData) => {
          renderFig36Waterfall(rows, cfg, regData);
        });
      });
    });
    // Initial render for 28a
    loadMicro(0, (rows, cfg) => {
      loadRegression(0, (regData) => {
        renderFig36Waterfall(rows, cfg, regData);
      });
    });
    // 28 copy: three forces in comparison section
    buildModelPicker('comparison-28b-model-select', 0, idx => {
      loadMicro(idx, (rows, cfg) => {
        loadRegression(idx, (regData) => {
          renderFig37ThreeForces(rows, cfg, regData, 'comparison-28b-chart', 'comparison-28b-detail');
        });
      });
    });
    // Initial render for 28 copy
    loadMicro(0, (rows, cfg) => {
      loadRegression(0, (regData) => {
        renderFig37ThreeForces(rows, cfg, regData, 'comparison-28b-chart', 'comparison-28b-detail');
      });
    });
    // Decision Surface vs Figure 26 comparison
    buildModelPicker('comparison-surface-model-select', 0, idx => {
      loadRegression(idx, (regData, cfg) => renderDecisionSurface(regData, cfg, 'comparison-surface-chart'));
    });
    loadRegression(0, (regData, cfg) => renderDecisionSurface(regData, cfg, 'comparison-surface-chart'));
    buildModelPicker('comparison-surface-forces-model-select', 0, idx => {
      loadMicro(idx, (rows, cfg) => {
        loadRegression(idx, (regData) => {
          renderFig37ThreeForces(rows, cfg, regData, 'comparison-surface-forces-chart', 'comparison-surface-forces-detail');
        });
      });
    });
    loadMicro(0, (rows, cfg) => {
      loadRegression(0, (regData) => {
        renderFig37ThreeForces(rows, cfg, regData, 'comparison-surface-forces-chart', 'comparison-surface-forces-detail');
      });
    });
    // Fig 32: predicted vs actual transition points (moved from Cohort Misc to Author Notes)
    buildModelPicker('fig32-model-select', 0, idx => {
      loadMicro(idx, (rows, cfg) => {
        loadRegression(idx, (regData) => {
          renderFig32TransitionScatter(rows, cfg, regData);
        });
      });
    });
    loadMicro(0, (rows, cfg) => {
      loadRegression(0, (regData) => {
        renderFig32TransitionScatter(rows, cfg, regData);
      });
    });
  });
}

function initTabs() {
  document.querySelectorAll('#tab-nav .tab-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const tab = link.dataset.tab;
      document.querySelectorAll('#tab-nav .tab-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      const pane = document.getElementById('tab-' + tab);
      if (pane) pane.classList.add('active');
      // Lazy-render Cohort Analysis on first visit
      if (tab === 'agents' && !tab3Rendered) {
        renderAgentAnalysis();
        tab3Rendered = true;
      }
      // Lazy-render Response Analysis (spotlight) on first visit
      if (tab === 'responses' && !agentTabRendered) {
        agentTabRendered = true;
        loadAgentsJSON(initFig23Spotlight);
      }
      // Lazy-render Author Notes comparisons
      if (tab === 'author') {
        renderAuthorComparisons();
        renderAuthorPerModelComparisons();
      }
    });
  });
  // Activate first tab
  document.getElementById('tab-curves').classList.add('active');
}

const regToggleRendered = {};
const regToggleConfigs = {
  // Reasoning comparisons (array form → renderReasoningRegTable)
  'reg-gpt52': [
    'openai_gpt-5_2_off', 'openai_gpt-5_2_low',
    'openai_gpt-5_2_medium', 'openai_gpt-5_2_high',
  ],
  'reg-gemini3flash': [
    'gemini_gemini-3-flash-preview_off', 'gemini_gemini-3-flash-preview_low',
    'gemini_gemini-3-flash-preview_medium', 'gemini_gemini-3-flash-preview_high',
  ],
  // Model comparisons (object form → renderModelDummyRegTable)
  'reg-figAnthro': {
    configs:  ['anthropic_claude-haiku-4-5_off', 'anthropic_claude-sonnet-4-5_off', 'anthropic_claude-opus-4-5_off'],
    labels:   ['Sonnet 4.5', 'Opus 4.5'],
    baseline: 'Claude Haiku 4.5',
  },
  'reg-figGeminiLite': {
    configs:  ['gemini_gemini-2_5-flash-lite_off', 'gemini_gemini-2_5-flash_off'],
    labels:   ['2.5 Flash'],
    baseline: 'Gemini 2.5 Flash Lite',
  },
  'reg-figD': {
    configs:  ['gemini_gemini-2_0-flash_off', 'gemini_gemini-2_5-flash_off', 'gemini_gemini-3-flash-preview_off'],
    labels:   ['2.5 Flash', '3 Flash'],
    baseline: 'Gemini 2.0 Flash',
  },
  'reg-figAnthroGen': {
    configs:  ['anthropic_claude-sonnet-4-0_off', 'anthropic_claude-sonnet-4-5_off'],
    labels:   ['Sonnet 4.5'],
    baseline: 'Claude Sonnet 4.0',
  },
  'reg-figC': {
    configs:  ['openai_gpt-3_5-turbo_off', 'openai_gpt-4o_off', 'openai_gpt-5_1_off', 'openai_gpt-5_2_off'],
    labels:   ['GPT-4o', 'GPT-5.1', 'GPT-5.2'],
    baseline: 'GPT-3.5 Turbo',
  },
  'reg-figFlagship': {
    configs:  ['anthropic_claude-opus-4-5_off', 'openai_gpt-5_2_off', 'gemini_gemini-3-flash-preview_off'],
    labels:   ['GPT-5.2', 'Gemini 3 Flash'],
    baseline: 'Claude Opus 4.5',
  },
  // Knowledge Cutoff groupings
  'reg-figCutPre24': {
    configs:  ['openai_gpt-3_5-turbo_off', 'anthropic_claude-3-haiku-20240307_off', 'openai_gpt-4o_off'],
    labels:   ['Claude 3 Haiku', 'GPT-4o'],
    baseline: 'GPT-3.5 Turbo',
  },
  'reg-figCutMid24': {
    configs:  ['openai_gpt-4_1_off', 'openai_o3_required', 'gemini_gemini-2_0-flash_off', 'openai_gpt-5_1_off'],
    labels:   ['o3', 'Gemini 2.0 Flash', 'GPT-5.1'],
    baseline: 'GPT-4.1',
  },
  'reg-figCutEarly25': {
    configs:  ['anthropic_claude-sonnet-4-5_off', 'anthropic_claude-haiku-4-5_off', 'anthropic_claude-sonnet-4-0_off',
               'gemini_gemini-2_5-flash_off', 'gemini_gemini-2_5-flash-lite_off', 'gemini_gemini-3-flash-preview_off'],
    labels:   ['Haiku 4.5', 'Sonnet 4.0', 'Gemini 2.5 Flash', 'Gemini 2.5 Flash Lite', 'Gemini 3 Flash'],
    baseline: 'Claude Sonnet 4.5',
  },
  'reg-figCutLate25': {
    configs:  ['anthropic_claude-opus-4-5_off', 'openai_gpt-5_2_off'],
    labels:   ['GPT-5.2'],
    baseline: 'Claude Opus 4.5',
  },
  // Release Date groupings
  'reg-figRelLegacy': {
    configs:  ['openai_gpt-3_5-turbo_off', 'anthropic_claude-3-haiku-20240307_off', 'openai_gpt-4o_off'],
    labels:   ['Claude 3 Haiku', 'GPT-4o'],
    baseline: 'GPT-3.5 Turbo',
  },
  'reg-figRelSpring': {
    configs:  ['gemini_gemini-2_0-flash_off', 'openai_gpt-4_1_off', 'openai_o3_required',
               'anthropic_claude-sonnet-4-0_off', 'gemini_gemini-2_5-flash_off', 'gemini_gemini-2_5-flash-lite_off'],
    labels:   ['GPT-4.1', 'o3', 'Sonnet 4.0', 'Gemini 2.5 Flash', 'Gemini 2.5 Flash Lite'],
    baseline: 'Gemini 2.0 Flash',
  },
  'reg-figRelLate': {
    configs:  ['anthropic_claude-sonnet-4-5_off', 'anthropic_claude-haiku-4-5_off', 'anthropic_claude-opus-4-5_off',
               'openai_gpt-5_1_off', 'openai_gpt-5_2_off', 'gemini_gemini-3-flash-preview_off'],
    labels:   ['Haiku 4.5', 'Opus 4.5', 'GPT-5.1', 'GPT-5.2', 'Gemini 3 Flash'],
    baseline: 'Claude Sonnet 4.5',
  },
};

function initRegToggles() {
  document.querySelectorAll('.reg-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const panel = document.getElementById(targetId);
      if (!panel) return;
      const open = panel.style.display !== 'none';
      panel.style.display = open ? 'none' : 'block';
      btn.textContent = open ? 'Show Regression \u25be' : 'Hide Regression \u25b4';
      if (!open && !regToggleRendered[targetId]) {
        const cfg = regToggleConfigs[targetId];
        if (Array.isArray(cfg)) {
          renderReasoningRegTable(targetId, cfg);
        } else {
          renderModelDummyRegTable(targetId, cfg.configs, cfg.labels, cfg.baseline);
        }
        regToggleRendered[targetId] = true;
      }
    });
  });
}

function init() {
  initTabs();
  initRegToggles();
  initSectionNavs();
  renderLogOddsWalkthrough();

  Papa.parse(CONFIG.ALL_MACRO, {
    download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
    complete({ data }) {
      macroData = data;
      document.getElementById('loading').style.display = 'none';

      // Compute OLS for all 21 configs
      computeAllOLS();

      // ── Tab 1: Mobility Curves ────────────────────────────────
      renderFigA();
      renderFigB();
      renderFigAnthro();
      renderFigGeminiLite();
      renderFigD();
      renderFigAnthroGen();
      renderFigC();
      renderFigFlagship();
      renderFigCutPre24();
      renderFigCutMid24();
      renderFigCutEarly25();
      renderFigCutLate25();
      renderFigRelLegacy();
      renderFigRelSpring();
      renderFigRelLate();
      renderS3();

      // Figure 20: Comparison Tool (needs micro data, lazy-loaded on run)
      initFigJ();

      // Figure 19: heatmap model picker
      buildModelPicker('fig19-model-select', 0, idx => {
        s7SelectedIdx = idx;
        loadMicro(idx, (rows, cfg) => renderS7(rows, cfg));
      });
      loadMicro(0, (rows, cfg) => renderS7(rows, cfg));

      // Figure 20: concordance model picker
      buildModelPicker('fig20-model-select', 0, idx => {
        loadMicro(idx, (rows, cfg) => renderFig22bConcordance(rows, cfg));
      });
      loadMicro(0, (rows, cfg) => renderFig22bConcordance(rows, cfg));

      // Load metadata (for timeline figures)
      Papa.parse('data/metadata/models.csv', {
        download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
        complete({ data }) {
          modelMetadata = data;
          renderReleaseTimeline();
          renderCutoffTimeline();
        },
      });
    },
    error() {
      document.getElementById('loading').innerHTML =
        '<span style="color:#c00">Failed to load macro data. Is the HTTP server running from the viz/ directory?</span>';
    },
  });
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
// TAB 2 — MODEL CHARACTERISTICS
// ═══════════════════════════════════════════════════════════════

// Parse "YYYY-MM" → numeric (e.g. "2025-08" → 2025.625)
function parseYearMonth(s) {
  if (!s) return null;
  const [y, m] = String(s).split('-').map(Number);
  return y + (m - 1) / 12;
}

// Parse "YYYY-MM-DD" → numeric
function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = String(s).split('-').map(Number);
  return y + (m - 1) / 12 + (d - 1) / 365;
}

// ═══════════════════════════════════════════════════════════════
// Author Notes — Log Odds Walkthrough
// ═══════════════════════════════════════════════════════════════
function renderLogOddsWalkthrough() {
  const el = document.getElementById('logodds-walkthrough');
  if (!el) return;

  const style = 'font-family:"Libre Baskerville","Georgia",serif;font-size:13px;line-height:1.7;color:#333;max-width:780px';

  let html = `<div style="${style}">`;

  // 0. The intuition: why zero matters
  html += '<h4 style="margin:18px 0 8px;font-size:14px;color:#111">0. The intuition: why zero is the magic number</h4>';
  html += '<p>Imagine a number line that encodes every possible probability &mdash; from "definitely going out" on the far left to "definitely staying home" on the far right:</p>';
  html += '<div style="background:#f5f5f5;padding:12px 16px;border-radius:6px;margin:10px 0;font-family:monospace;font-size:13px;text-align:center;letter-spacing:1px">';
  html += '&larr; go out &nbsp;&nbsp;&nbsp; <strong>&minus;4</strong> &nbsp;&nbsp; <strong>&minus;2</strong> &nbsp;&nbsp; <span style="color:#c00;font-weight:bold;font-size:15px">0 (50%)</span> &nbsp;&nbsp; <strong>+2</strong> &nbsp;&nbsp; <strong>+4</strong> &nbsp;&nbsp;&nbsp; stay home &rarr;';
  html += '</div>';
  html += '<p>This number line <em>is</em> the log-odds scale. The key insight: <strong>zero means 50/50</strong>. Here is why:</p>';
  html += '<ul style="margin:6px 0;padding-left:20px">';
  html += '<li>At 50% probability, the odds are 1:1 (equally likely either way)</li>';
  html += '<li>The natural logarithm of 1 is 0 &mdash; so log(1) = 0</li>';
  html += '<li>Therefore: 50% probability &harr; odds of 1 &harr; log-odds of 0</li>';
  html += '</ul>';
  html += '<p>Every positive value means "more likely to stay home than not" and every negative value means "more likely to go out." The further from zero, the more certain the decision. This is why the <strong>dashed line at y&nbsp;=&nbsp;0 in Figures 35 and 36 is the decision boundary</strong> &mdash; an agent flips from going out to staying home when their total log-odds crosses zero.</p>';
  html += '<p>The <strong>logistic function</strong> translates back: P&nbsp;=&nbsp;1&nbsp;/&nbsp;(1&nbsp;+&nbsp;e<sup>&minus;log-odds</sup>). Plug in 0 and you get P&nbsp;=&nbsp;1/(1+1)&nbsp;=&nbsp;0.5. That is the entire reason zero means 50%.</p>';

  // 1. What are log odds?
  html += '<h4 style="margin:18px 0 8px;font-size:14px;color:#111">1. What are log odds?</h4>';
  html += '<p>Logistic regression models the probability of an event using <em>log-odds</em> (also called the <em>logit</em>). The progression from probability to log-odds works like this:</p>';
  html += '<ul style="margin:6px 0;padding-left:20px">';
  html += '<li><strong>Probability</strong> (P): the chance of staying home, between 0 and 1</li>';
  html += '<li><strong>Odds</strong>: P / (1 &minus; P) &mdash; "how much more likely to stay home than go out"</li>';
  html += '<li><strong>Log-odds</strong>: ln(odds) &mdash; the natural logarithm of the odds</li>';
  html += '</ul>';

  html += '<table class="ols-table" style="width:auto;margin:10px 0">';
  html += '<thead><tr><th>Probability</th><th>Odds</th><th>Log-odds</th><th>Interpretation</th></tr></thead>';
  html += '<tbody>';
  html += '<tr><td>0.10</td><td>0.11</td><td>&minus;2.20</td><td>Very unlikely to stay home</td></tr>';
  html += '<tr><td>0.25</td><td>0.33</td><td>&minus;1.10</td><td>Unlikely to stay home</td></tr>';
  html += '<tr><td>0.50</td><td>1.00</td><td>0.00</td><td>Equally likely either way</td></tr>';
  html += '<tr><td>0.75</td><td>3.00</td><td>1.10</td><td>Likely to stay home</td></tr>';
  html += '<tr><td>0.90</td><td>9.00</td><td>2.20</td><td>Very likely to stay home</td></tr>';
  html += '</tbody></table>';
  html += '<p>The key property: log-odds range from &minus;&infin; to +&infin;, making them suitable as a linear predictor in regression.</p>';

  // 2. Reading the regression table
  html += '<h4 style="margin:18px 0 8px;font-size:14px;color:#111">2. Reading the regression table (Figure 23)</h4>';
  html += '<p>Each row in the table is a predictor variable. The <strong>Coef</strong> column shows the change in log-odds of staying home for a one-unit change in that predictor, holding all other predictors constant.</p>';
  html += '<ul style="margin:6px 0;padding-left:20px">';
  html += '<li><strong>Positive coefficient</strong> &rarr; increases log-odds of staying home (more cautious)</li>';
  html += '<li><strong>Negative coefficient</strong> &rarr; decreases log-odds of staying home (more bold, goes out)</li>';
  html += '<li><strong>OR (Odds Ratio)</strong> = exp(coefficient) &mdash; the multiplicative effect on the odds</li>';
  html += '</ul>';
  html += '<p>For binary predictors (e.g., extraverted = 1 vs. 0), the OR tells you: "how many times more likely is an extraverted agent to stay home compared to an introverted one?" More precisely:</p>';
  html += '<div style="background:#f5f5f5;padding:10px 14px;border-radius:4px;margin:8px 0;font-size:13px">';
  html += '<p style="margin:0 0 6px;font-weight:bold">Odds Ratio (formal definition):</p>';
  html += '<p style="margin:0 0 8px;font-family:monospace;font-size:12px">';
  html += 'OR = odds(trait present) / odds(trait absent)</p>';
  html += '<p style="margin:0 0 4px">Where <em>odds</em> = P(staying home) / P(going out). So expanding fully:</p>';
  html += '<p style="margin:0;font-family:monospace;font-size:12px">';
  html += 'OR = [P(extraverted stays home) / P(extraverted goes out)]<br>';
  html += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/ [P(introverted stays home) / P(introverted goes out)]</p>';
  html += '</div>';
  html += '<p>Since <code style="background:#e8e8e8;padding:1px 4px;border-radius:2px">stay_home = 1</code> is our dependent variable, all ORs are framed in terms of staying home. An OR of 0.0045 for extraversion means an extraverted agent has 0.45% the odds of staying home that an introverted agent does &mdash; equivalently, the introverted agent is ~222&times; more likely to stay home.</p>';

  // 3. Worked example
  html += '<h4 style="margin:18px 0 8px;font-size:14px;color:#111">3. Worked example (Claude Sonnet 4.5)</h4>';
  html += '<p>From the Claude Sonnet 4.5 regression (Model 2, random-effects logit):</p>';

  html += '<table class="ols-table" style="width:auto;margin:10px 0">';
  html += '<thead><tr><th>Predictor</th><th>Coefficient</th><th>OR = exp(Coef)</th><th>Meaning</th></tr></thead>';
  html += '<tbody>';
  html += '<tr><td>Conscientious</td><td>+7.755</td><td>2,334</td><td>2,334&times; the odds of staying home vs. unconscientious</td></tr>';
  html += '<tr><td>Extraverted</td><td>&minus;5.408</td><td>0.0045</td><td>0.45% the odds of staying home vs. introverted</td></tr>';
  html += '<tr><td>Agreeable</td><td>+2.944</td><td>18.98</td><td>~19&times; the odds of staying home vs. antagonistic</td></tr>';
  html += '<tr><td>Emot. Stable</td><td>&minus;5.707</td><td>0.0033</td><td>0.33% the odds of staying home vs. neurotic</td></tr>';
  html += '<tr><td>Infection Rate</td><td>+3.075</td><td>21.64</td><td>Per 1pp rise in infection: 21.6&times; odds of staying home</td></tr>';
  html += '</tbody></table>';

  html += '<p><strong>Full calculation for a specific agent:</strong></p>';
  html += '<p>Consider an introverted, agreeable, conscientious, neurotic, closed female agent, age 40, at 3% infection:</p>';
  html += '<p style="font-family:monospace;font-size:12px;background:#f5f5f5;padding:8px;border-radius:4px;overflow-x:auto">';
  html += 'log-odds = &minus;7.465 (intercept)<br>';
  html += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 3.075 &times; 3 (infection 3%)<br>';
  html += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ (&minus;0.296) &times; 9 (infection&sup2;)<br>';
  html += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 0 (female, reference)<br>';
  html += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 0 (introverted, reference)<br>';
  html += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 2.944 (agreeable)<br>';
  html += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 7.755 (conscientious)<br>';
  html += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 0 (neurotic, reference)<br>';
  html += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 0 (closed, reference)<br>';
  html += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ (&minus;0.001) &times; 40 (age)<br>';
  html += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= &minus;7.465 + 9.225 &minus; 2.664 + 2.944 + 7.755 &minus; 0.04<br>';
  html += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= <strong>9.755</strong></p>';
  html += '<p>Converting back to probability:</p>';
  html += '<p style="font-family:monospace;font-size:12px;background:#f5f5f5;padding:8px;border-radius:4px">';
  html += 'odds = exp(9.755) = 17,260<br>';
  html += 'P(stay home) = odds / (1 + odds) = 17,260 / 17,261 = <strong>0.99994</strong></p>';
  html += '<p>This agent is virtually certain to stay home at 3% infection under Claude Sonnet 4.5 &mdash; driven overwhelmingly by the conscientious trait (coef = +7.755).</p>';

  // 4. OR interpretation
  html += '<h4 style="margin:18px 0 8px;font-size:14px;color:#111">4. What OR > 1 and OR < 1 mean</h4>';
  html += '<table class="ols-table" style="width:auto;margin:10px 0">';
  html += '<thead><tr><th>OR value</th><th>Meaning</th><th>Example from Claude Sonnet 4.5</th></tr></thead>';
  html += '<tbody>';
  html += '<tr><td>OR &gt;&gt; 1</td><td>Much more likely to stay home</td><td>Conscientious: OR = 2,334</td></tr>';
  html += '<tr><td>OR &gt; 1</td><td>Somewhat more likely to stay home</td><td>Agreeable: OR = 18.98</td></tr>';
  html += '<tr><td>OR = 1</td><td>No effect</td><td>(reference line in forest plot)</td></tr>';
  html += '<tr><td>OR &lt; 1</td><td>More likely to go out</td><td>Extraverted: OR = 0.0045</td></tr>';
  html += '<tr><td>OR &lt;&lt; 1</td><td>Much more likely to go out</td><td>Emot. Stable: OR = 0.0033</td></tr>';
  html += '</tbody></table>';
  html += '<p><em>Note:</em> These extreme ORs (thousands or thousandths) are common in our data because LLM decisions are near-deterministic &mdash; a conscientious agent almost <em>always</em> stays home, producing very large effect sizes in the logistic model.</p>';

  // 5. Cross-model variation
  html += '<h4 style="margin:18px 0 8px;font-size:14px;color:#111">5. Why coefficients vary across models</h4>';
  html += '<p>Different LLMs interpret personality traits with vastly different magnitudes. Claude Sonnet 4.5 shows conscientiousness as an OR of 2,334, while other models may show ORs of 5 or 50 for the same trait. This is a central finding (RQ5) &mdash; the <em>direction</em> of trait effects is largely consistent across providers, but the <em>magnitude</em> varies by orders of magnitude.</p>';
  html += '<p>See <strong>Figure 30</strong> (trait effects) and <strong>Figure 29</strong> (cross-model forest plot) for visual comparisons across all 21 configurations.</p>';

  // 6. Three Forces and the decision boundary
  html += '<h4 style="margin:18px 0 8px;font-size:14px;color:#111">6. Three Forces and the decision boundary</h4>';
  html += '<p>The logit model decomposes each agent&rsquo;s stay-home decision into three additive forces in log-odds space:</p>';
  html += '<div style="background:#f5f5f5;padding:12px 16px;border-radius:6px;margin:10px 0;font-family:monospace;font-size:13px">';
  html += 'total log-odds = <span style="color:#444;font-weight:bold">intercept</span> + <span style="color:#7C3AED;font-weight:bold">personality</span> + <span style="color:#c00;font-weight:bold">infection</span>';
  html += '</div>';
  html += '<p>An agent stays home when the total exceeds 0 (i.e., P &gt; 50%). Each force plays a distinct role:</p>';
  html += '<ul style="margin:6px 0;padding-left:20px">';
  html += '<li><strong>Intercept</strong> is gravity &mdash; it sets the baseline pull for <em>all</em> agents. A strong negative intercept (e.g., GPT-4o at &minus;9.2) means the model defaults to going out. A near-zero intercept (GPT-5.2 low at &minus;0.6) means agents start nearly indifferent.</li>';
  html += '<li><strong>Personality</strong> shifts each agent up or down from the baseline. Conscientious, agreeable, introverted, neurotic agents get pushed toward staying home (positive contribution). The opposite traits push toward going out.</li>';
  html += '<li><strong>Infection</strong> is a rising tide that pushes everyone upward as infection increases from 0% to 7%. Its contribution grows nonlinearly (quadratic in the model) and affects all agents equally.</li>';
  html += '</ul>';
  html += '<p>The interplay determines the shape of the mobility curve:</p>';
  html += '<ul style="margin:6px 0;padding-left:20px">';
  html += '<li>If infection is strong and intercept is weak (near zero), the curve collapses quickly &mdash; most agents flip to staying home at low infection levels.</li>';
  html += '<li>If the intercept is very negative, infection must climb higher to overcome the baseline pull, producing a delayed, gradual transition.</li>';
  html += '<li>If personality effects are large, the spread of crossover points widens &mdash; some agents flip early, others late (or never).</li>';
  html += '</ul>';
  html += '<p><strong>Figure 35</strong> shows these three forces <em>separated</em> side by side, so you can compare their magnitudes. <strong>Figure 36</strong> shows them <em>accumulated</em> &mdash; each dot represents intercept&nbsp;+&nbsp;personality (the &ldquo;starting position&rdquo;), and the curves show what happens when infection is added on top. Together, they tell the complete story of how each LLM decides.</p>';

  // 7. How Odds Ratios relate to log-odds
  html += '<h4 style="margin:18px 0 8px;font-size:14px;color:#111">7. How Odds Ratios connect to all of this</h4>';
  html += '<p>Odds Ratios (OR) and log-odds are two views of the same thing:</p>';
  html += '<div style="background:#f5f5f5;padding:10px 14px;border-radius:4px;margin:8px 0;font-family:monospace;font-size:12px">';
  html += 'OR = exp(coefficient) &nbsp;&nbsp;&harr;&nbsp;&nbsp; coefficient = ln(OR)';
  html += '</div>';
  html += '<ul style="margin:6px 0;padding-left:20px">';
  html += '<li>OR &gt; 1 means positive log-odds &rarr; pushes toward staying home</li>';
  html += '<li>OR &lt; 1 means negative log-odds &rarr; pushes toward going out</li>';
  html += '<li>OR = 1 means zero log-odds &rarr; no effect</li>';
  html += '</ul>';
  html += '<p>The key advantage of log-odds: they <strong>add</strong>. You can sum the intercept + each trait&rsquo;s coefficient + infection&rsquo;s coefficient and compare the total to zero. On the OR scale, the equivalent operation is <em>multiplication</em> &mdash; which is harder to visualize. This is why Figures 35&ndash;36 use the log-odds scale: it lets you literally <em>see</em> the addition happening.</p>';
  html += '<p>Figure 33 uses the OR scale, which is better for showing <em>relative magnitude</em> (how many times more likely). Figure 35 and 36 use log-odds, which is better for showing <em>the decision threshold</em> (when does the total cross zero?).</p>';

  html += '</div>';
  el.innerHTML = html;
}

// renderTab2() removed — heatmap + concordance moved to Agent Curve subtab in Mobility Curves

// ── Provider colors (Okabe-Ito compatible) ────────────────────
const PROV_COLORS = { anthropic: '#7C3AED', openai: '#22C55E', gemini: '#3B82F6' };
const PROV_LABELS = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini' };







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

// ═══════════════════════════════════════════════════════════════
// FIGURE 13 — Model Comparison (Dummy Variable OLS)
// ═══════════════════════════════════════════════════════════════

// ── Matrix math helpers (no external deps) ────────────────────

// XᵀX — returns k×k matrix
function matXtX(X) {
  const n = X.length, k = X[0].length;
  const out = Array.from({length: k}, () => new Array(k).fill(0));
  for (let i = 0; i < k; i++)
    for (let j = 0; j < k; j++)
      for (let r = 0; r < n; r++) out[i][j] += X[r][i] * X[r][j];
  return out;
}

// Xᵀy — returns k-vector
function matXty(X, y) {
  const n = X.length, k = X[0].length;
  const out = new Array(k).fill(0);
  for (let j = 0; j < k; j++)
    for (let r = 0; r < n; r++) out[j] += X[r][j] * y[r];
  return out;
}

// Invert a k×k matrix via Gauss-Jordan elimination on [A | I]
function matInvert(A) {
  const k = A.length;
  const M = A.map((row, i) => {
    const r = [...row, ...new Array(k).fill(0)];
    r[k + i] = 1;
    return r;
  });
  for (let col = 0; col < k; col++) {
    // Partial pivot
    let maxRow = col;
    for (let row = col + 1; row < k; row++)
      if (Math.abs(M[row][col]) > Math.abs(M[maxRow][col])) maxRow = row;
    [M[col], M[maxRow]] = [M[maxRow], M[col]];
    const pivot = M[col][col];
    if (Math.abs(pivot) < 1e-12) return null; // singular
    for (let c = 0; c < 2 * k; c++) M[col][c] /= pivot;
    for (let row = 0; row < k; row++) {
      if (row === col) continue;
      const f = M[row][col];
      for (let c = 0; c < 2 * k; c++) M[row][c] -= f * M[col][c];
    }
  }
  return M.map(row => row.slice(k));
}

// 2-sided p-value from t-distribution using normal approximation (valid df ≥ 30)
// Uses Abramowitz & Stegun polynomial approximation (error < 7.5e-8)
function tPValue(t, df) {
  const z = Math.abs(t);
  const t2 = 1 / (1 + 0.2316419 * z);
  const poly = t2 * (0.319381530 + t2 * (-0.356563782 + t2 * (1.781477937
             + t2 * (-1.821255978 + t2 * 1.330274429))));
  return 2 * poly * Math.exp(-z * z / 2) / Math.sqrt(2 * Math.PI);
}

function pStars(p) {
  if (p < 0.001) return '***';
  if (p < 0.01)  return '**';
  if (p < 0.05)  return '*';
  return 'ns';
}

// Full multiple OLS: X is n×k design matrix, y is n-vector
// Returns { betas, ses, ts, ps, r2, df }
function fitMultipleOLS(X, y) {
  const n = X.length, k = X[0].length;
  const XtX    = matXtX(X);
  const Xty    = matXty(X, y);
  const XtXinv = matInvert(XtX);
  if (!XtXinv) return null;
  const betas = XtXinv.map(row => row.reduce((s, v, j) => s + v * Xty[j], 0));
  const yhat  = y.map((_, i) => betas.reduce((s, b, j) => s + b * X[i][j], 0));
  const ym    = y.reduce((a, b) => a + b, 0) / n;
  const SSres = y.reduce((s, yi, i) => s + (yi - yhat[i]) ** 2, 0);
  const SStot = y.reduce((s, yi) => s + (yi - ym) ** 2, 0);
  const s2    = SSres / (n - k);
  const ses   = XtXinv.map((row, j) => Math.sqrt(Math.max(0, s2 * row[j])));
  const df    = n - k;
  const ts    = betas.map((b, j) => ses[j] > 0 ? b / ses[j] : 0);
  const ps    = ts.map(t => tPValue(t, df));
  return { betas, ses, ts, ps, r2: SStot > 0 ? 1 - SSres / SStot : 0, df };
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

function aggregateMicroToReps(rows) {
  // Group by (infection_level, rep) → proportion going outside
  // micro CSV: response = "yes" means stay home, "no" means go outside
  const map = {};
  rows.forEach(r => {
    const level = parseFloat(r.infection_level);
    const rep   = parseInt(r.rep, 10);
    const key   = `${level}|${rep}`;
    if (!map[key]) map[key] = { level, rep, nGo: 0, nTotal: 0 };
    map[key].nTotal++;
    // "no" response = goes outside
    const resp = String(r.response || '').toLowerCase().trim();
    if (resp === 'no') map[key].nGo++;
  });
  return Object.values(map).map(g => ({
    nc:  g.level / 100,
    mob: g.nTotal > 0 ? g.nGo / g.nTotal : 0,
    level: g.level, rep: g.rep,
  }));
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
            <th colspan="4" style="text-align:center;border-bottom:1px solid #ccc">Model 1 (no interaction)</th>
            <th colspan="4" style="text-align:center;border-bottom:1px solid #ccc">Model 2 (with D·NC)</th>
          </tr>
          <tr>
            <th>β</th><th>SE</th><th>t</th><th>p</th>
            <th>β</th><th>SE</th><th>t</th><th>p</th>
          </tr>
        </thead>
        <tbody>${rows1.join('')}</tbody>
        <tfoot>
          <tr><td colspan="9" style="padding-top:6px;font-size:11px;color:#555">
            R² (M1) = ${m1.r2.toFixed(3)} &nbsp;|&nbsp; R² (M2) = ${m2.r2.toFixed(3)} &nbsp;|&nbsp;
            df = ${m1.df} (M1), ${m2.df} (M2) &nbsp;|&nbsp;
            ★ = key test rows &nbsp;|&nbsp; *** p&lt;0.001, ** p&lt;0.01, * p&lt;0.05
          </td></tr>
        </tfoot>
      </table>
    </div>
    <div class="ols-table-label" style="margin-top:10px;font-style:normal;text-transform:none;font-weight:normal;font-size:12px;color:#333;letter-spacing:0">${interp}</div>`;
}

// ═══════════════════════════════════════════════════════════════
// AUTHOR NOTES — DATE TIMELINES
// ═══════════════════════════════════════════════════════════════

const TL_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtMonthYear(s) {
  const parts = String(s).split('-');
  return `${TL_MONTHS[+parts[1] - 1]} ${parts[0]}`;
}

function renderDateTimeline(containerId, dateField, parseFunc, brackets) {
  const el = document.getElementById(containerId);
  if (!el || !modelMetadata.length) return;

  const W = FIG_CW, rowH = 72;
  const providers = ['anthropic', 'openai', 'gemini'];
  const padL = 88, padR = 32, padT = 24, padB = 44;
  const bracketH = (brackets && brackets.length) ? 36 : 0;
  const H = rowH * providers.length + padT + padB + bracketH;

  // Build point list (include raw date string for tooltip)
  const points = [];
  modelMetadata.forEach(meta => {
    const x = parseFunc(meta[dateField]);
    if (x == null) return;
    const cfg = CONFIG.MODELS.find(m =>
      m.provider === meta.provider &&
      m.model === meta.alias &&
      m.reasoning === String(meta.reasoning)
    );
    if (!cfg) return;
    const provRow = providers.indexOf(meta.provider);
    if (provRow < 0) return;
    const rawDate = meta[dateField] ? String(meta[dateField]) : '';
    points.push({ x, label: cfg.label, color: cfg.color, provRow, rawDate, model: meta.alias });
  });

  if (!points.length) {
    el.innerHTML = '<p style="color:#999;font-family:Georgia,serif;font-size:12px">No metadata loaded.</p>';
    return;
  }

  const allX = points.map(p => p.x);
  const minX = Math.min(...allX), maxX = Math.max(...allX);
  const xRange = maxX - minX || 1;
  const toSvgX = x => padL + (x - minX) / xRange * (W - padL - padR);
  const toSvgY = row => padT + row * rowH + rowH / 2;

  let inner = '';

  // Provider row labels + guide lines
  providers.forEach((p, i) => {
    const cy = toSvgY(i);
    inner += `<line x1="${padL}" y1="${cy}" x2="${W - padR}" y2="${cy}" stroke="#eeeeee" stroke-width="1"/>`;
    inner += `<text x="${padL - 8}" y="${cy + 4}" text-anchor="end" fill="${PROV_COLORS[p]}"
      font-size="11" font-family="${SERIF}" font-weight="bold">${PROV_LABELS[p]}</text>`;
  });

  // Year grid lines + labels (shifted down by bracketH)
  const minYr = Math.floor(minX), maxYr = Math.ceil(maxX);
  const dotZoneBottom = padT + providers.length * rowH;
  for (let yr = minYr; yr <= maxYr; yr++) {
    const sx = toSvgX(yr);
    inner += `<line x1="${sx}" y1="${padT}" x2="${sx}" y2="${dotZoneBottom}" stroke="#dddddd" stroke-width="1" stroke-dasharray="3,4"/>`;
    inner += `<text x="${sx}" y="${H - padB + 16}" text-anchor="middle" fill="#888888"
      font-size="10" font-family="${SERIF}">${yr}</text>`;
  }

  // Bracket annotations (between dot zone and year labels)
  if (brackets && brackets.length) {
    const bY = dotZoneBottom + 10;
    const tickH = 6;
    brackets.forEach(b => {
      let x1 = toSvgX(parseFunc(b.startDate));
      let x2 = toSvgX(parseFunc(b.endDate));
      // Ensure minimum bracket width (for single-point brackets)
      if (x2 - x1 < 20) { const mid = (x1 + x2) / 2; x1 = mid - 10; x2 = mid + 10; }
      const midX = (x1 + x2) / 2;
      inner += `<line x1="${x1}" y1="${bY}" x2="${x1}" y2="${bY + tickH}" stroke="#888" stroke-width="1.2"/>`;
      inner += `<line x1="${x2}" y1="${bY}" x2="${x2}" y2="${bY + tickH}" stroke="#888" stroke-width="1.2"/>`;
      inner += `<line x1="${x1}" y1="${bY + tickH}" x2="${x2}" y2="${bY + tickH}" stroke="#888" stroke-width="1.2"/>`;
      inner += `<text x="${midX}" y="${bY + tickH + 13}" text-anchor="middle" fill="#555"
        font-size="10" font-family="${SERIF}" font-style="italic">${esc(b.label)}</text>`;
    });
  }

  // Bucket overlapping dots (6px bucket for stagger)
  const buckets = {};
  points.forEach(p => {
    const sx = Math.round(toSvgX(p.x) / 6) * 6;
    const key = `${p.provRow}_${sx}`;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(p);
  });

  // Pass 1: render dots, collect label candidates (deduplicate reasoning variants)
  const labelCandidates = [];
  const dotZones = [];  // dot collision zones — labels that cross a dot get leader lines
  Object.values(buckets).forEach(bucket => {
    const modelSeen = {};
    bucket.forEach((p, i) => {
      const sx = toSvgX(p.x);
      const baseY = toSvgY(p.provRow);
      const sy = baseY + (i - (bucket.length - 1) / 2) * 16;
      const short = p.label.replace('Claude ', '').replace(' Preview', '');
      const tipText = `${p.label} — ${fmtMonthYear(p.rawDate)}`;
      inner += `<g class="tl-dot" data-tip="${esc(tipText)}" style="cursor:pointer">`;
      inner += `<circle cx="${sx}" cy="${sy}" r="7" fill="transparent" pointer-events="all"/>`;
      inner += `<circle cx="${sx}" cy="${sy}" r="5" fill="${p.color}" opacity="0.85" pointer-events="all"/>`;
      inner += `</g>`;
      dotZones.push({ sx: sx - 6, sy, width: 12 });
      // Deduplicate: one label per unique model in bucket
      if (!modelSeen[p.model]) {
        const baseName = short.replace(/ \((off|low|med|medium|high|required)\)$/i, '');
        modelSeen[p.model] = { baseName, sx, sy, row: p.provRow, dotX: sx, dotY: sy, count: 1 };
      } else {
        modelSeen[p.model].count++;
      }
    });
    // Emit one label per unique model
    Object.values(modelSeen).forEach(entry => {
      const text = entry.count > 1 ? `${entry.baseName} ×${entry.count}` : entry.baseName;
      const w = text.length * 5.5 + 4;
      labelCandidates.push({
        sx: entry.sx + 8, sy: entry.sy + 4, text, row: entry.row, width: w,
        dotX: entry.dotX, dotY: entry.dotY
      });
    });
  });

  // Pass 2: collision-detect labels — pre-seed with dot zones so labels near dots get leader lines
  labelCandidates.sort((a, b) => a.row - b.row || a.sy - b.sy || a.sx - b.sx);
  const visibleLabels = [...dotZones];
  const collides = (pos) => visibleLabels.some(prev =>
    Math.abs(prev.sy - pos.sy) < 12 &&
    !(pos.sx + pos.width < prev.sx || pos.sx > prev.sx + prev.width)
  );
  labelCandidates.forEach(lbl => {
    // Option 1: right of dot (default — no leader line)
    const right = { sx: lbl.sx, sy: lbl.sy, width: lbl.width };
    if (!collides(right)) {
      inner += `<text x="${right.sx}" y="${right.sy}" fill="#333333" font-size="9" font-family="${SERIF}">${esc(lbl.text)}</text>`;
      visibleLabels.push(right);
      return;
    }
    // Option 2: leader-line callout — try shelf positions above/below dot
    const shelfOffsets = [-22, 22, -36, 36];
    for (const dy of shelfOffsets) {
      const pos = { sx: lbl.sx, sy: lbl.dotY + dy, width: lbl.width };
      if (!collides(pos)) {
        // Leader line from dot edge to label anchor
        const lineY1 = dy < 0 ? lbl.dotY - 6 : lbl.dotY + 6;
        const lineY2 = dy < 0 ? pos.sy + 3 : pos.sy - 9;
        inner += `<line x1="${lbl.dotX}" y1="${lineY1}" x2="${lbl.sx - 2}" y2="${lineY2}" stroke="#aaa" stroke-width="0.7"/>`;
        inner += `<text x="${pos.sx}" y="${pos.sy}" fill="#333333" font-size="9" font-family="${SERIF}">${esc(lbl.text)}</text>`;
        visibleLabels.push(pos);
        return;
      }
    }
    // All options collide — rely on tooltip
  });

  el.innerHTML = `<svg width="${W}" height="${H}" style="overflow:visible;display:block">${inner}</svg>`;

  // Wire custom mouseover tooltip (SVG <title> unreliable in Chrome)
  let tipEl = document.getElementById('tl-tooltip');
  if (!tipEl) {
    tipEl = document.createElement('div');
    tipEl.id = 'tl-tooltip';
    tipEl.style.cssText = 'display:none;position:fixed;background:#222;color:#fff;padding:4px 10px;font-size:11px;font-family:Georgia,serif;border-radius:3px;pointer-events:none;z-index:200;white-space:nowrap';
    document.body.appendChild(tipEl);
  }
  el.querySelectorAll('.tl-dot').forEach(g => {
    g.addEventListener('mouseenter', () => {
      tipEl.textContent = g.dataset.tip;
      tipEl.style.display = 'block';
    });
    g.addEventListener('mousemove', e => {
      tipEl.style.left = (e.clientX + 14) + 'px';
      tipEl.style.top  = (e.clientY - 32) + 'px';
    });
    g.addEventListener('mouseleave', () => { tipEl.style.display = 'none'; });
  });
}

function renderReleaseTimeline() {
  renderDateTimeline('release-timeline-chart', 'release_date', parseDate, [
    { label: 'Legacy (pre-2025)',  startDate: '2024-01-25', endDate: '2024-11-20' },
    { label: 'Early 2025',         startDate: '2025-02-05', endDate: '2025-06-17' },
    { label: 'Late 2025',          startDate: '2025-09-29', endDate: '2025-12-17' },
  ]);
  document.getElementById('s-release-timeline').style.display = 'block';
}

function renderCutoffTimeline() {
  renderDateTimeline('cutoff-timeline-chart', 'knowledge_cutoff', parseYearMonth, [
    { label: 'Pre-2024',    startDate: '2021-09', endDate: '2023-10' },
    { label: 'Mid-2024',    startDate: '2024-06', endDate: '2024-09' },
    { label: 'Early 2025',  startDate: '2025-01', endDate: '2025-03' },
    { label: 'Late 2025',   startDate: '2025-08', endDate: '2025-08' },
  ]);
  document.getElementById('s-cutoff-timeline').style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
// TAB 3 — AGENT ANALYSIS
// ═══════════════════════════════════════════════════════════════

function loadAgentsJSON(callback) {
  if (agentsData) { callback(agentsData); return; }
  fetch('agents/agents.json?v=' + Date.now())
    .then(r => r.json())
    .then(data => { agentsData = data; callback(data); });
}

// ── Comparison Lens (filtered cross-model views) ─────────────
function renderComparisonLens() {
  if (comparisonLensRendered) return;
  comparisonLensRendered = true;

  const dimNav = document.getElementById('mc-dimension-nav');
  if (!dimNav) return;

  // Build dimension pills dynamically
  const dims = Object.keys(MODEL_GROUPS);
  let dimHtml = '';
  dims.forEach((key, i) => {
    const label = MODEL_GROUPS[key].label;
    const active = i === 0 ? ' active' : '';
    dimHtml += `<a class="mc-pill-dim${active}" data-dim="${key}" href="#">${label}</a>`;
  });
  dimNav.innerHTML = dimHtml;

  // Wire dimension nav clicks
  dimNav.querySelectorAll('.mc-pill-dim').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      dimNav.querySelectorAll('.mc-pill-dim').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      renderMCGroupButtons(link.dataset.dim);
    });
  });

  // Build fine-tune checkboxes
  buildFineTuneCheckboxes();

  // Load regressions + consistency data, then render default dimension
  loadAgentsJSON(() => {
    loadAllRegressions(allRegs => {
      _comparisonAllRegs = allRegs;
      loadAgentConsistency(cData => {
        _comparisonConsistencyData = cData;
        renderMCGroupButtons('provider');
      });
    });
  });
}

function renderMCGroupButtons(dimension) {
  const groupNav = document.getElementById('mc-group-nav');
  const dim = MODEL_GROUPS[dimension];
  if (!dim || !groupNav) return;

  let html = '<a class="mc-pill active" data-idx="-1" href="#">All</a>';
  dim.groups.forEach((g, i) => {
    html += `<a class="mc-pill" data-idx="${i}" href="#">${g.name}</a>`;
  });
  groupNav.innerHTML = html;

  groupNav.querySelectorAll('.mc-pill').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      groupNav.querySelectorAll('.mc-pill').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      const idx = parseInt(link.dataset.idx);
      renderMCFilteredCharts(dimension, idx);
    });
  });

  renderMCFilteredCharts(dimension, -1);  // default: All
}

const mcFineTuneChecked = new Set(CONFIG.MODELS.map((_, i) => i));

function renderMCFilteredCharts(dimension, groupIdx) {
  if (!_comparisonAllRegs) return;

  // Sync fine-tune checkboxes to match group filter
  if (groupIdx >= 0) {
    const filterFn = MODEL_GROUPS[dimension].groups[groupIdx].filter;
    mcFineTuneChecked.clear();
    CONFIG.MODELS.forEach((m, i) => { if (filterFn(m)) mcFineTuneChecked.add(i); });
  } else {
    mcFineTuneChecked.clear();
    CONFIG.MODELS.forEach((_, i) => mcFineTuneChecked.add(i));
  }
  syncFineTuneCheckboxes();

  renderMCFromFineTune();
}

function renderMCFromFineTune() {
  if (!_comparisonAllRegs) return;
  let modelFilter = null;
  if (mcFineTuneChecked.size < CONFIG.MODELS.length) {
    const keys = new Set();
    mcFineTuneChecked.forEach(i => keys.add(configDirKey(CONFIG.MODELS[i])));
    modelFilter = keys;
  }
  if (_comparisonConsistencyData) {
    renderFig27ConsistencyMatrix(_comparisonConsistencyData, 'mc-consistency-chart', modelFilter);
  }
  renderFig26ForestPlot(_comparisonAllRegs, 'mc-forest-chart', modelFilter);
  renderInfectionEffectChart(_comparisonAllRegs, 'mc-infection-chart', 'model2', modelFilter);
  renderInfectionORProgression(_comparisonAllRegs, 'mc-or-chart', modelFilter);
}

function buildFineTuneCheckboxes() {
  const grid = document.getElementById('mc-fine-tune-grid');
  if (!grid) return;
  const providers = ['anthropic', 'openai', 'gemini'];
  const provLabels = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini' };
  let html = '<div style="display:flex;gap:24px;flex-wrap:wrap">';
  providers.forEach(prov => {
    html += '<div style="min-width:140px">';
    html += `<div style="font-size:11px;font-weight:bold;color:#555;margin-bottom:4px">${provLabels[prov]}</div>`;
    CONFIG.MODELS.forEach((m, i) => {
      if (m.provider !== prov) return;
      const checked = mcFineTuneChecked.has(i) ? ' checked' : '';
      html += `<label style="display:block;font-size:11px;color:#666;cursor:pointer;padding:1px 0"><input type="checkbox" class="mc-fine-cb" data-idx="${i}"${checked} style="margin-right:4px"> ${esc(m.label)}</label>`;
    });
    html += '</div>';
  });
  html += '</div>';
  grid.innerHTML = html;

  // Wire checkbox changes
  grid.querySelectorAll('.mc-fine-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = +cb.dataset.idx;
      if (cb.checked) mcFineTuneChecked.add(idx); else mcFineTuneChecked.delete(idx);
      renderMCFromFineTune();
    });
  });
}

function syncFineTuneCheckboxes() {
  document.querySelectorAll('.mc-fine-cb').forEach(cb => {
    cb.checked = mcFineTuneChecked.has(+cb.dataset.idx);
  });
}

function renderAgentAnalysis() {
  // Fig 21: demographics
  loadAgentsJSON(renderFig21Demographics);

  // Fig 24: trait effects
  loadAgentsJSON(() => {
    buildModelPicker('fig24-model-select', 0, idx => {
      loadMicro(idx, (rows, cfg) => renderFig24TraitEffects(rows, cfg));
    });
    loadMicro(0, (rows, cfg) => renderFig24TraitEffects(rows, cfg));
  });

  // Fig 25: regression table (pre-computed from R)
  buildModelPicker('fig25-model-select', 0, idx => {
    loadRegression(idx, (data, cfg) => renderFig25Regression(data, cfg));
  });
  loadRegression(0, (data, cfg) => renderFig25Regression(data, cfg));

  // Fig 25: predictive accuracy guide (collapsible footnotes)
  renderFig25Guide();

  // Fig 26: cross-model trait forest plot + interpretation guide
  loadAllRegressions(renderFig26ForestPlot);
  renderFig26Guide();

  // Fig 29: cross-model prediction accuracy
  loadAgentsJSON(() => {
    loadAllRegressions(allRegs => {
      loadAgentConsistency(consistencyData => {
        renderFig29CrossModelPrediction(allRegs, consistencyData);
      });
      // Fig 30: infection OR by level (Model 2 — random effects)
      renderFig30InfectionOR(allRegs);
      // Experiment B: Odds Ratio Landscape: Traits & Infection
      renderInfectionORProgression(allRegs);
      renderFig27Guide();
      // Also render Author Notes comparison charts if not yet done
      renderAuthorComparisons();
    });
  });

  // Fig 23: Transition Point Prediction Error (delta histogram)
  loadAgentsJSON(() => {
    buildModelPicker('figDelta-model-select', 0, idx => {
      loadMicro(idx, (rows, cfg) => {
        loadRegression(idx, (regData) => {
          renderFigDeltaStrip(rows, cfg, regData);
        });
      });
    });
    loadMicro(0, (rows, cfg) => {
      loadRegression(0, (regData) => {
        renderFigDeltaStrip(rows, cfg, regData);
      });
    });
  });

  // Fig 37: Decision Anatomy: Traits & Infection Level Impact (now "Figure 28" in Cohort Analysis)
  loadAgentsJSON(() => {
    buildModelPicker('fig37-model-select', 0, idx => {
      loadMicro(idx, (rows, cfg) => {
        loadRegression(idx, (regData) => {
          renderFig37ThreeForces(rows, cfg, regData);
        });
      });
    });
    loadMicro(0, (rows, cfg) => {
      loadRegression(0, (regData) => {
        renderFig37ThreeForces(rows, cfg, regData);
      });
    });
  });

  // Fig 27: agent consistency matrix
  loadAgentConsistency(renderFig27ConsistencyMatrix);

  // Comparison Lens (lazy — guarded by comparisonLensRendered flag)
  renderComparisonLens();
}

// ── Fig 21: Sample Demographics ──────────────────────────────
function renderFig21Demographics(agents) {
  const el = document.getElementById('fig21-chart');
  if (!el) return;

  const W = CW, H = 320;
  const halfW = (W - 40) / 2;

  // Age histogram (18–65 range, 5-year bins)
  const bins = [0,0,0,0,0,0,0,0,0,0]; // 10 bins for 18-67 (5-year bins)
  const binLabels = ['18–22','23–27','28–32','33–37','38–42','43–47','48–52','53–57','58–62','63–67'];
  agents.forEach(a => {
    const idx = Math.min(Math.floor((a.age - 18) / 5), 9);
    if (idx >= 0 && idx < 10) bins[idx]++;
  });
  const maxBin = Math.max(...bins);

  const barH = 22, gap = 4, padL = 50, padR = 30;
  const ageH = binLabels.length * (barH + gap) + 40;
  let ageSvg = `<text x="${padL}" y="14" font-size="12" font-weight="bold" fill="#111" font-family="${SERIF}">Age Distribution</text>`;
  binLabels.forEach((lbl, i) => {
    const y = 28 + i * (barH + gap);
    const bw = maxBin > 0 ? (bins[i] / maxBin) * (halfW - padL - padR) : 0;
    ageSvg += `<text x="${padL - 6}" y="${y + barH / 2 + 4}" font-size="9" fill="${AX_COLOR}" font-family="${SERIF}" text-anchor="end">${lbl}</text>`;
    ageSvg += `<rect x="${padL}" y="${y}" width="${bw.toFixed(1)}" height="${barH}" fill="#7C3AED" opacity="0.7" rx="2"/>`;
    if (bins[i] > 0) ageSvg += `<text x="${padL + bw + 4}" y="${y + barH / 2 + 4}" font-size="9" fill="#555" font-family="${SERIF}">${bins[i]}</text>`;
  });

  // Gender + Trait breakdown
  const maleCount = agents.filter(a => a.gender === 'male').length;
  const femaleCount = agents.length - maleCount;

  const dims = [
    { name: 'Extraversion', hi: 'extroverted', lo: 'introverted' },
    { name: 'Agreeableness', hi: 'agreeable', lo: 'antagonistic' },
    { name: 'Conscientiousness', hi: 'conscientious', lo: 'unconscientious' },
    { name: 'Emotional Stability', hi: 'emotionally stable', lo: 'neurotic' },
    { name: 'Openness', hi: 'open to experience', lo: 'closed to experience' },
  ];
  const traitCounts = dims.map(d => {
    let hiCount = 0;
    agents.forEach(a => { if (a.traits.includes(d.hi)) hiCount++; });
    return { dim: d.name, hi: d.hi, lo: d.lo, hiCount, loCount: agents.length - hiCount };
  });

  const rowStep = barH + gap + 14;
  const traitH = (1 + dims.length) * rowStep + 40; // +1 for gender row
  const barW = halfW - 80;
  const traitColors = ['#6366F1','#7C3AED','#22C55E','#3B82F6','#F59E0B','#EC4899'];
  let traitSvg = `<text x="0" y="14" font-size="12" font-weight="bold" fill="#111" font-family="${SERIF}">Agent Characteristics</text>`;

  // Gender row
  const gy = 28;
  const mW = (maleCount / agents.length) * barW;
  const fW = barW - mW;
  traitSvg += `<text x="0" y="${gy + 10}" font-size="10" fill="#333" font-family="${SERIF}" font-weight="bold">Gender</text>`;
  traitSvg += `<rect x="0" y="${gy + 14}" width="${mW.toFixed(1)}" height="${barH}" fill="${traitColors[0]}" opacity="0.75" rx="2"/>`;
  traitSvg += `<rect x="${mW.toFixed(1)}" y="${gy + 14}" width="${fW.toFixed(1)}" height="${barH}" fill="${traitColors[0]}" opacity="0.3" rx="2"/>`;
  traitSvg += `<text x="${mW / 2}" y="${gy + 14 + barH / 2 + 4}" font-size="9" fill="#fff" font-family="${SERIF}" text-anchor="middle">male (${maleCount})</text>`;
  traitSvg += `<text x="${mW + fW / 2}" y="${gy + 14 + barH / 2 + 4}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="middle">female (${femaleCount})</text>`;

  // Big-5 trait rows
  traitCounts.forEach((tc, i) => {
    const y = 28 + (i + 1) * rowStep;
    const hiW = (tc.hiCount / agents.length) * barW;
    const loW = barW - hiW;
    traitSvg += `<text x="0" y="${y + 10}" font-size="10" fill="#333" font-family="${SERIF}" font-weight="bold">${tc.dim}</text>`;
    traitSvg += `<rect x="0" y="${y + 14}" width="${hiW.toFixed(1)}" height="${barH}" fill="${traitColors[i + 1]}" opacity="0.75" rx="2"/>`;
    traitSvg += `<rect x="${hiW.toFixed(1)}" y="${y + 14}" width="${loW.toFixed(1)}" height="${barH}" fill="${traitColors[i + 1]}" opacity="0.3" rx="2"/>`;
    traitSvg += `<text x="${hiW / 2}" y="${y + 14 + barH / 2 + 4}" font-size="9" fill="#fff" font-family="${SERIF}" text-anchor="middle">${tc.hi} (${tc.hiCount})</text>`;
    traitSvg += `<text x="${hiW + loW / 2}" y="${y + 14 + barH / 2 + 4}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="middle">${tc.lo} (${tc.loCount})</text>`;
  });

  const totalH = Math.max(ageH, traitH) + 10;
  el.innerHTML =
    `<svg width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}">` +
    `<g transform="translate(0,0)">${traitSvg}</g>` +
    `<g transform="translate(${halfW + 40},0)">${ageSvg}</g>` +
    `</svg>`;
}

// ── Fig 23: Agent Spotlight ──────────────────────────────────
let spotlightAgentIdx = 0;
let spotlightChecked = new Set();
let spotlightMicroRows = {}; // idx → raw micro rows (for reasoning text on click)

// Sprite mapping — mirrors town-agents.js CHAR_NAMES (agent index → sprite filename)
const SPOTLIGHT_SPRITES = [
  'Pipoya_F01','Pipoya_M01','Pipoya_F02','Pipoya_M02','Pipoya_M03',
  'Pipoya_M04','Pipoya_F03','Pipoya_F04','Pipoya_M05','Pipoya_M06',
  'Pipoya_F05','Pipoya_F06','Pipoya_F07','Pipoya_M07','Pipoya_F08',
  'Pipoya_F09','Pipoya_M08','Pipoya_M09','Pipoya_M10','Pipoya_M11',
  'Pipoya_F10','Pipoya_M12','Pipoya_M13','Pipoya_M14','Pipoya_M15',
  'Pipoya_F11','Pipoya_M16','Pipoya_M17','Pipoya_F12','Pipoya_M18',
  'Pipoya_F13','Pipoya_M19','Pipoya_M20','Pipoya_M21','Pipoya_M22',
  'Pipoya_M23','Pipoya_F14','Pipoya_F15','Pipoya_F16','Pipoya_F17',
  'Pipoya_M24','Pipoya_F18','Pipoya_F19','Pipoya_M25','Pipoya_M26',
  'Pipoya_F20','Pipoya_F21','Pipoya_F22','Pipoya_M27','Pipoya_M28',
  'Pipoya_F23','Pipoya_F24','Pipoya_F25','Pipoya_M29','Pipoya_F26',
  'Pipoya_M30','Pipoya_F27','Pipoya_M31','Pipoya_M32','Pipoya_F28',
  'Pipoya_M33','Pipoya_M34','Pipoya_F29','Pipoya_F30','Pipoya_M35',
  'Pipoya_M36','Pipoya_F31','Pipoya_F32','Pipoya_M37','Pipoya_M38',
  'Pipoya_M39','Pipoya_M40','Pipoya_M41','Pipoya_F33','Pipoya_F34',
  'Pipoya_F35','Pipoya_M42','Pipoya_M43','Pipoya_F36','Pipoya_F37',
  'Pipoya_F38','Pipoya_F39','Pipoya_F40','Pipoya_F41','Pipoya_F42',
  'Pipoya_M44','Pipoya_M45','Pipoya_M46','Pipoya_M47','Pipoya_F43',
  'Pipoya_F44','Pipoya_F45','Pipoya_F46','Pipoya_F47','Pipoya_F48',
  'Pipoya_M48','Pipoya_F49','Pipoya_F50','Pipoya_M49','Pipoya_M50',
];

function renderSpotlightProfile(agents, idx) {
  const el = document.getElementById('fig23-profile');
  if (!el) return;
  const a = agents[idx];
  const sprite = SPOTLIGHT_SPRITES[idx] || 'Pipoya_F01';
  // Sprite sheet: 96×128, frames 32×32. "down" idle = (32,0). Show at 3× = 96px.
  const spriteUrl = `assets/characters/${sprite}.png`;
  const traitTags = (a.traits || []).map(t => `<span class="spotlight-trait-tag">${esc(t)}</span>`).join(' ');
  const genderLabel = a.gender === 'male' ? 'Male' : 'Female';

  el.innerHTML = `
    <div class="spotlight-sprite" style="background-image:url('${spriteUrl}');background-size:${96*3}px ${128*3}px;background-position:-${32*3}px 0"></div>
    <div class="spotlight-info">
      <div class="spotlight-name">${esc(a.name)}</div>
      <div class="spotlight-demo">${genderLabel}, Age ${a.age}</div>
      <div class="spotlight-traits">${traitTags}</div>
      <div class="spotlight-agent-dd-wrap">
        <select id="fig23-agent-dd">
          ${agents.map((ag, i) => {
            const g = ag.gender === 'male' ? 'M' : 'F';
            return `<option value="${i}"${i === idx ? ' selected' : ''}>${esc(ag.name)}, ${g}, ${ag.age}</option>`;
          }).join('')}
        </select>
      </div>
    </div>`;

  document.getElementById('fig23-agent-dd').addEventListener('change', e => {
    spotlightAgentIdx = +e.target.value;
    renderSpotlightProfile(agents, spotlightAgentIdx);
    clearSpotlightResponses();
    renderFig23Chart();
  });
}

function clearSpotlightResponses() {
  const el = document.getElementById('fig23-responses');
  if (el) el.innerHTML = '';
}

// Distinct color palette for spotlight chart (position-based, always distinguishable)
const SPOTLIGHT_PALETTE = [
  '#7C3AED', // violet
  '#22C55E', // green
  '#3B82F6', // blue
  '#F59E0B', // amber
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#EF4444', // red
  '#8B5CF6', // purple
  '#14B8A6', // teal
  '#F97316', // orange
  '#84CC16', // lime
];
let spotlightColorMap = {}; // idx → color, rebuilt each render

// Preset groupings — indices into CONFIG.MODELS
const SPOTLIGHT_PRESETS = [
  { label: 'Flagships',                indices: [0, 5, 14] },  // Opus 4.5, GPT-5.2, Gemini 3 Flash
  { label: 'Reasoning (GPT-5.2)',      indices: [5, 6, 7, 8] },
  { label: 'Reasoning (Gemini 3)',     indices: [14, 15, 16, 17] },
  { label: 'Size (Anthropic)',         indices: [0, 1, 2] },   // Opus, Sonnet, Haiku
  { label: 'Size (Gemini)',            indices: [18, 19] },     // Flash Lite, Flash
  { label: 'Evolution (OpenAI)',       indices: [12, 11, 9, 5] },  // 3.5 Turbo, 4o, 5.1, 5.2
  { label: 'Evolution (Anthropic)',    indices: [3, 1] },       // Sonnet 4.0, Sonnet 4.5
  { label: 'Evolution (Gemini)',       indices: [20, 19, 14] }, // 2.0, 2.5, 3 Flash
  { label: 'Anthropic',               indices: [0, 1, 2, 3, 4] },
  { label: 'OpenAI',                  indices: [5, 6, 7, 8, 9, 10, 11, 12, 13] },
  { label: 'Gemini',                  indices: [14, 15, 16, 17, 18, 19, 20] },
];
let activePreset = 0; // start with Flagships

function applyPreset(presetIdx) {
  activePreset = presetIdx;
  spotlightChecked.clear();
  SPOTLIGHT_PRESETS[presetIdx].indices.forEach(i => spotlightChecked.add(i));
  syncCheckboxes();
  clearSpotlightResponses();
  renderFig23Chart();
  // Update active pill
  document.querySelectorAll('.spotlight-preset-pill').forEach((pill, i) => {
    pill.classList.toggle('active', i === presetIdx);
  });
}

function syncCheckboxes() {
  document.querySelectorAll('.spotlight-model-cb').forEach(cb => {
    cb.checked = spotlightChecked.has(+cb.dataset.idx);
  });
  ['anthropic', 'openai', 'gemini'].forEach(prov => {
    const provCbs = [...document.querySelectorAll(`.spotlight-model-cb`)].filter(c => CONFIG.MODELS[+c.dataset.idx].provider === prov);
    const provAll = document.querySelector(`.spotlight-prov-all[data-provider="${prov}"]`);
    if (provAll) provAll.checked = provCbs.length > 0 && provCbs.every(c => c.checked);
  });
}

function initFig23Spotlight(agents) {
  // Profile card
  renderSpotlightProfile(agents, spotlightAgentIdx);

  const modelSel = document.getElementById('fig23-model-select');

  // Preset pills
  let phtml = '<div class="spotlight-presets">';
  SPOTLIGHT_PRESETS.forEach((p, i) => {
    phtml += `<button class="spotlight-preset-pill${i === activePreset ? ' active' : ''}" data-preset="${i}">${esc(p.label)}</button>`;
  });
  phtml += '</div>';

  // Model checkboxes grouped by provider (collapsible detail)
  const providers = ['anthropic', 'openai', 'gemini'];
  const provLabels = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini' };

  // Apply default preset
  spotlightChecked.clear();
  SPOTLIGHT_PRESETS[activePreset].indices.forEach(i => spotlightChecked.add(i));

  let mhtml = '<details class="spotlight-model-details"><summary style="font-size:11px;color:#888;cursor:pointer;margin-bottom:6px">Fine-tune model selection</summary>';
  mhtml += '<div class="spotlight-model-grid">';
  providers.forEach(prov => {
    mhtml += '<div class="spotlight-provider-group">';
    mhtml += `<label class="provider-label"><input type="checkbox" class="spotlight-prov-all" data-provider="${prov}"> ${provLabels[prov]}</label>`;
    CONFIG.MODELS.forEach((m, i) => {
      if (m.provider !== prov) return;
      mhtml += `<label><input type="checkbox" class="spotlight-model-cb" data-idx="${i}" ${spotlightChecked.has(i) ? 'checked' : ''}> ${esc(m.label)}</label>`;
    });
    mhtml += '</div>';
  });
  mhtml += '</div></details>';

  modelSel.innerHTML = phtml + mhtml;

  // Update provider "select all" state
  syncCheckboxes();

  // Preset click handlers
  document.querySelectorAll('.spotlight-preset-pill').forEach(pill => {
    pill.addEventListener('click', () => applyPreset(+pill.dataset.preset));
  });

  // Checkbox event handlers
  document.querySelectorAll('.spotlight-model-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = +cb.dataset.idx;
      if (cb.checked) spotlightChecked.add(idx); else spotlightChecked.delete(idx);
      const prov = CONFIG.MODELS[idx].provider;
      const provCbs = [...document.querySelectorAll(`.spotlight-model-cb`)].filter(c => CONFIG.MODELS[+c.dataset.idx].provider === prov);
      const provAll = document.querySelector(`.spotlight-prov-all[data-provider="${prov}"]`);
      if (provAll) provAll.checked = provCbs.every(c => c.checked);
      // Deactivate preset pills when manually toggling
      document.querySelectorAll('.spotlight-preset-pill').forEach(p => p.classList.remove('active'));
      clearSpotlightResponses();
      renderFig23Chart();
    });
  });
  document.querySelectorAll('.spotlight-prov-all').forEach(cb => {
    cb.addEventListener('change', () => {
      const prov = cb.dataset.provider;
      const checked = cb.checked;
      document.querySelectorAll('.spotlight-model-cb').forEach(mcb => {
        if (CONFIG.MODELS[+mcb.dataset.idx].provider === prov) {
          mcb.checked = checked;
          if (checked) spotlightChecked.add(+mcb.dataset.idx); else spotlightChecked.delete(+mcb.dataset.idx);
        }
      });
      document.querySelectorAll('.spotlight-preset-pill').forEach(p => p.classList.remove('active'));
      clearSpotlightResponses();
      renderFig23Chart();
    });
  });

  renderFig23Chart();
}

function renderFig23Chart() {
  const el = document.getElementById('fig23-chart');
  const legendEl = document.getElementById('fig23-legend');
  if (!el) return;

  const indices = [...spotlightChecked].sort((a, b) => a - b);
  if (!indices.length) {
    el.innerHTML = '<p style="color:#888;font-size:12px;padding:20px 0">Select at least one model.</p>';
    legendEl.innerHTML = '';
    return;
  }

  let loaded = 0;
  const results = {};
  indices.forEach(idx => {
    loadMicro(idx, (rows, cfg) => {
      results[idx] = computeAgentCurve(rows, spotlightAgentIdx);
      spotlightMicroRows[idx] = rows; // keep raw rows for reasoning text
      if (++loaded === indices.length) drawFig23(el, legendEl, indices, results);
    });
  });
}

function computeAgentCurve(microRows, agentIdx) {
  const byLevel = {};
  microRows.forEach(r => {
    if (+r.agent_id !== agentIdx) return;
    const lv = parseFloat(r.infection_level);
    if (!byLevel[lv]) byLevel[lv] = { yes: 0, total: 0 };
    byLevel[lv].total++;
    if (r.response === 'yes') byLevel[lv].yes++;
  });
  return CONFIG.INFECTION_LEVELS.map(lv => {
    const b = byLevel[lv];
    return { level: lv, count: b ? b.yes : null, total: b ? b.total : 0 };
  });
}

function drawFig23(el, legendEl, indices, results) {
  const W = CW, H = CH;
  const pad = { ...PAD };
  const xMin = 0, xMax = 0.075;
  const toX = v => pad.l + (v - xMin) / (xMax - xMin) * (W - pad.l - pad.r);
  const toY = v => H - pad.b - (v / 5) * (H - pad.t - pad.b);

  let svg = '';
  // Y-axis grid
  [0, 1, 2, 3, 4, 5].forEach(v => {
    const y = toY(v);
    svg += `<line x1="${pad.l}" y1="${y.toFixed(1)}" x2="${W - pad.r}" y2="${y.toFixed(1)}" stroke="${GRID_COLOR}"/>`;
    const label = v === 0 ? '0 (goes out)' : v === 5 ? '5 (stays home)' : String(v);
    svg += `<text x="${pad.l - 6}" y="${(y + 4).toFixed(1)}" font-size="9" fill="${AX_COLOR}" font-family="${SERIF}" text-anchor="end">${label}</text>`;
  });
  // X-axis grid
  [0, 0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07].forEach(v => {
    const x = toX(v);
    svg += `<line x1="${x.toFixed(1)}" y1="${pad.t}" x2="${x.toFixed(1)}" y2="${H - pad.b}" stroke="${GRID_COLOR}"/>`;
    svg += `<text x="${x.toFixed(1)}" y="${H - pad.b + 14}" font-size="9" fill="${AX_COLOR}" font-family="${SERIF}" text-anchor="middle">${(v * 100).toFixed(0)}%</text>`;
  });
  svg += `<text x="${(pad.l + W - pad.r) / 2}" y="${H - 6}" font-size="10" fill="${AX_COLOR}" font-family="${SERIF}" text-anchor="middle">Infection Rate (% of Population)</text>`;
  svg += `<text x="12" y="${(pad.t + H - pad.b) / 2}" font-size="10" fill="${AX_COLOR}" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,12,${(pad.t + H - pad.b) / 2})">Stay-Home Decisions (out of 5 runs)</text>`;

  // Build position-based color map for this render
  spotlightColorMap = {};
  indices.forEach((idx, pos) => {
    spotlightColorMap[idx] = SPOTLIGHT_PALETTE[pos % SPOTLIGHT_PALETTE.length];
  });

  // Lines + clickable dots
  const dotData = [];
  indices.forEach(idx => {
    const m = CONFIG.MODELS[idx];
    const color = spotlightColorMap[idx];
    const curve = results[idx];
    if (!curve) return;
    const validPts = curve.filter(p => p.count !== null);
    const pts = validPts.map(p => `${toX(p.level / 100).toFixed(1)},${toY(p.count).toFixed(1)}`);
    if (pts.length < 2) return;
    const dash = m.dash ? ` stroke-dasharray="${m.dash}"` : '';
    svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.8"${dash} class="spotlight-line" data-idx="${idx}"/>`;
    // Dots
    validPts.forEach(p => {
      const cx = toX(p.level / 100);
      const cy = toY(p.count);
      svg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4" fill="${color}" stroke="#fff" stroke-width="1.2" class="spotlight-dot" data-idx="${idx}" data-level="${p.level}" style="cursor:pointer" opacity="0.7"/>`;
      dotData.push({ idx, level: p.level, cx, cy, count: p.count });
    });
  });

  // Click hint
  svg += `<text x="${W - pad.r}" y="${pad.t - 6}" font-size="9" fill="#aaa" font-family="${SERIF}" text-anchor="end" font-style="italic">Click a dot to see reasoning</text>`;

  el.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" id="fig23-svg">${svg}</svg>`;

  // Click handler: clicking any dot shows ALL models at that infection level
  const svgEl = document.getElementById('fig23-svg');
  svgEl.addEventListener('click', e => {
    const dot = e.target.closest('.spotlight-dot');
    if (!dot) return;
    const level = parseFloat(dot.dataset.level);
    showSpotlightResponses(level, indices);

    // Highlight all dots at this infection level, dim others
    svgEl.querySelectorAll('.spotlight-dot').forEach(d => {
      const dLevel = parseFloat(d.dataset.level);
      if (Math.abs(dLevel - level) < 0.001) {
        d.setAttribute('opacity', '1');
        d.setAttribute('r', '6');
      } else {
        d.setAttribute('opacity', '0.3');
        d.setAttribute('r', '4');
      }
    });
    svgEl.querySelectorAll('.spotlight-line').forEach(l => l.setAttribute('opacity', '0.6'));
  });

  // Hover
  svgEl.addEventListener('mouseover', e => {
    const dot = e.target.closest('.spotlight-dot');
    if (!dot) return;
    dot.setAttribute('r', '6');
    dot.setAttribute('opacity', '1');
  });
  svgEl.addEventListener('mouseout', e => {
    const dot = e.target.closest('.spotlight-dot');
    if (!dot) return;
    dot.setAttribute('r', '4');
  });

  // Legend (using spotlight palette colors)
  legendEl.innerHTML = indices.map(idx => {
    const m = CONFIG.MODELS[idx];
    const color = spotlightColorMap[idx];
    const dashStyle = m.dash ? `background:repeating-linear-gradient(90deg,${color} 0,${color} 4px,transparent 4px,transparent 7px)` : `background:${color}`;
    return `<span class="legend-item"><span class="legend-swatch" style="${dashStyle}"></span>${esc(m.label)}</span>`;
  }).join('');
}

function showSpotlightResponses(level, indices) {
  const el = document.getElementById('fig23-responses');
  if (!el) return;

  let html = `<div class="spotlight-resp-level-header">Responses at ${level.toFixed(1)}% infection</div>`;

  let hasAny = false;
  indices.forEach(idx => {
    const m = CONFIG.MODELS[idx];
    const color = spotlightColorMap[idx] || m.color;
    const rows = spotlightMicroRows[idx];
    if (!rows) return;

    const reps = rows.filter(r =>
      +r.agent_id === spotlightAgentIdx &&
      Math.abs(parseFloat(r.infection_level) - level) < 0.001
    ).sort((a, b) => (+a.rep) - (+b.rep));

    if (!reps.length) return;
    hasAny = true;

    const yesCount = reps.filter(r => r.response === 'yes').length;
    const noCount = reps.length - yesCount;
    const countLabel = yesCount === 5 ? '5/5 home' : noCount === 5 ? '5/5 out' : `${yesCount} home, ${noCount} out`;

    // Each model is a collapsible details element
    html += `<details class="spotlight-resp-model-section">
      <summary class="spotlight-resp-header">
        <span class="spotlight-resp-swatch" style="background:${color}"></span>
        <span class="spotlight-resp-model">${esc(m.label)}</span>
        <span style="margin-left:auto;font-size:11px;color:#666">${countLabel}</span>
      </summary>
      <div class="spotlight-resp-list">`;

    reps.forEach((r, i) => {
      const isYes = r.response === 'yes';
      const badge = isYes
        ? '<span class="spotlight-resp-badge yes">Stays Home</span>'
        : '<span class="spotlight-resp-badge no">Goes Out</span>';
      const text = (r.reasoning_text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      html += `<div class="spotlight-resp-run">
        <div><strong style="font-size:11px;color:#888">Rep ${i + 1}:</strong> ${badge}</div>
        <div class="spotlight-resp-text">${text}</div>
      </div>`;
    });

    html += '</div></details>';
  });

  if (!hasAny) {
    html += '<div class="spotlight-click-hint">No data found for this infection level.</div>';
  }

  el.innerHTML = html;
}

// ── Fig 24: Trait Effects ────────────────────────────────────
function renderFig24TraitEffects(microRows, cfg) {
  const el = document.getElementById('fig24-chart');
  if (!el || !agentsData) return;

  // Compute transition point per agent
  const agentVotes = {};
  microRows.forEach(r => {
    const aid = +r.agent_id;
    const lv = parseFloat(r.infection_level);
    const key = `${aid}|${lv}`;
    if (!agentVotes[key]) agentVotes[key] = { yes: 0, total: 0 };
    agentVotes[key].total++;
    if (r.response === 'yes') agentVotes[key].yes++;
  });

  const transitions = agentsData.map(a => {
    let tp = null;
    for (const lv of CONFIG.INFECTION_LEVELS) {
      const key = `${a.agent_id}|${lv}`;
      const v = agentVotes[key];
      if (v && v.yes > v.total / 2) { tp = lv; break; }
    }
    return { agent: a, tp: tp !== null ? tp : 8 }; // 8 = never transitions (beyond max)
  });

  // Trait dimension analysis
  const dims = [
    { name: 'Extraversion', hi: 'extroverted', lo: 'introverted' },
    { name: 'Agreeableness', hi: 'agreeable', lo: 'antagonistic' },
    { name: 'Conscientiousness', hi: 'conscientious', lo: 'unconscientious' },
    { name: 'Emotional Stability', hi: 'emotionally stable', lo: 'neurotic' },
    { name: 'Openness', hi: 'open to experience', lo: 'closed to experience' },
  ];

  const traitColors = ['#7C3AED','#22C55E','#3B82F6','#F59E0B','#EC4899'];

  const W = CW, barH = 18, rowH = 54, maxTP = 7;
  const gap = 120; // wider gap for centered trait dimension labels
  const halfW = (W - gap) / 2;
  const traitH = dims.length * rowH + 50;

  // Precompute trait data for both panels
  const traitData = dims.map((d, i) => {
    const hiAll = transitions.filter(t => t.agent.traits.includes(d.hi));
    const loAll = transitions.filter(t => t.agent.traits.includes(d.lo));
    const hiTrans = hiAll.filter(t => t.tp <= maxTP);
    const loTrans = loAll.filter(t => t.tp <= maxTP);
    return {
      dim: d, color: traitColors[i],
      hiAll: hiAll.length, loAll: loAll.length,
      hiNever: hiAll.length - hiTrans.length, loNever: loAll.length - loTrans.length,
      hiPctNever: hiAll.length ? (hiAll.length - hiTrans.length) / hiAll.length * 100 : 0,
      loPctNever: loAll.length ? (loAll.length - loTrans.length) / loAll.length * 100 : 0,
      hiMean: hiTrans.length ? hiTrans.reduce((s, t) => s + t.tp, 0) / hiTrans.length : null,
      loMean: loTrans.length ? loTrans.reduce((s, t) => s + t.tp, 0) / loTrans.length : null,
      hiTransN: hiTrans.length, loTransN: loTrans.length,
    };
  });

  // ── LEFT PANEL: % Never Transitioned ──
  const L = { x: 0, padL: 10, padR: 10 };
  const lBarMax = halfW - L.padL - L.padR;
  const lScale = lBarMax / 100; // 100% max

  let svg = `<text x="${halfW / 2}" y="14" font-size="12" font-weight="bold" fill="#111" font-family="${SERIF}" text-anchor="middle">% Never Transitioned</text>`;
  svg += `<text x="${halfW / 2}" y="28" font-size="10" fill="#888" font-family="${SERIF}" font-style="italic" text-anchor="middle">${esc(cfg.label)}</text>`;

  traitData.forEach((td, i) => {
    const y = 44 + i * rowH;
    // Trait dimension label — centered in gap between panels
    svg += `<text x="${halfW + gap / 2}" y="${y + barH + 6}" font-size="10" fill="#333" font-family="${SERIF}" text-anchor="middle" font-weight="bold">${td.dim.name}</text>`;

    // Hi trait bar (grows right-to-left from gap edge)
    const barAreaRight = halfW;
    const hiW = Math.max(td.hiPctNever * lScale, 1);
    const hiX = barAreaRight - hiW;
    svg += `<rect x="${hiX.toFixed(1)}" y="${y}" width="${hiW.toFixed(1)}" height="${barH}" fill="${td.color}" opacity="0.8" rx="2"/>`;
    const hiLabel = `${td.dim.hi} (${td.hiPctNever.toFixed(0)}%) n=${td.hiNever}`;
    // Label outside bar (to the left)
    if (hiX > hiLabel.length * 5.2 + 4) {
      svg += `<text x="${hiX - 4}" y="${y + 12}" font-size="9" fill="#333" font-family="${SERIF}" text-anchor="end">${hiLabel}</text>`;
    } else {
      svg += `<text x="${barAreaRight - 4}" y="${y + 12}" font-size="9" fill="#fff" font-family="${SERIF}" text-anchor="end">${hiLabel}</text>`;
    }

    // Lo trait bar
    const loW = Math.max(td.loPctNever * lScale, 1);
    const loX = barAreaRight - loW;
    svg += `<rect x="${loX.toFixed(1)}" y="${y + barH + 4}" width="${loW.toFixed(1)}" height="${barH}" fill="${td.color}" opacity="0.35" rx="2"/>`;
    const loLabel = `${td.dim.lo} (${td.loPctNever.toFixed(0)}%) n=${td.loNever}`;
    if (loX > loLabel.length * 5.2 + 4) {
      svg += `<text x="${loX - 4}" y="${y + barH + 16}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="end">${loLabel}</text>`;
    } else {
      svg += `<text x="${barAreaRight - 4}" y="${y + barH + 16}" font-size="9" fill="#333" font-family="${SERIF}" text-anchor="end">${loLabel}</text>`;
    }
  });

  // ── RIGHT PANEL: Mean Transition Point (transitioned only) ──
  const R = { x: halfW + gap, padL: 10, padR: 30 };
  const rBarMax = halfW - R.padL - R.padR;
  const rScale = rBarMax / maxTP;

  svg += `<text x="${R.x + halfW / 2}" y="14" font-size="12" font-weight="bold" fill="#111" font-family="${SERIF}" text-anchor="middle">Mean Transition Point</text>`;
  svg += `<text x="${R.x + halfW / 2}" y="28" font-size="10" fill="#888" font-family="${SERIF}" font-style="italic" text-anchor="middle">mean infection level at first transition</text>`;

  traitData.forEach((td, i) => {
    const y = 44 + i * rowH;
    const barX = R.x + R.padL;
    const barMaxW = halfW - R.padL - R.padR;

    // Hi trait bar
    if (td.hiMean !== null) {
      const hiW = Math.min(Math.max(td.hiMean * rScale, 2), barMaxW);
      svg += `<rect x="${barX}" y="${y}" width="${hiW.toFixed(1)}" height="${barH}" fill="${td.color}" opacity="0.8" rx="2"/>`;
      const hiLabel = `${td.dim.hi} (${td.hiMean.toFixed(1)}% inf.) n=${td.hiTransN}`;
      const hiSpace = R.x + halfW - R.padR - (barX + hiW + 4);
      if (hiSpace < hiLabel.length * 5) {
        svg += `<text x="${barX + hiW - 4}" y="${y + 12}" font-size="9" fill="#fff" font-family="${SERIF}" text-anchor="end">${hiLabel}</text>`;
      } else {
        svg += `<text x="${barX + hiW + 4}" y="${y + 12}" font-size="9" fill="#333" font-family="${SERIF}">${hiLabel}</text>`;
      }
    } else {
      svg += `<text x="${barX + 4}" y="${y + 12}" font-size="9" fill="#bbb" font-family="${SERIF}" font-style="italic">${td.dim.hi} — no agents transitioned</text>`;
    }

    // Lo trait bar
    if (td.loMean !== null) {
      const loW = Math.min(Math.max(td.loMean * rScale, 2), barMaxW);
      svg += `<rect x="${barX}" y="${y + barH + 4}" width="${loW.toFixed(1)}" height="${barH}" fill="${td.color}" opacity="0.35" rx="2"/>`;
      const loLabel = `${td.dim.lo} (${td.loMean.toFixed(1)}% inf.) n=${td.loTransN}`;
      const loSpace = R.x + halfW - R.padR - (barX + loW + 4);
      if (loSpace < loLabel.length * 5) {
        svg += `<text x="${barX + loW - 4}" y="${y + barH + 16}" font-size="9" fill="#333" font-family="${SERIF}" text-anchor="end">${loLabel}</text>`;
      } else {
        svg += `<text x="${barX + loW + 4}" y="${y + barH + 16}" font-size="9" fill="#555" font-family="${SERIF}">${loLabel}</text>`;
      }
    } else {
      svg += `<text x="${barX + 4}" y="${y + barH + 16}" font-size="9" fill="#bbb" font-family="${SERIF}" font-style="italic">${td.dim.lo} — no agents transitioned</text>`;
    }
  });

  // Age scatter below trait bars
  const scatterY0 = traitH + 20;
  const scatterH = 250;
  const neverBand = 30; // extra height for "Never" zone above 7%
  const scatterPad = { t: 30, b: 40, l: 80, r: 60 };
  const ageMin = 18, ageMax = 65;
  const plotTop = scatterY0 + scatterPad.t + neverBand;
  const plotBot = scatterY0 + scatterH - scatterPad.b;
  const toAX = age => scatterPad.l + (age - ageMin) / (ageMax - ageMin) * (W - scatterPad.l - scatterPad.r);
  const toAY = tp => {
    if (tp > maxTP) return scatterY0 + scatterPad.t + neverBand / 2; // center in "Never" band
    return plotTop + (1 - tp / maxTP) * (plotBot - plotTop);
  };

  svg += `<text x="${scatterPad.l}" y="${scatterY0 + 14}" font-size="12" font-weight="bold" fill="#111" font-family="${SERIF}">Age vs. Transition Point</text>`;

  // "Never" band background
  svg += `<rect x="${scatterPad.l}" y="${scatterY0 + scatterPad.t}" width="${W - scatterPad.l - scatterPad.r}" height="${neverBand}" fill="#f5f5f5" rx="2"/>`;
  svg += `<text x="${scatterPad.l - 6}" y="${(scatterY0 + scatterPad.t + neverBand / 2 + 3).toFixed(1)}" font-size="8" fill="#999" font-family="${SERIF}" text-anchor="end">Never</text>`;
  // Separator line below "Never" band
  svg += `<line x1="${scatterPad.l}" y1="${plotTop}" x2="${W - scatterPad.r}" y2="${plotTop}" stroke="#ccc" stroke-dasharray="3,3"/>`;

  // Grid lines for 0-7%
  [0, 1, 2, 3, 4, 5, 6, 7].forEach(v => {
    const y = toAY(v);
    svg += `<line x1="${scatterPad.l}" y1="${y.toFixed(1)}" x2="${W - scatterPad.r}" y2="${y.toFixed(1)}" stroke="${GRID_COLOR}"/>`;
    svg += `<text x="${scatterPad.l - 6}" y="${(y + 3).toFixed(1)}" font-size="9" fill="${AX_COLOR}" font-family="${SERIF}" text-anchor="end">${v}%</text>`;
  });
  [20, 30, 40, 50, 60].forEach(v => {
    const x = toAX(v);
    svg += `<line x1="${x.toFixed(1)}" y1="${plotTop}" x2="${x.toFixed(1)}" y2="${plotBot}" stroke="${GRID_COLOR}"/>`;
    svg += `<text x="${x.toFixed(1)}" y="${plotBot + 14}" font-size="9" fill="${AX_COLOR}" font-family="${SERIF}" text-anchor="middle">${v}</text>`;
  });
  svg += `<text x="${(scatterPad.l + W - scatterPad.r) / 2}" y="${scatterY0 + scatterH - 2}" font-size="10" fill="${AX_COLOR}" font-family="${SERIF}" text-anchor="middle">Agent Age</text>`;
  svg += `<text x="12" y="${(plotTop + plotBot) / 2}" font-size="10" fill="${AX_COLOR}" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,12,${(plotTop + plotBot) / 2})">Transition Point (%)</text>`;

  // Dots — different style for "never" agents
  transitions.forEach(t => {
    const cx = toAX(t.agent.age);
    const cy = toAY(t.tp);
    if (t.tp > maxTP) {
      svg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.5" fill="#999" opacity="0.5"/>`;
    } else {
      svg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.5" fill="#7C3AED" opacity="0.5"/>`;
    }
  });

  // Trend line — exclude never-transitioners (regression on transitioned agents only)
  const transitioned = transitions.filter(t => t.tp <= maxTP);
  const neverCount = transitions.length - transitioned.length;
  const n = transitioned.length;

  // Annotation: how many never transitioned — place above the Never band, not inside it
  svg += `<text x="${W - scatterPad.r}" y="${scatterY0 + scatterPad.t - 4}" font-size="8" fill="#999" font-family="${SERIF}" text-anchor="end">${neverCount} of ${transitions.length} agents never transitioned (gray)</text>`;

  if (n >= 3) {
    const sumX = transitioned.reduce((s, t) => s + t.agent.age, 0);
    const sumY = transitioned.reduce((s, t) => s + t.tp, 0);
    const sumXY = transitioned.reduce((s, t) => s + t.agent.age * t.tp, 0);
    const sumXX = transitioned.reduce((s, t) => s + t.agent.age * t.agent.age, 0);
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    // t-test for slope significance
    const yHat = transitioned.map(t => intercept + slope * t.agent.age);
    const sse = transitioned.reduce((s, t, i) => s + Math.pow(t.tp - yHat[i], 2), 0);
    const sxx = sumXX - sumX * sumX / n;
    const se = Math.sqrt(sse / ((n - 2) * sxx));
    const tStat = Math.abs(slope / se);
    const pVal = 2 * (1 - normalCDF(tStat));
    const sig = pVal < 0.05;

    const trendColor = sig ? '#22C55E' : '#999';
    const x1 = ageMin, x2 = ageMax;
    const y1 = intercept + slope * x1, y2 = intercept + slope * x2;
    const ty1 = Math.max(toAY(Math.min(y1, maxTP)), plotTop);
    const ty2 = Math.max(toAY(Math.min(y2, maxTP)), plotTop);
    svg += `<line x1="${toAX(x1).toFixed(1)}" y1="${ty1.toFixed(1)}" x2="${toAX(x2).toFixed(1)}" y2="${ty2.toFixed(1)}" stroke="${trendColor}" stroke-width="1.5" stroke-dasharray="6,3" opacity="0.7"/>`;
    const sigLabel = sig ? `slope = ${slope.toFixed(3)}, p < 0.05 (n = ${n})` : `slope = ${slope.toFixed(3)}, n.s. (n = ${n})`;
    svg += `<text x="${W - scatterPad.r}" y="${plotTop + 14}" font-size="9" fill="${trendColor}" font-family="${SERIF}" text-anchor="end" font-style="italic">${sigLabel}</text>`;
  }

  // Footnote
  const footY = scatterY0 + scatterH + 14;
  const footLines = [
    'Transition point = first infection level (0\u20137%) where an agent\u2019s majority decision across 5 repetitions is to stay home (\u22653 of 5).',
    '\u201CNever\u201D = agents who never reached majority stay-home at any tested level. Left panel shows % never-transitioned per trait pole.',
    'Right panel: mean transition point computed from transitioned agents only (n = sample size). Trend line excludes never-transitioners.',
  ];
  footLines.forEach((line, i) => {
    svg += `<text x="10" y="${footY + i * 13}" font-size="7.5" fill="#aaa" font-family="${SERIF}">${line}</text>`;
  });

  const totalH = footY + footLines.length * 13 + 6;
  el.innerHTML = `<svg width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}">${svg}</svg>`;
}

// ── Fig 25: Agent-Level Logistic Regression (pre-computed from R) ──
const regressionCache = {};

function loadRegression(modelIdx, callback) {
  const m = CONFIG.MODELS[modelIdx];
  const dirKey = configDirKey(m);
  if (regressionCache[dirKey]) { callback(regressionCache[dirKey], m); return; }

  fetch(`${CONFIG.DATA_BASE}/regressions/${dirKey}.json`, { cache: 'no-cache' })
    .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
    .then(data => {
      regressionCache[dirKey] = data;
      callback(data, m);
    })
    .catch(err => {
      const el = document.getElementById('fig25-results');
      if (el) el.innerHTML = `<div style="color:#c00;padding:12px;font-size:12px">Failed to load regression for ${esc(m.label)}: ${esc(String(err))}</div>`;
    });
}

function renderFig25Regression(regData, cfg) {
  const el = document.getElementById('fig25-results');
  if (!el) return;

  const m1 = regData.model1;
  const m2 = regData.model2;

  if (m1 && m1.error) { el.innerHTML = `<p style="color:#c00;font-size:12px">Model 1 error: ${esc(m1.error)}</p>`; return; }
  if (m2 && m2.error) { el.innerHTML = `<p style="color:#c00;font-size:12px">Model 2 error: ${esc(m2.error)}</p>`; return; }

  // Predictor display order and labels
  const predictors = [
    { key: 'intercept',         label: 'Intercept' },
    { key: 'infection_pct',     label: 'Infection Rate (%)' },
    { key: 'infection_pct_sq',  label: 'Infection Rate² (%)' },
    { key: 'male',              label: 'Male' },
    { key: 'extraverted',       label: 'Extraverted' },
    { key: 'agreeable',         label: 'Agreeable' },
    { key: 'conscientious',     label: 'Conscientious' },
    { key: 'emot_stable',       label: 'Emotionally Stable' },
    { key: 'open_to_exp',       label: 'Open to Experience' },
    { key: 'age',               label: 'Age (years)' },
  ];

  function fmtCoef(v) { return v == null ? '—' : v.toFixed(3); }
  function fmtOR(v) {
    if (v == null) return '—';
    if (v > 1e6) return '> 10⁶';
    if (v < 1e-6) return '< 10⁻⁶';
    return v.toFixed(3);
  }
  function fmtP(v) {
    if (v == null) return '—';
    if (v < 0.001) return '< .001';
    return v.toFixed(3);
  }

  let html = `<div style="font-size:13px;font-weight:bold;color:#111;margin-bottom:6px">${esc(cfg.label)}</div>`;

  // Dependent variable banner
  html += '<div style="background:#f0f7ff;border:1px solid #b3d4fc;border-radius:4px;padding:8px 12px;margin-bottom:10px;font-size:12px">';
  html += '<strong>Dependent variable:</strong> <code style="background:#e8e8e8;padding:1px 4px;border-radius:2px">stay_home</code> &mdash; <strong>1 = stay home, 0 = go out</strong>. ';
  html += 'Positive coefficients (OR &gt; 1) &rarr; higher odds of staying home. Negative (OR &lt; 1) &rarr; higher odds of going out.';
  html += '</div>';

  // Table
  html += '<table class="ols-table" style="width:100%;font-size:11px;border-collapse:collapse">';
  html += '<thead><tr style="border-bottom:2px solid #333">';
  html += '<th style="text-align:left;padding:3px 6px">Predictor</th>';
  html += '<th style="text-align:right;padding:3px 6px">Coef</th><th style="text-align:right;padding:3px 6px">OR</th><th style="text-align:center;padding:3px 6px">Sig</th>';
  html += '<th style="text-align:right;padding:3px 6px;border-left:2px solid #ccc">Coef</th><th style="text-align:right;padding:3px 6px">OR</th><th style="text-align:center;padding:3px 6px">Sig</th>';
  html += '</tr>';
  html += '<tr style="border-bottom:1px solid #ccc;font-size:10px;color:#666">';
  html += '<th></th>';
  html += '<th colspan="3" style="text-align:center;padding:1px">Model 1: Fixed Effects</th>';
  html += '<th colspan="3" style="text-align:center;padding:1px;border-left:2px solid #ccc">Model 2: Random Effects</th>';
  html += '</tr></thead><tbody>';

  const m1c = m1 ? m1.coefficients : {};
  const m2c = m2 ? m2.coefficients : {};

  predictors.forEach((pred, i) => {
    const c1 = m1c[pred.key];
    const c2 = m2c[pred.key];
    const bg = i % 2 === 0 ? '#fafafa' : '#fff';
    html += `<tr style="background:${bg}">`;
    html += `<td style="font-weight:600;padding:3px 6px">${pred.label}</td>`;
    // Model 1
    html += `<td style="text-align:right;padding:3px 6px;font-family:monospace">${c1 ? fmtCoef(c1.estimate) : ''}</td>`;
    html += `<td style="text-align:right;padding:3px 6px;font-family:monospace">${c1 ? fmtOR(c1.or) : ''}</td>`;
    html += `<td style="text-align:center;padding:3px 6px;font-family:monospace">${c1 ? c1.sig : ''}</td>`;
    // Model 2
    html += `<td style="text-align:right;padding:3px 6px;font-family:monospace;border-left:2px solid #ccc">${c2 ? fmtCoef(c2.estimate) : '—'}</td>`;
    html += `<td style="text-align:right;padding:3px 6px;font-family:monospace">${c2 ? fmtOR(c2.or) : '—'}</td>`;
    html += `<td style="text-align:center;padding:3px 6px;font-family:monospace">${c2 ? c2.sig : ''}</td>`;
    html += '</tr>';
  });

  // Footer row: fit statistics
  html += '<tr style="border-top:2px solid #333"><td style="font-weight:600;padding:3px 6px">AIC</td>';
  html += `<td colspan="3" style="text-align:center;padding:3px 6px">${m1 && m1.fit ? m1.fit.aic.toLocaleString() : '—'}</td>`;
  html += `<td colspan="3" style="text-align:center;padding:3px 6px;border-left:2px solid #ccc">${m2 && m2.fit ? m2.fit.aic.toLocaleString() : '—'}</td>`;
  html += '</tr>';
  html += '<tr><td style="font-weight:600;padding:3px 6px">BIC</td>';
  html += `<td colspan="3" style="text-align:center;padding:3px 6px">${m1 && m1.fit && m1.fit.bic ? m1.fit.bic.toLocaleString() : '—'}</td>`;
  html += `<td colspan="3" style="text-align:center;padding:3px 6px;border-left:2px solid #ccc">${m2 && m2.fit && m2.fit.bic ? m2.fit.bic.toLocaleString() : '—'}</td>`;
  html += '</tr>';
  // Pseudo R² (McFadden)
  html += '<tr><td style="font-weight:600;padding:3px 6px">Pseudo R²</td>';
  html += `<td colspan="3" style="text-align:center;padding:3px 6px">${m1 && m1.fit && m1.fit.pseudo_r2 != null ? m1.fit.pseudo_r2.toFixed(4) : '—'}</td>`;
  html += `<td colspan="3" style="text-align:center;padding:3px 6px;border-left:2px solid #ccc">—</td>`;
  html += '</tr>';
  html += '<tr><td style="font-weight:600;padding:3px 6px">N</td>';
  html += `<td colspan="3" style="text-align:center;padding:3px 6px">${m1 && m1.fit ? m1.fit.n.toLocaleString() : '—'}</td>`;
  html += `<td colspan="3" style="text-align:center;padding:3px 6px;border-left:2px solid #ccc">${m2 && m2.fit ? m2.fit.n.toLocaleString() : '—'}</td>`;
  html += '</tr>';
  if (m2 && m2.fit && m2.fit.n_groups) {
    html += '<tr><td style="font-weight:600;padding:3px 6px">Groups (agents)</td>';
    html += '<td colspan="3" style="text-align:center;padding:3px 6px"></td>';
    html += `<td colspan="3" style="text-align:center;padding:3px 6px;border-left:2px solid #ccc">${m2.fit.n_groups}</td>`;
    html += '</tr>';
    html += '<tr><td style="font-weight:600;padding:3px 6px">RE Variance (σ²<sub>u</sub>)</td>';
    html += '<td colspan="3" style="text-align:center;padding:3px 6px"></td>';
    html += `<td colspan="3" style="text-align:center;padding:3px 6px;border-left:2px solid #ccc">${m2.fit.re_variance.toFixed(4)}</td>`;
    html += '</tr>';
  }
  html += '</tbody></table>';

  // Convergence warning (R's NULL serializes as {} — filter it out)
  if (m2 && m2.warning && typeof m2.warning === 'string' && m2.warning.length > 0) {
    html += `<div style="margin-top:6px;padding:4px 8px;background:#fff3cd;border:1px solid #ffc107;border-radius:3px;font-size:10px;color:#856404">⚠ Convergence: ${esc(m2.warning)}</div>`;
  }

  // Footnotes
  html += '<div style="margin-top:12px;font-size:10px;color:#666;line-height:1.5;border-top:1px solid #ddd;padding-top:8px">';
  html += '<div style="font-weight:600;margin-bottom:4px">Notes</div>';
  html += '<div>Model 1 = fixed-effects logit (glm) with 99 agent dummies (only infection coefficients reported). ';
  html += 'Model 2 = random-effects logit (glmer, lme4) with random intercepts per agent.</div>';
  html += '<div style="margin-top:4px">Dummy coding: male = 1, extraverted = 1, agreeable = 1, conscientious = 1, emotionally stable = 1, open to experience = 1. ';
  html += 'Reference categories: female, introverted, antagonistic, unconscientious, neurotic, closed to experience.</div>';
  html += '<div style="margin-top:4px">No normalization: age in raw years (18–65), infection rate as percentage (0–7%).</div>';
  html += '<div style="margin-top:4px">Coefficients are log-odds (DV: stay_home, where 1 = stay home, 0 = go out). OR = exp(coefficient). OR > 1 → higher odds of staying home; OR < 1 → higher odds of going out. ';
  html += 'OR CIs = exp(coef ± 1.96 × SE). See "Understanding: Log Odds" in Author Notes for a worked example.</div>';
  html += '<div style="margin-top:4px">Significance: *** p < 0.001, ** p < 0.01, * p < 0.05, . p < 0.1</div>';
  html += '<div style="margin-top:4px">20,000 observations per configuration (100 agents × 40 infection levels × 5 repetitions). ';
  html += 'Computed in R using glm() and lme4::glmer(optimizer = bobyqa).</div>';
  html += '</div>';

  el.innerHTML = html;
}

// ── Normal CDF approximation (for p-value computation) ──────
function normalCDF(x) {
  const a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741, a4 = -1.453152027, a5 = 1.061405429;
  const p = 0.3275911;
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x) / Math.SQRT2;
  const t = 1.0 / (1.0 + p * x);
  const y = 1.0 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return 0.5 * (1.0 + sign * y);
}


// ── Fig 26: Cross-Model Trait Coefficient Forest Plot ────────

function loadAllRegressions(callback) {
  const keys = [...new Set(CONFIG.MODELS.map(m => configDirKey(m)))];
  let loaded = 0;
  const results = {};
  keys.forEach(key => {
    if (regressionCache[key]) {
      results[key] = regressionCache[key];
      if (++loaded === keys.length) callback(results);
      return;
    }
    fetch(`${CONFIG.DATA_BASE}/regressions/${key}.json`, { cache: 'no-cache' })
      .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
      .then(data => {
        regressionCache[key] = data;
        results[key] = data;
        if (++loaded === keys.length) callback(results);
      })
      .catch(() => { if (++loaded === keys.length) callback(results); });
  });
}

function renderFig26ForestPlot(allRegs, elId, modelFilter) {
  const el = document.getElementById(elId || 'fig26-chart');
  if (!el) return;

  const TRAIT_MAP = [
    { key: 'extraverted',   label: 'Extraversion (vs. Introversion)',                       leftDir: 'Extraverts go out more than Introverts',              rightDir: 'Extraverts stay home more than Introverts',              traitNoun: 'Extraverts',                refNoun: 'Introverts' },
    { key: 'agreeable',     label: 'Agreeableness (vs. Antagonism)',                        leftDir: 'Agreeable people go out more than Antagonistic',       rightDir: 'Agreeable people stay home more than Antagonistic',       traitNoun: 'Agreeable people',           refNoun: 'Antagonistic people' },
    { key: 'conscientious', label: 'Conscientiousness (vs. Unconscientiousness)',           leftDir: 'Conscientious people go out more than Unconscientious', rightDir: 'Conscientious people stay home more than Unconscientious', traitNoun: 'Conscientious people',       refNoun: 'Unconscientious people' },
    { key: 'emot_stable',   label: 'Emotional Stability (vs. Neuroticism)',                 leftDir: 'Emotionally stable go out more than Neurotic',          rightDir: 'Emotionally stable stay home more than Neurotic',          traitNoun: 'Emotionally stable people',  refNoun: 'Neurotic people' },
    { key: 'open_to_exp',   label: 'Openness to Experience (vs. Closedness to Experience)', leftDir: 'Open people go out more than Closed',                  rightDir: 'Open people stay home more than Closed',                  traitNoun: 'People open to experience',  refNoun: 'People closed to experience' },
    { key: 'male',          label: 'Male (vs. Female)',                                     leftDir: 'Males go out more than Females',                       rightDir: 'Males stay home more than Females',                       traitNoun: 'Males',                      refNoun: 'Females' },
    { key: 'age',           label: 'Age (per year older)',                                  leftDir: 'Older go out more than Younger',                       rightDir: 'Older stay home more than Younger',                       traitNoun: null,                         refNoun: null },
  ];

  // Collect configs in display order (matches CONFIG.MODELS)
  const configs = [];
  const seen = new Set();
  CONFIG.MODELS.forEach(m => {
    const key = configDirKey(m);
    if (seen.has(key)) return;
    seen.add(key);
    if (modelFilter && !modelFilter.has(key)) return;
    if (allRegs[key] && allRegs[key].model2 && allRegs[key].model2.coefficients) {
      configs.push({ key, label: m.label, provider: m.provider, color: CONFIG.PROVIDER_COLORS[m.provider] || '#999' });
    }
  });

  const nConfigs = configs.length;
  if (nConfigs === 0) {
    el.innerHTML = '<div style="color:#999;padding:20px">No regression data available.</div>';
    return;
  }

  // Layout
  const W = Math.min(el.parentElement?.offsetWidth || 860, 860);
  const rowH = 14;
  const panelPad = { t: 24, b: 30, l: 160, r: 30 };
  const gapBetweenProviders = 6;
  const panelGap = 14;

  // Count provider groups for spacing
  let prevProv = '';
  let provGaps = 0;
  configs.forEach(c => { if (c.provider !== prevProv) { if (prevProv) provGaps++; prevProv = c.provider; } });

  const panelInnerH = nConfigs * rowH + provGaps * gapBetweenProviders;
  const panelH = panelPad.t + panelInnerH + panelPad.b;
  const totalH = TRAIT_MAP.length * (panelH + panelGap) - panelGap;
  const plotW = W - panelPad.l - panelPad.r;

  // X scale: log10(OR), range [-4, +4]
  const xMin = -4, xMax = 4;
  function xScale(logOR) {
    return panelPad.l + ((logOR - xMin) / (xMax - xMin)) * plotW;
  }

  // Tick values on log10 scale
  const ticks = [-3, -2, -1, 0, 1, 2, 3];
  const tickLabels = ['0.001', '0.01', '0.1', '1', '10', '100', '1000'];

  let svg = '';

  TRAIT_MAP.forEach((trait, ti) => {
    const py = ti * (panelH + panelGap);

    // Panel background
    svg += `<rect x="0" y="${py}" width="${W}" height="${panelH}" fill="${ti % 2 === 0 ? '#fafafa' : '#f5f5f5'}" rx="3"/>`;

    // Panel title
    svg += `<text x="${W / 2}" y="${py + 16}" font-size="12" font-weight="bold" fill="#111" font-family="${SERIF}" text-anchor="middle">${trait.label}</text>`;

    // X-axis reference line at OR=1 (log10=0)
    const x0 = xScale(0);
    svg += `<line x1="${x0}" y1="${py + panelPad.t}" x2="${x0}" y2="${py + panelPad.t + panelInnerH}" stroke="#999" stroke-width="1" stroke-dasharray="4,3"/>`;

    // Tick lines + labels (bottom)
    ticks.forEach((t, i) => {
      const tx = xScale(t);
      svg += `<line x1="${tx}" y1="${py + panelPad.t + panelInnerH}" x2="${tx}" y2="${py + panelPad.t + panelInnerH + 4}" stroke="#bbb" stroke-width="0.5"/>`;
      svg += `<text x="${tx}" y="${py + panelPad.t + panelInnerH + 15}" font-size="8" fill="#888" font-family="${SERIF}" text-anchor="middle">${tickLabels[i]}</text>`;
    });

    // Direction labels — trait-specific (on every panel)
    svg += `<text x="${panelPad.l + 4}" y="${py + panelH - 2}" font-size="8" fill="#999" font-family="${SERIF}" font-style="italic">\u2190 ${trait.leftDir}</text>`;
    svg += `<text x="${W - panelPad.r - 4}" y="${py + panelH - 2}" font-size="8" fill="#999" font-family="${SERIF}" font-style="italic" text-anchor="end">${trait.rightDir} \u2192</text>`;

    // Plot each config
    let rowIdx = 0;
    let lastProv = '';
    configs.forEach(c => {
      if (c.provider !== lastProv && lastProv !== '') rowIdx += gapBetweenProviders / rowH;
      lastProv = c.provider;

      const cy = py + panelPad.t + rowIdx * rowH + rowH / 2;
      const coef = allRegs[c.key].model2.coefficients[trait.key];

      if (!coef) {
        rowIdx++;
        return;
      }

      const or = coef.or;
      const orLo = typeof coef.or_ci_lo === 'number' ? coef.or_ci_lo : 0;
      const orHi = typeof coef.or_ci_hi === 'number' ? coef.or_ci_hi : Infinity;
      const sig = coef.p < 0.05;

      // Convert to log10, clamping to display range
      const safeLog = v => v <= 0 ? xMin : Math.log10(v);
      const logOR = Math.max(xMin, Math.min(xMax, safeLog(or)));
      let logLo = Math.max(xMin, safeLog(orLo));
      let logHi = Math.min(xMax, safeLog(orHi));

      const px = xScale(logOR);
      const pxLo = xScale(logLo);
      const pxHi = xScale(logHi);

      // CI whisker
      svg += `<line x1="${pxLo.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${pxHi.toFixed(1)}" y2="${cy.toFixed(1)}" stroke="${c.color}" stroke-width="1.5" opacity="0.6"/>`;

      // Arrow indicators for clipped CIs
      if (logLo <= xMin + 0.01) {
        svg += `<polygon points="${pxLo},${cy - 3} ${pxLo},${cy + 3} ${pxLo - 5},${cy}" fill="${c.color}" opacity="0.6"/>`;
      }
      if (logHi >= xMax - 0.01) {
        svg += `<polygon points="${pxHi},${cy - 3} ${pxHi},${cy + 3} ${pxHi + 5},${cy}" fill="${c.color}" opacity="0.6"/>`;
      }

      // Point estimate (filled = sig, hollow = not sig)
      if (sig) {
        svg += `<circle cx="${px.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.5" fill="${c.color}" stroke="${c.color}" stroke-width="1"/>`;
      } else {
        svg += `<circle cx="${px.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.5" fill="white" stroke="${c.color}" stroke-width="1.5"/>`;
      }

      // Invisible hit target for tooltip
      const fmtOR = v => v >= 100 ? Math.round(v).toLocaleString() : v >= 1 ? v.toFixed(2) : v >= 0.01 ? v.toFixed(4) : v.toExponential(2);
      const tipLine1 = `${esc(c.label)} \u2014 ${trait.label}`;
      const tipLine2 = `OR = ${fmtOR(or)}  [${fmtOR(orLo)}, ${orHi === Infinity ? '\u221E' : fmtOR(orHi)}]${sig ? '' : ' (n.s.)'}`;
      // Plain-English sentence
      let tipLine3 = '';
      if (trait.traitNoun) {
        tipLine3 = `${trait.traitNoun} have ${fmtOR(or)}\u00D7 the odds of staying home than that of ${trait.refNoun}`;
      } else {
        // Age — continuous
        tipLine3 = `Each additional year of age \u2192 ${fmtOR(or)}\u00D7 the odds of staying home`;
      }
      svg += `<circle class="forest-dot" cx="${px.toFixed(1)}" cy="${cy.toFixed(1)}" r="8" fill="transparent" stroke="none" style="cursor:pointer" data-tip1="${tipLine1.replace(/"/g, '&quot;')}" data-tip2="${tipLine2.replace(/"/g, '&quot;')}" data-tip3="${tipLine3.replace(/"/g, '&quot;')}"/>`;

      // Config label (left)
      svg += `<text x="${panelPad.l - 6}" y="${(cy + 3.5).toFixed(1)}" font-size="9" fill="${c.color}" font-family="${SERIF}" text-anchor="end">${esc(c.label)}</text>`;

      rowIdx++;
    });

    // Provider group separator lines
    rowIdx = 0;
    lastProv = '';
    configs.forEach(c => {
      if (c.provider !== lastProv && lastProv !== '') {
        const sepY = py + panelPad.t + rowIdx * rowH;
        svg += `<line x1="${panelPad.l}" y1="${sepY.toFixed(1)}" x2="${W - panelPad.r}" y2="${sepY.toFixed(1)}" stroke="#ddd" stroke-width="0.5"/>`;
        rowIdx += gapBetweenProviders / rowH;
      }
      lastProv = c.provider;
      rowIdx++;
    });
  });

  // Footnotes
  const footY = totalH + 16;
  const footnotes = [
    'Source: Model 2 random-effects logit (glmer) coefficients. OR = exp(\u03B2). OR > 1 = higher odds of staying home.',
    'Dummy coding: trait present = 1 (reference = absent). Male = 1 (reference = female). Age = raw years (18\u201365), OR is per-year increment.',
    '95% CIs = exp(\u03B2 \u00B1 1.96 \u00D7 SE). Arrows indicate CIs extending beyond display range. 20,000 observations per configuration.',
  ];
  footnotes.forEach((f, i) => {
    svg += `<text x="10" y="${footY + i * 12}" font-size="7.5" fill="#aaa" font-family="${SERIF}">${f}</text>`;
  });

  const svgH = footY + footnotes.length * 12 + 8;
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${svgH}" viewBox="0 0 ${W} ${svgH}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;

  // Wire forest plot tooltips
  let forestTip = document.getElementById('forest-tooltip');
  if (!forestTip) {
    forestTip = document.createElement('div');
    forestTip.id = 'forest-tooltip';
    forestTip.style.cssText = 'display:none;position:fixed;background:#222;color:#fff;padding:6px 12px;font-size:11px;font-family:Georgia,serif;border-radius:3px;pointer-events:none;z-index:200;line-height:1.6;max-width:400px';
    document.body.appendChild(forestTip);
  }
  el.querySelectorAll('.forest-dot').forEach(dot => {
    dot.addEventListener('mouseenter', () => {
      forestTip.innerHTML = `<strong>${dot.dataset.tip1}</strong><br>${dot.dataset.tip2}<br><em>${dot.dataset.tip3}</em>`;
      forestTip.style.display = 'block';
    });
    dot.addEventListener('mousemove', e => {
      forestTip.style.left = (e.clientX + 14) + 'px';
      forestTip.style.top = (e.clientY - 36) + 'px';
    });
    dot.addEventListener('mouseleave', () => { forestTip.style.display = 'none'; });
  });
}

// ── Fig 26 Interpretation Guide ─────────────────────────────

function renderFig26Guide() {
  const el = document.getElementById('fig26-guide');
  if (!el) return;

  const S = 'font-family:"Libre Baskerville","Georgia",serif';
  const mono = 'font-family:monospace;font-size:12px;background:#f5f5f5;padding:8px 12px;border-radius:4px';

  let html = `<div style="${S};font-size:13px;line-height:1.7;color:#333;max-width:780px;margin:8px 0 12px;border:1px solid #e0e0e0;border-radius:4px;padding:14px 18px">`;

  // ── What is an Odds Ratio? ──
  html += '<h4 style="margin:0 0 8px;font-size:14px;color:#111">What is an Odds Ratio?</h4>';
  html += '<p style="margin:0 0 8px">Each dot in the figure above is an <strong>odds ratio (OR)</strong>. The OR compares how likely agents <em>with</em> a trait are to stay home versus agents <em>without</em> it.</p>';

  html += '<p style="margin:0 0 4px">Start with <strong>odds</strong> &mdash; not probability, but the ratio of staying home to going out:</p>';
  html += `<div style="${mono};margin:6px 0">`;
  html += 'odds = P(staying home) / P(going out)</div>';
  html += '<p style="margin:4px 0 8px;font-size:12px;color:#666">Example: if an agent stays home 80% of the time, odds = 0.80 / 0.20 = <strong>4</strong> (they stay home 4 times for every 1 time they go out).</p>';

  html += '<p style="margin:0 0 4px">The <strong>odds ratio</strong> then compares two groups:</p>';
  html += `<div style="${mono};margin:6px 0">`;
  html += 'OR = odds(extraverted agent stays home) / odds(introverted agent stays home)</div>';

  // ── Concrete worked example ──
  html += '<h4 style="margin:14px 0 8px;font-size:14px;color:#111">Worked example</h4>';
  html += '<p style="margin:0 0 4px">Suppose introverted agents stay home 90% of the time and extraverted agents stay home 30%:</p>';
  html += `<div style="${mono};margin:6px 0">`;
  html += 'Introverted odds = 0.90 / 0.10 = 9<br>';
  html += 'Extraverted odds = 0.30 / 0.70 = 0.43<br><br>';
  html += 'OR = 0.43 / 9 = <strong>0.048</strong></div>';
  html += '<p style="margin:4px 0 8px">An OR of 0.048 means extraverted agents have roughly <strong>1/20th</strong> the odds of staying home compared to introverts. In the forest plot, this dot would appear far to the <em>left</em> of the dashed line.</p>';

  // ── Quick reference table ──
  html += '<h4 style="margin:14px 0 8px;font-size:14px;color:#111">Quick reference</h4>';
  html += '<table class="ols-table" style="width:auto;margin:8px 0">';
  html += '<thead><tr><th>OR</th><th>What it means</th><th>In the figure</th></tr></thead>';
  html += '<tbody>';
  html += '<tr><td style="text-align:center"><strong>OR = 100</strong></td>';
  html += '<td>Agents with the trait have <strong>100&times;</strong> the odds of staying home</td>';
  html += '<td>Dot far <strong>right</strong> of dashed line</td></tr>';
  html += '<tr><td style="text-align:center"><strong>OR = 10</strong></td>';
  html += '<td>Agents with the trait have <strong>10&times;</strong> the odds of staying home</td>';
  html += '<td>Dot moderately right</td></tr>';
  html += '<tr><td style="text-align:center"><strong>OR = 1</strong></td>';
  html += '<td>No difference &mdash; trait has no effect</td>';
  html += '<td>Dot on the <strong>dashed line</strong></td></tr>';
  html += '<tr><td style="text-align:center"><strong>OR = 0.1</strong></td>';
  html += '<td>Agents with the trait have <strong>1/10th</strong> the odds of staying home</td>';
  html += '<td>Dot moderately left</td></tr>';
  html += '<tr><td style="text-align:center"><strong>OR = 0.01</strong></td>';
  html += '<td>Agents with the trait have <strong>1/100th</strong> the odds &mdash; they almost always go out</td>';
  html += '<td>Dot far <strong>left</strong> of dashed line</td></tr>';
  html += '</tbody></table>';

  // ── Note on age ──
  html += '<h4 style="margin:14px 0 8px;font-size:14px;color:#111">A note on age</h4>';
  html += '<p style="margin:0 0 4px">Unlike the personality traits (which are binary: present or absent), <strong>age is continuous</strong> (18&ndash;65). The OR for age is the effect of <em>one additional year</em>. An OR of 0.999 per year looks negligible, but it compounds across the full range:</p>';
  html += `<div style="${mono};margin:6px 0">`;
  html += 'Cumulative OR across 47 years = OR<sup>47</sup><br>';
  html += 'If OR = 0.999: 0.999<sup>47</sup> = 0.954 (barely any effect)<br>';
  html += 'If OR = 0.95: &nbsp;0.95<sup>47</sup> &nbsp;= 0.089 (a 65-year-old has 1/11th the odds of an 18-year-old)</div>';
  html += '<p style="margin:4px 0 0;font-size:12px;color:#666">Check the Age panel below to see whether your models show a meaningful per-year effect or not.</p>';

  html += '</div>';
  el.innerHTML = html;

  // Wire toggle button
  const btn = document.getElementById('fig26-guide-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const open = el.style.display !== 'none';
      el.style.display = open ? 'none' : 'block';
      btn.innerHTML = open ? 'How to Read This Figure &#x25BE;' : 'How to Read This Figure &#x25B4;';
    });
  }
}

// ── Fig 27: Agent Behavioral Consistency Matrix ─────────────

function ranks(arr) {
  const sorted = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Array(arr.length);
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j][0] === sorted[i][0]) j++;
    const avg = (i + j + 1) / 2;
    for (let k = i; k < j; k++) r[sorted[k][1]] = avg;
    i = j;
  }
  return r;
}

function spearmanRho(x, y) {
  const rx = ranks(x), ry = ranks(y);
  const n = x.length;
  const mx = rx.reduce((a, b) => a + b) / n;
  const my = ry.reduce((a, b) => a + b) / n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
}

let agentConsistencyCache = null;

function loadAgentConsistency(callback) {
  if (agentConsistencyCache) { callback(agentConsistencyCache); return; }
  fetch(`${CONFIG.DATA_BASE}/agent_consistency.json`)
    .then(r => r.ok ? r.json() : Promise.reject(`HTTP ${r.status}`))
    .then(data => {
      agentConsistencyCache = data;
      callback(data);
    })
    .catch(err => {
      const el = document.getElementById('fig27-chart');
      if (el) el.innerHTML = `<div style="color:#c00;padding:20px">Could not load agent consistency data: ${esc(String(err))}. Run: python analysis/compute_agent_consistency.py</div>`;
    });
}

// ── Figs 28–29: Predicted vs Actual Agent Behavior ──────────

// Maps agents.json trait strings → Model 2 regression coefficient keys
const AGENT_TRAIT_COEF_MAP = [
  { traitStr: 'extroverted',        coefKey: 'extraverted' },
  { traitStr: 'agreeable',          coefKey: 'agreeable' },
  { traitStr: 'conscientious',      coefKey: 'conscientious' },
  { traitStr: 'emotionally stable', coefKey: 'emot_stable' },
  { traitStr: 'open to experience', coefKey: 'open_to_exp' },
];

function computeAgentCombinedORs(agents, coefs) {
  // Compute combined personality OR for each agent in log space, then exponentiate
  // combined_OR = OR_male^male × OR_extrav^extrav × ... × OR_age^age
  // Equivalent: log(combined_OR) = Σ(coef.estimate × indicator)
  return agents.map(a => {
    let logOR = 0;
    // Binary traits
    AGENT_TRAIT_COEF_MAP.forEach(m => {
      const c = coefs[m.coefKey];
      if (c && a.traits.includes(m.traitStr)) logOR += c.estimate;
    });
    // Gender
    if (coefs.male && a.gender === 'male') logOR += coefs.male.estimate;
    // Age (continuous)
    if (coefs.age) logOR += coefs.age.estimate * a.age;
    return { agent_id: a.agent_id, name: a.name, age: a.age, gender: a.gender, traits: a.traits, combinedOR: Math.exp(logOR), logCombinedOR: logOR };
  });
}

function computeActualStayRates(microRows) {
  // Compute stay-home rate for each agent (0..99) from micro CSV rows
  const counts = {};
  microRows.forEach(r => {
    const aid = +r.agent_id;
    if (!counts[aid]) counts[aid] = { yes: 0, total: 0 };
    counts[aid].total++;
    if (r.response === 'yes') counts[aid].yes++;
  });
  const rates = new Array(100).fill(0);
  for (let aid = 0; aid < 100; aid++) {
    if (counts[aid]) rates[aid] = counts[aid].yes / counts[aid].total;
  }
  return rates;
}

function renderFig28PredictedVsActual(microRows, cfg, regData) {
  const el = document.getElementById('fig28-chart');
  const headlineEl = document.getElementById('fig28-headline');
  if (!el) return;

  // Check Model 2 exists
  if (!regData || !regData.model2 || !regData.model2.coefficients) {
    el.innerHTML = '<div style="color:#999;padding:20px">No Model 2 regression data for this config.</div>';
    if (headlineEl) headlineEl.innerHTML = '';
    return;
  }

  const coefs = regData.model2.coefficients;
  const agents = agentsData;
  if (!agents) { el.innerHTML = '<div style="color:#999;padding:20px">Loading agents...</div>'; return; }

  // Compute predicted combined ORs
  const predicted = computeAgentCombinedORs(agents, coefs);

  // Compute actual stay-home rates
  const actualRates = computeActualStayRates(microRows);

  // Compute Spearman rho
  const predORs = predicted.map(p => p.combinedOR);
  const actuals = actualRates.slice();
  const rho = spearmanRho(predORs, actuals);

  // Headline
  if (headlineEl) {
    const rhoColor = rho > 0.7 ? '#2d7d2d' : rho > 0.4 ? '#b8860b' : '#c00';
    headlineEl.innerHTML = `<div style="font-family:${SERIF};font-size:14px;color:${rhoColor};font-weight:bold;padding:4px 0">Spearman \u03C1 = ${rho.toFixed(3)}</div>`;
  }

  // Layout
  const W = Math.min(el.parentElement?.offsetWidth || 860, 860);
  const H = 460;
  const pad = { t: 30, r: 30, b: 50, l: 70 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  // X scale: log10(combined OR) — fixed range for cross-model comparability
  const xMin = -5, xMax = 5;
  const xScale = v => pad.l + ((v - xMin) / (xMax - xMin)) * plotW;

  // Y scale: actual stay-home rate (0–1)
  const yScale = v => pad.t + plotH - v * plotH;

  // Provider color for this config
  const provColor = CONFIG.PROVIDER_COLORS[cfg.provider] || '#999';

  let svg = '';

  // Grid lines
  for (let y = 0; y <= 1; y += 0.25) {
    const py = yScale(y);
    svg += `<line x1="${pad.l}" y1="${py}" x2="${W - pad.r}" y2="${py}" stroke="#eee" stroke-width="0.5"/>`;
    svg += `<text x="${pad.l - 8}" y="${py + 3}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="end">${Math.round(y * 100)}%</text>`;
  }

  // X-axis ticks
  for (let x = xMin; x <= xMax; x++) {
    const px = xScale(x);
    svg += `<line x1="${px}" y1="${pad.t}" x2="${px}" y2="${pad.t + plotH}" stroke="#eee" stroke-width="0.5"/>`;
    const label = x >= 0 ? Math.pow(10, x).toLocaleString() : (1 / Math.pow(10, -x)).toFixed(-x > 2 ? -x : Math.max(0, -x));
    svg += `<text x="${px}" y="${pad.t + plotH + 16}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="middle">${Math.pow(10, x) >= 1 ? Math.round(Math.pow(10, x)).toLocaleString() : Math.pow(10, x)}</text>`;
  }

  // Axis labels
  svg += `<text x="${pad.l + plotW / 2}" y="${H - 6}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle">Combined Personality OR (log scale)</text>`;
  svg += `<text x="14" y="${pad.t + plotH / 2}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,14,${pad.t + plotH / 2})">Actual Stay-Home Rate</text>`;

  // Reference line at OR=1
  const or1x = xScale(0);
  if (or1x >= pad.l && or1x <= W - pad.r) {
    svg += `<line x1="${or1x}" y1="${pad.t}" x2="${or1x}" y2="${pad.t + plotH}" stroke="#999" stroke-width="1" stroke-dasharray="4,3"/>`;
  }

  // Plot agents
  predicted.forEach((p, i) => {
    const logOR = Math.log10(Math.max(1e-20, p.combinedOR));
    const px = xScale(logOR);
    const py = yScale(actualRates[p.agent_id]);
    const rate = actualRates[p.agent_id];

    svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="4" fill="${provColor}" fill-opacity="0.6" stroke="${provColor}" stroke-width="1"/>`;

    // Tooltip hit target
    const fmtOR = p.combinedOR >= 100 ? Math.round(p.combinedOR).toLocaleString() : p.combinedOR >= 1 ? p.combinedOR.toFixed(2) : p.combinedOR >= 0.01 ? p.combinedOR.toFixed(4) : p.combinedOR.toExponential(2);
    const traitStrs = p.traits.join(', ');
    const tip1 = `${esc(p.name)} (${p.gender}, age ${p.age})`;
    const tip2 = `Predicted OR: ${fmtOR} | Actual: ${Math.round(rate * 100)}% stay home`;
    svg += `<circle class="fig28-dot" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="8" fill="transparent" stroke="none" style="cursor:pointer" data-tip1="${tip1.replace(/"/g, '&quot;')}" data-tip2="${tip2.replace(/"/g, '&quot;')}"/>`;
  });

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;

  // Wire tooltips
  let tip = document.getElementById('fig28-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'fig28-tooltip';
    tip.style.cssText = 'display:none;position:fixed;background:#222;color:#fff;padding:6px 12px;font-size:11px;font-family:Georgia,serif;border-radius:3px;pointer-events:none;z-index:200;line-height:1.5;max-width:360px';
    document.body.appendChild(tip);
  }
  el.querySelectorAll('.fig28-dot').forEach(dot => {
    dot.addEventListener('mouseenter', () => {
      tip.innerHTML = `<strong>${dot.dataset.tip1}</strong><br>${dot.dataset.tip2}`;
      tip.style.display = 'block';
    });
    dot.addEventListener('mousemove', e => {
      tip.style.left = (e.clientX + 14) + 'px';
      tip.style.top = (e.clientY - 36) + 'px';
    });
    dot.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  });
}

function renderFig28Guide() {
  const el = document.getElementById('fig28-guide');
  if (!el) return;
  const S = `font-family:"Libre Baskerville","Georgia",serif`;
  const mono = 'font-family:monospace;font-size:12px;background:#f5f5f5;padding:8px 12px;border-radius:4px';
  let html = `<div style="${S};font-size:13px;line-height:1.7;color:#333;max-width:780px;margin:8px 0 12px;border:1px solid #e0e0e0;border-radius:4px;padding:14px 18px">`;

  html += '<p style="margin:0 0 10px"><strong>1. What is Combined Personality OR?</strong></p>';
  html += '<p style="margin:0 0 8px">Each agent has a personality profile: traits like extraverted or conscientious, a gender, and an age. ';
  html += 'The regression (Model 2) gives an odds ratio for each trait. ';
  html += 'To get an agent\u2019s <em>combined</em> OR, we multiply the ORs of all traits the agent has:</p>';
  html += `<div style="${mono};margin:0 0 10px">Combined OR = OR<sub>extrav</sub><sup>1 or 0</sup> \u00D7 OR<sub>agree</sub><sup>1 or 0</sup> \u00D7 \u2026 \u00D7 OR<sub>age</sub><sup>age years</sup></div>`;
  html += '<p style="margin:0 0 10px">A combined OR of 500 means the model predicts that agent has 500\u00D7 the odds of staying home compared to the reference profile (female, introverted, antagonistic, unconscientious, neurotic, closed to experience).</p>';

  html += '<p style="margin:0 0 10px"><strong>2. Reading the scatter plot</strong></p>';
  html += '<p style="margin:0 0 10px"><strong>X-axis</strong> = what the model predicts (combined personality OR, log scale). <strong>Y-axis</strong> = what actually happened (% of 200 decisions where the agent stayed home). ';
  html += 'If dots trend upward from left to right, the model\u2019s personality predictions match reality.</p>';

  html += '<p style="margin:0 0 10px"><strong>3. Spearman \u03C1</strong></p>';
  html += '<p style="margin:0 0 10px">Rank correlation between predicted and actual ordering. \u03C1 = 1 means the model perfectly ranks which agents stay home most. \u03C1 = 0 means no relationship. \u03C1 > 0.7 is strong.</p>';

  html += '<p style="margin:0 0 10px"><strong>4. Why combined OR spans many orders of magnitude</strong></p>';
  html += '<p style="margin:0 0 4px">ORs multiply. An agent who is conscientious (OR \u2248 2,334) AND agreeable (OR \u2248 19) AND emotionally stable (OR \u2248 0.003) gets:</p>';
  html += `<div style="${mono};margin:0 0 8px">2,334 \u00D7 19 \u00D7 0.003 \u2248 133</div>`;
  html += '<p style="margin:0">Extreme individual ORs can compound to produce very large or very small combined values.</p>';

  html += '</div>';
  el.innerHTML = html;

  // Toggle wiring
  const btn = document.getElementById('fig28-guide-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const open = el.style.display !== 'none';
      el.style.display = open ? 'none' : 'block';
      btn.innerHTML = open ? 'How to Read This Figure \u25BE' : 'How to Read This Figure \u25B4';
    });
  }
}

function renderFig29CrossModelPrediction(allRegs, consistencyData) {
  const el = document.getElementById('fig29-chart');
  const headlineEl = document.getElementById('fig29-headline');
  if (!el || !agentsData) return;

  const agents = agentsData;
  const configs = consistencyData.configs;
  const labels = consistencyData.labels;
  const providers = consistencyData.providers;
  const actualRates = consistencyData.rates; // [configIdx][agentIdx] = rate

  // Compute Spearman rho for each config
  const results = [];
  configs.forEach((cfgKey, ci) => {
    const reg = allRegs[cfgKey];
    if (!reg || !reg.model2 || !reg.model2.coefficients) return;

    const predicted = computeAgentCombinedORs(agents, reg.model2.coefficients);
    const predORs = predicted.map(p => p.combinedOR);
    const actRates = actualRates[ci];
    const rho = spearmanRho(predORs, actRates);

    results.push({
      key: cfgKey,
      label: labels[ci],
      provider: providers[ci],
      color: CONFIG.PROVIDER_COLORS[providers[ci]] || '#999',
      rho: rho,
    });
  });

  if (results.length === 0) {
    el.innerHTML = '<div style="color:#999;padding:20px">No regression data available.</div>';
    return;
  }

  // Headline: median rho
  const sortedRhos = results.map(r => r.rho).sort((a, b) => a - b);
  const medianRho = sortedRhos[Math.floor(sortedRhos.length / 2)];
  if (headlineEl) {
    const rhoColor = medianRho > 0.7 ? '#2d7d2d' : medianRho > 0.4 ? '#b8860b' : '#c00';
    headlineEl.innerHTML = `<div style="font-family:${SERIF};font-size:13px;color:#555;padding:4px 0">Median Spearman \u03C1 across all models: <strong style="color:${rhoColor}">${medianRho.toFixed(3)}</strong></div>`;
  }

  // Layout — horizontal dot plot like Fig 26
  const W = Math.min(el.parentElement?.offsetWidth || 860, 860);
  const rowH = 14;
  const padL = 160, padR = 30, padT = 24, padB = 40;
  const gapBetweenProviders = 6;

  // Count provider gaps
  let prevProv = '', provGaps = 0;
  results.forEach(r => { if (r.provider !== prevProv) { if (prevProv) provGaps++; prevProv = r.provider; } });

  const innerH = results.length * rowH + provGaps * gapBetweenProviders;
  const H = padT + innerH + padB;
  const plotW = W - padL - padR;

  // X scale: rho 0 to 1
  const xScale = v => padL + v * plotW;

  let svg = '';

  // Background
  svg += `<rect x="0" y="0" width="${W}" height="${H}" fill="#fafafa" rx="3"/>`;

  // Title
  svg += `<text x="${W / 2}" y="16" font-size="12" font-weight="bold" fill="#111" font-family="${SERIF}" text-anchor="middle">Spearman \u03C1: Predicted Agent Rank vs. Actual Rank</text>`;

  // Reference lines
  [0, 0.25, 0.5, 0.75, 1.0].forEach(v => {
    const px = xScale(v);
    svg += `<line x1="${px}" y1="${padT}" x2="${px}" y2="${padT + innerH}" stroke="${v === 0.5 || v === 0.75 ? '#ccc' : '#eee'}" stroke-width="${v === 0.5 || v === 0.75 ? '1' : '0.5'}" ${v === 0.5 || v === 0.75 ? 'stroke-dasharray="4,3"' : ''}/>`;
    svg += `<text x="${px}" y="${padT + innerH + 14}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="middle">${v.toFixed(2)}</text>`;
  });

  // Axis label
  svg += `<text x="${padL + plotW / 2}" y="${H - 6}" font-size="10" fill="#555" font-family="${SERIF}" text-anchor="middle">Spearman \u03C1</text>`;

  // Plot each config
  let rowIdx = 0;
  let lastProv = '';
  results.forEach(r => {
    if (r.provider !== lastProv && lastProv !== '') {
      // Provider separator line
      const sepY = padT + rowIdx * rowH;
      svg += `<line x1="${padL}" y1="${sepY.toFixed(1)}" x2="${W - padR}" y2="${sepY.toFixed(1)}" stroke="#ddd" stroke-width="0.5"/>`;
      rowIdx += gapBetweenProviders / rowH;
    }
    lastProv = r.provider;

    const cy = padT + rowIdx * rowH + rowH / 2;
    const px = xScale(Math.max(0, Math.min(1, r.rho)));

    // Dot
    svg += `<circle cx="${px.toFixed(1)}" cy="${cy.toFixed(1)}" r="4" fill="${r.color}" stroke="${r.color}" stroke-width="1"/>`;

    // Rho value label (right of dot)
    svg += `<text x="${(px + 8).toFixed(1)}" y="${(cy + 3).toFixed(1)}" font-size="8" fill="#666" font-family="${SERIF}">${r.rho.toFixed(3)}</text>`;

    // Config label (left)
    svg += `<text x="${padL - 6}" y="${(cy + 3.5).toFixed(1)}" font-size="9" fill="${r.color}" font-family="${SERIF}" text-anchor="end">${esc(r.label)}</text>`;

    rowIdx++;
  });

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;
}

function renderInfectionEffectChart(allRegs, elId, modelKey, modelFilter) {
  const el = document.getElementById(elId);
  if (!el) return;

  // Collect infection coefficients for each config
  const configs = [];
  const seen = new Set();
  CONFIG.MODELS.forEach(m => {
    const key = configDirKey(m);
    if (seen.has(key)) return;
    seen.add(key);
    if (modelFilter && !modelFilter.has(key)) return;
    const reg = allRegs[key];
    const model = modelKey === 'model1' ? (reg && reg.model1) : (reg && reg.model2);
    if (!model || !model.coefficients) return;
    const c = model.coefficients;
    if (!c.infection_pct || !c.infection_pct_sq) return;
    configs.push({
      key, label: m.label, provider: m.provider,
      color: CONFIG.PROVIDER_COLORS[m.provider] || '#999',
      bInf: c.infection_pct.estimate,
      bInfSq: c.infection_pct_sq.estimate,
    });
  });

  if (configs.length === 0) {
    el.innerHTML = '<div style="color:#999;padding:20px">No regression data available.</div>';
    return;
  }

  // Compute infection OR at each level for each config
  const levels = CONFIG.INFECTION_LEVELS || [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0, 7.0];
  const curves = configs.map(c => ({
    ...c,
    points: levels.map(lv => {
      const logOdds = c.bInf * lv + c.bInfSq * lv * lv;
      return { level: lv, logOdds, or: Math.exp(logOdds) };
    }),
  }));

  // Layout
  const W = Math.min(el.parentElement?.offsetWidth || 860, 860);
  const H = 460;
  const pad = { t: 30, r: 160, b: 50, l: 70 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  // X scale: linear 0–7%
  const xScale = v => pad.l + (v / 7) * plotW;

  // Y scale: log10(OR), auto-range
  let maxLogOR = 0;
  curves.forEach(c => c.points.forEach(p => {
    const logOR = Math.log10(Math.max(1, p.or));
    if (logOR > maxLogOR) maxLogOR = logOR;
  }));
  maxLogOR = Math.min(Math.ceil(maxLogOR), 50);
  const yMin = 0, yMax = maxLogOR;
  const yScale = v => pad.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  let svg = '';

  // Y-axis grid + labels
  const yStep = yMax <= 10 ? 1 : yMax <= 20 ? 2 : yMax <= 50 ? 5 : 10;
  for (let y = 0; y <= yMax; y += yStep) {
    const py = yScale(y);
    svg += `<line x1="${pad.l}" y1="${py}" x2="${pad.l + plotW}" y2="${py}" stroke="#eee" stroke-width="0.5"/>`;
    const label = y === 0 ? '1' : y === 1 ? '10' : `10^${y}`;
    svg += `<text x="${pad.l - 8}" y="${py + 3}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="end">${label}</text>`;
  }

  // X-axis ticks
  [0, 1, 2, 3, 4, 5, 6, 7].forEach(lv => {
    const px = xScale(lv);
    svg += `<line x1="${px}" y1="${pad.t + plotH}" x2="${px}" y2="${pad.t + plotH + 4}" stroke="#bbb" stroke-width="0.5"/>`;
    svg += `<text x="${px}" y="${pad.t + plotH + 16}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="middle">${lv}%</text>`;
  });

  // Axis labels
  svg += `<text x="${pad.l + plotW / 2}" y="${H - 8}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle">Infection Level (% new cases)</text>`;
  svg += `<text x="14" y="${pad.t + plotH / 2}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,14,${pad.t + plotH / 2})">Infection OR (log scale)</text>`;

  // Reference line at OR=1
  svg += `<line x1="${pad.l}" y1="${yScale(0)}" x2="${pad.l + plotW}" y2="${yScale(0)}" stroke="#999" stroke-width="1" stroke-dasharray="4,3"/>`;

  // Draw curves — visible paths + wider invisible hit-targets
  const pathData = []; // store path strings for hit-targets
  curves.forEach((c, ci) => {
    let path = '';
    c.points.forEach((p, i) => {
      const px = xScale(p.level);
      const logOR = Math.log10(Math.max(1, p.or));
      const py = yScale(Math.min(logOR, yMax));
      path += (i === 0 ? 'M' : 'L') + `${px.toFixed(1)},${py.toFixed(1)}`;
    });
    pathData.push(path);
    svg += `<path class="inf-or-curve" data-idx="${ci}" d="${path}" fill="none" stroke="${c.color}" stroke-width="1.5" opacity="0.7"/>`;
  });
  // Invisible wider hit-target paths on top
  curves.forEach((c, ci) => {
    svg += `<path class="inf-or-hit" data-idx="${ci}" d="${pathData[ci]}" fill="none" stroke="transparent" stroke-width="10" style="cursor:pointer"/>`;
  });

  // Legend (right side)
  let legendY = pad.t + 4;
  let lastProv = '';
  curves.forEach((c, ci) => {
    if (c.provider !== lastProv && lastProv !== '') legendY += 6;
    lastProv = c.provider;
    svg += `<line class="inf-or-leg-line" data-idx="${ci}" x1="${pad.l + plotW + 10}" y1="${legendY + 4}" x2="${pad.l + plotW + 22}" y2="${legendY + 4}" stroke="${c.color}" stroke-width="1.5"/>`;
    svg += `<text class="inf-or-leg-text" data-idx="${ci}" x="${pad.l + plotW + 26}" y="${legendY + 7}" font-size="8" fill="${c.color}" font-family="${SERIF}">${esc(c.label)}</text>`;
    legendY += 12;
  });

  // Floating label (hidden initially)
  svg += `<text class="inf-or-label" visibility="hidden" font-size="10" font-weight="600" font-family="${SERIF}" text-anchor="start" fill="#333"></text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;

  // Hover interactions
  const svgEl = el.querySelector('svg');
  const allCurves = svgEl.querySelectorAll('.inf-or-curve');
  const allHits = svgEl.querySelectorAll('.inf-or-hit');
  const allLegLines = svgEl.querySelectorAll('.inf-or-leg-line');
  const allLegTexts = svgEl.querySelectorAll('.inf-or-leg-text');
  const floatLabel = svgEl.querySelector('.inf-or-label');

  function highlightCurve(idx) {
    allCurves.forEach((p, i) => {
      if (i === idx) { p.setAttribute('opacity', '1'); p.setAttribute('stroke-width', '3'); }
      else { p.setAttribute('opacity', '0.15'); p.setAttribute('stroke-width', '1.5'); }
    });
    allLegLines.forEach((l, i) => { l.setAttribute('opacity', i === idx ? '1' : '0.2'); });
    allLegTexts.forEach((t, i) => {
      t.setAttribute('opacity', i === idx ? '1' : '0.2');
      if (i === idx) t.setAttribute('font-weight', '700');
      else t.setAttribute('font-weight', '400');
    });
    // Show label near the end of the highlighted curve
    const c = curves[idx];
    const lastPt = c.points[c.points.length - 1];
    const lx = xScale(lastPt.level);
    const logOR = Math.log10(Math.max(1, lastPt.or));
    const ly = yScale(Math.min(logOR, yMax));
    floatLabel.setAttribute('x', lx - 5);
    floatLabel.setAttribute('y', ly - 8);
    floatLabel.setAttribute('fill', c.color);
    floatLabel.textContent = c.label;
    floatLabel.setAttribute('visibility', 'visible');
  }

  function resetCurves() {
    allCurves.forEach(p => { p.setAttribute('opacity', '0.7'); p.setAttribute('stroke-width', '1.5'); });
    allLegLines.forEach(l => l.setAttribute('opacity', '1'));
    allLegTexts.forEach(t => { t.setAttribute('opacity', '1'); t.setAttribute('font-weight', '400'); });
    floatLabel.setAttribute('visibility', 'hidden');
  }

  allHits.forEach(hit => {
    hit.addEventListener('mouseenter', () => highlightCurve(+hit.dataset.idx));
    hit.addEventListener('mouseleave', resetCurves);
  });
}

function renderFig30InfectionOR(allRegs) {
  renderInfectionEffectChart(allRegs, 'fig30-chart', 'model2');
}

function renderFig30bInfectionOR(allRegs) {
  renderInfectionEffectChart(allRegs, 'fig30b-chart', 'model1');
}

// ── Trait OR vs Infection OR ──────────────────────────────────
function renderTraitVsInfectionOR(allRegs, containerId) {
  const el = document.getElementById(containerId || 'trait-vs-infection-chart');
  if (!el || !agentsData) return;

  const models = [];
  const seen = new Set();
  CONFIG.MODELS.forEach(m => {
    const key = configDirKey(m);
    if (seen.has(key)) return;
    seen.add(key);
    const reg = allRegs[key];
    if (!reg || !reg.model2 || !reg.model2.coefficients) return;
    const c = reg.model2.coefficients;
    if (!c.infection_pct || !c.infection_pct_sq) return;

    // Personality ORs for all 100 agents
    const predicted = computeAgentCombinedORs(agentsData, c);
    const ors = predicted.map(p => p.combinedOR).sort((a, b) => a - b);
    const q1 = ors[Math.floor(ors.length * 0.25)];
    const q3 = ors[Math.floor(ors.length * 0.75)];
    const pMin = ors[0];
    const pMax = ors[ors.length - 1];

    // Infection OR at each level — find peak
    const bInf = c.infection_pct.estimate;
    const bInfSq = c.infection_pct_sq.estimate;
    let peakOR = 0, peakLevel = 0;
    for (let lv = 0; lv <= 7; lv += 0.1) {
      const lo = bInf * lv + bInfSq * lv * lv;
      const or = Math.exp(lo);
      if (or > peakOR) { peakOR = or; peakLevel = lv; }
    }
    // Also get infection OR at 7%
    const or7 = Math.exp(bInf * 7 + bInfSq * 49);

    // Threshold: combined OR needed for P(stay_home) = 50%
    const intercept = c.intercept ? c.intercept.estimate : 0;
    const threshold50 = Math.exp(-intercept); // personality_OR × infection_OR must exceed this

    models.push({
      key, label: m.label, provider: m.provider,
      color: CONFIG.PROVIDER_COLORS[m.provider] || '#999',
      pMin, pMax, pQ1: q1, pQ3: q3,
      peakInfOR: peakOR, peakLevel: Math.round(peakLevel * 10) / 10,
      infOR7: or7, threshold50,
    });
  });

  if (models.length === 0) {
    el.innerHTML = '<div style="color:#999;padding:20px">No regression data available.</div>';
    return;
  }

  // Sort by provider then label
  const provOrder = { anthropic: 0, openai: 1, google: 2 };
  models.sort((a, b) => (provOrder[a.provider] || 3) - (provOrder[b.provider] || 3) || a.label.localeCompare(b.label));

  // Layout
  const rowH = 22;
  const W = Math.min(el.parentElement?.offsetWidth || 860, 860);
  const pad = { t: 40, r: 30, b: 50, l: 160 };
  const plotW = W - pad.l - pad.r;
  const H = pad.t + models.length * rowH + 30 + pad.b;

  // X scale: log10(OR)
  // Find global range
  let globalMin = Infinity, globalMax = 0;
  models.forEach(m => {
    if (m.pMin < globalMin && m.pMin > 0) globalMin = m.pMin;
    if (m.threshold50 < globalMin && m.threshold50 > 0) globalMin = m.threshold50;
    if (m.pMax > globalMax) globalMax = m.pMax;
    if (m.peakInfOR > globalMax) globalMax = m.peakInfOR;
    if (m.threshold50 > globalMax) globalMax = m.threshold50;
  });
  const logMin = Math.floor(Math.log10(Math.max(1e-10, globalMin)));
  const logMax = Math.ceil(Math.log10(Math.max(1, globalMax)));
  const xScale = v => pad.l + ((Math.log10(Math.max(1e-10, v)) - logMin) / (logMax - logMin)) * plotW;
  const or1x = xScale(1); // OR = 1 reference line

  let svg = '';

  // X-axis grid + labels
  for (let exp = logMin; exp <= logMax; exp++) {
    const px = pad.l + ((exp - logMin) / (logMax - logMin)) * plotW;
    svg += `<line x1="${px}" y1="${pad.t - 5}" x2="${px}" y2="${pad.t + models.length * rowH + 10}" stroke="#eee" stroke-width="0.5"/>`;
    const label = exp === 0 ? '1' : exp === 1 ? '10' : exp < 0 ? `10^${exp}` : `10^${exp}`;
    svg += `<text x="${px}" y="${pad.t + models.length * rowH + 24}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="middle">${label}</text>`;
  }

  // OR = 1 reference line (heavier)
  svg += `<line x1="${or1x}" y1="${pad.t - 5}" x2="${or1x}" y2="${pad.t + models.length * rowH + 10}" stroke="#bbb" stroke-width="1" stroke-dasharray="4,3"/>`;

  // X-axis label
  svg += `<text x="${pad.l + plotW / 2}" y="${H - 10}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle">Odds Ratio (log scale)</text>`;

  // Column headers
  svg += `<text x="${pad.l + plotW * 0.3}" y="${pad.t - 20}" font-size="10" fill="#555" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Personality OR (agent range)</text>`;
  svg += `<text x="${pad.l + plotW * 0.75}" y="${pad.t - 20}" font-size="10" fill="#555" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Peak Infection OR</text>`;

  // Draw rows
  let lastProv = '';
  models.forEach((m, i) => {
    const cy = pad.t + i * rowH + rowH / 2;

    // Provider separator
    if (m.provider !== lastProv && lastProv !== '') {
      const sepY = pad.t + i * rowH - 2;
      svg += `<line x1="${pad.l - 155}" y1="${sepY}" x2="${pad.l + plotW}" y2="${sepY}" stroke="#ddd" stroke-width="0.5"/>`;
    }
    lastProv = m.provider;

    // Model label
    svg += `<text x="${pad.l - 8}" y="${cy + 3}" font-size="9" fill="${m.color}" font-family="${SERIF}" text-anchor="end">${esc(m.label)}</text>`;

    // Personality: full range (thin line)
    const pMinX = xScale(m.pMin);
    const pMaxX = xScale(m.pMax);
    svg += `<line x1="${pMinX}" y1="${cy}" x2="${pMaxX}" y2="${cy}" stroke="${m.color}" stroke-width="1" opacity="0.3"/>`;

    // Personality: IQR (thick bar)
    const pQ1X = xScale(m.pQ1);
    const pQ3X = xScale(m.pQ3);
    svg += `<rect x="${pQ1X}" y="${cy - 5}" width="${Math.max(1, pQ3X - pQ1X)}" height="10" fill="${m.color}" fill-opacity="0.4" stroke="${m.color}" stroke-width="0.8" rx="2"/>`;

    // Infection peak (diamond marker)
    const infX = xScale(m.peakInfOR);
    const d = 5;
    svg += `<polygon points="${infX},${cy - d} ${infX + d},${cy} ${infX},${cy + d} ${infX - d},${cy}" fill="${m.color}" stroke="white" stroke-width="0.8"/>`;
  });

  // 50% threshold markers drawn last (top layer)
  models.forEach((m, i) => {
    const cy = pad.t + i * rowH + rowH / 2;
    const c = allRegs[m.key].model2.coefficients;
    const intercept = c.intercept ? c.intercept.estimate : 0;
    const thX = xScale(Math.exp(-intercept));
    svg += `<line x1="${thX}" y1="${cy - 7}" x2="${thX}" y2="${cy + 7}" stroke="#e11d48" stroke-width="1.5" opacity="0.7"/>`;
    svg += `<line x1="${thX - 3}" y1="${cy - 7}" x2="${thX + 3}" y2="${cy - 7}" stroke="#e11d48" stroke-width="1" opacity="0.7"/>`;
    svg += `<line x1="${thX - 3}" y1="${cy + 7}" x2="${thX + 3}" y2="${cy + 7}" stroke="#e11d48" stroke-width="1" opacity="0.7"/>`;
  });

  // Legend
  const legY = pad.t + models.length * rowH + 35;
  // Personality range
  svg += `<line x1="${pad.l}" y1="${legY}" x2="${pad.l + 20}" y2="${legY}" stroke="#666" stroke-width="1" opacity="0.3"/>`;
  svg += `<rect x="${pad.l + 5}" y="${legY - 5}" width="10" height="10" fill="#666" fill-opacity="0.4" stroke="#666" stroke-width="0.8" rx="2"/>`;
  svg += `<text x="${pad.l + 26}" y="${legY + 3}" font-size="9" fill="#555" font-family="${SERIF}">Personality OR range (thin = full, bar = IQR)</text>`;
  // Infection peak
  const legInfX = pad.l + 280;
  svg += `<polygon points="${legInfX},${legY - 5} ${legInfX + 5},${legY} ${legInfX},${legY + 5} ${legInfX - 5},${legY}" fill="#666"/>`;
  svg += `<text x="${legInfX + 10}" y="${legY + 3}" font-size="9" fill="#555" font-family="${SERIF}">Peak infection OR</text>`;
  // 50% threshold
  const legThX = pad.l + 420;
  svg += `<line x1="${legThX}" y1="${legY - 6}" x2="${legThX}" y2="${legY + 6}" stroke="#e11d48" stroke-width="1.5"/>`;
  svg += `<line x1="${legThX - 3}" y1="${legY - 6}" x2="${legThX + 3}" y2="${legY - 6}" stroke="#e11d48" stroke-width="1"/>`;
  svg += `<line x1="${legThX - 3}" y1="${legY + 6}" x2="${legThX + 3}" y2="${legY + 6}" stroke="#e11d48" stroke-width="1"/>`;
  svg += `<text x="${legThX + 8}" y="${legY + 3}" font-size="9" fill="#555" font-family="${SERIF}">P(stay home) = 50% threshold</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;
}

// ── Probability color scale ──────────────────────────────────
function probToColor(p) {
  // Blue (#3B82F6) at p=0, white at p=0.5, amber (#D97706) at p=1
  if (p <= 0.5) {
    const t = p / 0.5;
    const r = Math.round(59 + (255 - 59) * t);
    const g = Math.round(130 + (255 - 130) * t);
    const b = Math.round(246 + (255 - 246) * t);
    return `rgb(${r},${g},${b})`;
  } else {
    const t = (p - 0.5) / 0.5;
    const r = Math.round(255 + (217 - 255) * t);
    const g = Math.round(255 + (119 - 255) * t);
    const b = Math.round(255 + (6 - 255) * t);
    return `rgb(${r},${g},${b})`;
  }
}

// ── Experiment A: Decision Surface ───────────────────────────
function renderDecisionSurface(regData, cfg, chartId) {
  const el = document.getElementById(chartId || 'comparison-surface-chart');
  if (!el || !agentsData) return;

  if (!regData || !regData.model2 || !regData.model2.coefficients) {
    el.innerHTML = '<div style="color:#999;padding:20px">No Model 2 regression data for this config.</div>';
    return;
  }

  const coefs = regData.model2.coefficients;
  const intercept = coefs.intercept ? coefs.intercept.estimate : 0;
  const bInf = coefs.infection_pct ? coefs.infection_pct.estimate : 0;
  const bInfSq = coefs.infection_pct_sq ? coefs.infection_pct_sq.estimate : 0;

  // Get each agent's personality log-odds
  const predicted = computeAgentCombinedORs(agentsData, coefs);
  const agentLogOdds = predicted.map(p => p.logCombinedOR).sort((a, b) => a - b);

  // Y range: personality log-odds
  const yMinRaw = Math.min(...agentLogOdds);
  const yMaxRaw = Math.max(...agentLogOdds);
  const yPad = Math.max(1, (yMaxRaw - yMinRaw) * 0.1);
  const yMin = Math.floor(yMinRaw - yPad);
  const yMax = Math.ceil(yMaxRaw + yPad);

  // Layout
  const W = Math.min(el.parentElement?.offsetWidth || 860, 860);
  const H = 500;
  const pad = { t: 35, r: 90, b: 55, l: 80 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  // Grid resolution
  const nX = 50, nY = 40;
  const cellW = plotW / nX;
  const cellH = plotH / nY;

  const xScale = v => pad.l + (v / 7) * plotW;
  const yScale = v => pad.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  let svg = '';

  // Heatmap cells
  for (let xi = 0; xi < nX; xi++) {
    for (let yi = 0; yi < nY; yi++) {
      const infLevel = (xi + 0.5) / nX * 7;
      const persLO = yMin + (yi + 0.5) / nY * (yMax - yMin);
      const logOdds = intercept + persLO + bInf * infLevel + bInfSq * infLevel * infLevel;
      const prob = 1 / (1 + Math.exp(-logOdds));
      const color = probToColor(prob);
      const rx = pad.l + xi * cellW;
      const ry = pad.t + (nY - 1 - yi) * cellH;
      svg += `<rect x="${rx.toFixed(1)}" y="${ry.toFixed(1)}" width="${(cellW + 0.5).toFixed(1)}" height="${(cellH + 0.5).toFixed(1)}" fill="${color}"/>`;
    }
  }

  // 50% contour line (analytical solution)
  const contourPts = [];
  for (let yi = 0; yi <= nY * 2; yi++) {
    const persLO = yMin + (yi / (nY * 2)) * (yMax - yMin);
    // Solve: bInfSq*x^2 + bInf*x + (intercept + persLO) = 0
    const a = bInfSq, b = bInf, c = intercept + persLO;
    const disc = b * b - 4 * a * c;
    if (disc < 0) continue;
    const sqrtDisc = Math.sqrt(disc);
    const x1 = (-b + sqrtDisc) / (2 * a);
    const x2 = (-b - sqrtDisc) / (2 * a);
    const roots = [x1, x2].filter(r => r >= 0 && r <= 7).sort((a, b) => a - b);
    if (roots.length === 0) continue;
    const infLevel = roots[0];
    const px = xScale(infLevel);
    const py = yScale(persLO);
    contourPts.push(`${px.toFixed(1)},${py.toFixed(1)}`);
  }
  if (contourPts.length > 1) {
    svg += `<polyline points="${contourPts.join(' ')}" fill="none" stroke="#111" stroke-width="2.5" stroke-dasharray="6,3"/>`;
    // Label
    const midIdx = Math.floor(contourPts.length / 2);
    const [mx, my] = contourPts[midIdx].split(',').map(Number);
    svg += `<text x="${mx + 6}" y="${my - 6}" font-size="10" font-weight="600" fill="#111" font-family="${SERIF}">P = 50%</text>`;
  }

  // Agent dots on left edge
  predicted.forEach(p => {
    const py = yScale(p.logCombinedOR);
    if (py >= pad.t && py <= pad.t + plotH) {
      svg += `<circle cx="${pad.l + 3}" cy="${py.toFixed(1)}" r="2" fill="#666" opacity="0.5"/>`;
    }
  });

  // X-axis ticks & labels
  [0, 1, 2, 3, 4, 5, 6, 7].forEach(lv => {
    const px = xScale(lv);
    svg += `<line x1="${px}" y1="${pad.t + plotH}" x2="${px}" y2="${pad.t + plotH + 4}" stroke="#333" stroke-width="0.5"/>`;
    svg += `<text x="${px}" y="${pad.t + plotH + 16}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="middle">${lv}%</text>`;
  });
  svg += `<text x="${pad.l + plotW / 2}" y="${H - 8}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle">Infection Level (% new cases)</text>`;

  // Y-axis ticks & labels (log-odds)
  for (let v = yMin; v <= yMax; v += 2) {
    const py = yScale(v);
    svg += `<line x1="${pad.l - 4}" y1="${py}" x2="${pad.l}" y2="${py}" stroke="#333" stroke-width="0.5"/>`;
    svg += `<text x="${pad.l - 8}" y="${py + 3}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="end">${v}</text>`;
    // Also show probability equivalent
    const prob = 1 / (1 + Math.exp(-v));
    const probStr = prob < 0.01 ? '<1%' : prob > 0.99 ? '>99%' : Math.round(prob * 100) + '%';
    svg += `<text x="${pad.l - 30}" y="${py + 3}" font-size="7" fill="#aaa" font-family="${SERIF}" text-anchor="end">(${probStr})</text>`;
  }
  svg += `<text x="12" y="${pad.t + plotH / 2}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,12,${pad.t + plotH / 2})">Personality Log-Odds</text>`;

  // Color legend (right side vertical gradient)
  const legX = W - pad.r + 20;
  const legW = 15;
  const nLegBins = 40;
  for (let i = 0; i < nLegBins; i++) {
    const p = 1 - i / nLegBins; // top = 1, bottom = 0
    const ry = pad.t + (i / nLegBins) * plotH;
    const rh = plotH / nLegBins + 0.5;
    svg += `<rect x="${legX}" y="${ry.toFixed(1)}" width="${legW}" height="${rh.toFixed(1)}" fill="${probToColor(p)}"/>`;
  }
  svg += `<rect x="${legX}" y="${pad.t}" width="${legW}" height="${plotH}" fill="none" stroke="#999" stroke-width="0.5"/>`;
  svg += `<text x="${legX + legW + 4}" y="${pad.t + 8}" font-size="8" fill="#555" font-family="${SERIF}">100%</text>`;
  svg += `<text x="${legX + legW + 4}" y="${pad.t + plotH / 2 + 3}" font-size="8" fill="#555" font-family="${SERIF}">50%</text>`;
  svg += `<text x="${legX + legW + 4}" y="${pad.t + plotH}" font-size="8" fill="#555" font-family="${SERIF}">0%</text>`;
  svg += `<text x="${legX + legW / 2}" y="${pad.t - 8}" font-size="8" fill="#555" font-family="${SERIF}" text-anchor="middle">P(home)</text>`;

  // Plot border
  svg += `<rect x="${pad.l}" y="${pad.t}" width="${plotW}" height="${plotH}" fill="none" stroke="#ccc" stroke-width="0.5"/>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;
}

// ── Experiment B: Odds Ratio Landscape: Traits & Infection ────────────────────
function renderInfectionORProgression(allRegs, containerId, modelFilter) {
  const el = document.getElementById(containerId || 'expB-chart');
  if (!el || !agentsData) return;

  const models = [];
  const seen = new Set();
  CONFIG.MODELS.forEach(m => {
    const key = configDirKey(m);
    if (seen.has(key)) return;
    seen.add(key);
    if (modelFilter && !modelFilter.has(key)) return;
    const reg = allRegs[key];
    if (!reg || !reg.model2 || !reg.model2.coefficients) return;
    const c = reg.model2.coefficients;
    if (!c.infection_pct || !c.infection_pct_sq) return;

    // Personality ORs for all 100 agents
    const predicted = computeAgentCombinedORs(agentsData, c);
    const ors = predicted.map(p => p.combinedOR).sort((a, b) => a - b);
    const q1 = ors[Math.floor(ors.length * 0.25)];
    const q3 = ors[Math.floor(ors.length * 0.75)];
    const pMin = ors[0];
    const pMax = ors[ors.length - 1];

    const bInf = c.infection_pct.estimate;
    const bInfSq = c.infection_pct_sq.estimate;

    // Infection OR at each integer level 0-7 — find min and max
    let maxOR = -Infinity, minOR = Infinity;
    for (let lv = 0; lv <= 7; lv++) {
      const lo = bInf * lv + bInfSq * lv * lv;
      const or = Math.exp(lo);
      if (or > maxOR) maxOR = or;
      if (or < minOR) minOR = or;
    }

    // Threshold
    const intercept = c.intercept ? c.intercept.estimate : 0;
    const threshold50 = Math.exp(-intercept);

    models.push({
      key, label: m.label, provider: m.provider,
      color: CONFIG.PROVIDER_COLORS[m.provider] || '#999',
      pMin, pMax, pQ1: q1, pQ3: q3,
      minInfOR: minOR, maxInfOR: maxOR, threshold50,
    });
  });

  if (models.length === 0) {
    el.innerHTML = '<div style="color:#999;padding:20px">No regression data available.</div>';
    return;
  }

  // Sort by provider then label
  const provOrder = { anthropic: 0, openai: 1, google: 2 };
  models.sort((a, b) => (provOrder[a.provider] || 3) - (provOrder[b.provider] || 3) || a.label.localeCompare(b.label));

  // Layout
  const rowH = 26;
  const W = Math.min(el.parentElement?.offsetWidth || 860, 860);
  const pad = { t: 40, r: 30, b: 75, l: 160 };
  const plotW = W - pad.l - pad.r;
  const H = pad.t + models.length * rowH + 30 + pad.b;

  // X scale: log10(OR) — include infection OR range + personality range + threshold
  let globalMin = Infinity, globalMax = 0;
  models.forEach(m => {
    if (m.pMin < globalMin && m.pMin > 0) globalMin = m.pMin;
    if (m.threshold50 < globalMin && m.threshold50 > 0) globalMin = m.threshold50;
    if (m.minInfOR < globalMin && m.minInfOR > 0) globalMin = m.minInfOR;
    if (m.pMax > globalMax) globalMax = m.pMax;
    if (m.maxInfOR > globalMax) globalMax = m.maxInfOR;
    if (m.threshold50 > globalMax) globalMax = m.threshold50;
  });
  const logMin = Math.floor(Math.log10(Math.max(1e-10, globalMin)));
  const logMax = Math.ceil(Math.log10(Math.max(1, globalMax)));
  const xScale = v => pad.l + ((Math.log10(Math.max(1e-10, v)) - logMin) / (logMax - logMin)) * plotW;

  let svg = '';

  // X-axis grid + labels (skip labels when range is wide to avoid overlap)
  const logRange = logMax - logMin;
  const labelStep = logRange > 30 ? Math.ceil(logRange / 15) : logRange > 15 ? 2 : 1;
  for (let exp = logMin; exp <= logMax; exp++) {
    const px = pad.l + ((exp - logMin) / (logMax - logMin)) * plotW;
    svg += `<line x1="${px}" y1="${pad.t - 5}" x2="${px}" y2="${pad.t + models.length * rowH + 10}" stroke="#eee" stroke-width="0.5"/>`;
    if ((exp - logMin) % labelStep === 0 || exp === 0) {
      const label = exp === 0 ? '1' : exp === 1 ? '10' : `10<tspan baseline-shift="super" font-size="7">${exp}</tspan>`;
      svg += `<text x="${px}" y="${pad.t + models.length * rowH + 24}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="middle">${label}</text>`;
    }
  }

  // OR=1 reference line
  const or1x = xScale(1);
  svg += `<line x1="${or1x}" y1="${pad.t - 5}" x2="${or1x}" y2="${pad.t + models.length * rowH + 10}" stroke="#bbb" stroke-width="1" stroke-dasharray="4,3"/>`;

  svg += `<text x="${pad.l + plotW / 2}" y="${H - 10}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle">Odds Ratio (log scale)</text>`;

  // Draw rows
  let lastProv = '';
  models.forEach((m, i) => {
    const cy = pad.t + i * rowH + rowH / 2;

    // Provider separator
    if (m.provider !== lastProv && lastProv !== '') {
      const sepY = pad.t + i * rowH - 2;
      svg += `<line x1="${pad.l - 155}" y1="${sepY}" x2="${pad.l + plotW}" y2="${sepY}" stroke="#ddd" stroke-width="0.5"/>`;
    }
    lastProv = m.provider;

    // Model label
    svg += `<text x="${pad.l - 8}" y="${cy + 3}" font-size="9" fill="${m.color}" font-family="${SERIF}" text-anchor="end">${esc(m.label)}</text>`;

    // Infection OR connecting line (behind personality IQR)
    const minX = xScale(m.minInfOR);
    const maxX = xScale(m.maxInfOR);
    svg += `<line x1="${minX}" y1="${cy}" x2="${maxX}" y2="${cy}" stroke="#D97706" stroke-width="1.5" opacity="0.7"/>`;

    // Personality: full range (thin line)
    svg += `<line x1="${xScale(m.pMin)}" y1="${cy}" x2="${xScale(m.pMax)}" y2="${cy}" stroke="${m.color}" stroke-width="1" opacity="0.3"/>`;

    // Personality: IQR (thick bar)
    const pQ1X = xScale(m.pQ1);
    const pQ3X = xScale(m.pQ3);
    svg += `<rect x="${pQ1X}" y="${cy - 5}" width="${Math.max(1, pQ3X - pQ1X)}" height="10" fill="${m.color}" fill-opacity="0.4" stroke="${m.color}" stroke-width="0.8" rx="2"/>`;

    // Infection OR markers on top: filled circle (min) + diamond (max)
    svg += `<circle cx="${minX}" cy="${cy}" r="3.5" fill="#D97706" stroke="white" stroke-width="1"/>`;
    const d = 6;
    svg += `<polygon points="${maxX},${cy - d} ${maxX + d},${cy} ${maxX},${cy + d} ${maxX - d},${cy}" fill="#D97706" stroke="white" stroke-width="0.8"/>`;
  });

  // 50% threshold markers — drawn last so they sit on top
  models.forEach((m, i) => {
    const cy = pad.t + i * rowH + rowH / 2;
    const thX = xScale(m.threshold50);
    svg += `<line x1="${thX}" y1="${cy - 7}" x2="${thX}" y2="${cy + 7}" stroke="#e11d48" stroke-width="1.5" opacity="0.7"/>`;
    svg += `<line x1="${thX - 3}" y1="${cy - 7}" x2="${thX + 3}" y2="${cy - 7}" stroke="#e11d48" stroke-width="1" opacity="0.7"/>`;
    svg += `<line x1="${thX - 3}" y1="${cy + 7}" x2="${thX + 3}" y2="${cy + 7}" stroke="#e11d48" stroke-width="1" opacity="0.7"/>`;
  });

  // Legend (two rows)
  const legY1 = pad.t + models.length * rowH + 35;
  const legY2 = legY1 + 18;
  // Row 1: Personality range + Infection progression
  svg += `<line x1="${pad.l}" y1="${legY1}" x2="${pad.l + 20}" y2="${legY1}" stroke="#666" stroke-width="1" opacity="0.3"/>`;
  svg += `<rect x="${pad.l + 5}" y="${legY1 - 5}" width="10" height="10" fill="#666" fill-opacity="0.4" stroke="#666" stroke-width="0.8" rx="2"/>`;
  svg += `<text x="${pad.l + 26}" y="${legY1 + 3}" font-size="9" fill="#555" font-family="${SERIF}">Personality OR (IQR + full range)</text>`;
  // Infection OR range legend
  const legInfX = pad.l + 240;
  svg += `<circle cx="${legInfX}" cy="${legY1}" r="3.5" fill="#D97706" stroke="white" stroke-width="1"/>`;
  svg += `<line x1="${legInfX + 5}" y1="${legY1}" x2="${legInfX + 25}" y2="${legY1}" stroke="#D97706" stroke-width="1.5" opacity="0.7"/>`;
  svg += `<polygon points="${legInfX + 30},${legY1 - 5} ${legInfX + 35},${legY1} ${legInfX + 30},${legY1 + 5} ${legInfX + 25},${legY1}" fill="#D97706"/>`;
  svg += `<text x="${legInfX + 42}" y="${legY1 + 3}" font-size="9" fill="#555" font-family="${SERIF}">Infection OR range (● = min, ◆ = max)</text>`;
  // Row 2: Threshold
  const legThX = pad.l;
  svg += `<line x1="${legThX}" y1="${legY2 - 6}" x2="${legThX}" y2="${legY2 + 6}" stroke="#e11d48" stroke-width="1.5"/>`;
  svg += `<line x1="${legThX - 3}" y1="${legY2 - 6}" x2="${legThX + 3}" y2="${legY2 - 6}" stroke="#e11d48" stroke-width="1"/>`;
  svg += `<line x1="${legThX - 3}" y1="${legY2 + 6}" x2="${legThX + 3}" y2="${legY2 + 6}" stroke="#e11d48" stroke-width="1"/>`;
  svg += `<text x="${legThX + 8}" y="${legY2 + 3}" font-size="9" fill="#555" font-family="${SERIF}">P(stay home) = 50% threshold</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;
}

// ── Fig 27 Interpretation Guide ─────────────────────────────

function renderFig27Guide() {
  const el = document.getElementById('fig27-guide');
  if (!el) return;

  const S = 'font-family:"Libre Baskerville","Georgia",serif';

  let html = `<div style="${S};font-size:13px;line-height:1.7;color:#333;max-width:780px;margin:8px 0 12px;border:1px solid #e0e0e0;border-radius:4px;padding:14px 18px">`;

  // ── What the figure shows ──
  html += '<h4 style="margin:0 0 8px;font-size:14px;color:#111">What this figure shows</h4>';
  html += '<p style="margin:0 0 8px">Each row is one LLM configuration. The figure asks: <em>how much does personality matter vs. infection level in driving agent decisions?</em> It answers this by comparing two odds-ratio ranges on the same log scale.</p>';

  // ── The two components ──
  html += '<h4 style="margin:14px 0 8px;font-size:14px;color:#111">The two components</h4>';
  html += '<p style="margin:0 0 4px"><strong>Grey bar &amp; whiskers</strong> &mdash; Personality OR range</p>';
  html += '<p style="margin:0 0 8px;font-size:12px;color:#555">The combined personality odds ratio for each of the 100 agents. The shaded bar is the IQR (middle 50%), and the whiskers extend to the most extreme agents. A wide bar means agents\' personality traits create large behavioral differences.</p>';

  html += '<p style="margin:0 0 4px"><strong>Amber line (&#x25CF; to &#x25C6;)</strong> &mdash; Infection OR range</p>';
  html += '<p style="margin:0 0 8px;font-size:12px;color:#555">The infection odds ratio computed at each infection level from 0% to 7%. The filled circle is the minimum OR across those levels; the filled diamond is the maximum. The amber line connecting them is the infection &ldquo;push&rdquo; &mdash; how much infection can shift behavior.</p>';

  // ── How to read it ──
  html += '<h4 style="margin:14px 0 8px;font-size:14px;color:#111">How to read it</h4>';
  html += '<table class="ols-table" style="width:auto;margin:8px 0">';
  html += '<thead><tr><th>Pattern</th><th>What it means</th></tr></thead>';
  html += '<tbody>';
  html += '<tr><td>Amber line extends far beyond the grey bar</td>';
  html += '<td><strong>Infection-dominant</strong>: infection overwhelms personality differences. At high infection, all agents behave similarly regardless of traits.</td></tr>';
  html += '<tr><td>Grey bar is much wider than the amber line</td>';
  html += '<td><strong>Personality-dominant</strong>: who the agent is matters more than the infection level. Even at 7%, personality variation dominates.</td></tr>';
  html += '<tr><td>Grey bar and amber line overlap substantially</td>';
  html += '<td><strong>Balanced</strong>: both forces are comparable in magnitude. The model weighs situation and character roughly equally.</td></tr>';
  html += '</tbody></table>';

  // ── The threshold marker ──
  html += '<h4 style="margin:14px 0 8px;font-size:14px;color:#111">The red threshold marker</h4>';
  html += '<p style="margin:0 0 8px">The red bracket shows the 50% decision boundary in OR space. When infection OR exceeds this value, it overcomes the model&rsquo;s intercept and pushes the <em>average</em> agent past the stay-home threshold. Models where the amber diamond falls past the bracket are strongly infection-responsive.</p>';

  // ── The log scale ──
  html += '<h4 style="margin:14px 0 8px;font-size:14px;color:#111">Why log scale?</h4>';
  html += '<p style="margin:0 0 0">Odds ratios are multiplicative, so a log scale is the natural representation. An OR of 10 and an OR of 0.1 are equally far from 1 (no effect) in opposite directions. Without the log scale, the enormous infection ORs of some models would compress personality differences into an invisible sliver.</p>';

  html += '</div>';
  el.innerHTML = html;

  // Wire toggle button
  const btn = document.getElementById('fig27-guide-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const open = el.style.display !== 'none';
      el.style.display = open ? 'none' : 'block';
      btn.innerHTML = open ? 'How to Read This Figure &#x25BE;' : 'How to Read This Figure &#x25B4;';
    });
  }
}

function renderFig25Guide() {
  const el = document.getElementById('fig25-guide');
  if (!el) return;

  const S = 'font-family:"Libre Baskerville","Georgia",serif';

  let html = `<div style="${S};font-size:13px;line-height:1.7;color:#333;max-width:780px;margin:8px 0 12px;border:1px solid #e0e0e0;border-radius:4px;padding:14px 18px">`;

  // ── What this figure measures ──
  html += '<h4 style="margin:0 0 8px;font-size:14px;color:#111">What this figure measures</h4>';
  html += '<p style="margin:0 0 8px">For each LLM configuration, we ask: <em>does the regression model&rsquo;s personality weighting correctly predict which agents stay home the most?</em> We answer this with Spearman&rsquo;s rank correlation (&rho;) between two rankings of the 100 agents.</p>';

  // ── The two rankings ──
  html += '<h4 style="margin:14px 0 8px;font-size:14px;color:#111">The two rankings</h4>';
  html += '<p style="margin:0 0 4px"><strong>Predicted ranking</strong> &mdash; from the regression model</p>';
  html += '<p style="margin:0 0 8px;font-size:12px;color:#555">Each agent&rsquo;s combined personality odds ratio (OR) is computed from Model 2 coefficients: the product of all trait ORs for that agent&rsquo;s specific trait combination. Agents are then sorted from lowest OR (most likely to go out) to highest OR (most likely to stay home). This ranking reflects <em>what the regression predicts</em> about each agent&rsquo;s relative cautiousness.</p>';

  html += '<p style="margin:0 0 4px"><strong>Actual ranking</strong> &mdash; from the raw simulation data</p>';
  html += '<p style="margin:0 0 8px;font-size:12px;color:#555">Each agent&rsquo;s actual stay-home rate is computed across all 200 decisions (40 infection levels &times; 5 repetitions). Agents are sorted from lowest rate (goes out most) to highest rate (stays home most). This ranking reflects <em>what the agent actually did</em>.</p>';

  // ── How Spearman works ──
  html += '<h4 style="margin:14px 0 8px;font-size:14px;color:#111">How Spearman&rsquo;s &rho; works</h4>';
  html += '<p style="margin:0 0 8px">Unlike Pearson correlation, Spearman only cares about <em>ordering</em>, not exact values. It asks: do agents who rank high on predicted personality OR also rank high on actual stay-home rate?</p>';
  html += '<ul style="margin:0 0 8px;padding-left:20px;font-size:12px;color:#555">';
  html += '<li>&rho; = +1: perfect agreement &mdash; every agent&rsquo;s predicted rank exactly matches their actual rank</li>';
  html += '<li>&rho; = 0: no relationship &mdash; knowing an agent&rsquo;s personality OR tells you nothing about their actual behavior</li>';
  html += '<li>&rho; = &minus;1: perfect reversal &mdash; the regression predicts the exact opposite ordering</li>';
  html += '</ul>';

  // ── Tie handling ──
  html += '<h4 style="margin:14px 0 8px;font-size:14px;color:#111">How ties are handled</h4>';
  html += '<p style="margin:0 0 8px">When two or more agents have the same stay-home rate (e.g., both stay home 5 out of 200 times), Spearman assigns each the <strong>average</strong> of their tied ranks. For example, if two agents tie for 19th and 20th place, both receive rank 19.5.</p>';
  html += '<p style="margin:0 0 8px;font-size:12px;color:#555">In practice, ties are common in the actual rankings because agent decisions are discrete (0&ndash;5 stays per infection level across 5 reps = 0&ndash;200 total stays). The predicted ranking has fewer ties because the combined personality OR is a continuous value derived from trait coefficients.</p>';

  // ── Interpretation ──
  html += '<h4 style="margin:14px 0 8px;font-size:14px;color:#111">Interpretation</h4>';
  html += '<table class="ols-table" style="width:auto;margin:8px 0">';
  html += '<thead><tr><th>&rho; range</th><th>Interpretation</th></tr></thead>';
  html += '<tbody>';
  html += '<tr><td>&rho; &gt; 0.7</td><td><strong>Strong match</strong>: the regression&rsquo;s trait weights reliably predict which agents are most cautious.</td></tr>';
  html += '<tr><td>0.4 &lt; &rho; &lt; 0.7</td><td><strong>Moderate match</strong>: personality predicts the general trend but doesn&rsquo;t fully explain individual variation.</td></tr>';
  html += '<tr><td>&rho; &lt; 0.4</td><td><strong>Weak match</strong>: the regression&rsquo;s personality weights poorly predict actual behavior ordering &mdash; other factors dominate.</td></tr>';
  html += '</tbody></table>';

  html += '</div>';
  el.innerHTML = html;

  // Wire toggle button
  const btn = document.getElementById('fig25-guide-toggle');
  if (btn) {
    btn.addEventListener('click', () => {
      const open = el.style.display !== 'none';
      el.style.display = open ? 'none' : 'block';
      btn.innerHTML = open ? 'How This Works &#x25BE;' : 'How This Works &#x25B4;';
    });
  }
}

function renderFig31FanChart(regData, cfg) {
  const el = document.getElementById('fig31-chart');
  const headlineEl = document.getElementById('fig31-headline');
  if (!el) return;

  if (!regData || !regData.model2 || !regData.model2.coefficients) {
    el.innerHTML = '<div style="color:#999;padding:20px">No Model 2 regression data for this config.</div>';
    if (headlineEl) headlineEl.innerHTML = '';
    return;
  }

  const coefs = regData.model2.coefficients;
  const agents = agentsData;
  if (!agents) { el.innerHTML = '<div style="color:#999;padding:20px">Loading agents...</div>'; return; }

  // Get intercept, infection coefficients, and personality ORs
  const intercept = coefs.intercept ? coefs.intercept.estimate : 0;
  const bInf = coefs.infection_pct ? coefs.infection_pct.estimate : 0;
  const bInfSq = coefs.infection_pct_sq ? coefs.infection_pct_sq.estimate : 0;

  // Compute each agent's personality log-odds (no intercept, no infection)
  const predicted = computeAgentCombinedORs(agents, coefs);

  // Infection levels to plot (finer granularity for smooth curves)
  const levels = [];
  for (let lv = 0; lv <= 7; lv += 0.1) levels.push(Math.round(lv * 10) / 10);

  // For each agent, compute predicted probability at each infection level
  const logistic = x => 1 / (1 + Math.exp(-x));
  const agentCurves = predicted.map(p => {
    const points = levels.map(lv => {
      const logOdds = intercept + p.logCombinedOR + bInf * lv + bInfSq * lv * lv;
      return { level: lv, prob: logistic(logOdds) };
    });
    return { ...p, points };
  });

  // Compute crossover points (where P crosses 0.5) for each agent
  const crossovers = agentCurves.map(ac => {
    // Find first level where prob >= 0.5
    for (let i = 0; i < ac.points.length; i++) {
      if (ac.points[i].prob >= 0.5) {
        // Interpolate
        if (i === 0) return { agent_id: ac.agent_id, crossover: 0 };
        const prev = ac.points[i - 1], curr = ac.points[i];
        const t = (0.5 - prev.prob) / (curr.prob - prev.prob);
        return { agent_id: ac.agent_id, crossover: prev.level + t * (curr.level - prev.level) };
      }
    }
    return { agent_id: ac.agent_id, crossover: null }; // never crosses 0.5
  });

  const validCrossovers = crossovers.filter(c => c.crossover !== null && c.crossover > 0);
  const neverCross = crossovers.filter(c => c.crossover === null).length;
  const alwaysHome = crossovers.filter(c => c.crossover === 0).length;

  // Headline
  if (headlineEl) {
    let msg = '';
    if (alwaysHome > 0) msg += `${alwaysHome} agents predicted to stay home even at 0% infection. `;
    if (neverCross > 0) msg += `${neverCross} agents never reach 50% stay-home probability. `;
    if (validCrossovers.length > 0) {
      const sorted = validCrossovers.map(c => c.crossover).sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)];
      const min = sorted[0];
      const max = sorted[sorted.length - 1];
      msg += `Crossover range: ${min.toFixed(1)}%\u2013${max.toFixed(1)}% (median ${median.toFixed(1)}%).`;
    }
    headlineEl.innerHTML = `<div style="font-family:${SERIF};font-size:12px;color:#555;padding:2px 0">${msg}</div>`;
  }

  // Layout
  const W = Math.min(el.parentElement?.offsetWidth || 860, 860);
  const H = 460;
  const pad = { t: 20, r: 30, b: 50, l: 60 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  const xScale = v => pad.l + (v / 7) * plotW;
  const yScale = v => pad.t + plotH - v * plotH;

  const provColor = CONFIG.PROVIDER_COLORS[cfg.provider] || '#999';

  let svg = '';

  // Grid lines
  for (let y = 0; y <= 1; y += 0.25) {
    const py = yScale(y);
    svg += `<line x1="${pad.l}" y1="${py}" x2="${W - pad.r}" y2="${py}" stroke="#eee" stroke-width="0.5"/>`;
    svg += `<text x="${pad.l - 8}" y="${py + 3}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="end">${Math.round(y * 100)}%</text>`;
  }

  // 50% reference line (the crossover threshold)
  const y50 = yScale(0.5);
  svg += `<line x1="${pad.l}" y1="${y50}" x2="${W - pad.r}" y2="${y50}" stroke="#999" stroke-width="1" stroke-dasharray="4,3"/>`;
  svg += `<text x="${W - pad.r + 4}" y="${y50 + 3}" font-size="8" fill="#999" font-family="${SERIF}">50%</text>`;

  // X-axis ticks
  [0, 1, 2, 3, 4, 5, 6, 7].forEach(lv => {
    const px = xScale(lv);
    svg += `<line x1="${px}" y1="${pad.t}" x2="${px}" y2="${pad.t + plotH}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    svg += `<text x="${px}" y="${pad.t + plotH + 16}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="middle">${lv}%</text>`;
  });

  // Axis labels
  svg += `<text x="${pad.l + plotW / 2}" y="${H - 8}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle">Infection Level (% new cases)</text>`;
  svg += `<text x="14" y="${pad.t + plotH / 2}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,14,${pad.t + plotH / 2})">P(Stay Home)</text>`;

  // Sort agents by combined OR for coloring (low OR = go-outers drawn first)
  const sortedAgents = [...agentCurves].sort((a, b) => a.combinedOR - b.combinedOR);

  // Color scale: go-outers (low OR) in cool blue, stay-homers (high OR) in warm amber
  const colorScale = (idx, total) => {
    const t = idx / (total - 1); // 0 = lowest OR, 1 = highest OR
    // Blue (go-out) → Gray (neutral) → Amber (stay-home)
    const r = Math.round(t < 0.5 ? 70 + t * 200 : 170 + (t - 0.5) * 170);
    const g = Math.round(t < 0.5 ? 130 + t * 100 : 180 - (t - 0.5) * 100);
    const b2 = Math.round(t < 0.5 ? 210 - t * 200 : 110 - (t - 0.5) * 80);
    return `rgb(${r},${g},${b2})`;
  };

  // Draw agent curves
  sortedAgents.forEach((ac, idx) => {
    let path = '';
    ac.points.forEach((p, i) => {
      const px = xScale(p.level);
      const py = yScale(p.prob);
      path += (i === 0 ? 'M' : 'L') + `${px.toFixed(1)},${py.toFixed(1)}`;
    });
    const color = colorScale(idx, sortedAgents.length);
    svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="1" opacity="0.5"/>`;
  });

  // Legend: color gradient
  const legX = pad.l + plotW - 140, legY = pad.t + 8;
  svg += `<text x="${legX}" y="${legY}" font-size="9" fill="#555" font-family="${SERIF}" font-weight="bold">Agent personality</text>`;
  // Gradient bar
  for (let i = 0; i < 80; i++) {
    const color = colorScale(i, 80);
    svg += `<rect x="${legX + i}" y="${legY + 4}" width="1.5" height="8" fill="${color}"/>`;
  }
  svg += `<text x="${legX}" y="${legY + 22}" font-size="7" fill="#888" font-family="${SERIF}">Go-outers</text>`;
  svg += `<text x="${legX + 80}" y="${legY + 22}" font-size="7" fill="#888" font-family="${SERIF}" text-anchor="end">Stay-homers</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;
}

// ── Fig 32: Predicted vs Actual Transition Points ────────────
function renderFig32TransitionScatter(microRows, cfg, regData) {
  const el = document.getElementById('fig32-chart');
  const headlineEl = document.getElementById('fig32-headline');
  if (!el) return;

  if (!regData || !regData.model2 || !regData.model2.coefficients) {
    el.innerHTML = '<div style="color:#999;padding:20px">No Model 2 regression data.</div>';
    if (headlineEl) headlineEl.innerHTML = '';
    return;
  }

  const coefs = regData.model2.coefficients;
  const agents = agentsData;
  if (!agents) return;

  const intercept = coefs.intercept ? coefs.intercept.estimate : 0;
  const bInf = coefs.infection_pct ? coefs.infection_pct.estimate : 0;
  const bInfSq = coefs.infection_pct_sq ? coefs.infection_pct_sq.estimate : 0;
  const logistic = x => 1 / (1 + Math.exp(-x));

  // Predicted transition: infection level where P crosses 0.5
  const predicted = computeAgentCombinedORs(agents, coefs);
  const predTransitions = predicted.map(p => {
    for (let lv = 0; lv <= 7; lv += 0.05) {
      const logOdds = intercept + p.logCombinedOR + bInf * lv + bInfSq * lv * lv;
      if (logistic(logOdds) >= 0.5) return lv;
    }
    return null; // never crosses
  });

  // Actual transition: first infection level where majority stays home
  const agentVotes = {};
  microRows.forEach(r => {
    const key = `${+r.agent_id}|${parseFloat(r.infection_level)}`;
    if (!agentVotes[key]) agentVotes[key] = { yes: 0, total: 0 };
    agentVotes[key].total++;
    if (r.response === 'yes') agentVotes[key].yes++;
  });

  const actualTransitions = agents.map(a => {
    for (const lv of CONFIG.INFECTION_LEVELS) {
      const key = `${a.agent_id}|${lv}`;
      const v = agentVotes[key];
      if (v && v.yes > v.total / 2) return lv;
    }
    return null; // never transitions
  });

  // Build paired data
  const NEVER = 7.5; // plot position for "never"
  const pairs = agents.map((a, i) => ({
    agent_id: a.agent_id, name: a.name,
    predicted: predTransitions[i] !== null ? predTransitions[i] : NEVER,
    actual: actualTransitions[i] !== null ? actualTransitions[i] : NEVER,
    predNull: predTransitions[i] === null,
    actNull: actualTransitions[i] === null,
  }));

  // Spearman rho on transition points
  const predArr = pairs.map(p => p.predicted);
  const actArr = pairs.map(p => p.actual);
  const rho = spearmanRho(predArr, actArr);

  if (headlineEl) {
    const rhoColor = rho > 0.7 ? '#2d7d2d' : rho > 0.4 ? '#b8860b' : '#c00';
    headlineEl.innerHTML = `<div style="font-family:${SERIF};font-size:14px;color:${rhoColor};font-weight:bold;padding:4px 0">Spearman \u03C1 = ${rho.toFixed(3)}</div>`;
  }

  // Layout
  const W = Math.min(el.parentElement?.offsetWidth || 860, 860);
  const H = 500;
  const pad = { t: 30, r: 30, b: 50, l: 60 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  const xScale = v => pad.l + (v / 8) * plotW;
  const yScale = v => pad.t + plotH - (v / 8) * plotH;

  const provColor = CONFIG.PROVIDER_COLORS[cfg.provider] || '#999';

  let svg = '';

  // Diagonal reference line (perfect prediction)
  svg += `<line x1="${xScale(0)}" y1="${yScale(0)}" x2="${xScale(8)}" y2="${yScale(8)}" stroke="#ddd" stroke-width="1.5"/>`;

  // Grid
  [0, 1, 2, 3, 4, 5, 6, 7].forEach(v => {
    svg += `<line x1="${xScale(v)}" y1="${pad.t}" x2="${xScale(v)}" y2="${pad.t + plotH}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    svg += `<line x1="${pad.l}" y1="${yScale(v)}" x2="${pad.l + plotW}" y2="${yScale(v)}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    svg += `<text x="${xScale(v)}" y="${pad.t + plotH + 16}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="middle">${v}%</text>`;
    svg += `<text x="${pad.l - 8}" y="${yScale(v) + 3}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="end">${v}%</text>`;
  });
  // "Never" labels
  svg += `<text x="${xScale(NEVER)}" y="${pad.t + plotH + 16}" font-size="8" fill="#aaa" font-family="${SERIF}" text-anchor="middle">Never</text>`;
  svg += `<text x="${pad.l - 8}" y="${yScale(NEVER) + 3}" font-size="8" fill="#aaa" font-family="${SERIF}" text-anchor="end">Never</text>`;

  // Axis labels
  svg += `<text x="${pad.l + plotW / 2}" y="${H - 8}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle">Predicted Transition Point (from Model 2)</text>`;
  svg += `<text x="14" y="${pad.t + plotH / 2}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,14,${pad.t + plotH / 2})">Actual Transition Point (from data)</text>`;

  // Deterministic jitter based on agent_id for stable positioning
  function jit(id, seed) {
    const h = ((id + seed) * 2654435761) >>> 0;
    return (h % 1000) / 1000 * 0.3 - 0.15;  // ±0.15% offset
  }

  // Plot dots (with jitter to reveal overlaps)
  pairs.forEach(p => {
    const jx = p.predicted + jit(p.agent_id, 1);
    const jy = p.actual + jit(p.agent_id, 2);
    const px = xScale(jx);
    const py = yScale(jy);
    const hollow = p.predNull || p.actNull;
    if (hollow) {
      svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="white" stroke="${provColor}" stroke-width="1.5" opacity="0.7"/>`;
    } else {
      svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="${provColor}" fill-opacity="0.6" stroke="${provColor}" stroke-width="1"/>`;
    }
    // Tooltip hit target
    const tip1 = `${esc(p.name)}`;
    const tip2 = `Predicted: ${p.predNull ? 'never' : p.predicted.toFixed(1) + '%'} | Actual: ${p.actNull ? 'never' : p.actual.toFixed(1) + '%'}`;
    svg += `<circle class="fig32-dot" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="7" fill="transparent" stroke="none" style="cursor:pointer" data-tip1="${tip1}" data-tip2="${tip2}"/>`;
  });

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;

  // Tooltips
  let tip = document.getElementById('fig32-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'fig32-tooltip';
    tip.style.cssText = 'display:none;position:fixed;background:#222;color:#fff;padding:6px 12px;font-size:11px;font-family:Georgia,serif;border-radius:3px;pointer-events:none;z-index:200;line-height:1.5';
    document.body.appendChild(tip);
  }
  el.querySelectorAll('.fig32-dot').forEach(dot => {
    dot.addEventListener('mouseenter', () => { tip.innerHTML = `<strong>${dot.dataset.tip1}</strong><br>${dot.dataset.tip2}`; tip.style.display = 'block'; });
    dot.addEventListener('mousemove', e => { tip.style.left = (e.clientX + 14) + 'px'; tip.style.top = (e.clientY - 36) + 'px'; });
    dot.addEventListener('mouseleave', () => { tip.style.display = 'none'; });
  });
}

// ── EXPERIMENTAL: Delta Strip Chart ─────────────────────────
function renderFigDeltaStrip(microRows, cfg, regData) {
  const el = document.getElementById('figDelta-chart');
  const headlineEl = document.getElementById('figDelta-headline');
  if (!el) return;

  if (!regData || !regData.model2 || !regData.model2.coefficients) {
    el.innerHTML = '<div style="color:#999;padding:20px">No Model 2 regression data for this config.</div>';
    if (headlineEl) headlineEl.innerHTML = '';
    return;
  }

  const coefs = regData.model2.coefficients;
  const agents = agentsData;
  if (!agents) return;

  const intercept = coefs.intercept ? coefs.intercept.estimate : 0;
  const bInf = coefs.infection_pct ? coefs.infection_pct.estimate : 0;
  const bInfSq = coefs.infection_pct_sq ? coefs.infection_pct_sq.estimate : 0;
  const logistic = x => 1 / (1 + Math.exp(-x));

  // Predicted transition: infection level where P crosses 0.5
  const predicted = computeAgentCombinedORs(agents, coefs);
  const predTransitions = predicted.map(p => {
    for (let lv = 0; lv <= 7; lv += 0.05) {
      const logOdds = intercept + p.logCombinedOR + bInf * lv + bInfSq * lv * lv;
      if (logistic(logOdds) >= 0.5) return lv;
    }
    return null;
  });

  // Actual transition: first infection level where majority stays home
  const agentVotes = {};
  microRows.forEach(r => {
    const key = `${+r.agent_id}|${parseFloat(r.infection_level)}`;
    if (!agentVotes[key]) agentVotes[key] = { yes: 0, total: 0 };
    agentVotes[key].total++;
    if (r.response === 'yes') agentVotes[key].yes++;
  });
  const actualTransitions = agents.map(a => {
    for (const lv of CONFIG.INFECTION_LEVELS) {
      const key = `${a.agent_id}|${lv}`;
      const v = agentVotes[key];
      if (v && v.yes > v.total / 2) return lv;
    }
    return null;
  });

  // Categorize agents — treat "never" as 7% for delta computation
  const NEVER_AS = 7; // treat "never transitions" as 7% for delta calc
  const categories = agents.map((a, i) => {
    const pred = predTransitions[i];
    const act = actualTransitions[i];
    if (pred !== null && act !== null) return { agent: a, delta: pred - act, cat: 'normal' };
    if (pred === null && act === null) return { agent: a, delta: 0, cat: 'both-never' };
    // pred finite, actual never → treat actual as 7%, delta = pred - 7 (negative)
    if (pred !== null && act === null) return { agent: a, delta: pred - NEVER_AS, cat: 'actual-never', pred };
    // pred never, actual finite → treat pred as 7%, delta = 7 - actual (positive)
    return { agent: a, delta: NEVER_AS - act, cat: 'pred-never', act };
  });

  const normals = categories.filter(c => c.cat === 'normal');
  const bothNever = categories.filter(c => c.cat === 'both-never');
  const actualNever = categories.filter(c => c.cat === 'actual-never');
  const predNever = categories.filter(c => c.cat === 'pred-never');

  // Summary stats (include all deltas now since all are computable)
  const allDeltas = categories.map(c => c.delta);
  const mae = allDeltas.length ? allDeltas.reduce((s, d) => s + Math.abs(d), 0) / allDeltas.length : 0;
  const meanDelta = allDeltas.length ? allDeltas.reduce((s, d) => s + d, 0) / allDeltas.length : 0;

  if (headlineEl) {
    const maeColor = mae < 1 ? '#2d7d2d' : mae < 2 ? '#b8860b' : '#c00';
    headlineEl.innerHTML = `<div style="font-family:${SERIF};font-size:13px;color:#555;padding:4px 0">` +
      `<span style="color:${maeColor};font-weight:bold">MAE = ${mae.toFixed(2)}%</span>` +
      ` &nbsp;|&nbsp; Mean \u0394 = ${meanDelta >= 0 ? '+' : ''}${meanDelta.toFixed(2)}%` +
      ` &nbsp;|&nbsp; Both finite: ${normals.length}` +
      ` &nbsp;|&nbsp; Both never: ${bothNever.length}` +
      (actualNever.length ? ` &nbsp;|&nbsp; <span style="color:#b45309">Actual never: ${actualNever.length}</span>` : '') +
      (predNever.length ? ` &nbsp;|&nbsp; <span style="color:#c2410c">Pred. never: ${predNever.length}</span>` : '') +
      `</div>`;
  }

  // ── Histogram layout ──
  const W = Math.min(el.parentElement?.offsetWidth || 900, 900);
  const H = 370;
  const pad = { t: 24, r: 20, b: 80, l: 14 };
  // Colorblind-friendly palette (blue/orange/gray — safe for deuteranopia)
  const COL_NORMAL = '#6B7280';         // gray-500 — both finite (fixed color)
  const COL_BOTH_NEVER = '#3B82F6';     // blue — both never (stacked on 0%)
  const COL_ACTUAL_NEVER = '#EAB308';   // yellow — pred finite, actual never
  const COL_PRED_NEVER = '#C2410C';     // burnt orange — pred never, actual finite

  // Fixed x-axis: -7 to +7 in 0.5% bins
  const binSize = 0.5;
  const xRange = 7; // -7% to +7%
  const nBins = Math.round(2 * xRange / binSize); // 28
  // bins[i] stores per-category counts for proper stacking
  const bins = [];
  for (let i = 0; i < nBins; i++) {
    const lo = -xRange + i * binSize;
    bins.push({ lo, hi: lo + binSize, normalCount: 0, bothNeverCount: 0, predNeverCount: 0, actualNeverCount: 0 });
  }

  // Helper to find bin index for a delta value
  const binFor = d => {
    let idx = Math.floor((d + xRange) / binSize);
    if (idx < 0) idx = 0;
    if (idx >= nBins) idx = nBins - 1;
    return idx;
  };

  // Assign normal deltas
  normals.forEach(c => { bins[binFor(c.delta)].normalCount++; });

  // Assign both-never to the 0% bin
  const zeroBinIdx = binFor(0);
  bins[zeroBinIdx].bothNeverCount += bothNever.length;

  // Assign actual-never (pred finite, actual never → negative delta)
  actualNever.forEach(c => { bins[binFor(c.delta)].actualNeverCount++; });

  // Assign pred-never (pred never, actual finite → positive delta)
  predNever.forEach(c => { bins[binFor(c.delta)].predNeverCount++; });

  // Side columns for totals
  const neverPredTotal = predNever.length;
  const neverActualTotal = actualNever.length;
  const neverBothTotal = bothNever.length;

  // Compute max stacked bar height
  const maxCount = Math.max(...bins.map(b => b.normalCount + b.bothNeverCount + b.predNeverCount + b.actualNeverCount), 1);

  // Layout: [side columns] [gap] [histogram area]
  const sideColW = 26;
  const sideGap = 50;
  const numSideCols = 3;
  const sideTotal = numSideCols * sideColW + (numSideCols - 1) * 4 + sideGap;
  const histL = pad.l + sideTotal;
  const histR = W - pad.r;
  const histW = histR - histL;
  const plotH = H - pad.t - pad.b;
  const barW = Math.max(histW / nBins - 1, 2);

  const yScale = v => pad.t + plotH - (v / maxCount) * plotH;
  const xBin = i => histL + (i + 0.5) * (histW / nBins); // center of bin

  let svg = '';

  // Y-axis grid lines
  const yTicks = [];
  const yStep = maxCount <= 5 ? 1 : maxCount <= 15 ? 2 : maxCount <= 30 ? 5 : 10;
  for (let v = 0; v <= maxCount; v += yStep) yTicks.push(v);
  yTicks.forEach(v => {
    const y = yScale(v);
    svg += `<line x1="${histL}" y1="${y.toFixed(1)}" x2="${histR}" y2="${y.toFixed(1)}" stroke="${GRID_COLOR}" stroke-width="0.5"/>`;
    svg += `<text x="${(histL - 6).toFixed(1)}" y="${(y + 3).toFixed(1)}" font-size="9" fill="${AX_COLOR}" font-family="${SERIF}" text-anchor="end">${v}</text>`;
  });

  // Y-axis label
  const yLabelX = histL - 28;
  svg += `<text x="${yLabelX}" y="${(pad.t + plotH / 2).toFixed(1)}" font-size="10" fill="#555" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,${yLabelX},${(pad.t + plotH / 2).toFixed(1)})">Agents</text>`;

  // Histogram bars (stacked: normal → bothNever → predNever → actualNever)
  bins.forEach((b, i) => {
    const total = b.normalCount + b.bothNeverCount + b.predNeverCount + b.actualNeverCount;
    if (total === 0) return;
    const bx = xBin(i) - barW / 2;

    // Build tooltip text for this bin
    const loFmt = b.lo >= 0 ? `+${b.lo.toFixed(1)}` : b.lo.toFixed(1);
    const hiFmt = b.hi >= 0 ? `+${b.hi.toFixed(1)}` : b.hi.toFixed(1);
    let tip = `\u0394 ${loFmt}% to ${hiFmt}% \u2014 ${total} agent${total !== 1 ? 's' : ''}`;
    if (b.normalCount) tip += ` | Both finite: ${b.normalCount}`;
    if (b.bothNeverCount) tip += ` | Both never: ${b.bothNeverCount}`;
    if (b.predNeverCount) tip += ` | Pred never: ${b.predNeverCount}`;
    if (b.actualNeverCount) tip += ` | Actual never: ${b.actualNeverCount}`;

    // Wrap entire bar in a <g> with data-tip for JS tooltip
    const topY = yScale(total);
    svg += `<g class="delta-bar" data-tip="${tip.replace(/"/g, '&quot;')}">`;

    // Stack segments bottom-up
    const segments = [
      { count: b.normalCount, color: COL_NORMAL, opacity: 0.7, hatch: false },
      { count: b.bothNeverCount, color: COL_BOTH_NEVER, opacity: 0.5, hatch: true },
      { count: b.predNeverCount, color: COL_PRED_NEVER, opacity: 0.55, hatch: true },
      { count: b.actualNeverCount, color: COL_ACTUAL_NEVER, opacity: 0.55, hatch: true },
    ];
    let cumCount = 0;
    segments.forEach(seg => {
      if (seg.count === 0) return;
      const segBase = yScale(cumCount);
      const segTop = yScale(cumCount + seg.count);
      const bh = segBase - segTop;
      svg += `<rect x="${bx.toFixed(1)}" y="${segTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="${seg.color}" opacity="${seg.opacity}" rx="1"/>`;
      if (seg.hatch) {
        svg += `<rect x="${bx.toFixed(1)}" y="${segTop.toFixed(1)}" width="${barW.toFixed(1)}" height="${bh.toFixed(1)}" fill="url(#hatch)" opacity="0.15" rx="1"/>`;
      }
      cumCount += seg.count;
    });

    svg += `</g>`;

    // Count label above bar
    svg += `<text x="${xBin(i).toFixed(1)}" y="${(topY - 3).toFixed(1)}" font-size="7" fill="#555" font-family="${SERIF}" text-anchor="middle">${total}</text>`;
  });

  // X-axis labels (every 1%) — centered under bins
  for (let v = -xRange; v <= xRange; v += 1) {
    const idx = binFor(v);
    const px = xBin(idx);
    svg += `<text x="${px.toFixed(1)}" y="${(pad.t + plotH + 14).toFixed(1)}" font-size="8" fill="${AX_COLOR}" font-family="${SERIF}" text-anchor="middle">${v > 0 ? '+' : ''}${v}%</text>`;
  }

  // Direction labels
  svg += `<text x="${histL.toFixed(1)}" y="${(pad.t + plotH + 26).toFixed(1)}" font-size="7" fill="#999" font-family="${SERIF}">\u2190 predicts earlier</text>`;
  svg += `<text x="${histR.toFixed(1)}" y="${(pad.t + plotH + 26).toFixed(1)}" font-size="7" fill="#999" font-family="${SERIF}" text-anchor="end">predicts later \u2192</text>`;

  // X-axis title
  svg += `<text x="${((histL + histR) / 2).toFixed(1)}" y="${(pad.t + plotH + 42).toFixed(1)}" font-size="10" fill="#555" font-family="${SERIF}" text-anchor="middle">\u0394 Transition Point (predicted \u2212 actual)</text>`;

  // Baseline
  svg += `<line x1="${histL}" y1="${yScale(0).toFixed(1)}" x2="${histR}" y2="${yScale(0).toFixed(1)}" stroke="#999" stroke-width="0.5"/>`;

  // ── Side "Never" summary columns ──
  const sideBaseX = pad.l;
  const colSpacing = sideColW + 4;

  // Separator line (just left of histogram, right of y-axis numbers)
  svg += `<line x1="${(histL - 4).toFixed(1)}" y1="${pad.t}" x2="${(histL - 4).toFixed(1)}" y2="${(pad.t + plotH).toFixed(1)}" stroke="#ddd" stroke-width="0.5" stroke-dasharray="3,3"/>`;

  // Column 1: pred never
  const c1X = sideBaseX;
  if (neverPredTotal > 0) {
    const by = yScale(neverPredTotal);
    const bh = yScale(0) - by;
    svg += `<rect x="${c1X}" y="${by.toFixed(1)}" width="${sideColW}" height="${bh.toFixed(1)}" fill="${COL_PRED_NEVER}" opacity="0.55" rx="2"/>`;
    svg += `<text x="${(c1X + sideColW / 2).toFixed(1)}" y="${(by - 3).toFixed(1)}" font-size="8" fill="${COL_PRED_NEVER}" font-family="${SERIF}" text-anchor="middle" font-weight="bold">${neverPredTotal}</text>`;
  }
  svg += `<line x1="${c1X}" y1="${yScale(0).toFixed(1)}" x2="${(c1X + sideColW).toFixed(1)}" y2="${yScale(0).toFixed(1)}" stroke="#999" stroke-width="0.5"/>`;
  svg += `<text x="${(c1X + sideColW / 2).toFixed(1)}" y="${(pad.t + plotH + 12).toFixed(1)}" font-size="6.5" fill="${COL_PRED_NEVER}" font-family="${SERIF}" text-anchor="middle" font-weight="bold">pred</text>`;
  svg += `<text x="${(c1X + sideColW / 2).toFixed(1)}" y="${(pad.t + plotH + 20).toFixed(1)}" font-size="6.5" fill="${COL_PRED_NEVER}" font-family="${SERIF}" text-anchor="middle" font-weight="bold">never</text>`;

  // Column 2: actual never
  const c2X = sideBaseX + colSpacing;
  if (neverActualTotal > 0) {
    const by = yScale(neverActualTotal);
    const bh = yScale(0) - by;
    svg += `<rect x="${c2X}" y="${by.toFixed(1)}" width="${sideColW}" height="${bh.toFixed(1)}" fill="${COL_ACTUAL_NEVER}" opacity="0.55" rx="2"/>`;
    svg += `<text x="${(c2X + sideColW / 2).toFixed(1)}" y="${(by - 3).toFixed(1)}" font-size="8" fill="${COL_ACTUAL_NEVER}" font-family="${SERIF}" text-anchor="middle" font-weight="bold">${neverActualTotal}</text>`;
  }
  svg += `<line x1="${c2X}" y1="${yScale(0).toFixed(1)}" x2="${(c2X + sideColW).toFixed(1)}" y2="${yScale(0).toFixed(1)}" stroke="#999" stroke-width="0.5"/>`;
  svg += `<text x="${(c2X + sideColW / 2).toFixed(1)}" y="${(pad.t + plotH + 12).toFixed(1)}" font-size="6.5" fill="${COL_ACTUAL_NEVER}" font-family="${SERIF}" text-anchor="middle" font-weight="bold">actual</text>`;
  svg += `<text x="${(c2X + sideColW / 2).toFixed(1)}" y="${(pad.t + plotH + 20).toFixed(1)}" font-size="6.5" fill="${COL_ACTUAL_NEVER}" font-family="${SERIF}" text-anchor="middle" font-weight="bold">never</text>`;

  // Column 3: both never
  const c3X = sideBaseX + colSpacing * 2;
  if (neverBothTotal > 0) {
    const by = yScale(neverBothTotal);
    const bh = yScale(0) - by;
    svg += `<rect x="${c3X}" y="${by.toFixed(1)}" width="${sideColW}" height="${bh.toFixed(1)}" fill="${COL_BOTH_NEVER}" opacity="0.45" rx="2"/>`;
    svg += `<text x="${(c3X + sideColW / 2).toFixed(1)}" y="${(by - 3).toFixed(1)}" font-size="8" fill="#666" font-family="${SERIF}" text-anchor="middle" font-weight="bold">${neverBothTotal}</text>`;
  }
  svg += `<line x1="${c3X}" y1="${yScale(0).toFixed(1)}" x2="${(c3X + sideColW).toFixed(1)}" y2="${yScale(0).toFixed(1)}" stroke="#999" stroke-width="0.5"/>`;
  svg += `<text x="${(c3X + sideColW / 2).toFixed(1)}" y="${(pad.t + plotH + 12).toFixed(1)}" font-size="6.5" fill="#666" font-family="${SERIF}" text-anchor="middle" font-weight="bold">both</text>`;
  svg += `<text x="${(c3X + sideColW / 2).toFixed(1)}" y="${(pad.t + plotH + 20).toFixed(1)}" font-size="6.5" fill="#666" font-family="${SERIF}" text-anchor="middle" font-weight="bold">never</text>`;

  // Legend
  const legY = pad.t + plotH + 58;
  const legX = histL + 4;
  svg += `<rect x="${legX}" y="${legY - 6}" width="8" height="8" fill="${COL_NORMAL}" opacity="0.7" rx="1"/>`;
  svg += `<text x="${legX + 12}" y="${legY + 1}" font-size="7.5" fill="#555" font-family="${SERIF}">Both finite</text>`;
  const leg2X = legX + 80;
  svg += `<rect x="${leg2X}" y="${legY - 6}" width="8" height="8" fill="${COL_BOTH_NEVER}" opacity="0.55" rx="1"/>`;
  svg += `<text x="${leg2X + 12}" y="${legY + 1}" font-size="7.5" fill="#555" font-family="${SERIF}">Both never (= 0\u0394)</text>`;
  const leg3X = leg2X + 110;
  svg += `<rect x="${leg3X}" y="${legY - 6}" width="8" height="8" fill="${COL_PRED_NEVER}" opacity="0.55" rx="1"/>`;
  svg += `<text x="${leg3X + 12}" y="${legY + 1}" font-size="7.5" fill="#555" font-family="${SERIF}">Pred. never (7% \u2212 actual)</text>`;
  const leg4X = leg3X + 140;
  svg += `<rect x="${leg4X}" y="${legY - 6}" width="8" height="8" fill="${COL_ACTUAL_NEVER}" opacity="0.55" rx="1"/>`;
  svg += `<text x="${leg4X + 12}" y="${legY + 1}" font-size="7.5" fill="#555" font-family="${SERIF}">Actual never (pred \u2212 7%)</text>`;

  // Hatching pattern definition
  const defs = `<defs><pattern id="hatch" patternUnits="userSpaceOnUse" width="4" height="4"><path d="M-1,1 l2,-2 M0,4 l4,-4 M3,5 l2,-2" stroke="#fff" stroke-width="0.7"/></pattern></defs>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${defs}${svg}</svg>`;

  // Wire up JS tooltips for histogram bars
  let tip = document.getElementById('delta-tooltip');
  if (!tip) {
    tip = document.createElement('div');
    tip.id = 'delta-tooltip';
    tip.style.cssText = 'position:fixed;pointer-events:none;background:#333;color:#fff;font-family:Georgia,serif;font-size:11px;padding:5px 9px;border-radius:4px;white-space:pre;z-index:9999;display:none;line-height:1.4';
    document.body.appendChild(tip);
  }
  el.querySelectorAll('.delta-bar').forEach(g => {
    g.style.cursor = 'default';
    g.addEventListener('mouseenter', e => {
      tip.textContent = g.dataset.tip;
      tip.style.display = 'block';
      tip.style.left = (e.clientX + 12) + 'px';
      tip.style.top = (e.clientY - 10) + 'px';
    });
    g.addEventListener('mousemove', e => {
      tip.style.left = (e.clientX + 12) + 'px';
      tip.style.top = (e.clientY - 10) + 'px';
    });
    g.addEventListener('mouseleave', () => {
      tip.style.display = 'none';
    });
  });
}

// ── Fig 33: OR Magnitude Comparison ──────────────────────────
function renderFig33MagnitudeComparison(regData, cfg) {
  const el = document.getElementById('fig33-chart');
  if (!el) return;

  if (!regData || !regData.model2 || !regData.model2.coefficients) {
    el.innerHTML = '<div style="color:#999;padding:20px">No Model 2 regression data.</div>';
    return;
  }

  const coefs = regData.model2.coefficients;
  const agents = agentsData;
  if (!agents) return;

  const bInf = coefs.infection_pct ? coefs.infection_pct.estimate : 0;
  const bInfSq = coefs.infection_pct_sq ? coefs.infection_pct_sq.estimate : 0;

  // Compute personality ORs
  const predicted = computeAgentCombinedORs(agents, coefs);
  const personalityLogORs = predicted.map(p => Math.log10(Math.max(1e-10, p.combinedOR)));

  // Compute infection ORs at levels
  const infLevels = [];
  for (let lv = 0; lv <= 7; lv += 0.2) infLevels.push(Math.round(lv * 10) / 10);
  const infLogORs = infLevels.map(lv => {
    const logOdds = bInf * lv + bInfSq * lv * lv;
    return Math.log10(Math.max(1, Math.exp(logOdds)));
  });

  // Layout
  const W = Math.min(el.parentElement?.offsetWidth || 860, 860);
  const H = 460;
  const pad = { t: 30, r: 30, b: 50, l: 70 };
  const stripW = 60; // width for personality dot strip
  const gapW = 20;
  const curveL = pad.l + stripW + gapW;
  const plotW = W - curveL - pad.r;
  const plotH = H - pad.t - pad.b;

  // Y scale: shared log10(OR)
  const allLogORs = [...personalityLogORs, ...infLogORs];
  const yMin = Math.floor(Math.min(...allLogORs) - 0.5);
  const yMax = Math.ceil(Math.max(...allLogORs) + 0.5);
  const yScale = v => pad.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  // X scale for infection curve
  const xScale = v => curveL + (v / 7) * plotW;

  const provColor = CONFIG.PROVIDER_COLORS[cfg.provider] || '#999';

  let svg = '';

  // Y-axis grid + labels
  for (let y = yMin; y <= yMax; y++) {
    const py = yScale(y);
    svg += `<line x1="${pad.l}" y1="${py}" x2="${W - pad.r}" y2="${py}" stroke="#eee" stroke-width="0.5"/>`;
    const label = y === 0 ? '1' : y === 1 ? '10' : y < 0 ? `10^${y}` : `10^${y}`;
    svg += `<text x="${pad.l - 8}" y="${py + 3}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="end">${label}</text>`;
  }

  // Y-axis label
  svg += `<text x="14" y="${pad.t + plotH / 2}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,14,${pad.t + plotH / 2})">Odds Ratio (log scale)</text>`;

  // ── Left strip: personality ORs ──
  svg += `<text x="${pad.l + stripW / 2}" y="${pad.t - 8}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Personality</text>`;
  // Separator line
  svg += `<line x1="${pad.l + stripW + gapW / 2}" y1="${pad.t}" x2="${pad.l + stripW + gapW / 2}" y2="${pad.t + plotH}" stroke="#ddd" stroke-width="1" stroke-dasharray="4,3"/>`;

  // Jitter personality dots horizontally within the strip
  predicted.forEach((p, i) => {
    const logOR = Math.log10(Math.max(1e-10, p.combinedOR));
    const py = yScale(logOR);
    const jitter = (Math.random() - 0.5) * (stripW - 16);
    const px = pad.l + stripW / 2 + jitter;
    svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3" fill="${provColor}" fill-opacity="0.5" stroke="${provColor}" stroke-width="0.5"/>`;
  });

  // Personality IQR band
  const sortedPLogOR = [...personalityLogORs].sort((a, b) => a - b);
  const q1 = sortedPLogOR[Math.floor(sortedPLogOR.length * 0.25)];
  const q3 = sortedPLogOR[Math.floor(sortedPLogOR.length * 0.75)];
  const medP = sortedPLogOR[Math.floor(sortedPLogOR.length * 0.5)];
  svg += `<rect x="${pad.l + 4}" y="${yScale(q3)}" width="${stripW - 8}" height="${yScale(q1) - yScale(q3)}" fill="${provColor}" fill-opacity="0.08" stroke="${provColor}" stroke-width="0.5" stroke-opacity="0.3" rx="2"/>`;
  svg += `<line x1="${pad.l + 4}" y1="${yScale(medP)}" x2="${pad.l + stripW - 4}" y2="${yScale(medP)}" stroke="${provColor}" stroke-width="1.5" stroke-dasharray="3,2"/>`;

  // ── Right side: infection OR curve ──
  svg += `<text x="${curveL + plotW / 2}" y="${pad.t - 8}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Infection OR by Level</text>`;

  // X-axis ticks
  [0, 1, 2, 3, 4, 5, 6, 7].forEach(lv => {
    const px = xScale(lv);
    svg += `<text x="${px}" y="${pad.t + plotH + 16}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="middle">${lv}%</text>`;
  });
  svg += `<text x="${curveL + plotW / 2}" y="${H - 8}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle">Infection Level</text>`;

  // Draw infection curve
  let path = '';
  infLevels.forEach((lv, i) => {
    const px = xScale(lv);
    const py = yScale(infLogORs[i]);
    path += (i === 0 ? 'M' : 'L') + `${px.toFixed(1)},${py.toFixed(1)}`;
  });
  svg += `<path d="${path}" fill="none" stroke="#c00" stroke-width="2.5"/>`;

  // Draw horizontal bands showing personality IQR range across infection area
  svg += `<rect x="${curveL}" y="${yScale(q3)}" width="${plotW}" height="${yScale(q1) - yScale(q3)}" fill="${provColor}" fill-opacity="0.06" stroke="none"/>`;
  svg += `<line x1="${curveL}" y1="${yScale(medP)}" x2="${curveL + plotW}" y2="${yScale(medP)}" stroke="${provColor}" stroke-width="1" stroke-dasharray="3,2" opacity="0.4"/>`;

  // Legend
  const legY = pad.t + plotH - 50;
  svg += `<line x1="${curveL + 10}" y1="${legY}" x2="${curveL + 30}" y2="${legY}" stroke="#c00" stroke-width="2.5"/>`;
  svg += `<text x="${curveL + 34}" y="${legY + 3}" font-size="9" fill="#555" font-family="${SERIF}">Infection OR</text>`;
  svg += `<rect x="${curveL + 10}" y="${legY + 10}" width="20" height="8" fill="${provColor}" fill-opacity="0.15" stroke="${provColor}" stroke-width="0.5"/>`;
  svg += `<text x="${curveL + 34}" y="${legY + 17}" font-size="9" fill="#555" font-family="${SERIF}">Personality IQR</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;
}

// ── Fig 34: Fan Chart with Actual Data Overlay ───────────────
function renderFig34FanWithData(microRows, cfg, regData) {
  const el = document.getElementById('fig34-chart');
  if (!el) return;

  if (!regData || !regData.model2 || !regData.model2.coefficients) {
    el.innerHTML = '<div style="color:#999;padding:20px">No Model 2 regression data.</div>';
    return;
  }

  const coefs = regData.model2.coefficients;
  const agents = agentsData;
  if (!agents) return;

  const intercept = coefs.intercept ? coefs.intercept.estimate : 0;
  const bInf = coefs.infection_pct ? coefs.infection_pct.estimate : 0;
  const bInfSq = coefs.infection_pct_sq ? coefs.infection_pct_sq.estimate : 0;
  const logistic = x => 1 / (1 + Math.exp(-x));

  // Predicted curves (same as Fig 31)
  const predicted = computeAgentCombinedORs(agents, coefs);
  const levels = [];
  for (let lv = 0; lv <= 7; lv += 0.1) levels.push(Math.round(lv * 10) / 10);

  const agentCurves = predicted.map(p => ({
    ...p,
    points: levels.map(lv => ({
      level: lv,
      prob: logistic(intercept + p.logCombinedOR + bInf * lv + bInfSq * lv * lv),
    })),
  }));

  // Actual data: per-agent per-level stay-home rates
  const agentVotes = {};
  microRows.forEach(r => {
    const key = `${+r.agent_id}|${parseFloat(r.infection_level)}`;
    if (!agentVotes[key]) agentVotes[key] = { yes: 0, total: 0 };
    agentVotes[key].total++;
    if (r.response === 'yes') agentVotes[key].yes++;
  });

  // Layout
  const W = Math.min(el.parentElement?.offsetWidth || 860, 860);
  const H = 460;
  const pad = { t: 20, r: 30, b: 50, l: 60 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;

  const xScale = v => pad.l + (v / 7) * plotW;
  const yScale = v => pad.t + plotH - v * plotH;

  let svg = '';

  // Grid
  for (let y = 0; y <= 1; y += 0.25) {
    const py = yScale(y);
    svg += `<line x1="${pad.l}" y1="${py}" x2="${W - pad.r}" y2="${py}" stroke="#eee" stroke-width="0.5"/>`;
    svg += `<text x="${pad.l - 8}" y="${py + 3}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="end">${Math.round(y * 100)}%</text>`;
  }
  [0, 1, 2, 3, 4, 5, 6, 7].forEach(lv => {
    const px = xScale(lv);
    svg += `<line x1="${px}" y1="${pad.t}" x2="${px}" y2="${pad.t + plotH}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    svg += `<text x="${px}" y="${pad.t + plotH + 16}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="middle">${lv}%</text>`;
  });

  // 50% line
  const y50 = yScale(0.5);
  svg += `<line x1="${pad.l}" y1="${y50}" x2="${W - pad.r}" y2="${y50}" stroke="#999" stroke-width="1" stroke-dasharray="4,3"/>`;

  svg += `<text x="${pad.l + plotW / 2}" y="${H - 8}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle">Infection Level (% new cases)</text>`;
  svg += `<text x="14" y="${pad.t + plotH / 2}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,14,${pad.t + plotH / 2})">P(Stay Home)</text>`;

  // Sort agents for consistent coloring
  const sortedAgents = [...agentCurves].sort((a, b) => a.combinedOR - b.combinedOR);

  const colorScale = (idx, total) => {
    const t = idx / (total - 1);
    const r = Math.round(t < 0.5 ? 70 + t * 200 : 170 + (t - 0.5) * 170);
    const g = Math.round(t < 0.5 ? 130 + t * 100 : 180 - (t - 0.5) * 100);
    const b2 = Math.round(t < 0.5 ? 210 - t * 200 : 110 - (t - 0.5) * 80);
    return `rgb(${r},${g},${b2})`;
  };

  // Draw actual data as sized dots: at each (level, stayCount/5), dot radius = # agents
  // Aggregate: for each infection level, count how many agents got 0/5, 1/5, 2/5, 3/5, 4/5, 5/5
  const levelBuckets = {};
  CONFIG.INFECTION_LEVELS.forEach(lv => {
    const counts = [0, 0, 0, 0, 0, 0]; // index = # reps staying home (0-5)
    sortedAgents.forEach(ac => {
      const key = `${ac.agent_id}|${lv}`;
      const v = agentVotes[key];
      if (!v) { counts[0]++; return; }
      const stayCount = Math.round(v.yes); // 0-5
      counts[Math.min(5, Math.max(0, stayCount))]++;
    });
    levelBuckets[lv] = counts;
  });

  // Draw aggregated dots
  const maxAgents = 100;
  const rMin = 1.5, rMax = 8;
  CONFIG.INFECTION_LEVELS.forEach(lv => {
    const counts = levelBuckets[lv];
    counts.forEach((nAgents, stayCount) => {
      if (nAgents === 0) return;
      const rate = stayCount / 5;
      const px = xScale(lv);
      const py = yScale(rate);
      const r = rMin + (nAgents / maxAgents) * (rMax - rMin);
      const dotColor = stayCount <= 2 ? '#888' : '#e07020';
      svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r.toFixed(1)}" fill="${dotColor}" fill-opacity="0.35" stroke="${dotColor}" stroke-width="0.5" stroke-opacity="0.5"/>`;
      // Show count label for non-trivial groups
      if (nAgents >= 5) {
        svg += `<text x="${px.toFixed(1)}" y="${(py + 3).toFixed(1)}" font-size="7" fill="#333" font-family="${SERIF}" text-anchor="middle">${nAgents}</text>`;
      }
    });
  });

  // Draw predicted curves on top
  sortedAgents.forEach((ac, idx) => {
    const color = colorScale(idx, sortedAgents.length);
    let path = '';
    ac.points.forEach((p, i) => {
      const px = xScale(p.level);
      const py = yScale(p.prob);
      path += (i === 0 ? 'M' : 'L') + `${px.toFixed(1)},${py.toFixed(1)}`;
    });
    svg += `<path d="${path}" fill="none" stroke="${color}" stroke-width="1" opacity="0.5"/>`;
  });

  // Legend
  const legX = pad.l + plotW - 180, legY = pad.t + 8;
  svg += `<text x="${legX}" y="${legY}" font-size="9" fill="#555" font-family="${SERIF}" font-weight="bold">Agent personality (predicted curves)</text>`;
  for (let i = 0; i < 80; i++) {
    const color = colorScale(i, 80);
    svg += `<rect x="${legX + i}" y="${legY + 4}" width="1.5" height="8" fill="${color}"/>`;
  }
  svg += `<text x="${legX}" y="${legY + 22}" font-size="7" fill="#888" font-family="${SERIF}">Go-outers</text>`;
  svg += `<text x="${legX + 80}" y="${legY + 22}" font-size="7" fill="#888" font-family="${SERIF}" text-anchor="end">Stay-homers</text>`;
  // Dot size legend
  svg += `<text x="${legX}" y="${legY + 38}" font-size="9" fill="#555" font-family="${SERIF}" font-weight="bold">Actual data (dots = # agents)</text>`;
  [5, 20, 50].forEach((n, i) => {
    const r = rMin + (n / maxAgents) * (rMax - rMin);
    const cx = legX + 8 + i * 40;
    const cy = legY + 52;
    svg += `<circle cx="${cx}" cy="${cy}" r="${r.toFixed(1)}" fill="#888" fill-opacity="0.35" stroke="#888" stroke-width="0.5"/>`;
    svg += `<text x="${cx}" y="${cy + r + 10}" font-size="7" fill="#888" font-family="${SERIF}" text-anchor="middle">${n}</text>`;
  });
  svg += `<text x="${legX}" y="${legY + 72}" font-size="7" fill="#888" font-family="${SERIF}">Y = stay-home count out of 5 reps</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;
}

// ── Fig 35: Three Forces Log-Odds Budget ──────────────────────
function renderFig35ThreeForces(regData, cfg) {
  const el = document.getElementById('fig35-chart');
  if (!el) return;

  if (!regData || !regData.model2 || !regData.model2.coefficients) {
    el.innerHTML = '<div style="color:#999;padding:20px">No Model 2 regression data.</div>';
    return;
  }

  const coefs = regData.model2.coefficients;
  const agents = agentsData;
  if (!agents) return;

  const intercept = coefs.intercept ? coefs.intercept.estimate : 0;
  const bInf = coefs.infection_pct ? coefs.infection_pct.estimate : 0;
  const bInfSq = coefs.infection_pct_sq ? coefs.infection_pct_sq.estimate : 0;

  // Compute personality log-odds (natural log) per agent
  const predicted = computeAgentCombinedORs(agents, coefs);
  const persLogOdds = predicted.map(p => p.logCombinedOR);

  // Compute infection log-odds at levels
  const infLevels = [];
  for (let lv = 0; lv <= 7; lv += 0.2) infLevels.push(Math.round(lv * 10) / 10);
  const infLogOdds = infLevels.map(lv => bInf * lv + bInfSq * lv * lv);

  // Required infection threshold per agent: -(intercept + personalityLogOR)
  const thresholds = persLogOdds.map(p => -(intercept + p));

  // Provider color
  const provColor = CONFIG.PROVIDER_COLORS[cfg.provider] || '#888';

  // Layout
  const W = Math.min(el.parentElement?.offsetWidth || 860, 860);
  const H = 520;
  const pad = { t: 35, r: 30, b: 55, l: 80 };
  const col1W = 40, col2W = 80, gap = 14;
  const curveL = pad.l + col1W + gap + col2W + gap;
  const curveW = W - pad.r - curveL;
  const plotH = H - pad.t - pad.b;

  // Y-axis range: encompass intercept, personality range, infection range, thresholds
  const allVals = [intercept, ...persLogOdds, ...infLogOdds, ...thresholds];
  let yMin = Math.min(...allVals) - 1;
  let yMax = Math.max(...allVals) + 1;
  // Ensure zero is visible
  if (yMin > -1) yMin = -1;
  if (yMax < 1) yMax = 1;
  // Round to nice values
  yMin = Math.floor(yMin);
  yMax = Math.ceil(yMax);

  const yScale = v => pad.t + plotH * (1 - (v - yMin) / (yMax - yMin));
  const xScale = lv => curveL + (lv / 7) * curveW;

  // Probability from log-odds
  const logOddsToProb = lo => 1 / (1 + Math.exp(-lo));

  let svg = '';

  // Y-axis grid + labels (dual: log-odds + probability)
  for (let v = yMin; v <= yMax; v += 2) {
    const py = yScale(v);
    svg += `<line x1="${pad.l}" y1="${py}" x2="${W - pad.r}" y2="${py}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    const prob = logOddsToProb(v);
    const probStr = prob < 0.01 ? '<1%' : prob > 0.99 ? '>99%' : Math.round(prob * 100) + '%';
    svg += `<text x="${pad.l - 6}" y="${py + 3}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="end">${v}</text>`;
    svg += `<text x="${pad.l - 38}" y="${py + 3}" font-size="8" fill="#aaa" font-family="${SERIF}" text-anchor="end">(${probStr})</text>`;
  }

  // Zero line (decision boundary)
  const y0 = yScale(0);
  svg += `<line x1="${pad.l}" y1="${y0}" x2="${W - pad.r}" y2="${y0}" stroke="#333" stroke-width="1.5" stroke-dasharray="6,3"/>`;
  svg += `<text x="${W - pad.r + 4}" y="${y0 + 3}" font-size="8" fill="#333" font-family="${SERIF}" font-weight="bold">50%</text>`;

  // Y-axis label
  svg += `<text x="12" y="${pad.t + plotH / 2}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,12,${pad.t + plotH / 2})">Log-odds (probability)</text>`;

  // Column headers
  svg += `<text x="${pad.l + col1W / 2}" y="${pad.t - 10}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Intercept</text>`;
  svg += `<text x="${pad.l + col1W + gap + col2W / 2}" y="${pad.t - 10}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Personality</text>`;
  svg += `<text x="${curveL + curveW / 2}" y="${pad.t - 10}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Infection Log-Odds by Level</text>`;

  // Separator lines between columns
  const sepX1 = pad.l + col1W + gap / 2;
  const sepX2 = pad.l + col1W + gap + col2W + gap / 2;
  svg += `<line x1="${sepX1}" y1="${pad.t}" x2="${sepX1}" y2="${pad.t + plotH}" stroke="#ddd" stroke-width="1" stroke-dasharray="3,3"/>`;
  svg += `<line x1="${sepX2}" y1="${pad.t}" x2="${sepX2}" y2="${pad.t + plotH}" stroke="#ddd" stroke-width="1" stroke-dasharray="3,3"/>`;

  // ── Column 1: Intercept bar ──
  const intY = yScale(intercept);
  svg += `<rect x="${pad.l + 4}" y="${Math.min(intY, y0)}" width="${col1W - 8}" height="${Math.abs(intY - y0)}" fill="#444" fill-opacity="0.2" rx="2"/>`;
  svg += `<line x1="${pad.l + 2}" y1="${intY}" x2="${pad.l + col1W - 2}" y2="${intY}" stroke="#444" stroke-width="2.5"/>`;
  svg += `<text x="${pad.l + col1W / 2}" y="${intY + (intercept < 0 ? 14 : -6)}" font-size="8" fill="#444" font-family="${SERIF}" text-anchor="middle" font-weight="bold">${intercept.toFixed(1)}</text>`;

  // ── Column 2: Personality dots ──
  const col2L = pad.l + col1W + gap;
  const sortedPers = [...persLogOdds].sort((a, b) => a - b);
  const q1 = sortedPers[Math.floor(sortedPers.length * 0.25)];
  const q3 = sortedPers[Math.floor(sortedPers.length * 0.75)];
  const med = sortedPers[Math.floor(sortedPers.length * 0.5)];

  // IQR band
  svg += `<rect x="${col2L + 4}" y="${yScale(q3)}" width="${col2W - 8}" height="${yScale(q1) - yScale(q3)}" fill="${provColor}" fill-opacity="0.08" stroke="${provColor}" stroke-width="0.5" stroke-opacity="0.3" rx="2"/>`;
  svg += `<line x1="${col2L + 4}" y1="${yScale(med)}" x2="${col2L + col2W - 4}" y2="${yScale(med)}" stroke="${provColor}" stroke-width="1.5" stroke-dasharray="3,2"/>`;

  // Dots
  predicted.forEach(p => {
    const py = yScale(p.logCombinedOR);
    const jitter = (Math.random() - 0.5) * (col2W - 16);
    const px = col2L + col2W / 2 + jitter;
    svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3" fill="${provColor}" fill-opacity="0.5" stroke="${provColor}" stroke-width="0.5"/>`;
  });

  // ── Column 3: Infection curve + required-infection band ──
  // X-axis ticks
  [0, 1, 2, 3, 4, 5, 6, 7].forEach(lv => {
    const px = xScale(lv);
    svg += `<text x="${px}" y="${pad.t + plotH + 16}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="middle">${lv}%</text>`;
  });
  svg += `<text x="${curveL + curveW / 2}" y="${H - 8}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle">Infection Level</text>`;

  // Required infection band (IQR of thresholds)
  const sortedThresh = [...thresholds].sort((a, b) => a - b);
  const tQ1 = sortedThresh[Math.floor(sortedThresh.length * 0.25)];
  const tQ3 = sortedThresh[Math.floor(sortedThresh.length * 0.75)];
  const tMin = sortedThresh[0];
  const tMax = sortedThresh[sortedThresh.length - 1];
  // Full range band (faint)
  const bandTop = Math.min(yScale(tMax), yScale(yMax));
  const bandBot = Math.max(yScale(tMin), yScale(yMin));
  svg += `<rect x="${curveL}" y="${yScale(Math.min(tMax, yMax))}" width="${curveW}" height="${yScale(Math.max(tMin, yMin)) - yScale(Math.min(tMax, yMax))}" fill="${provColor}" fill-opacity="0.04" stroke="none"/>`;
  // IQR band (more visible)
  svg += `<rect x="${curveL}" y="${yScale(tQ3)}" width="${curveW}" height="${yScale(tQ1) - yScale(tQ3)}" fill="${provColor}" fill-opacity="0.1" stroke="${provColor}" stroke-width="0.5" stroke-opacity="0.2"/>`;
  // Median threshold line
  const tMed = sortedThresh[Math.floor(sortedThresh.length * 0.5)];
  svg += `<line x1="${curveL}" y1="${yScale(tMed)}" x2="${curveL + curveW}" y2="${yScale(tMed)}" stroke="${provColor}" stroke-width="1" stroke-dasharray="3,2" opacity="0.5"/>`;

  // Infection curve
  let path = '';
  infLevels.forEach((lv, i) => {
    const px = xScale(lv);
    const py = yScale(infLogOdds[i]);
    path += (i === 0 ? 'M' : 'L') + `${px.toFixed(1)},${py.toFixed(1)}`;
  });
  svg += `<path d="${path}" fill="none" stroke="#c00" stroke-width="2.5"/>`;

  // Legend
  const legY = pad.t + plotH - 70;
  svg += `<line x1="${curveL + 10}" y1="${legY}" x2="${curveL + 30}" y2="${legY}" stroke="#c00" stroke-width="2.5"/>`;
  svg += `<text x="${curveL + 34}" y="${legY + 3}" font-size="9" fill="#555" font-family="${SERIF}">Infection log-odds</text>`;
  svg += `<rect x="${curveL + 10}" y="${legY + 12}" width="20" height="8" fill="${provColor}" fill-opacity="0.15" stroke="${provColor}" stroke-width="0.5"/>`;
  svg += `<text x="${curveL + 34}" y="${legY + 19}" font-size="9" fill="#555" font-family="${SERIF}">Required infection IQR</text>`;
  svg += `<line x1="${curveL + 10}" y1="${legY + 28}" x2="${curveL + 30}" y2="${legY + 28}" stroke="#333" stroke-width="1.5" stroke-dasharray="6,3"/>`;
  svg += `<text x="${curveL + 34}" y="${legY + 31}" font-size="9" fill="#555" font-family="${SERIF}">50% decision boundary</text>`;

  // Annotation: where curve enters/exits the IQR band
  const crossQ1Lv = infLevels.find((lv, i) => infLogOdds[i] >= tQ1);
  const crossQ3Lv = infLevels.find((lv, i) => infLogOdds[i] >= tQ3);
  if (crossQ1Lv != null) {
    const px = xScale(crossQ1Lv);
    svg += `<line x1="${px}" y1="${yScale(tQ1) - 5}" x2="${px}" y2="${yScale(tQ1) + 5}" stroke="${provColor}" stroke-width="1.5"/>`;
    svg += `<text x="${px}" y="${yScale(tQ1) - 8}" font-size="7" fill="${provColor}" font-family="${SERIF}" text-anchor="middle">${crossQ1Lv.toFixed(1)}%</text>`;
  }
  if (crossQ3Lv != null && crossQ3Lv !== crossQ1Lv) {
    const px = xScale(crossQ3Lv);
    svg += `<line x1="${px}" y1="${yScale(tQ3) - 5}" x2="${px}" y2="${yScale(tQ3) + 5}" stroke="${provColor}" stroke-width="1.5"/>`;
    svg += `<text x="${px}" y="${yScale(tQ3) - 8}" font-size="7" fill="${provColor}" font-family="${SERIF}" text-anchor="middle">${crossQ3Lv.toFixed(1)}%</text>`;
  }

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;
}

// ── Fig 36: Agent Crossover Explorer ──────────────────────────
function computeCrossovers(agents, coefs) {
  const intercept = coefs.intercept ? coefs.intercept.estimate : 0;
  const bInf = coefs.infection_pct ? coefs.infection_pct.estimate : 0;
  const bInfSq = coefs.infection_pct_sq ? coefs.infection_pct_sq.estimate : 0;
  const predicted = computeAgentCombinedORs(agents, coefs);
  const logistic = x => 1 / (1 + Math.exp(-x));

  return predicted.map(p => {
    // Find predicted crossover: where logistic(intercept + logOR + bInf*lv + bInfSq*lv²) = 0.5
    // Equivalent: intercept + logOR + bInf*lv + bInfSq*lv² = 0
    const c = intercept + p.logCombinedOR;
    let crossover = null;
    // Check if already above 50% at level 0
    if (c >= 0) {
      crossover = 0;
    } else {
      // Numeric search in 0.01 increments
      for (let lv = 0.01; lv <= 7; lv += 0.01) {
        const val = c + bInf * lv + bInfSq * lv * lv;
        if (val >= 0) { crossover = Math.round(lv * 100) / 100; break; }
      }
    }
    return { ...p, predictedCrossover: crossover }; // null = never crosses
  });
}

function computeActualCrossovers(agents, microRows) {
  const results = {};
  // Aggregate per agent per level
  const agentVotes = {};
  microRows.forEach(r => {
    const key = `${+r.agent_id}|${parseFloat(r.infection_level)}`;
    if (!agentVotes[key]) agentVotes[key] = { yes: 0, total: 0 };
    agentVotes[key].total++;
    if (r.response === 'yes') agentVotes[key].yes++;
  });

  agents.forEach(a => {
    let crossover = null;
    for (const lv of CONFIG.INFECTION_LEVELS) {
      const key = `${a.agent_id}|${lv}`;
      const v = agentVotes[key];
      if (v && v.yes >= 3) { crossover = lv; break; }
    }
    results[a.agent_id] = { actualCrossover: crossover, votes: agentVotes };
  });
  return results;
}

// ── Fig 36: Agent Decision Waterfall ──────────────────────────
function renderFig36Waterfall(microRows, cfg, regData) {
  const el = document.getElementById('fig36-chart');
  const detailEl = document.getElementById('fig36-detail');
  if (!el) return;

  if (!regData || !regData.model2 || !regData.model2.coefficients) {
    el.innerHTML = '<div style="color:#999;padding:20px">No Model 2 regression data.</div>';
    return;
  }

  const coefs = regData.model2.coefficients;
  const agents = agentsData;
  if (!agents) return;

  const intercept = coefs.intercept ? coefs.intercept.estimate : 0;
  const bInf = coefs.infection_pct ? coefs.infection_pct.estimate : 0;
  const bInfSq = coefs.infection_pct_sq ? coefs.infection_pct_sq.estimate : 0;
  const provColor = CONFIG.PROVIDER_COLORS[cfg.provider] || '#888';

  // Compute personality log-odds per agent
  const predicted = computeAgentCombinedORs(agents, coefs);
  // Starting position = intercept + personality
  const startPositions = predicted.map(p => ({ ...p, startPos: intercept + p.logCombinedOR }));

  // Crossovers for annotations
  const crossovers = computeCrossovers(agents, coefs);
  const actuals = computeActualCrossovers(agents, microRows);

  // Layout
  const W = Math.min(el.parentElement?.offsetWidth || 860, 860);
  const H = 420;
  const pad = { t: 35, r: 30, b: 55, l: 80 };
  const dotColW = 140;
  const gap = 14;
  const curveL = pad.l + dotColW + gap;
  const curveW = W - pad.r - curveL;
  const plotH = H - pad.t - pad.b;

  // Y-axis range
  const allStarts = startPositions.map(s => s.startPos);
  // Also consider the max total log-odds at 7% infection
  const maxInf = bInf * 7 + bInfSq * 49;
  const allVals = [...allStarts, ...allStarts.map(s => s + maxInf)];
  let yMin = Math.min(...allVals) - 1;
  let yMax = Math.max(...allVals) + 1;
  if (yMin > -1) yMin = -1;
  if (yMax < 1) yMax = 1;
  yMin = Math.floor(yMin);
  yMax = Math.ceil(yMax);

  const yScale = v => pad.t + plotH * (1 - (v - yMin) / (yMax - yMin));
  const xScale = lv => curveL + (lv / 7) * curveW;
  const logOddsToProb = lo => 1 / (1 + Math.exp(-lo));

  let svg = '';

  // Y-axis grid + dual labels
  for (let v = yMin; v <= yMax; v += 2) {
    const py = yScale(v);
    svg += `<line x1="${pad.l}" y1="${py}" x2="${W - pad.r}" y2="${py}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    const prob = logOddsToProb(v);
    const probStr = prob < 0.01 ? '<1%' : prob > 0.99 ? '>99%' : Math.round(prob * 100) + '%';
    svg += `<text x="${pad.l - 6}" y="${py + 3}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="end">${v}</text>`;
    svg += `<text x="${pad.l - 38}" y="${py + 3}" font-size="8" fill="#aaa" font-family="${SERIF}" text-anchor="end">(${probStr})</text>`;
  }

  // Zero line (decision boundary)
  const y0 = yScale(0);
  svg += `<line x1="${pad.l}" y1="${y0}" x2="${W - pad.r}" y2="${y0}" stroke="#333" stroke-width="1.5" stroke-dasharray="6,3"/>`;
  svg += `<text x="${W - pad.r + 4}" y="${y0 + 3}" font-size="8" fill="#333" font-family="${SERIF}" font-weight="bold">50%</text>`;

  // Y-axis label
  svg += `<text x="12" y="${pad.t + plotH / 2}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,12,${pad.t + plotH / 2})">Log-odds (probability)</text>`;

  // Column headers
  svg += `<text x="${pad.l + dotColW / 2}" y="${pad.t - 10}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Starting Position</text>`;
  svg += `<text x="${pad.l + dotColW / 2}" y="${pad.t - 1}" font-size="7" fill="#999" font-family="${SERIF}" text-anchor="middle">(intercept + personality)</text>`;
  svg += `<text x="${curveL + curveW / 2}" y="${pad.t - 10}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Total Log-Odds as Infection Rises</text>`;

  // Separator
  const sepX = pad.l + dotColW + gap / 2;
  svg += `<line x1="${sepX}" y1="${pad.t}" x2="${sepX}" y2="${pad.t + plotH}" stroke="#ddd" stroke-width="1" stroke-dasharray="3,3"/>`;

  // Deterministic jitter function (stable across re-renders)
  const jitterFor = (i) => ((Math.abs(Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1) - 0.5) * (dotColW - 24);

  // ── Left panel: Starting position dots ──
  // IQR band (behind dots)
  const sortedStarts = [...allStarts].sort((a, b) => a - b);
  const q1 = sortedStarts[Math.floor(sortedStarts.length * 0.25)];
  const q3 = sortedStarts[Math.floor(sortedStarts.length * 0.75)];
  const med = sortedStarts[Math.floor(sortedStarts.length * 0.5)];

  svg += `<rect x="${pad.l + 8}" y="${yScale(q3)}" width="${dotColW - 16}" height="${yScale(q1) - yScale(q3)}" fill="${provColor}" fill-opacity="0.08" stroke="${provColor}" stroke-width="0.5" stroke-opacity="0.3" rx="2"/>`;
  svg += `<line x1="${pad.l + 8}" y1="${yScale(med)}" x2="${pad.l + dotColW - 8}" y2="${yScale(med)}" stroke="${provColor}" stroke-width="1.5" stroke-dasharray="3,2"/>`;
  // IQR label
  svg += `<text x="${pad.l + dotColW - 6}" y="${yScale(q1) + 12}" font-size="7" fill="${provColor}" font-family="${SERIF}" text-anchor="end" opacity="0.5">IQR</text>`;

  // Dots (clickable, deterministic positions)
  startPositions.forEach((sp, i) => {
    const py = yScale(sp.startPos);
    const jx = jitterFor(i);
    const px = pad.l + dotColW / 2 + jx;
    svg += `<circle class="fig36w-dot" data-agent-idx="${i}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="${provColor}" fill-opacity="0.5" stroke="${provColor}" stroke-width="0.7" style="cursor:pointer"/>`;
  });

  // Intercept marker (rendered on top of dots for visibility)
  const intY = yScale(intercept);
  svg += `<line x1="${pad.l + 4}" y1="${intY}" x2="${pad.l + dotColW - 4}" y2="${intY}" stroke="#333" stroke-width="2.5" stroke-dasharray="5,2"/>`;
  svg += `<text x="${pad.l + dotColW / 2}" y="${intY - 6}" font-size="8" fill="#333" font-family="${SERIF}" text-anchor="middle" font-weight="bold" style="paint-order:stroke" stroke="white" stroke-width="3">Intercept: ${intercept.toFixed(1)}</text>`;

  // ── Right panel: All 100 total log-odds curves (faint, clickable) ──
  // X-axis ticks
  [0, 1, 2, 3, 4, 5, 6, 7].forEach(lv => {
    const px = xScale(lv);
    svg += `<text x="${px}" y="${pad.t + plotH + 16}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="middle">${lv}%</text>`;
  });
  svg += `<text x="${curveL + curveW / 2}" y="${H - 8}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle">Infection Level</text>`;

  // Faint curves for all agents (clickable)
  const levels = [];
  for (let lv = 0; lv <= 7; lv += 0.2) levels.push(Math.round(lv * 10) / 10);

  startPositions.forEach((sp, i) => {
    let path = '';
    levels.forEach((lv, j) => {
      const total = sp.startPos + bInf * lv + bInfSq * lv * lv;
      const px = xScale(lv);
      const py = yScale(total);
      const clampedY = Math.max(pad.t, Math.min(pad.t + plotH, py));
      path += (j === 0 ? 'M' : 'L') + `${px.toFixed(1)},${clampedY.toFixed(1)}`;
    });
    // Invisible fat hit zone
    svg += `<path class="fig36w-curve" data-agent-idx="${i}" d="${path}" fill="none" stroke="transparent" stroke-width="8" style="cursor:pointer;pointer-events:stroke"/>`;
    // Visible thin curve
    svg += `<path d="${path}" fill="none" stroke="${provColor}" stroke-width="0.6" opacity="0.12" pointer-events="none"/>`;
  });

  // Legend (bottom-right of curve panel)
  const legY = pad.t + plotH - 60;
  const legR = curveL + curveW - 10;
  svg += `<line x1="${legR - 230}" y1="${legY}" x2="${legR - 210}" y2="${legY}" stroke="#333" stroke-width="1.5" stroke-dasharray="6,3"/>`;
  svg += `<text x="${legR - 206}" y="${legY + 3}" font-size="9" fill="#555" font-family="${SERIF}">50% decision boundary</text>`;
  svg += `<line x1="${legR - 230}" y1="${legY + 14}" x2="${legR - 210}" y2="${legY + 14}" stroke="${provColor}" stroke-width="2.5"/>`;
  svg += `<text x="${legR - 206}" y="${legY + 17}" font-size="9" fill="#555" font-family="${SERIF}">Selected agent's total log-odds</text>`;
  svg += `<line x1="${legR - 230}" y1="${legY + 28}" x2="${legR - 210}" y2="${legY + 28}" stroke="#333" stroke-width="2.5" stroke-dasharray="5,2"/>`;
  svg += `<text x="${legR - 206}" y="${legY + 31}" font-size="9" fill="#555" font-family="${SERIF}">Intercept (baseline for all agents)</text>`;
  svg += `<rect x="${legR - 230}" y="${legY + 38}" width="20" height="10" fill="${provColor}" fill-opacity="0.08" stroke="${provColor}" stroke-width="0.5" stroke-opacity="0.3" rx="1"/>`;
  svg += `<text x="${legR - 206}" y="${legY + 47}" font-size="9" fill="#555" font-family="${SERIF}">IQR — middle 50% of starting positions</text>`;
  svg += `<text x="${legR - 230}" y="${legY + 62}" font-size="8" fill="#999" font-family="${SERIF}" font-style="italic">Click a dot or curve to explore</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;

  // Store state for detail panel cross-references
  el._fig36WaterfallState = { W, H, pad, dotColW, gap, curveL, curveW, plotH, yMin, yMax, yScale, xScale, levels, provColor, bInf, bInfSq, intercept, actuals };

  // Clear detail
  if (detailEl) { detailEl.style.display = 'none'; detailEl.innerHTML = ''; }

  // Click handler for dots AND curves
  const handleClick = (idx) => {
    const sp = startPositions[idx];
    const cross = crossovers[idx];
    renderFig36WaterfallHighlight(el, sp, startPositions, cross, actuals, microRows, cfg, regData, W, H, pad, dotColW, gap, curveL, curveW, plotH, yMin, yMax, yScale, xScale, levels, provColor, bInf, bInfSq, intercept);
  };
  el.querySelectorAll('.fig36w-dot').forEach(dot => {
    dot.addEventListener('click', () => handleClick(+dot.dataset.agentIdx));
  });
  el.querySelectorAll('.fig36w-curve').forEach(curve => {
    curve.addEventListener('click', () => handleClick(+curve.dataset.agentIdx));
  });
}

function renderFig36WaterfallHighlight(el, agent, allAgents, crossover, actuals, microRows, cfg, regData, W, H, pad, dotColW, gap, curveL, curveW, plotH, yMin, yMax, yScale, xScale, levels, provColor, bInf, bInfSq, intercept) {
  const detailEl = document.getElementById('fig36-detail');
  const logOddsToProb = lo => 1 / (1 + Math.exp(-lo));

  let svg = '';

  // Y-axis grid + dual labels
  for (let v = yMin; v <= yMax; v += 2) {
    const py = yScale(v);
    svg += `<line x1="${pad.l}" y1="${py}" x2="${W - pad.r}" y2="${py}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    const prob = logOddsToProb(v);
    const probStr = prob < 0.01 ? '<1%' : prob > 0.99 ? '>99%' : Math.round(prob * 100) + '%';
    svg += `<text x="${pad.l - 6}" y="${py + 3}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="end">${v}</text>`;
    svg += `<text x="${pad.l - 38}" y="${py + 3}" font-size="8" fill="#aaa" font-family="${SERIF}" text-anchor="end">(${probStr})</text>`;
  }

  // Zero line
  const y0 = yScale(0);
  svg += `<line x1="${pad.l}" y1="${y0}" x2="${W - pad.r}" y2="${y0}" stroke="#333" stroke-width="1.5" stroke-dasharray="6,3"/>`;
  svg += `<text x="${W - pad.r + 4}" y="${y0 + 3}" font-size="8" fill="#333" font-family="${SERIF}" font-weight="bold">50%</text>`;

  // Y-axis label
  svg += `<text x="12" y="${pad.t + plotH / 2}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,12,${pad.t + plotH / 2})">Log-odds (probability)</text>`;

  // Column headers
  svg += `<text x="${pad.l + dotColW / 2}" y="${pad.t - 10}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Starting Position</text>`;
  svg += `<text x="${pad.l + dotColW / 2}" y="${pad.t - 1}" font-size="7" fill="#999" font-family="${SERIF}" text-anchor="middle">(intercept + personality)</text>`;
  svg += `<text x="${curveL + curveW / 2}" y="${pad.t - 10}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Total Log-Odds as Infection Rises</text>`;

  // Separator
  const sepX = pad.l + dotColW + gap / 2;
  svg += `<line x1="${sepX}" y1="${pad.t}" x2="${sepX}" y2="${pad.t + plotH}" stroke="#ddd" stroke-width="1" stroke-dasharray="3,3"/>`;

  // ── Left panel: All dots (dimmed) + selected highlighted ──
  const sortedStarts = allAgents.map(s => s.startPos).sort((a, b) => a - b);
  const q1 = sortedStarts[Math.floor(sortedStarts.length * 0.25)];
  const q3 = sortedStarts[Math.floor(sortedStarts.length * 0.75)];
  const med = sortedStarts[Math.floor(sortedStarts.length * 0.5)];

  // IQR band (behind dots)
  svg += `<rect x="${pad.l + 8}" y="${yScale(q3)}" width="${dotColW - 16}" height="${yScale(q1) - yScale(q3)}" fill="${provColor}" fill-opacity="0.06" stroke="${provColor}" stroke-width="0.5" stroke-opacity="0.2" rx="2"/>`;
  svg += `<line x1="${pad.l + 8}" y1="${yScale(med)}" x2="${pad.l + dotColW - 8}" y2="${yScale(med)}" stroke="${provColor}" stroke-width="1" stroke-dasharray="3,2" opacity="0.5"/>`;
  // IQR label
  svg += `<text x="${pad.l + dotColW - 6}" y="${yScale(q1) + 12}" font-size="7" fill="${provColor}" font-family="${SERIF}" text-anchor="end" opacity="0.5">IQR</text>`;

  // Deterministic jitter (same hash as initial render)
  const jitterFor = (i) => ((Math.abs(Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1) - 0.5) * (dotColW - 24);

  // Dimmed dots
  allAgents.forEach((sp, i) => {
    const py = yScale(sp.startPos);
    const px = pad.l + dotColW / 2 + jitterFor(i);
    const isSelected = sp.agent_id === agent.agent_id;
    if (!isSelected) {
      svg += `<circle class="fig36w-dot" data-agent-idx="${i}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3" fill="${provColor}" fill-opacity="0.2" stroke="${provColor}" stroke-width="0.5" style="cursor:pointer"/>`;
    }
  });

  // Selected dot (on top, large)
  const selIdx = allAgents.findIndex(a => a.agent_id === agent.agent_id);
  const selY = yScale(agent.startPos);
  const selX = pad.l + dotColW / 2 + jitterFor(selIdx);
  svg += `<circle class="fig36w-dot" data-agent-idx="${selIdx}" cx="${selX.toFixed(1)}" cy="${selY.toFixed(1)}" r="6" fill="${provColor}" fill-opacity="1" stroke="${provColor}" stroke-width="2.5" style="cursor:pointer"/>`;

  // Intercept marker (on top of dots for readability)
  const intY = yScale(intercept);
  svg += `<line x1="${pad.l + 4}" y1="${intY}" x2="${pad.l + dotColW - 4}" y2="${intY}" stroke="#333" stroke-width="2.5" stroke-dasharray="5,2"/>`;
  svg += `<text x="${pad.l + dotColW / 2}" y="${intY - 6}" font-size="8" fill="#333" font-family="${SERIF}" text-anchor="middle" font-weight="bold" style="paint-order:stroke" stroke="white" stroke-width="3">Intercept: ${intercept.toFixed(1)}</text>`;

  // ── Right panel: Faint curves (all) + highlighted curve (selected) ──
  // X-axis ticks
  [0, 1, 2, 3, 4, 5, 6, 7].forEach(lv => {
    const px = xScale(lv);
    svg += `<text x="${px}" y="${pad.t + plotH + 16}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="middle">${lv}%</text>`;
  });
  svg += `<text x="${curveL + curveW / 2}" y="${H - 8}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle">Infection Level</text>`;

  // Faint curves (with invisible hit zones for clicking)
  allAgents.forEach((sp, i) => {
    if (sp.agent_id === agent.agent_id) return;
    let path = '';
    levels.forEach((lv, j) => {
      const total = sp.startPos + bInf * lv + bInfSq * lv * lv;
      const px = xScale(lv);
      const py = Math.max(pad.t, Math.min(pad.t + plotH, yScale(total)));
      path += (j === 0 ? 'M' : 'L') + `${px.toFixed(1)},${py.toFixed(1)}`;
    });
    // Invisible fat hit zone
    svg += `<path class="fig36w-curve" data-agent-idx="${i}" d="${path}" fill="none" stroke="transparent" stroke-width="8" style="cursor:pointer;pointer-events:stroke"/>`;
    // Visible thin curve
    svg += `<path d="${path}" fill="none" stroke="${provColor}" stroke-width="0.6" opacity="0.12" pointer-events="none"/>`;
  });

  // Starting position horizontal line
  svg += `<line x1="${selX.toFixed(1)}" y1="${selY.toFixed(1)}" x2="${xScale(0)}" y2="${selY.toFixed(1)}" stroke="${provColor}" stroke-width="1" stroke-dasharray="3,2" opacity="0.6"/>`;

  // Selected agent's total log-odds curve (highlighted)
  let agentPath = '';
  levels.forEach((lv, j) => {
    const total = agent.startPos + bInf * lv + bInfSq * lv * lv;
    const px = xScale(lv);
    const py = Math.max(pad.t, Math.min(pad.t + plotH, yScale(total)));
    agentPath += (j === 0 ? 'M' : 'L') + `${px.toFixed(1)},${py.toFixed(1)}`;
  });
  svg += `<path d="${agentPath}" fill="none" stroke="${provColor}" stroke-width="2.5"/>`;

  // Crossover annotation
  if (crossover.predictedCrossover != null) {
    const crossLv = crossover.predictedCrossover;
    const px = xScale(crossLv);
    svg += `<line x1="${px}" y1="${pad.t}" x2="${px}" y2="${pad.t + plotH}" stroke="${provColor}" stroke-width="1.5" stroke-dasharray="5,3"/>`;
    svg += `<text x="${px}" y="${pad.t - 4}" font-size="8" fill="${provColor}" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Crossover: ${crossLv.toFixed(1)}%</text>`;
    // Dot at crossover
    svg += `<circle cx="${px}" cy="${y0}" r="4" fill="${provColor}" stroke="white" stroke-width="1.5"/>`;
  } else {
    svg += `<text x="${curveL + curveW - 10}" y="${pad.t + 16}" font-size="9" fill="#999" font-family="${SERIF}" text-anchor="end" font-style="italic">Never reaches 50%</text>`;
  }

  // Starting position annotation (with white halo for readability, drawn after curve)
  const startProb = logOddsToProb(agent.startPos);
  const startProbStr = startProb < 0.01 ? '<1%' : startProb > 0.99 ? '>99%' : Math.round(startProb * 100) + '%';
  svg += `<text x="${xScale(0) + 4}" y="${selY - 8}" font-size="8" fill="${provColor}" font-family="${SERIF}" style="paint-order:stroke" stroke="white" stroke-width="3">Start: ${agent.startPos.toFixed(1)} (${startProbStr})</text>`;

  // Legend (bottom-right of curve panel)
  const legY = pad.t + plotH - 60;
  const legR = curveL + curveW - 10;
  svg += `<line x1="${legR - 230}" y1="${legY}" x2="${legR - 210}" y2="${legY}" stroke="#333" stroke-width="1.5" stroke-dasharray="6,3"/>`;
  svg += `<text x="${legR - 206}" y="${legY + 3}" font-size="9" fill="#555" font-family="${SERIF}">50% decision boundary</text>`;
  svg += `<line x1="${legR - 230}" y1="${legY + 14}" x2="${legR - 210}" y2="${legY + 14}" stroke="${provColor}" stroke-width="2.5"/>`;
  svg += `<text x="${legR - 206}" y="${legY + 17}" font-size="9" fill="#555" font-family="${SERIF}">Selected agent's total log-odds</text>`;
  svg += `<line x1="${legR - 230}" y1="${legY + 28}" x2="${legR - 210}" y2="${legY + 28}" stroke="#333" stroke-width="2.5" stroke-dasharray="5,2"/>`;
  svg += `<text x="${legR - 206}" y="${legY + 31}" font-size="9" fill="#555" font-family="${SERIF}">Intercept (baseline for all agents)</text>`;
  svg += `<rect x="${legR - 230}" y="${legY + 38}" width="20" height="10" fill="${provColor}" fill-opacity="0.08" stroke="${provColor}" stroke-width="0.5" stroke-opacity="0.3" rx="1"/>`;
  svg += `<text x="${legR - 206}" y="${legY + 47}" font-size="9" fill="#555" font-family="${SERIF}">IQR — middle 50% of starting positions</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;

  // Re-attach click handlers (dots + curves)
  const clickHandler = (idx) => {
    const sp = allAgents[idx];
    const cross = computeCrossovers(agentsData, regData.model2.coefficients)[idx];
    renderFig36WaterfallHighlight(el, sp, allAgents, cross, actuals, microRows, cfg, regData, W, H, pad, dotColW, gap, curveL, curveW, plotH, yMin, yMax, yScale, xScale, levels, provColor, bInf, bInfSq, intercept);
  };
  el.querySelectorAll('.fig36w-dot').forEach(dot => {
    dot.addEventListener('click', () => clickHandler(+dot.dataset.agentIdx));
  });
  el.querySelectorAll('.fig36w-curve').forEach(curve => {
    curve.addEventListener('click', () => clickHandler(+curve.dataset.agentIdx));
  });

  // Show detail panel below
  if (detailEl) {
    detailEl.style.display = 'block';
    renderFig36WaterfallDetail(agent, crossover, allAgents, actuals, microRows, cfg, regData, detailEl);
  }
}

function renderFig36WaterfallDetail(agent, crossover, allAgents, actuals, microRows, cfg, regData, detailEl, onAgentClick) {
  const coefs = regData.model2.coefficients;
  const intercept = coefs.intercept ? coefs.intercept.estimate : 0;
  const bInf = coefs.infection_pct ? coefs.infection_pct.estimate : 0;
  const bInfSq = coefs.infection_pct_sq ? coefs.infection_pct_sq.estimate : 0;
  const logistic = x => 1 / (1 + Math.exp(-x));
  const provColor = CONFIG.PROVIDER_COLORS[cfg.provider] || '#888';

  // ── Left: S-curve on probability scale ──
  const W = 560, H = 360;
  const pad = { t: 20, r: 20, b: 45, l: 50 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const xScale = v => pad.l + (v / 7) * plotW;
  const yScale = v => pad.t + plotH - v * plotH;

  let svg = '';

  // Grid
  for (let y = 0; y <= 1; y += 0.25) {
    const py = yScale(y);
    svg += `<line x1="${pad.l}" y1="${py}" x2="${W - pad.r}" y2="${py}" stroke="#eee" stroke-width="0.5"/>`;
    svg += `<text x="${pad.l - 8}" y="${py + 3}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="end">${Math.round(y * 100)}%</text>`;
  }
  [0, 1, 2, 3, 4, 5, 6, 7].forEach(lv => {
    const px = xScale(lv);
    svg += `<line x1="${px}" y1="${pad.t}" x2="${px}" y2="${pad.t + plotH}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    svg += `<text x="${px}" y="${pad.t + plotH + 16}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="middle">${lv}%</text>`;
  });
  svg += `<line x1="${pad.l}" y1="${yScale(0.5)}" x2="${W - pad.r}" y2="${yScale(0.5)}" stroke="#999" stroke-width="1" stroke-dasharray="4,3"/>`;
  svg += `<text x="${pad.l + plotW / 2}" y="${H - 6}" font-size="10" fill="#555" font-family="${SERIF}" text-anchor="middle">Infection Level (%)</text>`;
  svg += `<text x="12" y="${pad.t + plotH / 2}" font-size="10" fill="#555" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,12,${pad.t + plotH / 2})">P(Stay Home)</text>`;

  // Background curves (all agents, clickable)
  const levels = [];
  for (let lv = 0; lv <= 7; lv += 0.1) levels.push(Math.round(lv * 10) / 10);
  allAgents.forEach((a, i) => {
    if (a.agent_id === agent.agent_id) return;
    let path = '';
    levels.forEach((lv, j) => {
      const prob = logistic(a.startPos + bInf * lv + bInfSq * lv * lv);
      path += (j === 0 ? 'M' : 'L') + `${xScale(lv).toFixed(1)},${yScale(prob).toFixed(1)}`;
    });
    // Invisible hit zone
    svg += `<path class="fig36d-curve" data-agent-idx="${i}" d="${path}" fill="none" stroke="transparent" stroke-width="8" style="cursor:pointer;pointer-events:stroke"/>`;
    // Visible thin curve
    svg += `<path d="${path}" fill="none" stroke="#ccc" stroke-width="0.5" opacity="0.3" pointer-events="none"/>`;
  });

  // This agent's predicted S-curve
  let agentPath = '';
  levels.forEach((lv, i) => {
    const prob = logistic(agent.startPos + bInf * lv + bInfSq * lv * lv);
    agentPath += (i === 0 ? 'M' : 'L') + `${xScale(lv).toFixed(1)},${yScale(prob).toFixed(1)}`;
  });
  svg += `<path d="${agentPath}" fill="none" stroke="${provColor}" stroke-width="2.5"/>`;

  // Predicted crossover line
  if (crossover.predictedCrossover != null) {
    const px = xScale(crossover.predictedCrossover);
    svg += `<line x1="${px}" y1="${pad.t}" x2="${px}" y2="${pad.t + plotH}" stroke="${provColor}" stroke-width="1.5" stroke-dasharray="5,3"/>`;
    svg += `<text x="${px}" y="${pad.t - 8}" font-size="8" fill="${provColor}" font-family="${SERIF}" text-anchor="middle">Predicted: ${crossover.predictedCrossover.toFixed(1)}%</text>`;
  }

  // Actual crossover
  const agentActual = actuals[agent.agent_id];
  const actualCross = agentActual ? agentActual.actualCrossover : null;
  if (actualCross != null) {
    const px = xScale(actualCross);
    svg += `<line x1="${px}" y1="${pad.t}" x2="${px}" y2="${pad.t + plotH}" stroke="#e07020" stroke-width="1.5" stroke-dasharray="3,3"/>`;
    svg += `<text x="${px}" y="${pad.t + plotH + 30}" font-size="8" fill="#e07020" font-family="${SERIF}" text-anchor="middle">Actual: ${actualCross}%</text>`;
  }

  // Actual data dots
  if (agentActual && agentActual.votes) {
    CONFIG.INFECTION_LEVELS.forEach(lv => {
      const key = `${agent.agent_id}|${lv}`;
      const v = agentActual.votes[key];
      if (!v || v.total === 0) return;
      const rate = v.yes / v.total;
      const px = xScale(lv);
      const py = yScale(rate);
      const r = (v.yes === 0 || v.yes === v.total) ? 4 : 2.5;
      const fill = v.yes >= 3 ? '#e07020' : '#888';
      svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r}" fill="${fill}" fill-opacity="0.6" stroke="${fill}" stroke-width="0.5"/>`;
    });
  }

  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:#ffffff;border:1px solid #ccc">${svg}</svg>`;

  // ── Right: Agent card with sprite ──
  const agentIdx = agentsData.findIndex(a => a.agent_id === agent.agent_id);
  const sprite = (typeof SPOTLIGHT_SPRITES !== 'undefined' && SPOTLIGHT_SPRITES[agentIdx]) ? SPOTLIGHT_SPRITES[agentIdx] : 'Pipoya_F01';
  const spriteUrl = `assets/characters/${sprite}.png`;

  const traitLabels = [
    { str: 'extroverted', label: 'Extraverted', opp: 'Introverted' },
    { str: 'agreeable', label: 'Agreeable', opp: 'Antagonistic' },
    { str: 'conscientious', label: 'Conscientious', opp: 'Unconscientious' },
    { str: 'emotionally stable', label: 'Emotionally Stable', opp: 'Neurotic' },
    { str: 'open to experience', label: 'Open to Experience', opp: 'Closed' },
  ];

  let card = '<div style="font-family:\'Libre Baskerville\',Georgia,serif;font-size:12px;padding:12px;border:1px solid #ddd;border-radius:6px;background:#fafafa">';
  // Sprite
  card += `<div style="width:64px;height:64px;margin:0 auto 8px;image-rendering:pixelated;background-image:url('${spriteUrl}');background-size:${96*2}px ${128*2}px;background-position:-${32*2}px 0;background-repeat:no-repeat"></div>`;
  card += `<div style="font-size:16px;font-weight:bold;margin-bottom:4px;text-align:center">${esc(agent.name)}</div>`;
  card += `<div style="color:#666;margin-bottom:10px;text-align:center">Age ${agent.age} &middot; ${agent.gender}</div>`;

  card += '<div style="margin-bottom:10px">';
  traitLabels.forEach(t => {
    const has = (agent.traits || []).includes(t.str);
    const icon = has ? '&#10003;' : '&#10007;';
    const color = has ? '#2a7' : '#b55';
    const label = has ? t.label : t.opp;
    card += `<div style="margin:2px 0"><span style="color:${color};font-weight:bold">${icon}</span> ${label}</div>`;
  });
  card += `<div style="margin:2px 0"><span style="color:#666">${agent.gender === 'male' ? '&#9794;' : '&#9792;'}</span> ${agent.gender === 'male' ? 'Male' : 'Female'}</div>`;
  card += '</div>';

  card += '<div style="border-top:1px solid #ddd;padding-top:8px;margin-top:8px">';
  card += `<div><strong>Combined OR:</strong> ${agent.combinedOR.toFixed(2)}</div>`;
  card += `<div><strong>Log-odds:</strong> ${agent.logCombinedOR.toFixed(2)}</div>`;
  card += `<div><strong>Starting pos:</strong> ${agent.startPos.toFixed(2)}</div>`;
  card += `<div style="margin-top:6px"><strong>Predicted crossover:</strong> ${crossover.predictedCrossover != null ? crossover.predictedCrossover.toFixed(1) + '%' : 'Never'}</div>`;
  card += `<div><strong>Actual crossover:</strong> ${actualCross != null ? actualCross + '%' : 'Never'}</div>`;

  if (crossover.predictedCrossover != null && actualCross != null) {
    const delta = actualCross - crossover.predictedCrossover;
    const deltaColor = Math.abs(delta) < 0.5 ? '#2a7' : Math.abs(delta) < 1.5 ? '#b90' : '#c33';
    card += `<div style="margin-top:4px;color:${deltaColor}"><strong>Delta:</strong> ${delta > 0 ? '+' : ''}${delta.toFixed(1)} pp</div>`;
  }
  card += '</div></div>';

  detailEl.innerHTML = `<div style="display:flex;gap:16px;align-items:flex-start">${svgStr}<div style="width:260px">${card}</div></div>`;

  // Attach click handlers to background curves for agent switching
  detailEl.querySelectorAll('.fig36d-curve').forEach(curve => {
    curve.addEventListener('click', () => {
      const idx = +curve.dataset.agentIdx;
      if (onAgentClick) {
        onAgentClick(idx);
      } else {
        const sp = allAgents[idx];
        const crossovers = computeCrossovers(agentsData, regData.model2.coefficients);
        const cross = crossovers[idx];
        const chartEl = document.getElementById('fig36-chart');
        if (chartEl && chartEl._fig36WaterfallState) {
          const s = chartEl._fig36WaterfallState;
          renderFig36WaterfallHighlight(chartEl, sp, allAgents, cross, s.actuals, microRows, cfg, regData, s.W, s.H, s.pad, s.dotColW, s.gap, s.curveL, s.curveW, s.plotH, s.yMin, s.yMax, s.yScale, s.xScale, s.levels, s.provColor, s.bInf, s.bInfSq, s.intercept);
        }
      }
    });
  });
}

// ── Fig 37: Decision Anatomy: Traits & Infection Level Impact ────────────────────────
function renderFig37ThreeForces(microRows, cfg, regData, chartId, detailId) {
  const el = document.getElementById(chartId || 'fig37-chart');
  const detailEl = document.getElementById(detailId || 'fig37-detail');
  if (!el) return;

  if (!regData || !regData.model2 || !regData.model2.coefficients) {
    el.innerHTML = '<div style="color:#999;padding:20px">No Model 2 regression data.</div>';
    return;
  }

  const coefs = regData.model2.coefficients;
  const agents = agentsData;
  if (!agents) return;

  const intercept = coefs.intercept ? coefs.intercept.estimate : 0;
  const bInf = coefs.infection_pct ? coefs.infection_pct.estimate : 0;
  const bInfSq = coefs.infection_pct_sq ? coefs.infection_pct_sq.estimate : 0;
  const provColor = CONFIG.PROVIDER_COLORS[cfg.provider] || '#888';

  // Compute personality log-odds per agent
  const predicted = computeAgentCombinedORs(agents, coefs);
  const startPositions = predicted.map(p => ({ ...p, startPos: intercept + p.logCombinedOR }));
  const crossovers = computeCrossovers(agents, coefs);
  const actuals = computeActualCrossovers(agents, microRows);

  // Layout: 3 columns — Intercept | Starting Position | Infection Curves
  const W = Math.min(el.parentElement?.offsetWidth || 860, 860);
  const H = 420;
  const pad = { t: 35, r: 30, b: 55, l: 80 };
  const colGap = 14;
  const col1W = 60;
  const dotColW = 140;
  const col1L = pad.l;
  const col2L = col1L + col1W + colGap;
  const curveL = col2L + dotColW + colGap;
  const curveW = W - pad.r - curveL;
  const plotH = H - pad.t - pad.b;

  // Y-axis range (same logic as Fig 36)
  const allStarts = startPositions.map(s => s.startPos);
  const maxInf = bInf * 7 + bInfSq * 49;
  const allVals = [...allStarts, ...allStarts.map(s => s + maxInf)];
  let yMin = Math.min(...allVals) - 1;
  let yMax = Math.max(...allVals) + 1;
  if (yMin > -1) yMin = -1;
  if (yMax < 1) yMax = 1;
  yMin = Math.floor(yMin);
  yMax = Math.ceil(yMax);

  const yScale = v => pad.t + plotH * (1 - (v - yMin) / (yMax - yMin));
  const xScale = lv => curveL + (lv / 7) * curveW;
  const logOddsToProb = lo => 1 / (1 + Math.exp(-lo));

  const jitterFor = (i) => ((Math.abs(Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1) - 0.5) * (dotColW - 24);

  let svg = '';

  // Y-axis grid + dual labels
  for (let v = yMin; v <= yMax; v += 2) {
    const py = yScale(v);
    svg += `<line x1="${pad.l}" y1="${py}" x2="${W - pad.r}" y2="${py}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    const prob = logOddsToProb(v);
    const probStr = prob < 0.01 ? '<1%' : prob > 0.99 ? '>99%' : Math.round(prob * 100) + '%';
    svg += `<text x="${pad.l - 6}" y="${py + 3}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="end">${v}</text>`;
    svg += `<text x="${pad.l - 38}" y="${py + 3}" font-size="8" fill="#aaa" font-family="${SERIF}" text-anchor="end">(${probStr})</text>`;
  }

  // Zero line
  const y0 = yScale(0);
  svg += `<line x1="${pad.l}" y1="${y0}" x2="${W - pad.r}" y2="${y0}" stroke="#333" stroke-width="1.5" stroke-dasharray="6,3"/>`;
  svg += `<text x="${W - pad.r + 4}" y="${y0 + 3}" font-size="8" fill="#333" font-family="${SERIF}" font-weight="bold">50%</text>`;

  // Y-axis label
  svg += `<text x="12" y="${pad.t + plotH / 2}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,12,${pad.t + plotH / 2})">Log-odds (probability)</text>`;

  // Column headers
  svg += `<text x="${col1L + col1W / 2}" y="${pad.t - 10}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Intercept</text>`;
  svg += `<text x="${col1L + col1W / 2}" y="${pad.t - 1}" font-size="7" fill="#999" font-family="${SERIF}" text-anchor="middle">(same for all)</text>`;
  svg += `<text x="${col2L + dotColW / 2}" y="${pad.t - 10}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Starting Position</text>`;
  svg += `<text x="${col2L + dotColW / 2}" y="${pad.t - 1}" font-size="7" fill="#999" font-family="${SERIF}" text-anchor="middle">(intercept + personality)</text>`;
  svg += `<text x="${curveL + curveW / 2}" y="${pad.t - 10}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Total Log-Odds as Infection Rises</text>`;

  // Separators
  const sep1 = col1L + col1W + colGap / 2;
  const sep2 = col2L + dotColW + colGap / 2;
  svg += `<line x1="${sep1}" y1="${pad.t}" x2="${sep1}" y2="${pad.t + plotH}" stroke="#ddd" stroke-width="1" stroke-dasharray="3,3"/>`;
  svg += `<line x1="${sep2}" y1="${pad.t}" x2="${sep2}" y2="${pad.t + plotH}" stroke="#ddd" stroke-width="1" stroke-dasharray="3,3"/>`;

  // ── Column 1: Intercept (single bold line) ──
  const intY = yScale(intercept);
  svg += `<line x1="${col1L + 4}" y1="${intY}" x2="${col1L + col1W - 4}" y2="${intY}" stroke="#333" stroke-width="3"/>`;
  svg += `<text x="${col1L + col1W / 2}" y="${intY - 8}" font-size="9" fill="#333" font-family="${SERIF}" text-anchor="middle" font-weight="bold">${intercept.toFixed(1)}</text>`;

  // ── Column 2: Starting Position dots (same as Fig 36 left panel) ──
  const sortedStarts = [...allStarts].sort((a, b) => a - b);
  const q1 = sortedStarts[Math.floor(sortedStarts.length * 0.25)];
  const q3 = sortedStarts[Math.floor(sortedStarts.length * 0.75)];
  const med = sortedStarts[Math.floor(sortedStarts.length * 0.5)];

  // IQR band
  svg += `<rect x="${col2L + 8}" y="${yScale(q3)}" width="${dotColW - 16}" height="${yScale(q1) - yScale(q3)}" fill="${provColor}" fill-opacity="0.08" stroke="${provColor}" stroke-width="0.5" stroke-opacity="0.3" rx="2"/>`;
  svg += `<line x1="${col2L + 8}" y1="${yScale(med)}" x2="${col2L + dotColW - 8}" y2="${yScale(med)}" stroke="${provColor}" stroke-width="1.5" stroke-dasharray="3,2"/>`;
  svg += `<text x="${col2L + dotColW - 6}" y="${yScale(q1) + 10}" font-size="7" fill="${provColor}" font-family="${SERIF}" text-anchor="end" opacity="0.5">IQR</text>`;

  // Dots
  startPositions.forEach((sp, i) => {
    const py = yScale(sp.startPos);
    const jx = jitterFor(i);
    const px = col2L + dotColW / 2 + jx;
    svg += `<circle class="fig37w-dot" data-agent-idx="${i}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="${provColor}" fill-opacity="0.5" stroke="${provColor}" stroke-width="0.7" style="cursor:pointer"/>`;
  });

  // ── Column 3: Total log-odds curves (same as Fig 36 right panel) ──
  // X-axis ticks
  [0, 1, 2, 3, 4, 5, 6, 7].forEach(lv => {
    const px = xScale(lv);
    svg += `<text x="${px}" y="${pad.t + plotH + 16}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="middle">${lv}%</text>`;
  });
  svg += `<text x="${curveL + curveW / 2}" y="${H - 8}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle">Infection Level</text>`;

  // Faint curves (clickable)
  const levels = [];
  for (let lv = 0; lv <= 7; lv += 0.2) levels.push(Math.round(lv * 10) / 10);

  startPositions.forEach((sp, i) => {
    let path = '';
    levels.forEach((lv, j) => {
      const total = sp.startPos + bInf * lv + bInfSq * lv * lv;
      const px = xScale(lv);
      const clampedY = Math.max(pad.t, Math.min(pad.t + plotH, yScale(total)));
      path += (j === 0 ? 'M' : 'L') + `${px.toFixed(1)},${clampedY.toFixed(1)}`;
    });
    svg += `<path class="fig37w-curve" data-agent-idx="${i}" d="${path}" fill="none" stroke="transparent" stroke-width="8" style="cursor:pointer;pointer-events:stroke"/>`;
    svg += `<path d="${path}" fill="none" stroke="${provColor}" stroke-width="0.6" opacity="0.12" pointer-events="none"/>`;
  });

  // Legend (bottom-right of curve panel)
  const legY = pad.t + plotH - 60;
  const legR = curveL + curveW - 10;
  svg += `<line x1="${legR - 230}" y1="${legY}" x2="${legR - 210}" y2="${legY}" stroke="#333" stroke-width="1.5" stroke-dasharray="6,3"/>`;
  svg += `<text x="${legR - 206}" y="${legY + 3}" font-size="9" fill="#555" font-family="${SERIF}">50% decision boundary</text>`;
  svg += `<line x1="${legR - 230}" y1="${legY + 14}" x2="${legR - 210}" y2="${legY + 14}" stroke="${provColor}" stroke-width="2.5"/>`;
  svg += `<text x="${legR - 206}" y="${legY + 17}" font-size="9" fill="#555" font-family="${SERIF}">Selected agent's total log-odds</text>`;
  svg += `<line x1="${legR - 230}" y1="${legY + 28}" x2="${legR - 210}" y2="${legY + 28}" stroke="#333" stroke-width="2.5" stroke-dasharray="5,2"/>`;
  svg += `<text x="${legR - 206}" y="${legY + 31}" font-size="9" fill="#555" font-family="${SERIF}">Intercept (baseline for all agents)</text>`;
  svg += `<rect x="${legR - 230}" y="${legY + 38}" width="20" height="10" fill="${provColor}" fill-opacity="0.08" stroke="${provColor}" stroke-width="0.5" stroke-opacity="0.3" rx="1"/>`;
  svg += `<text x="${legR - 206}" y="${legY + 47}" font-size="9" fill="#555" font-family="${SERIF}">IQR — middle 50% of starting positions</text>`;
  svg += `<text x="${legR - 230}" y="${legY + 62}" font-size="8" fill="#999" font-family="${SERIF}" font-style="italic">Click a dot or curve to explore</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;

  // Clear detail
  if (detailEl) { detailEl.style.display = 'none'; detailEl.innerHTML = ''; }

  // Click handlers — highlight selected agent (reuse Fig 36 waterfall highlight pattern)
  const handleClick = (idx) => {
    const sp = startPositions[idx];
    const cross = crossovers[idx];
    renderFig37ThreeForceHighlight(el, sp, startPositions, cross, actuals, microRows, cfg, regData, W, H, pad, col1L, col1W, col2L, dotColW, curveL, curveW, plotH, yMin, yMax, yScale, xScale, levels, provColor, bInf, bInfSq, intercept, colGap, detailEl);
  };
  el.querySelectorAll('.fig37w-dot').forEach(dot => {
    dot.addEventListener('click', () => handleClick(+dot.dataset.agentIdx));
  });
  el.querySelectorAll('.fig37w-curve').forEach(curve => {
    curve.addEventListener('click', () => handleClick(+curve.dataset.agentIdx));
  });
}

function renderFig37ThreeForceHighlight(el, agent, allAgents, crossover, actuals, microRows, cfg, regData, W, H, pad, col1L, col1W, col2L, dotColW, curveL, curveW, plotH, yMin, yMax, yScale, xScale, levels, provColor, bInf, bInfSq, intercept, colGap, detailEl) {
  const logOddsToProb = lo => 1 / (1 + Math.exp(-lo));
  const jitterFor = (i) => ((Math.abs(Math.sin(i * 127.1 + 311.7) * 43758.5453) % 1) - 0.5) * (dotColW - 24);

  let svg = '';

  // Y-axis grid + dual labels
  for (let v = yMin; v <= yMax; v += 2) {
    const py = yScale(v);
    svg += `<line x1="${pad.l}" y1="${py}" x2="${W - pad.r}" y2="${py}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    const prob = logOddsToProb(v);
    const probStr = prob < 0.01 ? '<1%' : prob > 0.99 ? '>99%' : Math.round(prob * 100) + '%';
    svg += `<text x="${pad.l - 6}" y="${py + 3}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="end">${v}</text>`;
    svg += `<text x="${pad.l - 38}" y="${py + 3}" font-size="8" fill="#aaa" font-family="${SERIF}" text-anchor="end">(${probStr})</text>`;
  }

  // Zero line
  const y0 = yScale(0);
  svg += `<line x1="${pad.l}" y1="${y0}" x2="${W - pad.r}" y2="${y0}" stroke="#333" stroke-width="1.5" stroke-dasharray="6,3"/>`;
  svg += `<text x="${W - pad.r + 4}" y="${y0 + 3}" font-size="8" fill="#333" font-family="${SERIF}" font-weight="bold">50%</text>`;

  // Y-axis label
  svg += `<text x="12" y="${pad.t + plotH / 2}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,12,${pad.t + plotH / 2})">Log-odds (probability)</text>`;

  // Column headers
  svg += `<text x="${col1L + col1W / 2}" y="${pad.t - 10}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Intercept</text>`;
  svg += `<text x="${col1L + col1W / 2}" y="${pad.t - 1}" font-size="7" fill="#999" font-family="${SERIF}" text-anchor="middle">(same for all)</text>`;
  svg += `<text x="${col2L + dotColW / 2}" y="${pad.t - 10}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Starting Position</text>`;
  svg += `<text x="${col2L + dotColW / 2}" y="${pad.t - 1}" font-size="7" fill="#999" font-family="${SERIF}" text-anchor="middle">(intercept + personality)</text>`;
  svg += `<text x="${curveL + curveW / 2}" y="${pad.t - 10}" font-size="9" fill="#555" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Total Log-Odds as Infection Rises</text>`;

  // Separators
  const sep1 = col1L + col1W + colGap / 2;
  const sep2 = col2L + dotColW + colGap / 2;
  svg += `<line x1="${sep1}" y1="${pad.t}" x2="${sep1}" y2="${pad.t + plotH}" stroke="#ddd" stroke-width="1" stroke-dasharray="3,3"/>`;
  svg += `<line x1="${sep2}" y1="${pad.t}" x2="${sep2}" y2="${pad.t + plotH}" stroke="#ddd" stroke-width="1" stroke-dasharray="3,3"/>`;

  // ── Column 1: Intercept ──
  const intY = yScale(intercept);
  svg += `<line x1="${col1L + 4}" y1="${intY}" x2="${col1L + col1W - 4}" y2="${intY}" stroke="#333" stroke-width="3"/>`;
  svg += `<text x="${col1L + col1W / 2}" y="${intY - 8}" font-size="9" fill="#333" font-family="${SERIF}" text-anchor="middle" font-weight="bold">${intercept.toFixed(1)}</text>`;

  // ── Column 2: Starting Position dots ──
  const sortedStarts = allAgents.map(s => s.startPos).sort((a, b) => a - b);
  const q1 = sortedStarts[Math.floor(sortedStarts.length * 0.25)];
  const q3 = sortedStarts[Math.floor(sortedStarts.length * 0.75)];
  const med = sortedStarts[Math.floor(sortedStarts.length * 0.5)];

  // IQR band
  svg += `<rect x="${col2L + 8}" y="${yScale(q3)}" width="${dotColW - 16}" height="${yScale(q1) - yScale(q3)}" fill="${provColor}" fill-opacity="0.06" stroke="${provColor}" stroke-width="0.5" stroke-opacity="0.2" rx="2"/>`;
  svg += `<line x1="${col2L + 8}" y1="${yScale(med)}" x2="${col2L + dotColW - 8}" y2="${yScale(med)}" stroke="${provColor}" stroke-width="1" stroke-dasharray="3,2" opacity="0.5"/>`;
  svg += `<text x="${col2L + dotColW - 6}" y="${yScale(q1) + 10}" font-size="7" fill="${provColor}" font-family="${SERIF}" text-anchor="end" opacity="0.5">IQR</text>`;

  // Dimmed dots + selected
  allAgents.forEach((sp, i) => {
    const py = yScale(sp.startPos);
    const px = col2L + dotColW / 2 + jitterFor(i);
    if (sp.agent_id !== agent.agent_id) {
      svg += `<circle class="fig37w-dot" data-agent-idx="${i}" cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3" fill="${provColor}" fill-opacity="0.2" stroke="${provColor}" stroke-width="0.5" style="cursor:pointer"/>`;
    }
  });

  const selIdx = allAgents.findIndex(a => a.agent_id === agent.agent_id);
  const selY = yScale(agent.startPos);
  const selX = col2L + dotColW / 2 + jitterFor(selIdx);
  svg += `<circle class="fig37w-dot" data-agent-idx="${selIdx}" cx="${selX.toFixed(1)}" cy="${selY.toFixed(1)}" r="6" fill="${provColor}" fill-opacity="1" stroke="${provColor}" stroke-width="2.5" style="cursor:pointer"/>`;

  // ── Column 3: Faint curves + highlighted curve ──
  [0, 1, 2, 3, 4, 5, 6, 7].forEach(lv => {
    const px = xScale(lv);
    svg += `<text x="${px}" y="${pad.t + plotH + 16}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="middle">${lv}%</text>`;
  });
  svg += `<text x="${curveL + curveW / 2}" y="${H - 8}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle">Infection Level</text>`;

  // Faint curves (clickable)
  allAgents.forEach((sp, i) => {
    if (sp.agent_id === agent.agent_id) return;
    let path = '';
    levels.forEach((lv, j) => {
      const total = sp.startPos + bInf * lv + bInfSq * lv * lv;
      const px = xScale(lv);
      const py = Math.max(pad.t, Math.min(pad.t + plotH, yScale(total)));
      path += (j === 0 ? 'M' : 'L') + `${px.toFixed(1)},${py.toFixed(1)}`;
    });
    svg += `<path class="fig37w-curve" data-agent-idx="${i}" d="${path}" fill="none" stroke="transparent" stroke-width="8" style="cursor:pointer;pointer-events:stroke"/>`;
    svg += `<path d="${path}" fill="none" stroke="${provColor}" stroke-width="0.6" opacity="0.12" pointer-events="none"/>`;
  });

  // Connection line from dot to curve start
  svg += `<line x1="${selX.toFixed(1)}" y1="${selY.toFixed(1)}" x2="${xScale(0)}" y2="${selY.toFixed(1)}" stroke="${provColor}" stroke-width="1" stroke-dasharray="3,2" opacity="0.6"/>`;

  // Selected agent's curve
  let agentPath = '';
  levels.forEach((lv, j) => {
    const total = agent.startPos + bInf * lv + bInfSq * lv * lv;
    const px = xScale(lv);
    const py = Math.max(pad.t, Math.min(pad.t + plotH, yScale(total)));
    agentPath += (j === 0 ? 'M' : 'L') + `${px.toFixed(1)},${py.toFixed(1)}`;
  });
  svg += `<path d="${agentPath}" fill="none" stroke="${provColor}" stroke-width="2.5"/>`;

  // Crossover annotation
  if (crossover.predictedCrossover != null) {
    const crossLv = crossover.predictedCrossover;
    const px = xScale(crossLv);
    svg += `<line x1="${px}" y1="${pad.t}" x2="${px}" y2="${pad.t + plotH}" stroke="${provColor}" stroke-width="1.5" stroke-dasharray="5,3"/>`;
    svg += `<text x="${px}" y="${pad.t - 4}" font-size="8" fill="${provColor}" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Crossover: ${crossLv.toFixed(1)}%</text>`;
    svg += `<circle cx="${px}" cy="${y0}" r="4" fill="${provColor}" stroke="white" stroke-width="1.5"/>`;
  } else {
    svg += `<text x="${curveL + curveW - 10}" y="${pad.t + 16}" font-size="9" fill="#999" font-family="${SERIF}" text-anchor="end" font-style="italic">Never reaches 50%</text>`;
  }

  // Start annotation
  const startProb = logOddsToProb(agent.startPos);
  const startProbStr = startProb < 0.01 ? '<1%' : startProb > 0.99 ? '>99%' : Math.round(startProb * 100) + '%';
  svg += `<text x="${xScale(0) + 4}" y="${selY - 8}" font-size="8" fill="${provColor}" font-family="${SERIF}" style="paint-order:stroke" stroke="white" stroke-width="3">Start: ${agent.startPos.toFixed(1)} (${startProbStr})</text>`;

  // Legend (bottom-right of curve panel)
  const legY = pad.t + plotH - 60;
  const legR = curveL + curveW - 10;
  svg += `<line x1="${legR - 230}" y1="${legY}" x2="${legR - 210}" y2="${legY}" stroke="#333" stroke-width="1.5" stroke-dasharray="6,3"/>`;
  svg += `<text x="${legR - 206}" y="${legY + 3}" font-size="9" fill="#555" font-family="${SERIF}">50% decision boundary</text>`;
  svg += `<line x1="${legR - 230}" y1="${legY + 14}" x2="${legR - 210}" y2="${legY + 14}" stroke="${provColor}" stroke-width="2.5"/>`;
  svg += `<text x="${legR - 206}" y="${legY + 17}" font-size="9" fill="#555" font-family="${SERIF}">Selected agent's total log-odds</text>`;
  svg += `<line x1="${legR - 230}" y1="${legY + 28}" x2="${legR - 210}" y2="${legY + 28}" stroke="#333" stroke-width="2.5" stroke-dasharray="5,2"/>`;
  svg += `<text x="${legR - 206}" y="${legY + 31}" font-size="9" fill="#555" font-family="${SERIF}">Intercept (baseline for all agents)</text>`;
  svg += `<rect x="${legR - 230}" y="${legY + 38}" width="20" height="10" fill="${provColor}" fill-opacity="0.08" stroke="${provColor}" stroke-width="0.5" stroke-opacity="0.3" rx="1"/>`;
  svg += `<text x="${legR - 206}" y="${legY + 47}" font-size="9" fill="#555" font-family="${SERIF}">IQR — middle 50% of starting positions</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;

  // Click handlers
  const clickHandler = (idx) => {
    const sp = allAgents[idx];
    const cross = computeCrossovers(agentsData, regData.model2.coefficients)[idx];
    renderFig37ThreeForceHighlight(el, sp, allAgents, cross, actuals, microRows, cfg, regData, W, H, pad, col1L, col1W, col2L, dotColW, curveL, curveW, plotH, yMin, yMax, yScale, xScale, levels, provColor, bInf, bInfSq, intercept, colGap, detailEl);
  };
  el.querySelectorAll('.fig37w-dot').forEach(dot => {
    dot.addEventListener('click', () => clickHandler(+dot.dataset.agentIdx));
  });
  el.querySelectorAll('.fig37w-curve').forEach(curve => {
    curve.addEventListener('click', () => clickHandler(+curve.dataset.agentIdx));
  });

  // Detail panel (reuse Fig 36 detail, with callback to update THIS figure on click)
  if (detailEl) {
    detailEl.style.display = 'block';
    renderFig36WaterfallDetail(agent, crossover, allAgents, actuals, microRows, cfg, regData, detailEl, clickHandler);
  }
}

// ── Fig 38: Agent Crossover Explorer ──────────────────────────
function renderFig38Explorer(microRows, cfg, regData) {
  const el = document.getElementById('fig38-chart');
  const detailEl = document.getElementById('fig38-detail');
  if (!el) return;

  if (!regData || !regData.model2 || !regData.model2.coefficients) {
    el.innerHTML = '<div style="color:#999;padding:20px">No Model 2 regression data.</div>';
    return;
  }

  const coefs = regData.model2.coefficients;
  const agents = agentsData;
  if (!agents) return;

  const provColor = CONFIG.PROVIDER_COLORS[cfg.provider] || '#888';
  const crossovers = computeCrossovers(agents, coefs);
  const actuals = computeActualCrossovers(agents, microRows);

  // Merge predicted + actual
  const agentData = crossovers.map(c => ({
    ...c,
    actualCrossover: actuals[c.agent_id] ? actuals[c.agent_id].actualCrossover : null,
  }));

  // Sort by predicted crossover (null = never → sort to end)
  const sorted = [...agentData].sort((a, b) => {
    const av = a.predictedCrossover == null ? 999 : a.predictedCrossover;
    const bv = b.predictedCrossover == null ? 999 : b.predictedCrossover;
    return av - bv;
  });

  // Top panel: crossover strip
  const W = Math.min(el.parentElement?.offsetWidth || 860, 860);
  const H = 180;
  const pad = { t: 30, r: 50, b: 35, l: 60 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const neverX = 7.5; // x-position for "never" agents
  const maxX = 8;

  const xScale = v => pad.l + (v / maxX) * plotW;
  const midY = pad.t + plotH / 2;

  let svg = '';

  // Grid
  [0, 1, 2, 3, 4, 5, 6, 7].forEach(lv => {
    const px = xScale(lv);
    svg += `<line x1="${px}" y1="${pad.t}" x2="${px}" y2="${pad.t + plotH}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    svg += `<text x="${px}" y="${pad.t + plotH + 14}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="middle">${lv}%</text>`;
  });
  // "Never" zone
  const neverLeft = xScale(7.2);
  svg += `<rect x="${neverLeft}" y="${pad.t}" width="${W - pad.r - neverLeft}" height="${plotH}" fill="#f5f5f5" rx="3"/>`;
  svg += `<text x="${xScale(neverX)}" y="${pad.t + plotH + 14}" font-size="8" fill="#999" font-family="${SERIF}" text-anchor="middle">Never</text>`;

  svg += `<text x="${pad.l + plotW / 2}" y="${H - 4}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle">Predicted Crossover Infection Level</text>`;
  svg += `<text x="${pad.l - 8}" y="${midY + 3}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="end">Agents</text>`;

  // Draw dots with jitter
  const jitterSeed = [];
  sorted.forEach((a, i) => {
    const cx = a.predictedCrossover == null ? xScale(neverX) : xScale(a.predictedCrossover);
    // Beeswarm-style: deterministic jitter based on index
    const row = Math.floor(i / 10);
    const col = i % 10;
    const cy = midY + (row - 4.5) * 10;
    const jx = cx + (Math.sin(i * 2.7) * 4);
    svg += `<circle class="fig38-dot" data-agent-idx="${i}" cx="${jx.toFixed(1)}" cy="${cy.toFixed(1)}" r="4" fill="${provColor}" fill-opacity="0.5" stroke="${provColor}" stroke-width="0.8" style="cursor:pointer"/>`;
  });

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;

  // Click handler
  if (detailEl) detailEl.style.display = 'none';
  el.querySelectorAll('.fig38-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      const idx = +dot.dataset.agentIdx;
      const agent = sorted[idx];
      // Highlight selected
      el.querySelectorAll('.fig38-dot').forEach(d => {
        d.setAttribute('stroke-width', '0.8');
        d.setAttribute('r', '4');
      });
      dot.setAttribute('stroke-width', '2.5');
      dot.setAttribute('r', '6');
      renderFig36Detail(agent, sorted, microRows, cfg, regData, actuals);
    });
  });
}

function renderFig36Detail(agent, allAgents, microRows, cfg, regData, actuals) {
  const detailEl = document.getElementById('fig38-detail');
  if (!detailEl) return;
  detailEl.style.display = 'block';

  const coefs = regData.model2.coefficients;
  const intercept = coefs.intercept ? coefs.intercept.estimate : 0;
  const bInf = coefs.infection_pct ? coefs.infection_pct.estimate : 0;
  const bInfSq = coefs.infection_pct_sq ? coefs.infection_pct_sq.estimate : 0;
  const logistic = x => 1 / (1 + Math.exp(-x));
  const provColor = CONFIG.PROVIDER_COLORS[cfg.provider] || '#888';

  // ── Left: S-curve plot ──
  const W = 560, H = 360;
  const pad = { t: 20, r: 20, b: 45, l: 50 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const xScale = v => pad.l + (v / 7) * plotW;
  const yScale = v => pad.t + plotH - v * plotH;

  let svg = '';

  // Grid
  for (let y = 0; y <= 1; y += 0.25) {
    const py = yScale(y);
    svg += `<line x1="${pad.l}" y1="${py}" x2="${W - pad.r}" y2="${py}" stroke="#eee" stroke-width="0.5"/>`;
    svg += `<text x="${pad.l - 8}" y="${py + 3}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="end">${Math.round(y * 100)}%</text>`;
  }
  [0, 1, 2, 3, 4, 5, 6, 7].forEach(lv => {
    const px = xScale(lv);
    svg += `<line x1="${px}" y1="${pad.t}" x2="${px}" y2="${pad.t + plotH}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    svg += `<text x="${px}" y="${pad.t + plotH + 16}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="middle">${lv}%</text>`;
  });
  // 50% line
  svg += `<line x1="${pad.l}" y1="${yScale(0.5)}" x2="${W - pad.r}" y2="${yScale(0.5)}" stroke="#999" stroke-width="1" stroke-dasharray="4,3"/>`;
  svg += `<text x="${pad.l + plotW / 2}" y="${H - 6}" font-size="10" fill="#555" font-family="${SERIF}" text-anchor="middle">Infection Level (%)</text>`;
  svg += `<text x="12" y="${pad.t + plotH / 2}" font-size="10" fill="#555" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,12,${pad.t + plotH / 2})">P(Stay Home)</text>`;

  // Background: all other agents' curves in gray
  const levels = [];
  for (let lv = 0; lv <= 7; lv += 0.1) levels.push(Math.round(lv * 10) / 10);
  allAgents.forEach(a => {
    if (a.agent_id === agent.agent_id) return;
    let path = '';
    levels.forEach((lv, i) => {
      const prob = logistic(intercept + a.logCombinedOR + bInf * lv + bInfSq * lv * lv);
      const px = xScale(lv);
      const py = yScale(prob);
      path += (i === 0 ? 'M' : 'L') + `${px.toFixed(1)},${py.toFixed(1)}`;
    });
    svg += `<path d="${path}" fill="none" stroke="#ccc" stroke-width="0.5" opacity="0.3"/>`;
  });

  // This agent's predicted S-curve
  let agentPath = '';
  levels.forEach((lv, i) => {
    const prob = logistic(intercept + agent.logCombinedOR + bInf * lv + bInfSq * lv * lv);
    const px = xScale(lv);
    const py = yScale(prob);
    agentPath += (i === 0 ? 'M' : 'L') + `${px.toFixed(1)},${py.toFixed(1)}`;
  });
  svg += `<path d="${agentPath}" fill="none" stroke="${provColor}" stroke-width="2.5"/>`;

  // Predicted crossover line
  if (agent.predictedCrossover != null && agent.predictedCrossover > 0) {
    const px = xScale(agent.predictedCrossover);
    svg += `<line x1="${px}" y1="${pad.t}" x2="${px}" y2="${pad.t + plotH}" stroke="${provColor}" stroke-width="1.5" stroke-dasharray="5,3"/>`;
    svg += `<text x="${px}" y="${pad.t - 4}" font-size="8" fill="${provColor}" font-family="${SERIF}" text-anchor="middle">Predicted: ${agent.predictedCrossover.toFixed(1)}%</text>`;
  }

  // Actual crossover line
  if (agent.actualCrossover != null) {
    const px = xScale(agent.actualCrossover);
    svg += `<line x1="${px}" y1="${pad.t}" x2="${px}" y2="${pad.t + plotH}" stroke="#e07020" stroke-width="1.5" stroke-dasharray="3,3"/>`;
    svg += `<text x="${px}" y="${pad.t + plotH + 30}" font-size="8" fill="#e07020" font-family="${SERIF}" text-anchor="middle">Actual: ${agent.actualCrossover}%</text>`;
  }

  // Actual data dots
  const agentActual = actuals[agent.agent_id];
  if (agentActual && agentActual.votes) {
    CONFIG.INFECTION_LEVELS.forEach(lv => {
      const key = `${agent.agent_id}|${lv}`;
      const v = agentActual.votes[key];
      if (!v || v.total === 0) return;
      const rate = v.yes / v.total;
      const px = xScale(lv);
      const py = yScale(rate);
      const r = (v.yes === 0 || v.yes === v.total) ? 4 : 2.5;
      const fill = v.yes >= 3 ? '#e07020' : '#888';
      svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r}" fill="${fill}" fill-opacity="0.6" stroke="${fill}" stroke-width="0.5"/>`;
    });
  }

  const svgStr = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;

  // ── Right: Agent card with sprite ──
  const traits = agent.traits || [];
  const agentIdx = agentsData.findIndex(a => a.agent_id === agent.agent_id);
  const sprite = (typeof SPOTLIGHT_SPRITES !== 'undefined' && SPOTLIGHT_SPRITES[agentIdx]) ? SPOTLIGHT_SPRITES[agentIdx] : 'Pipoya_F01';
  const spriteUrl = `assets/characters/${sprite}.png`;
  const traitLabels = [
    { str: 'extroverted', label: 'Extraverted', opp: 'Introverted' },
    { str: 'agreeable', label: 'Agreeable', opp: 'Antagonistic' },
    { str: 'conscientious', label: 'Conscientious', opp: 'Unconscientious' },
    { str: 'emotionally stable', label: 'Emotionally Stable', opp: 'Neurotic' },
    { str: 'open to experience', label: 'Open to Experience', opp: 'Closed' },
  ];

  let card = '<div style="font-family:\'Libre Baskerville\',Georgia,serif;font-size:12px;padding:12px;border:1px solid #ddd;border-radius:6px;background:#fafafa">';
  card += `<div style="width:64px;height:64px;margin:0 auto 8px;image-rendering:pixelated;background-image:url('${spriteUrl}');background-size:${96*2}px ${128*2}px;background-position:-${32*2}px 0;background-repeat:no-repeat"></div>`;
  card += `<div style="font-size:16px;font-weight:bold;margin-bottom:4px;text-align:center">${esc(agent.name)}</div>`;
  card += `<div style="color:#666;margin-bottom:10px;text-align:center">Age ${agent.age} · ${agent.gender}</div>`;

  card += '<div style="margin-bottom:10px">';
  traitLabels.forEach(t => {
    const has = traits.includes(t.str);
    const icon = has ? '&#10003;' : '&#10007;';
    const color = has ? '#2a7' : '#b55';
    const label = has ? t.label : t.opp;
    card += `<div style="margin:2px 0"><span style="color:${color};font-weight:bold">${icon}</span> ${label}</div>`;
  });
  card += `<div style="margin:2px 0"><span style="color:#666">${agent.gender === 'male' ? '&#9794;' : '&#9792;'}</span> ${agent.gender === 'male' ? 'Male' : 'Female'}</div>`;
  card += '</div>';

  card += '<div style="border-top:1px solid #ddd;padding-top:8px;margin-top:8px">';
  card += `<div><strong>Combined OR:</strong> ${agent.combinedOR.toFixed(2)}</div>`;
  card += `<div><strong>Log-odds:</strong> ${agent.logCombinedOR.toFixed(2)}</div>`;
  card += `<div style="margin-top:6px"><strong>Predicted crossover:</strong> ${agent.predictedCrossover != null ? agent.predictedCrossover.toFixed(1) + '%' : 'Never'}</div>`;
  card += `<div><strong>Actual crossover:</strong> ${agent.actualCrossover != null ? agent.actualCrossover + '%' : 'Never'}</div>`;

  if (agent.predictedCrossover != null && agent.actualCrossover != null) {
    const delta = agent.actualCrossover - agent.predictedCrossover;
    const deltaColor = Math.abs(delta) < 0.5 ? '#2a7' : Math.abs(delta) < 1.5 ? '#b90' : '#c33';
    card += `<div style="margin-top:4px;color:${deltaColor}"><strong>Delta:</strong> ${delta > 0 ? '+' : ''}${delta.toFixed(1)} pp</div>`;
  }
  card += '</div></div>';

  detailEl.innerHTML = `<div style="display:flex;gap:16px;align-items:flex-start">${svgStr}<div style="width:260px">${card}</div></div>`;
}

// ── Fig 39: Crossover Distribution ────────────────────────────
function renderFig39CrossoverDistribution(microRows, cfg, regData) {
  const el = document.getElementById('fig39-chart');
  if (!el) return;

  if (!regData || !regData.model2 || !regData.model2.coefficients) {
    el.innerHTML = '<div style="color:#999;padding:20px">No Model 2 regression data.</div>';
    return;
  }

  const coefs = regData.model2.coefficients;
  const agents = agentsData;
  if (!agents) return;

  const provColor = CONFIG.PROVIDER_COLORS[cfg.provider] || '#888';
  const crossovers = computeCrossovers(agents, coefs);
  const actuals = computeActualCrossovers(agents, microRows);

  // Merge
  const data = crossovers.map(c => ({
    ...c,
    actualCrossover: actuals[c.agent_id] ? actuals[c.agent_id].actualCrossover : null,
  }));

  // Sort by predicted crossover
  const sorted = [...data].sort((a, b) => {
    const av = a.predictedCrossover == null ? 999 : a.predictedCrossover;
    const bv = b.predictedCrossover == null ? 999 : b.predictedCrossover;
    return av - bv;
  });

  const W = Math.min(el.parentElement?.offsetWidth || 860, 860);
  const H = 380;
  const pad = { t: 30, r: 30, b: 50, l: 55 };
  const plotW = W - pad.l - pad.r;
  const plotH = H - pad.t - pad.b;
  const maxY = 8; // 7% + "Never" zone above

  const xScale = i => pad.l + (i / (sorted.length - 1)) * plotW;
  const yScale = v => pad.t + plotH * (1 - v / maxY);

  let svg = '';

  // Grid
  [0, 1, 2, 3, 4, 5, 6, 7].forEach(lv => {
    const py = yScale(lv);
    svg += `<line x1="${pad.l}" y1="${py}" x2="${W - pad.r}" y2="${py}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    svg += `<text x="${pad.l - 8}" y="${py + 3}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="end">${lv}%</text>`;
  });

  // "Never" zone
  const neverY = yScale(7.5);
  svg += `<rect x="${pad.l}" y="${pad.t}" width="${plotW}" height="${neverY - pad.t}" fill="#f8f0f0" rx="2"/>`;
  svg += `<text x="${pad.l + 4}" y="${neverY - 4}" font-size="8" fill="#c88" font-family="${SERIF}">Never crosses 50%</text>`;

  svg += `<text x="${pad.l + plotW / 2}" y="${H - 8}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle">Agents (sorted by predicted crossover)</text>`;
  svg += `<text x="12" y="${pad.t + plotH / 2}" font-size="11" fill="#555" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,12,${pad.t + plotH / 2})">Crossover Infection Level</text>`;

  // Predicted crossover line (connecting dots)
  let predPath = '';
  sorted.forEach((a, i) => {
    const px = xScale(i);
    const py = a.predictedCrossover != null ? yScale(a.predictedCrossover) : yScale(7.6);
    predPath += (i === 0 ? 'M' : 'L') + `${px.toFixed(1)},${py.toFixed(1)}`;
  });
  svg += `<path d="${predPath}" fill="none" stroke="${provColor}" stroke-width="1.5" opacity="0.4"/>`;

  // Predicted dots
  sorted.forEach((a, i) => {
    const px = xScale(i);
    const py = a.predictedCrossover != null ? yScale(a.predictedCrossover) : yScale(7.6);
    svg += `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="3.5" fill="${provColor}" fill-opacity="0.6" stroke="${provColor}" stroke-width="0.5"/>`;
  });

  // Actual crossover marks (X marks)
  sorted.forEach((a, i) => {
    const px = xScale(i);
    const actVal = a.actualCrossover;
    const py = actVal != null ? yScale(actVal) : yScale(7.6);
    const s = 3;
    svg += `<line x1="${px - s}" y1="${py - s}" x2="${px + s}" y2="${py + s}" stroke="#e07020" stroke-width="1.5"/>`;
    svg += `<line x1="${px - s}" y1="${py + s}" x2="${px + s}" y2="${py - s}" stroke="#e07020" stroke-width="1.5"/>`;
  });

  // Spearman ρ between predicted and actual crossover ranks
  const predRanks = sorted.map(a => a.predictedCrossover == null ? 999 : a.predictedCrossover);
  const actRanks = sorted.map(a => a.actualCrossover == null ? 999 : a.actualCrossover);
  const rho = spearmanRho(predRanks, actRanks);
  svg += `<text x="${W - pad.r}" y="${pad.t - 8}" font-size="12" fill="#333" font-family="${SERIF}" text-anchor="end" font-weight="bold">Spearman ρ = ${rho.toFixed(3)}</text>`;

  // Legend
  const legX = pad.l + plotW - 160, legY2 = pad.t + 10;
  svg += `<circle cx="${legX}" cy="${legY2}" r="3.5" fill="${provColor}" fill-opacity="0.6" stroke="${provColor}" stroke-width="0.5"/>`;
  svg += `<text x="${legX + 8}" y="${legY2 + 3}" font-size="9" fill="#555" font-family="${SERIF}">Predicted crossover</text>`;
  const s = 3;
  svg += `<line x1="${legX - s}" y1="${legY2 + 16 - s}" x2="${legX + s}" y2="${legY2 + 16 + s}" stroke="#e07020" stroke-width="1.5"/>`;
  svg += `<line x1="${legX - s}" y1="${legY2 + 16 + s}" x2="${legX + s}" y2="${legY2 + 16 - s}" stroke="#e07020" stroke-width="1.5"/>`;
  svg += `<text x="${legX + 8}" y="${legY2 + 19}" font-size="9" fill="#555" font-family="${SERIF}">Actual crossover</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;
}

function renderFig27ConsistencyMatrix(data, elId, modelFilter) {
  const el = document.getElementById(elId || 'fig27-chart');
  if (!el) return;

  let configs = data.configs;
  let labels = data.labels;
  let providers = data.providers;
  let rates = data.rates;

  // Filter to selected models if modelFilter provided
  if (modelFilter) {
    const indices = [];
    configs.forEach((c, i) => { if (modelFilter.has(c)) indices.push(i); });
    configs = indices.map(i => configs[i]);
    labels = indices.map(i => labels[i]);
    providers = indices.map(i => providers[i]);
    rates = indices.map(i => rates[i]);
  }

  const n = configs.length;
  if (n === 0) { el.innerHTML = ''; return; }

  // Compute Spearman correlation matrix
  const rhoMatrix = [];
  for (let i = 0; i < n; i++) {
    rhoMatrix[i] = [];
    for (let j = 0; j < n; j++) {
      rhoMatrix[i][j] = i === j ? 1.0 : spearmanRho(rates[i], rates[j]);
    }
  }

  // Layout
  const cellSize = 32;
  const labelW = 130;
  const topLabelH = 130;
  const pad = 10;
  const padR = 40; // extra right padding for rotated column labels
  const W = labelW + n * cellSize + pad + padR;
  const H = topLabelH + n * cellSize + pad * 2 + 40;

  // Color scale: interpolate from white (rho ~0.4) to blue (rho=1.0)
  function rhoColor(rho) {
    const t = Math.max(0, Math.min(1, (rho - 0.4) / 0.6));
    const r = Math.round(255 - t * 200);
    const g = Math.round(255 - t * 200);
    const b = Math.round(255 - t * 55);
    return `rgb(${r},${g},${b})`;
  }

  let svg = '';
  const ox = pad + labelW;
  const oy = pad + topLabelH;

  // Provider group separators
  const provBreaks = [];
  for (let i = 1; i < n; i++) {
    if (providers[i] !== providers[i - 1]) provBreaks.push(i);
  }

  // Cells
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      const rho = rhoMatrix[i][j];
      const x = ox + j * cellSize;
      const y = oy + i * cellSize;
      svg += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${rhoColor(rho)}" stroke="#fff" stroke-width="1">`;
      svg += `<title>${esc(labels[i])} vs ${esc(labels[j])}: \u03C1 = ${rho.toFixed(3)}</title>`;
      svg += `</rect>`;
      // Show value in cell if big enough
      if (cellSize >= 28) {
        const textColor = rho > 0.8 ? '#fff' : '#333';
        svg += `<text x="${x + cellSize / 2}" y="${y + cellSize / 2 + 3}" font-size="7.5" fill="${textColor}" font-family="${SERIF}" text-anchor="middle">${rho.toFixed(2)}</text>`;
      }
    }
  }

  // Row labels (left)
  for (let i = 0; i < n; i++) {
    const provColor = CONFIG.PROVIDER_COLORS[providers[i]] || '#333';
    svg += `<text x="${ox - 4}" y="${oy + i * cellSize + cellSize / 2 + 3}" font-size="8.5" fill="${provColor}" font-family="${SERIF}" text-anchor="end">${esc(labels[i])}</text>`;
  }

  // Column labels (top, rotated)
  for (let j = 0; j < n; j++) {
    const provColor = CONFIG.PROVIDER_COLORS[providers[j]] || '#333';
    const tx = ox + j * cellSize + cellSize / 2;
    const ty = oy - 4;
    svg += `<text x="${tx}" y="${ty}" font-size="8.5" fill="${provColor}" font-family="${SERIF}" text-anchor="start" transform="rotate(-55,${tx},${ty})">${esc(labels[j])}</text>`;
  }

  // Provider group separator lines
  provBreaks.forEach(idx => {
    const pos = idx * cellSize;
    svg += `<line x1="${ox + pos}" y1="${oy}" x2="${ox + pos}" y2="${oy + n * cellSize}" stroke="#666" stroke-width="1.5"/>`;
    svg += `<line x1="${ox}" y1="${oy + pos}" x2="${ox + n * cellSize}" y2="${oy + pos}" stroke="#666" stroke-width="1.5"/>`;
  });

  // Border
  svg += `<rect x="${ox}" y="${oy}" width="${n * cellSize}" height="${n * cellSize}" fill="none" stroke="#666" stroke-width="1.5"/>`;

  // Color legend
  const legY = oy + n * cellSize + 14;
  const legW = 200;
  const legX = ox + (n * cellSize - legW) / 2;
  for (let i = 0; i < legW; i++) {
    const rho = 0.4 + (i / legW) * 0.6;
    svg += `<rect x="${legX + i}" y="${legY}" width="1.5" height="10" fill="${rhoColor(rho)}"/>`;
  }
  svg += `<text x="${legX}" y="${legY + 22}" font-size="8" fill="#666" font-family="${SERIF}" text-anchor="start">0.4</text>`;
  svg += `<text x="${legX + legW}" y="${legY + 22}" font-size="8" fill="#666" font-family="${SERIF}" text-anchor="end">1.0</text>`;
  svg += `<text x="${legX + legW / 2}" y="${legY + 22}" font-size="8" fill="#666" font-family="${SERIF}" text-anchor="middle">Spearman \u03C1</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
}

init();
