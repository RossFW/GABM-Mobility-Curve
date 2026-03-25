'use strict';
// analytics-responses.js — Response Analysis tab (Figures 33-41)
// Extracted from analytics.js during refactor (March 2026)

// ============================================================
// RESPONSE ANALYSIS — Figures 33–41
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
    renderRARepAgreement(s);
    renderRATextSimilarity(s);
    // Trait power + amplification figures need regression data
    loadAllRegressions(function(allRegs) {
      renderRATraitPowerCombined(t, allRegs);
      renderRATraitPowerRange(t, allRegs);
      renderRAModel3Table(allRegs, t);
      renderRAAmplificationForestPlot(allRegs, t);
      renderRACrossModelAmplification(allRegs, t);
      renderRAAmplificationMatrix(allRegs, t);
    });
  });
}

/* ── Figure 33: Trait Mention Heatmap (10 poles + 2 context) ── */
function renderRATraitHeatmap(data) {
  const el = document.getElementById('ra-fig33-chart');
  if (!el) return;
  const configs = data.configs;
  const labels = data.labels;
  const providers = data.providers;

  // 10 Big Five poles + 2 context columns (Infection, Age)
  const poles = [
    { key: 'extraversion_positive',        label: 'Extraverted',      label2: '',            synonyms: 'extroverted, extrovert, extraverted, extravert, extraversion, extroversion', source: 'pole' },
    { key: 'extraversion_negative',        label: 'Introverted',      label2: '',            synonyms: 'introverted, introvert, introversion', source: 'pole' },
    { key: 'agreeableness_positive',       label: 'Agreeable',        label2: '',            synonyms: 'agreeable, agreeableness', source: 'pole' },
    { key: 'agreeableness_negative',       label: 'Antagonistic',     label2: '',            synonyms: 'antagonistic, antagonism, disagreeable', source: 'pole' },
    { key: 'conscientiousness_positive',   label: 'Conscientious',    label2: '',            synonyms: 'conscientious, conscientiousness', source: 'pole' },
    { key: 'conscientiousness_negative',   label: 'Unconscientious',  label2: '',            synonyms: 'unconscientious', source: 'pole' },
    { key: 'neuroticism_positive',         label: 'Neurotic',         label2: '',            synonyms: 'neurotic, neuroticism', source: 'pole' },
    { key: 'neuroticism_negative',         label: 'Emotionally',      label2: 'Stable',      synonyms: 'emotionally stable, emotional stability', source: 'pole' },
    { key: 'openness_positive',            label: 'Open to',          label2: 'Experience',  synonyms: 'open to experience, openness, open-minded', source: 'pole' },
    { key: 'openness_negative',            label: 'Closed to',        label2: 'Experience',  synonyms: 'closed to experience, closed-minded', source: 'pole' },
    // Context columns (dimension-level, from mention_rates)
    { key: 'infection',                    label: 'Infection',        label2: '',            synonyms: 'infection, infected, cases, diagnosed, diagnoses, X%', source: 'dim' },
    { key: 'age',                          label: 'Age',              label2: '',            synonyms: 'years old, young, age, old, own age number', source: 'dim' },
  ];
  const nCols = poles.length;  // 12
  const nRows = configs.length;
  const nBigFiveCols = 10;  // first 10 are Big Five poles
  const gapW = 8;  // visual gap before context columns

  const cellW = 76, cellH = 22;
  const labelW = 160, topH = 110;
  const pad = { l: labelW + 10, t: topH, r: 30, b: 40 };
  const W = pad.l + nBigFiveCols * cellW + gapW + 2 * cellW + pad.r;
  const H = pad.t + nRows * cellH + pad.b;

  // Helper to get x position for a column (accounts for gap)
  function colX(c) {
    if (c < nBigFiveCols) return pad.l + c * cellW;
    return pad.l + nBigFiveCols * cellW + gapW + (c - nBigFiveCols) * cellW;
  }

  let svg = '';

  // Dimension group brackets at top — Big Five
  const dimNames = ['Extraversion', 'Agreeableness', 'Conscientiousness', 'Neuroticism', 'Openness'];
  for (let d = 0; d < 5; d++) {
    const x1 = colX(d * 2);
    const x2 = x1 + 2 * cellW;
    const cx = (x1 + x2) / 2;
    svg += `<text x="${cx}" y="${pad.t - 82}" font-size="10" fill="#333" font-family="${SERIF}" text-anchor="middle" font-weight="bold">${dimNames[d]}</text>`;
    svg += `<line x1="${x1 + 4}" y1="${pad.t - 76}" x2="${x2 - 4}" y2="${pad.t - 76}" stroke="#bbb" stroke-width="1"/>`;
  }

  // Context group bracket
  const ctxX1 = colX(nBigFiveCols);
  const ctxX2 = ctxX1 + 2 * cellW;
  const ctxCx = (ctxX1 + ctxX2) / 2;
  svg += `<text x="${ctxCx}" y="${pad.t - 82}" font-size="10" fill="#333" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Context</text>`;
  svg += `<line x1="${ctxX1 + 4}" y1="${pad.t - 76}" x2="${ctxX2 - 4}" y2="${pad.t - 76}" stroke="#bbb" stroke-width="1"/>`;

  // Column headers
  for (let c = 0; c < nCols; c++) {
    const x = colX(c) + cellW / 2;
    const pole = poles[c];
    if (pole.label2) {
      svg += `<text x="${x}" y="${pad.t - 56}" font-size="9.5" fill="#333" font-family="${SERIF}" text-anchor="middle" font-style="italic">${esc(pole.label)}</text>`;
      svg += `<text x="${x}" y="${pad.t - 45}" font-size="9.5" fill="#333" font-family="${SERIF}" text-anchor="middle" font-style="italic">${esc(pole.label2)}</text>`;
    } else {
      svg += `<text x="${x}" y="${pad.t - 50}" font-size="9.5" fill="#333" font-family="${SERIF}" text-anchor="middle" font-style="italic">${esc(pole.label)}</text>`;
    }
    // Synonyms
    const synLines = [];
    let current = '';
    for (const w of pole.synonyms.split(', ')) {
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
      const x = colX(c);
      const pole = poles[c];
      // Get rate from correct source
      const rate = pole.source === 'pole'
        ? data.pole_rates[configs[r]][pole.key]
        : (data.mention_rates[configs[r]][pole.key] || 0);
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

  // Grid border — Big Five section
  svg += `<rect x="${pad.l}" y="${pad.t}" width="${nBigFiveCols * cellW}" height="${nRows * cellH}" fill="none" stroke="#999" stroke-width="1"/>`;
  // Grid border — Context section
  svg += `<rect x="${colX(nBigFiveCols)}" y="${pad.t}" width="${2 * cellW}" height="${nRows * cellH}" fill="none" stroke="#999" stroke-width="1"/>`;

  // Vertical dividers between dimension pairs (Big Five)
  for (let d = 1; d < 5; d++) {
    const x = colX(d * 2);
    svg += `<line x1="${x}" y1="${pad.t}" x2="${x}" y2="${pad.t + nRows * cellH}" stroke="#999" stroke-width="1"/>`;
  }
  // Vertical divider between Infection and Age
  const divX = colX(nBigFiveCols + 1);
  svg += `<line x1="${divX}" y1="${pad.t}" x2="${divX}" y2="${pad.t + nRows * cellH}" stroke="#ddd" stroke-width="0.5"/>`;

  // Legend
  const totalGridW = nBigFiveCols * cellW + gapW + 2 * cellW;
  const legY = pad.t + nRows * cellH + 14;
  const legW = 180;
  const legX = pad.l + (totalGridW - legW) / 2;
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

/* ── Figure 35: Output Token Landscape (box plots) ─────────── */
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

/* ── Figure 36: Verbosity × Infection Level ────────────────── */
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
    // Hover dots with tooltips
    for (let i = 0; i < lvKeys.length; i++) {
      const lv = parseFloat(lvKeys[i]);
      const v = byLevel[lvKeys[i]];
      const x = xScale(lv);
      const y = yScale(v.mean_output);
      svg += `<circle cx="${x}" cy="${y}" r="4" fill="${provColor}" opacity="0" style="cursor:default"><title>${labels[ci]} @ ${lv.toFixed(1)}% infection\nMean: ${Math.round(v.mean_output)} tokens</title></circle>`;
    }

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

/* ── Figure 37: Rep-to-Rep Decision Agreement ──────────────── */
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

/* ── Figure 38: Response Text Similarity ───────────────────── */
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

  // Sort: CONFIG.MODELS order (matches cohort analysis)
  const modelIdx = {};
  CONFIG.MODELS.forEach((m, i) => { modelIdx[m.label] = i; });
  items.sort((a, b) => (modelIdx[a.label] ?? 999) - (modelIdx[b.label] ?? 999));

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
/* ── Figure 34: Per-Trait Power Ratio (clone of Cohort Fig 29) ── */
function renderRATraitPowerRange(traitData, allRegs) {
  renderCohortTraitPowerRatio(allRegs, 'ra-trait-power-range-chart');
}

// ── Amplification analysis helpers ──────────────────────────────

// Maps interaction coefficient JSON keys (from R) to display info
const AMPLIFICATION_DIMS = [
  { key: 'extraverted_mentioned_ext',            label: 'Extraversion',        traitKey: 'extraverted',    mentionKey: 'mentioned_ext',       dimKey: 'ext' },
  { key: 'agreeable_mentioned_agr',              label: 'Agreeableness',       traitKey: 'agreeable',      mentionKey: 'mentioned_agr',       dimKey: 'agr' },
  { key: 'conscientious_mentioned_con',          label: 'Conscientiousness',   traitKey: 'conscientious',  mentionKey: 'mentioned_con',       dimKey: 'con' },
  { key: 'emot_stable_mentioned_neu',            label: 'Neuroticism',         traitKey: 'emot_stable',    mentionKey: 'mentioned_neu',       dimKey: 'neu' },
  { key: 'open_to_exp_mentioned_ope',            label: 'Openness',            traitKey: 'open_to_exp',    mentionKey: 'mentioned_ope',       dimKey: 'ope' },
  { key: 'infection_pct_mentioned_infection',     label: 'Infection',           traitKey: 'infection_pct',  mentionKey: 'mentioned_infection', dimKey: 'infection' },
  { key: 'age_years_mentioned_age',              label: 'Age',                 traitKey: 'age',            mentionKey: 'mentioned_age',        dimKey: 'age' },
];

function getAmplificationData(regData, traitData, configKey) {
  const m3 = regData.model3;
  if (!m3 || m3.error || !m3.coefficients) return null;

  const coefs = m3.coefficients;
  const contrast = m3.contrast_flags || {};
  const mentionRates = traitData.mention_rates[configKey] || {};

  return AMPLIFICATION_DIMS.map(dim => {
    const c = coefs[dim.key];
    const cf = contrast[dim.dimKey];
    const mentionRate = dim.dimKey === 'infection'
      ? (mentionRates.infection || 0)
      : dim.dimKey === 'age'
        ? (mentionRates.age || 0)
        : (mentionRates[{ext:'extraversion',agr:'agreeableness',con:'conscientiousness',neu:'neuroticism',ope:'openness'}[dim.dimKey]] || 0);

    if (!c) return { ...dim, available: false, insufficient: true, mentionRate };

    return {
      ...dim,
      available: true,
      estimate: c.estimate,
      se: c.se,
      z: c.z,
      p: c.p,
      sig: c.p < 0.05,
      or: c.or,
      ci_lo: c.estimate - 1.96 * c.se,
      ci_hi: c.estimate + 1.96 * c.se,
      insufficient: cf ? !cf.sufficient : true,
      mentionRate,
    };
  });
}

/* ── Figure 35: Model 3 Coefficient Table ────────────────────── */
function renderRAModel3Table(allRegs, traitData) {
  const pickerEl = document.getElementById('ra-m3table-picker');
  const chartEl = document.getElementById('ra-m3table-chart');
  if (!chartEl) return;

  let currentIdx = 0;

  function fmtC(v) { return v == null ? '—' : v.toFixed(3); }
  function fmtOR(v) {
    if (v == null) return '—';
    if (v > 1e6) return '> 10⁶';
    if (v < 1e-6) return '< 10⁻⁶';
    return v.toFixed(3);
  }
  function fmtCI(c) {
    if (!c) return '—';
    const lo = c.estimate - 1.96 * c.se, hi = c.estimate + 1.96 * c.se;
    return `[${lo.toFixed(3)}, ${hi.toFixed(3)}]`;
  }

  // Predictor rows grouped into 3 sections
  const BASE = [
    { key: 'intercept',        label: 'Intercept' },
    { key: 'infection_pct',    label: 'Infection Rate (%)' },
    { key: 'infection_pct_sq', label: 'Infection Rate²' },
    { key: 'male',             label: 'Male' },
    { key: 'extraverted',      label: 'Extraverted' },
    { key: 'agreeable',        label: 'Agreeable' },
    { key: 'conscientious',    label: 'Conscientious' },
    { key: 'emot_stable',      label: 'Emotionally Stable' },
    { key: 'open_to_exp',      label: 'Open to Experience' },
    { key: 'age',              label: 'Age (years)' },
  ];
  const MENTION = [
    { key: 'mentioned_ext',       label: 'Mentioned Extraversion',       dimKey: 'ext' },
    { key: 'mentioned_agr',       label: 'Mentioned Agreeableness',      dimKey: 'agr' },
    { key: 'mentioned_con',       label: 'Mentioned Conscientiousness',  dimKey: 'con' },
    { key: 'mentioned_neu',       label: 'Mentioned Neuroticism',        dimKey: 'neu' },
    { key: 'mentioned_ope',       label: 'Mentioned Openness',           dimKey: 'ope' },
    { key: 'mentioned_infection', label: 'Mentioned Infection',           dimKey: 'infection' },
    { key: 'mentioned_age',       label: 'Mentioned Age',                dimKey: 'age' },
  ];
  const INTERACTION = [
    { key: 'extraverted_mentioned_ext',        label: 'Extraverted × Mentioned Ext',   dimKey: 'ext' },
    { key: 'agreeable_mentioned_agr',          label: 'Agreeable × Mentioned Agr',     dimKey: 'agr' },
    { key: 'conscientious_mentioned_con',      label: 'Conscientious × Mentioned Con', dimKey: 'con' },
    { key: 'emot_stable_mentioned_neu',        label: 'Emot. Stable × Mentioned Neu',  dimKey: 'neu' },
    { key: 'open_to_exp_mentioned_ope',        label: 'Open to Exp × Mentioned Ope',   dimKey: 'ope' },
    { key: 'infection_pct_mentioned_infection', label: 'Infection % × Mentioned Inf',   dimKey: 'infection' },
    { key: 'age_years_mentioned_age',          label: 'Age × Mentioned Age',           dimKey: 'age' },
  ];

  function render(modelIdx) {
    const m = CONFIG.MODELS[modelIdx];
    const key = configDirKey(m);
    const regData = allRegs[key];
    if (!regData || !regData.model3 || regData.model3.error) {
      chartEl.innerHTML = '<p style="color:#999;font-style:italic">Model 3 not available for this configuration.</p>';
      return;
    }

    const m3 = regData.model3;
    const coefs = m3.coefficients;
    const contrast = m3.contrast_flags || {};
    const mentionRates = traitData.mention_rates ? (traitData.mention_rates[key] || {}) : {};

    let html = '';
    html += '<div style="font-size:13px;font-weight:bold;color:#111;margin-bottom:6px">' + esc(m.label) + '</div>';

    // Banner
    html += '<div style="background:#f0f7ff;border:1px solid #b3d4fc;border-radius:4px;padding:8px 12px;margin-bottom:10px;font-size:12px">';
    html += '<strong>Model 3: Random-effects logit with mention interactions.</strong> ';
    html += 'DV: <code style="background:#e8e8e8;padding:1px 4px;border-radius:2px">stay_home</code> (1 = stay home, 0 = go out). ';
    html += 'Positive coefficients (OR > 1) → higher odds of staying home. ';
    html += '<strong>' + (m3.n_interactions || 0) + '</strong> interaction terms included (sufficient contrast).';
    html += '</div>';

    // Table header
    html += '<table class="ols-table" style="width:100%;font-size:11px;border-collapse:collapse">';
    html += '<thead><tr style="border-bottom:2px solid #333">';
    html += '<th style="text-align:left;padding:3px 6px">Predictor</th>';
    html += '<th style="text-align:right;padding:3px 6px">Coef</th>';
    html += '<th style="text-align:right;padding:3px 6px">SE</th>';
    html += '<th style="text-align:right;padding:3px 6px">OR</th>';
    html += '<th style="text-align:right;padding:3px 6px">95% CI</th>';
    html += '<th style="text-align:center;padding:3px 6px">Sig</th>';
    html += '<th style="text-align:right;padding:3px 6px">Note</th>';
    html += '</tr></thead><tbody>';

    let rowIdx = 0;
    function addRow(label, c, note, sectionStart) {
      const bg = rowIdx % 2 === 0 ? '#fafafa' : '#fff';
      const topBorder = sectionStart ? 'border-top:2px solid #aaa;' : '';
      html += '<tr style="background:' + bg + ';' + topBorder + '">';
      html += '<td style="font-weight:600;padding:3px 6px">' + label + '</td>';
      if (c) {
        html += '<td style="text-align:right;padding:3px 6px;font-family:monospace">' + fmtC(c.estimate) + '</td>';
        html += '<td style="text-align:right;padding:3px 6px;font-family:monospace;color:#888">' + fmtC(c.se) + '</td>';
        html += '<td style="text-align:right;padding:3px 6px;font-family:monospace">' + fmtOR(c.or) + '</td>';
        html += '<td style="text-align:right;padding:3px 6px;font-family:monospace;font-size:10px">' + fmtCI(c) + '</td>';
        html += '<td style="text-align:center;padding:3px 6px;font-family:monospace">' + (c.sig || '') + '</td>';
      } else {
        html += '<td colspan="5" style="text-align:center;padding:3px 6px;color:#bbb">—</td>';
      }
      html += '<td style="text-align:right;padding:3px 6px;font-size:10px;color:#888">' + (note || '') + '</td>';
      html += '</tr>';
      rowIdx++;
    }

    // Section: Base predictors
    html += '<tr><td colspan="7" style="padding:6px 6px 2px;font-size:10px;color:#666;font-style:italic;border-bottom:1px solid #ddd">Base Predictors</td></tr>';
    BASE.forEach(p => addRow(p.label, coefs[p.key], ''));

    // Section: Mention flags
    html += '<tr><td colspan="7" style="padding:10px 6px 2px;font-size:10px;color:#666;font-style:italic;border-bottom:1px solid #ddd">Mention Flags (0/1: did the response text mention this dimension?)</td></tr>';
    rowIdx = 0;
    MENTION.forEach(p => {
      const cf = contrast[p.dimKey];
      const rate = cf ? (cf.mention_rate * 100).toFixed(1) + '%' : '';
      addRow(p.label, coefs[p.key], rate);
    });

    // Section: Interaction terms
    html += '<tr><td colspan="7" style="padding:10px 6px 2px;font-size:10px;color:#666;font-style:italic;border-bottom:1px solid #ddd">Interaction Terms (trait × mentioned trait)</td></tr>';
    rowIdx = 0;
    INTERACTION.forEach(p => {
      const cf = contrast[p.dimKey];
      const sufficient = cf ? cf.sufficient : false;
      const rate = cf ? (cf.mention_rate * 100).toFixed(1) + '%' : '?';
      const c = coefs[p.key];
      if (c) {
        addRow(p.label, c, '');
      } else if (!sufficient) {
        // Excluded — explain why
        const bg = rowIdx % 2 === 0 ? '#fafafa' : '#fff';
        html += '<tr style="background:' + bg + '">';
        html += '<td style="font-weight:600;padding:3px 6px;color:#bbb">' + p.label + '</td>';
        html += '<td colspan="5" style="text-align:center;padding:3px 6px;color:#c77;font-size:10px">';
        html += 'Excluded — mention rate ' + rate + ' (outside 5–95% contrast window)';
        html += '</td>';
        html += '<td></td></tr>';
        rowIdx++;
      } else {
        addRow(p.label, null, '');
      }
    });

    html += '</tbody></table>';

    // Fit statistics
    const fit = m3.fit || {};
    html += '<div style="margin-top:8px;font-size:11px;color:#666;display:flex;gap:24px;flex-wrap:wrap">';
    html += '<span><strong>AIC:</strong> ' + (fit.aic ? fit.aic.toLocaleString() : '—') + '</span>';
    html += '<span><strong>BIC:</strong> ' + (fit.bic ? fit.bic.toLocaleString() : '—') + '</span>';
    html += '<span><strong>N:</strong> ' + (fit.n ? fit.n.toLocaleString() : '—') + '</span>';
    html += '<span><strong>Groups:</strong> ' + (fit.n_groups || '—') + '</span>';
    html += '<span><strong>σ²<sub>u</sub>:</strong> ' + (fit.re_variance != null ? fit.re_variance.toFixed(3) : '—') + '</span>';
    html += '</div>';

    // Contrast flag summary
    html += '<div style="margin-top:8px;padding:8px 12px;background:#fff8f0;border:1px solid #f0d0a0;border-radius:4px;font-size:11px">';
    html += '<strong>Contrast flags</strong> — interaction terms require the mention flag to have enough variance (5–95% mention rate). ';
    html += 'Dimensions outside this range have near-constant mention flags, making the interaction unidentifiable.';
    html += '<div style="margin-top:4px;display:flex;gap:12px;flex-wrap:wrap">';
    for (const dk of ['ext','agr','con','neu','ope','infection','age']) {
      const cf = contrast[dk];
      if (!cf) continue;
      const rate = (cf.mention_rate * 100).toFixed(1);
      const ok = cf.sufficient;
      html += '<span style="color:' + (ok ? '#4a4' : '#c44') + '">';
      html += (ok ? '✓' : '✗') + ' ' + dk + ': ' + rate + '%';
      html += '</span>';
    }
    html += '</div></div>';

    chartEl.innerHTML = html;
  }

  if (pickerEl) {
    buildModelPicker('ra-m3table-picker', currentIdx, idx => { currentIdx = idx; render(idx); });
  }
  render(currentIdx);
}

/* ── Figure 36: Amplification Forest Plot (paired effects) ──── */
/* Shows the mention effect for BOTH poles of each Big Five trait:
   - Negative-pole agents (reference group): effect = β_mentioned
   - Positive-pole agents: effect = β_mentioned + β_interaction (conservative CI)
   If the two dots diverge across zero, that's true bidirectional amplification.
   Context dimensions (infection, age) show the interaction as a slope change. */
function renderRAAmplificationForestPlot(allRegs, traitData) {
  const pickerEl = document.getElementById('ra-amp35-picker');
  const chartEl = document.getElementById('ra-amp35-chart');
  if (!chartEl) return;

  const B5_DIMS = [
    { dim: 'Extraversion',        mentionKey: 'mentioned_ext', interKey: 'extraverted_mentioned_ext',   dimKey: 'ext', negPole: 'Introverted',     posPole: 'Extraverted',   rateDim: 'extraversion' },
    { dim: 'Agreeableness',       mentionKey: 'mentioned_agr', interKey: 'agreeable_mentioned_agr',     dimKey: 'agr', negPole: 'Antagonistic',    posPole: 'Agreeable',     rateDim: 'agreeableness' },
    { dim: 'Conscientiousness',   mentionKey: 'mentioned_con', interKey: 'conscientious_mentioned_con', dimKey: 'con', negPole: 'Unconscientious', posPole: 'Conscientious', rateDim: 'conscientiousness' },
    { dim: 'Emotional Stability', mentionKey: 'mentioned_neu', interKey: 'emot_stable_mentioned_neu',   dimKey: 'neu', negPole: 'Neurotic',        posPole: 'Emot. stable',  rateDim: 'neuroticism' },
    { dim: 'Openness',            mentionKey: 'mentioned_ope', interKey: 'open_to_exp_mentioned_ope',   dimKey: 'ope', negPole: 'Closed',          posPole: 'Open',          rateDim: 'openness' },
  ];
  const CTX_DIMS = [
    { dim: 'Infection', interKey: 'infection_pct_mentioned_infection', dimKey: 'infection', rateDim: 'infection' },
    { dim: 'Age',       interKey: 'age_years_mentioned_age',          dimKey: 'age',       rateDim: 'age' },
  ];

  let currentIdx = 0;

  function render(modelIdx) {
    const m = CONFIG.MODELS[modelIdx];
    const key = configDirKey(m);
    const regData = allRegs[key];
    if (!regData || !regData.model3 || regData.model3.error || !regData.model3.coefficients) {
      chartEl.innerHTML = '<p style="color:#999;font-style:italic">Model 3 not available for this configuration.</p>';
      return;
    }

    const coefs = regData.model3.coefficients;
    const contrast = regData.model3.contrast_flags || {};
    const mentionRates = traitData.mention_rates[key] || {};
    const provColor = CONFIG.PROVIDER_COLORS[m.provider] || '#999';

    // Build rows
    const rows = [];

    for (const b5 of B5_DIMS) {
      const mentionCoef = coefs[b5.mentionKey];
      const interCoef = coefs[b5.interKey];
      const cf = contrast[b5.dimKey];
      const insuff = cf ? !cf.sufficient : true;
      const rate = mentionRates[b5.rateDim] || 0;

      rows.push({ type: 'group', label: b5.dim, mentionRate: rate, insufficient: insuff });

      // Negative-pole row: mention effect = β_mentioned
      if (mentionCoef) {
        const est = mentionCoef.estimate, se = mentionCoef.se;
        rows.push({ type: 'pole', label: b5.negPole, estimate: est, se,
          ci_lo: est - 1.96 * se, ci_hi: est + 1.96 * se,
          p: mentionCoef.p, sig: mentionCoef.p < 0.05,
          insufficient: insuff, mentionRate: rate, isDerived: false, pole: 'neg' });
      } else {
        rows.push({ type: 'pole', label: b5.negPole, available: false, insufficient: true, mentionRate: rate, pole: 'neg' });
      }

      // Positive-pole row: mention effect = β_mentioned + β_interaction (conservative CI)
      if (mentionCoef && interCoef) {
        const est = mentionCoef.estimate + interCoef.estimate;
        const se = Math.sqrt(mentionCoef.se ** 2 + interCoef.se ** 2);
        const ci_lo = est - 1.96 * se, ci_hi = est + 1.96 * se;
        rows.push({ type: 'pole', label: b5.posPole, estimate: est, se, ci_lo, ci_hi,
          p: null, sig: ci_lo > 0 || ci_hi < 0,
          insufficient: insuff, mentionRate: rate, isDerived: true, pole: 'pos' });
      } else if (mentionCoef) {
        rows.push({ type: 'pole', label: b5.posPole, available: false, insufficient: true,
          mentionRate: rate, pole: 'pos', note: 'Interaction excluded' });
      }
    }

    rows.push({ type: 'sep', label: 'Context' });

    for (const ctx of CTX_DIMS) {
      const interCoef = coefs[ctx.interKey];
      const cf = contrast[ctx.dimKey];
      const insuff = cf ? !cf.sufficient : true;
      const rate = mentionRates[ctx.rateDim] || 0;

      if (interCoef) {
        const est = interCoef.estimate, se = interCoef.se;
        rows.push({ type: 'ctx', label: ctx.dim, estimate: est, se,
          ci_lo: est - 1.96 * se, ci_hi: est + 1.96 * se,
          p: interCoef.p, sig: interCoef.p < 0.05,
          insufficient: insuff, mentionRate: rate });
      } else {
        rows.push({ type: 'ctx', label: ctx.dim, available: false, insufficient: true, mentionRate: rate });
      }
    }

    // --- Layout ---
    const groupH = 18, poleH = 26, ctxH = 32, sepH = 18;
    let totalH = 0;
    for (const r of rows) {
      totalH += r.type === 'group' ? groupH : r.type === 'pole' ? poleH : r.type === 'ctx' ? ctxH : sepH;
    }

    const pad = { l: 185, t: 50, r: 60, b: 65 };
    const plotW = 520;
    const W = pad.l + plotW + pad.r;
    const H = pad.t + totalH + pad.b;

    // Fixed axis: ±6 log-odds across all models for comparability
    const axisMax = 6;
    const scale = plotW / (2 * axisMax);
    const cx = pad.l + plotW / 2;

    let svg = '';

    // Title
    svg += `<text x="${W / 2}" y="18" font-size="12" fill="#333" font-family="${SERIF}" text-anchor="middle" font-weight="bold">Trait Mention Effects — ${esc(m.label)}</text>`;
    svg += `<text x="${W / 2}" y="33" font-size="9" fill="#777" font-family="${SERIF}" text-anchor="middle">How mentioning each dimension changes stay-home probability, by agent trait pole</text>`;

    // Zero line
    svg += `<line x1="${cx}" y1="${pad.t}" x2="${cx}" y2="${pad.t + totalH}" stroke="#999" stroke-width="1" stroke-dasharray="4,3"/>`;

    // Log-odds ticks (primary)
    for (let v = -axisMax; v <= axisMax + 0.01; v += 1) {
      const x = cx + v * scale;
      svg += `<line x1="${x}" y1="${pad.t + totalH}" x2="${x}" y2="${pad.t + totalH + 5}" stroke="#bbb" stroke-width="0.5"/>`;
      svg += `<text x="${x}" y="${pad.t + totalH + 16}" font-size="8" fill="#888" font-family="${SERIF}" text-anchor="middle">${v.toFixed(0)}</text>`;
    }
    svg += `<text x="${cx}" y="${pad.t + totalH + 30}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="middle">Mention effect (log-odds)</text>`;
    svg += `<text x="${pad.l + 4}" y="${pad.t + totalH + 30}" font-size="8" fill="#2196F3" font-family="${SERIF}">← Less stay-home</text>`;
    svg += `<text x="${pad.l + plotW - 4}" y="${pad.t + totalH + 30}" font-size="8" fill="#E53935" font-family="${SERIF}" text-anchor="end">More stay-home →</text>`;

    // OR ticks (secondary scale below)
    const orTicks = [-6, -4, -3, -2, -1, 0, 1, 2, 3, 4, 6];
    for (const v of orTicks) {
      const x = cx + v * scale;
      const or = Math.exp(v);
      const lbl = or >= 100 ? or.toFixed(0) : or >= 10 ? or.toFixed(0) : or >= 1 ? or.toFixed(1) : or >= 0.01 ? or.toFixed(2) : or.toFixed(3);
      svg += `<text x="${x}" y="${pad.t + totalH + 44}" font-size="7" fill="#aaa" font-family="${SERIF}" text-anchor="middle">${lbl}</text>`;
    }
    svg += `<text x="${cx}" y="${pad.t + totalH + 56}" font-size="8" fill="#aaa" font-family="${SERIF}" text-anchor="middle">Odds Ratio (OR)</text>`;

    // Render rows
    let yPos = pad.t;
    let poleIdx = 0;

    for (const row of rows) {
      const rH = row.type === 'group' ? groupH : row.type === 'pole' ? poleH : row.type === 'ctx' ? ctxH : sepH;
      const y = yPos + rH / 2;

      if (row.type === 'group') {
        // Dimension group header
        const col = row.insufficient ? '#bbb' : '#333';
        svg += `<text x="${pad.l - 14}" y="${y + 4}" font-size="10" fill="${col}" font-family="${SERIF}" text-anchor="end" font-weight="bold">${row.label}</text>`;
        const rPct = Math.round(row.mentionRate * 100);
        svg += `<text x="${pad.l + plotW + 6}" y="${y + 4}" font-size="8" fill="${row.insufficient ? '#ccc' : '#888'}" font-family="${SERIF}">${rPct}%</text>`;

      } else if (row.type === 'pole') {
        // Sub-row: indented pole label + dot
        const col = row.insufficient ? '#ccc' : '#555';
        svg += `<text x="${pad.l - 18}" y="${y + 3}" font-size="9" fill="${col}" font-family="${SERIF}" text-anchor="end">${row.label}</text>`;
        // Small indicator: triangle for derived, circle for direct
        if (row.isDerived) {
          svg += `<polygon points="${pad.l - 12},${y - 3} ${pad.l - 8},${y + 3} ${pad.l - 16},${y + 3}" fill="${provColor}" opacity="0.4"/>`;
        } else {
          svg += `<circle cx="${pad.l - 12}" cy="${y}" r="2" fill="#888" opacity="0.4"/>`;
        }

        if (row.available === false) {
          svg += `<line x1="${pad.l}" y1="${y}" x2="${pad.l + plotW}" y2="${y}" stroke="#eee" stroke-width="0.5" stroke-dasharray="2,2"/>`;
          svg += `<text x="${cx}" y="${y + 3}" font-size="7" fill="#ddd" font-family="${SERIF}" text-anchor="middle">${row.note || 'insufficient contrast'}</text>`;
        } else {
          if (poleIdx % 2 === 0) svg += `<rect x="${pad.l}" y="${yPos}" width="${plotW}" height="${rH}" fill="#fafafa"/>`;

          const opacity = row.insufficient ? 0.2 : (row.sig ? 0.85 : 0.3);
          const clr = row.insufficient ? '#ccc' : provColor;
          const rawLo = cx + row.ci_lo * scale, rawHi = cx + row.ci_hi * scale;
          const xLo = Math.max(rawLo, pad.l);
          const xHi = Math.min(rawHi, pad.l + plotW);
          const xEst = Math.max(pad.l + 3, Math.min(cx + row.estimate * scale, pad.l + plotW - 3));

          svg += `<line x1="${xLo}" y1="${y}" x2="${xHi}" y2="${y}" stroke="${clr}" stroke-width="1.5" opacity="${opacity}"/>`;
          // Arrow indicators if CI extends beyond axis
          if (rawLo < pad.l) svg += `<polygon points="${pad.l},${y} ${pad.l + 5},${y - 3} ${pad.l + 5},${y + 3}" fill="${clr}" opacity="${opacity}"/>`;
          if (rawHi > pad.l + plotW) svg += `<polygon points="${pad.l + plotW},${y} ${pad.l + plotW - 5},${y - 3} ${pad.l + plotW - 5},${y + 3}" fill="${clr}" opacity="${opacity}"/>`;
          if (row.sig && !row.insufficient) {
            svg += `<circle cx="${xEst}" cy="${y}" r="4.5" fill="${provColor}" opacity="0.9"/>`;
          } else {
            svg += `<circle cx="${xEst}" cy="${y}" r="3.5" fill="white" stroke="${clr}" stroke-width="1.5" opacity="${row.insufficient ? 0.3 : 0.6}"/>`;
          }

          // Tooltip (hit-target for wireTooltips)
          const pStr = row.p != null ? `p = ${row.p < 0.001 ? '&lt; .001' : row.p.toFixed(3)}` : `Sig by CI: ${row.sig ? 'Yes' : 'No'}`;
          const derivNote = row.isDerived ? 'β<sub>mentioned</sub> + β<sub>interaction</sub> (conservative CI)' : 'β<sub>mentioned</sub> — direct effect';
          const direction = row.sig ? (row.estimate > 0 ? '→ Mentioning increases stay-home' : '→ Mentioning decreases stay-home') : '(Not significant)';
          const warnTxt = row.insufficient ? '<br>⚠ Insufficient contrast (&lt;5% or &gt;95% mention rate)' : '';
          const extra = `β = ${row.estimate.toFixed(3)} &nbsp;[${row.ci_lo.toFixed(3)}, ${row.ci_hi.toFixed(3)}]<br>${derivNote}<br>${pStr}<br>${direction}${warnTxt}`;
          svg += `<rect x="${pad.l}" y="${yPos}" width="${plotW}" height="${rH}" fill="transparent" class="hit-target" data-label="${esc(row.label)} agents" data-color="${provColor}" data-extra="${extra}" style="cursor:default"/>`;
        }
        poleIdx++;

      } else if (row.type === 'sep') {
        svg += `<line x1="${pad.l - 170}" y1="${y}" x2="${pad.l + plotW}" y2="${y}" stroke="#ddd" stroke-width="0.5"/>`;
        svg += `<text x="${pad.l - 170}" y="${y - 3}" font-size="8" fill="#aaa" font-family="${SERIF}" font-style="italic">${row.label}</text>`;

      } else if (row.type === 'ctx') {
        const col = row.insufficient ? '#bbb' : '#333';
        svg += `<text x="${pad.l - 14}" y="${y + 4}" font-size="10" fill="${col}" font-family="${SERIF}" text-anchor="end" font-weight="bold">${row.label}</text>`;
        svg += `<text x="${pad.l - 14}" y="${y + 13}" font-size="7" fill="#aaa" font-family="${SERIF}" text-anchor="end">slope Δ</text>`;
        const rPct = Math.round(row.mentionRate * 100);
        svg += `<text x="${pad.l + plotW + 6}" y="${y + 4}" font-size="8" fill="${row.insufficient ? '#ccc' : '#888'}" font-family="${SERIF}">${rPct}%</text>`;

        if (row.available === false) {
          svg += `<line x1="${pad.l}" y1="${y}" x2="${pad.l + plotW}" y2="${y}" stroke="#eee" stroke-width="0.5" stroke-dasharray="2,2"/>`;
          svg += `<text x="${cx}" y="${y + 3}" font-size="7" fill="#ddd" font-family="${SERIF}" text-anchor="middle">insufficient contrast</text>`;
        } else {
          if (poleIdx % 2 === 0) svg += `<rect x="${pad.l}" y="${yPos}" width="${plotW}" height="${rH}" fill="#fafafa"/>`;

          const opacity = row.insufficient ? 0.2 : (row.sig ? 0.85 : 0.3);
          const clr = row.insufficient ? '#ccc' : provColor;
          const rawLoC = cx + row.ci_lo * scale, rawHiC = cx + row.ci_hi * scale;
          const xLo = Math.max(rawLoC, pad.l);
          const xHi = Math.min(rawHiC, pad.l + plotW);
          const xEst = Math.max(pad.l + 3, Math.min(cx + row.estimate * scale, pad.l + plotW - 3));

          svg += `<line x1="${xLo}" y1="${y}" x2="${xHi}" y2="${y}" stroke="${clr}" stroke-width="2" opacity="${opacity}"/>`;
          if (rawLoC < pad.l) svg += `<polygon points="${pad.l},${y} ${pad.l + 5},${y - 3} ${pad.l + 5},${y + 3}" fill="${clr}" opacity="${opacity}"/>`;
          if (rawHiC > pad.l + plotW) svg += `<polygon points="${pad.l + plotW},${y} ${pad.l + plotW - 5},${y - 3} ${pad.l + plotW - 5},${y + 3}" fill="${clr}" opacity="${opacity}"/>`;
          if (row.sig && !row.insufficient) {
            svg += `<circle cx="${xEst}" cy="${y}" r="5" fill="${provColor}" opacity="0.9"/>`;
          } else {
            svg += `<circle cx="${xEst}" cy="${y}" r="4" fill="white" stroke="${clr}" stroke-width="1.5" opacity="${row.insufficient ? 0.3 : 0.6}"/>`;
          }

          // Tooltip (hit-target for wireTooltips)
          const ctxDirection = row.sig ? (row.estimate > 0 ? '→ Mentioning strengthens this effect' : '→ Mentioning weakens this effect') : '(Not significant)';
          const ctxWarn = row.insufficient ? '<br>⚠ Insufficient contrast' : '';
          const ctxExtra = `β = ${row.estimate.toFixed(3)} &nbsp;[${row.ci_lo.toFixed(3)}, ${row.ci_hi.toFixed(3)}]<br>p = ${row.p < 0.001 ? '&lt; .001' : row.p.toFixed(3)}<br>Mention rate: ${rPct}%<br>${ctxDirection}${ctxWarn}`;
          svg += `<rect x="${pad.l}" y="${yPos}" width="${plotW}" height="${rH}" fill="transparent" class="hit-target" data-label="${esc(row.label)} — slope change" data-color="${provColor}" data-extra="${ctxExtra}" style="cursor:default"/>`;
        }
        poleIdx++;
      }
      yPos += rH;
    }

    // Legend
    const legY = pad.t - 10;
    svg += `<circle cx="${pad.l}" cy="${legY}" r="4" fill="${provColor}" opacity="0.9"/>`;
    svg += `<text x="${pad.l + 8}" y="${legY + 3}" font-size="8" fill="#555" font-family="${SERIF}">Significant</text>`;
    svg += `<circle cx="${pad.l + 80}" cy="${legY}" r="3.5" fill="white" stroke="${provColor}" stroke-width="1.5" opacity="0.6"/>`;
    svg += `<text x="${pad.l + 88}" y="${legY + 3}" font-size="8" fill="#555" font-family="${SERIF}">Not Significant</text>`;
    svg += `<circle cx="${pad.l + 190}" cy="${legY}" r="2" fill="#888" opacity="0.4"/>`;
    svg += `<text x="${pad.l + 198}" y="${legY + 3}" font-size="8" fill="#555" font-family="${SERIF}">Direct (β<tspan font-size="6" baseline-shift="sub">mention</tspan>)</text>`;
    svg += `<polygon points="${pad.l + 298},${legY - 3} ${pad.l + 302},${legY + 3} ${pad.l + 294},${legY + 3}" fill="${provColor}" opacity="0.4"/>`;
    svg += `<text x="${pad.l + 308}" y="${legY + 3}" font-size="8" fill="#555" font-family="${SERIF}">Derived (β<tspan font-size="6" baseline-shift="sub">mention</tspan> + β<tspan font-size="6" baseline-shift="sub">interaction</tspan>)</text>`;

    chartEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
    wireTooltips(chartEl);
  }

  if (pickerEl) {
    buildModelPicker('ra-amp35-picker', currentIdx, idx => { currentIdx = idx; render(idx); });
  }
  render(currentIdx);
}

/* \u2500\u2500 Figure 36b: Cross-Model Trait \u00d7 Mention Combinations (all models, all dimensions) \u2500\u2500 */
/* Shows 4 predicted log-odds positions per model per dimension:
   \u25cb low-end (no mention), \u25cf low-end (mentioned),
   \u25b3 high-end (no mention), \u25b2 high-end (mentioned).
   All 7 panels stacked (5 Big Five + Age + Infection). */
function renderRACrossModelAmplification(allRegs, traitData) {
  const chartEl = document.getElementById('ra-xmodel-chart');
  if (!chartEl) return;

  const PANELS = [
    { dim: 'Extraversion',        type: 'b5',  traitKey: 'extraverted',   mentionKey: 'mentioned_ext', interKey: 'extraverted_mentioned_ext',       dimKey: 'ext',       lowLabel: 'Introverted',     highLabel: 'Extraverted',   rateDim: 'extraversion' },
    { dim: 'Agreeableness',       type: 'b5',  traitKey: 'agreeable',     mentionKey: 'mentioned_agr', interKey: 'agreeable_mentioned_agr',         dimKey: 'agr',       lowLabel: 'Antagonistic',    highLabel: 'Agreeable',     rateDim: 'agreeableness' },
    { dim: 'Conscientiousness',   type: 'b5',  traitKey: 'conscientious', mentionKey: 'mentioned_con', interKey: 'conscientious_mentioned_con',     dimKey: 'con',       lowLabel: 'Unconscientious', highLabel: 'Conscientious', rateDim: 'conscientiousness' },
    { dim: 'Emotional Stability', type: 'b5',  traitKey: 'emot_stable',   mentionKey: 'mentioned_neu', interKey: 'emot_stable_mentioned_neu',       dimKey: 'neu',       lowLabel: 'Neurotic',        highLabel: 'Emot. Stable',  rateDim: 'neuroticism' },
    { dim: 'Openness',            type: 'b5',  traitKey: 'open_to_exp',   mentionKey: 'mentioned_ope', interKey: 'open_to_exp_mentioned_ope',       dimKey: 'ope',       lowLabel: 'Closed',          highLabel: 'Open',          rateDim: 'openness' },
    { dim: 'Age',                 type: 'ctx', scaleKey: 'age',           mentionKey: 'mentioned_age', interKey: 'age_years_mentioned_age',         dimKey: 'age',       lowLabel: 'Age 18',          highLabel: 'Age 65',        lowVal: 18, highVal: 65, rateDim: 'age' },
    { dim: 'Infection',           type: 'ctx', scaleKey: 'infection_pct', mentionKey: 'mentioned_infection', interKey: 'infection_pct_mentioned_infection', dimKey: 'infection', lowLabel: '0% Infection',    highLabel: '7% Infection',  lowVal: 0,  highVal: 7,  scaleKey2: 'infection_pct_sq', rateDim: 'infection' },
  ];

  // Collect configs in CONFIG.MODELS display order
  const configs = [];
  const seen = new Set();
  CONFIG.MODELS.forEach(m => {
    const key = configDirKey(m);
    if (seen.has(key)) return;
    seen.add(key);
    const regData = allRegs[key];
    if (regData && regData.model3 && !regData.model3.error) {
      configs.push({ key, label: m.label, provider: m.provider, color: CONFIG.PROVIDER_COLORS[m.provider] || '#999' });
    }
  });
  if (configs.length === 0) {
    chartEl.innerHTML = '<div style="color:#999;padding:20px">No Model 3 data available.</div>';
    return;
  }
  const nConfigs = configs.length;

  // Compute 4 predicted log-odds positions for a panel
  function comboPositions(coefs, panel) {
    const intercept = coefs.intercept ? coefs.intercept.estimate : null;
    if (intercept == null) return null;
    if (panel.type === 'b5') {
      const bT = coefs[panel.traitKey], bM = coefs[panel.mentionKey], bI = coefs[panel.interKey];
      if (!bT || !bM || !bI) return null;
      return {
        lowNo:  intercept,
        lowYes: intercept + bM.estimate,
        hiNo:   intercept + bT.estimate,
        hiYes:  intercept + bT.estimate + bM.estimate + bI.estimate,
      };
    } else {
      const bS = coefs[panel.scaleKey], bM = coefs[panel.mentionKey], bI = coefs[panel.interKey];
      if (!bS || !bM || !bI) return null;
      const bS2 = panel.scaleKey2 && coefs[panel.scaleKey2] ? coefs[panel.scaleKey2].estimate : 0;
      const lo = panel.lowVal, hi = panel.highVal;
      return {
        lowNo:  intercept + bS.estimate * lo + bS2 * lo * lo,
        lowYes: intercept + bS.estimate * lo + bS2 * lo * lo + bM.estimate + bI.estimate * lo,
        hiNo:   intercept + bS.estimate * hi + bS2 * hi * hi,
        hiYes:  intercept + bS.estimate * hi + bS2 * hi * hi + bM.estimate + bI.estimate * hi,
      };
    }
  }

  // Pre-compute infection range per config (for amber markers)
  const infData = {};
  configs.forEach(c => {
    const coefs = allRegs[c.key].model3.coefficients;
    const b1 = coefs.infection_pct ? coefs.infection_pct.estimate : 0;
    const b2 = coefs.infection_pct_sq ? coefs.infection_pct_sq.estimate : 0;
    const intercept = coefs.intercept ? coefs.intercept.estimate : 0;
    const xPeak = b2 !== 0 ? Math.min(7, Math.max(0, -b1 / (2 * b2))) : 0;
    const infVals = [0, b1 * 7 + b2 * 49, b1 * xPeak + b2 * xPeak * xPeak];
    infData[c.key] = { intercept, minInfLO: Math.min(...infVals), maxInfLO: Math.max(...infVals) };
  });

  // Auto-scale axis: scan ALL configs x ALL panels
  let gMin = Infinity, gMax = -Infinity;
  const expand = v => { if (isFinite(v)) { if (v < gMin) gMin = v; if (v > gMax) gMax = v; } };
  configs.forEach(c => {
    const coefs = allRegs[c.key].model3.coefficients;
    PANELS.forEach(p => {
      const pos = comboPositions(coefs, p);
      if (pos) { expand(pos.lowNo); expand(pos.lowYes); expand(pos.hiNo); expand(pos.hiYes); }
    });
    const inf = infData[c.key];
    expand(inf.intercept + inf.minInfLO);
    expand(inf.intercept + inf.maxInfLO);
  });
  if (!isFinite(gMin)) { gMin = -5; gMax = 5; }
  const dRange = gMax - gMin;
  gMin -= dRange * 0.05;
  gMax += dRange * 0.05;

  // Layout
  const rowH = 18;
  const gapProv = 6;
  const panelPad = { t: 28, b: 50, l: 160, r: 50 };
  const panelGap = 14;
  const plotW = 540;
  const W = panelPad.l + plotW + panelPad.r;

  let prevP = '', provGaps = 0;
  configs.forEach(c => { if (c.provider !== prevP) { if (prevP) provGaps++; prevP = c.provider; } });
  const panelInnerH = nConfigs * rowH + provGaps * gapProv;
  const panelH = panelPad.t + panelInnerH + panelPad.b;
  const totalH = PANELS.length * (panelH + panelGap) - panelGap;

  function xScale(v) { return panelPad.l + ((v - gMin) / (gMax - gMin)) * plotW; }
  const clampV = v => Math.max(gMin, Math.min(gMax, v));

  const range = gMax - gMin;
  const step = range > 40 ? 10 : range > 20 ? 5 : range > 10 ? 2 : 1;
  const gridStart = Math.ceil(gMin / step) * step;
  function loToProb(lo) { return 1 / (1 + Math.exp(-lo)); }
  function fmtProb(p) {
    if (p < 0.0005) return '<0.1%';
    if (p > 0.9995) return '>99.9%';
    if (p < 0.01) return (p * 100).toFixed(1) + '%';
    if (p > 0.99) return (p * 100).toFixed(1) + '%';
    if (p > 0.095 && p < 0.995) return Math.round(p * 100) + '%';
    return (p * 100).toFixed(1) + '%';
  }

  let svg = '';

  PANELS.forEach((panel, pi) => {
    const py = pi * (panelH + panelGap);
    const panelTop = py + panelPad.t;
    const panelBot = panelTop + panelInnerH;

    // Panel background + title
    svg += `<rect x="0" y="${py}" width="${W}" height="${panelH}" fill="${SVG_BG}" rx="3"/>`;
    svg += `<text x="${W / 2}" y="${py + 16}" font-size="11" font-weight="bold" fill="#111" font-family="${SERIF}" text-anchor="middle">${panel.dim}</text>`;

    // Sub-header: shape legend per panel
    const lx = panelPad.l;
    const ly = py + 24;
    svg += `<circle cx="${lx}" cy="${ly}" r="3" fill="white" stroke="#666" stroke-width="1"/>`;
    svg += `<text x="${lx + 6}" y="${ly + 3}" font-size="7" fill="#777" font-family="${SERIF}">${panel.lowLabel}</text>`;
    const lx2 = lx + 100;
    svg += `<circle cx="${lx2}" cy="${ly}" r="3" fill="#666"/>`;
    svg += `<text x="${lx2 + 6}" y="${ly + 3}" font-size="7" fill="#777" font-family="${SERIF}">${panel.lowLabel} +mention</text>`;
    const lx3 = lx + 230;
    const td2 = 3.5;
    svg += `<polygon points="${lx3},${ly - td2} ${lx3 + td2},${ly + td2} ${lx3 - td2},${ly + td2}" fill="white" stroke="#666" stroke-width="1"/>`;
    svg += `<text x="${lx3 + 6}" y="${ly + 3}" font-size="7" fill="#777" font-family="${SERIF}">${panel.highLabel}</text>`;
    const lx4 = lx + 330;
    svg += `<polygon points="${lx4},${ly - td2} ${lx4 + td2},${ly + td2} ${lx4 - td2},${ly + td2}" fill="#666"/>`;
    svg += `<text x="${lx4 + 6}" y="${ly + 3}" font-size="7" fill="#777" font-family="${SERIF}">${panel.highLabel} +mention</text>`;

    // Zero line
    const x0 = xScale(0);
    if (x0 >= panelPad.l && x0 <= panelPad.l + plotW) {
      svg += `<line x1="${x0}" y1="${panelTop}" x2="${x0}" y2="${panelBot}" stroke="#999" stroke-width="1" stroke-dasharray="4,3"/>`;
    }

    // Grid lines + log-odds ticks
    for (let v = gridStart; v <= gMax; v += step) {
      const tx = xScale(v);
      svg += `<line x1="${tx}" y1="${panelTop}" x2="${tx}" y2="${panelBot}" stroke="#eee" stroke-width="0.5"/>`;
      svg += `<line x1="${tx}" y1="${panelBot}" x2="${tx}" y2="${panelBot + 4}" stroke="#bbb" stroke-width="0.5"/>`;
      svg += `<text x="${tx}" y="${panelBot + 13}" font-size="8" fill="#888" font-family="${SERIF}" text-anchor="middle">${v}</text>`;
    }
    svg += `<text x="${panelPad.l - 8}" y="${panelBot + 13}" font-size="7" fill="#888" font-family="${SERIF}" text-anchor="end">Log-odds</text>`;

    // Secondary axis: P(stay home)
    const probY = panelBot + 22;
    svg += `<text x="${panelPad.l - 8}" y="${probY + 10}" font-size="7" fill="#888" font-family="${SERIF}" text-anchor="end">P(stay)</text>`;
    svg += `<line x1="${panelPad.l}" y1="${probY}" x2="${panelPad.l + plotW}" y2="${probY}" stroke="#ddd" stroke-width="0.5"/>`;
    for (let v = gridStart; v <= gMax; v += step) {
      const px = xScale(v);
      svg += `<line x1="${px}" y1="${probY}" x2="${px}" y2="${probY + 3}" stroke="#bbb" stroke-width="0.5"/>`;
      svg += `<text x="${px}" y="${probY + 12}" font-size="6.5" fill="#999" font-family="${SERIF}" text-anchor="middle">${fmtProb(loToProb(v))}</text>`;
    }
    [{p:0.05,l:'5%'},{p:0.25,l:'25%'},{p:0.50,l:'50%'},{p:0.75,l:'75%'},{p:0.95,l:'95%'}].forEach(m => {
      const lo = Math.log(m.p / (1 - m.p));
      if (lo < gMin || lo > gMax) return;
      const px = xScale(lo);
      let close = false;
      for (let v = gridStart; v <= gMax; v += step) { if (Math.abs(px - xScale(v)) < 18) { close = true; break; } }
      if (close) return;
      svg += `<line x1="${px}" y1="${probY}" x2="${px}" y2="${probY + 3}" stroke="#bbb" stroke-width="0.5"/>`;
      svg += `<text x="${px}" y="${probY + 12}" font-size="6.5" fill="#999" font-family="${SERIF}" text-anchor="middle">${m.l}</text>`;
    });

    // Direction labels
    svg += `<text x="${panelPad.l + 4}" y="${py + panelH - 2}" font-size="8" fill="#999" font-family="${SERIF}" font-style="italic">\u2190 More go-out</text>`;
    svg += `<text x="${W - panelPad.r - 4}" y="${py + panelH - 2}" font-size="8" fill="#999" font-family="${SERIF}" font-style="italic" text-anchor="end">More stay-home \u2192</text>`;

    // Plot each config row
    let rowIdx = 0;
    let lastProv = '';
    configs.forEach(c => {
      if (c.provider !== lastProv && lastProv !== '') rowIdx += gapProv / rowH;
      lastProv = c.provider;

      const cy = panelTop + rowIdx * rowH + rowH / 2;
      const coefs = allRegs[c.key].model3.coefficients;
      const contrast = allRegs[c.key].model3.contrast_flags || {};
      const cf = contrast[panel.dimKey];
      const insuff = cf ? !cf.sufficient : true;
      const mentionRates = traitData.mention_rates ? (traitData.mention_rates[c.key] || {}) : {};
      const rate = mentionRates[panel.rateDim] || 0;

      // Model label
      svg += `<text x="${panelPad.l - 6}" y="${(cy + 3.5).toFixed(1)}" font-size="9" fill="${c.color}" font-family="${SERIF}" text-anchor="end">${esc(c.label)}</text>`;

      const combos = insuff ? null : comboPositions(coefs, panel);
      if (!combos) {
        // Blank row for insufficient contrast
        rowIdx++;
        return;
      }

      const inf = infData[c.key];

      // Infection range (amber) — skip for Infection panel
      if (panel.dim !== 'Infection') {
        const iMinX = xScale(clampV(inf.intercept + inf.minInfLO));
        const iMaxX = xScale(clampV(inf.intercept + inf.maxInfLO));
        svg += `<line x1="${iMinX}" y1="${cy}" x2="${iMaxX}" y2="${cy}" stroke="#D97706" stroke-width="1.5" opacity="0.5"/>`;
        svg += `<circle cx="${iMinX}" cy="${cy}" r="2.5" fill="#D97706" stroke="white" stroke-width="0.5" opacity="0.5"/>`;
        const dd = 3.5;
        svg += `<polygon points="${iMaxX},${cy - dd} ${iMaxX + dd},${cy} ${iMaxX},${cy + dd} ${iMaxX - dd},${cy}" fill="#D97706" stroke="white" stroke-width="0.5" opacity="0.5"/>`;
      }

      // Intercept (red I-beam)
      const intX = xScale(clampV(inf.intercept));
      svg += `<line x1="${intX}" y1="${cy - 6}" x2="${intX}" y2="${cy + 6}" stroke="#e11d48" stroke-width="1.5" opacity="0.5"/>`;
      svg += `<line x1="${intX - 3}" y1="${cy - 6}" x2="${intX + 3}" y2="${cy - 6}" stroke="#e11d48" stroke-width="1" opacity="0.5"/>`;
      svg += `<line x1="${intX - 3}" y1="${cy + 6}" x2="${intX + 3}" y2="${cy + 6}" stroke="#e11d48" stroke-width="1" opacity="0.5"/>`;

      // 4 combo positions
      const px1 = xScale(clampV(combos.lowNo));
      const px2 = xScale(clampV(combos.lowYes));
      const px3 = xScale(clampV(combos.hiNo));
      const px4 = xScale(clampV(combos.hiYes));

      // Connecting lines between mention pairs
      svg += `<line x1="${px1}" y1="${cy}" x2="${px2}" y2="${cy}" stroke="${c.color}" stroke-width="1.5" opacity="0.25"/>`;
      svg += `<line x1="${px3}" y1="${cy}" x2="${px4}" y2="${cy}" stroke="${c.color}" stroke-width="1.5" opacity="0.25"/>`;

      const r = 3.5, td = 4;

      // \u25cb low, no mention (hollow circle)
      svg += `<circle cx="${px1}" cy="${cy}" r="${r}" fill="white" stroke="${c.color}" stroke-width="1.5"/>`;
      // \u25cf low, mentioned (filled circle)
      svg += `<circle cx="${px2}" cy="${cy}" r="${r}" fill="${c.color}"/>`;
      // \u25b3 high, no mention (hollow triangle)
      svg += `<polygon points="${px3},${cy - td} ${px3 + td},${cy + td} ${px3 - td},${cy + td}" fill="white" stroke="${c.color}" stroke-width="1.5"/>`;
      // \u25b2 high, mentioned (filled triangle)
      svg += `<polygon points="${px4},${cy - td} ${px4 + td},${cy + td} ${px4 - td},${cy + td}" fill="${c.color}"/>`;

      // Hit-target tooltip
      const rPct = Math.round(rate * 100);
      const f = v => v.toFixed(2);
      const fp = v => fmtProb(loToProb(v));
      let ttExtra = `\u25cb ${panel.lowLabel}, no mention: ${f(combos.lowNo)} (${fp(combos.lowNo)})`;
      ttExtra += `<br>\u25cf ${panel.lowLabel}, mentioned: ${f(combos.lowYes)} (${fp(combos.lowYes)})`;
      ttExtra += `<br>\u25b3 ${panel.highLabel}, no mention: ${f(combos.hiNo)} (${fp(combos.hiNo)})`;
      ttExtra += `<br>\u25b2 ${panel.highLabel}, mentioned: ${f(combos.hiYes)} (${fp(combos.hiYes)})`;
      ttExtra += `<br>\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500`;
      const gapNo = combos.hiNo - combos.lowNo;
      const gapYes = combos.hiYes - combos.lowYes;
      ttExtra += `<br>Trait gap (no mention): ${f(gapNo)}`;
      ttExtra += `<br>Trait gap (mentioned): ${f(gapYes)}`;
      const ampDelta = Math.abs(gapYes) - Math.abs(gapNo);
      ttExtra += `<br>Amplification \u0394: ${ampDelta > 0 ? '+' : ''}${f(ampDelta)}`;
      ttExtra += `<br>Mention rate: ${rPct}%`;
      svg += `<rect x="${panelPad.l}" y="${(cy - rowH / 2).toFixed(1)}" width="${plotW}" height="${rowH}" fill="transparent" class="hit-target" data-label="${esc(c.label)} \u2014 ${panel.dim}" data-color="${c.color}" data-extra="${ttExtra}" style="cursor:default"/>`;

      rowIdx++;
    });

    // Provider group separator lines (second pass)
    rowIdx = 0;
    lastProv = '';
    configs.forEach(c => {
      if (c.provider !== lastProv && lastProv !== '') {
        const sepY = panelTop + rowIdx * rowH;
        svg += `<line x1="${panelPad.l}" y1="${sepY.toFixed(1)}" x2="${W - panelPad.r}" y2="${sepY.toFixed(1)}" stroke="#ddd" stroke-width="0.5"/>`;
        rowIdx += gapProv / rowH;
      }
      lastProv = c.provider;
      rowIdx++;
    });
  });

  // Footnotes
  const footY = totalH + 16;
  const footnotes = [
    '\u25cb Low-end, not mentioned  |  \u25cf Low-end, mentioned  |  \u25b3 High-end, not mentioned  |  \u25b2 High-end, mentioned',
    'Red I-beam = intercept (baseline). Amber markers = infection log-odds range (0\u20137%). Blank rows = insufficient mention-rate contrast (<5% or >95%).',
    'Source: Model 3 random-effects logit with trait \u00d7 mention interactions. Positions = predicted log-odds at infection = 0%, other traits at reference level.',
  ];
  footnotes.forEach((f, i) => {
    svg += `<text x="10" y="${footY + i * 12}" font-size="7.5" fill="#aaa" font-family="${SERIF}">${f}</text>`;
  });

  const svgH = footY + footnotes.length * 12 + 8;
  chartEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${svgH}" viewBox="0 0 ${W} ${svgH}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
  wireTooltips(chartEl);
}


/* ── Figure 36: Cross-Model Amplification Matrix ──────────── */
function renderRAAmplificationMatrix(allRegs, traitData) {
  const chartEl = document.getElementById('ra-amp36-chart');
  if (!chartEl) return;

  // Paired columns: 2 per Big Five (neg pole, pos pole) + 2 context
  const B5_COLS = [
    { dim: 'Extraversion',        mentionKey: 'mentioned_ext', interKey: 'extraverted_mentioned_ext',   dimKey: 'ext', negLabel: 'Intro-\nverted', posLabel: 'Extra-\nverted', rateDim: 'extraversion' },
    { dim: 'Agreeableness',       mentionKey: 'mentioned_agr', interKey: 'agreeable_mentioned_agr',     dimKey: 'agr', negLabel: 'Antag-\nonistic', posLabel: 'Agree-\nable',    rateDim: 'agreeableness' },
    { dim: 'Conscientiousness',   mentionKey: 'mentioned_con', interKey: 'conscientious_mentioned_con', dimKey: 'con', negLabel: 'Uncon-\nscient.', posLabel: 'Consci-\nentious', rateDim: 'conscientiousness' },
    { dim: 'Emotional Stability', mentionKey: 'mentioned_neu', interKey: 'emot_stable_mentioned_neu',   dimKey: 'neu', negLabel: 'Neur-\notic',    posLabel: 'Emot.\nstable',   rateDim: 'neuroticism' },
    { dim: 'Openness',            mentionKey: 'mentioned_ope', interKey: 'open_to_exp_mentioned_ope',   dimKey: 'ope', negLabel: 'Closed',          posLabel: 'Open',            rateDim: 'openness' },
  ];
  const CTX_COLS = [
    { dim: 'Infection', interKey: 'infection_pct_mentioned_infection', dimKey: 'infection', label: 'Infection\nslope Δ', rateDim: 'infection' },
    { dim: 'Age',       interKey: 'age_years_mentioned_age',          dimKey: 'age',       label: 'Age\nslope Δ',       rateDim: 'age' },
  ];

  // Total columns: 10 (B5 pairs) + 2 (context) = 12
  const nCols = B5_COLS.length * 2 + CTX_COLS.length;
  const models = CONFIG.MODELS;
  const nModels = models.length;

  const cellW = 52, cellH = 30;
  const labelW = 170;
  const topLabelH = 80;
  const pad = { l: labelW + 10, t: topLabelH, r: 20, b: 50 };
  const gridW = nCols * cellW;
  const W = pad.l + gridW + pad.r;
  const H = pad.t + nModels * cellH + pad.b;

  // Build column metadata
  const cols = [];
  for (const b5 of B5_COLS) {
    cols.push({ type: 'neg', dim: b5.dim, label: b5.negLabel, dimKey: b5.dimKey, mentionKey: b5.mentionKey, interKey: b5.interKey, rateDim: b5.rateDim });
    cols.push({ type: 'pos', dim: b5.dim, label: b5.posLabel, dimKey: b5.dimKey, mentionKey: b5.mentionKey, interKey: b5.interKey, rateDim: b5.rateDim });
  }
  for (const ctx of CTX_COLS) {
    cols.push({ type: 'ctx', dim: ctx.dim, label: ctx.label, dimKey: ctx.dimKey, interKey: ctx.interKey, rateDim: ctx.rateDim });
  }

  // Scale: fixed ±6 like forest plot
  const maxCoef = 6;

  let svg = '';

  // Column headers — dimension group labels above pole labels
  let colIdx = 0;
  for (const b5 of B5_COLS) {
    const xMid = pad.l + colIdx * cellW + cellW;  // center of 2-column group
    svg += `<text x="${xMid}" y="${pad.t - 52}" font-size="9" fill="#333" font-family="${SERIF}" text-anchor="middle" font-weight="bold">${b5.dim}</text>`;
    colIdx += 2;
  }
  // Context group label
  const ctxXMid = pad.l + 10 * cellW + CTX_COLS.length * cellW / 2;
  svg += `<text x="${ctxXMid}" y="${pad.t - 52}" font-size="9" fill="#333" font-family="${SERIF}" text-anchor="middle" font-weight="bold" font-style="italic">Context</text>`;

  // Individual pole labels
  for (let c = 0; c < nCols; c++) {
    const col = cols[c];
    const x = pad.l + c * cellW + cellW / 2;
    const lines = col.label.split('\n');
    for (let li = 0; li < lines.length; li++) {
      svg += `<text x="${x}" y="${pad.t - 32 + li * 12}" font-size="8" fill="#666" font-family="${SERIF}" text-anchor="middle">${lines[li]}</text>`;
    }
  }

  // Rows
  for (let r = 0; r < nModels; r++) {
    const m = models[r];
    const key = configDirKey(m);
    const y = pad.t + r * cellH;
    const provColor = CONFIG.PROVIDER_COLORS[m.provider] || '#999';

    // Row label
    svg += `<circle cx="${pad.l - labelW}" cy="${y + cellH / 2}" r="4" fill="${provColor}"/>`;
    svg += `<text x="${pad.l - labelW + 10}" y="${y + cellH / 2 + 3}" font-size="9" fill="#333" font-family="${SERIF}">${esc(m.label)}</text>`;

    const regData = allRegs[key];
    const m3 = regData && regData.model3 && !regData.model3.error ? regData.model3 : null;
    const coefs = m3 ? m3.coefficients : {};
    const contrast = m3 ? (m3.contrast_flags || {}) : {};
    const mentionRates = traitData.mention_rates ? (traitData.mention_rates[key] || {}) : {};

    for (let c = 0; c < nCols; c++) {
      const col = cols[c];
      const x = pad.l + c * cellW;
      const cf = contrast[col.dimKey];
      const insuff = cf ? !cf.sufficient : true;
      const rate = mentionRates[col.rateDim] || 0;

      let est = null, se = null, p = null, sig = false, isDerived = false, available = false, isInterExcluded = false;

      if (col.type === 'neg') {
        // Negative-pole: β_mentioned
        const mc = coefs[col.mentionKey];
        if (mc) { est = mc.estimate; se = mc.se; p = mc.p; sig = mc.p < 0.05; available = true; }
      } else if (col.type === 'pos') {
        // Positive-pole: β_mentioned + β_interaction (or just β_mentioned if interaction excluded)
        const mc = coefs[col.mentionKey];
        const ic = coefs[col.interKey];
        if (mc && ic) {
          est = mc.estimate + ic.estimate;
          se = Math.sqrt(mc.se ** 2 + ic.se ** 2);
          const ci_lo = est - 1.96 * se, ci_hi = est + 1.96 * se;
          sig = ci_lo > 0 || ci_hi < 0;
          isDerived = true; available = true;
        } else if (mc) {
          // Interaction excluded → both poles share β_mentioned
          est = mc.estimate; se = mc.se; p = mc.p; sig = mc.p < 0.05;
          available = true; isInterExcluded = true;
        }
      } else {
        // Context: interaction coefficient
        const ic = coefs[col.interKey];
        if (ic) { est = ic.estimate; se = ic.se; p = ic.p; sig = ic.p < 0.05; available = true; }
      }

      // Background
      svg += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="white" stroke="#eee" stroke-width="0.5"/>`;

      if (!available || !m3) {
        svg += `<text x="${x + cellW / 2}" y="${y + cellH / 2 + 3}" font-size="7" fill="#ddd" font-family="${SERIF}" text-anchor="middle">—</text>`;
        continue;
      }

      const dotCx = x + cellW / 2;
      const dotCy = y + cellH / 2;
      const absEst = Math.min(Math.abs(est), maxCoef);
      const dotR = 3 + (absEst / maxCoef) * 10;
      const dotColor = est > 0 ? '#E53935' : '#2196F3';
      const opacity = sig ? 0.85 : 0.2;

      if (insuff) {
        svg += `<circle cx="${dotCx}" cy="${dotCy}" r="${Math.max(dotR, 4)}" fill="none" stroke="#ccc" stroke-width="1" stroke-dasharray="2,1"/>`;
      } else if (isInterExcluded) {
        svg += `<circle cx="${dotCx}" cy="${dotCy}" r="${dotR}" fill="${dotColor}" opacity="${opacity * 0.5}" stroke="${dotColor}" stroke-width="1" stroke-dasharray="2,1"/>`;
      } else {
        svg += `<circle cx="${dotCx}" cy="${dotCy}" r="${dotR}" fill="${dotColor}" opacity="${opacity}"/>`;
      }

      // Tooltip
      const pStr = p != null ? (p < 0.001 ? '&lt; .001' : p.toFixed(3)) : (sig ? 'CI excl. 0' : 'CI incl. 0');
      const derivStr = isDerived ? 'β<sub>mentioned</sub> + β<sub>interaction</sub>' : isInterExcluded ? 'β<sub>mentioned</sub> (interaction excluded)' : col.type === 'ctx' ? 'interaction coef' : 'β<sub>mentioned</sub>';
      const ttExtra = `β = ${est.toFixed(3)}<br>${derivStr}<br>p = ${pStr}<br>Mention rate: ${Math.round(rate * 100)}%${insuff ? '<br>⚠ Insufficient contrast' : ''}`;
      const ttLabel = col.type === 'ctx' ? `${col.dim}` : `${col.dim} → ${col.label.replace('\n', ' ')}`;
      svg += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="transparent" class="hit-target" data-label="${esc(m.label)}: ${esc(ttLabel)}" data-color="${provColor}" data-extra="${ttExtra}" style="cursor:default"/>`;
    }
  }

  // Grid border
  svg += `<rect x="${pad.l}" y="${pad.t}" width="${gridW}" height="${nModels * cellH}" fill="none" stroke="#999" stroke-width="1"/>`;

  // Provider group separators
  let prevProvider = '';
  for (let r = 0; r < nModels; r++) {
    if (r > 0 && models[r].provider !== prevProvider) {
      const y = pad.t + r * cellH;
      svg += `<line x1="${pad.l}" y1="${y}" x2="${pad.l + gridW}" y2="${y}" stroke="#999" stroke-width="1"/>`;
    }
    prevProvider = models[r].provider;
  }

  // Vertical separators between dimension groups (every 2 cols for B5)
  for (let i = 1; i < B5_COLS.length; i++) {
    const sx = pad.l + i * 2 * cellW;
    svg += `<line x1="${sx}" y1="${pad.t}" x2="${sx}" y2="${pad.t + nModels * cellH}" stroke="#e0e0e0" stroke-width="0.5"/>`;
  }
  // Stronger separator before context columns
  const sepX = pad.l + B5_COLS.length * 2 * cellW;
  svg += `<line x1="${sepX}" y1="${pad.t}" x2="${sepX}" y2="${pad.t + nModels * cellH}" stroke="#999" stroke-width="1"/>`;

  // Legend
  const legY = pad.t + nModels * cellH + 12;
  svg += `<circle cx="${pad.l + 8}" cy="${legY}" r="6" fill="#E53935" opacity="0.85"/>`;
  svg += `<text x="${pad.l + 18}" y="${legY + 4}" font-size="8" fill="#555" font-family="${SERIF}">More stay-home (β > 0)</text>`;
  svg += `<circle cx="${pad.l + 148}" cy="${legY}" r="6" fill="#2196F3" opacity="0.85"/>`;
  svg += `<text x="${pad.l + 158}" y="${legY + 4}" font-size="8" fill="#555" font-family="${SERIF}">Less stay-home (β < 0)</text>`;
  svg += `<circle cx="${pad.l + 288}" cy="${legY}" r="4" fill="#E53935" opacity="0.2"/>`;
  svg += `<text x="${pad.l + 298}" y="${legY + 4}" font-size="8" fill="#555" font-family="${SERIF}">Not Significant</text>`;
  svg += `<circle cx="${pad.l + 398}" cy="${legY}" r="4" fill="none" stroke="#ccc" stroke-dasharray="2,1"/>`;
  svg += `<text x="${pad.l + 408}" y="${legY + 4}" font-size="8" fill="#bbb" font-family="${SERIF}">Insufficient Contrast</text>`;
  svg += `<text x="${pad.l}" y="${legY + 18}" font-size="7" fill="#aaa" font-family="${SERIF}">Dot size ∝ |β|, capped at ±6. Negative-pole = β_mentioned; Positive-pole = β_mentioned + β_interaction (conservative). Context = interaction coefficient.</text>`;

  chartEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
  wireTooltips(chartEl);
}
