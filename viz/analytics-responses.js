'use strict';
// analytics-responses.js — Response Analysis tab (Figures 33-41)
// Extracted from analytics.js during refactor (March 2026)

// ============================================================
// RESPONSE ANALYSIS — Figures 33–41
// ============================================================

function initResponseAnalysisFigures() {
  if (raFigsRendered) return;
  raFigsRendered = true;
  const cb = Date.now();
  Promise.all([
    fetch('data/real/trait_mentions.json?_=' + cb).then(r => r.json()),
    fetch('data/real/verbosity_stats.json?_=' + cb).then(r => r.json()),
    fetch('data/real/response_text_similarity.json?_=' + cb).then(r => r.json()),
    fetch('data/real/response_persona_similarity.json?_=' + cb).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('data/real/response_diversity.json?_=' + cb).then(r => r.ok ? r.json() : null).catch(() => null),
    fetch('data/real/decision_drivers.json?_=' + cb).then(r => r.ok ? r.json() : null).catch(() => null),
  ]).then(([t, v, s, personaSim, diversity, drivers]) => {
    raTraitData = t;
    raVerbosityData = v;
    raTextSimData = s;

    // Fig 32: Trait Heatmap
    buildFilterPills('ra-heatmap-filters', 'raHeatmap', f => renderRATraitHeatmap(t, f));
    renderRATraitHeatmap(t);

    // Fig 35: Verbosity box
    buildFilterPills('ra-verbosity-filters', 'raVerbosity', f => renderRAVerbosityBox(v, f));
    renderRAVerbosityBox(v);

    // Fig 36: Verbosity by level (own filter)
    buildFilterPills('ra-verbosity-bl-filters', 'raVerbosityBL', f => renderRAVerbosityByLevel(v, f));
    renderRAVerbosityByLevel(v);

    // Fig 37: Rep Agreement
    buildFilterPills('ra-agreement-filters', 'raAgreement', f => renderRARepAgreement(s, f));
    renderRARepAgreement(s);

    // Fig 38: Text Similarity
    buildFilterPills('ra-textsim-filters', 'raTextsim', f => renderRATextSimilarity(s, f));
    renderRATextSimilarity(s);

    // Fig 40: Persona Individuation
    if (personaSim) {
      buildFilterPills('ra-persona-filters', 'raPersona', f => renderRAPersonaSimilarity(personaSim, s, 'ra-persona-sim-chart', f));
      renderRAPersonaSimilarity(personaSim, s);
      renderRAPersonaSimilarityAuthor(personaSim, s);  // Author Notes archive copy (no filter)
    }

    if (diversity)  renderRAReasoningDiversityAuthor(diversity);  // Author Notes only

    // Fig 40: Decision Drivers
    if (drivers) {
      buildFilterPills('ra-drivers-filters', 'raDrivers', f => renderRADecisionDrivers(drivers, f));
      renderRADecisionDrivers(drivers);
    }

    // Trait power + amplification figures need regression data
    loadAllRegressions(function(allRegs) {
      renderRATraitPowerCombined(t, allRegs);
      // renderRATraitPowerRange removed — Figure 33 was a duplicate of Cohort Fig 28
      renderRAModel3Table(allRegs, t);

      // Fig 34: Cross-Model Amplification
      buildFilterPills('ra-xmodel-filters', 'raXmodel', f => renderRACrossModelAmplification(allRegs, t, f));
      renderRACrossModelAmplification(allRegs, t);
      // Fig 34B: mention/trait ratio per LLM, panels per Big Five trait
      if (typeof renderRAMentionTraitRatio === 'function') {
        buildFilterPills('ra-mt-ratio-filters', 'raMtRatio', f => renderRAMentionTraitRatio(allRegs, 'ra-mt-ratio-chart', f));
        renderRAMentionTraitRatio(allRegs);
      }
      // Fig 34C: per-pole summary (12 rows aggregating across LLMs)
      if (typeof renderRAMentionAmpSummary === 'function') {
        renderRAMentionAmpSummary(allRegs);
      }
    });
  });
}

/* ── Figure 32 (dashboard) / Figure 16 (paper): Mention Rate Heatmap (10 Big Five poles + Infection + Age) ──
   Modes: 'overall' | 'yes' (stay-home only) | 'no' (go-out only) |
   'diff' (yes − no, diverging color). */
// `staticMode` (optional): when set to 'overall' | 'yes' | 'no' | 'diff', the
// renderer skips the interactive mode-toggle radios and renders that single
// mode. Used in paper.html where the figure must be static.
function renderRATraitHeatmap(data, modelFilter = null, elId = 'ra-fig33-chart', staticMode = null) {
  const el = document.getElementById(elId);
  if (!el) return;
  let configs = data.configs.slice();
  let labels = data.labels.slice();
  let providers = data.providers.slice();

  if (modelFilter) {
    const keep = configs.map((c, i) => i).filter(i => modelFilter.has(configs[i]));
    configs = keep.map(i => configs[i]);
    labels = keep.map(i => labels[i]);
    providers = keep.map(i => providers[i]);
  }

  // Column structure: 10 Big Five POLE columns (extraverted/introverted, etc.) + 2 context.
  // Same structure for ALL modes — overall, stay-home only, go-out only, diff.
  // Pole columns use within-group rates (e.g., "% of introverted-trait agents whose
  // response mentions any extraversion keyword"); context columns use marginal rates.
  const cols = [
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
    { key: 'infection',                    label: 'Infection',        label2: '',            synonyms: 'infection, infected, cases, diagnosed, N% (infection level)', source: 'dim' },
    { key: 'age',                          label: 'Age',              label2: '',            synonyms: 'years old, young, age, old, N (own age)', source: 'dim' },
  ];

  const nRows = configs.length;
  const cellW = 76, cellH = 22;
  const labelW = 160, topH = 120;
  const gapW = 8;  // visual gap before context columns

  // Lookup: rate(configKey, col, mode)
  function rateFor(cfg, col, mode) {
    const k = col.key;
    if (mode === 'diff') {
      const y = col.source === 'pole'
        ? (data.pole_rates_yes?.[cfg]?.[k] ?? 0)
        : (data.mention_rates_yes?.[cfg]?.[k] ?? 0);
      const n = col.source === 'pole'
        ? (data.pole_rates_no?.[cfg]?.[k] ?? 0)
        : (data.mention_rates_no?.[cfg]?.[k] ?? 0);
      return y - n;
    }
    if (mode === 'yes') {
      return col.source === 'pole'
        ? (data.pole_rates_yes?.[cfg]?.[k] ?? 0)
        : (data.mention_rates_yes?.[cfg]?.[k] ?? 0);
    }
    if (mode === 'no') {
      return col.source === 'pole'
        ? (data.pole_rates_no?.[cfg]?.[k] ?? 0)
        : (data.mention_rates_no?.[cfg]?.[k] ?? 0);
    }
    return col.source === 'pole'
      ? (data.pole_rates[cfg][k] ?? 0)
      : (data.mention_rates[cfg][k] ?? 0);
  }

  function build(mode) {
    const nBigFiveCols = 10;
    const nCols = cols.length;
    const pad = { l: labelW + 10, t: topH, r: 30, b: 60 };
    const W = pad.l + nBigFiveCols * cellW + gapW + 2 * cellW + pad.r;
    // Reserve room for a Median summary row at the bottom (separated from
    // the per-LLM rows by a small gap and a divider line).
    const summaryGap = 8;
    const summaryH = cellH;
    const H = pad.t + nRows * cellH + summaryGap + summaryH + pad.b;

    function colX(c) {
      if (c < nBigFiveCols) return pad.l + c * cellW;
      return pad.l + nBigFiveCols * cellW + gapW + (c - nBigFiveCols) * cellW;
    }

    let svg = '';

    // Big Five group brackets (one per dimension, spans the pole pair).
    const dimNames = ['Extraversion', 'Agreeableness', 'Conscientiousness', 'Neuroticism', 'Openness'];
    for (let d = 0; d < 5; d++) {
      const x1 = colX(d * 2);
      const x2 = x1 + 2 * cellW;
      const cx = (x1 + x2) / 2;
      svg += `<text x="${cx}" y="${pad.t - 92}" font-size="10" fill="#333" font-family="${SERIF}" text-anchor="middle" font-weight="bold">${dimNames[d]}</text>`;
      svg += `<line x1="${x1 + 4}" y1="${pad.t - 86}" x2="${x2 - 4}" y2="${pad.t - 86}" stroke="#bbb" stroke-width="1"/>`;
    }
    // Infection and Age sit at the same top-line tier as the Big Five group
    // labels — they're top-level categories, not a subordinate group. Each
    // gets a bold label + a short grey bracket beneath it (parallel to the
    // Big Five group brackets). The column-header tier below is suppressed
    // for these so the label only appears once.
    for (let c = nBigFiveCols; c < nCols; c++) {
      const x1 = colX(c);
      const cx = x1 + cellW / 2;
      svg += `<text x="${cx}" y="${pad.t - 92}" font-size="10" fill="#333" font-family="${SERIF}" text-anchor="middle" font-weight="bold">${esc(cols[c].label)}</text>`;
      svg += `<line x1="${x1 + 4}" y1="${pad.t - 86}" x2="${x1 + cellW - 4}" y2="${pad.t - 86}" stroke="#bbb" stroke-width="1"/>`;
    }

    // Column headers (Big Five only — Infection/Age are labeled above)
    for (let c = 0; c < nCols; c++) {
      const x = colX(c) + cellW / 2;
      const col = cols[c];
      if (c >= nBigFiveCols) {
        // Skip duplicate label; only render synonyms below.
      } else if (col.label2) {
        svg += `<text x="${x}" y="${pad.t - 76}" font-size="9.5" fill="#333" font-family="${SERIF}" text-anchor="middle" font-style="italic">${esc(col.label)}</text>`;
        svg += `<text x="${x}" y="${pad.t - 65}" font-size="9.5" fill="#333" font-family="${SERIF}" text-anchor="middle" font-style="italic">${esc(col.label2)}</text>`;
      } else {
        svg += `<text x="${x}" y="${pad.t - 70}" font-size="9.5" fill="#333" font-family="${SERIF}" text-anchor="middle" font-style="italic">${esc(col.label)}</text>`;
      }
      const synLines = col.synonyms.split(', ');
      for (let sl = 0; sl < synLines.length; sl++) {
        svg += `<text x="${x}" y="${pad.t - 50 + sl * 9}" font-size="7" fill="#999" font-family="${SERIF}" text-anchor="middle">${esc(synLines[sl])}</text>`;
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
        const col = cols[c];
        const rate = rateFor(configs[r], col, mode);

        let fill, textColor, display;
        if (mode === 'diff') {
          // Diverging red (stay-home) / blue (go-out); saturate at |0.5|.
          const t = Math.max(-1, Math.min(1, rate * 2));
          if (t > 0) fill = `rgba(229, 57, 53, ${Math.min(1, Math.abs(t))})`;
          else fill = `rgba(33, 150, 243, ${Math.min(1, Math.abs(t))})`;
          textColor = Math.abs(t) > 0.55 ? '#fff' : '#333';
          const pct = Math.round(rate * 100);
          display = (pct >= 0 ? '+' : '') + pct + ' pp';
        } else {
          const intensity = Math.min(Math.max(rate, 0), 1);
          const rr = Math.round(255 - intensity * 200);
          const gg = Math.round(255 - intensity * 180);
          const bb = Math.round(255 - intensity * 60);
          fill = `rgb(${rr},${gg},${bb})`;
          textColor = intensity > 0.6 ? '#fff' : '#333';
          display = Math.round(rate * 100) + '%';
        }
        // Gate emphasis (overall mode only): dim cells whose mention rate falls
        // outside the [15%, 85%] inclusion window for the mention-flag logit
        // in Figure 17. In-gate cells render at full opacity.
        const inGate = rate >= 0.15 && rate <= 0.85;
        const textOpacity = (mode === 'overall' && !inGate) ? '0.45' : '1';
        svg += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="${fill}" stroke="#eee" stroke-width="0.5"/>`;
        svg += `<text x="${x + cellW / 2}" y="${y + cellH / 2 + 4}" font-size="10" fill="${textColor}" font-family="${SERIF}" opacity="${textOpacity}" text-anchor="middle">${display}</text>`;
      }
    }

    // ── Median summary row ──
    // Aggregates each column across all 21 LLMs. Sits below the per-LLM rows
    // with a small gap so it reads as summary, not as another row.
    const medianY = pad.t + nRows * cellH + summaryGap;
    function medianOf(arr) {
      const s = arr.slice().sort((a, b) => a - b);
      if (s.length === 0) return 0;
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    // Faint divider line above the median row
    svg += `<line x1="${pad.l - 8}" y1="${medianY - summaryGap / 2}" x2="${colX(nCols - 1) + cellW}" y2="${medianY - summaryGap / 2}" stroke="#bbb" stroke-width="0.7"/>`;
    // Row label
    svg += `<text x="${pad.l - labelW + 10}" y="${medianY + summaryH / 2 + 4}" font-size="10" font-weight="bold" fill="#333" font-family="${SERIF}">Median</text>`;
    // Cells
    for (let c = 0; c < nCols; c++) {
      const x = colX(c);
      const col = cols[c];
      const colVals = configs.map(cfg => rateFor(cfg, col, mode));
      const med = medianOf(colVals);
      let fill, textColor, display;
      if (mode === 'diff') {
        const t = Math.max(-1, Math.min(1, med * 2));
        if (t > 0) fill = `rgba(229, 57, 53, ${Math.min(1, Math.abs(t))})`;
        else fill = `rgba(33, 150, 243, ${Math.min(1, Math.abs(t))})`;
        textColor = Math.abs(t) > 0.55 ? '#fff' : '#333';
        const pct = Math.round(med * 100);
        display = (pct >= 0 ? '+' : '') + pct + ' pp';
      } else {
        const intensity = Math.min(Math.max(med, 0), 1);
        const rr = Math.round(255 - intensity * 200);
        const gg = Math.round(255 - intensity * 180);
        const bb = Math.round(255 - intensity * 60);
        fill = `rgb(${rr},${gg},${bb})`;
        textColor = intensity > 0.6 ? '#fff' : '#333';
        display = Math.round(med * 100) + '%';
      }
      svg += `<rect x="${x}" y="${medianY}" width="${cellW}" height="${summaryH}" fill="${fill}" stroke="#bbb" stroke-width="0.7"/>`;
      svg += `<text x="${x + cellW / 2}" y="${medianY + summaryH / 2 + 4}" font-size="10" font-weight="bold" fill="${textColor}" font-family="${SERIF}" text-anchor="middle">${display}</text>`;
    }

    // Grid borders + dividers — extended to wrap the median row too
    const gridH = nRows * cellH + summaryGap + summaryH;
    svg += `<rect x="${pad.l}" y="${pad.t}" width="${nBigFiveCols * cellW}" height="${gridH}" fill="none" stroke="#999" stroke-width="1"/>`;
    svg += `<rect x="${colX(nBigFiveCols)}" y="${pad.t}" width="${2 * cellW}" height="${gridH}" fill="none" stroke="#999" stroke-width="1"/>`;
    // Vertical dividers between Big Five dimension pairs
    for (let d = 1; d < 5; d++) {
      const x = colX(d * 2);
      svg += `<line x1="${x}" y1="${pad.t}" x2="${x}" y2="${pad.t + gridH}" stroke="#999" stroke-width="1"/>`;
    }
    // Vertical divider between Infection and Age
    const divX = colX(nBigFiveCols + 1);
    svg += `<line x1="${divX}" y1="${pad.t}" x2="${divX}" y2="${pad.t + gridH}" stroke="#ddd" stroke-width="0.5"/>`;

    // Color-scale legend at the bottom
    const legW = 220, legH = 10;
    const legX = pad.l + ((nBigFiveCols * cellW + gapW + 2 * cellW) - legW) / 2;
    const legY = pad.t + nRows * cellH + summaryGap + summaryH + 22;
    const nSteps = 60;
    if (mode === 'diff') {
      // Diverging blue → white → red, range −50% to +50%
      for (let s = 0; s < nSteps; s++) {
        const t = s / (nSteps - 1) * 2 - 1;  // −1 .. +1
        const a = Math.min(1, Math.abs(t));
        const fillCol = t > 0 ? `rgba(229, 57, 53, ${a})` : `rgba(33, 150, 243, ${a})`;
        svg += `<rect x="${(legX + s * legW / nSteps).toFixed(2)}" y="${legY}" width="${(legW / nSteps + 0.5).toFixed(2)}" height="${legH}" fill="${fillCol}"/>`;
      }
      svg += `<rect x="${legX}" y="${legY}" width="${legW}" height="${legH}" fill="none" stroke="#ccc" stroke-width="0.5"/>`;
      svg += `<text x="${legX}"          y="${legY + legH + 11}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="start">&minus;50 pp</text>`;
      svg += `<text x="${legX + legW/2}" y="${legY + legH + 11}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="middle">0</text>`;
      svg += `<text x="${legX + legW}"   y="${legY + legH + 11}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="end">+50 pp</text>`;
      svg += `<text x="${legX + legW/2}" y="${legY + legH + 24}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="middle" font-style="italic">stay-home rate &minus; go-out rate (red = more in stay-home)</text>`;
    } else {
      // Sequential white → blue (matches the cell fill for overall/yes/no)
      for (let s = 0; s < nSteps; s++) {
        const intensity = s / (nSteps - 1);
        const rr = Math.round(255 - intensity * 200);
        const gg = Math.round(255 - intensity * 180);
        const bb = Math.round(255 - intensity * 60);
        svg += `<rect x="${(legX + s * legW / nSteps).toFixed(2)}" y="${legY}" width="${(legW / nSteps + 0.5).toFixed(2)}" height="${legH}" fill="rgb(${rr},${gg},${bb})"/>`;
      }
      svg += `<rect x="${legX}" y="${legY}" width="${legW}" height="${legH}" fill="none" stroke="#ccc" stroke-width="0.5"/>`;
      svg += `<text x="${legX}"          y="${legY + legH + 11}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="start">0%</text>`;
      svg += `<text x="${legX + legW/2}" y="${legY + legH + 11}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="middle">50%</text>`;
      svg += `<text x="${legX + legW}"   y="${legY + legH + 11}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="end">100%</text>`;
      svg += `<text x="${legX + legW/2}" y="${legY + legH + 24}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="middle" font-style="italic">% of responses that mention each topic</text>`;
    }

    return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
  }

  function subtitleHTML(mode) {
    const baseStyle = `font-size:10px;font-style:italic;color:#777;font-family:${SERIF};margin-bottom:8px`;
    if (mode === 'diff') {
      // Gradient bar replaces text subtitle — most informative for the reader.
      return `<div style="display:flex;align-items:center;gap:8px;${baseStyle}">
        <span style="font-style:normal;color:#555">Difference: stay-home − go-out</span>
        <span>−50%</span>
        <div style="width:140px;height:10px;background:linear-gradient(to right, rgb(33,150,243), white, rgb(229,57,53));border:1px solid #ccc"></div>
        <span>+50%</span>
        <span>(red = more in stay-home reasoning)</span>
      </div>`;
    }
    let text;
    if (mode === 'yes')      text = 'Among responses that decided stay-home: % that mention each topic';
    else if (mode === 'no')  text = 'Among responses that decided go-out: % that mention each topic';
    else                     text = '% of all responses that mention each topic';
    return `<div style="${baseStyle}">${text}</div>`;
  }

  function draw(mode) {
    if (staticMode) {
      // No mode-toggle radios and no subtitle — the paper figure caption
      // explains what the cells show.
      el.innerHTML = build(mode);
      return;
    }
    el.innerHTML = `<div style="margin-bottom:6px">
      <label style="font-size:11px;margin-right:10px"><input type="radio" name="trait-heatmap-mode" value="overall" ${mode==='overall'?'checked':''}> Overall</label>
      <label style="font-size:11px;margin-right:10px"><input type="radio" name="trait-heatmap-mode" value="yes" ${mode==='yes'?'checked':''}> Stay-home only</label>
      <label style="font-size:11px;margin-right:10px"><input type="radio" name="trait-heatmap-mode" value="no" ${mode==='no'?'checked':''}> Go-out only</label>
      <label style="font-size:11px;margin-right:10px"><input type="radio" name="trait-heatmap-mode" value="diff" ${mode==='diff'?'checked':''}> Δ (stay − go)</label>
    </div>
    ${subtitleHTML(mode)}
    ${build(mode)}`;
    el.querySelectorAll('input[name="trait-heatmap-mode"]').forEach(r =>
      r.addEventListener('change', e => draw(e.target.value)));
  }
  draw(staticMode || 'overall');
}

/* ── Figure 35: Output Token Landscape (box plots) ─────────── */
function renderRAVerbosityBox(data, modelFilter = null, elId = 'ra-fig34-chart') {
  const el = document.getElementById(elId);
  if (!el) return;
  let configs = data.configs.slice();
  let labels = data.labels.slice();
  let providers = data.providers.slice();

  if (modelFilter) {
    const keep = configs.map((c, i) => i).filter(i => modelFilter.has(configs[i]));
    configs = keep.map(i => configs[i]);
    labels = keep.map(i => labels[i]);
    providers = keep.map(i => providers[i]);
  }

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
function renderRAVerbosityByLevel(data, modelFilter = null, elId = 'ra-fig35-chart') {
  const el = document.getElementById(elId);
  if (!el) return;
  let configs = data.configs.slice();
  let labels = data.labels.slice();
  let providers = data.providers.slice();

  if (modelFilter) {
    const keep = configs.map((c, i) => i).filter(i => modelFilter.has(configs[i]));
    configs = keep.map(i => configs[i]);
    labels = keep.map(i => labels[i]);
    providers = keep.map(i => providers[i]);
  }

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

  // X axis labels — integer %-points plus the critical 4% and 7% markers.
  // Use nearest available infection level for each target %.
  function nearestLevel(target) {
    let best = allLevels[0], bd = Infinity;
    for (const lv of allLevels) {
      const d = Math.abs(lv - target);
      if (d < bd) { bd = d; best = lv; }
    }
    return best;
  }
  // 0.5% increments up to 4%, then 1% increments to 7% (narrower sampling in
  // the low-infection region where behavior changes fastest).
  const tickTargets = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 7];
  const tickLevels = Array.from(new Set(tickTargets.map(nearestLevel))).sort((a, b) => a - b);
  for (const lv of tickLevels) {
    const x = xScale(lv);
    svg += `<line x1="${x}" y1="${pad.t + plotH}" x2="${x}" y2="${pad.t + plotH + 4}" stroke="#bbb" stroke-width="0.5"/>`;
    svg += `<text x="${x}" y="${pad.t + plotH + 16}" font-size="9" fill="#999" font-family="${SERIF}" text-anchor="middle">${lv.toFixed(1)}%</text>`;
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
    // Hover dots with tooltips (invisible but large hit target)
    for (let i = 0; i < lvKeys.length; i++) {
      const lv = parseFloat(lvKeys[i]);
      const v = byLevel[lvKeys[i]];
      const x = xScale(lv);
      const y = yScale(v.mean_output);
      const tt = `${esc(labels[ci])} @ ${lv.toFixed(1)}% infection<br>Mean output: ${Math.round(v.mean_output)} tokens`;
      svg += `<circle cx="${x}" cy="${y}" r="7" fill="${provColor}" opacity="0" class="hit-target" data-label="${esc(labels[ci])}" data-color="${provColor}" data-extra="${tt}" style="cursor:default"/>`;
    }

    // Legend entry — colored to match line
    const legX = pad.l + plotW + 10;
    const legY = pad.t + ci * 16;
    svg += `<line x1="${legX}" y1="${legY}" x2="${legX + 14}" y2="${legY}" stroke="${provColor}" stroke-width="1.5" opacity="${opacity}"/>`;
    svg += `<text x="${legX + 18}" y="${legY + 3}" font-size="8" fill="${provColor}" font-family="${SERIF}">${labels[ci]}</text>`;
  }

  // Axes
  svg += `<line x1="${pad.l}" y1="${pad.t}" x2="${pad.l}" y2="${pad.t + plotH}" stroke="#ccc" stroke-width="1"/>`;
  svg += `<line x1="${pad.l}" y1="${pad.t + plotH}" x2="${pad.l + plotW}" y2="${pad.t + plotH}" stroke="#ccc" stroke-width="1"/>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
  wireTooltips(el);
}

/* ── Figure 37: Rep-to-Rep Decision Agreement ──────────────── */
function renderRARepAgreement(data, modelFilter = null, elId = 'ra-fig37-chart') {
  const el = document.getElementById(elId);
  if (!el) return;

  // Sort by agreement rate (descending)
  let items = data.configs.map((cfg, i) => ({
    cfg, label: data.labels[i], provider: data.providers[i],
    temp: data.temperature[i], agreement: data.decision_agreement[cfg]
  }));
  if (modelFilter) items = items.filter(item => modelFilter.has(item.cfg));
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
function renderRATextSimilarity(data, modelFilter = null, elId = 'ra-fig38-chart') {
  const el = document.getElementById(elId);
  if (!el) return;

  let items = data.configs.map((cfg, i) => ({
    cfg, label: data.labels[i], provider: data.providers[i],
    temp: data.temperature[i],
    exactMatch: data.exact_text_match[cfg],
    jaccard: data.mean_jaccard[cfg],
    agreement: data.decision_agreement[cfg],
  }));
  if (modelFilter) items = items.filter(item => modelFilter.has(item.cfg));
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

    const tempTag = item.temp === '0' ? '' : ' \u2738';
    svg += `<circle cx="${pad.l - labelW}" cy="${cy}" r="3" fill="${provColor}"/>`;
    svg += `<text x="${pad.l - labelW + 9}" y="${cy + 3}" font-size="9" fill="#333" font-family="${SERIF}">${item.label}${tempTag}</text>`;

    const xExact = xScale(item.exactMatch);
    const xJac   = xScale(item.jaccard);
    svg += `<line x1="${Math.min(xExact, xJac)}" y1="${cy}" x2="${Math.max(xExact, xJac)}" y2="${cy}" stroke="#ddd" stroke-width="1"/>`;
    svg += `<circle cx="${xExact}" cy="${cy}" r="4" fill="#8B5CF6" opacity="0.8" class="hit-target" data-label="${esc(item.label)}" data-color="#8B5CF6" data-extra="Exact match: ${(item.exactMatch*100).toFixed(1)}%" style="cursor:default"/>`;
    svg += `<circle cx="${xJac}"   cy="${cy}" r="4" fill="#F97316" opacity="0.8" class="hit-target" data-label="${esc(item.label)}" data-color="#F97316" data-extra="Jaccard: ${(item.jaccard*100).toFixed(1)}%" style="cursor:default"/>`;
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

/* ── Figure 33: Random-Effects Logit with Mention Flags Table ────────── */
// renderModel3Coef renders one model's mention-flag regression coefficient
// table into a target element. Used both by the interactive Figure 33 (with
// model picker) and by Appendix B.2 (21 static per-model panels).
function renderModel3Coef(allRegs, traitData, m, targetEl) {
  if (!targetEl) return;

  const fmtC = v => v == null ? '—' : v.toFixed(3);
  const fmtOR = v => {
    if (v == null) return '—';
    if (v > 1e6) return '> 10⁶';
    if (v < 1e-6) return '< 10⁻⁶';
    return v.toFixed(3);
  };
  const fmtCI = c => {
    if (!c) return '—';
    const lo = c.estimate - 1.96 * c.se, hi = c.estimate + 1.96 * c.se;
    return `[${lo.toFixed(3)}, ${hi.toFixed(3)}]`;
  };

  // Predictor rows grouped into 2 sections
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
  // 10 Big Five poles + 2 context. fig32Key lets us look up the within-group
  // rate that gated inclusion (from trait_mentions.json pole_rates).
  const MENTION = [
    { key: 'mentioned_extroverted',     label: 'Mentioned Extroverted',     fig32Key: 'extraversion_positive'   },
    { key: 'mentioned_introverted',     label: 'Mentioned Introverted',     fig32Key: 'extraversion_negative'   },
    { key: 'mentioned_agreeable',       label: 'Mentioned Agreeable',       fig32Key: 'agreeableness_positive'  },
    { key: 'mentioned_antagonistic',    label: 'Mentioned Antagonistic',    fig32Key: 'agreeableness_negative'  },
    { key: 'mentioned_conscientious',   label: 'Mentioned Conscientious',   fig32Key: 'conscientiousness_positive' },
    { key: 'mentioned_unconscientious', label: 'Mentioned Unconscientious', fig32Key: 'conscientiousness_negative' },
    { key: 'mentioned_neurotic',        label: 'Mentioned Neurotic',        fig32Key: 'neuroticism_positive'    },
    { key: 'mentioned_emot_stable',     label: 'Mentioned Emotionally Stable', fig32Key: 'neuroticism_negative' },
    { key: 'mentioned_open',            label: 'Mentioned Open to Experience', fig32Key: 'openness_positive'    },
    { key: 'mentioned_closed',          label: 'Mentioned Closed to Experience', fig32Key: 'openness_negative'  },
    { key: 'mentioned_infection',       label: 'Mentioned Infection',       fig32Key: null, dimKey: 'infection' },
    { key: 'mentioned_age',             label: 'Mentioned Age',             fig32Key: null, dimKey: 'age' },
  ];

  const key = configDirKey(m);
  const regData = allRegs[key];
  if (!regData || !regData.model3 || regData.model3.error) {
    targetEl.innerHTML = '<p style="color:#999;font-style:italic">Mention-flag regression not available for this configuration.</p>';
    return;
  }

  {
    const m3 = regData.model3;
    const coefs = m3.coefficients;
    const poleFlags = m3.pole_flags || {};
    const contextFlags = m3.context_flags || {};
    const poleRates = (traitData.pole_rates && traitData.pole_rates[key]) || {};
    const mentionRates = traitData.mention_rates ? (traitData.mention_rates[key] || {}) : {};

    let html = '';
    html += '<div style="font-size:13px;font-weight:bold;color:#111;margin-bottom:6px">' + esc(m.label) + '</div>';

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

    // Section: Mention flags — pole-level (10 poles) + 2 context.
    // "Rate" shown is the Fig-32 within-group rate that gated inclusion.
    html += '<tr><td colspan="7" style="padding:10px 6px 2px;font-size:10px;color:#666;font-style:italic;border-bottom:1px solid #ddd">Mention Flags (rate from Figure ' + (document.querySelector('#section-appendices')?16:32) + '; only included when between 15% and 85%)</td></tr>';
    rowIdx = 0;
    MENTION.forEach(p => {
      let rate = '';
      let sufficient = null;
      if (p.fig32Key) {
        const r = poleRates[p.fig32Key];
        if (r != null) rate = (r * 100).toFixed(1) + '%';
        sufficient = r != null && r >= 0.15 && r <= 0.85;
      } else if (p.dimKey) {
        const r = mentionRates[p.dimKey];
        if (r != null) rate = (r * 100).toFixed(1) + '%';
        sufficient = r != null && r >= 0.15 && r <= 0.85;
      }
      const c = coefs[p.key];
      if (c) {
        addRow(p.label, c, rate);
      } else {
        const bg = rowIdx % 2 === 0 ? '#fafafa' : '#fff';
        html += '<tr style="background:' + bg + '">';
        html += '<td style="font-weight:600;padding:3px 6px;color:#bbb">' + p.label + '</td>';
        html += '<td colspan="5" style="text-align:center;padding:3px 6px;color:#c77;font-size:10px">';
        html += 'Excluded — ' + (rate || 'rate n/a') + ' (outside 15–85% window)';
        html += '</td>';
        html += '<td style="text-align:right;padding:3px 6px;font-size:10px;color:#888">' + rate + '</td></tr>';
        rowIdx++;
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

    // Contrast flag summary — pole-level
    html += '<div style="margin-top:8px;padding:8px 12px;background:#fff8f0;border:1px solid #f0d0a0;border-radius:4px;font-size:11px">';
    html += '<strong>Inclusion gate (Figure ' + (document.querySelector('#section-appendices')?16:32) + ' mention rates).</strong> ';
    html += 'A mention flag enters only when its Figure ' + (document.querySelector('#section-appendices')?16:32) + ' rate is between 15% and 85%. ';
    html += 'Below 15% almost no responses mention it; above 85% nearly all of them do — either way there is no usable variation.';
    html += '<div style="margin-top:4px;display:grid;grid-template-columns:repeat(auto-fill, minmax(220px, 1fr));gap:4px 12px">';
    MENTION.forEach(p => {
      let rate = null, ok = false;
      if (p.fig32Key) {
        const r = poleRates[p.fig32Key];
        if (r != null) { rate = r * 100; ok = r >= 0.15 && r <= 0.85; }
      } else if (p.dimKey) {
        const r = mentionRates[p.dimKey];
        if (r != null) { rate = r * 100; ok = r >= 0.15 && r <= 0.85; }
      }
      if (rate == null) return;
      html += '<span style="color:' + (ok ? '#4a4' : '#c44') + '">';
      html += (ok ? '✓' : '✗') + ' ' + p.label.replace('Mentioned ', '') + ': ' + rate.toFixed(1) + '%';
      html += '</span>';
    });
    html += '</div></div>';

    targetEl.innerHTML = html;
  }
}

// Interactive Figure 33 — wraps renderModel3Coef with a model picker.
function renderRAModel3Table(allRegs, traitData) {
  const pickerEl = document.getElementById('ra-m3table-picker');
  const chartEl = document.getElementById('ra-m3table-chart');
  if (!chartEl) return;
  let currentIdx = 0;
  const draw = idx => renderModel3Coef(allRegs, traitData, CONFIG.MODELS[idx], chartEl);
  if (pickerEl) {
    buildModelPicker('ra-m3table-picker', currentIdx, idx => { currentIdx = idx; draw(idx); });
  }
  draw(currentIdx);
}

/* ── Figure 35: Cross-Model Pole Positions (4 markers per model per dim) ── */
/* For each of the 5 Big Five dimensions, a panel shows one row per model
   with up to 4 markers measured in log-odds relative to the reference agent:
     ○ low-pole agent, no mention           (position = 0)
     ● low-pole agent, mentioned low pole  (position = β_mention_low)
     △ high-pole agent, no mention         (position = β_trait)
     ▲ high-pole agent, mentioned high pole (position = β_trait + β_mention_high)
   Rows where neither pole mention flag was included (both failed the
   Fig-32 15–85% gate) are omitted from the panel. Filled markers are
   omitted individually when their pole's mention flag is not in the model. */
function renderRACrossModelAmplification(allRegs, traitData, modelFilter = null, elId = 'ra-xmodel-chart') {
  const chartEl = document.getElementById(elId);
  if (!chartEl) return;

  const PANELS = [
    { type: 'b5', dim: 'Extraversion',        traitKey: 'extraverted',   lowLabel: 'Introverted',     highLabel: 'Extraverted',
      lowMention:  'mentioned_introverted',    highMention: 'mentioned_extroverted' },
    { type: 'b5', dim: 'Agreeableness',       traitKey: 'agreeable',     lowLabel: 'Antagonistic',    highLabel: 'Agreeable',
      lowMention:  'mentioned_antagonistic',   highMention: 'mentioned_agreeable' },
    { type: 'b5', dim: 'Conscientiousness',   traitKey: 'conscientious', lowLabel: 'Unconscientious', highLabel: 'Conscientious',
      lowMention:  'mentioned_unconscientious',highMention: 'mentioned_conscientious' },
    { type: 'b5', dim: 'Emotional Stability', traitKey: 'emot_stable',   lowLabel: 'Neurotic',        highLabel: 'Emot. Stable',
      lowMention:  'mentioned_neurotic',       highMention: 'mentioned_emot_stable' },
    { type: 'b5', dim: 'Openness',            traitKey: 'open_to_exp',   lowLabel: 'Closed',          highLabel: 'Open',
      lowMention:  'mentioned_closed',         highMention: 'mentioned_open' },
    // Context panels — continuous trait, no pole dichotomy. Single plot area,
    // 2 ratio columns: β Mentioned / Infection and β Trait / Infection.
    { type: 'ctx', dim: 'Infection',
      mentionKey: 'mentioned_infection',
      // Trait numerator = max-min of (β_inf·lv + β_inf_sq·lv²) over 0..7%.
      // This equals the infection range itself → ratio will be 1.0× always.
      // Skipping the denom-matches-numerator column to avoid trivial output.
      traitSpan: config => {
        const c = allRegs[config.key].model3.coefficients;
        const b1 = c.infection_pct ? c.infection_pct.estimate : 0;
        const b2 = c.infection_pct_sq ? c.infection_pct_sq.estimate : 0;
        let mn = Infinity, mx = -Infinity;
        for (let lv = 0; lv <= 7; lv++) {
          const lo = b1 * lv + b2 * lv * lv;
          if (lo < mn) mn = lo;
          if (lo > mx) mx = lo;
        }
        return mx - mn;
      },
      traitLabel: 'Infection range' },
    { type: 'ctx', dim: 'Age',
      mentionKey: 'mentioned_age',
      // Trait numerator = β_age · 47 (log-odds swing from age 18 to 65)
      traitSpan: config => {
        const c = allRegs[config.key].model3.coefficients;
        return c.age ? c.age.estimate * 47 : 0;
      },
      traitLabel: 'Age 18→65' },
  ];

  // Collect all configs with a valid Model 3 fit
  const configs = [];
  const seen = new Set();
  CONFIG.MODELS.forEach(m => {
    const key = configDirKey(m);
    if (seen.has(key)) return;
    seen.add(key);
    if (modelFilter && !modelFilter.has(key)) return;
    const reg = allRegs[key];
    if (reg && reg.model3 && !reg.model3.error && reg.model3.coefficients) {
      configs.push({ key, label: m.label, provider: m.provider,
        color: CONFIG.PROVIDER_COLORS[m.provider] || '#999' });
    }
  });
  if (configs.length === 0) {
    chartEl.innerHTML = '<div style="color:#999;padding:20px">No Model 3 data available.</div>';
    return;
  }

  // Compute positions for a given panel (relative to reference agent)
  function positions(coefs, panel, config) {
    if (panel.type === 'ctx') {
      const bM = coefs[panel.mentionKey];
      if (!bM) return null;  // mention excluded → skip row entirely
      return {
        type: 'ctx',
        mention: bM.estimate,
        pMention: bM.p,
        traitSpan: panel.traitSpan(config),
      };
    }
    const bT = coefs[panel.traitKey];
    if (!bT) return null;
    const bLow  = coefs[panel.lowMention];   // β_mention_low
    const bHigh = coefs[panel.highMention];  // β_mention_high
    if (!bLow && !bHigh) return null;        // no mention signal for this dim → skip row
    return {
      type: 'b5',
      lowNo:  0,
      lowYes: bLow  ? bLow.estimate  : null,
      hiNo:   bT.estimate,
      hiYes:  bHigh ? bT.estimate + bHigh.estimate : null,
      betaTrait: bT.estimate,
      betaLow:   bLow  ? bLow.estimate  : null,
      betaHigh:  bHigh ? bHigh.estimate : null,
      pLow:      bLow  ? bLow.p  : null,
      pHigh:     bHigh ? bHigh.p : null,
    };
  }

  // Pre-compute per-panel row set.
  //   B5 panels: include any config with at least one mention coefficient.
  //   Ctx panels: include only configs whose mention coef is significant (p<0.05),
  //     per the spec "don't include if not significant". This avoids blank rows.
  const panelRows = PANELS.map(panel => {
    return configs
      .map(c => ({ c, pos: positions(allRegs[c.key].model3.coefficients, panel, c) }))
      .filter(r => {
        if (r.pos === null) return false;
        if (r.pos.type === 'ctx') return r.pos.pMention != null && r.pos.pMention < 0.05;
        return true;
      });
  });

  // Auto-scale x-axis: symmetric around 0, pulled from all positions across panels
  let absMax = 0;
  panelRows.forEach(rows => {
    rows.forEach(({ pos }) => {
      const vals = pos.type === 'ctx'
        ? [0, pos.mention]
        : [pos.lowNo, pos.lowYes, pos.hiNo, pos.hiYes];
      vals.forEach(v => {
        if (v != null && isFinite(v)) absMax = Math.max(absMax, Math.abs(v));
      });
    });
  });
  absMax = Math.max(1, absMax * 1.1);
  const gMin = -absMax, gMax = absMax;

  // Layout — two side-by-side sub-panels per dim (low-pole | high-pole).
  // No right-side ratio column: trait-magnitude is already covered in §5.2.1
  // (Fig 12/13), and the companion magnitude figure that previously anchored
  // its ratio here was dropped from the paper.
  const W = Math.min(chartEl.parentElement?.offsetWidth || 980, 980);
  const rowH = 14;
  const labelW = 150;
  const panelPad = { t: 40, b: 40, l: labelW + 10, r: 24 };
  const subGap = 30;  // gap between low/high sub-panels
  const subPlotW = (W - panelPad.l - panelPad.r - subGap) / 2;
  const panelGap = 24;

  // Each panel's own inner height depends on how many rows it has (plus provider gaps)
  const gapProv = 5;
  function providerGapCount(rows) {
    let prev = '', gaps = 0;
    rows.forEach(r => { if (prev && r.c.provider !== prev) gaps++; prev = r.c.provider; });
    return gaps;
  }
  const panelSizes = panelRows.map(rows => rows.length * rowH + providerGapCount(rows) * gapProv);
  const panelHs = panelSizes.map(s => panelPad.t + s + panelPad.b);
  const headerLegendH = 8;
  const totalH = headerLegendH + panelHs.reduce((a, b) => a + b + panelGap, 0) - panelGap + 16;

  // Each sub-panel has its own local X scale (same value range, different origin x)
  function xScaleLow(v)  { return panelPad.l + ((v - gMin) / (gMax - gMin)) * subPlotW; }
  function xScaleHigh(v) { return panelPad.l + subPlotW + subGap + ((v - gMin) / (gMax - gMin)) * subPlotW; }
  // Full-width scale used by ctx panels (continuous predictors, no pole split).
  const ctxPlotW = subPlotW * 2 + subGap;
  function xScaleCtx(v) { return panelPad.l + ((v - gMin) / (gMax - gMin)) * ctxPlotW; }
  const clampV = v => Math.max(gMin, Math.min(gMax, v));
  const range = gMax - gMin;
  const step = range > 20 ? 5 : range > 10 ? 2 : range > 4 ? 1 : 0.5;
  const gridStart = Math.ceil(gMin / step) * step;
  function loToProb(lo) { return 1 / (1 + Math.exp(-lo)); }
  function fmtProb(p) {
    if (p < 0.005) return '<1%';
    if (p > 0.995) return '>99%';
    if (p > 0.095 && p < 0.995) return Math.round(p * 100) + '%';
    return (p * 100).toFixed(1) + '%';
  }

  let svg = '';

  // No in-figure legend — marker / position semantics are described in the
  // figure caption (paper) and dashboard accompanying text. Keeping the chart
  // clean lets the data own the visual real estate.

  let py = headerLegendH;

  PANELS.forEach((panel, pi) => {
    const rows = panelRows[pi];
    const panelH = panelHs[pi];
    const panelTop = py + panelPad.t;
    const panelBot = panelTop + panelSizes[pi];

    // Panel title — centered over the plot area (not the full SVG width,
    // which would sit left because the model-label margin and the right-side
    // ratio column are asymmetric).
    const titleCx = panelPad.l + ctxPlotW / 2;
    svg += `<text x="${titleCx}" y="${py + 18}" font-size="12" font-weight="bold" fill="#111" font-family="${SERIF}" text-anchor="middle">${panel.dim}</text>`;

    // Sub-panel column headers (B5) OR single centered header (ctx)
    if (panel.type === 'b5') {
      const lowMidX = panelPad.l + subPlotW / 2;
      const highMidX = panelPad.l + subPlotW + subGap + subPlotW / 2;
      svg += `<text x="${lowMidX}" y="${py + 34}" font-size="10" fill="#333" font-family="${SERIF}" font-style="italic" text-anchor="middle">${panel.lowLabel} agents</text>`;
      svg += `<text x="${highMidX}" y="${py + 34}" font-size="10" fill="#333" font-family="${SERIF}" font-style="italic" text-anchor="middle">${panel.highLabel} agents</text>`;
    } else {
      // ctx panel: single centered subheader
      const ctxMidX = panelPad.l + ctxPlotW / 2;
      svg += `<text x="${ctxMidX}" y="${py + 34}" font-size="10" fill="#333" font-family="${SERIF}" font-style="italic" text-anchor="middle">All agents · ${panel.dim.toLowerCase()} mention shift</text>`;
    }

    // Per sub-panel: zero line (at v=0), grid + ticks.
    // Axis styled like Fig 26/27: numeric ticks at each integer on the log-odds
    // scale, with a "Log-odds" label, and directional arrows at the ends.
    function drawSubAxis(xScale, xStart, width) {
      width = width || subPlotW;
      const x0 = xScale(0);
      svg += `<line x1="${x0}" y1="${panelTop}" x2="${x0}" y2="${panelBot}" stroke="#999" stroke-width="1" stroke-dasharray="4,3"/>`;
      for (let v = gridStart; v <= gMax + 1e-6; v += step) {
        const tx = xScale(v);
        if (Math.abs(v) > 1e-9) {
          svg += `<line x1="${tx}" y1="${panelTop}" x2="${tx}" y2="${panelBot}" stroke="#eee" stroke-width="0.5"/>`;
        }
        svg += `<line x1="${tx}" y1="${panelBot}" x2="${tx}" y2="${panelBot + 4}" stroke="#bbb" stroke-width="0.5"/>`;
        svg += `<text x="${tx}" y="${panelBot + 13}" font-size="8" fill="#888" font-family="${SERIF}" text-anchor="middle">${v % 1 === 0 ? v : v.toFixed(1)}</text>`;
      }
      svg += `<line x1="${xStart}" y1="${panelBot}" x2="${xStart + width}" y2="${panelBot}" stroke="#bbb" stroke-width="0.5"/>`;
      svg += `<text x="${xStart + 4}" y="${panelBot + 26}" font-size="8" fill="#999" font-family="${SERIF}" font-style="italic">← Go out more</text>`;
      svg += `<text x="${xStart + width - 4}" y="${panelBot + 26}" font-size="8" fill="#999" font-family="${SERIF}" font-style="italic" text-anchor="end">Stay home more →</text>`;
      svg += `<text x="${xStart + width / 2}" y="${panelBot + 26}" font-size="8" fill="#888" font-family="${SERIF}" text-anchor="middle">Log-odds</text>`;
    }
    if (panel.type === 'b5') {
      drawSubAxis(xScaleLow,  panelPad.l);
      drawSubAxis(xScaleHigh, panelPad.l + subPlotW + subGap);
      // Vertical divider between sub-panels
      const dividerX = panelPad.l + subPlotW + subGap / 2;
      svg += `<line x1="${dividerX}" y1="${panelTop - 6}" x2="${dividerX}" y2="${panelBot + 4}" stroke="#bbb" stroke-width="0.5" stroke-dasharray="2,3"/>`;
    } else {
      // ctx: single wide axis spanning full plot width
      drawSubAxis(xScaleCtx, panelPad.l, ctxPlotW);
    }

    // Plot rows
    let rowIdx = 0;
    let lastProv = '';
    rows.forEach(({ c, pos }) => {
      if (c.provider !== lastProv && lastProv !== '') rowIdx += gapProv / rowH;
      lastProv = c.provider;
      const cy = panelTop + rowIdx * rowH + rowH / 2;

      // Model label (left margin)
      svg += `<text x="${panelPad.l - 6}" y="${(cy + 3.5).toFixed(1)}" font-size="9" fill="${c.color}" font-family="${SERIF}" text-anchor="end">${esc(c.label)}</text>`;

      // ── CTX panel branch: simple 2-marker shift per row ──
      if (pos.type === 'ctx') {
        // Row-level filter (panelRows) already excludes non-sig ctx; always render.
        const px0 = xScaleCtx(clampV(0));
        const pxM = xScaleCtx(clampV(pos.mention));
        // Connecting line
        svg += `<line x1="${px0}" y1="${cy}" x2="${pxM}" y2="${cy}" stroke="${c.color}" stroke-width="1.2" opacity="0.35"/>`;
        // ○ baseline (no mention)
        svg += `<circle cx="${px0}" cy="${cy}" r="3.3" fill="white" stroke="${c.color}" stroke-width="1.4"/>`;
        // ● mention
        svg += `<circle cx="${pxM}" cy="${cy}" r="3.3" fill="${c.color}"/>`;

        // Tooltip
        const tt = `○ no mention: 0.00<br>● + mention: ${pos.mention.toFixed(2)}<br>${esc(panel.traitLabel)} span = ${pos.traitSpan.toFixed(2)}`;
        svg += `<rect x="${panelPad.l}" y="${(cy - rowH / 2).toFixed(1)}" width="${ctxPlotW}" height="${rowH}" fill="transparent" class="hit-target" data-label="${esc(c.label)} — ${panel.dim}" data-color="${c.color}" data-extra="${tt}" style="cursor:default"/>`;
        rowIdx++;
        return;
      }

      // ── B5 panel branch (existing logic) ──
      const px1 = xScaleLow(clampV(pos.lowNo));
      const px2 = pos.lowYes != null ? xScaleLow(clampV(pos.lowYes)) : null;
      const px3 = xScaleHigh(clampV(pos.hiNo));
      const px4 = pos.hiYes != null ? xScaleHigh(clampV(pos.hiYes)) : null;

      // A sub-panel is rendered iff its matching pole's mention flag was included.
      //   - LEFT rendered iff β_mention_low is in the model (pos.lowYes != null).
      //   - RIGHT rendered iff β_mention_high is in the model (pos.hiYes != null).
      const showLow  = pos.lowYes != null;
      const showHigh = pos.hiYes != null;
      // Significance on the MENTION effect (solid filled marker iff p < 0.05; faded otherwise).
      const sigLow  = pos.pLow  != null && pos.pLow  < 0.05;
      const sigHigh = pos.pHigh != null && pos.pHigh < 0.05;
      const fadedOp = 0.28;

      // Connecting lines — only for significant mention effects
      if (showLow && sigLow) {
        svg += `<line x1="${px1}" y1="${cy}" x2="${px2}" y2="${cy}" stroke="${c.color}" stroke-width="1.2" opacity="0.35"/>`;
      }
      if (showHigh && sigHigh) {
        svg += `<line x1="${px3}" y1="${cy}" x2="${px4}" y2="${cy}" stroke="${c.color}" stroke-width="1.2" opacity="0.35"/>`;
      }

      const r = 3.3;
      if (showLow) {
        // ○ baseline low-pole agent (always shown — reference point)
        svg += `<circle cx="${px1}" cy="${cy}" r="${r}" fill="white" stroke="${c.color}" stroke-width="1.4"/>`;
        // ● low + mention — only draw if significant
        if (sigLow) {
          svg += `<circle cx="${px2}" cy="${cy}" r="${r}" fill="${c.color}"/>`;
        }
      }
      if (showHigh) {
        // ○ baseline high-pole agent (hollow circle, always shown)
        svg += `<circle cx="${px3}" cy="${cy}" r="${r}" fill="white" stroke="${c.color}" stroke-width="1.4"/>`;
        // ● high + mention — only draw if significant
        if (sigHigh) {
          svg += `<circle cx="${px4}" cy="${cy}" r="${r}" fill="${c.color}"/>`;
        }
      }

      // Tooltip — one hit area per sub-panel, only where there's data
      const f = v => v != null ? v.toFixed(2) : '—';
      if (showLow) {
        let ttLow = `○ ${panel.lowLabel}, no mention: 0.00 (reference)`;
        if (sigLow) {
          ttLow += `<br>● ${panel.lowLabel} + mention: ${f(pos.lowYes)}`;
        } else {
          ttLow += `<br>${panel.lowLabel} + mention: ${f(pos.lowYes)} (not significant, p ≥ 0.05)`;
        }
        svg += `<rect x="${panelPad.l}" y="${(cy - rowH / 2).toFixed(1)}" width="${subPlotW}" height="${rowH}" fill="transparent" class="hit-target" data-label="${esc(c.label)} — ${panel.dim} / ${esc(panel.lowLabel)}" data-color="${c.color}" data-extra="${ttLow}" style="cursor:default"/>`;
      }
      if (showHigh) {
        let ttHigh = `○ ${panel.highLabel}, no mention: ${f(pos.hiNo)}`;
        if (sigHigh) {
          ttHigh += `<br>● ${panel.highLabel} + mention: ${f(pos.hiYes)}`;
        } else {
          ttHigh += `<br>${panel.highLabel} + mention: ${f(pos.hiYes)} (not significant, p ≥ 0.05)`;
        }
        svg += `<rect x="${panelPad.l + subPlotW + subGap}" y="${(cy - rowH / 2).toFixed(1)}" width="${subPlotW}" height="${rowH}" fill="transparent" class="hit-target" data-label="${esc(c.label)} — ${panel.dim} / ${esc(panel.highLabel)}" data-color="${c.color}" data-extra="${ttHigh}" style="cursor:default"/>`;
      }

      rowIdx++;
    });

    // Provider separators (span both sub-panels)
    let sepIdx = 0; lastProv = '';
    rows.forEach(({ c }) => {
      if (c.provider !== lastProv && lastProv !== '') {
        const sepY = panelTop + sepIdx * rowH;
        svg += `<line x1="${panelPad.l}" y1="${sepY.toFixed(1)}" x2="${W - panelPad.r}" y2="${sepY.toFixed(1)}" stroke="#ddd" stroke-width="0.5"/>`;
        sepIdx += gapProv / rowH;
      }
      lastProv = c.provider;
      sepIdx++;
    });

    py += panelH + panelGap;
  });

  chartEl.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${totalH}" viewBox="0 0 ${W} ${totalH}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
  wireTooltips(chartEl);
}


/* ── Figure 41: Persona Individuation (within vs across agent similarity) ── */
/* Research Q: does the model produce genuinely agent-specific reasoning,
   or write the same template regardless of persona?
   Method: cosine similarity on OpenAI text-embedding-3-large vectors.
     within  = mean pairwise cosine across 5 reps per (agent, infection_level)
     across  = mean cosine of random pairs of DIFFERENT agents at same level
     delta   = within − across.  Large positive delta = strong individuation. */
function renderRAPersonaSimilarityAuthor(data, simData) { renderRAPersonaSimilarity(data, simData, 'ra-persona-sim-author-chart'); }
function renderRAReasoningDiversityAuthor(data)  { renderRAReasoningDiversity(data,  'ra-diversity-author-chart');  }

// `sortMode`: 'delta' (default — most-individuating LLMs first) or 'provider'
// (Anthropic → OpenAI → Gemini, preserving CONFIG.MODELS order within each).
function renderRAPersonaSimilarity(data, simData, elId = 'ra-persona-sim-chart', modelFilter = null, sortMode = 'delta') {
  const el = document.getElementById(elId);
  if (!el) return;

  // Build temperature lookup from response_text_similarity data (keyed by config dir).
  const tempByCfg = {};
  if (simData && simData.configs && simData.temperature) {
    simData.configs.forEach((cfg, i) => { tempByCfg[cfg] = simData.temperature[i]; });
  }
  const TEMP0 = '#3B82F6';  // blue — matches Fig 38
  const TEMP1 = '#F59E0B';  // orange — matches Fig 38
  const tempColor = t => (t === '0' ? TEMP0 : TEMP1);

  const rows = [];
  CONFIG.MODELS.forEach(m => {
    const key = configDirKey(m);
    if (!data[key]) return;
    if (modelFilter && !modelFilter.has(key)) return;
    const r = data[key];
    rows.push({
      key, label: m.label, provider: m.provider,
      color: CONFIG.PROVIDER_COLORS[m.provider] || '#999',
      temp: tempByCfg[key] || '0',
      within: r.within_mean, across: r.across_mean, delta: r.delta,
    });
  });
  if (sortMode === 'provider') {
    // Provider order matches Figure 18: Anthropic → OpenAI → Gemini.
    // Within each provider, preserve CONFIG.MODELS order (which the rows
    // were pushed in) — assign each row its index, then stable-sort.
    const provRank = { anthropic: 0, openai: 1, gemini: 2 };
    rows.forEach((r, i) => { r._idx = i; });
    rows.sort((a, b) => {
      const pa = provRank[a.provider] ?? 99;
      const pb = provRank[b.provider] ?? 99;
      if (pa !== pb) return pa - pb;
      return a._idx - b._idx;
    });
  } else {
    // Default: by Δ descending — most individuating models first.
    rows.sort((a, b) => b.delta - a.delta);
  }

  const W = Math.min(el.parentElement?.offsetWidth || 900, 900);
  const rowH = 20;
  const pad = { l: 170, t: 72, r: 80, b: 50 };
  const plotW = W - pad.l - pad.r;
  const H = pad.t + rows.length * rowH + pad.b;

  // X scale: cosine similarity (0..1). Zoom in a bit since values cluster above 0.5.
  let xMin = 0.5, xMax = 1.0;
  rows.forEach(r => {
    if (r.across < xMin) xMin = Math.max(0, r.across - 0.05);
  });
  const xScale = v => pad.l + (v - xMin) / (xMax - xMin) * plotW;

  let svg = '';

  // Title
  svg += `<text x="${W / 2}" y="20" font-size="12" font-weight="bold" fill="#111" font-family="${SERIF}" text-anchor="middle">Persona Individuation — Cosine Similarity of Reasoning Embeddings</text>`;
  svg += `<text x="${W / 2}" y="36" font-size="9" fill="#777" font-family="${SERIF}" text-anchor="middle" font-style="italic">Within-agent (5 reps, same persona) vs across-agent (different agents, same direction, same level). Larger gap = more individuation. Sorted by Δ.</text>`;

  // X axis
  const axisY = pad.t + rows.length * rowH;
  for (let v = Math.ceil(xMin * 20) / 20; v <= xMax + 1e-9; v += 0.05) {
    const x = xScale(v);
    svg += `<line x1="${x}" y1="${pad.t}" x2="${x}" y2="${axisY}" stroke="#eee" stroke-width="0.5"/>`;
    svg += `<line x1="${x}" y1="${axisY}" x2="${x}" y2="${axisY + 4}" stroke="#bbb" stroke-width="0.5"/>`;
    svg += `<text x="${x}" y="${axisY + 14}" font-size="8" fill="#888" font-family="${SERIF}" text-anchor="middle">${v.toFixed(2)}</text>`;
  }
  svg += `<text x="${pad.l + plotW / 2}" y="${axisY + 30}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="middle">Mean cosine similarity</text>`;

  // Rows
  rows.forEach((r, i) => {
    const y = pad.t + i * rowH + rowH / 2;
    const tCol = tempColor(r.temp);
    // Label (provider color)
    svg += `<circle cx="${pad.l - 8}" cy="${y}" r="3" fill="${r.color}"/>`;
    svg += `<text x="${pad.l - 14}" y="${y + 3}" font-size="10" fill="#333" font-family="${SERIF}" text-anchor="end">${esc(r.label)}</text>`;

    // Across dot (hollow, temp color)
    svg += `<circle cx="${xScale(r.across)}" cy="${y}" r="3.5" fill="white" stroke="${tCol}" stroke-width="1.5"/>`;

    // Within dot (filled, temp color)
    svg += `<circle cx="${xScale(r.within)}" cy="${y}" r="3.5" fill="${tCol}"/>`;

    // Connecting line — temp-colored to highlight the gap
    svg += `<line x1="${xScale(r.across)}" y1="${y}" x2="${xScale(r.within)}" y2="${y}" stroke="${tCol}" stroke-width="1.4" opacity="0.6"/>`;

    // Δ label (right) — temp-colored
    svg += `<text x="${pad.l + plotW + 6}" y="${y + 3}" font-size="9" fill="${tCol}" font-family="${SERIF}" font-weight="bold">Δ=${r.delta.toFixed(2)}</text>`;

    // Tooltip hit target
    const tt = `within = ${r.within.toFixed(3)}<br>across = ${r.across.toFixed(3)}<br>Δ = ${r.delta.toFixed(3)}<br>temperature = ${r.temp}`;
    svg += `<rect x="${pad.l}" y="${pad.t + i * rowH}" width="${plotW}" height="${rowH}" fill="transparent" class="hit-target" data-label="${esc(r.label)} — persona individuation" data-color="${r.color}" data-extra="${tt}" style="cursor:default"/>`;
  });

  // Legend strip — marker semantics + temperature key
  const legY = pad.t - 16;
  svg += `<circle cx="${pad.l}" cy="${legY}" r="3.5" fill="white" stroke="#666" stroke-width="1.5"/>`;
  svg += `<text x="${pad.l + 8}" y="${legY + 3}" font-size="9" fill="#444" font-family="${SERIF}">Across agents</text>`;
  svg += `<circle cx="${pad.l + 100}" cy="${legY}" r="3.5" fill="#666"/>`;
  svg += `<text x="${pad.l + 108}" y="${legY + 3}" font-size="9" fill="#444" font-family="${SERIF}">Within agent</text>`;
  svg += `<line x1="${pad.l + 200}" y1="${legY}" x2="${pad.l + 220}" y2="${legY}" stroke="${TEMP0}" stroke-width="2"/>`;
  svg += `<text x="${pad.l + 224}" y="${legY + 3}" font-size="9" fill="#444" font-family="${SERIF}">temp = 0</text>`;
  svg += `<line x1="${pad.l + 290}" y1="${legY}" x2="${pad.l + 310}" y2="${legY}" stroke="${TEMP1}" stroke-width="2"/>`;
  svg += `<text x="${pad.l + 314}" y="${legY + 3}" font-size="9" fill="#444" font-family="${SERIF}">temp = 1</text>`;

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
  wireTooltips(el);
}


/* ── Figure 20 (paper §5.3.3): Cosine-similarity reference pairs ──
   Static three-row panel showing example response pairs from one LLM at
   three different cosine values, anchoring the cosine scale for the
   reader. Data from analysis/paper_stats/cosine_examples.py. */
function renderCosineExamples(data, elId) {
  const el = document.getElementById(elId);
  if (!el || !data || !data.pairs) return;

  const fmtMeta = (r) => {
    const dec = r.decision === 'yes' ? 'stay home' : 'go out';
    return `${esc(r.agent_name)} (agent ${r.agent_id}, age ${r.age}, rep ${r.rep}) &mdash; chose <em>${dec}</em>`;
  };

  let html = `<div style="font-family:${SERIF};font-size:11px;line-height:1.5;color:#222;border:1px solid #ccc;background:${SVG_BG}">`;
  data.pairs.forEach((pair, i) => {
    const sep = i > 0 ? 'border-top:1px solid #ddd;' : '';
    html += `<div style="${sep}padding:10px 12px">`;
    html += `<div style="display:flex;align-items:baseline;gap:12px;margin-bottom:6px">`;
    html += `<div style="font-size:14px;font-weight:bold;color:#1f4d63;min-width:120px">cosine = ${pair.cosine.toFixed(2)}</div>`;
    html += `<div style="font-size:11px;font-style:italic;color:#666">${esc(pair.label)}</div>`;
    html += `</div>`;
    html += `<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">`;
    html += `<div><div style="font-size:10px;color:#666;margin-bottom:3px">${fmtMeta(pair.response_a)}</div><div style="font-size:11px;color:#333">${esc(pair.response_a.reasoning)}</div></div>`;
    html += `<div><div style="font-size:10px;color:#666;margin-bottom:3px">${fmtMeta(pair.response_b)}</div><div style="font-size:11px;color:#333">${esc(pair.response_b.reasoning)}</div></div>`;
    html += `</div></div>`;
  });
  html += `</div>`;

  el.innerHTML = html;
}


/* ── Figure 34B: Mention/Trait Ratio (Fig 17 layout) ──
   Same visual structure as Figure 17 (rows = LLMs grouped by provider,
   panels per Big Five trait), but the x-axis is β_mention / β_trait
   (signed). Vertical guides at 0 (no mention effect) and ±1 (mention
   equal to ±trait). Two markers per row: low pole (triangle), high pole
   (circle). Faded markers = mention not significant.

   Replaces the earlier scatter (Fig 34A) version, which was discarded. */

const _MENTION_TRAITS = [
  { dim: 'Extraversion',     trait: 'extraverted',   lowLabel: 'Introverted',     highLabel: 'Extraverted',
    lowMention: 'mentioned_introverted',     highMention: 'mentioned_extroverted' },
  { dim: 'Agreeableness',    trait: 'agreeable',     lowLabel: 'Antagonistic',    highLabel: 'Agreeable',
    lowMention: 'mentioned_antagonistic',    highMention: 'mentioned_agreeable' },
  { dim: 'Conscientiousness',trait: 'conscientious', lowLabel: 'Unconscientious', highLabel: 'Conscientious',
    lowMention: 'mentioned_unconscientious', highMention: 'mentioned_conscientious' },
  { dim: 'Neuroticism',      trait: 'emot_stable',   lowLabel: 'Neurotic',        highLabel: 'Emot. stable',
    lowMention: 'mentioned_neurotic',        highMention: 'mentioned_emot_stable' },
  { dim: 'Openness',         trait: 'open_to_exp',   lowLabel: 'Closed',          highLabel: 'Open',
    lowMention: 'mentioned_closed',          highMention: 'mentioned_open' },
];

function _mentionTraitPoints(allRegs) {
  const points = [];
  CONFIG.MODELS.forEach(m => {
    const key = configDirKey(m);
    const c = allRegs[key]?.model3?.coefficients;
    if (!c || !c.infection_pct || !c.infection_pct_sq) return;
    const bI = c.infection_pct.estimate;
    const bI2 = c.infection_pct_sq.estimate;
    let mn = Infinity, mx = -Infinity;
    for (let lv = 0; lv <= 7; lv++) {
      const v = bI * lv + bI2 * lv * lv;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    const infRange = Math.max(1e-6, mx - mn);
    _MENTION_TRAITS.forEach(tr => {
      if (!c[tr.trait]) return;
      const bT = c[tr.trait].estimate;
      [['low', tr.lowMention, tr.lowLabel], ['high', tr.highMention, tr.highLabel]].forEach(([side, mKey, mLabel]) => {
        if (!c[mKey]) return;
        const bM = c[mKey].estimate;
        const pM = c[mKey].p ?? 1.0;
        points.push({
          cfgKey: key, label: m.label, provider: m.provider,
          color: CONFIG.PROVIDER_COLORS[m.provider] || '#999',
          dim: tr.dim, pole: side, mLabel,
          beta_trait: bT, beta_mention: bM,
          inf_range: infRange,
          x: bT / infRange, y: bM / infRange,
          mention_to_trait: bT === 0 ? null : bM / bT,
          sig: pM < 0.05,
          p: pM,
        });
      });
    });
  });
  return points;
}

function renderRAMentionTraitRatio(allRegs, elId = 'ra-mt-ratio-chart', modelFilter = null) {
  const chartEl = document.getElementById(elId);
  if (!chartEl) return;

  // Tabular replacement for the earlier panel-chart Fig 18. One row per
  // (LLM, pole) where the mention flag passed the [15%, 85%] gate AND is
  // significant at p < 0.05. Three magnitude views per row anchored to that
  // LLM's full infection log-odds range (the same anchor used in §5.2.1):
  //   • β trait / Inf       — signed trait-dummy effect (constant across poles
  //                           within an LLM × dimension)
  //   • Combined / Inf      — signed position with mention:
  //                             low pole  = β_mention_low / Inf
  //                             high pole = (β_trait + β_mention_high) / Inf
  //                             Infection = (span + β_mention_infection) / Inf
  //                             Age       = (β_age·47 + β_mention_age) / Inf
  //   • Ratio (β mention / |β trait|) — signed mention shift as a multiple of
  //                                     the trait coefficient's magnitude

  const POLES = [
    // dim, traitKey (regression coef name), poleSide, poleLabel, mentionKey
    ['Extraversion',     'extraverted',   'low',  'Introverted',     'mentioned_introverted'],
    ['Extraversion',     'extraverted',   'high', 'Extraverted',     'mentioned_extroverted'],
    ['Agreeableness',    'agreeable',     'low',  'Antagonistic',    'mentioned_antagonistic'],
    ['Agreeableness',    'agreeable',     'high', 'Agreeable',       'mentioned_agreeable'],
    ['Conscientiousness','conscientious', 'low',  'Unconscientious', 'mentioned_unconscientious'],
    ['Conscientiousness','conscientious', 'high', 'Conscientious',   'mentioned_conscientious'],
    ['Neuroticism',      'emot_stable',   'low',  'Neurotic',        'mentioned_neurotic'],
    ['Neuroticism',      'emot_stable',   'high', 'Emot. stable',    'mentioned_emot_stable'],
    ['Openness',         'open_to_exp',   'low',  'Closed',          'mentioned_closed'],
    ['Openness',         'open_to_exp',   'high', 'Open',            'mentioned_open'],
  ];

  // Build infection log-odds range per LLM (denominator for all magnitudes).
  function infRangeOf(coefs) {
    const b1 = coefs.infection_pct ? coefs.infection_pct.estimate : 0;
    const b2 = coefs.infection_pct_sq ? coefs.infection_pct_sq.estimate : 0;
    let mn = Infinity, mx = -Infinity;
    for (let lv = 0; lv <= 7; lv++) {
      const v = b1 * lv + b2 * lv * lv;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    return Math.max(1e-6, mx - mn);
  }

  // Collect rows
  const rows = [];
  CONFIG.MODELS.forEach(m => {
    const key = configDirKey(m);
    if (modelFilter && !modelFilter.has(key)) return;
    const reg = allRegs[key];
    if (!reg || !reg.model3 || reg.model3.error || !reg.model3.coefficients) return;
    const c = reg.model3.coefficients;
    const inf = infRangeOf(c);
    const provColor = CONFIG.PROVIDER_COLORS[m.provider] || '#999';

    // Big Five poles
    POLES.forEach(([dim, traitKey, side, poleLabel, mKey]) => {
      const bT = c[traitKey];
      const bM = c[mKey];
      if (!bT || !bM) return;
      if ((bM.p ?? 1) >= 0.05) return;
      const tEst = bT.estimate;
      const tAbs = Math.abs(tEst);
      if (tAbs < 1e-9) return;
      const mEst = bM.estimate;
      const traitOverInf = tEst / inf;
      const combinedOverInf = side === 'high' ? (tEst + mEst) / inf : mEst / inf;
      const ratio = mEst / tAbs;
      rows.push({
        cfgKey: key, label: m.label, provider: m.provider, color: provColor,
        dim, pole: poleLabel, traitOverInf, combinedOverInf, ratio, p: bM.p,
      });
    });

    // Infection ctx row
    const bMInf = c.mentioned_infection;
    if (bMInf && (bMInf.p ?? 1) < 0.05) {
      const span = inf;                       // trait-span for infection ≡ inf range
      const traitOverInf = span / inf;        // = 1.0 by construction
      const combinedOverInf = (span + bMInf.estimate) / inf;
      const ratio = bMInf.estimate / Math.abs(span);
      rows.push({
        cfgKey: key, label: m.label, provider: m.provider, color: provColor,
        dim: 'Infection', pole: '—', traitOverInf, combinedOverInf, ratio, p: bMInf.p,
      });
    }

    // Age ctx row
    const bMAge = c.mentioned_age;
    if (bMAge && (bMAge.p ?? 1) < 0.05) {
      const ageSpan = c.age ? c.age.estimate * 47 : 0;
      if (Math.abs(ageSpan) > 1e-9) {
        const traitOverInf = ageSpan / inf;
        const combinedOverInf = (ageSpan + bMAge.estimate) / inf;
        const ratio = bMAge.estimate / Math.abs(ageSpan);
        rows.push({
          cfgKey: key, label: m.label, provider: m.provider, color: provColor,
          dim: 'Age', pole: '—', traitOverInf, combinedOverInf, ratio, p: bMAge.p,
        });
      }
    }
  });

  if (rows.length === 0) {
    chartEl.innerHTML = '<div style="color:#999;padding:20px">No significant mention coefficients available.</div>';
    return;
  }

  // Sort to match Figure 17's reading order: trait dimension top-to-bottom,
  // pole left-to-right (low before high), then LLMs in CONFIG.MODELS order
  // (which matches Fig 17's row order). Reader scans by pole and sees only
  // the LLMs whose mention for that pole was significant.
  const DIM_ORDER = { 'Extraversion': 0, 'Agreeableness': 1, 'Conscientiousness': 2, 'Neuroticism': 3, 'Openness': 4, 'Infection': 5, 'Age': 6 };
  const POLE_ORDER = {};
  POLES.forEach(([, , side, label]) => { POLE_ORDER[label] = side === 'low' ? 0 : 1; });
  POLE_ORDER['—'] = 0;
  const LLM_ORDER = {};
  CONFIG.MODELS.forEach((m, i) => { LLM_ORDER[configDirKey(m)] = i; });
  rows.sort((a, b) => {
    if (DIM_ORDER[a.dim] !== DIM_ORDER[b.dim]) return DIM_ORDER[a.dim] - DIM_ORDER[b.dim];
    const pa = POLE_ORDER[a.pole] ?? 0, pb = POLE_ORDER[b.pole] ?? 0;
    if (pa !== pb) return pa - pb;
    return (LLM_ORDER[a.cfgKey] ?? 99) - (LLM_ORDER[b.cfgKey] ?? 99);
  });

  function fmt(v) {
    if (v == null || !isFinite(v)) return '';
    const sign = v >= 0 ? '+' : '−';
    const a = Math.abs(v);
    const num = a < 0.05 ? a.toFixed(2) : a.toFixed(a < 1 ? 2 : 1);
    return `${sign}${num}×`;
  }
  function fmtP(p) {
    if (p == null) return '';
    if (p < 0.001) return '<0.001';
    return p.toFixed(3);
  }

  // Build HTML table
  let html = '';
  html += '<table style="border-collapse:collapse;width:100%;font-size:12px">';
  html += '<thead><tr style="border-bottom:2px solid #333;color:#333">';
  ['Trait', 'Pole', 'LLM',
   '<span style="white-space:nowrap">β trait / Inf</span>',
   '<span style="white-space:nowrap">Combined / Inf</span>',
   '<span style="white-space:nowrap">β mention / |β trait|</span>',
   'p'].forEach(h => {
    html += `<th style="text-align:left;padding:6px 10px;font-weight:bold">${h}</th>`;
  });
  html += '</tr></thead><tbody>';

  // Suppress repeated trait+pole cells so the reader sees the (dim, pole)
  // group header once, with the relevant LLMs stacked underneath. New
  // (dim, pole) groups get a thicker top border for visual separation.
  let lastDim = '', lastPole = '';
  rows.forEach((r, i) => {
    const groupChange = (r.dim !== lastDim) || (r.pole !== lastPole);
    const dimCell  = groupChange ? esc(r.dim)  : '';
    const poleCell = groupChange ? esc(r.pole) : '';
    const topBorder = groupChange && i > 0 ? 'border-top:1.5px solid #ccc;' : '';
    const provBg = i % 2 === 0 ? '#fbfbfb' : '#ffffff';
    html += `<tr style="background:${provBg};${topBorder}border-bottom:1px solid #eee">`;
    html += `<td style="padding:5px 10px;color:#444;font-weight:${dimCell ? 'bold' : 'normal'}">${dimCell}</td>`;
    html += `<td style="padding:5px 10px;color:#444;font-style:italic">${poleCell}</td>`;
    html += `<td style="padding:5px 10px;color:${r.color};font-weight:bold">${esc(r.label)}</td>`;
    html += `<td style="padding:5px 10px;text-align:right;color:${r.traitOverInf >= 0 ? '#1f6feb' : '#d97706'}">${fmt(r.traitOverInf)}</td>`;
    html += `<td style="padding:5px 10px;text-align:right;color:${r.combinedOverInf >= 0 ? '#1f6feb' : '#d97706'}">${fmt(r.combinedOverInf)}</td>`;
    html += `<td style="padding:5px 10px;text-align:right;color:${r.ratio >= 0 ? '#1f6feb' : '#d97706'};font-weight:bold">${fmt(r.ratio)}</td>`;
    html += `<td style="padding:5px 10px;text-align:right;color:#888">${fmtP(r.p)}</td>`;
    html += '</tr>';
    lastDim = r.dim; lastPole = r.pole;
  });
  html += '</tbody></table>';

  chartEl.innerHTML = html;
}


/* ── Figure 34C: Mention Amplification Summary (per pole, 12 rows) ──
   Aggregate view: for each Big Five pole + Infection + Age, summarize across
   the LLMs whose mention coefficient was estimable AND significant. */
function renderRAMentionAmpSummary(allRegs, elId = 'ra-mt-summary-chart') {
  const chartEl = document.getElementById(elId);
  if (!chartEl) return;

  const POLES = [
    ['Extraversion',     'extraverted',   'Introverted',     'mentioned_introverted'],
    ['Extraversion',     'extraverted',   'Extraverted',     'mentioned_extroverted'],
    ['Agreeableness',    'agreeable',     'Antagonistic',    'mentioned_antagonistic'],
    ['Agreeableness',    'agreeable',     'Agreeable',       'mentioned_agreeable'],
    ['Conscientiousness','conscientious', 'Unconscientious', 'mentioned_unconscientious'],
    ['Conscientiousness','conscientious', 'Conscientious',   'mentioned_conscientious'],
    ['Neuroticism',      'emot_stable',   'Neurotic',        'mentioned_neurotic'],
    ['Neuroticism',      'emot_stable',   'Emot. stable',    'mentioned_emot_stable'],
    ['Openness',         'open_to_exp',   'Closed',          'mentioned_closed'],
    ['Openness',         'open_to_exp',   'Open',            'mentioned_open'],
  ];

  function infRangeOf(coefs) {
    const b1 = coefs.infection_pct ? coefs.infection_pct.estimate : 0;
    const b2 = coefs.infection_pct_sq ? coefs.infection_pct_sq.estimate : 0;
    let mn = Infinity, mx = -Infinity;
    for (let lv = 0; lv <= 7; lv++) {
      const v = b1 * lv + b2 * lv * lv;
      if (v < mn) mn = v;
      if (v > mx) mx = v;
    }
    return Math.max(1e-6, mx - mn);
  }
  function median(arr) {
    if (arr.length === 0) return null;
    const s = arr.slice().sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  // Collect ratios + trait/inf magnitudes per (dim, pole) across LLMs
  const groups = [];
  POLES.forEach(([dim, traitKey, poleLabel, mKey]) => {
    const ratios = [];
    const traitMags = [];
    CONFIG.MODELS.forEach(m => {
      const reg = allRegs[configDirKey(m)];
      if (!reg || !reg.model3 || reg.model3.error || !reg.model3.coefficients) return;
      const c = reg.model3.coefficients;
      const bT = c[traitKey], bM = c[mKey];
      if (!bT || !bM) return;
      if ((bM.p ?? 1) >= 0.05) return;
      const tAbs = Math.abs(bT.estimate);
      if (tAbs < 1e-9) return;
      const inf = infRangeOf(c);
      ratios.push(bM.estimate / tAbs);
      traitMags.push(Math.abs(bT.estimate) / inf);
    });
    groups.push({ dim, pole: poleLabel, ratios, traitMags });
  });

  // Infection ctx group
  {
    const ratios = [], traitMags = [];
    CONFIG.MODELS.forEach(m => {
      const reg = allRegs[configDirKey(m)];
      if (!reg || !reg.model3 || reg.model3.error || !reg.model3.coefficients) return;
      const c = reg.model3.coefficients;
      const bM = c.mentioned_infection;
      if (!bM || (bM.p ?? 1) >= 0.05) return;
      const inf = infRangeOf(c);
      ratios.push(bM.estimate / inf);     // β_trait_span = inf, so |β_trait| = inf
      traitMags.push(1.0);                // by construction
    });
    groups.push({ dim: 'Infection', pole: '—', ratios, traitMags });
  }
  // Age ctx group
  {
    const ratios = [], traitMags = [];
    CONFIG.MODELS.forEach(m => {
      const reg = allRegs[configDirKey(m)];
      if (!reg || !reg.model3 || reg.model3.error || !reg.model3.coefficients) return;
      const c = reg.model3.coefficients;
      const bM = c.mentioned_age;
      if (!bM || (bM.p ?? 1) >= 0.05) return;
      const span = c.age ? c.age.estimate * 47 : 0;
      if (Math.abs(span) < 1e-9) return;
      const inf = infRangeOf(c);
      ratios.push(bM.estimate / Math.abs(span));
      traitMags.push(Math.abs(span) / inf);
    });
    groups.push({ dim: 'Age', pole: '—', ratios, traitMags });
  }

  function fmtSigned(v) {
    if (v == null || !isFinite(v)) return '—';
    const sign = v >= 0 ? '+' : '−';
    const a = Math.abs(v);
    return sign + (a < 1 ? a.toFixed(2) : a.toFixed(1)) + '×';
  }
  function fmtAbs(v) {
    if (v == null || !isFinite(v)) return '—';
    const a = Math.abs(v);
    return (a < 1 ? a.toFixed(2) : a.toFixed(1)) + '×';
  }

  let html = '';
  html += '<table style="border-collapse:collapse;width:100%;font-size:13px">';
  html += '<thead><tr style="border-bottom:2px solid #333;color:#333">';
  ['Trait', 'Pole',
   '<span style="white-space:nowrap">N sig</span>',
   '<span style="white-space:nowrap">Median |ratio|</span>',
   '<span style="white-space:nowrap">|r|&nbsp;&gt;&nbsp;1</span>',
   '<span style="white-space:nowrap">Min &hellip; Max</span>',
   '<span style="white-space:nowrap">Median β trait / Inf</span>'].forEach(h => {
    html += `<th style="text-align:left;padding:7px 10px;font-weight:bold">${h}</th>`;
  });
  html += '</tr></thead><tbody>';

  let lastDim = '';
  groups.forEach((g, i) => {
    const groupChange = g.dim !== lastDim;
    const dimCell = groupChange ? esc(g.dim) : '';
    const topBorder = groupChange && i > 0 ? 'border-top:1.5px solid #ccc;' : '';
    const bg = i % 2 === 0 ? '#fbfbfb' : '#ffffff';
    const n = g.ratios.length;
    if (n === 0) {
      html += `<tr style="background:${bg};${topBorder}border-bottom:1px solid #eee">`;
      html += `<td style="padding:6px 10px;color:#444;font-weight:${dimCell ? 'bold' : 'normal'}">${dimCell}</td>`;
      html += `<td style="padding:6px 10px;color:#444;font-style:italic">${esc(g.pole)}</td>`;
      html += `<td colspan="5" style="padding:6px 10px;color:#999;font-style:italic">no significant LLMs</td>`;
      html += '</tr>';
      lastDim = g.dim;
      return;
    }
    const absRatios = g.ratios.map(r => Math.abs(r));
    const medAbs = median(absRatios);
    const minR = Math.min(...g.ratios);
    const maxR = Math.max(...g.ratios);
    const gt1 = absRatios.filter(r => r > 1).length;
    const medTrait = median(g.traitMags);
    html += `<tr style="background:${bg};${topBorder}border-bottom:1px solid #eee">`;
    html += `<td style="padding:6px 10px;color:#444;font-weight:${dimCell ? 'bold' : 'normal'}">${dimCell}</td>`;
    html += `<td style="padding:6px 10px;color:#444;font-style:italic">${esc(g.pole)}</td>`;
    html += `<td style="padding:6px 10px;text-align:right;color:#333">${n}</td>`;
    html += `<td style="padding:6px 10px;text-align:right;color:${medAbs >= 1 ? '#1f6feb' : '#333'};font-weight:${medAbs >= 1 ? 'bold' : 'normal'}">${fmtAbs(medAbs)}</td>`;
    html += `<td style="padding:6px 10px;text-align:right;color:#333">${gt1}/${n}</td>`;
    html += `<td style="padding:6px 10px;text-align:right;color:#444;font-variant-numeric:tabular-nums"><span style="color:${minR >= 0 ? '#1f6feb' : '#d97706'}">${fmtSigned(minR)}</span> &hellip; <span style="color:${maxR >= 0 ? '#1f6feb' : '#d97706'}">${fmtSigned(maxR)}</span></td>`;
    html += `<td style="padding:6px 10px;text-align:right;color:#333">${fmtAbs(medTrait)}</td>`;
    html += '</tr>';
    lastDim = g.dim;
  });
  html += '</tbody></table>';

  chartEl.innerHTML = html;
}


/* ── Figure 42: Effective Reasoning Modes — K-Means by Decision ── */
/* For each model: best K chosen by silhouette score run separately on
   yes-only and no-only embeddings (K ∈ [2, 20], PCA-128, n=3000 subsample).
   Paired dots per row: yes-decision K (triangle up) and no-decision K (triangle down).
   Models sorted by overall best_k descending.
   Key question: do models have different reasoning template repertoires for
   "stay home" vs "go out" decisions? */
function renderRAReasoningDiversity(data, elId = 'ra-diversity-chart') {
  const el = document.getElementById(elId);
  if (!el) return;

  const rows = [];
  CONFIG.MODELS.forEach(m => {
    const key = configDirKey(m);
    const r = data[key];
    if (!r) return;
    rows.push({
      key, label: m.label, provider: m.provider,
      color: CONFIG.PROVIDER_COLORS[m.provider] || '#999',
      kOverall: r.overall?.best_k ?? null,
      kYes:     r.yes_only?.best_k ?? null,
      kNo:      r.no_only?.best_k ?? null,
      silYes:   r.yes_only?.best_silhouette ?? null,
      silNo:    r.no_only?.best_silhouette ?? null,
      nYes:     r.n_yes ?? null,
      nNo:      r.n_no ?? null,
    });
  });
  if (rows.length === 0) return;

  rows.sort((a, b) => (b.kOverall ?? 0) - (a.kOverall ?? 0));

  const labelW = 160, rowH = 22;
  const pad = { l: labelW + 10, t: 60, r: 60, b: 40 };
  const plotW = 420;
  const W = pad.l + plotW + pad.r;
  const H = pad.t + rows.length * rowH + pad.b;

  const kMin = 1, kMax = 21;
  const xScale = v => pad.l + (v - kMin) / (kMax - kMin) * plotW;

  let svg = '';
  svg += `<text x="${W / 2}" y="18" font-size="12" font-weight="bold" fill="#111" font-family="${SERIF}" text-anchor="middle">Effective Reasoning Modes — K-Means by Decision Type</text>`;
  svg += `<text x="${W / 2}" y="34" font-size="9" fill="#777" font-family="${SERIF}" text-anchor="middle" font-style="italic">Best K by silhouette score (Rousseeuw 1987), run separately on stay-home and go-out response embeddings.</text>`;

  // Legend
  const legY = 50;
  svg += `<polygon points="${pad.l},${legY - 5} ${pad.l - 5},${legY + 4} ${pad.l + 5},${legY + 4}" fill="#2563EB"/>`;
  svg += `<text x="${pad.l + 10}" y="${legY + 3}" font-size="9" fill="#444" font-family="${SERIF}">Stay home (yes) K</text>`;
  svg += `<polygon points="${pad.l + 160},${legY + 4} ${pad.l + 155},${legY - 5} ${pad.l + 165},${legY - 5}" fill="#DC2626"/>`;
  svg += `<text x="${pad.l + 173}" y="${legY + 3}" font-size="9" fill="#444" font-family="${SERIF}">Go out (no) K</text>`;
  svg += `<line x1="${pad.l + 300}" y1="${legY}" x2="${pad.l + 318}" y2="${legY}" stroke="#aaa" stroke-width="1" stroke-dasharray="3,2"/>`;
  svg += `<text x="${pad.l + 322}" y="${legY + 3}" font-size="9" fill="#444" font-family="${SERIF}">Overall K</text>`;

  // Grid
  for (let k = 2; k <= 20; k += 2) {
    const x = xScale(k);
    svg += `<line x1="${x}" y1="${pad.t}" x2="${x}" y2="${pad.t + rows.length * rowH}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    svg += `<text x="${x}" y="${pad.t + rows.length * rowH + 14}" font-size="8" fill="#999" font-family="${SERIF}" text-anchor="middle">${k}</text>`;
  }
  svg += `<text x="${pad.l + plotW / 2}" y="${pad.t + rows.length * rowH + 30}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="middle">Best K (effective reasoning modes)</text>`;

  // Triangle helpers
  const triUp   = (cx, cy, r) => `${cx},${cy - r} ${cx - r},${cy + r} ${cx + r},${cy + r}`;
  const triDown = (cx, cy, r) => `${cx},${cy + r} ${cx - r},${cy - r} ${cx + r},${cy - r}`;

  rows.forEach((r, i) => {
    const y = pad.t + i * rowH + rowH / 2;

    // Label
    svg += `<circle cx="${pad.l - labelW}" cy="${y}" r="3" fill="${r.color}"/>`;
    svg += `<text x="${pad.l - labelW + 9}" y="${y + 3}" font-size="9" fill="#333" font-family="${SERIF}">${esc(r.label)}</text>`;

    // Overall K as dashed vertical tick
    if (r.kOverall != null) {
      const xO = xScale(r.kOverall);
      svg += `<line x1="${xO}" y1="${y - 7}" x2="${xO}" y2="${y + 7}" stroke="#bbb" stroke-width="1" stroke-dasharray="2,2"/>`;
    }

    // Connecting line between yes and no dots
    if (r.kYes != null && r.kNo != null) {
      svg += `<line x1="${xScale(r.kYes)}" y1="${y}" x2="${xScale(r.kNo)}" y2="${y}" stroke="#ddd" stroke-width="1"/>`;
    }

    // Yes triangle (up, blue)
    if (r.kYes != null) {
      const cx = xScale(r.kYes);
      const tt = `${esc(r.label)}<br>Stay-home K = ${r.kYes} &nbsp;(sil=${r.silYes != null ? r.silYes.toFixed(3) : 'n/a'}, n=${r.nYes?.toLocaleString()})`;
      svg += `<polygon points="${triUp(cx, y, 5)}" fill="#2563EB" opacity="0.85" class="hit-target" data-label="${esc(r.label)}" data-color="#2563EB" data-extra="${tt}" style="cursor:default"/>`;
      svg += `<text x="${pad.l + plotW + 6}" y="${y + 3}" font-size="8" fill="#2563EB" font-family="${SERIF}">${r.kYes}</text>`;
    }

    // No triangle (down, red)
    if (r.kNo != null) {
      const cx = xScale(r.kNo);
      const tt = `${esc(r.label)}<br>Go-out K = ${r.kNo} &nbsp;(sil=${r.silNo != null ? r.silNo.toFixed(3) : 'n/a'}, n=${r.nNo?.toLocaleString()})`;
      svg += `<polygon points="${triDown(cx, y, 5)}" fill="#DC2626" opacity="0.85" class="hit-target" data-label="${esc(r.label)}" data-color="#DC2626" data-extra="${tt}" style="cursor:default"/>`;
      svg += `<text x="${pad.l + plotW + 20}" y="${y + 3}" font-size="8" fill="#DC2626" font-family="${SERIF}">${r.kNo}</text>`;
    }
  });

  el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
  wireTooltips(el);
}


/* ── Figure 43: Decision Drivers Heatmap (concepts × configs) ── */
/* Term-frequency style content analysis. Each cell = P(concept appears in
   reasoning) for one (model, concept). Darker = more frequent. A toggle
   (radio) lets the reader split by decision (yes vs no) to see which
   concepts differentiate "stay home" from "go out" reasoning. */
function renderRADecisionDrivers(data, modelFilter = null, elId = 'ra-drivers-chart', staticMode = null) {
  const el = document.getElementById(elId);
  if (!el) return;

  const concepts = data.concepts;
  const byConfig = data.by_config;
  const keywords = data.keywords || {};

  // Rows = models (in CONFIG.MODELS order), Cols = concepts
  const rows = [];
  CONFIG.MODELS.forEach(m => {
    const key = configDirKey(m);
    if (!byConfig[key]) return;
    if (modelFilter && !modelFilter.has(key)) return;
    rows.push({ key, label: m.label, provider: m.provider,
      color: CONFIG.PROVIDER_COLORS[m.provider] || '#999',
      data: byConfig[key] });
  });

  function subtitleHTML(mode) {
    const baseStyle = `font-size:10px;font-style:italic;color:#777;font-family:${SERIF};margin-bottom:8px`;
    if (mode === 'diff') {
      return `<div style="display:flex;align-items:center;gap:8px;${baseStyle}">
        <span style="font-style:normal;color:#555">Difference: stay-home − go-out</span>
        <span>−50%</span>
        <div style="width:140px;height:10px;background:linear-gradient(to right, rgb(33,150,243), white, rgb(229,57,53));border:1px solid #ccc"></div>
        <span>+50%</span>
        <span>(red = more in stay-home reasoning)</span>
      </div>`;
    }
    let text;
    if (mode === 'yes')      text = 'Among responses that decided stay-home: % that mention each topic';
    else if (mode === 'no')  text = 'Among responses that decided go-out: % that mention each topic';
    else                     text = '% of all responses that mention each topic';
    return `<div style="${baseStyle}">${text}</div>`;
  }

  function draw(mode) {
    // mode: "overall" | "yes" | "no" | "diff" (yes - no)
    const W = Math.min(el.parentElement?.offsetWidth || 1200, 1200);
    const labelW = 170;
    const cellW = Math.floor((W - labelW - 40) / concepts.length);
    const cellH = 22;
    // Header stack (top → bottom): concept names (2 lines) → keyword stack → grid
    const KW_LINES = 10;
    const kwLineH = 9;
    const nameLineH = 12;
    const titleBlockH = 8;  // small top buffer (title + subtitle now live OUTSIDE the SVG)
    const headerH = titleBlockH + 2 * nameLineH + 8 + KW_LINES * kwLineH + 8;
    // bottom padding includes legend bar (only drawn in static mode)
    const pad = { l: labelW, t: headerH, r: 16, b: staticMode ? 80 : 56 };
    // Reserve space for a Median summary row at the bottom of the grid.
    const summaryGap = 8;
    const summaryH = cellH;
    const H = pad.t + rows.length * cellH + summaryGap + summaryH + pad.b;

    let svg = '';

    // Column headers — two-line wrapped concept name (top) + keyword stack
    // below. Wrapping at "/" or whitespace avoids narrow-cell overlap problems
    // when labels like "Quantitative frame" or "Community/others" exceed cellW.
    function splitConceptName(name) {
      // Split on "/" or whitespace into at most 2 parts.
      const parts = name.split(/\s*\/\s*|\s+/);
      if (parts.length === 1) return [name, ''];
      // If 2+ parts, join such that both lines are as balanced as possible
      const half = Math.ceil(parts.length / 2);
      return [parts.slice(0, half).join(' '), parts.slice(half).join(' ')];
    }
    const nameLine1Y = titleBlockH + nameLineH;       // below subtitle
    const nameLine2Y = nameLine1Y + nameLineH;
    const kwStartY = nameLine2Y + 10;
    concepts.forEach((c, ci) => {
      const x = pad.l + ci * cellW + cellW / 2;
      const [l1, l2] = splitConceptName(c);
      // Concept name: bold italic (Fig 32 style). Line 1 at nameLine1Y;
      // if there's a second word, put it on nameLine2Y.
      svg += `<text x="${x}" y="${nameLine1Y}" font-size="10" fill="#333" font-family="${SERIF}" font-style="italic" font-weight="bold" text-anchor="middle">${esc(l1)}</text>`;
      if (l2) svg += `<text x="${x}" y="${nameLine2Y}" font-size="10" fill="#333" font-family="${SERIF}" font-style="italic" font-weight="bold" text-anchor="middle">${esc(l2)}</text>`;
      // Keywords stacked below, small gray.
      // "Traits" uses a compact summary + dagger ref instead of raw regex keywords.
      const displayKws = c === 'Traits'
        ? ['Big Five categories', '+ Age', '† see Fig 32']
        : (keywords[c] || []);
      displayKws.slice(0, KW_LINES).forEach((kw, ki) => {
        const ky = kwStartY + ki * kwLineH;
        svg += `<text x="${x}" y="${ky}" font-size="7" fill="#999" font-family="${SERIF}" text-anchor="middle">${esc(kw)}</text>`;
      });
    });

    // Rows
    rows.forEach((r, ri) => {
      const y = pad.t + ri * cellH;
      svg += `<circle cx="${pad.l - 14}" cy="${y + cellH / 2}" r="3" fill="${r.color}"/>`;
      svg += `<text x="${pad.l - 20}" y="${y + cellH / 2 + 3}" font-size="9" fill="#333" font-family="${SERIF}" text-anchor="end">${esc(r.label)}</text>`;

      concepts.forEach((c, ci) => {
        const x = pad.l + ci * cellW;
        let val;
        if (mode === "overall") val = r.data.overall[c];
        else if (mode === "yes") val = r.data.by_decision.yes[c];
        else if (mode === "no") val = r.data.by_decision.no[c];
        else val = r.data.by_decision.yes[c] - r.data.by_decision.no[c];  // diff

        // Color map
        let fill;
        if (mode === "diff") {
          // diverging red-blue around 0
          const t = Math.max(-1, Math.min(1, val));
          if (t > 0) {
            const a = Math.min(1, Math.abs(t) * 2);
            fill = `rgba(229, 57, 53, ${a})`;
          } else {
            const a = Math.min(1, Math.abs(t) * 2);
            fill = `rgba(33, 150, 243, ${a})`;
          }
        } else {
          const a = Math.max(0, Math.min(1, val));
          fill = `rgba(60, 64, 177, ${a})`;
        }
        svg += `<rect x="${x}" y="${y}" width="${cellW}" height="${cellH}" fill="${fill}" stroke="#eee" stroke-width="0.5"/>`;
        const display = mode === "diff"
          ? (val >= 0 ? '+' : '') + Math.round(val * 100) + ' pp'
          : Math.round(val * 100) + '%';
        const textColor = mode === "diff"
          ? (Math.abs(val) > 0.4 ? '#fff' : '#333')
          : (val > 0.6 ? '#fff' : '#333');
        svg += `<text x="${x + cellW / 2}" y="${y + cellH / 2 + 3}" font-size="8" fill="${textColor}" font-family="${SERIF}" text-anchor="middle">${display}</text>`;
      });
    });

    // ── Median summary row ──
    const medianY = pad.t + rows.length * cellH + summaryGap;
    function medianOf(arr) {
      const s = arr.slice().sort((a, b) => a - b);
      if (s.length === 0) return 0;
      const m = Math.floor(s.length / 2);
      return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
    }
    // Faint divider above
    svg += `<line x1="${pad.l - 24}" y1="${medianY - summaryGap / 2}" x2="${pad.l + concepts.length * cellW}" y2="${medianY - summaryGap / 2}" stroke="#bbb" stroke-width="0.7"/>`;
    // Row label
    svg += `<text x="${pad.l - 20}" y="${medianY + summaryH / 2 + 3}" font-size="9" font-weight="bold" fill="#333" font-family="${SERIF}" text-anchor="end">Median</text>`;
    concepts.forEach((c, ci) => {
      const x = pad.l + ci * cellW;
      const colVals = rows.map(r => {
        if (mode === 'overall') return r.data.overall[c];
        if (mode === 'yes')     return r.data.by_decision.yes[c];
        if (mode === 'no')      return r.data.by_decision.no[c];
        return r.data.by_decision.yes[c] - r.data.by_decision.no[c];
      });
      const med = medianOf(colVals);
      let fill;
      if (mode === 'diff') {
        const t = Math.max(-1, Math.min(1, med));
        const a = Math.min(1, Math.abs(t) * 2);
        fill = t > 0 ? `rgba(229, 57, 53, ${a})` : `rgba(33, 150, 243, ${a})`;
      } else {
        const a = Math.max(0, Math.min(1, med));
        fill = `rgba(60, 64, 177, ${a})`;
      }
      const display = mode === 'diff'
        ? (med >= 0 ? '+' : '') + Math.round(med * 100) + ' pp'
        : Math.round(med * 100) + '%';
      const textColor = mode === 'diff'
        ? (Math.abs(med) > 0.4 ? '#fff' : '#333')
        : (med > 0.6 ? '#fff' : '#333');
      svg += `<rect x="${x}" y="${medianY}" width="${cellW}" height="${summaryH}" fill="${fill}" stroke="#bbb" stroke-width="0.7"/>`;
      svg += `<text x="${x + cellW / 2}" y="${medianY + summaryH / 2 + 3}" font-size="8" font-weight="bold" fill="${textColor}" font-family="${SERIF}" text-anchor="middle">${display}</text>`;
    });

    if (staticMode) {
      // Color-scale legend at the bottom of the static SVG.
      const gridBottom = pad.t + rows.length * cellH + summaryGap + summaryH;
      const legW = 240, legH = 10;
      const legX = pad.l + (concepts.length * cellW - legW) / 2;
      const legY = gridBottom + 22;
      const nSteps = 60;
      if (mode === 'diff') {
        for (let s = 0; s < nSteps; s++) {
          const tt = s / (nSteps - 1) * 2 - 1;
          const a = Math.min(1, Math.abs(tt) * 2);
          const fillCol = tt > 0 ? `rgba(229, 57, 53, ${a})` : `rgba(33, 150, 243, ${a})`;
          svg += `<rect x="${(legX + s * legW / nSteps).toFixed(2)}" y="${legY}" width="${(legW / nSteps + 0.5).toFixed(2)}" height="${legH}" fill="${fillCol}"/>`;
        }
        svg += `<rect x="${legX}" y="${legY}" width="${legW}" height="${legH}" fill="none" stroke="#ccc" stroke-width="0.5"/>`;
        svg += `<text x="${legX}"          y="${legY + legH + 11}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="start">&minus;50 pp</text>`;
        svg += `<text x="${legX + legW/2}" y="${legY + legH + 11}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="middle">0</text>`;
        svg += `<text x="${legX + legW}"   y="${legY + legH + 11}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="end">+50 pp</text>`;
        svg += `<text x="${legX + legW/2}" y="${legY + legH + 24}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="middle" font-style="italic">stay-home rate &minus; go-out rate (red = more in stay-home)</text>`;
      } else {
        for (let s = 0; s < nSteps; s++) {
          const a = s / (nSteps - 1);
          svg += `<rect x="${(legX + s * legW / nSteps).toFixed(2)}" y="${legY}" width="${(legW / nSteps + 0.5).toFixed(2)}" height="${legH}" fill="rgba(60, 64, 177, ${a})"/>`;
        }
        svg += `<rect x="${legX}" y="${legY}" width="${legW}" height="${legH}" fill="none" stroke="#ccc" stroke-width="0.5"/>`;
        svg += `<text x="${legX}"          y="${legY + legH + 11}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="start">0%</text>`;
        svg += `<text x="${legX + legW/2}" y="${legY + legH + 11}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="middle">50%</text>`;
        svg += `<text x="${legX + legW}"   y="${legY + legH + 11}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="end">100%</text>`;
        svg += `<text x="${legX + legW/2}" y="${legY + legH + 24}" font-size="9" fill="#666" font-family="${SERIF}" text-anchor="middle" font-style="italic">% of responses that mention each concept</text>`;
      }
      // No mode-toggle radios and no subtitle in paper context.
      el.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
      return;
    }
    el.innerHTML = `<div style="margin-bottom:6px">
      <label style="font-size:11px;margin-right:10px"><input type="radio" name="drv-mode" value="overall" ${mode==='overall'?'checked':''}> Overall</label>
      <label style="font-size:11px;margin-right:10px"><input type="radio" name="drv-mode" value="yes" ${mode==='yes'?'checked':''}> Stay-home only</label>
      <label style="font-size:11px;margin-right:10px"><input type="radio" name="drv-mode" value="no" ${mode==='no'?'checked':''}> Go-out only</label>
      <label style="font-size:11px;margin-right:10px"><input type="radio" name="drv-mode" value="diff" ${mode==='diff'?'checked':''}> Δ (stay − go)</label>
    </div>
    ${subtitleHTML(mode)}
    <svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;background:${SVG_BG};border:1px solid #ccc;max-width:100%;overflow:visible">${svg}</svg>`;
    el.querySelectorAll('input[name="drv-mode"]').forEach(r => r.addEventListener('change', e => draw(e.target.value)));
  }

  draw(staticMode || 'overall');
}
