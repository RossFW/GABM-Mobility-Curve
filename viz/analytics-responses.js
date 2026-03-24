'use strict';
// analytics-responses.js — Response Analysis tab (Figures 31-36)
// Extracted from analytics.js during refactor (March 2026)

// ============================================================
// RESPONSE ANALYSIS — Figures 31–36
// ============================================================

function initResponseAnalysisFigures() {
  if (raFigsRendered) return;
  raFigsRendered = true;
  Promise.all([
    fetch('data/real/trait_mentions.json').then(r => r.json()),
    fetch('data/real/verbosity_stats.json').then(r => r.json()),
    fetch('data/real/response_text_similarity.json').then(r => r.json()),
  ]).then(([t, v, s]) => {
    raTraitData = t;
    raVerbosityData = v;
    raTextSimData = s;
    renderRATraitHeatmap(t);
    renderRAVerbosityBox(v);
    renderRAVerbosityByLevel(v);
    renderRADecisionEntropy();
    renderRARepAgreement(s);
    renderRATextSimilarity(s);
    // Experimental: trait power figures need regression data
    loadAllRegressions(function(allRegs) {
      renderRATraitPowerCombined(t, allRegs);
      renderRATraitPowerRange(t, allRegs);
    });
  });
}

/* ── Figure 31: Trait Mention Heatmap (10-pole) ──────────── */
function renderRATraitHeatmap(data) {
  const el = document.getElementById('ra-fig33-chart');
  if (!el) return;
  const configs = data.configs;
  const labels = data.labels;
  const providers = data.providers;

  // 10 poles: 5 dimensions × 2 poles each
  // label2 = optional second line for long labels
  const poles = [
    { key: 'extraversion_positive',        label: 'Extraverted',      label2: '',            synonyms: 'extroverted, extrovert, extraverted, extravert, extraversion, extroversion' },
    { key: 'extraversion_negative',        label: 'Introverted',      label2: '',            synonyms: 'introverted, introvert, introversion' },
    { key: 'agreeableness_positive',       label: 'Agreeable',        label2: '',            synonyms: 'agreeable, agreeableness' },
    { key: 'agreeableness_negative',       label: 'Antagonistic',     label2: '',            synonyms: 'antagonistic, antagonism, disagreeable' },
    { key: 'conscientiousness_positive',   label: 'Conscientious',    label2: '',            synonyms: 'conscientious, conscientiousness' },
    { key: 'conscientiousness_negative',   label: 'Unconscientious',  label2: '',            synonyms: 'unconscientious' },
    { key: 'neuroticism_positive',         label: 'Neurotic',         label2: '',            synonyms: 'neurotic, neuroticism' },
    { key: 'neuroticism_negative',         label: 'Emotionally',      label2: 'Stable',      synonyms: 'emotionally stable, emotional stability' },
    { key: 'openness_positive',            label: 'Open to',          label2: 'Experience',  synonyms: 'open to experience, openness' },
    { key: 'openness_negative',            label: 'Closed to',        label2: 'Experience',  synonyms: 'closed to experience, closed-minded' },
  ];
  const nCols = poles.length;
  const nRows = configs.length;

  const cellW = 76, cellH = 22;
  const labelW = 160, topH = 110;
  const pad = { l: labelW + 10, t: topH, r: 30, b: 40 };
  const W = pad.l + nCols * cellW + pad.r;
  const H = pad.t + nRows * cellH + pad.b;

  let svg = '';

  // Dimension group brackets at top
  const dimNames = ['Extraversion', 'Agreeableness', 'Conscientiousness', 'Neuroticism', 'Openness'];
  for (let d = 0; d < 5; d++) {
    const x1 = pad.l + d * 2 * cellW;
    const x2 = x1 + 2 * cellW;
    const cx = (x1 + x2) / 2;
    svg += `<text x="${cx}" y="${pad.t - 82}" font-size="10" fill="#333" font-family="${SERIF}" text-anchor="middle" font-weight="bold">${dimNames[d]}</text>`;
    svg += `<line x1="${x1 + 4}" y1="${pad.t - 76}" x2="${x2 - 4}" y2="${pad.t - 76}" stroke="#bbb" stroke-width="1"/>`;
  }

  // Column headers: pole label (1 or 2 lines) + synonyms in small text
  for (let c = 0; c < nCols; c++) {
    const x = pad.l + c * cellW + cellW / 2;
    const pole = poles[c];
    // Pole label — 1 or 2 lines
    if (pole.label2) {
      svg += `<text x="${x}" y="${pad.t - 56}" font-size="9.5" fill="#333" font-family="${SERIF}" text-anchor="middle" font-style="italic">${esc(pole.label)}</text>`;
      svg += `<text x="${x}" y="${pad.t - 45}" font-size="9.5" fill="#333" font-family="${SERIF}" text-anchor="middle" font-style="italic">${esc(pole.label2)}</text>`;
    } else {
      svg += `<text x="${x}" y="${pad.t - 50}" font-size="9.5" fill="#333" font-family="${SERIF}" text-anchor="middle" font-style="italic">${esc(pole.label)}</text>`;
    }
    // Synonyms in small gray text — wrap lines, positioned below label with gap
    const synWords = pole.synonyms;
    const synLines = [];
    let current = '';
    for (const w of synWords.split(', ')) {
      if (current && (current + ', ' + w).length > 14) {
        synLines.push(current);
        current = w;
      } else {
        current = current ? current + ', ' + w : w;
      }
    }
    if (current) synLines.push(current);
    for (let sl = 0; sl < synLines.length; sl++) {
      svg += `<text x="${x}" y="${pad.t - 30 + sl * 9}" font-size="7" fill="#999" font-family="${SERIF}" text-anchor="middle">${esc(synLines[sl])}</text>`;
    }
  }

  // Rows
  for (let r = 0; r < nRows; r++) {
    const y = pad.t + r * cellH;
    const provColor = CONFIG.PROVIDER_COLORS[providers[r]] || '#999';

    svg += `<circle cx="${pad.l - labelW}" cy="${y + cellH / 2}" r="4" fill="${provColor}"/>`;
    svg += `<text x="${pad.l - labelW + 10}" y="${y + cellH / 2 + 4}" font-size="10" fill="#333" font-family="${SERIF}">${esc(labels[r])}</text>`;

    for (let c = 0; c < nCols; c++) {
      const x = pad.l + c * cellW;
      const rate = data.pole_rates[configs[r]][poles[c].key];
      const pct = Math.round(rate * 100);

      const intensity = Math.min(rate, 1);
      const red = Math.round(255 - intensity * 200);
      const green = Math.round(255 - intensity * 180);
      const blue = Math.round(255 - intensity * 60);
      const fill = `rgb(${red},${green},${blue})`;

      svg += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="${fill}" stroke="#eee" stroke-width="0.5"/>`;
      svg += `<text x="${x + cellW / 2}" y="${y + cellH / 2 + 4}" font-size="10" fill="${intensity > 0.6 ? '#fff' : '#333'}" font-family="${SERIF}" text-anchor="middle">${pct}%</text>`;
    }
  }

  // Grid border
  svg += `<rect x="${pad.l}" y="${pad.t}" width="${nCols * cellW}" height="${nRows * cellH}" fill="none" stroke="#999" stroke-width="1"/>`;

  // Vertical dividers between dimension pairs
  for (let d = 1; d < 5; d++) {
    const x = pad.l + d * 2 * cellW;
    svg += `<line x1="${x}" y1="${pad.t}" x2="${x}" y2="${pad.t + nRows * cellH}" stroke="#999" stroke-width="1"/>`;
  }

  // Legend
  const legY = pad.t + nRows * cellH + 14;
  const legW = 180;
  const legX = pad.l + (nCols * cellW - legW) / 2;
  for (let i = 0; i < legW; i++) {
    const t = i / legW;
    const rr = Math.round(255 - t * 200);
    const gg = Math.round(255 - t * 180);
    const bb = Math.round(255 - t * 60);
    svg += `<rect x="${legX + i}" y="${legY}" width="1.5" height="10" fill="rgb(${rr},${gg},${bb})"/>`;
  }
  svg += `<text x="${legX}" y="${legY + 22}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="start">0%</text>`;
  svg += `<text x="${legX + legW}" y="${legY + 22}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="end">100%</text>`;
  svg += `<text x="${legX + legW / 2}" y="${legY + 22}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="middle">mention rate</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
}

/* ── Figure 32: Output Token Landscape (box plots) ─────────── */
function renderRAVerbosityBox(data) {
  const el = document.getElementById('ra-fig34-chart');
  if (!el) return;
  const configs = data.configs;
  const labels = data.labels;
  const providers = data.providers;

  const labelW = 160, rowH = 24;
  const pad = { l: labelW + 10, t: 30, r: 40, b: 30 };
  const plotW = 500;
  const nRows = configs.length;
  const W = pad.l + plotW + pad.r;
  const H = pad.t + nRows * rowH + pad.b;

  // Find global max for scale
  let globalMax = 0;
  for (const cfg of configs) {
    const stats = data.by_model[cfg].output_tokens;
    if (stats.p90 > globalMax) globalMax = stats.p90;
  }
  globalMax = Math.ceil(globalMax / 50) * 50;
  const xScale = v => pad.l + (v / globalMax) * plotW;

  let svg = '';

  // X-axis ticks
  for (let v = 0; v <= globalMax; v += 100) {
    const x = xScale(v);
    svg += `<line x1="${x}" y1="${pad.t}" x2="${x}" y2="${pad.t + nRows * rowH}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    svg += `<text x="${x}" y="${pad.t + nRows * rowH + 14}" font-size="9" fill="#999" font-family="${SERIF}" text-anchor="middle">${v}</text>`;
  }
  svg += `<text x="${pad.l + plotW / 2}" y="${pad.t + nRows * rowH + 28}" font-size="10" fill="#666" font-family="${SERIF}" text-anchor="middle">Output tokens per response</text>`;

  // Box plots
  for (let r = 0; r < nRows; r++) {
    const y = pad.t + r * rowH;
    const cy = y + rowH / 2;
    const stats = data.by_model[configs[r]].output_tokens;
    const provColor = CONFIG.PROVIDER_COLORS[providers[r]] || '#999';

    // Label
    svg += `<circle cx="${pad.l - labelW}" cy="${cy}" r="3" fill="${provColor}"/>`;
    svg += `<text x="${pad.l - labelW + 9}" y="${cy + 3}" font-size="9" fill="#333" font-family="${SERIF}">${labels[r]}</text>`;

    const x10 = xScale(stats.p10);
    const x25 = xScale(stats.p25);
    const x50 = xScale(stats.median);
    const x75 = xScale(stats.p75);
    const x90 = xScale(stats.p90);
    const boxH = rowH * 0.6;
    const boxY = cy - boxH / 2;

    // Whiskers (10th–90th)
    svg += `<line x1="${x10}" y1="${cy}" x2="${x25}" y2="${cy}" stroke="${provColor}" stroke-width="1" opacity="0.5"/>`;
    svg += `<line x1="${x75}" y1="${cy}" x2="${x90}" y2="${cy}" stroke="${provColor}" stroke-width="1" opacity="0.5"/>`;
    svg += `<line x1="${x10}" y1="${cy - 4}" x2="${x10}" y2="${cy + 4}" stroke="${provColor}" stroke-width="1" opacity="0.5"/>`;
    svg += `<line x1="${x90}" y1="${cy - 4}" x2="${x90}" y2="${cy + 4}" stroke="${provColor}" stroke-width="1" opacity="0.5"/>`;

    // Box (IQR)
    svg += `<rect x="${x25}" y="${boxY}" width="${x75 - x25}" height="${boxH}" fill="${provColor}" opacity="0.2" stroke="${provColor}" stroke-width="1"/>`;

    // Median line
    svg += `<line x1="${x50}" y1="${boxY}" x2="${x50}" y2="${boxY + boxH}" stroke="${provColor}" stroke-width="2"/>`;

    // Median label
    svg += `<text x="${x90 + 6}" y="${cy + 3}" font-size="8" fill="#999" font-family="${SERIF}">${Math.round(stats.median)}</text>`;
  }

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
}

/* ── Figure 33: Verbosity × Infection Level ────────────────── */
function renderRAVerbosityByLevel(data) {
  const el = document.getElementById('ra-fig35-chart');
  if (!el) return;
  const configs = data.configs;
  const labels = data.labels;
  const providers = data.providers;

  const pad = { l: 60, t: 20, r: 160, b: 40 };
  const plotW = 600, plotH = 350;
  const W = pad.l + plotW + pad.r;
  const H = pad.t + plotH + pad.b;

  // Collect all levels and find Y range
  let yMin = Infinity, yMax = 0;
  const allLevels = [];
  for (const cfg of configs) {
    const byLevel = data.by_model_by_level[cfg];
    for (const [lv, vals] of Object.entries(byLevel)) {
      if (!allLevels.includes(parseFloat(lv))) allLevels.push(parseFloat(lv));
      if (vals.mean_output < yMin) yMin = vals.mean_output;
      if (vals.mean_output > yMax) yMax = vals.mean_output;
    }
  }
  allLevels.sort((a, b) => a - b);
  yMin = Math.max(0, Math.floor(yMin / 10) * 10 - 10);
  yMax = Math.ceil(yMax / 50) * 50 + 10;

  const xScale = v => pad.l + ((v - allLevels[0]) / (allLevels[allLevels.length - 1] - allLevels[0])) * plotW;
  const yScale = v => pad.t + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  let svg = '';

  // Y grid + labels
  const yTicks = 6;
  for (let i = 0; i <= yTicks; i++) {
    const v = yMin + (yMax - yMin) * i / yTicks;
    const y = yScale(v);
    svg += `<line x1="${pad.l}" y1="${y}" x2="${pad.l + plotW}" y2="${y}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    svg += `<text x="${pad.l - 8}" y="${y + 3}" font-size="9" fill="#999" font-family="${SERIF}" text-anchor="end">${Math.round(v)}</text>`;
  }
  svg += `<text x="${pad.l - 40}" y="${pad.t + plotH / 2}" font-size="10" fill="#666" font-family="${SERIF}" text-anchor="middle" transform="rotate(-90,${pad.l - 40},${pad.t + plotH / 2})">Mean output tokens</text>`;

  // X axis labels
  for (let i = 0; i < allLevels.length; i += 5) {
    const x = xScale(allLevels[i]);
    svg += `<text x="${x}" y="${pad.t + plotH + 16}" font-size="9" fill="#999" font-family="${SERIF}" text-anchor="middle">${allLevels[i].toFixed(1)}%</text>`;
  }
  svg += `<text x="${pad.l + plotW / 2}" y="${pad.t + plotH + 34}" font-size="10" fill="#666" font-family="${SERIF}" text-anchor="middle">Infection level</text>`;

  // Lines + legend
  for (let ci = 0; ci < configs.length; ci++) {
    const cfg = configs[ci];
    const byLevel = data.by_model_by_level[cfg];
    const provColor = CONFIG.PROVIDER_COLORS[providers[ci]] || '#999';
    const opacity = 0.6;

    let pathD = '';
    const lvKeys = Object.keys(byLevel).sort((a, b) => parseFloat(a) - parseFloat(b));
    for (let i = 0; i < lvKeys.length; i++) {
      const x = xScale(parseFloat(lvKeys[i]));
      const y = yScale(byLevel[lvKeys[i]].mean_output);
      pathD += (i === 0 ? 'M' : 'L') + `${x},${y}`;
    }
    svg += `<path d="${pathD}" fill="none" stroke="${provColor}" stroke-width="1.5" opacity="${opacity}"/>`;

    // Legend entry
    const legX = pad.l + plotW + 10;
    const legY = pad.t + ci * 16;
    svg += `<line x1="${legX}" y1="${legY}" x2="${legX + 14}" y2="${legY}" stroke="${provColor}" stroke-width="1.5" opacity="${opacity}"/>`;
    svg += `<text x="${legX + 18}" y="${legY + 3}" font-size="8" fill="#555" font-family="${SERIF}">${labels[ci]}</text>`;
  }

  // Axes
  svg += `<line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + plotH}" stroke="#ccc" stroke-width="1"/>`;
  svg += `<line x1="${pad.l}" y1="${pad.t + plotH}" x2="${pad.l + plotW}" y2="${pad.t + plotH}" stroke="#ccc" stroke-width="1"/>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
}

/* ── Figure 34: Decision Entropy Map ───────────────────────── */
function renderRADecisionEntropy() {
  const el = document.getElementById('ra-fig36-chart');
  if (!el || !macroData.length) return;

  // Group macro data by model config (using same dir key format as configDirKey)
  const grouped = {};
  for (const row of macroData) {
    const modelClean = row.model.replace(/\./g, '_');
    const key = `${row.provider}_${modelClean}_${row.reasoning}`;
    if (!grouped[key]) grouped[key] = { provider: row.provider, rows: [] };
    grouped[key].rows.push(row);
  }

  // Match to CONFIG.MODELS for labels and ordering
  const models = CONFIG.MODELS;
  const orderedKeys = [];
  const orderedLabels = [];
  const orderedProviders = [];
  for (const m of models) {
    const key = configDirKey(m);
    if (grouped[key]) {
      orderedKeys.push(key);
      orderedLabels.push(m.label);
      orderedProviders.push(m.provider);
    }
  }

  // Collect all infection levels
  const allLevels = [];
  for (const key of orderedKeys) {
    for (const row of grouped[key].rows) {
      const lv = parseFloat(row.infection_level);
      if (!allLevels.includes(lv)) allLevels.push(lv);
    }
  }
  allLevels.sort((a, b) => a - b);

  const nRows = orderedKeys.length;
  const nCols = allLevels.length;
  const cellW = 16, cellH = 22;
  const labelW = 160;
  const pad = { l: labelW + 10, t: 40, r: 30, b: 50 };
  const W = pad.l + nCols * cellW + pad.r;
  const H = pad.t + nRows * cellH + pad.b;

  let svg = '';

  // Binary entropy function
  function entropy(p) {
    if (p <= 0 || p >= 1) return 0;
    return -(p * Math.log2(p) + (1 - p) * Math.log2(1 - p));
  }

  for (let r = 0; r < nRows; r++) {
    const y = pad.t + r * cellH;
    const provColor = CONFIG.PROVIDER_COLORS[orderedProviders[r]] || '#999';

    // Label
    svg += `<circle cx="${pad.l - labelW}" cy="${y + cellH / 2}" r="3" fill="${provColor}"/>`;
    svg += `<text x="${pad.l - labelW + 9}" y="${y + cellH / 2 + 3}" font-size="9" fill="#333" font-family="${SERIF}">${orderedLabels[r]}</text>`;

    // Build level→pct map
    const levelMap = {};
    for (const row of grouped[orderedKeys[r]].rows) {
      levelMap[parseFloat(row.infection_level)] = parseFloat(row.pct_stay_home);
    }

    for (let c = 0; c < nCols; c++) {
      const x = pad.l + c * cellW;
      const pct = levelMap[allLevels[c]] || 0;
      const ent = entropy(pct);

      // Color: white (0) → red (1)
      const red = Math.round(255);
      const green = Math.round(255 - ent * 220);
      const blue = Math.round(255 - ent * 220);
      const fill = `rgb(${red},${green},${blue})`;

      svg += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="${fill}" stroke="none"><title>${allLevels[c].toFixed(2)}%: p=${(pct * 100).toFixed(0)}%, H=${ent.toFixed(2)}</title></rect>`;
    }
  }

  // Grid border
  svg += `<rect x="${pad.l}" y="${pad.t}" width="${nCols * cellW}" height="${nRows * cellH}" fill="none" stroke="#999" stroke-width="1"/>`;

  // X-axis labels
  for (let c = 0; c < nCols; c += 5) {
    const x = pad.l + c * cellW + cellW / 2;
    svg += `<text x="${x}" y="${pad.t + nRows * cellH + 14}" font-size="8" fill="#999" font-family="${SERIF}" text-anchor="middle">${allLevels[c].toFixed(1)}%</text>`;
  }
  svg += `<text x="${pad.l + nCols * cellW / 2}" y="${pad.t + nRows * cellH + 30}" font-size="10" fill="#666" font-family="${SERIF}" text-anchor="middle">Infection level</text>`;

  // Color legend
  const legY = pad.t + nRows * cellH + 36;
  const legW = 150;
  const legX = pad.l + (nCols * cellW - legW) / 2;
  for (let i = 0; i < legW; i++) {
    const t = i / legW;
    const rr = 255;
    const gg = Math.round(255 - t * 220);
    const bb = Math.round(255 - t * 220);
    svg += `<rect x="${legX + i}" y="${legY}" width="1.5" height="10" fill="rgb(${rr},${gg},${bb})"/>`;
  }
  svg += `<text x="${legX}" y="${legY + 20}" font-size="8" fill="#666" font-family="${SERIF}" text-anchor="start">0 (consensus)</text>`;
  svg += `<text x="${legX + legW}" y="${legY + 20}" font-size="8" fill="#666" font-family="${SERIF}" text-anchor="end">1.0 (50/50)</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
}

/* ── Figure 35: Rep-to-Rep Decision Agreement ──────────────── */
function renderRARepAgreement(data) {
  const el = document.getElementById('ra-fig37-chart');
  if (!el) return;

  // Sort by agreement rate (descending)
  const items = data.configs.map((cfg, i) => ({
    cfg, label: data.labels[i], provider: data.providers[i],
    temp: data.temperature[i], agreement: data.decision_agreement[cfg]
  }));
  items.sort((a, b) => b.agreement - a.agreement);

  const labelW = 160, barMaxW = 400, rowH = 24;
  const pad = { l: labelW + 10, t: 30, r: 80, b: 20 };
  const W = pad.l + barMaxW + pad.r;
  const H = pad.t + items.length * rowH + pad.b;

  let svg = '';

  // Grid lines
  for (let pct = 0; pct <= 100; pct += 20) {
    const x = pad.l + (pct / 100) * barMaxW;
    svg += `<line x1="${x}" y1="${pad.t}" x2="${x}" y2="${pad.t + items.length * rowH}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    svg += `<text x="${x}" y="${pad.t - 6}" font-size="9" fill="#999" font-family="${SERIF}" text-anchor="middle">${pct}%</text>`;
  }

  // Legend
  svg += `<rect x="${pad.l}" y="${pad.t - 26}" width="10" height="10" fill="#3B82F6" rx="2"/>`;
  svg += `<text x="${pad.l + 14}" y="${pad.t - 17}" font-size="9" fill="#555" font-family="${SERIF}">temp = 0</text>`;
  svg += `<rect x="${pad.l + 90}" y="${pad.t - 26}" width="10" height="10" fill="#F59E0B" rx="2"/>`;
  svg += `<text x="${pad.l + 104}" y="${pad.t - 17}" font-size="9" fill="#555" font-family="${SERIF}">temp = 1</text>`;

  for (let r = 0; r < items.length; r++) {
    const y = pad.t + r * rowH;
    const cy = y + rowH / 2;
    const item = items[r];
    const barColor = item.temp === '0' ? '#3B82F6' : '#F59E0B';
    const barW = item.agreement * barMaxW;
    const provColor = CONFIG.PROVIDER_COLORS[item.provider] || '#999';

    svg += `<circle cx="${pad.l - labelW}" cy="${cy}" r="3" fill="${provColor}"/>`;
    svg += `<text x="${pad.l - labelW + 9}" y="${cy + 3}" font-size="9" fill="#333" font-family="${SERIF}">${item.label}</text>`;

    svg += `<rect x="${pad.l}" y="${y + 4}" width="${barW}" height="${rowH - 8}" fill="${barColor}" rx="2" opacity="0.8"/>`;
    svg += `<text x="${pad.l + barW + 6}" y="${cy + 3}" font-size="9" fill="#555" font-family="${SERIF}">${(item.agreement * 100).toFixed(1)}%</text>`;
  }

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
}

/* ── Figure 36: Response Text Similarity ───────────────────── */
function renderRATextSimilarity(data) {
  const el = document.getElementById('ra-fig38-chart');
  if (!el) return;

  const items = data.configs.map((cfg, i) => ({
    cfg, label: data.labels[i], provider: data.providers[i],
    temp: data.temperature[i],
    exactMatch: data.exact_text_match[cfg],
    jaccard: data.mean_jaccard[cfg],
    agreement: data.decision_agreement[cfg],
  }));
  // Sort by Jaccard descending
  items.sort((a, b) => b.jaccard - a.jaccard);

  const labelW = 160, plotW = 400, rowH = 24;
  const pad = { l: labelW + 10, t: 40, r: 80, b: 30 };
  const W = pad.l + plotW + pad.r;
  const H = pad.t + items.length * rowH + pad.b;

  const xScale = v => pad.l + v * plotW;

  let svg = '';

  // Grid
  for (let pct = 0; pct <= 100; pct += 20) {
    const x = xScale(pct / 100);
    svg += `<line x1="${x}" y1="${pad.t}" x2="${x}" y2="${pad.t + items.length * rowH}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    svg += `<text x="${x}" y="${pad.t + items.length * rowH + 14}" font-size="9" fill="#999" font-family="${SERIF}" text-anchor="middle">${pct}%</text>`;
  }

  // Legend
  svg += `<circle cx="${pad.l}" cy="${pad.t - 16}" r="4" fill="#8B5CF6"/>`;
  svg += `<text x="${pad.l + 8}" y="${pad.t - 13}" font-size="9" fill="#555" font-family="${SERIF}">Exact text match rate</text>`;
  svg += `<circle cx="${pad.l + 160}" cy="${pad.t - 16}" r="4" fill="#F97316"/>`;
  svg += `<text x="${pad.l + 168}" y="${pad.t - 13}" font-size="9" fill="#555" font-family="${SERIF}">Mean Jaccard similarity (word overlap)</text>`;

  for (let r = 0; r < items.length; r++) {
    const y = pad.t + r * rowH;
    const cy = y + rowH / 2;
    const item = items[r];
    const provColor = CONFIG.PROVIDER_COLORS[item.provider] || '#999';

    // Label with temp indicator
    const tempTag = item.temp === '0' ? '' : ' \u2738';
    svg += `<circle cx="${pad.l - labelW}" cy="${cy}" r="3" fill="${provColor}"/>`;
    svg += `<text x="${pad.l - labelW + 9}" y="${cy + 3}" font-size="9" fill="#333" font-family="${SERIF}">${item.label}${tempTag}</text>`;

    const xExact = xScale(item.exactMatch);
    const xJac = xScale(item.jaccard);

    // Connecting line
    svg += `<line x1="${Math.min(xExact, xJac)}" y1="${cy}" x2="${Math.max(xExact, xJac)}" y2="${cy}" stroke="#ddd" stroke-width="1"/>`;

    // Exact match dot
    svg += `<circle cx="${xExact}" cy="${cy}" r="4" fill="#8B5CF6" opacity="0.8"><title>Exact: ${(item.exactMatch * 100).toFixed(1)}%</title></circle>`;
    // Jaccard dot
    svg += `<circle cx="${xJac}" cy="${cy}" r="4" fill="#F97316" opacity="0.8"><title>Jaccard: ${(item.jaccard * 100).toFixed(1)}%</title></circle>`;
  }

  svg += `<text x="${pad.l + plotW / 2}" y="${pad.t + items.length * rowH + 26}" font-size="10" fill="#666" font-family="${SERIF}" text-anchor="middle">Similarity rate (among unanimous-decision groups)</text>`;
  svg += `<text x="${pad.l + plotW + 10}" y="${pad.t + 10}" font-size="8" fill="#999" font-family="${SERIF}">\u2738 = temp 1</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
}

// ============================================================
// TRAIT POWER vs INFECTION — Experimental Figures
// ============================================================

/**
 * Compute trait power ratios for one config's regression data.
 * max(Δ_infection) = peak of quadratic f(x) = β₁x + β₂x², clamped to [0, 7].
 * trait_ratio = |β_trait| / max(Δ_infection).
 * combined_swing = Σ|β_trait| + |β_male| + |β_age × 47|.
 */
function computeTraitPowerRatios(regData) {
  const coefs = regData.model2.coefficients;
  const b1 = coefs.infection_pct.estimate;
  const b2 = coefs.infection_pct_sq.estimate;

  // max(Δ_infection): peak of quadratic, clamped to [0, 7]
  const xPeak = Math.min(7, Math.max(0, -b1 / (2 * b2)));
  const infPower = Math.abs(b1 * xPeak + b2 * xPeak * xPeak);

  // 5 Big Five traits
  const traits = ['extraverted', 'agreeable', 'conscientious', 'emot_stable', 'open_to_exp'];
  const traitLabels = ['Extraversion', 'Agreeableness', 'Conscientiousness', 'Neuroticism', 'Openness'];
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
    xPeak,
    traitRatios,
    bigFiveSwing,
    maleEffect,
    ageEffect,
    combinedSwing,
    combinedRatio: infPower > 0 ? combinedSwing / infPower : 0,
    bigFiveRatio: infPower > 0 ? bigFiveSwing / infPower : 0,
  };
}

/* ── Experimental: Combined Trait Power vs Infection ─────────── */
function renderRATraitPowerCombined(traitData, allRegs) {
  const el = document.getElementById('ra-trait-power-combined-chart');
  if (!el) return;

  const configs = traitData.configs;
  const labels = traitData.labels;
  const providers = traitData.providers;

  // Compute ratios for each config that has regression data
  const items = [];
  for (let i = 0; i < configs.length; i++) {
    const reg = allRegs[configs[i]];
    if (!reg || !reg.model2) continue;
    const pw = computeTraitPowerRatios(reg);
    items.push({
      label: labels[i],
      provider: providers[i],
      combinedRatio: pw.combinedRatio,
      bigFiveRatio: pw.bigFiveRatio,
      bigFiveSwing: pw.bigFiveSwing,
      maleEffect: pw.maleEffect,
      ageEffect: pw.ageEffect,
      infPower: pw.infPower,
    });
  }

  // Sort by combined ratio descending (most trait-dominated first)
  items.sort((a, b) => b.combinedRatio - a.combinedRatio);

  const labelW = 160, plotW = 480, rowH = 24;
  const pad = { l: labelW + 10, t: 50, r: 70, b: 40 };
  const nRows = items.length;
  const W = pad.l + plotW + pad.r;
  const H = pad.t + nRows * rowH + pad.b;

  // Scale: 0% to max ratio (round up to nearest 50%)
  const maxRatio = Math.max(...items.map(d => d.combinedRatio));
  const scaleMax = Math.ceil(maxRatio * 2) / 2; // round to 0.5
  const xScale = v => pad.l + (v / scaleMax) * plotW;

  let svg = '';

  // Grid lines at 50% intervals
  for (let pct = 0; pct <= scaleMax * 100; pct += 50) {
    const x = xScale(pct / 100);
    svg += `<line x1="${x}" y1="${pad.t}" x2="${x}" y2="${pad.t + nRows * rowH}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    svg += `<text x="${x}" y="${pad.t + nRows * rowH + 14}" font-size="9" fill="#999" font-family="${SERIF}" text-anchor="middle">${pct}%</text>`;
  }

  // 100% reference line (traits = infection)
  const x100 = xScale(1.0);
  if (x100 >= pad.l && x100 <= pad.l + plotW) {
    svg += `<line x1="${x100}" y1="${pad.t - 5}" x2="${x100}" y2="${pad.t + nRows * rowH}" stroke="#EF4444" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.6"/>`;
    svg += `<text x="${x100}" y="${pad.t - 8}" font-size="8" fill="#EF4444" font-family="${SERIF}" text-anchor="middle">traits = infection</text>`;
  }

  // Stacked bars per row
  for (let r = 0; r < nRows; r++) {
    const d = items[r];
    const y = pad.t + r * rowH;
    const cy = y + rowH / 2;
    const provColor = CONFIG.PROVIDER_COLORS[d.provider] || '#999';

    // Row label
    svg += `<circle cx="${pad.l - labelW}" cy="${cy}" r="3" fill="${provColor}"/>`;
    svg += `<text x="${pad.l - labelW + 9}" y="${cy + 3}" font-size="9" fill="#333" font-family="${SERIF}">${d.label}</text>`;

    // Alternating row bg
    if (r % 2 === 0) {
      svg += `<rect x="${pad.l}" y="${y}" width="${plotW}" height="${rowH}" fill="#fafafa"/>`;
    }

    // Stacked bar: Big Five (main) + male + age
    const barH = 14;
    const barY = cy - barH / 2;
    const bigFiveRatio = d.infPower > 0 ? d.bigFiveSwing / d.infPower : 0;
    const maleRatio = d.infPower > 0 ? d.maleEffect / d.infPower : 0;
    const ageRatio = d.infPower > 0 ? d.ageEffect / d.infPower : 0;

    // Big Five segment
    const x0 = xScale(0);
    const xBF = xScale(bigFiveRatio);
    svg += `<rect x="${x0}" y="${barY}" width="${Math.max(0, xBF - x0)}" height="${barH}" fill="${provColor}" opacity="0.7" rx="2">`;
    svg += `<title>Big Five: ${(bigFiveRatio * 100).toFixed(0)}% of infection</title></rect>`;

    // Male segment
    const xM = xScale(bigFiveRatio + maleRatio);
    svg += `<rect x="${xBF}" y="${barY}" width="${Math.max(0, xM - xBF)}" height="${barH}" fill="${provColor}" opacity="0.4" rx="0">`;
    svg += `<title>Gender: ${(maleRatio * 100).toFixed(0)}% of infection</title></rect>`;

    // Age segment
    const xA = xScale(bigFiveRatio + maleRatio + ageRatio);
    svg += `<rect x="${xM}" y="${barY}" width="${Math.max(0, xA - xM)}" height="${barH}" fill="${provColor}" opacity="0.25" rx="0">`;
    svg += `<title>Age: ${(ageRatio * 100).toFixed(0)}% of infection</title></rect>`;

    // Value label
    svg += `<text x="${xA + 4}" y="${cy + 3}" font-size="9" fill="#666" font-family="${SERIF}">${(d.combinedRatio * 100).toFixed(0)}%</text>`;
  }

  // X-axis label
  svg += `<text x="${pad.l + plotW / 2}" y="${pad.t + nRows * rowH + 30}" font-size="10" fill="#666" font-family="${SERIF}" text-anchor="middle">Combined personal characteristics as % of max infection effect</text>`;

  // Legend
  svg += `<rect x="${pad.l}" y="${pad.t - 40}" width="12" height="10" fill="#888" opacity="0.7" rx="2"/>`;
  svg += `<text x="${pad.l + 16}" y="${pad.t - 32}" font-size="9" fill="#555" font-family="${SERIF}">Big Five traits</text>`;
  svg += `<rect x="${pad.l + 110}" y="${pad.t - 40}" width="12" height="10" fill="#888" opacity="0.4" rx="0"/>`;
  svg += `<text x="${pad.l + 126}" y="${pad.t - 32}" font-size="9" fill="#555" font-family="${SERIF}">Gender</text>`;
  svg += `<rect x="${pad.l + 190}" y="${pad.t - 40}" width="12" height="10" fill="#888" opacity="0.25" rx="0"/>`;
  svg += `<text x="${pad.l + 206}" y="${pad.t - 32}" font-size="9" fill="#555" font-family="${SERIF}">Age</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
}

/* ── Experimental: Per-Trait Power Ratio (range plot) ────────── */
function renderRATraitPowerRange(traitData, allRegs) {
  const el = document.getElementById('ra-trait-power-range-chart');
  if (!el) return;

  const configs = traitData.configs;
  const labels = traitData.labels;
  const providers = traitData.providers;

  // Dimension colors
  const dimColors = {
    Extraversion: '#E11D48',
    Agreeableness: '#16A34A',
    Conscientiousness: '#2563EB',
    Neuroticism: '#D97706',
    Openness: '#7C3AED',
  };

  // Compute per-trait ratios for each config
  const items = [];
  for (let i = 0; i < configs.length; i++) {
    const reg = allRegs[configs[i]];
    if (!reg || !reg.model2) continue;
    const pw = computeTraitPowerRatios(reg);
    const ratios = pw.traitRatios;
    const vals = ratios.map(r => r.ratio);
    items.push({
      label: labels[i],
      provider: providers[i],
      traitRatios: ratios,
      minRatio: Math.min(...vals),
      maxRatio: Math.max(...vals),
      meanRatio: vals.reduce((a, b) => a + b, 0) / vals.length,
    });
  }

  // Sort by mean ratio descending
  items.sort((a, b) => b.meanRatio - a.meanRatio);

  const labelW = 160, plotW = 480, rowH = 24;
  const pad = { l: labelW + 10, t: 50, r: 50, b: 40 };
  const nRows = items.length;
  const W = pad.l + plotW + pad.r;
  const H = pad.t + nRows * rowH + pad.b;

  // Scale
  const globalMax = Math.max(...items.map(d => d.maxRatio));
  const scaleMax = Math.ceil(globalMax * 2 + 0.5) / 2; // round up to nearest 0.5
  const xScale = v => pad.l + (v / scaleMax) * plotW;

  let svg = '';

  // Grid
  for (let pct = 0; pct <= scaleMax * 100; pct += 25) {
    const x = xScale(pct / 100);
    svg += `<line x1="${x}" y1="${pad.t}" x2="${x}" y2="${pad.t + nRows * rowH}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    if (pct % 50 === 0) {
      svg += `<text x="${x}" y="${pad.t + nRows * rowH + 14}" font-size="9" fill="#999" font-family="${SERIF}" text-anchor="middle">${pct}%</text>`;
    }
  }

  // 100% reference line
  const x100 = xScale(1.0);
  if (x100 >= pad.l && x100 <= pad.l + plotW) {
    svg += `<line x1="${x100}" y1="${pad.t - 5}" x2="${x100}" y2="${pad.t + nRows * rowH}" stroke="#EF4444" stroke-width="1.5" stroke-dasharray="4,3" opacity="0.6"/>`;
    svg += `<text x="${x100}" y="${pad.t - 8}" font-size="8" fill="#EF4444" font-family="${SERIF}" text-anchor="middle">trait = infection</text>`;
  }

  // Rows
  for (let r = 0; r < nRows; r++) {
    const d = items[r];
    const y = pad.t + r * rowH;
    const cy = y + rowH / 2;
    const provColor = CONFIG.PROVIDER_COLORS[d.provider] || '#999';

    // Row label
    svg += `<circle cx="${pad.l - labelW}" cy="${cy}" r="3" fill="${provColor}"/>`;
    svg += `<text x="${pad.l - labelW + 9}" y="${cy + 3}" font-size="9" fill="#333" font-family="${SERIF}">${d.label}</text>`;

    // Alternating row bg
    if (r % 2 === 0) {
      svg += `<rect x="${pad.l}" y="${y}" width="${plotW}" height="${rowH}" fill="#fafafa"/>`;
    }

    // Range bar (min to max)
    const xMin = xScale(d.minRatio);
    const xMax = xScale(d.maxRatio);
    svg += `<line x1="${xMin}" y1="${cy}" x2="${xMax}" y2="${cy}" stroke="#ccc" stroke-width="2"/>`;

    // Mean diamond
    const xMean = xScale(d.meanRatio);
    svg += `<polygon points="${xMean},${cy - 5} ${xMean + 4},${cy} ${xMean},${cy + 5} ${xMean - 4},${cy}" fill="#666" opacity="0.5"><title>Mean: ${(d.meanRatio * 100).toFixed(0)}%</title></polygon>`;

    // Individual trait dots
    for (const tr of d.traitRatios) {
      const tx = xScale(tr.ratio);
      const col = dimColors[tr.label] || '#999';
      const opacity = tr.significant ? 0.9 : 0.3;
      const dotR = tr.significant ? 4 : 3;
      svg += `<circle cx="${tx}" cy="${cy}" r="${dotR}" fill="${col}" opacity="${opacity}" stroke="${tr.significant ? 'none' : '#999'}" stroke-width="${tr.significant ? 0 : 0.5}">`;
      svg += `<title>${tr.label}: ${(tr.ratio * 100).toFixed(0)}% of infection${tr.significant ? '' : ' (n.s.)'}</title></circle>`;
    }
  }

  // X-axis label
  svg += `<text x="${pad.l + plotW / 2}" y="${pad.t + nRows * rowH + 30}" font-size="10" fill="#666" font-family="${SERIF}" text-anchor="middle">Individual trait power as % of max infection effect</text>`;

  // Legend
  const legY = pad.t - 38;
  let legX = pad.l;
  for (const [dimLabel, col] of Object.entries(dimColors)) {
    svg += `<circle cx="${legX}" cy="${legY}" r="4" fill="${col}" opacity="0.9"/>`;
    svg += `<text x="${legX + 7}" y="${legY + 3}" font-size="9" fill="#555" font-family="${SERIF}">${dimLabel}</text>`;
    legX += dimLabel.length * 6.5 + 20;
  }
  // Non-significant marker
  svg += `<circle cx="${legX}" cy="${legY}" r="3" fill="#999" opacity="0.3" stroke="#999" stroke-width="0.5"/>`;
  svg += `<text x="${legX + 7}" y="${legY + 3}" font-size="9" fill="#999" font-family="${SERIF}">n.s.</text>`;
  // Mean diamond
  legX += 40;
  svg += `<polygon points="${legX},${legY - 4} ${legX + 3},${legY} ${legX},${legY + 4} ${legX - 3},${legY}" fill="#666" opacity="0.5"/>`;
  svg += `<text x="${legX + 6}" y="${legY + 3}" font-size="9" fill="#555" font-family="${SERIF}">Mean</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
}
