// ============================================================
// GABM Mobility Curve — Analytics  (Paper 3 figures)
// Pure SVG charts, no Phaser dependency.
// Depends on: papaparse.min.js, config.js (CONFIG.MODELS, etc.)
// ============================================================
'use strict';

let macroData = [];   // all_macro.csv rows
let microCache = {};  // dirKey → micro CSV rows (loaded on demand)

// ── Chart geometry ───────────────────────────────────────────
const CW = 1100, CH = 400, PAD = { t: 30, r: 30, b: 50, l: 60 };
const SMALL_CW = 340, SMALL_CH = 280;

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

// Group macro rows by provider|model|reasoning
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

// ── Build a mobility curve SVG for a set of models ───────────
function buildCurveSVG(models, data, w, h, pad) {
  const grouped = groupByModel(data);
  let lines = '';
  let hitTargets = '';
  const legendItems = [];

  models.forEach(m => {
    const k = modelKey(m);
    const rows = grouped[k];
    if (!rows || rows.length === 0) return;

    const color = m.color;
    const sorted = [...rows].sort((a, b) => a.infection_level - b.infection_level);
    const pts = sorted.map(r =>
      `${levelToX(r.infection_level, w, pad).toFixed(1)},${pctToY(r.pct_stay_home, h, pad).toFixed(1)}`
    ).join(' ');

    lines += `<polyline points="${pts}" stroke="${color}" stroke-width="1.4" fill="none" opacity="0.85" data-config="${esc(k)}"/>`;
    hitTargets += `<polyline points="${pts}" stroke="transparent" stroke-width="14" fill="none" data-config="${esc(k)}" data-label="${esc(m.label)}" data-color="${color}" class="hit-target"/>`;
    legendItems.push({ label: m.label, color, key: k });
  });

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="display:block;background:#080c14">
    <rect width="${w}" height="${h}" fill="#080c14"/>
    ${yAxisTicks(w, h, pad)}
    ${xAxisTicks(w, h, pad)}
    ${axisLabels(w, h, pad, 'INFECTION LEVEL', '% STAY HOME')}
    ${lines}
    ${hitTargets}
  </svg>`;

  return { svg, legendItems };
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
    const rect = container.getBoundingClientRect();
    tooltip.innerHTML = `<span style="color:${color}">${label}</span>`;
    tooltip.style.display = 'block';
    tooltip.style.left = (e.clientX - rect.left + 12) + 'px';
    tooltip.style.top = (e.clientY - rect.top - 24) + 'px';
  });
  container.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });
}

// ═══════════════════════════════════════════════════════════════
// MACRO SCATTER — provider toggleable, min-max range bands
// ═══════════════════════════════════════════════════════════════
let scatterHiddenProviders = new Set();

function renderMacroScatter() {
  document.getElementById('scatter-section').style.display = 'block';
  const el = document.getElementById('scatter-chart');
  const legendEl = document.getElementById('scatter-legend');

  const w = CW, h = CH, pad = PAD;
  const grouped = groupByModel(macroData);

  // Collect per-provider level data
  const providerData = {};
  CONFIG.MODELS.forEach(m => {
    if (scatterHiddenProviders.has(m.provider)) return;
    const k = modelKey(m);
    const rows = grouped[k];
    if (!rows) return;
    if (!providerData[m.provider]) providerData[m.provider] = {};
    rows.forEach(r => {
      const pct = parseFloat(r.pct_stay_home);
      if (isNaN(pct)) return;
      if (!providerData[m.provider][r.infection_level]) providerData[m.provider][r.infection_level] = [];
      providerData[m.provider][r.infection_level].push(pct);
    });
  });

  // Draw individual dots
  let dots = '';
  CONFIG.MODELS.forEach(m => {
    if (scatterHiddenProviders.has(m.provider)) return;
    const k = modelKey(m);
    const rows = grouped[k];
    if (!rows) return;
    rows.forEach(r => {
      const pct = parseFloat(r.pct_stay_home);
      if (isNaN(pct)) return;
      const cx = levelToX(r.infection_level, w, pad);
      const cy = pctToY(pct, h, pad);
      dots += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="2" fill="${m.color}" opacity="0.3"/>`;
    });
  });

  // Provider average lines + min-max range bands
  let providerSvg = '';
  for (const [provider, levelMap] of Object.entries(providerData)) {
    const color = CONFIG.PROVIDER_COLORS[provider] || '#fff';
    const sortedLevels = Object.keys(levelMap).map(Number).sort((a, b) => a - b);

    const stats = sortedLevels.map(level => {
      const vals = levelMap[level];
      const avg = vals.reduce((s, v) => s + v, 0) / vals.length;
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      return { level, avg, min, max };
    });

    // Min-max range band
    const upper = stats.map(s => `${levelToX(s.level, w, pad).toFixed(1)},${pctToY(s.max, h, pad).toFixed(1)}`);
    const lower = [...stats].reverse().map(s => `${levelToX(s.level, w, pad).toFixed(1)},${pctToY(s.min, h, pad).toFixed(1)}`);
    providerSvg += `<polygon points="${[...upper, ...lower].join(' ')}" fill="${color}" opacity="0.08"/>`;

    // Average line
    const avgLine = stats.map(s => `${levelToX(s.level, w, pad).toFixed(1)},${pctToY(s.avg, h, pad).toFixed(1)}`).join(' ');
    providerSvg += `<polyline points="${avgLine}" stroke="${color}" stroke-width="2" fill="none" opacity="0.7"/>`;
  }

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="display:block;background:#080c14">
    <rect width="${w}" height="${h}" fill="#080c14"/>
    ${yAxisTicks(w, h, pad)}
    ${xAxisTicks(w, h, pad)}
    ${axisLabels(w, h, pad, 'INFECTION LEVEL', '% STAY HOME')}
    ${providerSvg}${dots}
  </svg>`;

  // Legend with toggle
  const providers = ['anthropic', 'openai', 'gemini'];
  const labels = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini' };
  legendEl.innerHTML = providers.map(p => {
    const hidden = scatterHiddenProviders.has(p);
    const color = CONFIG.PROVIDER_COLORS[p];
    return `<div class="legend-item" data-provider="${p}" style="opacity:${hidden ? 0.3 : 0.9}">
      <div class="legend-swatch" style="background:${color}"></div>
      <span style="color:${color}">${labels[p]}</span>
    </div>`;
  }).join('');

  legendEl.querySelectorAll('.legend-item').forEach(item => {
    item.addEventListener('click', () => {
      const p = item.dataset.provider;
      if (scatterHiddenProviders.has(p)) scatterHiddenProviders.delete(p);
      else scatterHiddenProviders.add(p);
      renderMacroScatter();
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// FIG 1: All Mobility Curves
// ═══════════════════════════════════════════════════════════════
function renderFig1() {
  document.getElementById('fig1-section').style.display = 'block';
  const el = document.getElementById('fig1-chart');
  const legendEl = document.getElementById('fig1-legend');

  const { svg, legendItems } = buildCurveSVG(CONFIG.MODELS, macroData, CW, CH, PAD);
  el.innerHTML = svg;
  wireTooltips(el);

  legendEl.innerHTML = legendItems.map(item =>
    `<div class="legend-item"><div class="legend-swatch" style="background:${item.color}"></div><span>${item.label}</span></div>`
  ).join('');
}

// ═══════════════════════════════════════════════════════════════
// FIG 2: Reasoning Effect
// ═══════════════════════════════════════════════════════════════
function renderFig2() {
  document.getElementById('fig2-section').style.display = 'block';
  const facets = document.getElementById('fig2-facets');
  const pad = { t: 24, r: 20, b: 44, l: 50 };

  const groups = [
    { title: 'GPT-5.2 (OFF → HIGH)', filter: m => m.model === 'gpt-5.2' },
    { title: 'GEMINI 3 FLASH (OFF → HIGH)', filter: m => m.model === 'gemini-3-flash-preview' },
  ];

  facets.innerHTML = groups.map(g => {
    const models = CONFIG.MODELS.filter(g.filter);
    const { svg, legendItems } = buildCurveSVG(models, macroData, SMALL_CW, SMALL_CH, pad);
    const legend = legendItems.map(item =>
      `<div class="legend-item"><div class="legend-swatch" style="background:${item.color}"></div><span>${item.label}</span></div>`
    ).join('');
    return `<div class="facet-panel">
      <div class="facet-label">${g.title}</div>
      <div class="chart-container">${svg}</div>
      <div class="legend" style="margin-top:6px">${legend}</div>
    </div>`;
  }).join('');

  facets.querySelectorAll('.chart-container').forEach(wireTooltips);
}

// ═══════════════════════════════════════════════════════════════
// FIG 3: Generational Progression
// ═══════════════════════════════════════════════════════════════
function renderFig3() {
  document.getElementById('fig3-section').style.display = 'block';
  const facets = document.getElementById('fig3-facets');
  const pad = { t: 24, r: 20, b: 44, l: 50 };

  const groups = [
    { title: 'ANTHROPIC', filter: m => m.provider === 'anthropic' },
    { title: 'OPENAI', filter: m => m.provider === 'openai' && (m.reasoning === 'off' || m.reasoning === 'required') },
    { title: 'GEMINI', filter: m => m.provider === 'gemini' && m.reasoning === 'off' },
  ];

  facets.innerHTML = groups.map(g => {
    const models = CONFIG.MODELS.filter(g.filter);
    const { svg, legendItems } = buildCurveSVG(models, macroData, SMALL_CW, SMALL_CH, pad);
    const legend = legendItems.map(item =>
      `<div class="legend-item"><div class="legend-swatch" style="background:${item.color}"></div><span>${item.label}</span></div>`
    ).join('');
    return `<div class="facet-panel">
      <div class="facet-label">${g.title}</div>
      <div class="chart-container">${svg}</div>
      <div class="legend" style="margin-top:6px">${legend}</div>
    </div>`;
  }).join('');

  facets.querySelectorAll('.chart-container').forEach(wireTooltips);
}

// ═══════════════════════════════════════════════════════════════
// FIG 4: Model Tier Comparison
// ═══════════════════════════════════════════════════════════════
function renderFig4() {
  document.getElementById('fig4-section').style.display = 'block';
  const facets = document.getElementById('fig4-facets');
  const pad = { t: 24, r: 20, b: 44, l: 50 };

  const groups = [
    { title: 'ANTHROPIC TIERS', filter: m => m.provider === 'anthropic' },
    { title: 'GEMINI TIERS (OFF)', filter: m => m.provider === 'gemini' && m.reasoning === 'off' },
  ];

  facets.innerHTML = groups.map(g => {
    const models = CONFIG.MODELS.filter(g.filter);
    const { svg, legendItems } = buildCurveSVG(models, macroData, SMALL_CW * 1.4, SMALL_CH, pad);
    const legend = legendItems.map(item =>
      `<div class="legend-item"><div class="legend-swatch" style="background:${item.color}"></div><span>${item.label}</span></div>`
    ).join('');
    return `<div class="facet-panel">
      <div class="facet-label">${g.title}</div>
      <div class="chart-container">${svg}</div>
      <div class="legend" style="margin-top:6px">${legend}</div>
    </div>`;
  }).join('');

  facets.querySelectorAll('.chart-container').forEach(wireTooltips);
}

// ═══════════════════════════════════════════════════════════════
// FIG 5: Agent-Level Heatmap
// ═══════════════════════════════════════════════════════════════
let fig5SelectedIdx = 0;

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
      const el = document.getElementById('fig5-chart');
      if (el) el.innerHTML = '<div style="color:#f87171;padding:20px;font-size:6px">Failed to load micro data for ' + esc(m.label) + '</div>';
    },
  });
}

function renderFig5Heatmap(microRows, cfg) {
  const el = document.getElementById('fig5-chart');

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

// ═══════════════════════════════════════════════════════════════
// VOTE AGREEMENT (Concordance)
// ═══════════════════════════════════════════════════════════════
let agreementSelectedIdx = 0;

function renderAgreementChart(microRows, cfg) {
  const el = document.getElementById('agreement-chart');
  const agentLevelVotes = {};
  microRows.forEach(r => {
    if (!agentLevelVotes[r.agent_id]) agentLevelVotes[r.agent_id] = {};
    if (!agentLevelVotes[r.agent_id][r.infection_level]) agentLevelVotes[r.agent_id][r.infection_level] = { yes: 0, no: 0 };
    agentLevelVotes[r.agent_id][r.infection_level][r.response]++;
  });

  const agentIds = Object.keys(agentLevelVotes).map(Number);
  const nAgents = agentIds.length;

  const unanimousData = [], strongData = [];
  LEVELS.forEach(level => {
    let unanimous = 0, strong = 0;
    agentIds.forEach(id => {
      const v = agentLevelVotes[id]?.[level];
      if (!v) return;
      const mx = Math.max(v.yes, v.no);
      if (mx === 5) unanimous++;
      if (mx >= 4) strong++;
    });
    unanimousData.push({ level, pct: (unanimous / nAgents) * 100 });
    strongData.push({ level, pct: (strong / nAgents) * 100 });
  });

  const w = CW, h = 300, pad = { t: 30, r: 30, b: 50, l: 60 };
  const unanimousPts = unanimousData.map(d => `${levelToX(d.level, w, pad).toFixed(1)},${pctToY(d.pct, h, pad).toFixed(1)}`).join(' ');
  const strongPts = strongData.map(d => `${levelToX(d.level, w, pad).toFixed(1)},${pctToY(d.pct, h, pad).toFixed(1)}`).join(' ');

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" style="display:block;background:#080c14">
    <rect width="${w}" height="${h}" fill="#080c14"/>
    ${yAxisTicks(w, h, pad)}
    ${xAxisTicks(w, h, pad)}
    ${axisLabels(w, h, pad, 'INFECTION LEVEL', '% AGENTS')}
    <polyline points="${strongPts}" stroke="#60A5FA" stroke-width="1.5" fill="none" opacity="0.7" stroke-dasharray="4,2"/>
    <polyline points="${unanimousPts}" stroke="#3B82F6" stroke-width="2" fill="none" opacity="0.9"/>
    <line x1="${w - 200}" y1="${pad.t + 4}" x2="${w - 180}" y2="${pad.t + 4}" stroke="#3B82F6" stroke-width="2"/>
    <text x="${w - 175}" y="${pad.t + 7}" fill="#7a9ab8" font-size="5" font-family="'Press Start 2P',monospace">Unanimous (5/5)</text>
    <line x1="${w - 200}" y1="${pad.t + 18}" x2="${w - 180}" y2="${pad.t + 18}" stroke="#60A5FA" stroke-width="1.5" stroke-dasharray="4,2"/>
    <text x="${w - 175}" y="${pad.t + 21}" fill="#7a9ab8" font-size="5" font-family="'Press Start 2P',monospace">Strong (>=4/5)</text>
  </svg>`;
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

      renderFig1();
      renderMacroScatter();
      renderFig2();
      renderFig3();
      renderFig4();

      // Fig 5
      document.getElementById('fig5-section').style.display = 'block';
      buildModelPicker('fig5-model-select', fig5SelectedIdx, idx => {
        fig5SelectedIdx = idx;
        loadMicro(idx, renderFig5Heatmap);
      });
      loadMicro(fig5SelectedIdx, renderFig5Heatmap);

      // Agreement
      document.getElementById('agreement-section').style.display = 'block';
      buildModelPicker('agreement-model-select', agreementSelectedIdx, idx => {
        agreementSelectedIdx = idx;
        loadMicro(idx, renderAgreementChart);
      });
      loadMicro(agreementSelectedIdx, renderAgreementChart);
    },
    error() {
      document.getElementById('loading').innerHTML = '<span style="color:#f87171">Failed to load macro data. Is the server running from the right directory?</span>';
    },
  });
}

init();
