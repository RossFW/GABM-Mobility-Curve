// ============================================================
// GABM Mobility Curve — Town UI
// Mobility curve charts, bio panel, hover interaction.
// Depends on: map-layout.js, agent-schedule.js,
//             town-render.js, town-pathfinding.js, town-agents.js
// ============================================================

'use strict';

// ─── Hover / selection state ─────────────────────────────────
let lastHoveredId = -1;
let lockedAgentId = -1;
let lastBioPanelKey = '';

// ─── Chart state ─────────────────────────────────────────────
let hoverRing = null;
let hiddenProviders = new Set(); // toggled-off providers

// ─── Chat state (minimal for mobility curve) ─────────────────
const chatCooldown = new Map();
const activeBubbles = new Map();
function destroyBubblesForAgent(id) {} // no-op for mobility curve

// ═══════════════════════════════════════════════════════════════
// HOVER → BIO PANEL
// ═══════════════════════════════════════════════════════════════

function onCanvasMouseMove(e) {
  const rect   = game.canvas.getBoundingClientRect();
  const scaleX = VIEW_W / rect.width;
  const scaleY = VIEW_H / rect.height;
  const screenX = (e.clientX - rect.left) * scaleX;
  const screenY = (e.clientY - rect.top)  * scaleY;

  const cam    = scene.cameras.main;
  const wp     = cam.getWorldPoint(screenX, screenY);
  const worldX = wp.x; const worldY = wp.y;

  const hoverR = Math.max(20, 36 / cam.zoom);
  let closestId = -1, closestDist = hoverR * hoverR;
  agentContainers.forEach((c, id) => {
    if (!c.visible) return;
    const dx = c.x - worldX, dy = c.y - worldY;
    const d2 = dx * dx + dy * dy;
    if (d2 < closestDist) { closestDist = d2; closestId = id; }
  });

  // Floating tooltip
  const tooltip = document.getElementById('agent-tooltip');
  if (tooltip) {
    if (closestId >= 0) {
      const info = agentsInfo[closestId];
      const name = info?.name || `Agent ${closestId}`;
      const decision = agentDecisions[currentStep]?.[closestId] || 'no';
      const dCol = decisionCssColor(decision);
      const dLabel = decision === 'yes' ? 'Home' : 'Out';
      tooltip.innerHTML = `<span class="tt-name">${name}</span><span class="tt-health" style="color:${dCol}">${dLabel}</span>`;
      tooltip.style.display = 'block';
      tooltip.style.left = (e.clientX + 14) + 'px';
      tooltip.style.top  = (e.clientY - 8) + 'px';
    } else {
      tooltip.style.display = 'none';
    }
  }

  // Hover ring
  if (typeof scene !== 'undefined' && scene && lockedAgentId < 0) {
    if (!hoverRing) hoverRing = scene.add.graphics().setDepth(14);
    hoverRing.clear();
    if (closestId >= 0 && agentContainers[closestId]?.visible) {
      const ac = agentContainers[closestId];
      hoverRing.lineStyle(2, 0xffffff, 0.7);
      hoverRing.strokeCircle(ac.x, ac.y, 18);
    }
    game.canvas.style.cursor = closestId >= 0 ? 'pointer' : 'default';
  }

  if (lockedAgentId >= 0) return;
  if (closestId !== lastHoveredId) {
    lastHoveredId = closestId;
    if (closestId >= 0) showBioPanel(closestId);
  }
}

function showBioPanel(id) {
  const panel = document.getElementById('bio-panel');
  const info = agentsInfo[id];
  const decision = agentDecisions[currentStep]?.[id] || 'no';
  const reasoning = agentReasoning[currentStep]?.[id] || '';
  panel.innerHTML = buildBioHtml(id, info, decision, reasoning);
}

// ═══════════════════════════════════════════════════════════════
// MOBILITY CURVE CHART (comparison across all models)
// ═══════════════════════════════════════════════════════════════

function buildMobilityCurveChart() {
  const el = document.getElementById('mobility-curve-chart');
  if (!el || !allModelsMacro) return;

  const W = 1156, H = 260, padL = 50, padR = 20, padT = 36, padB = 32;
  const chartW = W - padL - padR;
  const chartH = H - padT - padB;

  const levels = CONFIG.INFECTION_LEVELS;
  const maxLevel = levels[levels.length - 1];

  const toX = v => padL + (v / maxLevel) * chartW;
  const toY = v => H - padB - (v / 100) * chartH;

  // Grid lines
  let gridSvg = '';
  for (const v of [25, 50, 75]) {
    gridSvg += `<line x1="${padL}" y1="${toY(v)}" x2="${W - padR}" y2="${toY(v)}" stroke="#1a2035" stroke-width="0.5"/>`;
  }
  for (const x of [1, 2, 3, 4, 5, 6, 7]) {
    gridSvg += `<line x1="${toX(x)}" y1="${padT}" x2="${toX(x)}" y2="${H - padB}" stroke="#1a2035" stroke-width="0.5"/>`;
  }

  // Y axis labels
  let yLabels = '';
  for (const v of [0, 25, 50, 75, 100]) {
    yLabels += `<text x="${padL - 6}" y="${toY(v)}" dy="3" fill="#4a6580" font-size="8" font-family="'Press Start 2P', monospace" text-anchor="end">${v}%</text>`;
  }

  // X axis labels
  let xLabels = '';
  for (const x of [0, 1, 2, 3, 4, 5, 6, 7]) {
    xLabels += `<text x="${toX(x)}" y="${H - padB + 16}" fill="#4a6580" font-size="8" font-family="'Press Start 2P', monospace" text-anchor="middle">${x}%</text>`;
  }

  // Axis titles
  const yTitle = `<text x="12" y="${padT + chartH / 2}" fill="#3a5068" font-size="7" font-family="'Press Start 2P', monospace" text-anchor="middle" transform="rotate(-90, 12, ${padT + chartH / 2})">% STAY HOME</text>`;
  const xTitle = `<text x="${padL + chartW / 2}" y="${H - 4}" fill="#3a5068" font-size="7" font-family="'Press Start 2P', monospace" text-anchor="middle">INFECTION RATE</text>`;

  // Draw all model lines (hit targets + visible)
  let hitTargets = '';
  let polylines = '';
  const currentModelIdx = typeof currentModelIndex !== 'undefined' ? currentModelIndex : 0;

  CONFIG.MODELS.forEach((m, idx) => {
    if (hiddenProviders.has(m.provider)) return;
    const key = configDirKey(m);
    const macroData = allModelsMacro[key];
    if (!macroData) return;

    const isActive = idx === currentModelIdx;
    const pts = levels.map(level => {
      const row = macroData[level];
      if (!row) return null;
      return `${toX(level).toFixed(1)},${toY(row.pct_stay_home).toFixed(1)}`;
    }).filter(Boolean).join(' ');

    if (pts) {
      // Invisible wide hit target for click/hover
      hitTargets += `<polyline points="${pts}" stroke="transparent" stroke-width="14" fill="none" data-model-idx="${idx}" style="cursor:pointer;pointer-events:stroke"/>`;
      const opacity = isActive ? 1.0 : 0.25;
      const width = isActive ? 3 : 1.2;
      polylines += `<polyline points="${pts}" stroke="${m.color}" stroke-width="${width}" fill="none" opacity="${opacity}" data-model-idx="${idx}" style="pointer-events:none"/>`;
    }
  });

  // Current position dot
  const currentLevel = CONFIG.INFECTION_LEVELS[currentStep] || 0;
  const currentModel = CONFIG.MODELS[currentModelIdx];
  const currentKey = currentModel ? configDirKey(currentModel) : '';
  const currentMacro = allModelsMacro[currentKey];
  let dotSvg = '';
  if (currentMacro && currentMacro[currentLevel]) {
    const cx = toX(currentLevel);
    const cy = toY(currentMacro[currentLevel].pct_stay_home);
    dotSvg = `<circle cx="${cx}" cy="${cy}" r="6" fill="${currentModel.color}" stroke="#fff" stroke-width="2"/>`;
  }

  // Playhead line
  const phX = toX(currentLevel);
  const playhead = `<line id="curve-playhead" x1="${phX}" y1="${padT}" x2="${phX}" y2="${H - padB}" stroke="rgba(255,255,255,0.4)" stroke-width="1" stroke-dasharray="4,4"/>`;

  // Title
  const title = `<text x="${padL + 4}" y="${padT - 10}" fill="#7a9ab8" font-size="9" font-family="'Press Start 2P', monospace" font-weight="bold">MOBILITY CURVES — ALL MODELS</text>`;

  // Provider legend (SVG part — static labels; interactive toggle done in HTML below)
  const lgdY = padT - 10;
  const providerList = [
    { key: 'anthropic', label: 'Anthropic', color: CONFIG.PROVIDER_COLORS.anthropic, x: W - 340 },
    { key: 'openai', label: 'OpenAI', color: CONFIG.PROVIDER_COLORS.openai, x: W - 220 },
    { key: 'gemini', label: 'Gemini', color: CONFIG.PROVIDER_COLORS.gemini, x: W - 110 },
  ];
  const legend = providerList.map(p => {
    const hidden = hiddenProviders.has(p.key);
    const op = hidden ? 0.25 : 1;
    return `<rect x="${p.x}" y="${lgdY - 6}" width="8" height="8" fill="${p.color}" rx="1" opacity="${op}" data-provider="${p.key}" style="cursor:pointer"/>` +
      `<text x="${p.x + 12}" y="${lgdY + 1}" fill="${p.color}" font-size="7" font-family="'Press Start 2P', monospace" opacity="${op}" data-provider="${p.key}" style="cursor:pointer">${p.label}</text>`;
  }).join('');

  // Chart tooltip for model hover
  const tooltipId = 'chart-model-tooltip';

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="display:block">
    <rect width="${W}" height="${H}" fill="#080c14" rx="4"/>
    ${gridSvg}${yLabels}${xLabels}${yTitle}${xTitle}${title}${legend}
    ${hitTargets}${polylines}${playhead}${dotSvg}
  </svg>
  <div id="${tooltipId}" style="display:none;position:absolute;background:#1a2035;color:#fff;padding:4px 8px;border-radius:4px;font-size:7px;font-family:'Press Start 2P',monospace;pointer-events:none;white-space:nowrap;z-index:100"></div>`;

  // Click handler — switch model
  const svg = el.querySelector('svg');
  svg.addEventListener('click', (e) => {
    const hit = e.target.closest('polyline[data-model-idx]');
    if (!hit) return;
    const idx = parseInt(hit.dataset.modelIdx);
    if (idx !== currentModelIdx && typeof switchModel === 'function') {
      switchModel(idx);
    }
  });

  // Provider toggle — click legend to show/hide
  svg.addEventListener('click', (e) => {
    const prov = e.target.dataset?.provider;
    if (!prov) return;
    if (hiddenProviders.has(prov)) hiddenProviders.delete(prov);
    else hiddenProviders.add(prov);
    buildMobilityCurveChart();
  });

  // Hover handler — highlight line + show tooltip
  svg.addEventListener('mousemove', (e) => {
    const hit = e.target.closest('polyline[data-model-idx]');
    const tip = document.getElementById(tooltipId);
    if (!hit || !tip) { if (tip) tip.style.display = 'none'; return; }
    const idx = parseInt(hit.dataset.modelIdx);
    const m = CONFIG.MODELS[idx];
    if (!m) return;
    tip.textContent = m.label;
    tip.style.color = m.color;
    tip.style.display = 'block';
    const rect = el.getBoundingClientRect();
    tip.style.left = (e.clientX - rect.left + 12) + 'px';
    tip.style.top = (e.clientY - rect.top - 10) + 'px';
  });
  svg.addEventListener('mouseleave', () => {
    const tip = document.getElementById(tooltipId);
    if (tip) tip.style.display = 'none';
  });
}

// ═══════════════════════════════════════════════════════════════
// AGENT GRID (100 agent thumbnails showing in/out)
// ═══════════════════════════════════════════════════════════════

function buildAgentGrid() {
  const el = document.getElementById('agent-grid');
  if (!el) return;

  const levelIdx = currentStep;
  let html = '';
  for (let id = 0; id < 100; id++) {
    const decision = agentDecisions[levelIdx]?.[id] || 'no';
    const info = agentsInfo[id];
    const name = info?.name || `#${id}`;
    const emoji = decision === 'yes' ? '🏠' : '🚶';
    // Confidence color gradient for cell
    const votes = agentVoteCount[levelIdx]?.[id];
    let conf = 1.0;
    let repLabel = '';
    if (votes) {
      const total = votes.yes + votes.no;
      const majority = Math.max(votes.yes, votes.no);
      conf = majority / total;
      repLabel = `${majority}/${total}`;
    }
    const cellColor = confidenceCssColor(decision, conf);
    // Darker background derived from cell color
    const bgCol = decision === 'yes' ? '#451a03' : '#172554';
    html += `<div class="agent-cell" data-agent="${id}" style="background:${bgCol};border-color:${cellColor}" title="${name}: ${decision === 'yes' ? 'Home' : 'Out'}${repLabel ? ' (' + repLabel + ' reps)' : ''}">
      <span class="agent-cell-emoji">${emoji}</span>
      <span class="agent-cell-name" style="color:${cellColor}">${name.slice(0, 5)}</span>
    </div>`;
  }
  el.innerHTML = html;

  // Click handler — focus on agent in game view
  el.querySelectorAll('.agent-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      const id = parseInt(cell.dataset.agent);
      if (typeof focusOnAgent === 'function') {
        focusOnAgent(id);
      }
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// MODEL BREAKDOWN PANEL (confidence + jitter scatter)
// ═══════════════════════════════════════════════════════════════

function buildModelBreakdownPanel() {
  const el = document.getElementById('model-breakdown');
  if (!el) return;

  const currentModelIdx = typeof currentModelIndex !== 'undefined' ? currentModelIndex : 0;
  const m = CONFIG.MODELS[currentModelIdx];
  if (!m) return;

  const W = 1156, H = 295, midX = 340;
  const levelIdx = currentStep;
  const infLevel = CONFIG.INFECTION_LEVELS[levelIdx] || 0;
  const levels = CONFIG.INFECTION_LEVELS;
  const maxLvl = levels[levels.length - 1];

  // ── Left: Vote agreement distribution at current level ──
  const bins = { 5: 0, 4: 0, 3: 0 };
  for (let id = 0; id < 100; id++) {
    const v = agentVoteCount[levelIdx]?.[id];
    if (v) {
      const maj = Math.max(v.yes, v.no);
      if (bins[maj] !== undefined) bins[maj]++;
    }
  }
  const maxBin = Math.max(bins[5], bins[4], bins[3], 1);
  const barW = 180, barH = 16, barX = 100, barStartY = 65;

  let confBars = '';
  const barColors = { 5: '#3B82F6', 4: '#60A5FA', 3: '#93C5FD' };
  [5, 4, 3].forEach((k, i) => {
    const y = barStartY + i * (barH + 8);
    const w = (bins[k] / maxBin) * barW;
    confBars += `<text x="${barX - 6}" y="${y + barH / 2 + 3}" fill="#7a9ab8" font-size="7" font-family="'Press Start 2P',monospace" text-anchor="end">${k}/5</text>`;
    confBars += `<rect x="${barX}" y="${y}" width="${Math.max(w, 2)}" height="${barH}" fill="${barColors[k]}" rx="2"/>`;
    confBars += `<text x="${barX + w + 6}" y="${y + barH / 2 + 3}" fill="#4a6580" font-size="7" font-family="'Press Start 2P',monospace">${bins[k]}</text>`;
  });

  const confTitle = `<text x="10" y="48" fill="#7a9ab8" font-size="7" font-family="'Press Start 2P',monospace">VOTE AGREEMENT</text>`;
  const confSubtitle = `<text x="10" y="58" fill="#4a6580" font-size="6" font-family="'Press Start 2P',monospace">@ ${infLevel.toFixed(1)}% INFECTION</text>`;

  // ── Right: Heatmap (100 agents × 40 levels) ──
  const hmL = midX + 20, hmR = W - 10, hmT = 36, hmB = H - 35;
  const hmW = hmR - hmL, hmH = hmB - hmT;

  // Map level index → X pixel using actual infection level values (nonlinear spacing)
  const levelToHmX = li => hmL + (levels[li] / maxLvl) * hmW;

  // Sort agents by transition point (level where they flip from out→home)
  const agentOrder = [];
  for (let id = 0; id < 100; id++) {
    let transLevel = 40; // default: never transitions
    for (let li = 0; li < 40; li++) {
      if (agentDecisions[li]?.[id] === 'yes') { transLevel = li; break; }
    }
    agentOrder.push({ id, transLevel });
  }
  agentOrder.sort((a, b) => a.transLevel - b.transLevel);

  const cellH = hmH / 100;
  let heatmapRects = '';

  for (let row = 0; row < 100; row++) {
    const agentId = agentOrder[row].id;
    const y = hmT + row * cellH;
    for (let li = 0; li < 40; li++) {
      const x = levelToHmX(li);
      const nextX = li < 39 ? levelToHmX(li + 1) : hmR;
      const cw = nextX - x;
      const d = agentDecisions[li]?.[agentId] || 'no';
      const v = agentVoteCount[li]?.[agentId];
      let conf = 1.0;
      if (v) { conf = Math.max(v.yes, v.no) / (v.yes + v.no); }
      const col = confidenceCssColor(d, conf);
      heatmapRects += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${(cw + 0.3).toFixed(1)}" height="${(cellH + 0.3).toFixed(1)}" fill="${col}"/>`;
    }
  }

  // Playhead on heatmap (positioned by actual level value)
  const phX = levelToHmX(levelIdx);
  heatmapRects += `<line x1="${phX}" y1="${hmT}" x2="${phX}" y2="${hmB}" stroke="#fff" stroke-width="1.5" opacity="0.7"/>`;

  // Heatmap axis labels
  let hmLabels = '';
  for (const x of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const px = hmL + (x / maxLvl) * hmW;
    hmLabels += `<text x="${px.toFixed(0)}" y="${hmB + 12}" fill="#4a6580" font-size="6" font-family="'Press Start 2P',monospace" text-anchor="middle">${x}%</text>`;
  }
  const hmTitle = `<text x="${hmL}" y="28" fill="#7a9ab8" font-size="7" font-family="'Press Start 2P',monospace">AGENT DECISIONS (sorted by transition point)</text>`;
  const hmYLabel = `<text x="${hmL - 8}" y="${hmT + hmH / 2}" fill="#3a5068" font-size="6" font-family="'Press Start 2P',monospace" text-anchor="middle" transform="rotate(-90,${hmL - 8},${hmT + hmH / 2})">AGENTS</text>`;
  const hmXLabel = `<text x="${hmL + hmW / 2}" y="${hmB + 28}" fill="#3a5068" font-size="6" font-family="'Press Start 2P',monospace" text-anchor="middle">INFECTION RATE</text>`;

  // Legend
  const lgX = hmL;
  const lgY = hmT - 4;
  const legend = `<rect x="${lgX + 340}" y="${lgY - 6}" width="8" height="6" fill="#3B82F6" rx="1"/><text x="${lgX + 352}" y="${lgY}" fill="#3B82F6" font-size="5" font-family="'Press Start 2P',monospace">Out</text>` +
    `<rect x="${lgX + 390}" y="${lgY - 6}" width="8" height="6" fill="#F97316" rx="1"/><text x="${lgX + 402}" y="${lgY}" fill="#F97316" font-size="5" font-family="'Press Start 2P',monospace">Home</text>` +
    `<rect x="${lgX + 450}" y="${lgY - 6}" width="8" height="6" fill="#93C5FD" rx="1"/><text x="${lgX + 462}" y="${lgY}" fill="#93C5FD" font-size="5" font-family="'Press Start 2P',monospace">Low conf</text>`;

  // Panel title
  const panelTitle = `<text x="10" y="18" fill="${m.color}" font-size="9" font-family="'Press Start 2P',monospace" font-weight="bold">MODEL: ${m.label}</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="display:block">
    <rect width="${W}" height="${H}" fill="#080c14" rx="4"/>
    <line x1="${midX}" y1="24" x2="${midX}" y2="${H - 6}" stroke="#1a2035" stroke-width="1"/>
    ${panelTitle}${confTitle}${confSubtitle}${confBars}
    ${hmTitle}${hmYLabel}${hmXLabel}${legend}${heatmapRects}${hmLabels}
  </svg>`;
}

// ═══════════════════════════════════════════════════════════════
// CONCORDANCE CHART (stacked area — vote agreement over infection)
// ═══════════════════════════════════════════════════════════════

function buildConcordanceChart() {
  const el = document.getElementById('concordance-chart');
  if (!el) return;

  const levels = CONFIG.INFECTION_LEVELS;
  const maxLvl = levels[levels.length - 1];
  const W = 1156, H = 220, padL = 50, padR = 20, padT = 36, padB = 32;
  const chartW = W - padL - padR, chartH = H - padT - padB;

  const toX = v => padL + (v / maxLvl) * chartW;
  const toY = v => H - padB - (v / 100) * chartH;

  // Compute agreement bins at each level
  const data = levels.map((level, li) => {
    let n5 = 0, n4 = 0, n3 = 0, nHome = 0, nOut = 0;
    for (let id = 0; id < 100; id++) {
      const v = agentVoteCount[li]?.[id];
      if (!v) continue;
      const maj = Math.max(v.yes, v.no);
      if (maj === 5) n5++;
      else if (maj === 4) n4++;
      else n3++;
      const d = agentDecisions[li]?.[id] || 'no';
      if (d === 'yes') nHome++; else nOut++;
    }
    const total = n5 + n4 + n3 || 1;
    return {
      level, li,
      pct5: (n5 / total) * 100,
      pct4: (n4 / total) * 100,
      pct3: (n3 / total) * 100,
      majorityHome: nHome > nOut,
    };
  });

  // Build stacked area paths (bottom to top: 3/5, 4/5, 5/5)
  // Baseline = 0%, stacking upward
  function areaPath(data, getBot, getTop) {
    const fwd = data.map(d => `${toX(d.level).toFixed(1)},${toY(getTop(d)).toFixed(1)}`);
    const rev = [...data].reverse().map(d => `${toX(d.level).toFixed(1)},${toY(getBot(d)).toFixed(1)}`);
    return [...fwd, ...rev].join(' ');
  }

  // Stack: 5/5 on bottom, then 4/5, then 3/5 on top — each band non-overlapping
  const area5 = areaPath(data, () => 0, d => d.pct5);
  const area4 = areaPath(data, d => d.pct5, d => d.pct5 + d.pct4);
  const area3 = areaPath(data, d => d.pct5 + d.pct4, d => d.pct5 + d.pct4 + d.pct3);

  // Each polygon is its own non-overlapping band — opaque fills, distinct colors
  const areas = `<polygon points="${area5}" fill="#2563EB" opacity="1"/>` +
    `<polygon points="${area4}" fill="#60A5FA" opacity="1"/>` +
    `<polygon points="${area3}" fill="#BAD6FC" opacity="1"/>`;

  // Majority line on top — color flips at crossover
  let majorityLine = '';
  for (let i = 0; i < data.length - 1; i++) {
    const d0 = data[i], d1 = data[i + 1];
    const color = d0.majorityHome ? '#F97316' : '#3B82F6';
    const y0 = d0.pct5 + d0.pct4 + d0.pct3;
    const y1 = d1.pct5 + d1.pct4 + d1.pct3;
    majorityLine += `<line x1="${toX(d0.level).toFixed(1)}" y1="${toY(y0).toFixed(1)}" x2="${toX(d1.level).toFixed(1)}" y2="${toY(y1).toFixed(1)}" stroke="${color}" stroke-width="2"/>`;
  }

  // Grid
  let grid = '';
  for (const v of [25, 50, 75]) grid += `<line x1="${padL}" y1="${toY(v)}" x2="${W - padR}" y2="${toY(v)}" stroke="#1a2035" stroke-width="0.5"/>`;
  for (const x of [1, 2, 3, 4, 5, 6, 7]) grid += `<line x1="${toX(x)}" y1="${padT}" x2="${toX(x)}" y2="${H - padB}" stroke="#1a2035" stroke-width="0.5"/>`;

  // Axis labels
  let labels = '';
  for (const v of [0, 25, 50, 75, 100]) labels += `<text x="${padL - 6}" y="${toY(v) + 3}" fill="#4a6580" font-size="7" font-family="'Press Start 2P',monospace" text-anchor="end">${v}%</text>`;
  for (const x of [0, 1, 2, 3, 4, 5, 6, 7]) labels += `<text x="${toX(x)}" y="${H - padB + 14}" fill="#4a6580" font-size="7" font-family="'Press Start 2P',monospace" text-anchor="middle">${x}%</text>`;

  const yTitle = `<text x="12" y="${padT + chartH / 2}" fill="#3a5068" font-size="7" font-family="'Press Start 2P',monospace" text-anchor="middle" transform="rotate(-90,12,${padT + chartH / 2})">% OF AGENTS</text>`;
  const xTitle = `<text x="${padL + chartW / 2}" y="${H - 4}" fill="#3a5068" font-size="7" font-family="'Press Start 2P',monospace" text-anchor="middle">INFECTION RATE</text>`;
  const title = `<text x="${padL + 4}" y="${padT - 10}" fill="#7a9ab8" font-size="9" font-family="'Press Start 2P',monospace" font-weight="bold">VOTE CONCORDANCE</text>`;

  // Legend
  const lgdY = padT - 10;
  const lgd = [
    { label: '5/5 unanimous', color: '#2563EB', x: W - 520 },
    { label: '4/5 strong', color: '#60A5FA', x: W - 380 },
    { label: '3/5 split', color: '#BAD6FC', x: W - 260 },
    { label: 'maj home', color: '#F97316', x: W - 160, line: true },
    { label: 'maj out', color: '#3B82F6', x: W - 70, line: true },
  ];
  const legendSvg = lgd.map(p => {
    if (p.line) {
      return `<line x1="${p.x}" y1="${lgdY - 2}" x2="${p.x + 10}" y2="${lgdY - 2}" stroke="${p.color}" stroke-width="2"/>` +
        `<text x="${p.x + 14}" y="${lgdY + 1}" fill="${p.color}" font-size="5" font-family="'Press Start 2P',monospace">${p.label}</text>`;
    }
    return `<rect x="${p.x}" y="${lgdY - 6}" width="8" height="8" fill="${p.color}" rx="1"/>` +
      `<text x="${p.x + 12}" y="${lgdY + 1}" fill="${p.color}" font-size="5" font-family="'Press Start 2P',monospace">${p.label}</text>`;
  }).join('');

  // Playhead
  const currentLevel = levels[currentStep] || 0;
  const phX = toX(currentLevel);
  const playhead = `<line x1="${phX}" y1="${padT}" x2="${phX}" y2="${H - padB}" stroke="rgba(255,255,255,0.4)" stroke-width="1" stroke-dasharray="4,4"/>`;

  // Invisible hit targets for tooltip (one per level)
  let hitRects = '';
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const x0 = i === 0 ? padL : toX((data[i - 1].level + d.level) / 2);
    const x1 = i === data.length - 1 ? W - padR : toX((d.level + data[i + 1].level) / 2);
    hitRects += `<rect x="${x0.toFixed(1)}" y="${padT}" width="${(x1 - x0).toFixed(1)}" height="${chartH}" fill="transparent" data-li="${i}" style="cursor:crosshair"/>`;
  }

  const tooltipId = 'concordance-tooltip';

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="display:block">
    <rect width="${W}" height="${H}" fill="#080c14" rx="4"/>
    ${grid}${labels}${yTitle}${xTitle}${title}${legendSvg}
    ${areas}${majorityLine}${playhead}${hitRects}
  </svg>
  <div id="${tooltipId}" style="display:none;position:absolute;background:#0d1520ee;border:1px solid #1e2d40;padding:4px 8px;border-radius:4px;font-size:6px;font-family:'Press Start 2P',monospace;color:#c8d8e8;line-height:1.8;pointer-events:none;white-space:nowrap;z-index:100"></div>`;

  // Tooltip handler
  const svg = el.querySelector('svg');
  svg.addEventListener('mousemove', (e) => {
    const target = e.target.closest('rect[data-li]');
    const tip = document.getElementById(tooltipId);
    if (!target || !tip) { if (tip) tip.style.display = 'none'; return; }

    const li = parseInt(target.dataset.li);
    const d = data[li];
    if (!d) return;

    const majLabel = d.majorityHome
      ? '<span style="color:#F97316">majority HOME</span>'
      : '<span style="color:#3B82F6">majority OUT</span>';
    tip.innerHTML = `${d.level.toFixed(1)}% infection<br>` +
      `5/5: ${d.pct5.toFixed(0)}% · 4/5: ${d.pct4.toFixed(0)}% · 3/5: ${d.pct3.toFixed(0)}%<br>${majLabel}`;
    tip.style.display = 'block';
    const rect = el.getBoundingClientRect();
    tip.style.left = (e.clientX - rect.left + 12) + 'px';
    tip.style.top = (e.clientY - rect.top - 10) + 'px';
  });
  svg.addEventListener('mouseleave', () => {
    const tip = document.getElementById(tooltipId);
    if (tip) tip.style.display = 'none';
  });
}

// ═══════════════════════════════════════════════════════════════
// CONCORDANCE 6-LINE (home/out × 3 confidence levels)
// ═══════════════════════════════════════════════════════════════

function buildConcordance6Line() {
  const el = document.getElementById('concordance-6line');
  if (!el) return;

  const levels = CONFIG.INFECTION_LEVELS;
  const maxLvl = levels[levels.length - 1];
  const W = 1156, H = 220, padL = 50, padR = 20, padT = 36, padB = 32;
  const chartW = W - padL - padR, chartH = H - padT - padB;

  const toX = v => padL + (v / maxLvl) * chartW;
  const toY = v => H - padB - (v / 100) * chartH;

  // Compute 6 lines: home5, home4, home3, out5, out4, out3
  const data = levels.map((level, li) => {
    let h5 = 0, h4 = 0, h3 = 0, o5 = 0, o4 = 0, o3 = 0;
    for (let id = 0; id < 100; id++) {
      const v = agentVoteCount[li]?.[id];
      if (!v) continue;
      const d = agentDecisions[li]?.[id] || 'no';
      const maj = Math.max(v.yes, v.no);
      if (d === 'yes') {
        if (maj === 5) h5++; else if (maj === 4) h4++; else h3++;
      } else {
        if (maj === 5) o5++; else if (maj === 4) o4++; else o3++;
      }
    }
    return { level, h5, h4, h3, o5, o4, o3 };
  });

  // Grid
  let grid = '';
  for (const v of [25, 50, 75]) grid += `<line x1="${padL}" y1="${toY(v)}" x2="${W - padR}" y2="${toY(v)}" stroke="#1a2035" stroke-width="0.5"/>`;
  for (const x of [1, 2, 3, 4, 5, 6, 7]) grid += `<line x1="${toX(x)}" y1="${padT}" x2="${toX(x)}" y2="${H - padB}" stroke="#1a2035" stroke-width="0.5"/>`;

  // Axis labels
  let labels = '';
  for (const v of [0, 25, 50, 75, 100]) labels += `<text x="${padL - 6}" y="${toY(v) + 3}" fill="#4a6580" font-size="7" font-family="'Press Start 2P',monospace" text-anchor="end">${v}%</text>`;
  for (const x of [0, 1, 2, 3, 4, 5, 6, 7]) labels += `<text x="${toX(x)}" y="${H - padB + 14}" fill="#4a6580" font-size="7" font-family="'Press Start 2P',monospace" text-anchor="middle">${x}%</text>`;

  const yTitle = `<text x="12" y="${padT + chartH / 2}" fill="#3a5068" font-size="7" font-family="'Press Start 2P',monospace" text-anchor="middle" transform="rotate(-90,12,${padT + chartH / 2})">% OF AGENTS</text>`;
  const xTitle = `<text x="${padL + chartW / 2}" y="${H - 4}" fill="#3a5068" font-size="7" font-family="'Press Start 2P',monospace" text-anchor="middle">INFECTION RATE</text>`;
  const title = `<text x="${padL + 4}" y="${padT - 10}" fill="#7a9ab8" font-size="9" font-family="'Press Start 2P',monospace" font-weight="bold">CONCORDANCE — 6 LINES (HOME/OUT × CONFIDENCE)</text>`;

  // Draw 6 lines
  const lineDefs = [
    { key: 'h5', color: '#F97316', width: 2.5, dash: '' },
    { key: 'h4', color: '#FBBF24', width: 1.5, dash: '' },
    { key: 'h3', color: '#FDE68A', width: 1.2, dash: '4,3' },
    { key: 'o5', color: '#3B82F6', width: 2.5, dash: '' },
    { key: 'o4', color: '#60A5FA', width: 1.5, dash: '' },
    { key: 'o3', color: '#93C5FD', width: 1.2, dash: '4,3' },
  ];

  let linesSvg = '';
  for (const ld of lineDefs) {
    const pts = data.map(d => `${toX(d.level).toFixed(1)},${toY(d[ld.key]).toFixed(1)}`).join(' ');
    const dashAttr = ld.dash ? ` stroke-dasharray="${ld.dash}"` : '';
    linesSvg += `<polyline points="${pts}" stroke="${ld.color}" stroke-width="${ld.width}" fill="none"${dashAttr}/>`;
  }

  // Legend
  const lgdY = padT - 10;
  const lgdItems = [
    { label: 'Home 5/5', color: '#F97316', x: W - 600 },
    { label: 'Home 4/5', color: '#FBBF24', x: W - 500 },
    { label: 'Home 3/5', color: '#FDE68A', x: W - 400 },
    { label: 'Out 5/5', color: '#3B82F6', x: W - 300 },
    { label: 'Out 4/5', color: '#60A5FA', x: W - 210 },
    { label: 'Out 3/5', color: '#93C5FD', x: W - 120 },
  ];
  const legendSvg = lgdItems.map(p =>
    `<line x1="${p.x}" y1="${lgdY - 2}" x2="${p.x + 10}" y2="${lgdY - 2}" stroke="${p.color}" stroke-width="2"/>` +
    `<text x="${p.x + 14}" y="${lgdY + 1}" fill="${p.color}" font-size="5" font-family="'Press Start 2P',monospace">${p.label}</text>`
  ).join('');

  // Playhead
  const currentLevel = levels[currentStep] || 0;
  const phX = toX(currentLevel);
  const playhead = `<line x1="${phX}" y1="${padT}" x2="${phX}" y2="${H - padB}" stroke="rgba(255,255,255,0.4)" stroke-width="1" stroke-dasharray="4,4"/>`;

  // Hit targets for tooltip
  let hitRects = '';
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const x0 = i === 0 ? padL : toX((data[i - 1].level + d.level) / 2);
    const x1 = i === data.length - 1 ? W - padR : toX((d.level + data[i + 1].level) / 2);
    hitRects += `<rect x="${x0.toFixed(1)}" y="${padT}" width="${(x1 - x0).toFixed(1)}" height="${chartH}" fill="transparent" data-li="${i}" style="cursor:crosshair"/>`;
  }

  // Dots at current level
  const cd = data[currentStep];
  let dots = '';
  if (cd) {
    for (const ld of lineDefs) {
      dots += `<circle cx="${toX(cd.level).toFixed(1)}" cy="${toY(cd[ld.key]).toFixed(1)}" r="3" fill="${ld.color}" stroke="#080c14" stroke-width="1"/>`;
    }
  }

  const tooltipId = 'conc6-tooltip';
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="display:block">
    <rect width="${W}" height="${H}" fill="#080c14" rx="4"/>
    ${grid}${labels}${yTitle}${xTitle}${title}${legendSvg}
    ${linesSvg}${dots}${playhead}${hitRects}
  </svg>
  <div id="${tooltipId}" style="display:none;position:absolute;background:#0d1520ee;border:1px solid #1e2d40;padding:4px 8px;border-radius:4px;font-size:6px;font-family:'Press Start 2P',monospace;color:#c8d8e8;line-height:1.8;pointer-events:none;white-space:nowrap;z-index:100"></div>`;

  // Tooltip
  const svg = el.querySelector('svg');
  svg.addEventListener('mousemove', (e) => {
    const target = e.target.closest('rect[data-li]');
    const tip = document.getElementById(tooltipId);
    if (!target || !tip) { if (tip) tip.style.display = 'none'; return; }
    const li = parseInt(target.dataset.li);
    const d = data[li];
    if (!d) return;
    tip.innerHTML = `${d.level.toFixed(1)}% infection<br>` +
      `<span style="color:#F97316">Home:</span> 5/5=${d.h5} · 4/5=${d.h4} · 3/5=${d.h3}<br>` +
      `<span style="color:#3B82F6">Out:</span> 5/5=${d.o5} · 4/5=${d.o4} · 3/5=${d.o3}`;
    tip.style.display = 'block';
    const rect = el.getBoundingClientRect();
    tip.style.left = (e.clientX - rect.left + 12) + 'px';
    tip.style.top = (e.clientY - rect.top - 10) + 'px';
  });
  svg.addEventListener('mouseleave', () => {
    const tip = document.getElementById(tooltipId);
    if (tip) tip.style.display = 'none';
  });
}

// ═══════════════════════════════════════════════════════════════
// CONCORDANCE 3-LINE (unanimous/strong/split — color changes at majority flip)
// ═══════════════════════════════════════════════════════════════

function buildConcordance3Line() {
  const el = document.getElementById('concordance-3line');
  if (!el) return;

  const levels = CONFIG.INFECTION_LEVELS;
  const maxLvl = levels[levels.length - 1];
  const W = 1156, H = 220, padL = 50, padR = 20, padT = 36, padB = 32;
  const chartW = W - padL - padR, chartH = H - padT - padB;

  const toX = v => padL + (v / maxLvl) * chartW;
  const toY = v => H - padB - (v / 100) * chartH;

  // Compute 3 bins + majority at each level
  const data = levels.map((level, li) => {
    let n5 = 0, n4 = 0, n3 = 0, nHome = 0;
    for (let id = 0; id < 100; id++) {
      const v = agentVoteCount[li]?.[id];
      if (!v) continue;
      const maj = Math.max(v.yes, v.no);
      if (maj === 5) n5++; else if (maj === 4) n4++; else n3++;
      if (agentDecisions[li]?.[id] === 'yes') nHome++;
    }
    return { level, n5, n4, n3, majorityHome: nHome > 50 };
  });

  // Grid
  let grid = '';
  for (const v of [25, 50, 75]) grid += `<line x1="${padL}" y1="${toY(v)}" x2="${W - padR}" y2="${toY(v)}" stroke="#1a2035" stroke-width="0.5"/>`;
  for (const x of [1, 2, 3, 4, 5, 6, 7]) grid += `<line x1="${toX(x)}" y1="${padT}" x2="${toX(x)}" y2="${H - padB}" stroke="#1a2035" stroke-width="0.5"/>`;

  // Axis labels
  let labels = '';
  for (const v of [0, 25, 50, 75, 100]) labels += `<text x="${padL - 6}" y="${toY(v) + 3}" fill="#4a6580" font-size="7" font-family="'Press Start 2P',monospace" text-anchor="end">${v}%</text>`;
  for (const x of [0, 1, 2, 3, 4, 5, 6, 7]) labels += `<text x="${toX(x)}" y="${H - padB + 14}" fill="#4a6580" font-size="7" font-family="'Press Start 2P',monospace" text-anchor="middle">${x}%</text>`;

  const yTitle = `<text x="12" y="${padT + chartH / 2}" fill="#3a5068" font-size="7" font-family="'Press Start 2P',monospace" text-anchor="middle" transform="rotate(-90,12,${padT + chartH / 2})">% OF AGENTS</text>`;
  const xTitle = `<text x="${padL + chartW / 2}" y="${H - 4}" fill="#3a5068" font-size="7" font-family="'Press Start 2P',monospace" text-anchor="middle">INFECTION RATE</text>`;
  const title = `<text x="${padL + 4}" y="${padT - 10}" fill="#7a9ab8" font-size="9" font-family="'Press Start 2P',monospace" font-weight="bold">CONCORDANCE — 3 LINES (COLOR = MAJORITY)</text>`;

  // Draw 3 lines with color-changing segments
  const lineKeys = [
    { key: 'n5', label: '5/5 unanimous', width: 2.5, dash: '' },
    { key: 'n4', label: '4/5 strong', width: 1.8, dash: '8,4' },
    { key: 'n3', label: '3/5 split', width: 1.2, dash: '3,3' },
  ];

  let linesSvg = '';
  for (const lk of lineKeys) {
    for (let i = 0; i < data.length - 1; i++) {
      const d0 = data[i], d1 = data[i + 1];
      const color = d0.majorityHome ? '#F97316' : '#3B82F6';
      const dashAttr = lk.dash ? ` stroke-dasharray="${lk.dash}"` : '';
      linesSvg += `<line x1="${toX(d0.level).toFixed(1)}" y1="${toY(d0[lk.key]).toFixed(1)}" x2="${toX(d1.level).toFixed(1)}" y2="${toY(d1[lk.key]).toFixed(1)}" stroke="${color}" stroke-width="${lk.width}"${dashAttr}/>`;
    }
  }

  // Legend
  const lgdY = padT - 10;
  const legendSvg =
    `<line x1="${W - 450}" y1="${lgdY - 2}" x2="${W - 440}" y2="${lgdY - 2}" stroke="#aaa" stroke-width="2.5"/>` +
    `<text x="${W - 436}" y="${lgdY + 1}" fill="#7a9ab8" font-size="5" font-family="'Press Start 2P',monospace">5/5</text>` +
    `<line x1="${W - 380}" y1="${lgdY - 2}" x2="${W - 370}" y2="${lgdY - 2}" stroke="#aaa" stroke-width="1.8" stroke-dasharray="8,4"/>` +
    `<text x="${W - 366}" y="${lgdY + 1}" fill="#7a9ab8" font-size="5" font-family="'Press Start 2P',monospace">4/5</text>` +
    `<line x1="${W - 310}" y1="${lgdY - 2}" x2="${W - 300}" y2="${lgdY - 2}" stroke="#aaa" stroke-width="1.2" stroke-dasharray="3,3"/>` +
    `<text x="${W - 296}" y="${lgdY + 1}" fill="#7a9ab8" font-size="5" font-family="'Press Start 2P',monospace">3/5</text>` +
    `<line x1="${W - 230}" y1="${lgdY - 2}" x2="${W - 220}" y2="${lgdY - 2}" stroke="#F97316" stroke-width="2"/>` +
    `<text x="${W - 216}" y="${lgdY + 1}" fill="#F97316" font-size="5" font-family="'Press Start 2P',monospace">maj home</text>` +
    `<line x1="${W - 120}" y1="${lgdY - 2}" x2="${W - 110}" y2="${lgdY - 2}" stroke="#3B82F6" stroke-width="2"/>` +
    `<text x="${W - 106}" y="${lgdY + 1}" fill="#3B82F6" font-size="5" font-family="'Press Start 2P',monospace">maj out</text>`;

  // Playhead
  const currentLevel = levels[currentStep] || 0;
  const phX = toX(currentLevel);
  const playhead = `<line x1="${phX}" y1="${padT}" x2="${phX}" y2="${H - padB}" stroke="rgba(255,255,255,0.4)" stroke-width="1" stroke-dasharray="4,4"/>`;

  // Dots at current level
  const cd = data[currentStep];
  let dots = '';
  if (cd) {
    const dotColor = cd.majorityHome ? '#F97316' : '#3B82F6';
    for (const lk of lineKeys) {
      dots += `<circle cx="${toX(cd.level).toFixed(1)}" cy="${toY(cd[lk.key]).toFixed(1)}" r="3" fill="${dotColor}" stroke="#080c14" stroke-width="1"/>`;
    }
  }

  // Hit targets
  let hitRects = '';
  for (let i = 0; i < data.length; i++) {
    const d = data[i];
    const x0 = i === 0 ? padL : toX((data[i - 1].level + d.level) / 2);
    const x1 = i === data.length - 1 ? W - padR : toX((d.level + data[i + 1].level) / 2);
    hitRects += `<rect x="${x0.toFixed(1)}" y="${padT}" width="${(x1 - x0).toFixed(1)}" height="${chartH}" fill="transparent" data-li="${i}" style="cursor:crosshair"/>`;
  }

  const tooltipId = 'conc3-tooltip';
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" style="display:block">
    <rect width="${W}" height="${H}" fill="#080c14" rx="4"/>
    ${grid}${labels}${yTitle}${xTitle}${title}${legendSvg}
    ${linesSvg}${dots}${playhead}${hitRects}
  </svg>
  <div id="${tooltipId}" style="display:none;position:absolute;background:#0d1520ee;border:1px solid #1e2d40;padding:4px 8px;border-radius:4px;font-size:6px;font-family:'Press Start 2P',monospace;color:#c8d8e8;line-height:1.8;pointer-events:none;white-space:nowrap;z-index:100"></div>`;

  // Tooltip
  const svg = el.querySelector('svg');
  svg.addEventListener('mousemove', (e) => {
    const target = e.target.closest('rect[data-li]');
    const tip = document.getElementById(tooltipId);
    if (!target || !tip) { if (tip) tip.style.display = 'none'; return; }
    const li = parseInt(target.dataset.li);
    const d = data[li];
    if (!d) return;
    const majLabel = d.majorityHome
      ? '<span style="color:#F97316">majority HOME</span>'
      : '<span style="color:#3B82F6">majority OUT</span>';
    tip.innerHTML = `${d.level.toFixed(1)}% infection<br>5/5: ${d.n5}% · 4/5: ${d.n4}% · 3/5: ${d.n3}%<br>${majLabel}`;
    tip.style.display = 'block';
    const rect = el.getBoundingClientRect();
    tip.style.left = (e.clientX - rect.left + 12) + 'px';
    tip.style.top = (e.clientY - rect.top - 10) + 'px';
  });
  svg.addEventListener('mouseleave', () => {
    const tip = document.getElementById(tooltipId);
    if (tip) tip.style.display = 'none';
  });
}

function updateChartPlayheads() {
  buildMobilityCurveChart();
  buildModelBreakdownPanel();
  buildConcordanceChart();
  buildConcordance6Line();
  buildConcordance3Line();
  buildAgentGrid();
}
