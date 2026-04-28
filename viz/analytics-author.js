'use strict';
// analytics-author.js — Author Notes tab rendering
// Extracted from analytics.js during refactor (March 2026)

let authorCrossModelRendered = false;
let authorPerModelRendered = false;
function renderAuthorComparisons() {
  // Cross-model charts (27a, 27) — safe to render from any tab (use 860 fallback)
  if (!authorCrossModelRendered) {
    authorCrossModelRendered = true;
    loadAgentsJSON(() => {
      loadAllRegressions(allRegs => {
        renderTraitVsInfectionOR(allRegs, 'comparison-27a-chart');
        renderInfectionORProgression(allRegs, 'comparison-27-chart');
      });
    });
  }
}
function renderAuthorPerModelComparisons() {
  // Per-model charts (28a, 28) — must render when Author Notes tab is visible
  if (authorPerModelRendered) return;
  authorPerModelRendered = true;
  loadAgentsJSON(() => {
    // 28a: waterfall (uses fig36 IDs now in Author Notes)
    buildModelPicker('fig36-model-select', 0, idx => {
      loadMicro(idx, (rows, cfg) => {
        loadRegression(idx, (regData) => {
          renderFig36Waterfall(rows, cfg, regData);
        });
      });
    });
    // Initial render for 28a
    loadMicro(0, (rows, cfg) => {
      loadRegression(0, (regData) => {
        renderFig36Waterfall(rows, cfg, regData);
      });
    });
    // 28 copy: three forces in comparison section
    buildModelPicker('comparison-28b-model-select', 0, idx => {
      loadMicro(idx, (rows, cfg) => {
        loadRegression(idx, (regData) => {
          renderFig37ThreeForces(rows, cfg, regData, 'comparison-28b-chart', 'comparison-28b-detail');
        });
      });
    });
    // Initial render for 28 copy
    loadMicro(0, (rows, cfg) => {
      loadRegression(0, (regData) => {
        renderFig37ThreeForces(rows, cfg, regData, 'comparison-28b-chart', 'comparison-28b-detail');
      });
    });
    // Decision Surface vs Figure 26 comparison
    buildModelPicker('comparison-surface-model-select', 0, idx => {
      loadRegression(idx, (regData, cfg) => renderDecisionSurface(regData, cfg, 'comparison-surface-chart'));
    });
    loadRegression(0, (regData, cfg) => renderDecisionSurface(regData, cfg, 'comparison-surface-chart'));
    buildModelPicker('comparison-surface-forces-model-select', 0, idx => {
      loadMicro(idx, (rows, cfg) => {
        loadRegression(idx, (regData) => {
          renderFig37ThreeForces(rows, cfg, regData, 'comparison-surface-forces-chart', 'comparison-surface-forces-detail');
        });
      });
    });
    loadMicro(0, (rows, cfg) => {
      loadRegression(0, (regData) => {
        renderFig37ThreeForces(rows, cfg, regData, 'comparison-surface-forces-chart', 'comparison-surface-forces-detail');
      });
    });
    // Fig 32: predicted vs actual transition points (moved from Cohort Misc to Author Notes)
    buildModelPicker('fig32-model-select', 0, idx => {
      loadMicro(idx, (rows, cfg) => {
        loadRegression(idx, (regData) => {
          renderFig32TransitionScatter(rows, cfg, regData);
        });
      });
    });
    loadMicro(0, (rows, cfg) => {
      loadRegression(0, (regData) => {
        renderFig32TransitionScatter(rows, cfg, regData);
      });
    });
  });
}

// ═══════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════
// Author Notes — Interactive Coefficient Bar Chart (Figure A1)
// ═══════════════════════════════════════════════════════════════
let figA1Rendered = false;
function renderFigA1CoefficientBars() {
  if (figA1Rendered) return;
  figA1Rendered = true;

  loadRegression(0, (regData, cfg) => {
    const el = document.getElementById('figA1-chart');
    if (!el) return;
    const coefs = regData.model2.coefficients;

    // Predictors to show (excluding intercept, infection_pct, infection_pct_sq)
    const traits = [
      { key: 'conscientious', label: 'Conscientious' },
      { key: 'agreeable',     label: 'Agreeable' },
      { key: 'open_to_exp',   label: 'Open to Exp.' },
      { key: 'age',           label: 'Age (per year)' },
      { key: 'male',          label: 'Male' },
      { key: 'extraverted',   label: 'Extraverted' },
      { key: 'emot_stable',   label: 'Emot. Stable' },
    ];

    // Also show infection at full range for comparison
    const bInf = coefs.infection_pct ? coefs.infection_pct.estimate : 0;
    const bInfSq = coefs.infection_pct_sq ? coefs.infection_pct_sq.estimate : 0;
    const infFullRange = bInf * 7 + bInfSq * 49;
    const interceptVal = coefs.intercept ? coefs.intercept.estimate : 0;

    const bars = traits.map(t => {
      const c = coefs[t.key];
      return { label: t.label, value: c ? c.estimate : 0, sig: c ? c.sig : '', type: 'trait' };
    });
    // Add infection full range and intercept as context bars
    bars.push({ label: 'Infection (0\u21927%)', value: infFullRange, sig: '***', type: 'context' });
    bars.push({ label: 'Intercept', value: interceptVal, sig: '***', type: 'context' });

    // Sort by value descending
    bars.sort((a, b) => b.value - a.value);

    const W = 780, barH = 28, padL = 130, padR = 80, padT = 10, padB = 30;
    const H = padT + bars.length * barH + padB;
    const maxAbs = Math.max(...bars.map(b => Math.abs(b.value)));
    const scale = (W - padL - padR) / 2 / maxAbs;
    const zeroX = padL + (W - padL - padR) / 2;

    let svg = '';
    // Zero line
    svg += `<line x1="${zeroX}" y1="${padT}" x2="${zeroX}" y2="${H - padB}" stroke="#999" stroke-width="1.5" stroke-dasharray="4,3"/>`;
    svg += `<text x="${zeroX}" y="${H - padB + 14}" text-anchor="middle" font-size="10" fill="#666" font-family="${SERIF}">0</text>`;

    bars.forEach((b, i) => {
      const y = padT + i * barH + barH / 2;
      const barW = Math.abs(b.value) * scale;
      const x = b.value >= 0 ? zeroX : zeroX - barW;
      const color = b.type === 'context' ? '#888'
        : b.value > 0 ? '#22863a' : '#cb2431';
      const opacity = b.type === 'context' ? 0.5 : 0.75;

      svg += `<rect x="${x}" y="${y - 10}" width="${barW}" height="20" fill="${color}" opacity="${opacity}" rx="2"/>`;
      svg += `<text x="${padL - 6}" y="${y + 4}" text-anchor="end" font-size="11" fill="#333" font-family="${SERIF}">${esc(b.label)}</text>`;
      // Value label — placed inside the bar when it's long enough, outside otherwise
      // (prevents the negative-bar value text from colliding with the row label).
      const sigStr = b.sig && b.sig !== 'ns' ? ' ' + b.sig : ' ns';
      const inside = barW > 70;
      let valX, anchor, fill;
      if (inside) {
        // Inside the bar — opposite end from where it grows
        valX = b.value >= 0 ? x + barW - 4 : x + 4;
        anchor = b.value >= 0 ? 'end' : 'start';
        fill = '#fff';
      } else {
        // Outside the bar
        valX = b.value >= 0 ? x + barW + 4 : x - 4;
        anchor = b.value >= 0 ? 'start' : 'end';
        fill = '#555';
      }
      svg += `<text x="${valX}" y="${y + 4}" text-anchor="${anchor}" font-size="10" fill="${fill}" font-family="monospace">${b.value >= 0 ? '+' : ''}${b.value.toFixed(2)}${sigStr}</text>`;
    });

    // Axis labels
    svg += `<text x="${padL}" y="${H - padB + 14}" text-anchor="middle" font-size="9" fill="#999" font-family="${SERIF}">&larr; Go out</text>`;
    svg += `<text x="${W - padR}" y="${H - padB + 14}" text-anchor="middle" font-size="9" fill="#999" font-family="${SERIF}">Stay home &rarr;</text>`;

    el.innerHTML = `<svg width="${W}" height="${H}" style="display:block;background:#fff">${svg}</svg>`;

    // Caption
    const cap = document.getElementById('figA1-caption');
    if (cap) cap.innerHTML = '<em>Green bars</em> push toward staying home; <em>red bars</em> push toward going out. Grey bars show the intercept and infection range for scale. All trait predictors are binary (0/1), so bar length equals the full effect of switching the trait on. "Infection (0&rarr;7%)" shows the total log-odds gained over the full infection range (including quadratic dampening). Coefficients from Model 2 (random-effects logit).';
  });
}

// ═══════════════════════════════════════════════════════════════
// Author Notes — Interactive Probability Calculator (Figure A2)
// ═══════════════════════════════════════════════════════════════
let figA2Rendered = false;
function renderFigA2Calculator() {
  if (figA2Rendered) return;
  figA2Rendered = true;

  loadRegression(0, (regData, cfg) => {
    const el = document.getElementById('figA2-calculator');
    if (!el) return;
    const coefs = regData.model2.coefficients;

    const traits = [
      { key: 'extraverted',   label: 'Extraverted', offLabel: 'Introverted',    coef: coefs.extraverted ? coefs.extraverted.estimate : 0 },
      { key: 'agreeable',     label: 'Agreeable',   offLabel: 'Antagonistic',   coef: coefs.agreeable ? coefs.agreeable.estimate : 0 },
      { key: 'conscientious', label: 'Conscientious', offLabel: 'Unconscientious', coef: coefs.conscientious ? coefs.conscientious.estimate : 0 },
      { key: 'emot_stable',   label: 'Emot. Stable', offLabel: 'Neurotic',      coef: coefs.emot_stable ? coefs.emot_stable.estimate : 0 },
      { key: 'open_to_exp',   label: 'Open to Exp.', offLabel: 'Closed',        coef: coefs.open_to_exp ? coefs.open_to_exp.estimate : 0 },
    ];
    const maleCoef = coefs.male ? coefs.male.estimate : 0;
    const ageCoef = coefs.age ? coefs.age.estimate : 0;
    const intercept = coefs.intercept ? coefs.intercept.estimate : 0;
    const bInf = coefs.infection_pct ? coefs.infection_pct.estimate : 0;
    const bInfSq = coefs.infection_pct_sq ? coefs.infection_pct_sq.estimate : 0;

    let html = '<div style="display:flex;gap:32px;flex-wrap:wrap">';

    // Left: controls
    html += '<div style="min-width:320px">';
    html += '<div style="font-weight:bold;margin-bottom:8px;font-size:13px;color:#111">Agent Traits</div>';
    traits.forEach(t => {
      html += `<div style="margin:4px 0;display:flex;align-items:center;gap:8px">`;
      html += `<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px">`;
      html += `<input type="checkbox" class="calc-trait" data-key="${t.key}" data-coef="${t.coef}" style="width:16px;height:16px">`;
      html += `<span class="calc-trait-label" data-key="${t.key}" style="min-width:120px">${t.offLabel}</span>`;
      html += `<span style="color:#999;font-size:10px;font-family:monospace">(${t.coef >= 0 ? '+' : ''}${t.coef.toFixed(3)})</span>`;
      html += '</label></div>';
    });

    html += '<div style="margin:8px 0 4px;display:flex;align-items:center;gap:8px">';
    html += '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px">';
    html += `<input type="checkbox" class="calc-male" style="width:16px;height:16px">`;
    html += `<span class="calc-male-label" style="min-width:120px">Female</span>`;
    html += `<span style="color:#999;font-size:10px;font-family:monospace">(${maleCoef >= 0 ? '+' : ''}${maleCoef.toFixed(3)})</span>`;
    html += '</label></div>';

    html += '<div style="margin:8px 0 4px;font-size:12px">';
    html += `<label>Age: <input type="range" class="calc-age" min="18" max="65" value="40" style="width:120px"> <span class="calc-age-val">40</span></label>`;
    html += `<span style="color:#999;font-size:10px;font-family:monospace"> (&times; ${ageCoef.toFixed(3)} per year)</span>`;
    html += '</div>';

    html += '<div style="margin:8px 0 4px;font-size:12px">';
    html += `<label>Infection: <input type="range" class="calc-inf" min="0" max="7" step="0.1" value="3" style="width:120px"> <span class="calc-inf-val">3.0</span>%</label>`;
    html += '</div>';
    html += '</div>';  // end left

    // Right: result
    html += '<div style="min-width:260px">';
    html += '<div style="font-weight:bold;margin-bottom:8px;font-size:13px;color:#111">Predicted Outcome</div>';
    html += '<div class="calc-result" style="font-family:monospace;font-size:12px;line-height:1.8;background:#f5f5f5;padding:12px;border-radius:6px;min-height:160px"></div>';
    html += '<div class="calc-bar-container" style="margin-top:12px"></div>';
    html += '</div>';

    html += '</div>';  // end flex
    el.innerHTML = html;

    // Wire up interactivity
    function recalculate() {
      let logOdds = intercept;
      let breakdown = `Intercept: ${intercept.toFixed(3)}\n`;

      // Traits
      const checks = el.querySelectorAll('.calc-trait');
      checks.forEach(cb => {
        const c = parseFloat(cb.dataset.coef);
        const active = cb.checked;
        if (active) {
          logOdds += c;
          breakdown += `${cb.dataset.key}: ${c >= 0 ? '+' : ''}${c.toFixed(3)}\n`;
        }
        // Update label
        const lbl = el.querySelector(`.calc-trait-label[data-key="${cb.dataset.key}"]`);
        const t = traits.find(t => t.key === cb.dataset.key);
        if (lbl && t) lbl.textContent = active ? t.label : t.offLabel;
      });

      // Gender
      const maleCheck = el.querySelector('.calc-male');
      const maleLbl = el.querySelector('.calc-male-label');
      if (maleCheck.checked) {
        logOdds += maleCoef;
        breakdown += `male: ${maleCoef >= 0 ? '+' : ''}${maleCoef.toFixed(3)}\n`;
        if (maleLbl) maleLbl.textContent = 'Male';
      } else {
        if (maleLbl) maleLbl.textContent = 'Female';
      }

      // Age
      const age = parseFloat(el.querySelector('.calc-age').value);
      el.querySelector('.calc-age-val').textContent = age;
      const ageContrib = ageCoef * age;
      logOdds += ageContrib;
      breakdown += `age(${age}): ${ageContrib >= 0 ? '+' : ''}${ageContrib.toFixed(3)}\n`;

      // Infection
      const inf = parseFloat(el.querySelector('.calc-inf').value);
      el.querySelector('.calc-inf-val').textContent = inf.toFixed(1);
      const infContrib = bInf * inf + bInfSq * inf * inf;
      logOdds += infContrib;
      breakdown += `infection(${inf.toFixed(1)}%): ${infContrib >= 0 ? '+' : ''}${infContrib.toFixed(3)}\n`;

      const prob = 1 / (1 + Math.exp(-logOdds));
      const odds = Math.exp(logOdds);

      const resultEl = el.querySelector('.calc-result');
      resultEl.innerHTML =
        `<div style="margin-bottom:6px"><strong>Log-odds:</strong> ${logOdds >= 0 ? '+' : ''}${logOdds.toFixed(3)}</div>` +
        `<div style="margin-bottom:6px"><strong>Odds:</strong> ${odds > 1e6 ? odds.toExponential(1) : odds > 100 ? Math.round(odds).toLocaleString() : odds.toFixed(2)}</div>` +
        `<div style="margin-bottom:6px"><strong>P(stay home):</strong> <span style="font-size:16px;font-weight:bold;color:${prob > 0.5 ? '#22863a' : '#cb2431'}">${(prob * 100).toFixed(2)}%</span></div>` +
        `<div style="font-size:11px;color:${logOdds > 0 ? '#22863a' : '#cb2431'}">Decision: ${logOdds > 0 ? 'STAY HOME' : 'GO OUT'} (log-odds ${logOdds > 0 ? '&gt;' : '&lt;'} 0)</div>`;

      // Probability bar
      const barEl = el.querySelector('.calc-bar-container');
      const pPct = (prob * 100).toFixed(1);
      const color = prob > 0.5 ? '#22863a' : '#cb2431';
      barEl.innerHTML =
        `<div style="background:#e5e5e5;border-radius:4px;height:20px;width:100%;position:relative;overflow:hidden">` +
        `<div style="background:${color};height:100%;width:${pPct}%;border-radius:4px;transition:width 0.2s"></div>` +
        `<div style="position:absolute;left:50%;top:0;height:100%;width:1px;background:#333;opacity:0.4"></div>` +
        `</div>` +
        `<div style="display:flex;justify-content:space-between;font-size:9px;color:#999;margin-top:2px"><span>0% (go out)</span><span>50%</span><span>100% (stay home)</span></div>`;
    }

    el.querySelectorAll('.calc-trait, .calc-male').forEach(cb => cb.addEventListener('change', recalculate));
    el.querySelector('.calc-age').addEventListener('input', recalculate);
    el.querySelector('.calc-inf').addEventListener('input', recalculate);
    recalculate(); // initial
  });
}

// ═══════════════════════════════════════════════════════════════
// Author Notes — Cross-Model Effect Comparison (Figure A3)
// ═══════════════════════════════════════════════════════════════
let figA3Rendered = false;
function renderFigA3CrossModelEffects() {
  if (figA3Rendered) return;
  figA3Rendered = true;

  loadAllRegressions(allRegs => {
    const el = document.getElementById('figA3-chart');
    if (!el) return;

    const traitKeys = [
      { key: 'conscientious', label: 'Conscientious' },
      { key: 'extraverted',   label: 'Extraverted' },
      { key: 'agreeable',     label: 'Agreeable' },
      { key: 'emot_stable',   label: 'Emot. Stable' },
      { key: 'open_to_exp',   label: 'Open to Exp.' },
      { key: 'male',          label: 'Male' },
    ];

    // Gather data: for each config, extract all trait coefficients
    const configs = CONFIG.MODELS.map(m => configDirKey(m));
    const modelData = [];
    configs.forEach((key, i) => {
      const reg = allRegs[key];
      if (!reg || !reg.model2 || !reg.model2.coefficients) return;
      const c = reg.model2.coefficients;
      const m = CONFIG.MODELS[i];
      const vals = {};
      traitKeys.forEach(t => {
        vals[t.key] = c[t.key] ? c[t.key].estimate : null;
      });
      vals.intercept = c.intercept ? c.intercept.estimate : null;
      modelData.push({ key, label: m.label, color: m.color, provider: m.provider, vals });
    });

    if (!modelData.length) { el.innerHTML = '<p style="color:#c00">No regression data loaded.</p>'; return; }

    // Layout: one row per trait, dots for each model
    const W = 780, rowH = 36, padL = 110, padR = 30, padT = 16, padB = 30;
    const H = padT + traitKeys.length * rowH + padB;

    // Find global min/max across all traits and models
    let gMin = 0, gMax = 0;
    modelData.forEach(md => {
      traitKeys.forEach(t => {
        const v = md.vals[t.key];
        if (v != null) { gMin = Math.min(gMin, v); gMax = Math.max(gMax, v); }
      });
    });
    const absMax = Math.max(Math.abs(gMin), Math.abs(gMax)) * 1.1;
    const xScale = (W - padL - padR) / (2 * absMax);
    const zeroX = padL + (W - padL - padR) / 2;

    let svg = '';
    // Zero line
    svg += `<line x1="${zeroX}" y1="${padT}" x2="${zeroX}" y2="${H - padB}" stroke="#999" stroke-width="1" stroke-dasharray="4,3"/>`;

    // Axis labels
    const ticks = [-8, -4, 0, 4, 8];
    ticks.forEach(v => {
      if (Math.abs(v) > absMax) return;
      const x = zeroX + v * xScale;
      svg += `<text x="${x}" y="${H - padB + 14}" text-anchor="middle" font-size="9" fill="#999" font-family="${SERIF}">${v >= 0 ? '+' : ''}${v}</text>`;
      if (v !== 0) svg += `<line x1="${x}" y1="${padT}" x2="${x}" y2="${H - padB}" stroke="#f0f0f0" stroke-width="0.5"/>`;
    });

    traitKeys.forEach((t, row) => {
      const cy = padT + row * rowH + rowH / 2;
      // Row label
      svg += `<text x="${padL - 6}" y="${cy + 4}" text-anchor="end" font-size="11" fill="#333" font-family="${SERIF}">${t.label}</text>`;
      // Guide line
      svg += `<line x1="${padL}" y1="${cy}" x2="${W - padR}" y2="${cy}" stroke="#f0f0f0" stroke-width="0.5"/>`;

      // Plot each model's coefficient
      modelData.forEach(md => {
        const v = md.vals[t.key];
        if (v == null) return;
        const cx = zeroX + v * xScale;
        const isOpus = md.key === 'anthropic_claude-opus-4-5_off';
        const r = isOpus ? 6 : 4;
        const opacity = isOpus ? 1 : 0.5;
        const stroke = isOpus ? '#333' : 'none';
        const sw = isOpus ? 1.5 : 0;
        const tipText = `${md.label}: ${v >= 0 ? '+' : ''}${v.toFixed(3)}`;
        svg += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${md.color}" opacity="${opacity}" stroke="${stroke}" stroke-width="${sw}">`;
        svg += `<title>${esc(tipText)}</title></circle>`;
      });
    });

    svg += `<text x="${padL}" y="${H - padB + 14}" text-anchor="start" font-size="9" fill="#999" font-family="${SERIF}">&larr; Go out</text>`;
    svg += `<text x="${W - padR}" y="${H - padB + 14}" text-anchor="end" font-size="9" fill="#999" font-family="${SERIF}">Stay home &rarr;</text>`;

    el.innerHTML = `<svg width="${W}" height="${H}" style="display:block;background:#fff">${svg}</svg>`;

    const cap = document.getElementById('figA3-caption');
    if (cap) cap.innerHTML = 'Each dot is one of the 21 LLM configurations. <strong>Large dark-outlined dots</strong> are Claude Opus 4.5. Dots further from zero indicate stronger effects. Hover for exact values. Notice how direction is consistent (same side of zero) across nearly all models, but magnitude varies by orders of magnitude &mdash; the central finding of RQ5.';
  });
}

// renderTab2() removed — heatmap + concordance moved to Agent Curve subtab in Mobility Curves

// ═══════════════════════════════════════════════════════════════
// AUTHOR NOTES — DATE TIMELINES
// ═══════════════════════════════════════════════════════════════

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
