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
let tab2Rendered = false;
let tab3Rendered = false;
let agentsData = null; // cached agents.json
let tabRegRendered = false;

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
  document.querySelectorAll('#author-section-nav .section-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      filterSectionTab('tab-author', 'author-section-nav', link.dataset.filter);
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
      // Lazy-render Tab 2 on first visit
      if (tab === 'characteristics' && !tab2Rendered && olsResults.length) {
        renderTab2();
        tab2Rendered = true;
      }
      // Lazy-render Agent Analysis on first visit
      if (tab === 'agents' && !tab3Rendered) {
        renderAgentAnalysis();
        tab3Rendered = true;
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

      // Load metadata for Tab 2 (background load)
      Papa.parse('data/metadata/models.csv', {
        download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
        complete({ data }) {
          modelMetadata = data;
          renderReleaseTimeline();
          renderCutoffTimeline();
          // If user already clicked Tab 2 before metadata loaded, render now
          if (document.getElementById('tab-characteristics').classList.contains('active') && !tab2Rendered) {
            renderTab2();
            tab2Rendered = true;
          }
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
  html += '<h4 style="margin:18px 0 8px;font-size:14px;color:#111">2. Reading the regression table (Figure 25)</h4>';
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
  html += '<p>See <strong>Figure 24</strong> (trait scatter) and <strong>Figure 26</strong> (cross-model forest plot) for visual comparisons across all 21 configurations.</p>';

  html += '</div>';
  el.innerHTML = html;
}

function renderTab2() {
  // Fig 22b: concordance (moved from Agent Analysis)
  buildModelPicker('concordance-model-select', 0, idx => {
    loadMicro(idx, (rows, cfg) => renderFig22bConcordance(rows, cfg));
  });
  loadMicro(0, (rows, cfg) => renderFig22bConcordance(rows, cfg));
}

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

function renderAgentAnalysis() {
  // Fig 22: heatmap (moved from Fig 10 — reuse existing s7 code)
  document.getElementById('s7-section').style.display = 'block';
  buildModelPicker('s7-model-select', s7SelectedIdx, idx => {
    s7SelectedIdx = idx;
    loadMicro(idx, renderS7);
  });
  loadMicro(s7SelectedIdx, renderS7);

  // Fig 21: demographics
  loadAgentsJSON(renderFig21Demographics);

  // Fig 23: agent spotlight
  loadAgentsJSON(initFig23Spotlight);

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

  // Fig 26: cross-model trait forest plot + interpretation guide
  loadAllRegressions(renderFig26ForestPlot);
  renderFig26Guide();

  // Fig 27: agent consistency matrix
  loadAgentConsistency(renderFig27ConsistencyMatrix);
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
  const gap = 40; // gap between left and right panels
  const halfW = (W - gap) / 2;
  const labelW = 110; // space for trait dimension labels (shared center)
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
  const lBarMax = halfW - L.padL - L.padR - labelW;
  const lScale = lBarMax / 100; // 100% max

  let svg = `<text x="${halfW / 2}" y="14" font-size="12" font-weight="bold" fill="#111" font-family="${SERIF}" text-anchor="middle">% Never Transitioned</text>`;
  svg += `<text x="${halfW / 2}" y="28" font-size="10" fill="#888" font-family="${SERIF}" font-style="italic" text-anchor="middle">${esc(cfg.label)}</text>`;

  traitData.forEach((td, i) => {
    const y = 44 + i * rowH;
    // Trait dimension label — centered in gap between panels
    svg += `<text x="${halfW + gap / 2}" y="${y + barH + 6}" font-size="10" fill="#333" font-family="${SERIF}" text-anchor="middle" font-weight="bold">${td.dim.name}</text>`;

    // Hi trait bar (grows right-to-left from label area)
    const barAreaRight = halfW - labelW;
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
  svg += `<text x="${R.x + halfW / 2}" y="28" font-size="10" fill="#888" font-family="${SERIF}" font-style="italic" text-anchor="middle">among transitioned agents</text>`;

  traitData.forEach((td, i) => {
    const y = 44 + i * rowH;
    const barX = R.x + R.padL;
    const barMaxW = halfW - R.padL - R.padR;

    // Hi trait bar
    if (td.hiMean !== null) {
      const hiW = Math.min(Math.max(td.hiMean * rScale, 2), barMaxW);
      svg += `<rect x="${barX}" y="${y}" width="${hiW.toFixed(1)}" height="${barH}" fill="${td.color}" opacity="0.8" rx="2"/>`;
      const hiLabel = `${td.dim.hi} (${td.hiMean.toFixed(1)}%) n=${td.hiTransN}`;
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
      const loLabel = `${td.dim.lo} (${td.loMean.toFixed(1)}%) n=${td.loTransN}`;
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

function renderFig26ForestPlot(allRegs) {
  const el = document.getElementById('fig26-chart');
  if (!el) return;

  const TRAIT_MAP = [
    { key: 'extraverted',   label: 'Extraversion (vs. Introversion)',                          leftDir: 'Extraverts go out more than Introverts',                                         rightDir: 'Extraverts stay home more than Introverts',                                         traitNoun: 'Extraverts',                         refNoun: 'Introverts' },
    { key: 'agreeable',     label: 'Agreeableness (vs. Antagonism)',                           leftDir: 'Agreeable people go out more than Antagonistic people',                           rightDir: 'Agreeable people stay home more than Antagonistic people',                           traitNoun: 'Agreeable people',                    refNoun: 'Antagonistic people' },
    { key: 'conscientious', label: 'Conscientiousness (vs. Unconscientiousness)',              leftDir: 'Conscientious people go out more than Unconscientious people',                    rightDir: 'Conscientious people stay home more than Unconscientious people',                    traitNoun: 'Conscientious people',                refNoun: 'Unconscientious people' },
    { key: 'emot_stable',   label: 'Emotional Stability (vs. Neuroticism)',                    leftDir: 'Emotionally stable people go out more than Neurotic people',                      rightDir: 'Emotionally stable people stay home more than Neurotic people',                      traitNoun: 'Emotionally stable people',           refNoun: 'Neurotic people' },
    { key: 'open_to_exp',   label: 'Openness to Experience (vs. Closedness to Experience)',    leftDir: 'People open to experience go out more than those closed to experience',            rightDir: 'People open to experience stay home more than those closed to experience',            traitNoun: 'People open to experience',           refNoun: 'People closed to experience' },
    { key: 'male',          label: 'Male (vs. Female)',                                        leftDir: 'Males go out more than Females',                                                 rightDir: 'Males stay home more than Females',                                                 traitNoun: 'Males',                               refNoun: 'Females' },
    { key: 'age',           label: 'Age (per year older)',                                     leftDir: 'Older people go out more than Younger people',                                   rightDir: 'Older people stay home more than Younger people',                                   traitNoun: null,                                  refNoun: null },
  ];

  // Collect configs in display order (matches CONFIG.MODELS)
  const configs = [];
  const seen = new Set();
  CONFIG.MODELS.forEach(m => {
    const key = configDirKey(m);
    if (seen.has(key)) return;
    seen.add(key);
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

function renderFig27ConsistencyMatrix(data) {
  const el = document.getElementById('fig27-chart');
  if (!el) return;

  const configs = data.configs;
  const labels = data.labels;
  const providers = data.providers;
  const rates = data.rates;
  const n = configs.length;

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
  const W = labelW + n * cellSize + pad * 2;
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
