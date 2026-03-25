// analytics-shared.js — Shared globals, utilities, math, data loaders
// Extracted from analytics.js during refactor (March 2026)
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
let _cohortAllRegs = null;
let _cohortConsistencyData = null;
let raTraitData = null;       // trait_mentions.json
let raVerbosityData = null;   // verbosity_stats.json
let raTextSimData = null;     // response_text_similarity.json
let raFigsRendered = false;

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

// ── Provider colors (Okabe-Ito compatible) ────────────────────
const PROV_COLORS = { anthropic: '#7C3AED', openai: '#22C55E', gemini: '#3B82F6' };
const PROV_LABELS = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini' };

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

const TL_MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
function fmtMonthYear(s) {
  const parts = String(s).split('-');
  return `${TL_MONTHS[+parts[1] - 1]} ${parts[0]}`;
}

function loadAgentsJSON(callback) {
  if (agentsData) { callback(agentsData); return; }
  fetch('agents/agents.json?v=' + Date.now())
    .then(r => r.json())
    .then(data => { agentsData = data; callback(data); });
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

/* ── computeTraitPowerRatios — shared between Cohort + Response Analysis ── */
function computeTraitPowerRatios(regData) {
  const coefs = regData.model2.coefficients;
  const b1 = coefs.infection_pct.estimate;
  const b2 = coefs.infection_pct_sq.estimate;

  // Infection log-odds range: evaluate at x=0, x=7, x=vertex (matches Fig 28 cohort)
  const xVertex = -b1 / (2 * b2);
  const xClamped = Math.min(7, Math.max(0, xVertex));
  const vals = [0, b1 * 7 + b2 * 49, b1 * xClamped + b2 * xClamped * xClamped];
  const infPower = Math.max(Math.abs(Math.min(...vals)), Math.abs(Math.max(...vals)));

  // 5 Big Five traits (adjective labels = dummy variable = 1 pole)
  const traits = ['extraverted', 'agreeable', 'conscientious', 'emot_stable', 'open_to_exp'];
  const traitLabels = ['Extraverted', 'Agreeable', 'Conscientious', 'Emotionally Stable', 'Open to Experience'];
  const traitRatios = traits.map((t, i) => ({
    trait: t,
    label: traitLabels[i],
    beta: coefs[t].estimate,
    absBeta: Math.abs(coefs[t].estimate),
    ratio: infPower > 0 ? Math.abs(coefs[t].estimate) / infPower : 0,
    significant: coefs[t].p < 0.05,
  }));

  // Combined swing: Big Five + male + age (full range 18–65 = 47 years)
  const bigFiveSwing = traits.reduce((s, t) => s + Math.abs(coefs[t].estimate), 0);
  const maleEffect = Math.abs(coefs.male.estimate);
  const ageEffect = Math.abs(coefs.age.estimate * 47);
  const combinedSwing = bigFiveSwing + maleEffect + ageEffect;

  return {
    infPower,
    xPeak: xClamped,
    traitRatios,
    bigFiveSwing,
    maleEffect,
    ageEffect,
    combinedSwing,
    combinedRatio: infPower > 0 ? combinedSwing / infPower : 0,
    bigFiveRatio: infPower > 0 ? bigFiveSwing / infPower : 0,
  };
}
