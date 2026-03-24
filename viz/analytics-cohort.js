'use strict';
// analytics-cohort.js — Cohort Analysis tab rendering
// Extracted from analytics.js during refactor (March 2026)

// ── Cohort Presets (shared filter pills for Figs 27, 28, 29) ─────────────
const COHORT_PRESETS = [
  { label: 'All',                      indices: null },
  { label: 'Flagships',                indices: [0, 5, 14] },
  { label: 'Reasoning (GPT-5.2)',      indices: [5, 6, 7, 8] },
  { label: 'Reasoning (Gemini 3)',     indices: [14, 15, 16, 17] },
  { label: 'Size (Anthropic)',         indices: [0, 1, 2] },
  { label: 'Size (Gemini)',            indices: [18, 19] },
  { label: 'Evolution (OpenAI)',       indices: [12, 11, 9, 5] },
  { label: 'Evolution (Anthropic)',    indices: [3, 1] },
  { label: 'Evolution (Gemini)',       indices: [20, 19, 14] },
  { label: 'Anthropic',               indices: [0, 1, 2, 3, 4] },
  { label: 'OpenAI',                   indices: [5, 6, 7, 8, 9, 10, 11, 12, 13] },
  { label: 'Gemini',                   indices: [14, 15, 16, 17, 18, 19, 20] },
];

// Per-figure filter state: { activePreset, checked (Set of model indices) }
const _filterState = {};

function _indicesToFilter(indices) {
  if (!indices) return null;
  const keys = new Set();
  indices.forEach(i => keys.add(configDirKey(CONFIG.MODELS[i])));
  return keys;
}

function buildFilterPills(containerId, figKey, onFilterChange) {
  const container = document.getElementById(containerId);
  if (!container) return;

  // Init state
  _filterState[figKey] = { activePreset: 0, checked: new Set(CONFIG.MODELS.map((_, i) => i)) };
  const state = _filterState[figKey];

  // Preset pills
  let html = '<div class="spotlight-presets" style="margin:8px 0 6px">';
  COHORT_PRESETS.forEach((p, i) => {
    html += `<button class="spotlight-preset-pill${i === 0 ? ' active' : ''}" data-fig="${figKey}" data-preset="${i}">${esc(p.label)}</button>`;
  });
  html += '</div>';

  // Fine-tune expander
  const providers = ['anthropic', 'openai', 'gemini'];
  const provLabels = { anthropic: 'Anthropic', openai: 'OpenAI', gemini: 'Gemini' };
  html += `<details class="spotlight-model-details" style="margin:0 0 8px"><summary style="font-size:11px;color:#888;cursor:pointer">&#9654; Fine-tune model selection</summary>`;
  html += '<div style="display:flex;gap:24px;flex-wrap:wrap;margin-top:6px">';
  providers.forEach(prov => {
    html += '<div style="min-width:140px">';
    html += `<div style="font-size:11px;font-weight:bold;color:#555;margin-bottom:4px">${provLabels[prov]}</div>`;
    CONFIG.MODELS.forEach((m, i) => {
      if (m.provider !== prov) return;
      html += `<label style="display:block;font-size:11px;color:#666;cursor:pointer;padding:1px 0"><input type="checkbox" class="fp-cb-${figKey}" data-idx="${i}" checked style="margin-right:4px"> ${esc(m.label)}</label>`;
    });
    html += '</div>';
  });
  html += '</div></details>';
  container.innerHTML = html;

  function syncCheckboxes() {
    container.querySelectorAll(`.fp-cb-${figKey}`).forEach(cb => {
      cb.checked = state.checked.has(+cb.dataset.idx);
    });
  }

  function fireChange() {
    let modelFilter = null;
    if (state.checked.size < CONFIG.MODELS.length) {
      modelFilter = _indicesToFilter([...state.checked]);
    }
    onFilterChange(modelFilter);
  }

  function applyPreset(idx) {
    state.activePreset = idx;
    const preset = COHORT_PRESETS[idx];
    state.checked.clear();
    if (preset.indices) {
      preset.indices.forEach(i => state.checked.add(i));
    } else {
      CONFIG.MODELS.forEach((_, i) => state.checked.add(i));
    }
    syncCheckboxes();
    container.querySelectorAll('.spotlight-preset-pill').forEach((pill, pi) => {
      pill.classList.toggle('active', pi === idx);
    });
    fireChange();
  }

  // Wire preset pills
  container.querySelectorAll('.spotlight-preset-pill').forEach(pill => {
    pill.addEventListener('click', () => applyPreset(+pill.dataset.preset));
  });

  // Wire fine-tune checkboxes
  container.querySelectorAll(`.fp-cb-${figKey}`).forEach(cb => {
    cb.addEventListener('change', () => {
      const idx = +cb.dataset.idx;
      if (cb.checked) state.checked.add(idx); else state.checked.delete(idx);
      // Deactivate preset pill (custom selection)
      state.activePreset = -1;
      container.querySelectorAll('.spotlight-preset-pill').forEach(p => p.classList.remove('active'));
      fireChange();
    });
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

  // Fig 29: cross-model trait forest plot + interpretation guide
  renderFig26Guide();

  // Figs 27 (Log-Odds Landscape), 29 (Forest Plot), 28 (Consistency Matrix)
  // All share filter pills — load data, build pills, render
  loadAgentsJSON(() => {
    loadAllRegressions(allRegs => {
      // Store for re-render by filter pills
      _cohortAllRegs = allRegs;

      // Initial renders (all models)
      renderFig26ForestPlot(allRegs);
      renderLogOddsLandscape(allRegs);
      renderAuthorComparisons();

      // Fig 29 filter pills
      buildFilterPills('fig29-filters', 'fig29', filter => {
        renderFig26ForestPlot(_cohortAllRegs, 'fig26-chart', filter);
      });

      // Fig 27 filter pills
      buildFilterPills('fig27-lo-filters', 'fig27lo', filter => {
        renderLogOddsLandscape(_cohortAllRegs, 'fig27-lo-chart', filter);
      });

      // Fig 29 cross-model prediction
      loadAgentConsistency(consistencyData => {
        _cohortConsistencyData = consistencyData;
        renderFig29CrossModelPrediction(allRegs, consistencyData);

        // Fig 28 initial render + filter pills
        renderFig27ConsistencyMatrix(consistencyData);
        buildFilterPills('fig28-filters', 'fig28', filter => {
          renderFig27ConsistencyMatrix(_cohortConsistencyData, 'fig27-chart', filter);
        });
      });
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

  // Fig 37: Decision Anatomy: Traits & Infection Level Impact (now "Figure 26" in Cohort Analysis)
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
function renderFig26ForestPlot(allRegs, elId, modelFilter) {
  const el = document.getElementById(elId || 'fig26-chart');
  if (!el) return;

  const TRAIT_MAP = [
    { key: 'extraverted',   label: 'Extraversion',           tipLabel: 'Extraverted',          leftDir: 'Go out more',   rightDir: 'Stay home more' },
    { key: 'agreeable',     label: 'Agreeableness',          tipLabel: 'Agreeable',             leftDir: 'Go out more',   rightDir: 'Stay home more' },
    { key: 'conscientious', label: 'Conscientiousness',      tipLabel: 'Conscientious',         leftDir: 'Go out more',   rightDir: 'Stay home more' },
    { key: 'emot_stable',   label: 'Emotional Stability',    tipLabel: 'Emotionally Stable',    leftDir: 'Go out more',   rightDir: 'Stay home more' },
    { key: 'open_to_exp',   label: 'Openness to Experience', tipLabel: 'Open to Experience',    leftDir: 'Go out more',   rightDir: 'Stay home more' },
    { key: 'male',          label: 'Male (vs. Female)',       tipLabel: 'Male',                  leftDir: 'Go out more',   rightDir: 'Stay home more' },
    { key: 'age',           label: 'Age (per year)',          tipLabel: 'Age (per year)',         leftDir: 'Go out more',   rightDir: 'Stay home more' },
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

  // Sort: CONFIG.MODELS order (matches Figure 29 heatmap)
  const modelIdx = {};
  CONFIG.MODELS.forEach((m, i) => { modelIdx[m.label] = i; });
  configs.sort((a, b) => (modelIdx[a.label] ?? 999) - (modelIdx[b.label] ?? 999));

  const nConfigs = configs.length;
  if (nConfigs === 0) {
    el.innerHTML = '<div style="color:#999;padding:20px">No regression data available.</div>';
    return;
  }

  // Pre-compute infection range + intercept per config (shared across all panels)
  const infData = {};
  configs.forEach(c => {
    const coefs = allRegs[c.key].model2.coefficients;
    const b1 = coefs.infection_pct.estimate;
    const b2 = coefs.infection_pct_sq.estimate;
    const xPeak = Math.min(7, Math.max(0, -b1 / (2 * b2)));
    const vals = [0, b1 * 7 + b2 * 49, b1 * xPeak + b2 * xPeak * xPeak];
    infData[c.key] = {
      intercept: coefs.intercept.estimate,
      minInfLO: Math.min(...vals),
      maxInfLO: Math.max(...vals),
    };
  });

  // Auto-scale X axis: scan ALL configs (not just filtered) so axis stays constant
  let globalMin = Infinity, globalMax = -Infinity;
  const expand = v => { if (v < globalMin) globalMin = v; if (v > globalMax) globalMax = v; };
  Object.keys(allRegs).forEach(key => {
    const reg = allRegs[key];
    if (!reg || !reg.model2 || !reg.model2.coefficients) return;
    const coefs = reg.model2.coefficients;
    TRAIT_MAP.forEach(t => {
      const coef = coefs[t.key];
      if (!coef) return;
      expand(coef.estimate - 1.96 * (coef.se || 0));
      expand(coef.estimate + 1.96 * (coef.se || 0));
    });
    if (coefs.intercept) expand(coefs.intercept.estimate);
    if (coefs.infection_pct && coefs.infection_pct_sq) {
      const b1 = coefs.infection_pct.estimate, b2 = coefs.infection_pct_sq.estimate;
      const xP = Math.min(7, Math.max(0, -b1 / (2 * b2)));
      [0, b1 * 7 + b2 * 49, b1 * xP + b2 * xP * xP].forEach(expand);
    }
  });
  const range = globalMax - globalMin;
  globalMin -= range * 0.05;
  globalMax += range * 0.05;

  // Layout
  const W = Math.min(el.parentElement?.offsetWidth || 860, 860);
  const rowH = 14;
  const panelPad = { t: 24, b: 48, l: 160, r: 60 };
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

  function xScale(v) {
    return panelPad.l + ((v - globalMin) / (globalMax - globalMin)) * plotW;
  }

  // Grid ticks (same style as Figure 27)
  const step = range > 40 ? 10 : range > 20 ? 5 : range > 10 ? 2 : 1;
  const gridStart = Math.ceil(globalMin / step) * step;
  function loToProb(lo) { return 1 / (1 + Math.exp(-lo)); }
  function fmtProb(p) {
    if (p < 0.0005) return '<0.1%';
    if (p > 0.9995) return '>99.9%';
    if (p < 0.01) return (p * 100).toFixed(1) + '%';
    if (p > 0.99) return (p * 100).toFixed(1) + '%';
    if (p > 0.095 && p < 0.995) return Math.round(p * 100) + '%';
    return (p * 100).toFixed(1) + '%';
  }

  // Tooltip system
  const _ftips = [];
  const _ftipColors = [];
  function ftip(text, color) { _ftips.push(text); _ftipColors.push(color || '#888'); return _ftips.length - 1; }

  let svg = '';

  TRAIT_MAP.forEach((trait, ti) => {
    const py = ti * (panelH + panelGap);

    // Panel background
    svg += `<rect x="0" y="${py}" width="${W}" height="${panelH}" fill="${SVG_BG}" rx="3"/>`;

    // Panel title
    svg += `<text x="${W / 2}" y="${py + 16}" font-size="12" font-weight="bold" fill="#111" font-family="${SERIF}" text-anchor="middle">${trait.label}</text>`;

    const panelTop = py + panelPad.t;
    const panelBot = panelTop + panelInnerH;

    // Reference line at β=0 (no effect)
    const x0 = xScale(0);
    if (x0 >= panelPad.l && x0 <= panelPad.l + plotW) {
      svg += `<line x1="${x0}" y1="${panelTop}" x2="${x0}" y2="${panelBot}" stroke="#999" stroke-width="1" stroke-dasharray="4,3"/>`;
    }

    // Grid lines + tick labels (primary: log-odds)
    for (let v = gridStart; v <= globalMax; v += step) {
      const tx = xScale(v);
      svg += `<line x1="${tx}" y1="${panelTop}" x2="${tx}" y2="${panelBot}" stroke="#eee" stroke-width="0.5"/>`;
      svg += `<line x1="${tx}" y1="${panelBot}" x2="${tx}" y2="${panelBot + 4}" stroke="#bbb" stroke-width="0.5"/>`;
      svg += `<text x="${tx}" y="${panelBot + 13}" font-size="8" fill="#888" font-family="${SERIF}" text-anchor="middle">${v}</text>`;
    }
    svg += `<text x="${panelPad.l - 8}" y="${panelBot + 13}" font-size="7" fill="#888" font-family="${SERIF}" text-anchor="end">Log-odds</text>`;

    // 5% / 95% reference ticks on primary axis (±2.94)
    const probRefs = [
      { lo: Math.log(0.05 / 0.95), label: '-2.94' },
      { lo: Math.log(0.95 / 0.05), label: '2.94' },
    ];
    probRefs.forEach(({ lo, label }) => {
      if (lo < globalMin || lo > globalMax) return;
      const px = xScale(lo);
      svg += `<line x1="${px}" y1="${panelTop}" x2="${px}" y2="${panelBot}" stroke="#ddd" stroke-width="0.5" stroke-dasharray="2,3"/>`;
      svg += `<text x="${px}" y="${panelBot + 13}" font-size="7" fill="#999" font-family="${SERIF}" text-anchor="middle">${label}</text>`;
    });

    // Secondary axis: P(stay home)
    const probAxisY = panelBot + 22;
    svg += `<text x="${panelPad.l - 8}" y="${probAxisY + 10}" font-size="7" fill="#888" font-family="${SERIF}" text-anchor="end">P(stay home)</text>`;
    svg += `<line x1="${panelPad.l}" y1="${probAxisY}" x2="${panelPad.l + plotW}" y2="${probAxisY}" stroke="#ddd" stroke-width="0.5"/>`;

    // Grid-aligned probability labels
    for (let v = gridStart; v <= globalMax; v += step) {
      const px = xScale(v);
      svg += `<line x1="${px}" y1="${probAxisY}" x2="${px}" y2="${probAxisY + 3}" stroke="#bbb" stroke-width="0.5"/>`;
      svg += `<text x="${px}" y="${probAxisY + 12}" font-size="6.5" fill="#999" font-family="${SERIF}" text-anchor="middle">${fmtProb(loToProb(v))}</text>`;
    }

    // Key probability milestones between grid ticks
    const milestones = [
      { p: 0.001, label: '0.1%' }, { p: 0.01, label: '1%' },
      { p: 0.05, label: '5%' }, { p: 0.25, label: '25%' },
      { p: 0.50, label: '50%' }, { p: 0.75, label: '75%' },
      { p: 0.95, label: '95%' }, { p: 0.99, label: '99%' },
      { p: 0.999, label: '99.9%' },
    ];
    milestones.forEach(({ p, label }) => {
      const lo = Math.log(p / (1 - p));
      if (lo < globalMin || lo > globalMax) return;
      const px = xScale(lo);
      let tooClose = false;
      for (let v = gridStart; v <= globalMax; v += step) {
        if (Math.abs(px - xScale(v)) < 18) { tooClose = true; break; }
      }
      if (tooClose) return;
      svg += `<line x1="${px}" y1="${probAxisY}" x2="${px}" y2="${probAxisY + 3}" stroke="#bbb" stroke-width="0.5"/>`;
      svg += `<text x="${px}" y="${probAxisY + 12}" font-size="6.5" fill="#999" font-family="${SERIF}" text-anchor="middle">${label}</text>`;
    });

    // Direction labels
    svg += `<text x="${panelPad.l + 4}" y="${py + panelH - 2}" font-size="8" fill="#999" font-family="${SERIF}" font-style="italic">\u2190 ${trait.leftDir}</text>`;
    svg += `<text x="${W - panelPad.r - 4}" y="${py + panelH - 2}" font-size="8" fill="#999" font-family="${SERIF}" font-style="italic" text-anchor="end">${trait.rightDir} \u2192</text>`;

    // Plot each config
    let rowIdx = 0;
    let lastProv = '';
    configs.forEach(c => {
      if (c.provider !== lastProv && lastProv !== '') rowIdx += gapBetweenProviders / rowH;
      lastProv = c.provider;

      const cy = panelTop + rowIdx * rowH + rowH / 2;
      const coef = allRegs[c.key].model2.coefficients[trait.key];
      const inf = infData[c.key];

      if (!coef) { rowIdx++; return; }

      const beta = coef.estimate;
      const se = coef.se || 0;
      const ciLo = beta - 1.96 * se;
      const ciHi = beta + 1.96 * se;
      const sig = coef.p < 0.05;

      // Clamp to display range
      const clamp = v => Math.max(globalMin, Math.min(globalMax, v));
      const px = xScale(clamp(beta));
      const pxLo = xScale(clamp(ciLo));
      const pxHi = xScale(clamp(ciHi));

      // Infection range (amber line + markers) — same style as Figure 27
      const infMinX = xScale(clamp(inf.minInfLO));
      const infMaxX = xScale(clamp(inf.maxInfLO));
      svg += `<line x1="${infMinX}" y1="${cy}" x2="${infMaxX}" y2="${cy}" stroke="#D97706" stroke-width="1.5" opacity="0.7"/>`;
      // Infection min (filled circle)
      const infMinTip = `● Infection minimum\nLog-odds: ${inf.minInfLO.toFixed(2)}`;
      svg += `<circle cx="${infMinX}" cy="${cy}" r="3.5" fill="#D97706" stroke="white" stroke-width="1" style="cursor:default" data-ftip-id="${ftip(infMinTip, '#D97706')}"/>`;
      // Infection max (filled diamond)
      const d = 5;
      const infMaxTip = `◆ Infection peak\nLog-odds: ${inf.maxInfLO.toFixed(2)}`;
      svg += `<polygon points="${infMaxX},${cy - d} ${infMaxX + d},${cy} ${infMaxX},${cy + d} ${infMaxX - d},${cy}" fill="#D97706" stroke="white" stroke-width="0.8" style="cursor:default" data-ftip-id="${ftip(infMaxTip, '#D97706')}"/>`;

      // Intercept (red I-beam) — same style as Figure 27
      const intX = xScale(clamp(inf.intercept));
      const intTip = `┃ Intercept (baseline)\nLog-odds: ${inf.intercept.toFixed(2)}`;
      svg += `<rect x="${intX - 6}" y="${cy - 9}" width="12" height="18" fill="transparent" style="cursor:default" data-ftip-id="${ftip(intTip, '#e11d48')}"/>`;
      svg += `<line x1="${intX}" y1="${cy - 7}" x2="${intX}" y2="${cy + 7}" stroke="#e11d48" stroke-width="1.5" opacity="0.7"/>`;
      svg += `<line x1="${intX - 3}" y1="${cy - 7}" x2="${intX + 3}" y2="${cy - 7}" stroke="#e11d48" stroke-width="1" opacity="0.7"/>`;
      svg += `<line x1="${intX - 3}" y1="${cy + 7}" x2="${intX + 3}" y2="${cy + 7}" stroke="#e11d48" stroke-width="1" opacity="0.7"/>`;

      // CI whisker (provider color)
      svg += `<line x1="${pxLo.toFixed(1)}" y1="${cy.toFixed(1)}" x2="${pxHi.toFixed(1)}" y2="${cy.toFixed(1)}" stroke="${c.color}" stroke-width="1.5" opacity="0.6"/>`;

      // Arrow indicators for clipped CIs
      if (ciLo <= globalMin + 0.01) {
        svg += `<polygon points="${pxLo},${cy - 3} ${pxLo},${cy + 3} ${pxLo - 5},${cy}" fill="${c.color}" opacity="0.6"/>`;
      }
      if (ciHi >= globalMax - 0.01) {
        svg += `<polygon points="${pxHi},${cy - 3} ${pxHi},${cy + 3} ${pxHi + 5},${cy}" fill="${c.color}" opacity="0.6"/>`;
      }

      // Point estimate (filled = sig, hollow = not sig)
      if (sig) {
        svg += `<circle cx="${px.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.5" fill="${c.color}" stroke="${c.color}" stroke-width="1"/>`;
      } else {
        svg += `<circle cx="${px.toFixed(1)}" cy="${cy.toFixed(1)}" r="3.5" fill="white" stroke="${c.color}" stroke-width="1.5"/>`;
      }

      // Trait symbol (filled = significant, hollow = not)
      const traitSymbol = sig ? '\u25CF' : '\u25CB';

      // Tooltip: dot — header uses dimension name, coefficient uses adjective
      let dotTip = `${c.label} \u2014 ${trait.label}\n`;
      dotTip += `${traitSymbol}  ${trait.tipLabel}: ${beta.toFixed(2)}  [${ciLo.toFixed(2)}, ${ciHi.toFixed(2)}]`;
      if (!sig) dotTip += '  (n.s.)';
      if (trait.key === 'age') dotTip += `\nFull range (47 yrs): ${(beta * 47).toFixed(2)}`;
      svg += `<circle cx="${px.toFixed(1)}" cy="${cy.toFixed(1)}" r="8" fill="transparent" stroke="none" style="cursor:default" data-ftip-id="${ftip(dotTip, c.color)}"/>`;

      // Config label (left) — full tooltip: intercept, infection, trait, ratio
      const infMag = Math.max(Math.abs(inf.minInfLO), Math.abs(inf.maxInfLO));
      const traitRatioX = infMag > 0 ? (Math.abs(beta) / infMag) : 0;
      const traitRatioText = infMag > 0 ? `${traitRatioX.toFixed(1)}\u00D7` : '\u2014';
      const traitRatioPct = infMag > 0 ? (traitRatioX * 100).toFixed(0) : '\u2014';
      const labelTip = `${c.label} \u2014 ${trait.label}\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n` +
        `\u2503  Intercept: ${inf.intercept.toFixed(2)}\n` +
        `\u25CF\u25C6 Infection: [${inf.minInfLO.toFixed(2)}, ${inf.maxInfLO.toFixed(2)}]\n` +
        `${traitSymbol}  ${trait.tipLabel}: ${beta.toFixed(2)}  [${ciLo.toFixed(2)}, ${ciHi.toFixed(2)}]${sig ? '' : '  (n.s.)'}\n` +
        `\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\n` +
        `\u03B2 Trait / Infection: ${traitRatioText}`;
      svg += `<text x="${panelPad.l - 6}" y="${(cy + 3.5).toFixed(1)}" font-size="9" fill="${c.color}" font-family="${SERIF}" text-anchor="end" style="cursor:default" data-ftip-id="${ftip(labelTip, c.color)}">${esc(c.label)}</text>`;

      // Ratio column (right side) — provider-colored
      svg += `<text x="${panelPad.l + plotW + 26}" y="${(cy + 3.5).toFixed(1)}" font-size="7.5" fill="${c.color}" font-family="${SERIF}" text-anchor="middle">${traitRatioText}</text>`;

      rowIdx++;
    });

    // Ratio column header — fraction layout with tooltip
    const traitRatioHeaderTip = `\u03B2 Trait / Infection Range\n` +
      `─────────────────────────\n` +
      `|\u03B2_trait| divided by the infection\n` +
      `log-odds range (0\u20137% infection).\n\n` +
      `> 1\u00D7 = trait \u03B2 exceeds infection range\n` +
      `< 1\u00D7 = infection range is larger\n` +
      `= 1\u00D7 = equal magnitude`;
    const thX = panelPad.l + plotW + 26;
    svg += `<rect x="${thX - 30}" y="${py - 2}" width="60" height="30" fill="transparent" style="cursor:default" data-ftip-id="${ftip(traitRatioHeaderTip, '#888')}"/>`;
    svg += `<text x="${thX}" y="${py + 11}" font-size="7" fill="#888" font-family="${SERIF}" text-anchor="middle">\u03B2 Trait</text>`;
    svg += `<line x1="${thX - 16}" y1="${py + 13}" x2="${thX + 16}" y2="${py + 13}" stroke="#bbb" stroke-width="0.5"/>`;
    svg += `<text x="${thX}" y="${py + 21}" font-size="7" fill="#888" font-family="${SERIF}" text-anchor="middle">Infection</text>`;

    // Provider group separator lines
    rowIdx = 0;
    lastProv = '';
    configs.forEach(c => {
      if (c.provider !== lastProv && lastProv !== '') {
        const sepY = panelTop + rowIdx * rowH;
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
    'Source: Model 2 random-effects logit (glmer) \u03B2 coefficients. \u03B2 > 0 = higher log-odds of staying home.',
    'Dummy coding: trait present = 1 (reference = absent). Male = 1 (reference = female). Age = raw years (18\u201365), \u03B2 is per-year increment.',
    '95% CIs = \u03B2 \u00B1 1.96 \u00D7 SE. Amber markers = infection log-odds range (0\u20137%). Red I-beam = intercept (baseline). 20,000 obs per config.',
  ];
  footnotes.forEach((f, i) => {
    svg += `<text x="10" y="${footY + i * 12}" font-size="7.5" fill="#aaa" font-family="${SERIF}">${f}</text>`;
  });

  const svgH = footY + footnotes.length * 12 + 8;
  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${svgH}" viewBox="0 0 ${W} ${svgH}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;

  // Wire tooltips (same pattern as Figure 27) — unique ID per instance
  const svgNode = el.querySelector('svg');
  if (svgNode) {
    const tipId = 'forest-tip-' + (elId || 'fig26-chart');
    const prevTip = document.getElementById(tipId);
    if (prevTip) prevTip.remove();

    const tipDiv = document.createElement('div');
    tipDiv.id = tipId;
    tipDiv.style.cssText = 'position:fixed;background:#1e1e2e;color:#e0e0e0;font:11px/1.5 "SF Mono","Menlo",monospace;padding:8px 12px;border-radius:5px;pointer-events:none;white-space:pre;display:none;z-index:9999;max-width:500px;box-shadow:0 2px 8px rgba(0,0,0,0.3)';
    document.body.appendChild(tipDiv);

    svgNode.addEventListener('mousemove', e => {
      const target = e.target.closest('[data-ftip-id]');
      if (target) {
        const id = +target.getAttribute('data-ftip-id');
        if (_ftips[id] != null) {
          tipDiv.textContent = _ftips[id];
          tipDiv.style.borderLeft = `3px solid ${_ftipColors[id] || '#888'}`;
          tipDiv.style.display = 'block';
          let tx = e.clientX + 14, ty = e.clientY + 14;
          const rect = tipDiv.getBoundingClientRect();
          if (tx + rect.width > window.innerWidth) tx = e.clientX - 14 - rect.width;
          if (ty + rect.height > window.innerHeight) ty = e.clientY - 14 - rect.height;
          tipDiv.style.left = tx + 'px';
          tipDiv.style.top = ty + 'px';
        }
      } else {
        tipDiv.style.display = 'none';
      }
    });
    svgNode.addEventListener('mouseleave', () => { tipDiv.style.display = 'none'; });
  }
}

// ── Fig 26 Interpretation Guide ─────────────────────────────

function renderFig26Guide() {
  const el = document.getElementById('fig26-guide');
  if (!el) return;

  const S = 'font-family:"Libre Baskerville","Georgia",serif';
  const mono = 'font-family:monospace;font-size:12px;background:#f5f5f5;padding:8px 12px;border-radius:4px';

  let html = `<div style="${S};font-size:13px;line-height:1.7;color:#333;max-width:780px;margin:8px 0 12px;border:1px solid #e0e0e0;border-radius:4px;padding:14px 18px">`;

  html += '<h4 style="margin:0 0 8px;font-size:14px;color:#111">What is a log-odds coefficient (\u03B2)?</h4>';
  html += '<p style="margin:0 0 8px">Each dot is a <strong>\u03B2 coefficient</strong> from the logistic regression. It tells you how much having a trait shifts the log-odds of staying home:</p>';
  html += `<div style="${mono};margin:6px 0">`;
  html += '\u03B2 > 0 &rarr; trait increases odds of staying home (dot right of dashed line)<br>';
  html += '\u03B2 = 0 &rarr; no effect (dot on dashed line)<br>';
  html += '\u03B2 < 0 &rarr; trait decreases odds of staying home (dot left of dashed line)</div>';

  html += '<h4 style="margin:14px 0 8px;font-size:14px;color:#111">Why log-odds?</h4>';
  html += '<p style="margin:0 0 8px">Log-odds coefficients are <strong>additive</strong>: you can directly compare their magnitudes. A trait with \u03B2 = 8 has twice the effect of a trait with \u03B2 = 4. This makes it easy to compare trait effects against infection effects on the same scale.</p>';

  html += '<h4 style="margin:14px 0 8px;font-size:14px;color:#111">Context markers</h4>';
  html += '<p style="margin:0 0 4px">Each row includes two reference markers to help you judge the trait\'s importance:</p>';
  html += '<ul style="margin:4px 0 8px;padding-left:20px">';
  html += '<li><span style="color:#e11d48;font-weight:bold">Red I-beam</span> = intercept (baseline log-odds with no traits, no infection)</li>';
  html += '<li><span style="color:#D97706;font-weight:bold">Amber line with \u25CF and \u25C6</span> = infection log-odds range from 0% to peak level. If a trait dot is <em>farther</em> from zero than the amber range is wide, that trait alone outweighs infection\'s full effect.</li>';
  html += '</ul>';

  html += '<h4 style="margin:14px 0 8px;font-size:14px;color:#111">A note on age</h4>';
  html += '<p style="margin:0 0 4px">Age is <strong>continuous</strong> (18\u201365). The \u03B2 shown is per year. Multiply by 47 for the full age range effect. Hover for the full-range value.</p>';

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

  // Sort: CONFIG.MODELS order (matches Figure 29 heatmap)
  const modelIdx = {};
  CONFIG.MODELS.forEach((m, i) => { modelIdx[m.label] = i; });
  models.sort((a, b) => (modelIdx[a.label] ?? 999) - (modelIdx[b.label] ?? 999));

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

  // Sort: CONFIG.MODELS order (matches Figure 29 heatmap)
  const modelIdx = {};
  CONFIG.MODELS.forEach((m, i) => { modelIdx[m.label] = i; });
  models.sort((a, b) => (modelIdx[a.label] ?? 999) - (modelIdx[b.label] ?? 999));

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

// ── Figure 27: Log-Odds Landscape: Traits & Infection ────────────────────────
function renderLogOddsLandscape(allRegs, containerId, modelFilter) {
  const el = document.getElementById(containerId || 'fig27-lo-chart');
  if (!el || !agentsData) return;

  // Trait metadata for tooltip descriptions
  const traitMeta = [
    { key: 'extraverted',   pos: 'Extraverted',        neg: 'Introverted' },
    { key: 'agreeable',     pos: 'Agreeable',           neg: 'Antagonistic' },
    { key: 'conscientious', pos: 'Conscientious',       neg: 'Unconscientious' },
    { key: 'emot_stable',   pos: 'Emotionally Stable',  neg: 'Neurotic' },
    { key: 'open_to_exp',   pos: 'Open to Experience',  neg: 'Closed to Experience' },
  ];

  function loToProb(lo) { return 1 / (1 + Math.exp(-lo)); }
  function fmtPct(p) { return p < 0.01 ? '<1%' : p > 0.99 ? '>99%' : (p * 100).toFixed(1) + '%'; }

  // Tooltip store — SVG <title> is unreliable; use data-tip-id + JS overlay
  const _tips = [];
  const _tipColors = [];
  function tip(text, color) { _tips.push(text); _tipColors.push(color || '#888'); return _tips.length - 1; }

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

    // Personality log-odds for all 100 agents
    const predicted = computeAgentCombinedORs(agentsData, c);
    const logOdds = predicted.map(p => p.logCombinedOR).sort((a, b) => a - b);
    const q1 = logOdds[Math.floor(logOdds.length * 0.25)];
    const median = logOdds[Math.floor(logOdds.length * 0.5)];
    const q3 = logOdds[Math.floor(logOdds.length * 0.75)];
    const pMin = logOdds[0];
    const pMax = logOdds[logOdds.length - 1];

    // Theoretical min/max personality with trait descriptions
    let theoMax = 0, theoMin = 0;
    const theoMaxTraits = [], theoMinTraits = [];
    traitMeta.forEach(tm => {
      if (!c[tm.key]) return;
      const b = c[tm.key].estimate;
      if (b > 0) {
        theoMax += b;
        theoMaxTraits.push(tm.pos);
        theoMinTraits.push(tm.neg);
      } else {
        theoMin += b;
        theoMinTraits.push(tm.pos);
        theoMaxTraits.push(tm.neg);
      }
    });
    // Gender
    let theoMaxGender, theoMinGender;
    if (c.male) {
      const bm = c.male.estimate;
      if (bm > 0) { theoMax += bm; theoMaxGender = 'Male'; theoMinGender = 'Female'; }
      else { theoMin += bm; theoMaxGender = 'Female'; theoMinGender = 'Male'; }
    }
    // Age
    let theoMaxAge, theoMinAge;
    if (c.age) {
      const ba = c.age.estimate;
      theoMaxAge = ba > 0 ? 65 : 18;
      theoMinAge = ba > 0 ? 18 : 65;
      theoMax += ba * theoMaxAge;
      theoMin += ba * theoMinAge;
    }

    // Infection log-odds at each integer level 0-7 — track which level
    const bInf = c.infection_pct.estimate;
    const bInfSq = c.infection_pct_sq.estimate;
    let maxInfLO = -Infinity, minInfLO = Infinity, maxInfLv = 0, minInfLv = 0;
    for (let lv = 0; lv <= 7; lv++) {
      const lo = bInf * lv + bInfSq * lv * lv;
      if (lo > maxInfLO) { maxInfLO = lo; maxInfLv = lv; }
      if (lo < minInfLO) { minInfLO = lo; minInfLv = lv; }
    }

    const intercept = c.intercept ? c.intercept.estimate : 0;

    models.push({
      key, label: m.label, provider: m.provider,
      color: CONFIG.PROVIDER_COLORS[m.provider] || '#999',
      pMin, pMax, pQ1: q1, median, pQ3: q3,
      theoMax, theoMin, theoMaxTraits, theoMinTraits,
      theoMaxGender, theoMinGender, theoMaxAge, theoMinAge,
      minInfLO, maxInfLO, minInfLv, maxInfLv, intercept,
    });
  });

  if (models.length === 0) {
    el.innerHTML = '<div style="color:#999;padding:20px">No regression data available.</div>';
    return;
  }

  // Sort: CONFIG.MODELS order (matches Figure 29 heatmap)
  const modelIdx = {};
  CONFIG.MODELS.forEach((m, i) => { modelIdx[m.label] = i; });
  models.sort((a, b) => (modelIdx[a.label] ?? 999) - (modelIdx[b.label] ?? 999));

  // Layout
  const rowH = 26;
  const W = Math.min(el.parentElement?.offsetWidth || 860, 860);
  const pad = { t: 30, r: 70, b: 105, l: 160 };
  const plotW = W - pad.l - pad.r;
  const H = pad.t + models.length * rowH + 30 + pad.b;

  // X scale: linear log-odds — computed from ALL configs so axis stays constant across filters
  let globalMin = Infinity, globalMax = -Infinity;
  const _allSeenKeys = new Set();
  CONFIG.MODELS.forEach(am => {
    const ak = configDirKey(am);
    if (_allSeenKeys.has(ak)) return;
    _allSeenKeys.add(ak);
    const areg = allRegs[ak];
    if (!areg || !areg.model2 || !areg.model2.coefficients) return;
    const ac = areg.model2.coefficients;
    if (!ac.infection_pct || !ac.infection_pct_sq) return;
    // Compute personality + infection extremes for axis
    const ap = computeAgentCombinedORs(agentsData, ac);
    const alo = ap.map(x => x.logCombinedOR);
    const abInf = ac.infection_pct.estimate, abInfSq = ac.infection_pct_sq.estimate;
    let aMaxInf = -Infinity, aMinInf = Infinity;
    for (let lv = 0; lv <= 7; lv++) {
      const lo = abInf * lv + abInfSq * lv * lv;
      if (lo > aMaxInf) aMaxInf = lo;
      if (lo < aMinInf) aMinInf = lo;
    }
    const aInt = ac.intercept ? ac.intercept.estimate : 0;
    // Theoretical extremes
    let aThMax = 0, aThMin = 0;
    traitMeta.forEach(tm => { if (ac[tm.key]) { const b = ac[tm.key].estimate; if (b > 0) aThMax += b; else aThMin += b; } });
    if (ac.male) { const bm = ac.male.estimate; if (bm > 0) aThMax += bm; else aThMin += bm; }
    if (ac.age) { const ba = ac.age.estimate; aThMax += ba * (ba > 0 ? 65 : 18); aThMin += ba * (ba > 0 ? 18 : 65); }
    [Math.min(...alo), Math.max(...alo), aThMin, aThMax, aMinInf, aMaxInf, aInt].forEach(v => {
      if (v < globalMin) globalMin = v;
      if (v > globalMax) globalMax = v;
    });
  });
  const range = globalMax - globalMin;
  globalMin -= range * 0.05;
  globalMax += range * 0.05;
  const xScale = v => pad.l + ((v - globalMin) / (globalMax - globalMin)) * plotW;

  let svg = '';

  // ── Primary axis: log-odds grid lines ──
  const step = range > 40 ? 10 : range > 20 ? 5 : range > 10 ? 2 : 1;
  const gridStart = Math.ceil(globalMin / step) * step;
  const bottomY = pad.t + models.length * rowH + 10;
  for (let v = gridStart; v <= globalMax; v += step) {
    const px = xScale(v);
    svg += `<line x1="${px}" y1="${pad.t}" x2="${px}" y2="${bottomY}" stroke="#eee" stroke-width="0.5"/>`;
    svg += `<text x="${px}" y="${bottomY + 14}" font-size="9" fill="#888" font-family="${SERIF}" text-anchor="middle">${v}</text>`;
  }
  svg += `<text x="${pad.l - 8}" y="${bottomY + 14}" font-size="8" fill="#888" font-family="${SERIF}" text-anchor="end">Log-odds</text>`;

  // 5% and 95% reference ticks on primary axis (±2.94)
  const probRefs = [
    { lo: Math.log(0.05 / 0.95), label: '-2.94' },
    { lo: Math.log(0.95 / 0.05), label: '2.94' },
  ];
  probRefs.forEach(({ lo, label }) => {
    if (lo < globalMin || lo > globalMax) return;
    const px = xScale(lo);
    svg += `<line x1="${px}" y1="${pad.t}" x2="${px}" y2="${bottomY}" stroke="#ddd" stroke-width="0.5" stroke-dasharray="2,3"/>`;
    svg += `<text x="${px}" y="${bottomY + 14}" font-size="7.5" fill="#999" font-family="${SERIF}" text-anchor="middle">${label}</text>`;
  });

  // ── Secondary axis: probability milestones at natural log-odds positions ──
  const probAxisY = bottomY + 24;
  svg += `<text x="${pad.l - 8}" y="${probAxisY + 10}" font-size="8" fill="#888" font-family="${SERIF}" text-anchor="end">P(stay home)</text>`;
  svg += `<line x1="${pad.l}" y1="${probAxisY}" x2="${pad.l + plotW}" y2="${probAxisY}" stroke="#ddd" stroke-width="0.5"/>`;

  // Grid-aligned probability labels (under every log-odds tick — full width)
  for (let v = gridStart; v <= globalMax; v += step) {
    const px = xScale(v);
    const p = loToProb(v);
    let label;
    if (p < 0.0005) label = '<0.1%';
    else if (p > 0.9995) label = '>99.9%';
    else if (p < 0.01) label = (p * 100).toFixed(1) + '%';
    else if (p > 0.99) label = (p * 100).toFixed(1) + '%';
    else if (p > 0.095 && p < 0.995) label = Math.round(p * 100) + '%';
    else label = (p * 100).toFixed(1) + '%';
    svg += `<line x1="${px}" y1="${probAxisY}" x2="${px}" y2="${probAxisY + 4}" stroke="#bbb" stroke-width="0.5"/>`;
    svg += `<text x="${px}" y="${probAxisY + 13}" font-size="6.5" fill="#999" font-family="${SERIF}" text-anchor="middle">${label}</text>`;
  }

  // Key probability milestones between grid ticks (smaller, offset to avoid overlap)
  const milestones = [
    { p: 0.001, label: '0.1%' }, { p: 0.01, label: '1%' },
    { p: 0.05, label: '5%' }, { p: 0.25, label: '25%' },
    { p: 0.50, label: '50%' }, { p: 0.75, label: '75%' },
    { p: 0.95, label: '95%' }, { p: 0.99, label: '99%' },
    { p: 0.999, label: '99.9%' },
  ];
  const gridTickPx = milestones.map(() => null);
  milestones.forEach(({ p, label }, mi) => {
    const lo = Math.log(p / (1 - p));
    if (lo < globalMin || lo > globalMax) return;
    const px = xScale(lo);
    // Skip if too close to a grid-aligned tick (< 18px)
    let tooClose = false;
    for (let v = gridStart; v <= globalMax; v += step) {
      if (Math.abs(px - xScale(v)) < 18) { tooClose = true; break; }
    }
    if (tooClose) return;
    svg += `<line x1="${px}" y1="${probAxisY}" x2="${px}" y2="${probAxisY + 4}" stroke="#bbb" stroke-width="0.5"/>`;
    svg += `<text x="${px}" y="${probAxisY + 13}" font-size="6.5" fill="#999" font-family="${SERIF}" text-anchor="middle">${label}</text>`;
  });

  // Zero reference line (log-odds = 0 → 50%)
  const x0 = xScale(0);
  if (x0 >= pad.l && x0 <= pad.l + plotW) {
    svg += `<line x1="${x0}" y1="${pad.t}" x2="${x0}" y2="${bottomY}" stroke="#bbb" stroke-width="1" stroke-dasharray="4,3"/>`;
  }

  // ── Draw rows ──
  let lastProv = '';
  models.forEach((m, i) => {
    const cy = pad.t + i * rowH + rowH / 2;

    // Provider separator
    if (m.provider !== lastProv && lastProv !== '') {
      const sepY = pad.t + i * rowH - 2;
      svg += `<line x1="${pad.l - 155}" y1="${sepY}" x2="${pad.l + plotW}" y2="${sepY}" stroke="#ddd" stroke-width="0.5"/>`;
    }
    lastProv = m.provider;

    // ── Model label (with tooltip showing all info) ──
    const persInfRatioVal = (m.theoMax - m.theoMin) / Math.max(0.01, m.maxInfLO - m.minInfLO);
    const labelTip = `${m.label}\n` +
      `─────────────────────────\n` +
      `┃  Intercept: ${m.intercept.toFixed(2)}\n` +
      `●◆ Infection: [${m.minInfLO.toFixed(2)}, ${m.maxInfLO.toFixed(2)}]\n` +
      `○◇ Personality: [${m.theoMin.toFixed(2)}, ${m.theoMax.toFixed(2)}]\n` +
      `─────────────────────────\n` +
      `Personality / Infection: ${persInfRatioVal.toFixed(1)}\u00D7`;
    svg += `<text x="${pad.l - 8}" y="${cy + 3}" font-size="9" fill="${m.color}" font-family="${SERIF}" text-anchor="end" style="cursor:default" data-tip-id="${tip(labelTip, m.color)}">${esc(m.label)}</text>`;

    // ── Infection log-odds range (amber line) ──
    const infMinX = xScale(m.minInfLO);
    const infMaxX = xScale(m.maxInfLO);
    svg += `<line x1="${infMinX}" y1="${cy}" x2="${infMaxX}" y2="${cy}" stroke="#D97706" stroke-width="1.5" opacity="0.7"/>`;

    // ── Actual personality: full range of 100 agents (thin solid line) ──
    svg += `<line x1="${xScale(m.pMin)}" y1="${cy}" x2="${xScale(m.pMax)}" y2="${cy}" stroke="${m.color}" stroke-width="1" opacity="0.3"/>`;

    // ── Personality: IQR (thick bar with tooltip) ──
    const pQ1X = xScale(m.pQ1);
    const pQ3X = xScale(m.pQ3);
    const iqrTip = `█ Personality IQR (100 agents)\nQ1: ${m.pQ1.toFixed(2)}\nMedian: ${m.median.toFixed(2)}\nQ3: ${m.pQ3.toFixed(2)}\nFull range: ${m.pMin.toFixed(2)} → ${m.pMax.toFixed(2)}`;
    svg += `<rect x="${pQ1X}" y="${cy - 5}" width="${Math.max(1, pQ3X - pQ1X)}" height="10" fill="${m.color}" fill-opacity="0.4" stroke="${m.color}" stroke-width="0.8" rx="2" style="cursor:default" data-tip-id="${tip(iqrTip, m.color)}"></rect>`;

    // ── Theoretical max marker (hollow diamond) — transparent fill for hover ──
    const thMaxX = xScale(m.theoMax);
    const dm = 6;
    const maxTip = `◇ Theoretical max: most stay-home\nLog-odds: ${m.theoMax.toFixed(2)}\n─────────────────────\n` +
      `  ${m.theoMaxGender || '—'}, age ${m.theoMaxAge || '—'}\n` +
      m.theoMaxTraits.map(t => `  ${t}`).join('\n');
    svg += `<polygon points="${thMaxX},${cy - dm} ${thMaxX + dm},${cy} ${thMaxX},${cy + dm} ${thMaxX - dm},${cy}" fill="transparent" stroke="${m.color}" stroke-width="1.2" opacity="0.6" style="cursor:default" data-tip-id="${tip(maxTip, m.color)}"></polygon>`;

    // ── Theoretical min marker (hollow circle) — transparent fill for hover ──
    const thMinX = xScale(m.theoMin);
    const minTip = `○ Theoretical min: most go-out\nLog-odds: ${m.theoMin.toFixed(2)}\n─────────────────────\n` +
      `  ${m.theoMinGender || '—'}, age ${m.theoMinAge || '—'}\n` +
      m.theoMinTraits.map(t => `  ${t}`).join('\n');
    svg += `<circle cx="${thMinX}" cy="${cy}" r="4.5" fill="transparent" stroke="${m.color}" stroke-width="1.2" opacity="0.6" style="cursor:default" data-tip-id="${tip(minTip, m.color)}"></circle>`;

    // ── Infection markers: filled circle (min level) + filled diamond (max level) ──
    const infMinTip = `● Infection minimum\nLog-odds: ${m.minInfLO.toFixed(2)}`;
    svg += `<circle cx="${infMinX}" cy="${cy}" r="3.5" fill="#D97706" stroke="white" stroke-width="1" style="cursor:default" data-tip-id="${tip(infMinTip, '#D97706')}"></circle>`;
    const d = 6;
    const infMaxTip = `◆ Infection peak\nLog-odds: ${m.maxInfLO.toFixed(2)}`;
    svg += `<polygon points="${infMaxX},${cy - d} ${infMaxX + d},${cy} ${infMaxX},${cy + d} ${infMaxX - d},${cy}" fill="#D97706" stroke="white" stroke-width="0.8" style="cursor:default" data-tip-id="${tip(infMaxTip, '#D97706')}"></polygon>`;

    // ── Intercept marker (red I-beam) — invisible hit rect for reliable hover ──
    const intTip = `┃ Intercept (baseline)\nLog-odds: ${m.intercept.toFixed(2)}`;
    const intX = xScale(m.intercept);
    svg += `<rect x="${intX - 6}" y="${cy - 9}" width="12" height="18" fill="transparent" style="cursor:default" data-tip-id="${tip(intTip, '#e11d48')}"/>`;
    svg += `<line x1="${intX}" y1="${cy - 7}" x2="${intX}" y2="${cy + 7}" stroke="#e11d48" stroke-width="1.5" opacity="0.7"/>`;
    svg += `<line x1="${intX - 3}" y1="${cy - 7}" x2="${intX + 3}" y2="${cy - 7}" stroke="#e11d48" stroke-width="1" opacity="0.7"/>`;
    svg += `<line x1="${intX - 3}" y1="${cy + 7}" x2="${intX + 3}" y2="${cy + 7}" stroke="#e11d48" stroke-width="1" opacity="0.7"/>`;

    // ── Ratio column (right side) ──
    const persRange = m.theoMax - m.theoMin;
    const infRange = m.maxInfLO - m.minInfLO;
    const ratioVal = infRange > 0.01 ? (persRange / infRange).toFixed(1) : '\u2014';
    const ratioText = infRange > 0.01 ? `${ratioVal}\u00D7` : '\u2014';
    svg += `<text x="${pad.l + plotW + 28}" y="${cy + 3}" font-size="8" fill="${m.color}" font-family="${SERIF}" text-anchor="middle">${ratioText}</text>`;
  });

  // Ratio column header — fraction layout with tooltip
  const ratioHeaderTip = `Personality / Infection Ratio\n` +
    `─────────────────────────\n` +
    `Personality log-odds range (theoretical)\n` +
    `divided by infection log-odds range.\n\n` +
    `> 1\u00D7 = personality dominates\n` +
    `< 1\u00D7 = infection dominates\n` +
    `= 1\u00D7 = equal influence`;
  const rhX = pad.l + plotW + 28;
  svg += `<rect x="${rhX - 30}" y="${pad.t - 30}" width="60" height="34" fill="transparent" style="cursor:default" data-tip-id="${tip(ratioHeaderTip, '#888')}"/>`;
  svg += `<text x="${rhX}" y="${pad.t - 16}" font-size="7" fill="#888" font-family="${SERIF}" text-anchor="middle">Personality</text>`;
  svg += `<line x1="${rhX - 18}" y1="${pad.t - 12}" x2="${rhX + 18}" y2="${pad.t - 12}" stroke="#bbb" stroke-width="0.5"/>`;
  svg += `<text x="${rhX}" y="${pad.t - 4}" font-size="7" fill="#888" font-family="${SERIF}" text-anchor="middle">Infection</text>`;

  // ── Legend (three rows) — below probability axis ──
  const legY1 = bottomY + 52;
  const legY2 = legY1 + 18;
  const legY3 = legY2 + 18;

  // Row 1: Personality actual (IQR + full range) + theoretical extremes
  svg += `<line x1="${pad.l}" y1="${legY1}" x2="${pad.l + 20}" y2="${legY1}" stroke="#666" stroke-width="1" opacity="0.3"/>`;
  svg += `<rect x="${pad.l + 5}" y="${legY1 - 5}" width="10" height="10" fill="#666" fill-opacity="0.4" stroke="#666" stroke-width="0.8" rx="2"/>`;
  svg += `<text x="${pad.l + 26}" y="${legY1 + 3}" font-size="9" fill="#555" font-family="${SERIF}">Personality log-odds: 100 agents (IQR + full range)</text>`;
  const legTheoX = pad.l + 340;
  svg += `<circle cx="${legTheoX}" cy="${legY1}" r="3.5" fill="none" stroke="#666" stroke-width="1.2" opacity="0.6"/>`;
  const ltdx = legTheoX + 12;
  svg += `<polygon points="${ltdx},${legY1 - 4} ${ltdx + 4},${legY1} ${ltdx},${legY1 + 4} ${ltdx - 4},${legY1}" fill="none" stroke="#666" stroke-width="1.2" opacity="0.6"/>`;
  svg += `<text x="${ltdx + 8}" y="${legY1 + 3}" font-size="9" fill="#555" font-family="${SERIF}">Theoretical min/max personality</text>`;

  // Row 2: Infection range
  svg += `<circle cx="${pad.l}" cy="${legY2}" r="3.5" fill="#D97706" stroke="white" stroke-width="1"/>`;
  svg += `<line x1="${pad.l + 5}" y1="${legY2}" x2="${pad.l + 25}" y2="${legY2}" stroke="#D97706" stroke-width="1.5" opacity="0.7"/>`;
  svg += `<polygon points="${pad.l + 30},${legY2 - 5} ${pad.l + 35},${legY2} ${pad.l + 30},${legY2 + 5} ${pad.l + 25},${legY2}" fill="#D97706"/>`;
  svg += `<text x="${pad.l + 42}" y="${legY2 + 3}" font-size="9" fill="#555" font-family="${SERIF}">Infection log-odds range (● = min level, ◆ = peak level)</text>`;

  // Row 3: Intercept
  svg += `<line x1="${pad.l}" y1="${legY3 - 6}" x2="${pad.l}" y2="${legY3 + 6}" stroke="#e11d48" stroke-width="1.5"/>`;
  svg += `<line x1="${pad.l - 3}" y1="${legY3 - 6}" x2="${pad.l + 3}" y2="${legY3 - 6}" stroke="#e11d48" stroke-width="1"/>`;
  svg += `<line x1="${pad.l - 3}" y1="${legY3 + 6}" x2="${pad.l + 3}" y2="${legY3 + 6}" stroke="#e11d48" stroke-width="1"/>`;
  svg += `<text x="${pad.l + 8}" y="${legY3 + 3}" font-size="9" fill="#555" font-family="${SERIF}">Intercept (baseline log-odds, no traits, no infection)</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc">${svg}</svg>`;

  // ── JS tooltip overlay (replaces unreliable SVG <title>) ──
  const svgNode = el.querySelector('svg');
  if (svgNode) {
    const prevTip = document.getElementById('lo-landscape-tip');
    if (prevTip) prevTip.remove();

    const tipDiv = document.createElement('div');
    tipDiv.id = 'lo-landscape-tip';
    tipDiv.style.cssText = 'position:fixed;background:#1e1e2e;color:#e0e0e0;font:11px/1.5 "SF Mono","Menlo",monospace;padding:8px 12px;border-radius:5px;pointer-events:none;white-space:pre;display:none;z-index:9999;max-width:500px;box-shadow:0 2px 8px rgba(0,0,0,0.3)';
    document.body.appendChild(tipDiv);

    svgNode.addEventListener('mousemove', e => {
      const target = e.target.closest('[data-tip-id]');
      if (target) {
        const id = +target.getAttribute('data-tip-id');
        if (_tips[id] != null) {
          tipDiv.textContent = _tips[id];
          tipDiv.style.borderLeft = `3px solid ${_tipColors[id] || '#888'}`;
          tipDiv.style.display = 'block';
          let tx = e.clientX + 14, ty = e.clientY + 14;
          const rect = tipDiv.getBoundingClientRect();
          if (tx + rect.width > window.innerWidth) tx = e.clientX - 14 - rect.width;
          if (ty + rect.height > window.innerHeight) ty = e.clientY - 14 - rect.height;
          tipDiv.style.left = tx + 'px';
          tipDiv.style.top = ty + 'px';
        }
      } else {
        tipDiv.style.display = 'none';
      }
    });
    svgNode.addEventListener('mouseleave', () => { tipDiv.style.display = 'none'; });
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
  const gridW = n * cellSize;
  const W = labelW + gridW + pad + padR;
  const H = topLabelH + gridW + pad * 2 + 50;

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

  // Color legend (scale to fit grid, min 100px)
  const legY = oy + n * cellSize + 14;
  const legW = Math.min(200, Math.max(100, n * cellSize));
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
