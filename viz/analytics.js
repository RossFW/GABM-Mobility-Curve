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
    modelRates.push({ m, rate: (1 - totalYes / totalN) * 100 });
  });

  if (modelRates.length === 0) { el.innerHTML = '<div style="color:#777">No data loaded</div>'; return; }

  modelRates.sort((a, b) => b.rate - a.rate);
  const highest = modelRates[0];   // highest go-outside = most mobile
  const lowest  = modelRates[modelRates.length - 1]; // lowest go-outside = most cautious
  const spread  = highest.rate - lowest.rate;

  const cards = [
    { val: `${highest.rate.toFixed(1)}%`, lbl: `${highest.m.label} — highest overall mobility`,   color: highest.m.color },
    { val: `${lowest.rate.toFixed(1)}%`,  lbl: `${lowest.m.label} — lowest mobility (most cautious)`, color: lowest.m.color  },
    { val: `${spread.toFixed(0)} pp`,     lbl: `Spread between most and least mobile model`,          color: '#111'          },
    { val: `${modelRates.length}`,        lbl: `Model configurations with complete data`,              color: '#111'          },
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
              axisLabels(w, h, pad, 'New cases (% population)', 'Mobility');
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
      mobilityAt0: rate0 ? 100 - parseFloat(rate0.pct_stay_home) : null, rows,
    };
  });

  const outliers = [];

  const gpt4o = Object.values(modelStats).find(s => s.m.model === 'gpt-4o');
  if (gpt4o) {
    const mobilityRate = 100 - gpt4o.overallRate;
    outliers.push({
      title: `GPT-4o: ${mobilityRate.toFixed(1)}% overall mobility`,
      desc:  'Nearly always goes outside regardless of infection level — the highest-mobility model in the study.',
      color: gpt4o.m.color, rows: gpt4o.rows,
    });
  }

  const lite = Object.values(modelStats).find(s => s.m.model === 'gemini-2.5-flash-lite');
  if (lite) {
    const low  = lite.rows.filter(r => parseFloat(r.infection_level) <= 1.0);
    const high = lite.rows.filter(r => parseFloat(r.infection_level) >= 3.0);
    // Inverted: go-outside = 100 - pct_stay_home
    const avgLow  = low.length  > 0 ? low.reduce( (s,r) => s + (100 - parseFloat(r.pct_stay_home)), 0) / low.length  : 0;
    const avgHigh = high.length > 0 ? high.reduce((s,r) => s + (100 - parseFloat(r.pct_stay_home)), 0) / high.length : 0;
    outliers.push({
      title: 'Gemini 2.5 Flash Lite: Anomalous response curve',
      desc:  `Average mobility at low infection: ${avgLow.toFixed(1)}% vs. high infection: ${avgHigh.toFixed(1)}%. The curve runs backwards — more mobile at higher infection (anomalous).`,
      color: lite.m.color, rows: lite.rows,
    });
  }

  const gpt35 = Object.values(modelStats).find(s => s.m.model === 'gpt-3.5-turbo');
  if (gpt35 && gpt35.mobilityAt0 !== null) {
    outliers.push({
      title: `GPT-3.5 at 0% infection: ${gpt35.mobilityAt0.toFixed(1)}% mobility`,
      desc:  'Under half of agents go outside even with zero reported cases. The Paper 1 model is extremely cautious by default.',
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
  renderS7Concordance(microRows, cfg);
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

  Papa.parse(CONFIG.ALL_MACRO, {
    download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
    complete({ data }) {
      macroData = data;
      document.getElementById('loading').style.display = 'none';

      // Compute OLS for all 21 configs
      computeAllOLS();

      // ── Tab 1: Mobility Curves ────────────────────────────────
      renderS0();
      // s1 (provider envelopes) removed from main flow
      renderFigA();
      renderFigB();
      renderFigAnthro();
      renderFigGeminiLite();
      renderFigD();
      renderFigAnthroGen();
      renderFigC();
      renderFigFlagship();
      renderS2();
      renderS3();
      renderS6();

      // OLS table for Author Note — Paper 1 Legacy
      renderOLSTable('s2-ols',
        ['anthropic_claude-sonnet-4-5_off','openai_gpt-5_2_off','gemini_gemini-3-flash-preview_off',
         'openai_gpt-3_5-turbo_off'],
        'openai_gpt-3_5-turbo_off');

      // S7: agent-level (needs micro data, lazy-loaded)
      document.getElementById('s7-section').style.display = 'block';
      buildModelPicker('s7-model-select', s7SelectedIdx, idx => {
        s7SelectedIdx = idx;
        loadMicro(idx, renderS7);
      });
      loadMicro(s7SelectedIdx, renderS7);

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

function renderTab2() {
  renderFigE();
  renderFigF();
  renderFigG();
  renderFigH();
  renderFigI();
  initFigJ();
}

// ── Provider colors (Okabe-Ito compatible) ────────────────────
const PROV_COLORS = { anthropic: '#7C3AED', openai: '#22C55E', gemini: '#3B82F6' };
const PROV_LABELS = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini' };

// ── Generic scatter SVG (for Figs E, G, H) ───────────────────
function makeScatterSVG(points, opts) {
  // points: [{x, y, color, label, dash}]
  // opts: {w, h, xLabel, yLabel, xFmt, yFmt, fitLine}
  const { w = CW, h = CH, xLabel = '', yLabel = '', xFmt = v => v.toFixed(1),
          yFmt = v => v.toFixed(1), fitLine = null } = opts;
  const pad = { t: 36, r: 40, b: 54, l: 70 };
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.min(...ys), yMax = Math.max(...ys);
  const xPad = (xMax - xMin) * 0.08 || 0.5;
  const yPad = (yMax - yMin) * 0.12 || 1;
  const xLo = xMin - xPad, xHi = xMax + xPad;
  const yLo = yMin - yPad, yHi = yMax + yPad;

  const toSX = x => pad.l + (x - xLo) / (xHi - xLo) * (w - pad.l - pad.r);
  const toSY = y => pad.t + (1 - (y - yLo) / (yHi - yLo)) * (h - pad.t - pad.b);

  // Gridlines
  const nTicksY = 5;
  let svg = '';
  for (let i = 0; i <= nTicksY; i++) {
    const v = yLo + i * (yHi - yLo) / nTicksY;
    const sy = toSY(v);
    svg += `<line x1="${pad.l}" y1="${sy.toFixed(1)}" x2="${w - pad.r}" y2="${sy.toFixed(1)}" stroke="${GRID_COLOR}" stroke-width="1"/>`;
    svg += `<text x="${pad.l - 6}" y="${(sy + 4).toFixed(1)}" fill="${AX_COLOR}" font-size="10" font-family="${SERIF}" text-anchor="end">${yFmt(v)}</text>`;
  }

  // X-axis ticks (auto 5 ticks)
  const nTicksX = 5;
  for (let i = 0; i <= nTicksX; i++) {
    const v = xLo + i * (xHi - xLo) / nTicksX;
    const sx = toSX(v);
    svg += `<line x1="${sx.toFixed(1)}" y1="${pad.t}" x2="${sx.toFixed(1)}" y2="${h - pad.b}" stroke="${GRID_COLOR}" stroke-width="1"/>`;
    svg += `<text x="${sx.toFixed(1)}" y="${h - pad.b + 14}" fill="${AX_COLOR}" font-size="10" font-family="${SERIF}" text-anchor="middle">${xFmt(v)}</text>`;
  }

  // Axis labels
  svg += `<text x="${(pad.l + w - pad.r) / 2}" y="${h - 6}" fill="${AX_COLOR}" font-size="11" font-family="${SERIF}" text-anchor="middle" font-style="italic">${xLabel}</text>`;
  svg += `<text x="${14}" y="${(pad.t + h - pad.b) / 2}" fill="${AX_COLOR}" font-size="11" font-family="${SERIF}" text-anchor="middle" font-style="italic" transform="rotate(-90,14,${(pad.t + h - pad.b) / 2})">${yLabel}</text>`;

  // Fit line
  if (fitLine) {
    const { alpha, beta } = fitLine;
    const x1 = xLo, x2 = xHi;
    const y1 = alpha + beta * x1, y2 = alpha + beta * x2;
    svg += `<line x1="${toSX(x1).toFixed(1)}" y1="${toSY(y1).toFixed(1)}" x2="${toSX(x2).toFixed(1)}" y2="${toSY(y2).toFixed(1)}" stroke="#999" stroke-width="1.5" stroke-dasharray="5,3"/>`;
  }

  // Points (drawn last so they're on top)
  const tooltip = document.createElement('div');
  tooltip.className = 'svg-tooltip';
  const ptsSVG = points.map((p, i) => {
    const sx = toSX(p.x).toFixed(1), sy = toSY(p.y).toFixed(1);
    return `<circle cx="${sx}" cy="${sy}" r="6" fill="${p.color}" stroke="#fff" stroke-width="1.5" opacity="0.9"
      data-label="${esc(p.label)}" data-x="${xFmt(p.x)}" data-y="${yFmt(p.y)}" class="scatter-pt"/>`;
  }).join('');
  svg += ptsSVG;

  return makeSVG(w, h, svg);
}

// Figure E — α vs β scatter
function renderFigE() {
  const el = document.getElementById('figE-chart');
  if (!el || !olsResults.length) return;
  const points = olsResults.map(r => ({
    x: r.b0, y: r.b1, color: PROV_COLORS[r.provider], label: r.label,
  }));
  const w = CW, h = CH;
  el.innerHTML = makeScatterSVG(points, {
    w, h,
    xLabel: 'β₀ — baseline mobility at 0% infection (%)',
    yLabel: 'β₁ — linear coefficient',
    xFmt: v => v.toFixed(0) + '%',
    yFmt: v => v.toFixed(1),
  });

  // Wire tooltips
  el.querySelectorAll('.scatter-pt').forEach(circle => {
    const tt = el.querySelector('.svg-tooltip') || (() => {
      const d = document.createElement('div'); d.className = 'svg-tooltip'; el.appendChild(d); return d;
    })();
    circle.addEventListener('mouseenter', ev => {
      tt.style.display = 'block';
      tt.innerHTML = `<strong>${circle.dataset.label}</strong><br>β₀ = ${circle.dataset.x}<br>β₁ = ${circle.dataset.y}`;
    });
    circle.addEventListener('mousemove', ev => {
      const r = el.getBoundingClientRect();
      tt.style.left = (ev.clientX - r.left + 12) + 'px';
      tt.style.top  = (ev.clientY - r.top  - 10) + 'px';
    });
    circle.addEventListener('mouseleave', () => { tt.style.display = 'none'; });
  });

  // Legend
  const legEl = document.getElementById('figE-legend');
  if (legEl) legEl.innerHTML = ['anthropic','openai','gemini'].map(p =>
    `<div class="legend-item"><div class="legend-swatch" style="background:${PROV_COLORS[p]};height:10px;width:10px;border-radius:50%"></div><span>${PROV_LABELS[p]}</span></div>`
  ).join('');
}

// Figure F — slope ranking horizontal bar chart
function renderFigF() {
  const el = document.getElementById('figF-chart');
  if (!el || !olsResults.length) return;

  const sorted = [...olsResults].sort((a, b) => b.b1 - a.b1);
  const maxBeta = Math.max(...sorted.map(r => r.b1));
  const rowH = 22, padL = 170, padR = 60, padT = 16, padB = 20;
  const w = CW, h = sorted.length * rowH + padT + padB;
  const barW = w - padL - padR;

  let svg = '';
  // Gridlines at 0, 5, 10, ...
  for (let v = 0; v <= Math.ceil(maxBeta + 2); v += 5) {
    const x = padL + (v / (maxBeta + 2)) * barW;
    svg += `<line x1="${x.toFixed(1)}" y1="${padT}" x2="${x.toFixed(1)}" y2="${h - padB}" stroke="${GRID_COLOR}" stroke-width="1"/>`;
    svg += `<text x="${x.toFixed(1)}" y="${h - padB + 12}" fill="${AX_COLOR}" font-size="9" font-family="${SERIF}" text-anchor="middle">${v}</text>`;
  }
  // Zero line
  const x0 = padL + Math.max(0, 0 / (maxBeta + 2)) * barW;
  svg += `<line x1="${x0}" y1="${padT}" x2="${x0}" y2="${h - padB}" stroke="#aaa" stroke-width="1"/>`;

  sorted.forEach((r, i) => {
    const y = padT + i * rowH;
    const bw = (Math.max(0, r.b1) / (maxBeta + 2)) * barW;
    svg += `<rect x="${padL}" y="${y + 3}" width="${bw.toFixed(1)}" height="${rowH - 6}" fill="${PROV_COLORS[r.provider]}" opacity="0.8"/>`;
    svg += `<text x="${padL - 6}" y="${y + rowH / 2 + 4}" fill="${AX_COLOR}" font-size="10" font-family="${SERIF}" text-anchor="end">${esc(r.label)}</text>`;
    svg += `<text x="${(padL + bw + 4).toFixed(1)}" y="${y + rowH / 2 + 4}" fill="#555" font-size="9" font-family="${SERIF}">${r.b1.toFixed(2)}</text>`;
  });

  svg += `<text x="${padL + barW / 2}" y="${h - 4}" fill="${AX_COLOR}" font-size="11" font-family="${SERIF}" text-anchor="middle" font-style="italic">&beta;&#x2081; linear coefficient</text>`;
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="display:block;background:${SVG_BG}">${svgBorder(w, h)}${svg}</svg>`;
}

// Figure G — knowledge cutoff vs β
function renderFigG() {
  const el = document.getElementById('figG-chart');
  if (!el || !olsResults.length || !modelMetadata.length) return;

  const points = olsResults.map(r => {
    const meta = modelMetadata.find(m =>
      m.provider === r.provider && m.alias === r.model && m.reasoning === r.reasoning
    );
    if (!meta) return null;
    const x = parseYearMonth(meta.knowledge_cutoff);
    return x ? { x, y: r.b1, color: PROV_COLORS[r.provider], label: r.label } : null;
  }).filter(Boolean);

  if (!points.length) return;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const fitLine = fitOLS(xs, ys);
  const beta_str = `β = ${fitLine.beta >= 0 ? '+' : ''}${fitLine.beta.toFixed(2)} per year, R² = ${fitLine.r2.toFixed(2)}`;

  el.innerHTML = makeScatterSVG(points, {
    xLabel: `Knowledge cutoff year   [OLS fit: ${beta_str}]`,
    yLabel: 'β₁ — linear coefficient',
    xFmt: v => v.toFixed(1),
    yFmt: v => v.toFixed(1),
    fitLine,
  });
  wireScatterTooltips(el, 'x', 'Knowledge cutoff', 'β');

  const legEl = document.getElementById('figG-legend');
  if (legEl) legEl.innerHTML = ['anthropic','openai','gemini'].map(p =>
    `<div class="legend-item"><div class="legend-swatch" style="background:${PROV_COLORS[p]};height:10px;width:10px;border-radius:50%"></div><span>${PROV_LABELS[p]}</span></div>`
  ).join('');
}

// Figure H — release date vs α
function renderFigH() {
  const el = document.getElementById('figH-chart');
  if (!el || !olsResults.length || !modelMetadata.length) return;

  const points = olsResults.map(r => {
    const meta = modelMetadata.find(m =>
      m.provider === r.provider && m.alias === r.model && m.reasoning === r.reasoning
    );
    if (!meta) return null;
    const x = parseDate(meta.release_date);
    return x ? { x, y: r.b0, color: PROV_COLORS[r.provider], label: r.label } : null;
  }).filter(Boolean);

  if (!points.length) return;
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const fitLine = fitOLS(xs, ys);
  const beta_str = `β = ${fitLine.beta >= 0 ? '+' : ''}${fitLine.beta.toFixed(1)}%/year, R² = ${fitLine.r2.toFixed(2)}`;

  el.innerHTML = makeScatterSVG(points, {
    xLabel: `Model release year   [OLS fit: ${beta_str}]`,
    yLabel: 'β₀ — baseline mobility (%)',
    xFmt: v => v.toFixed(1),
    yFmt: v => v.toFixed(0) + '%',
    fitLine,
  });
  wireScatterTooltips(el, 'x', 'Release year', 'α');

  const legEl = document.getElementById('figH-legend');
  if (legEl) legEl.innerHTML = ['anthropic','openai','gemini'].map(p =>
    `<div class="legend-item"><div class="legend-swatch" style="background:${PROV_COLORS[p]};height:10px;width:10px;border-radius:50%"></div><span>${PROV_LABELS[p]}</span></div>`
  ).join('');
}

// Wire tooltips for generic scatter (post-render)
function wireScatterTooltips(el, xKey, xLbl, yLbl) {
  const svg = el.querySelector('svg');
  if (!svg) return;
  let tt = el.querySelector('.svg-tooltip');
  if (!tt) { tt = document.createElement('div'); tt.className = 'svg-tooltip'; el.appendChild(tt); }
  el.querySelectorAll('.scatter-pt').forEach(c => {
    c.addEventListener('mouseenter', () => {
      tt.style.display = 'block';
      tt.innerHTML = `<strong>${c.dataset.label}</strong><br>${xLbl}: ${c.dataset.x}<br>${yLbl}: ${c.dataset.y}`;
    });
    c.addEventListener('mousemove', ev => {
      const r = el.getBoundingClientRect();
      tt.style.left = (ev.clientX - r.left + 12) + 'px';
      tt.style.top  = (ev.clientY - r.top  - 10) + 'px';
    });
    c.addEventListener('mouseleave', () => { tt.style.display = 'none'; });
  });
}

// Figure I — model family grouped comparison (α and β per model, ordered by release date)
function renderFigI() {
  const el = document.getElementById('figI-chart');
  if (!el || !olsResults.length || !modelMetadata.length) return;

  // Merge OLS + metadata, deduplicate by (provider, model, reasoning)
  // Sort by release_date
  const merged = olsResults.map(r => {
    const meta = modelMetadata.find(m =>
      m.provider === r.provider && m.alias === r.model && m.reasoning === r.reasoning
    );
    if (!meta) return null;
    return { ...r, release_date: parseDate(meta.release_date) };
  }).filter(Boolean).sort((a, b) => (a.release_date || 0) - (b.release_date || 0));

  if (!merged.length) return;

  // Group by provider for labeling
  const providers = ['anthropic', 'openai', 'gemini'];
  const w = CW, padT = 36, padB = 90, padL = 55, padR = 20;
  const rowH = 22, groupGap = 16;
  const nBars = merged.length;
  const barW = Math.floor((w - padL - padR - (providers.length - 1) * groupGap) / nBars) - 2;
  const h = CH;

  const maxAlpha = Math.max(...merged.map(r => r.b0));
  const maxBeta  = Math.max(...merged.map(r => r.b1));
  const maxVal   = Math.max(maxAlpha, maxBeta * 5);  // scale b1 so it's visible alongside b0

  const toBarH = v => ((v / maxVal) * (h - padT - padB));

  let svg = '';
  // Y axis ticks for α (0–100%)
  [0, 25, 50, 75, 100].forEach(v => {
    if (v > maxVal) return;
    const y = h - padB - toBarH(v);
    svg += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${w - padR}" y2="${y.toFixed(1)}" stroke="${GRID_COLOR}" stroke-width="1"/>`;
    svg += `<text x="${padL - 4}" y="${(y + 4).toFixed(1)}" fill="${AX_COLOR}" font-size="9" font-family="${SERIF}" text-anchor="end">${v}%</text>`;
  });

  let x = padL + 4;
  let prevProvider = null;
  merged.forEach((r, i) => {
    if (prevProvider && r.provider !== prevProvider) x += groupGap;
    prevProvider = r.provider;

    const pcolor = PROV_COLORS[r.provider];
    const alphaH = toBarH(r.b0);
    const betaH  = toBarH(r.b1 * 5);  // scale b1 for visibility
    const baseline = h - padB;

    // α bar — handle negative alpha (draw downward)
    const alphaRect = alphaH >= 0
      ? { y: baseline - alphaH, height: alphaH }
      : { y: baseline, height: -alphaH };
    svg += `<rect x="${x.toFixed(1)}" y="${alphaRect.y.toFixed(1)}" width="${barW}" height="${alphaRect.height.toFixed(1)}" fill="${pcolor}" opacity="${alphaH >= 0 ? 0.85 : 0.4}"/>`;

    // β bar — handle negative beta (draw downward, red tint)
    const betaRect = betaH >= 0
      ? { y: baseline - betaH, height: betaH }
      : { y: baseline, height: -betaH };
    const betaFill = betaH >= 0 ? '#111' : '#DC2626';
    svg += `<rect x="${(x + barW * 0.35).toFixed(1)}" y="${betaRect.y.toFixed(1)}" width="${(barW * 0.3).toFixed(1)}" height="${betaRect.height.toFixed(1)}" fill="${betaFill}" opacity="0.5"/>`;

    // Label (rotated)
    svg += `<text x="${(x + barW / 2).toFixed(1)}" y="${h - padB + 10}" fill="${AX_COLOR}" font-size="8" font-family="${SERIF}" text-anchor="end" transform="rotate(-55,${(x + barW / 2).toFixed(1)},${h - padB + 10})">${esc(r.label)}</text>`;
    x += barW + 2;
  });

  // Provider group labels
  let gx = padL + 4;
  let prevProv2 = null;
  providers.forEach(prov => {
    const group = merged.filter(r => r.provider === prov);
    if (!group.length) return;
    if (prevProv2) gx += groupGap;
    const gw = group.length * (barW + 2) - 2;
    svg += `<text x="${(gx + gw / 2).toFixed(1)}" y="${padT - 10}" fill="${PROV_COLORS[prov]}" font-size="10" font-family="${SERIF}" text-anchor="middle" font-weight="bold">${PROV_LABELS[prov]}</text>`;
    gx += gw + 2;
    prevProv2 = prov;
  });

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="display:block;background:${SVG_BG}">${svgBorder(w, h)}${svg}</svg>`;

  const legEl = document.getElementById('figI-legend');
  if (legEl) legEl.innerHTML = `
    <div class="legend-item"><div class="legend-swatch" style="background:#7C3AED;height:10px;border-radius:2px"></div><span>Anthropic &beta;&#x2080;</span></div>
    <div class="legend-item"><div class="legend-swatch" style="background:#22C55E;height:10px;border-radius:2px"></div><span>OpenAI &beta;&#x2080;</span></div>
    <div class="legend-item"><div class="legend-swatch" style="background:#3B82F6;height:10px;border-radius:2px"></div><span>Gemini &beta;&#x2080;</span></div>
    <div class="legend-item"><div class="legend-swatch" style="background:#111;opacity:0.5;height:10px;border-radius:2px"></div><span>&beta;&#x2081; &times;5 (dark overlay)</span></div>`;
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

function renderDateTimeline(containerId, dateField, parseFunc) {
  const el = document.getElementById(containerId);
  if (!el || !modelMetadata.length) return;

  const W = FIG_CW, rowH = 72;
  const providers = ['anthropic', 'openai', 'gemini'];
  const padL = 88, padR = 32, padT = 24, padB = 44;
  const H = rowH * providers.length + padT + padB;

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
    points.push({ x, label: cfg.label, color: cfg.color, provRow, rawDate });
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

  // Year grid lines + labels
  const minYr = Math.floor(minX), maxYr = Math.ceil(maxX);
  for (let yr = minYr; yr <= maxYr; yr++) {
    const sx = toSvgX(yr);
    inner += `<line x1="${sx}" y1="${padT}" x2="${sx}" y2="${H - padB}" stroke="#dddddd" stroke-width="1" stroke-dasharray="3,4"/>`;
    inner += `<text x="${sx}" y="${H - padB + 16}" text-anchor="middle" fill="#888888"
      font-size="10" font-family="${SERIF}">${yr}</text>`;
  }

  // Bucket overlapping dots (tighter 6px bucket for more granular stagger)
  const buckets = {};
  points.forEach(p => {
    const sx = Math.round(toSvgX(p.x) / 6) * 6;
    const key = `${p.provRow}_${sx}`;
    if (!buckets[key]) buckets[key] = [];
    buckets[key].push(p);
  });

  Object.values(buckets).forEach(bucket => {
    const showLabel = bucket.length <= 2; // hide text in crowded buckets — rely on tooltip
    bucket.forEach((p, i) => {
      const sx = toSvgX(p.x);
      const baseY = toSvgY(p.provRow);
      const sy = baseY + (i - (bucket.length - 1) / 2) * 16;
      const short = p.label.replace('Claude ', '').replace(' Preview', '');
      const tipText = `${p.label} — ${fmtMonthYear(p.rawDate)}`;
      inner += `<g class="tl-dot" data-tip="${esc(tipText)}">`;
      inner += `<circle cx="${sx}" cy="${sy}" r="7" fill="transparent"/>`;  // invisible hit area
      inner += `<circle cx="${sx}" cy="${sy}" r="5" fill="${p.color}" opacity="0.85"/>`;
      if (showLabel) {
        inner += `<text x="${sx + 8}" y="${sy + 4}" fill="#333333" font-size="9" font-family="${SERIF}">${esc(short)}</text>`;
      }
      inner += `</g>`;
    });
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
  renderDateTimeline('release-timeline-chart', 'release_date', parseDate);
}

function renderCutoffTimeline() {
  renderDateTimeline('cutoff-timeline-chart', 'knowledge_cutoff', parseYearMonth);
}

init();
