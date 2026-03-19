// ============================================================
// GABM Mobility Curve — Agent Schedule
// Determines who goes out vs stays home at each infection level.
// Depends on: map-layout.js (LOC_KEYS, BUILDINGS, LOCATIONS, MAP_PX_W/H)
// ============================================================

'use strict';

// ── Persistent toggle state for bio panel reasoning sections ──
const expandedToggles = new Set();

// ── Deterministic location assignment ────────────────────────
function deterministicLoc(id, step, salt) {
  return ((id * 31 + step * 7 + salt * 53) >>> 0) % LOC_KEYS.length;
}

// ── Get all interior tile positions for a building ───────────
function getBuildingTiles(locationKey) {
  const b = BUILDINGS[locationKey];
  if (!b) return [];
  const tiles = [];
  for (const p of b.parts) {
    const mx = Math.min(1, Math.floor(p.w / 3));
    const my = Math.min(1, Math.floor(p.h / 3));
    for (let dy = my; dy < p.h - my; dy++)
      for (let dx = mx; dx < p.w - mx; dx++) {
        if (b.blockedZones) {
          let blocked = false;
          for (const z of b.blockedZones) {
            if (p.dx + dx >= z.dx && p.dx + dx < z.dx + z.w &&
                p.dy + dy >= z.dy && p.dy + dy < z.dy + z.h) {
              blocked = true; break;
            }
          }
          if (blocked) continue;
        }
        tiles.push({ x: (b.tx + p.dx + dx) * TILE + TILE / 2,
                      y: (b.ty + p.dy + dy) * TILE + TILE / 2 });
      }
  }
  return tiles;
}

// ── Spread agents within a building interior ─────────────────
function getLocPosition(locationKey, id, step, subStep) {
  const b = BUILDINGS[locationKey];
  if (!b) return { x: MAP_PX_W / 2, y: MAP_PX_H / 2 };

  const salt = 99 + (subStep || 0) * 23;
  const hash = ((id * 31 + step * 7 + salt * 53) >>> 0);

  const tiles = [];
  for (const p of b.parts) {
    const mx = Math.min(1, Math.floor(p.w / 3));
    const my = Math.min(1, Math.floor(p.h / 3));
    for (let dy = my; dy < p.h - my; dy++)
      for (let dx = mx; dx < p.w - mx; dx++) {
        if (b.blockedZones) {
          let blocked = false;
          for (const z of b.blockedZones) {
            if (p.dx + dx >= z.dx && p.dx + dx < z.dx + z.w &&
                p.dy + dy >= z.dy && p.dy + dy < z.dy + z.h) {
              blocked = true; break;
            }
          }
          if (blocked) continue;
        }
        tiles.push({ x: (b.tx + p.dx + dx) * TILE + TILE / 2,
                      y: (b.ty + p.dy + dy) * TILE + TILE / 2 });
      }
  }

  if (tiles.length === 0) {
    const p = b.parts[0];
    return { x: (b.tx + p.dx + p.w / 2) * TILE, y: (b.ty + p.dy + p.h / 2) * TILE };
  }

  const tile = tiles[hash % tiles.length];
  return { x: tile.x, y: tile.y };
}

// ── Main: getAgentDayPlan for mobility curve ─────────────────
// agentDecisions[levelIdx][agentId] = 'yes'|'no' (set in town.js)
function getAgentDayPlan(agentId, levelIdx) {
  const homePos = getHomePosT(agentId);
  const decision = (typeof agentDecisions !== 'undefined' && agentDecisions[levelIdx])
    ? agentDecisions[levelIdx][agentId] : 'no';

  const staysHome = (decision === 'yes');

  if (staysHome) {
    // Agent stays home — no movement
    return {
      subSteps: [
        { slot: 0, locationKey: 'home', x: homePos.x, y: homePos.y, label: 'home' },
        { slot: 1, locationKey: 'home', x: homePos.x, y: homePos.y, label: 'home' },
      ],
      emoji: '🏠',
      staysHome: true,
    };
  }

  // Agent goes out — assign to a building
  const locIdx = deterministicLoc(agentId, levelIdx, 0);
  const locKey = LOC_KEYS[locIdx];
  const pos = getLocPosition(locKey, agentId, levelIdx, 0);

  return {
    subSteps: [
      { slot: 0, locationKey: locKey, x: pos.x, y: pos.y, label: 'out' },
      { slot: 1, locationKey: 'home', x: homePos.x, y: homePos.y, label: 'evening' },
    ],
    emoji: LOCATIONS[locKey]?.emoji || '🚶',
    staysHome: false,
  };
}

// ── Bio panel HTML ───────────────────────────────────────────
function buildBioHtml(id, agentInfo, decision, reasoningText) {
  const name = agentInfo?.name || `Agent ${id}`;
  const age = agentInfo?.age || '?';
  const traits = (agentInfo?.traits || [])
    .map(t => `<span class="trait">${t}</span>`).join(' ');

  // Vote breakdown from reps
  const levelIdx = typeof currentStep !== 'undefined' ? currentStep : 0;
  const votes = (typeof agentVoteCount !== 'undefined' && agentVoteCount[levelIdx])
    ? agentVoteCount[levelIdx][id] : null;
  let repInfo = '';
  if (votes) {
    const total = votes.yes + votes.no;
    const majority = Math.max(votes.yes, votes.no);
    repInfo = ` <span style="opacity:0.7;font-size:0.85em">(${majority}/${total} reps)</span>`;
  }

  const decisionLabel = decision === 'yes'
    ? `<span style="color:#F97316">🏠 Stayed Home${repInfo}</span>`
    : `<span style="color:#3B82F6">🚶 Went Out${repInfo}</span>`;

  // Extract sprite portrait
  let spriteImg = '';
  if (typeof scene !== 'undefined' && scene && agentCharNames && agentCharNames[id]) {
    const charName = agentCharNames[id];
    const frame = scene.textures.getFrame(charName, 'down');
    if (frame) {
      const cvs = document.createElement('canvas');
      cvs.width = frame.width; cvs.height = frame.height;
      const ctx = cvs.getContext('2d');
      ctx.drawImage(frame.source.image, frame.cutX, frame.cutY,
        frame.cutWidth, frame.cutHeight, 0, 0, frame.width, frame.height);
      spriteImg = cvs.toDataURL();
    }
  }
  const portraitHtml = spriteImg
    ? `<img src="${spriteImg}" style="width:32px;height:32px;image-rendering:pixelated;image-rendering:crisp-edges;float:right;margin:0 0 4px 8px">`
    : '';

  // Build grouped reasonings from all reps
  const allReps = (typeof agentAllReasoning !== 'undefined' && agentAllReasoning[levelIdx])
    ? agentAllReasoning[levelIdx][id] : null;

  let reasoningHtml = '';
  if (allReps && allReps.length > 0) {
    const homeReps = allReps.filter(r => r.response === 'yes');
    const outReps = allReps.filter(r => r.response === 'no');
    const total = allReps.length;

    // Header with vote breakdown
    if (homeReps.length === total) {
      reasoningHtml = `<div class="bio-reasoning-label">REASONING (${total}/${total})</div>`;
    } else if (outReps.length === total) {
      reasoningHtml = `<div class="bio-reasoning-label">REASONING (${total}/${total})</div>`;
    } else {
      reasoningHtml = `<div class="bio-reasoning-label">REASONING (${homeReps.length}/${total} Home, ${outReps.length}/${total} Out)</div>`;
    }

    // Show first rep inline, rest collapsed
    const firstRep = allReps[0];
    const firstTxt = (firstRep.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const firstColor = firstRep.response === 'yes' ? '#F97316' : '#3B82F6';
    const firstIcon = firstRep.response === 'yes' ? '🏠' : '🚶';
    reasoningHtml += `<div class="bio-reasoning" style="color:${firstColor};margin-bottom:2px">${firstIcon} Rep 1:</div>`;
    reasoningHtml += `<div class="bio-reasoning">${firstTxt}</div>`;

    if (total > 1) {
      const toggleId = `reasoning-toggle-${id}-${levelIdx}`;
      const isExpanded = expandedToggles.has(toggleId);
      const initDisplay = isExpanded ? 'block' : 'none';
      const initLabel = isExpanded ? `Hide reps 2-${total}` : `Show reps 2-${total}`;
      reasoningHtml += `<div style="margin-top:4px">
        <span class="bio-reasoning-toggle" onclick="var el=document.getElementById('${toggleId}');var show=el.style.display==='none';el.style.display=show?'block':'none';this.textContent=show?'Hide reps 2-${total}':'Show reps 2-${total}';if(show){expandedToggles.add('${toggleId}')}else{expandedToggles.delete('${toggleId}')}"
          style="color:#4a6580;font-size:10px;font-family:Georgia,serif;cursor:pointer;text-decoration:underline">${initLabel}</span>
      </div>`;
      reasoningHtml += `<div id="${toggleId}" style="display:${initDisplay}">`;

      // Group remaining reps by response type
      for (let i = 1; i < allReps.length; i++) {
        const r = allReps[i];
        const txt = (r.text || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const color = r.response === 'yes' ? '#F97316' : '#3B82F6';
        const icon = r.response === 'yes' ? '🏠' : '🚶';
        reasoningHtml += `<div class="bio-reasoning" style="color:${color};margin-top:4px">${icon} Rep ${i + 1}:</div>`;
        reasoningHtml += `<div class="bio-reasoning">${txt}</div>`;
      }
      reasoningHtml += `</div>`;
    }
  } else {
    const reasoning = (reasoningText || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    reasoningHtml = `<div class="bio-reasoning-label">REASONING</div><div class="bio-reasoning">${reasoning || '—'}</div>`;
  }

  // Agent timeline — 40 dots showing decision at each infection level
  let timelineSvg = '';
  if (typeof agentDecisions !== 'undefined') {
    const dotR = 3.5, dotSpacing = 6, padX = 44, svgW = 240, rowH = 28, svgH = rowH * 2 + 4;
    let dots = '';
    for (let li = 0; li <= 39; li++) {
      const d = agentDecisions[li]?.[id] || 'no';
      const v = (typeof agentVoteCount !== 'undefined' && agentVoteCount[li])
        ? agentVoteCount[li][id] : null;
      let conf = 1.0;
      if (v) { const maj = Math.max(v.yes, v.no); conf = maj / (v.yes + v.no); }
      const col = confidenceCssColor(d, conf);
      const row = li < 20 ? 0 : 1;
      const cx = padX + (li % 20) * dotSpacing + dotR;
      const cy = row * rowH + rowH / 2;
      if (li === levelIdx) {
        dots += `<circle cx="${cx}" cy="${cy}" r="${dotR + 2}" fill="none" stroke="#666" stroke-width="1.5"/>`;
      }
      dots += `<circle cx="${cx}" cy="${cy}" r="${dotR}" fill="${col}"/>`;
    }
    // Row range labels — computed from actual CONFIG.INFECTION_LEVELS
    const lvls = (typeof CONFIG !== 'undefined' && CONFIG.INFECTION_LEVELS) ? CONFIG.INFECTION_LEVELS : [];
    const r1end = lvls[19] != null ? lvls[19] + '%' : '~2%';
    const r2start = lvls[20] != null ? lvls[20] + '%' : '~2%';
    const r2end = lvls[39] != null ? lvls[39] + '%' : '7%';
    const rowLabels =
      `<text x="2" y="${rowH / 2 + 4}" fill="#888" font-size="9" font-family="Georgia,serif">0–${r1end}</text>` +
      `<text x="2" y="${rowH + rowH / 2 + 4}" fill="#888" font-size="9" font-family="Georgia,serif">${r2start}–${r2end}</text>`;
    timelineSvg = `
      <div class="bio-reasoning-label" style="margin-top:6px">Response to New Cases (% population)</div>
      <svg width="${svgW}" height="${svgH}" style="display:block;margin:2px 0">
        ${rowLabels}${dots}
      </svg>
      <div style="display:flex;gap:8px;font-size:10px;color:#555;font-family:Georgia,serif;margin-top:4px;padding:0 4px;flex-wrap:wrap">
        <span><span style="color:#F97316">●</span> Home</span>
        <span><span style="color:#3B82F6">●</span> Out</span>
        <span><span style="color:#FBBF24">●</span>/<span style="color:#60A5FA">●</span> 4/5</span>
        <span><span style="color:#FDE68A">●</span>/<span style="color:#93C5FD">●</span> 3/5</span>
      </div>`;
  }

  return `
    <div class="bio-name">${portraitHtml}${name}</div>
    <div class="bio-meta">Age ${age}</div>
    <div class="bio-traits">${traits}</div>
    <div class="bio-decision">${decisionLabel}</div>
    ${timelineSvg}
    ${reasoningHtml}
  `;
}

// ── Utility: decision colour (colorblind-safe blue/orange) ─────
function decisionHex(decision) {
  return decision === 'yes' ? 0xF97316 : 0x3B82F6;
}

function decisionCssColor(decision) {
  return decision === 'yes' ? '#F97316' : '#3B82F6';
}

// Colorblind-safe confidence gradient
// confidence = majority/total (0.6 for 3/5, 0.8 for 4/5, 1.0 for 5/5)
function confidenceCssColor(decision, confidence) {
  if (decision === 'yes') {
    // Home: orange (1.0) → amber (0.8) → pale yellow (0.6)
    if (confidence >= 0.95) return '#F97316';
    if (confidence >= 0.75) return '#FBBF24';
    return '#FDE68A';
  } else {
    // Out: blue (1.0) → mid-blue (0.8) → light blue (0.6)
    if (confidence >= 0.95) return '#3B82F6';
    if (confidence >= 0.75) return '#60A5FA';
    return '#93C5FD';
  }
}

function confidenceHex(decision, confidence) {
  if (decision === 'yes') {
    if (confidence >= 0.95) return 0xF97316;
    if (confidence >= 0.75) return 0xFBBF24;
    return 0xFDE68A;
  } else {
    if (confidence >= 0.95) return 0x3B82F6;
    if (confidence >= 0.75) return 0x60A5FA;
    return 0x93C5FD;
  }
}
