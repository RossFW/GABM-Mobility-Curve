// ============================================================
// GABM Mobility Curve — Analytics  (Paper 3 — story-driven figures)
// Pure SVG charts, no Phaser dependency.
// Depends on: papaparse.min.js, config.js (CONFIG.MODELS, etc.)
// ============================================================
'use strict';

let macroData = [];   // all_macro.csv rows
let microCache = {};  // dirKey → micro CSV rows (loaded on demand)

// ── Chart geometry ───────────────────────────────────────────
const CW = 1100, CH = 420, PAD = { t: 30, r: 30, b: 50, l: 60 };
const SMALL_CW = 350, SMALL_CH = 300, SMALL_PAD = { t: 24, r: 20, b: 44, l: 50 };

const LEVELS = CONFIG.INFECTION_LEVELS;

// ── Helpers ──────────────────────────────────────────────────
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

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

// ── SVG axis helpers ─────────────────────────────────────────
function xAxisTicks(w, h, pad) {
  const ticks = [0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 3.5, 4.0, 5.0, 6.0, 7.0];
  return ticks.map(t => {
    const x = levelToX(t, w, pad);
    return `<text x="${x}" y="${h - pad.b + 14}" fill="#4a6580" font-size="5" font-family="'Press Start 2P',monospace" text-anchor="middle">${t}%</text>` +
           `<line x1="${x}" y1="${h - pad.b}" x2="${x}" y2="${h - pad.b + 4}" stroke="#2a3a4a"/>`;
  }).join('');
}

function yAxisTicks(w, h, pad) {
  return [0, 25, 50, 75, 100].map(v => {
    const y = pctToY(v, h, pad);
    return `<text x="${pad.l - 8}" y="${y + 2}" fill="#4a6580" font-size="5" font-family="'Press Start 2P',monospace" text-anchor="end">${v}%</text>` +
           `<line x1="${pad.l}" y1="${y}" x2="${w - pad.r}" y2="${y}" stroke="#1a2233" stroke-width="0.5"/>`;
  }).join('');
}

function axisLabels(w, h, pad, xlabel, ylabel) {
  return `<text x="${(pad.l + w - pad.r) / 2}" y="${h - 6}" fill="#3a5068" font-size="5" font-family="'Press Start 2P',monospace" text-anchor="middle">${xlabel}</text>` +
         `<text x="10" y="${(pad.t + h - pad.b) / 2}" fill="#3a5068" font-size="5" font-family="'Press Start 2P',monospace" text-anchor="middle" transform="rotate(-90,10,${(pad.t + h - pad.b) / 2})">${ylabel}</text>`;
}

function svgFrame(w, h) {
  return `<rect width="${w}" height="${h}" fill="#080c14"/>`;
}

// ── Build polyline from sorted rows ──────────────────────────
function makePolyline(rows, w, h, pad) {
  const sorted = [...rows].sort((a, b) => a.infection_level - b.infection_level);
  return sorted.map(r =>
    `${levelToX(r.infection_level, w, pad).toFixed(1)},${pctToY(r.pct_stay_home, h, pad).toFixed(1)}`
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
    tooltip.innerHTML = `<span style="color:${color};font-weight:600">${label}</span>${extra ? '<br>' + extra : ''}`;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
    tooltip.style.top = (e.clientY - rect.top - 24) + 'px';
  });
  container.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
}

// ── Build legend HTML for an array of {label, color, dash?} ──
function legendHTML(items) {
  return items.map(item => {
    const bg = item.dash
      ? `background:repeating-linear-gradient(90deg, ${item.color} 0px, ${item.color} 4px, transparent 4px, transparent 7px)`
      : `background:${item.color}`;
    return `<div class="legend-item"><div class="legend-swatch" style="${bg}"></div><span>${item.label}</span></div>`;
  }).join('');
}

// ═══════════════════════════════════════════════════════════════
// S0: Headline Summary Card
// ═══════════════════════════════════════════════════════════════
function renderS0() {
  const el = document.getElementById('s0-card');
  const grouped = groupByModel(macroData);

  // Compute overall yes rate per model
  const modelRates = [];
  CONFIG.MODELS.forEach(m => {
    const k = modelKey(m);
    const rows = grouped[k];
    if (!rows) return;
    const totalYes = rows.reduce((s, r) => s + (parseFloat(r.n_yes) || 0), 0);
    const totalN = rows.reduce((s, r) => s + (parseFloat(r.n_total) || 0), 0);
    if (totalN === 0) return;
    modelRates.push({ m, rate: totalYes / totalN * 100 });
  });

  if (modelRates.length === 0) { el.innerHTML = '<div style="color:#64748b">No data loaded</div>'; return; }

  modelRates.sort((a, b) => b.rate - a.rate);
  const highest = modelRates[0];
  const lowest = modelRates[modelRates.length - 1];
  const spread = highest.rate - lowest.rate;

  // Provider averages
  const provAvg = {};
  modelRates.forEach(({ m, rate }) => {
    if (!provAvg[m.provider]) provAvg[m.provider] = { sum: 0, n: 0 };
    provAvg[m.provider].sum += rate;
    provAvg[m.provider].n++;
  });

  const cards = [
    { val: `${highest.rate.toFixed(1)}%`, lbl: `${highest.m.label} — highest overall stay-home rate`, color: highest.m.color },
    { val: `${lowest.rate.toFixed(1)}%`, lbl: `${lowest.m.label} — lowest overall stay-home rate`, color: lowest.m.color },
    { val: `${spread.toFixed(0)}pp`, lbl: `Spread between most and least cautious model`, color: '#e2e8f0' },
    { val: `${modelRates.length}`, lbl: `Model configurations with complete data`, color: '#e2e8f0' },
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
  const el = document.getElementById('s1-chart');
  const legendEl = document.getElementById('s1-legend');
  const w = CW, h = CH, pad = PAD;
  const grouped = groupByModel(macroData);

  const providers = ['anthropic', 'openai', 'gemini'];
  const provLabels = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini' };

  // Collect per-provider per-level data
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
  providers.forEach(p => {
    if (s1HiddenProviders.has(p)) return;
    const color = CONFIG.PROVIDER_COLORS[p];
    const levelMap = providerLevelData[p];
    const sortedLevels = Object.keys(levelMap).map(Number).sort((a, b) => a - b);
    if (sortedLevels.length === 0) return;

    const stats = sortedLevels.map(level => {
      const vals = levelMap[level];
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      return { level, avg, min: Math.min(...vals), max: Math.max(...vals) };
    });

    // Envelope
    const upper = stats.map(s => `${levelToX(s.level, w, pad).toFixed(1)},${pctToY(s.max, h, pad).toFixed(1)}`);
    const lower = [...stats].reverse().map(s => `${levelToX(s.level, w, pad).toFixed(1)},${pctToY(s.min, h, pad).toFixed(1)}`);
    providerSvg += `<polygon points="${[...upper, ...lower].join(' ')}" fill="${color}" opacity="0.12"/>`;

    // Mean line
    const avgLine = stats.map(s => `${levelToX(s.level, w, pad).toFixed(1)},${pctToY(s.avg, h, pad).toFixed(1)}`).join(' ');
    providerSvg += `<polyline points="${avgLine}" stroke="${color}" stroke-width="2.5" fill="none" opacity="0.85"/>`;

    // Hit target for tooltip
    providerSvg += `<polyline points="${avgLine}" stroke="transparent" stroke-width="16" fill="none" class="hit-target" data-label="${provLabels[p]} (mean)" data-color="${color}"/>`;
  });

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="display:block;background:#080c14">
    ${svgFrame(w, h)}
    ${yAxisTicks(w, h, pad)}
    ${xAxisTicks(w, h, pad)}
    ${axisLabels(w, h, pad, 'INFECTION LEVEL', '% STAY HOME')}
    ${providerSvg}
  </svg>`;

  wireTooltips(el);

  // Legend with toggle
  legendEl.innerHTML = providers.map(p => {
    const hidden = s1HiddenProviders.has(p);
    const color = CONFIG.PROVIDER_COLORS[p];
    return `<div class="legend-item" data-provider="${p}" style="opacity:${hidden ? 0.3 : 0.9}">
      <div class="legend-swatch" style="background:${color}"></div>
      <span style="color:${color}">${provLabels[p]}</span>
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
// S2: Paper 1 Legacy Comparison
// ═══════════════════════════════════════════════════════════════
function renderS2() {
  const el = document.getElementById('s2-chart');
  const legendEl = document.getElementById('s2-legend');
  const w = CW, h = CH, pad = PAD;
  const grouped = groupByModel(macroData);

  // GPT-3.5 is the legacy model
  const gpt35 = CONFIG.MODELS.find(m => m.model === 'gpt-3.5-turbo');
  // Representative modern models (one per provider, reasoning=off, latest gen)
  const modernReps = [
    CONFIG.MODELS.find(m => m.model === 'claude-sonnet-4-5'),
    CONFIG.MODELS.find(m => m.model === 'gpt-5.2' && m.reasoning === 'off'),
    CONFIG.MODELS.find(m => m.model === 'gemini-3-flash-preview' && m.reasoning === 'off'),
  ].filter(Boolean);

  const highlightKeys = new Set();
  if (gpt35) highlightKeys.add(modelKey(gpt35));
  modernReps.forEach(m => highlightKeys.add(modelKey(m)));

  let lines = '';
  let hitTargets = '';
  const legendItems = [];

  // All models as gray background
  CONFIG.MODELS.forEach(m => {
    const k = modelKey(m);
    const rows = grouped[k];
    if (!rows || rows.length === 0) return;
    if (highlightKeys.has(k)) return; // draw highlighted ones on top
    const pts = makePolyline(rows, w, h, pad);
    const dashAttr = m.dash ? ` stroke-dasharray="${m.dash}"` : '';
    lines += `<polyline points="${pts}" stroke="#334155" stroke-width="1" fill="none" opacity="0.4"${dashAttr} data-config="${esc(k)}"/>`;
    hitTargets += `<polyline points="${pts}" stroke="transparent" stroke-width="14" fill="none" class="hit-target" data-config="${esc(k)}" data-label="${esc(m.label)}" data-color="#94a3b8"/>`;
  });

  // Highlighted modern reps
  modernReps.forEach(m => {
    const k = modelKey(m);
    const rows = grouped[k];
    if (!rows || rows.length === 0) return;
    const pts = makePolyline(rows, w, h, pad);
    lines += `<polyline points="${pts}" stroke="${m.color}" stroke-width="2" fill="none" opacity="0.9"/>`;
    hitTargets += `<polyline points="${pts}" stroke="transparent" stroke-width="14" fill="none" class="hit-target" data-label="${esc(m.label)}" data-color="${m.color}"/>`;
    legendItems.push({ label: m.label, color: m.color });
  });

  // GPT-3.5 on top, bold + dashed in amber
  if (gpt35) {
    const k = modelKey(gpt35);
    const rows = grouped[k];
    if (rows && rows.length > 0) {
      const pts = makePolyline(rows, w, h, pad);
      lines += `<polyline points="${pts}" stroke="#F59E0B" stroke-width="3" fill="none" opacity="1" stroke-dasharray="8,4"/>`;
      hitTargets += `<polyline points="${pts}" stroke="transparent" stroke-width="14" fill="none" class="hit-target" data-label="GPT-3.5 Turbo (Paper 1)" data-color="#F59E0B"/>`;
      legendItems.unshift({ label: 'GPT-3.5 Turbo (Paper 1)', color: '#F59E0B', dash: '8,4' });
    }
  }

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="display:block;background:#080c14">
    ${svgFrame(w, h)}
    ${yAxisTicks(w, h, pad)}
    ${xAxisTicks(w, h, pad)}
    ${axisLabels(w, h, pad, 'INFECTION LEVEL', '% STAY HOME')}
    ${lines}${hitTargets}
  </svg>`;

  wireTooltips(el);
  legendEl.innerHTML = legendHTML(legendItems);
  document.getElementById('s2-section').style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
// S3: Small Multiples by Provider
// ═══════════════════════════════════════════════════════════════
function renderS3() {
  const facets = document.getElementById('s3-facets');
  const grouped = groupByModel(macroData);
  const w = SMALL_CW, h = SMALL_CH, pad = SMALL_PAD;

  const groups = [
    { title: 'ANTHROPIC', filter: m => m.provider === 'anthropic' },
    { title: 'OPENAI', filter: m => m.provider === 'openai' },
    { title: 'GEMINI', filter: m => m.provider === 'gemini' },
  ];

  facets.innerHTML = groups.map(g => {
    const models = CONFIG.MODELS.filter(g.filter);
    let lines = '', hitTargets = '';
    const legendItems = [];

    models.forEach(m => {
      const k = modelKey(m);
      const rows = grouped[k];
      if (!rows || rows.length === 0) return;
      const pts = makePolyline(rows, w, h, pad);
      const dashAttr = m.dash ? ` stroke-dasharray="${m.dash}"` : '';
      lines += `<polyline points="${pts}" stroke="${m.color}" stroke-width="1.6" fill="none" opacity="0.85"${dashAttr} data-config="${esc(k)}"/>`;
      hitTargets += `<polyline points="${pts}" stroke="transparent" stroke-width="14" fill="none" class="hit-target" data-config="${esc(k)}" data-label="${esc(m.label)}" data-color="${m.color}"/>`;
      legendItems.push({ label: m.label, color: m.color, dash: m.dash });
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="display:block;background:#080c14">
      ${svgFrame(w, h)}
      ${yAxisTicks(w, h, pad)}
      ${xAxisTicks(w, h, pad)}
      ${axisLabels(w, h, pad, 'INFECTION LEVEL', '% STAY HOME')}
      ${lines}${hitTargets}
    </svg>`;

    return `<div class="facet-panel">
      <div class="facet-label">${g.title}</div>
      <div class="chart-container">${svg}</div>
      <div class="legend" style="margin-top:6px">${legendHTML(legendItems)}</div>
    </div>`;
  }).join('');

  facets.querySelectorAll('.chart-container').forEach(wireTooltips);
  document.getElementById('s3-section').style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
// S4: Reasoning Dose-Response
// ═══════════════════════════════════════════════════════════════
function renderS4() {
  const facets = document.getElementById('s4-facets');
  const grouped = groupByModel(macroData);
  const w = SMALL_CW * 1.5, h = SMALL_CH, pad = SMALL_PAD;

  const groups = [
    { title: 'GPT-5.2 (OFF → HIGH)', filter: m => m.model === 'gpt-5.2' },
    { title: 'GEMINI 3 FLASH (OFF → HIGH)', filter: m => m.model === 'gemini-3-flash-preview' },
  ];

  const reasoningOrder = ['off', 'low', 'medium', 'high'];
  const reasoningLabels = { off: 'Off', low: 'Low', medium: 'Med', high: 'High' };

  facets.innerHTML = groups.map(g => {
    const models = CONFIG.MODELS.filter(g.filter).sort((a, b) =>
      reasoningOrder.indexOf(a.reasoning) - reasoningOrder.indexOf(b.reasoning)
    );
    let lines = '', hitTargets = '';
    const legendItems = [];

    // Use a sequential ramp for reasoning levels
    const rampColors = ['#166534', '#22C55E', '#86EFAC', '#DCFCE7'];
    if (g.filter({ model: 'gemini-3-flash-preview' })) {
      rampColors[0] = '#1E3A5F'; rampColors[1] = '#3B82F6'; rampColors[2] = '#93C5FD'; rampColors[3] = '#DBEAFE';
    }

    models.forEach((m, i) => {
      const k = modelKey(m);
      const rows = grouped[k];
      if (!rows || rows.length === 0) return;
      const pts = makePolyline(rows, w, h, pad);
      const color = rampColors[i] || m.color;
      const dashAttr = m.dash ? ` stroke-dasharray="${m.dash}"` : '';
      lines += `<polyline points="${pts}" stroke="${color}" stroke-width="2" fill="none" opacity="0.9"${dashAttr}/>`;
      hitTargets += `<polyline points="${pts}" stroke="transparent" stroke-width="14" fill="none" class="hit-target" data-label="${esc(m.label)}" data-color="${color}"/>`;
      legendItems.push({ label: reasoningLabels[m.reasoning] || m.reasoning, color, dash: m.dash });
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="display:block;background:#080c14">
      ${svgFrame(w, h)}
      ${yAxisTicks(w, h, pad)}
      ${xAxisTicks(w, h, pad)}
      ${axisLabels(w, h, pad, 'INFECTION LEVEL', '% STAY HOME')}
      ${lines}${hitTargets}
    </svg>`;

    return `<div class="facet-panel">
      <div class="facet-label">${g.title}</div>
      <div class="chart-container">${svg}</div>
      <div class="legend" style="margin-top:6px">${legendHTML(legendItems)}</div>
    </div>`;
  }).join('');

  facets.querySelectorAll('.chart-container').forEach(wireTooltips);
  document.getElementById('s4-section').style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
// S5: Generational Progression
// ═══════════════════════════════════════════════════════════════
function renderS5() {
  const facets = document.getElementById('s5-facets');
  const grouped = groupByModel(macroData);
  const w = SMALL_CW, h = SMALL_CH, pad = SMALL_PAD;

  const groups = [
    { title: 'ANTHROPIC', filter: m => m.provider === 'anthropic' },
    { title: 'OPENAI', filter: m => m.provider === 'openai' && (m.reasoning === 'off' || m.reasoning === 'required') },
    { title: 'GEMINI', filter: m => m.provider === 'gemini' && m.reasoning === 'off' },
  ];

  facets.innerHTML = groups.map(g => {
    const models = CONFIG.MODELS.filter(g.filter).sort((a, b) => (a.generation || 0) - (b.generation || 0));
    let lines = '', hitTargets = '';
    const legendItems = [];

    models.forEach(m => {
      const k = modelKey(m);
      const rows = grouped[k];
      if (!rows || rows.length === 0) return;
      const pts = makePolyline(rows, w, h, pad);
      const dashAttr = m.dash ? ` stroke-dasharray="${m.dash}"` : '';
      lines += `<polyline points="${pts}" stroke="${m.color}" stroke-width="1.6" fill="none" opacity="0.85"${dashAttr}/>`;
      hitTargets += `<polyline points="${pts}" stroke="transparent" stroke-width="14" fill="none" class="hit-target" data-label="${esc(m.label)}" data-color="${m.color}"/>`;
      legendItems.push({ label: m.label, color: m.color, dash: m.dash });
    });

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="display:block;background:#080c14">
      ${svgFrame(w, h)}
      ${yAxisTicks(w, h, pad)}
      ${xAxisTicks(w, h, pad)}
      ${axisLabels(w, h, pad, 'INFECTION LEVEL', '% STAY HOME')}
      ${lines}${hitTargets}
    </svg>`;

    return `<div class="facet-panel">
      <div class="facet-label">${g.title}</div>
      <div class="chart-container">${svg}</div>
      <div class="legend" style="margin-top:6px">${legendHTML(legendItems)}</div>
    </div>`;
  }).join('');

  facets.querySelectorAll('.chart-container').forEach(wireTooltips);
  document.getElementById('s5-section').style.display = 'block';
}

// ═══════════════════════════════════════════════════════════════
// S6: Outlier Spotlights
// ═══════════════════════════════════════════════════════════════
function renderS6() {
  const el = document.getElementById('s6-cards');
  const grouped = groupByModel(macroData);

  // Compute overall yes rate per model for spotlights
  const modelStats = {};
  CONFIG.MODELS.forEach(m => {
    const k = modelKey(m);
    const rows = grouped[k];
    if (!rows) return;
    const totalYes = rows.reduce((s, r) => s + (parseFloat(r.n_yes) || 0), 0);
    const totalN = rows.reduce((s, r) => s + (parseFloat(r.n_total) || 0), 0);
    const rate0 = rows.find(r => parseFloat(r.infection_level) === 0);
    modelStats[k] = {
      m,
      overallRate: totalN > 0 ? totalYes / totalN * 100 : 0,
      stayHomeAt0: rate0 ? parseFloat(rate0.pct_stay_home) : null,
      rows,
    };
  });

  // Find outliers
  const outliers = [];

  // GPT-4o: nearly never stays home
  const gpt4o = Object.values(modelStats).find(s => s.m.model === 'gpt-4o');
  if (gpt4o) {
    outliers.push({
      title: `GPT-4o: ${gpt4o.overallRate.toFixed(1)}% stay-home rate`,
      desc: 'Almost never stays home regardless of infection level. One of the most "go out" models in the study.',
      color: gpt4o.m.color,
      m: gpt4o.m, rows: gpt4o.rows,
    });
  }

  // Gemini 2.5 Flash Lite: inverted curve
  const lite = Object.values(modelStats).find(s => s.m.model === 'gemini-2.5-flash-lite');
  if (lite) {
    const low = lite.rows.filter(r => parseFloat(r.infection_level) <= 1.0);
    const high = lite.rows.filter(r => parseFloat(r.infection_level) >= 3.0);
    const avgLow = low.length > 0 ? low.reduce((s, r) => s + parseFloat(r.pct_stay_home), 0) / low.length : 0;
    const avgHigh = high.length > 0 ? high.reduce((s, r) => s + parseFloat(r.pct_stay_home), 0) / high.length : 0;
    outliers.push({
      title: `Gemini 2.5 Flash Lite: Inverted curve`,
      desc: `Avg stay-home at low infection: ${avgLow.toFixed(1)}% vs high infection: ${avgHigh.toFixed(1)}%. The curve runs backwards — more cautious when infection is low.`,
      color: lite.m.color,
      m: lite.m, rows: lite.rows,
    });
  }

  // GPT-3.5 at 0% infection
  const gpt35 = Object.values(modelStats).find(s => s.m.model === 'gpt-3.5-turbo');
  if (gpt35 && gpt35.stayHomeAt0 !== null) {
    outliers.push({
      title: `GPT-3.5 at 0% infection: ${gpt35.stayHomeAt0.toFixed(1)}% stay home`,
      desc: 'Over half of agents stay home even with zero reported cases. The Paper 1 model is extremely cautious by default.',
      color: gpt35.m.color,
      m: gpt35.m, rows: gpt35.rows,
    });
  }

  // Mini-chart for each outlier
  const miniW = 280, miniH = 140, miniPad = { t: 16, r: 14, b: 30, l: 40 };
  el.innerHTML = outliers.map(o => {
    let miniSvg = '';
    if (o.rows) {
      const pts = makePolyline(o.rows, miniW, miniH, miniPad);
      miniSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${miniW}" height="${miniH}" style="display:block;background:#080c14;border-radius:3px;margin-top:4px">
        ${svgFrame(miniW, miniH)}
        ${yAxisTicks(miniW, miniH, miniPad)}
        <polyline points="${pts}" stroke="${o.color}" stroke-width="2" fill="none" opacity="0.9"/>
      </svg>`;
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
  const el = document.getElementById(containerId);
  const providers = ['anthropic', 'openai', 'gemini'];
  const labels = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini' };

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
  const m = CONFIG.MODELS[modelIdx];
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
      if (hmEl) hmEl.innerHTML = '<div style="color:#f87171;padding:20px;font-size:12px">Failed to load micro data for ' + esc(m.label) + '</div>';
    },
  });
}

function renderS7Heatmap(microRows, cfg) {
  const el = document.getElementById('s7-heatmap');

  // Compute majority vote per agent × level
  const agentLevelVotes = {};
  microRows.forEach(r => {
    if (!agentLevelVotes[r.agent_id]) agentLevelVotes[r.agent_id] = {};
    if (!agentLevelVotes[r.agent_id][r.infection_level]) agentLevelVotes[r.agent_id][r.infection_level] = { yes: 0, no: 0 };
    agentLevelVotes[r.agent_id][r.infection_level][r.response]++;
  });

  const agentIds = Object.keys(agentLevelVotes).map(Number).sort((a, b) => a - b);

  // Sort agents by transition point
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
  const ox = 50, oy = 20;
  const legendW = 130;
  const containerW = (el.parentElement?.offsetWidth || el.offsetWidth || 1100);
  const availW = Math.max(120, containerW - ox - legendW - 20);
  const cellW = Math.max(4, Math.floor(availW / nLevels));
  const cellH = Math.max(2, Math.round(cellW * 0.17));
  const hmW = nLevels * cellW + ox + legendW, hmH = nAgents * cellH + 60;

  function cellColor(votes) {
    if (!votes) return '#1a1a2e';
    const total = votes.yes + votes.no;
    const majority = votes.yes > votes.no ? 'home' : 'out';
    const conf = Math.max(votes.yes, votes.no) / total;
    if (majority === 'home') {
      if (conf >= 0.95) return '#F97316';
      if (conf >= 0.75) return '#FBBF24';
      return '#FDE68A';
    } else {
      if (conf >= 0.95) return '#3B82F6';
      if (conf >= 0.75) return '#60A5FA';
      return '#93C5FD';
    }
  }

  let cells = '';
  for (let ai = 0; ai < sortedIds.length; ai++) {
    for (let li = 0; li < nLevels; li++) {
      cells += `<rect x="${ox + li * cellW}" y="${oy + ai * cellH}" width="${cellW}" height="${cellH}" fill="${cellColor(agentLevelVotes[sortedIds[ai]]?.[LEVELS[li]])}"/>`;
    }
  }

  const xTicks = [0, 1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0];
  const xLabels = xTicks.map(t => {
    const idx = LEVELS.indexOf(t);
    if (idx < 0) return '';
    return `<text x="${ox + idx * cellW + cellW / 2}" y="${oy + nAgents * cellH + 12}" fill="#4a6580" font-size="4" text-anchor="middle" font-family="'Press Start 2P',monospace">${t}%</text>`;
  }).join('');

  const yLabel = `<text x="8" y="${oy + nAgents * cellH / 2}" fill="#3a5068" font-size="5" text-anchor="middle" transform="rotate(-90,8,${oy + nAgents * cellH / 2})" font-family="'Press Start 2P',monospace">AGENTS (sorted)</text>`;
  const xLabel = `<text x="${ox + nLevels * cellW / 2}" y="${oy + nAgents * cellH + 24}" fill="#3a5068" font-size="5" text-anchor="middle" font-family="'Press Start 2P',monospace">INFECTION LEVEL</text>`;

  const lx = ox + nLevels * cellW + 10, ly = oy + 4;
  const legendSvg = [
    [lx, ly,    '#F97316', 'Home (5/5)'],
    [lx, ly+14, '#FBBF24', 'Home (4/5)'],
    [lx, ly+28, '#FDE68A', 'Home (3/5)'],
    [lx, ly+48, '#3B82F6', 'Out (5/5)'],
    [lx, ly+62, '#60A5FA', 'Out (4/5)'],
    [lx, ly+76, '#93C5FD', 'Out (3/5)'],
  ].map(([x, y, c, t]) =>
    `<rect x="${x}" y="${y}" width="8" height="8" fill="${c}"/><text x="${x+12}" y="${y+6}" fill="#7a9ab8" font-size="4" font-family="'Press Start 2P',monospace">${t}</text>`
  ).join('');

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${hmW}" height="${hmH}" style="display:block;background:#080c14;width:100%;max-width:${hmW}px">
    ${cells}${xLabels}${yLabel}${xLabel}${legendSvg}
  </svg>`;
}

function renderS7Concordance(microRows, cfg) {
  const el = document.getElementById('s7-concordance');

  const agentLevelVotes = {};
  microRows.forEach(r => {
    if (!agentLevelVotes[r.agent_id]) agentLevelVotes[r.agent_id] = {};
    if (!agentLevelVotes[r.agent_id][r.infection_level]) agentLevelVotes[r.agent_id][r.infection_level] = { yes: 0, no: 0 };
    agentLevelVotes[r.agent_id][r.infection_level][r.response]++;
  });

  const agentIds = Object.keys(agentLevelVotes).map(Number);
  const nAgents = agentIds.length;

  const unanimousData = [], strongData = [], bareData = [];
  LEVELS.forEach(level => {
    let unanimous = 0, strong = 0, bare = 0;
    agentIds.forEach(id => {
      const v = agentLevelVotes[id]?.[level];
      if (!v) return;
      const mx = Math.max(v.yes, v.no);
      if (mx === 5) unanimous++;
      if (mx >= 4) strong++;
      if (mx >= 3) bare++;
    });
    unanimousData.push({ level, pct: (unanimous / nAgents) * 100 });
    strongData.push({ level, pct: (strong / nAgents) * 100 });
    bareData.push({ level, pct: (bare / nAgents) * 100 });
  });

  const w = CW, h = 300, pad = { t: 30, r: 30, b: 50, l: 60 };
  const unanimousPts = unanimousData.map(d => `${levelToX(d.level, w, pad).toFixed(1)},${pctToY(d.pct, h, pad).toFixed(1)}`).join(' ');
  const strongPts = strongData.map(d => `${levelToX(d.level, w, pad).toFixed(1)},${pctToY(d.pct, h, pad).toFixed(1)}`).join(' ');
  const barePts = bareData.map(d => `${levelToX(d.level, w, pad).toFixed(1)},${pctToY(d.pct, h, pad).toFixed(1)}`).join(' ');

  const legendX = w - 220;
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="display:block;background:#080c14">
    ${svgFrame(w, h)}
    ${yAxisTicks(w, h, pad)}
    ${xAxisTicks(w, h, pad)}
    ${axisLabels(w, h, pad, 'INFECTION LEVEL', '% AGENTS')}
    <polyline points="${barePts}" stroke="#94A3B8" stroke-width="1.3" fill="none" opacity="0.6" stroke-dasharray="3,3"/>
    <polyline points="${strongPts}" stroke="#60A5FA" stroke-width="1.5" fill="none" opacity="0.7" stroke-dasharray="6,3"/>
    <polyline points="${unanimousPts}" stroke="#3B82F6" stroke-width="2.5" fill="none" opacity="0.9"/>
    <line x1="${legendX}" y1="${pad.t + 4}" x2="${legendX + 20}" y2="${pad.t + 4}" stroke="#3B82F6" stroke-width="2.5"/>
    <text x="${legendX + 25}" y="${pad.t + 7}" fill="#7a9ab8" font-size="5" font-family="'Press Start 2P',monospace">Unanimous (5/5)</text>
    <line x1="${legendX}" y1="${pad.t + 18}" x2="${legendX + 20}" y2="${pad.t + 18}" stroke="#60A5FA" stroke-width="1.5" stroke-dasharray="6,3"/>
    <text x="${legendX + 25}" y="${pad.t + 21}" fill="#7a9ab8" font-size="5" font-family="'Press Start 2P',monospace">Strong (>=4/5)</text>
    <line x1="${legendX}" y1="${pad.t + 32}" x2="${legendX + 20}" y2="${pad.t + 32}" stroke="#94A3B8" stroke-width="1.3" stroke-dasharray="3,3"/>
    <text x="${legendX + 25}" y="${pad.t + 35}" fill="#7a9ab8" font-size="5" font-family="'Press Start 2P',monospace">Bare majority (3/5)</text>
  </svg>`;
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

      // Render all macro-data sections
      renderS0();
      renderS1();
      renderS2();
      renderS3();
      renderS4();
      renderS5();
      renderS6();

      // S7: Agent-level (needs micro data)
      document.getElementById('s7-section').style.display = 'block';
      buildModelPicker('s7-model-select', s7SelectedIdx, idx => {
        s7SelectedIdx = idx;
        loadMicro(idx, renderS7);
      });
      loadMicro(s7SelectedIdx, renderS7);
    },
    error() {
      document.getElementById('loading').innerHTML = '<span style="color:#f87171">Failed to load macro data. Is the server running from the right directory?</span>';
    },
  });
}

init();
