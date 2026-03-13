// ============================================================
// GABM Mobility Curve — Town Agents
// Agent sprites, animations, movement, decision visualization.
// Depends on: map-layout.js, agent-schedule.js,
//             town-render.js, town-pathfinding.js
// ============================================================

'use strict';

// ─── 100 character sprites (Pipoya RPG — 50 male, 50 female, shuffled) ──
// Gender-aligned: agent[i] name gender matches CHAR_NAMES[i] sprite gender
const CHAR_NAMES = [
  'Pipoya_F01', 'Pipoya_M01', 'Pipoya_F02', 'Pipoya_M02', 'Pipoya_M03', // Ashley(F), Luis(M), Rosa(F), Hector(M), Matt(M)
  'Pipoya_M04', 'Pipoya_F03', 'Pipoya_F04', 'Pipoya_M05', 'Pipoya_M06', // Tony(M), Barbara(F), Sandra(F), Adam(M), Sam(M)
  'Pipoya_F05', 'Pipoya_F06', 'Pipoya_F07', 'Pipoya_M07', 'Pipoya_F08', // Leslie(F), Pamela(F), Isabel(F), Miguel(M), Sharon(F)
  'Pipoya_F09', 'Pipoya_M08', 'Pipoya_M09', 'Pipoya_M10', 'Pipoya_M11', // Diana(F), John(M), Greg(M), Mark(M), Michael(M)
  'Pipoya_F10', 'Pipoya_M12', 'Pipoya_M13', 'Pipoya_M14', 'Pipoya_M15', // Lisa(F), Jesus(M), Jaime(M), Jorge(M), Stephen(M)
  'Pipoya_F11', 'Pipoya_M16', 'Pipoya_M17', 'Pipoya_F12', 'Pipoya_M18', // Brittany(F), Alejandro(M), Martin(M), Victoria(F), Danny(M)
  'Pipoya_F13', 'Pipoya_M19', 'Pipoya_M20', 'Pipoya_M21', 'Pipoya_M22', // Laura(F), Brandon(M), Paul(M), Jordan(M), Jacob(M)
  'Pipoya_M23', 'Pipoya_F14', 'Pipoya_F15', 'Pipoya_F16', 'Pipoya_F17', // Carlos(M), Paula(F), Kayla(F), Jennifer(F), Cynthia(F)
  'Pipoya_M24', 'Pipoya_F18', 'Pipoya_F19', 'Pipoya_M25', 'Pipoya_M26', // Nick(M), Elizabeth(F), Alicia(F), Jose(M), Patrick(M)
  'Pipoya_F20', 'Pipoya_F21', 'Pipoya_F22', 'Pipoya_M27', 'Pipoya_M28', // Donna(F), Tiffany(F), Nicole(F), Julio(M), Andrew(M)
  'Pipoya_F23', 'Pipoya_F24', 'Pipoya_F25', 'Pipoya_M29', 'Pipoya_F26', // Amy(F), Teresa(F), Kelly(F), Joe(M), Adriana(F)
  'Pipoya_M30', 'Pipoya_F27', 'Pipoya_M31', 'Pipoya_M32', 'Pipoya_F28', // Anthony(M), Kim(F), Fernando(M), Bill(M), Monica(F)
  'Pipoya_M33', 'Pipoya_M34', 'Pipoya_F29', 'Pipoya_F30', 'Pipoya_M35', // Sean(M), Joel(M), Christina(F), Amber(F), Christopher(M)
  'Pipoya_M36', 'Pipoya_F31', 'Pipoya_F32', 'Pipoya_M37', 'Pipoya_M38', // Adrian(M), Nancy(F), Jasmine(F), Ben(M), Roberto(M)
  'Pipoya_M39', 'Pipoya_M40', 'Pipoya_M41', 'Pipoya_F33', 'Pipoya_F34', // Juan(M), William(M), Mike(M), Jessica(F), Lori(F)
  'Pipoya_F35', 'Pipoya_M42', 'Pipoya_M43', 'Pipoya_F36', 'Pipoya_F37', // Martha(F), Raul(M), Josh(M), Melissa(F), Brenda(F)
  'Pipoya_F38', 'Pipoya_F39', 'Pipoya_F40', 'Pipoya_F41', 'Pipoya_F42', // Norma(F), Kimberly(F), Heather(F), Karen(F), Christine(F)
  'Pipoya_M44', 'Pipoya_M45', 'Pipoya_M46', 'Pipoya_M47', 'Pipoya_F43', // Gabriel(M), Richard(M), Kyle(M), Victor(M), Cindy(F)
  'Pipoya_F44', 'Pipoya_F45', 'Pipoya_F46', 'Pipoya_F47', 'Pipoya_F48', // Janet(F), Marie(F), Judy(F), Julia(F), Angela(F)
  'Pipoya_M48', 'Pipoya_F49', 'Pipoya_F50', 'Pipoya_M49', 'Pipoya_M50', // George(M), Tina(F), Angie(F), Joshua(M), Kevin(M)
];

// ─── Agent state arrays ──────────────────────────────────────
const agentContainers  = [];
const agentSprites     = [];
const agentBadges      = [];
const agentCharNames   = [];
const agentStatusTexts = [];
const agentInitials    = [];
const agentNameLabels  = [];  // full first name labels
const agentLocKey      = [];
const agentDestPos     = [];
const agentSettled     = new Array(100).fill(true);

// ═══════════════════════════════════════════════════════════════
// ANIMATIONS
// ═══════════════════════════════════════════════════════════════

function createAnimations(sc) {
  const DIRS = ['down', 'up', 'left', 'right'];
  CHAR_NAMES.forEach(name => {
    DIRS.forEach(dir => {
      sc.anims.create({
        key: `${name}_${dir}_walk`,
        frames: [
          { key: name, frame: `${dir}-walk.000` },
          { key: name, frame: `${dir}-walk.001` },
          { key: name, frame: `${dir}-walk.002` },
          { key: name, frame: `${dir}-walk.003` },
          { key: name, frame: `${dir}-walk.001` },
        ],
        frameRate: 6, repeat: -1,
      });
      sc.anims.create({
        key: `${name}_${dir}`,
        frames: [{ key: name, frame: dir }],
        frameRate: 1, repeat: 0,
      });
    });
  });
}

// ═══════════════════════════════════════════════════════════════
// AGENT CONTAINERS
// ═══════════════════════════════════════════════════════════════

function buildAgentContainers(sc) {
  for (let id = 0; id < 100; id++) {
    const charName = CHAR_NAMES[id % CHAR_NAMES.length];
    const homePos  = getHomePosT(id);

    const container = sc.add.container(homePos.x, homePos.y);
    container.setDepth(15 + (id % 10) * 0.01);

    // Glow (decision-colored)
    const glow = sc.add.graphics();
    glow.fillStyle(0x3B82F6, 0.16);
    glow.fillCircle(0, 0, 12);
    container.add(glow);

    // Sprite
    const sprite = sc.add.sprite(0, 2, charName, 'down');
    sprite.setScale(1.0);
    container.add(sprite);

    // Badge (decision indicator)
    const badge = sc.add.graphics();
    badge.setPosition(9, -13);
    container.add(badge);

    // Initials (for internal use)
    const parts = charName.split('_');
    const initials = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
    agentInitials.push(initials);

    // Name label (shows first name from agents.json)
    const nameLabel = sc.add.text(0, -28, '', {
      fontSize: '7px', fontFamily: '"Press Start 2P", monospace',
      color: '#3B82F6',
      stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0.5, 1);
    container.add(nameLabel);

    // Status text (location emoji)
    const statusTxt = sc.add.text(0, -40, '', {
      fontSize: '6px', fontFamily: 'monospace',
      color: '#000000', backgroundColor: '#ffffffaa',
      padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1);
    container.add(statusTxt);

    agentContainers.push(container);
    agentSprites.push(sprite);
    agentBadges.push(badge);
    agentCharNames.push(charName);
    agentStatusTexts.push(statusTxt);
    agentNameLabels.push(nameLabel);
    agentLocKey.push('home');
    agentDestPos.push({ x: homePos.x, y: homePos.y });
  }
}

// ── Badge / glow updates (decision-based) ────────────────────

function updateDecisionBadge(id, decision) {
  const badge = agentBadges[id];
  badge.clear();

  // Confidence from vote count
  let confidence = 1.0;
  const levelIdx = typeof currentStep !== 'undefined' ? currentStep : 0;
  const votes = (typeof agentVoteCount !== 'undefined' && agentVoteCount[levelIdx])
    ? agentVoteCount[levelIdx][id] : null;
  if (votes) {
    const total = votes.yes + votes.no;
    const majority = Math.max(votes.yes, votes.no);
    confidence = total > 0 ? majority / total : 0.6;
  }

  const col = confidenceHex(decision, confidence);
  badge.fillStyle(col, 1);
  badge.fillCircle(0, 0, 3.5);
}

function updateDecisionGlow(id, decision) {
  const glow = agentContainers[id].list[0];
  glow.clear();
  const col = decisionHex(decision);
  glow.fillStyle(col, 0.18);
  glow.fillCircle(0, 0, 12);
}

function updateNameLabelColor(id, decision) {
  const label = agentNameLabels[id];
  if (!label) return;

  let confidence = 1.0;
  const levelIdx = typeof currentStep !== 'undefined' ? currentStep : 0;
  const votes = (typeof agentVoteCount !== 'undefined' && agentVoteCount[levelIdx])
    ? agentVoteCount[levelIdx][id] : null;
  if (votes) {
    const maj = Math.max(votes.yes, votes.no);
    confidence = maj / (votes.yes + votes.no);
  }
  label.setColor(confidenceCssColor(decision, confidence));
}

// Keep epidemic-compatible stubs for code that references them
function updateBadge(id, condition) { updateDecisionBadge(id, 'no'); }
function updateGlow(id, condition)  { updateDecisionGlow(id, 'no'); }

// ═══════════════════════════════════════════════════════════════
// AGENT MOVEMENT (adapted for mobility curve)
// ═══════════════════════════════════════════════════════════════

function killAgentTweens() {
  agentContainers.forEach(c => scene.tweens.killTweensOf(c));
}

function moveAgents(animate) {
  killAgentTweens();
  if (typeof window._pathOverlayBegin === 'function') window._pathOverlayBegin();
  const subStepMs = animate ? Math.max(200, Math.round(10000 / playSpeed)) : 0;

  // Get decisions for current level
  const levelIdx = currentStep;

  // Pass 1: compute all plans
  const plans = [];
  for (let id = 0; id < agentContainers.length; id++) {
    plans[id] = getAgentDayPlan(id, levelIdx);
  }

  // Pass 2: assign unique tile positions per building (no stacking)
  const buildingAgents = {};
  for (let id = 0; id < agentContainers.length; id++) {
    const ss = plans[id].subSteps[currentSubStep];
    if (ss && ss.locationKey !== 'home') {
      if (!buildingAgents[ss.locationKey]) buildingAgents[ss.locationKey] = [];
      buildingAgents[ss.locationKey].push(id);
    }
  }

  // Simple pairing: pair adjacent agents in same building
  const pairOf = {};
  for (const [locKey, ids] of Object.entries(buildingAgents)) {
    // Deterministic shuffle
    const shuffled = ids.slice().sort((a, b) => {
      const ha = ((a * 31 + levelIdx * 7) >>> 0) % 9973;
      const hb = ((b * 31 + levelIdx * 7) >>> 0) % 9973;
      return ha - hb;
    });
    for (let i = 0; i + 1 < shuffled.length; i += 2) {
      pairOf[shuffled[i]] = shuffled[i + 1];
      pairOf[shuffled[i + 1]] = shuffled[i];
    }
  }

  // Assign unique tiles per building
  for (const [locKey, ids] of Object.entries(buildingAgents)) {
    const tiles = getBuildingTiles(locKey);
    if (tiles.length === 0) continue;

    const shuffled = ids.slice().sort((a, b) => {
      const ha = ((a * 31 + levelIdx * 7) >>> 0) % 9973;
      const hb = ((b * 31 + levelIdx * 7) >>> 0) % 9973;
      return ha - hb;
    });

    const seenPair = new Set();
    let nPairs = 0;
    for (const id of shuffled) {
      const p = pairOf[id];
      if (p !== undefined && !seenPair.has(p)) { nPairs++; seenPair.add(id); }
    }
    const nUnpaired = ids.length - nPairs * 2;
    const totalSlots = nPairs + nUnpaired;
    const stride = totalSlots > 0 ? Math.max(1, Math.floor(tiles.length / totalSlots)) : 1;

    let slotIdx = 0;
    const assigned = new Set();

    // Pairs
    for (const id of shuffled) {
      if (assigned.has(id)) continue;
      const partner = pairOf[id];
      if (partner === undefined || assigned.has(partner)) continue;
      const t = tiles[(slotIdx * stride) % tiles.length];
      slotIdx++;
      plans[id].subSteps[currentSubStep].x = t.x - 14;
      plans[id].subSteps[currentSubStep].y = t.y;
      plans[partner].subSteps[currentSubStep].x = t.x + 14;
      plans[partner].subSteps[currentSubStep].y = t.y;
      assigned.add(id);
      assigned.add(partner);
    }

    // Unpaired
    for (const id of shuffled) {
      if (assigned.has(id)) continue;
      const t = tiles[(slotIdx * stride) % tiles.length];
      slotIdx++;
      plans[id].subSteps[currentSubStep].x = t.x;
      plans[id].subSteps[currentSubStep].y = t.y;
      assigned.add(id);
    }
  }

  // Pass 3: move all agents
  for (let id = 0; id < agentContainers.length; id++) {
    const plan = plans[id];
    const ss = plan.subSteps[currentSubStep];
    if (!ss) continue;

    const decision = (typeof agentDecisions !== 'undefined' && agentDecisions[levelIdx])
      ? agentDecisions[levelIdx][id] : 'no';

    updateDecisionBadge(id, decision);
    updateDecisionGlow(id, decision);
    updateNameLabelColor(id, decision);

    const toPos = { x: ss.x, y: ss.y };
    const toKey = ss.locationKey;

    if (toKey !== 'home') setHomeLit(id, false);

    if (subStepMs === 0) {
      agentContainers[id].x = toPos.x;
      agentContainers[id].y = toPos.y;
      agentLocKey[id]  = toKey;
      agentDestPos[id] = toPos;
      agentSettled[id] = true;
      agentSprites[id].anims.play(`${agentCharNames[id]}_down`, false);
      if (agentStatusTexts[id]) {
        const emoji = toKey === 'home' ? '🏠' : (LOCATIONS[toKey]?.emoji || '');
        agentStatusTexts[id].setText(emoji);
      }
      agentContainers[id].setVisible(toKey !== 'home');
      if (toKey === 'home') setHomeLit(id, true);
    } else {
      agentSettled[id] = false;
      const fromPos = { x: agentContainers[id].x, y: agentContainers[id].y };
      const fromKey = agentLocKey[id];
      const waypoints = computeWalkPath(id, fromKey, fromPos, toKey, toPos);
      const staggerMs = Math.round(((id * 97 + levelIdx * 37) % 3000) / playSpeed);
      setTimeout(() => {
        if (!scene) return;
        agentContainers[id].setVisible(true);
        agentLocKey[id]  = toKey;
        agentDestPos[id] = toPos;
        if (agentStatusTexts[id]) {
          const destEmoji = toKey === 'home' ? '🏠' : (LOCATIONS[toKey]?.emoji || '');
          agentStatusTexts[id].setText(`🚶${destEmoji}`);
        }
        const budget = Math.max(200, subStepMs - staggerMs);
        chainWalkTimed(id, agentContainers[id], agentSprites[id], agentCharNames[id], waypoints, budget, toKey);
      }, staggerMs);
    }
  }
}

function chainWalkTimed(agentId, container, sprite, charName, waypoints, totalMs, toKey) {
  function markArrived() {
    container.x = agentDestPos[agentId].x;
    container.y = agentDestPos[agentId].y;
    agentSettled[agentId] = true;
    if (agentStatusTexts[agentId]) {
      const emoji = toKey === 'home' ? '🏠' : (LOCATIONS[toKey]?.emoji || '');
      agentStatusTexts[agentId].setText(emoji);
    }
    if (toKey === 'home') {
      container.setVisible(false);
      setHomeLit(agentId, true);
    }
  }

  if (!waypoints || waypoints.length === 0) {
    sprite.anims.play(`${charName}_down`, false);
    markArrived();
    return;
  }

  const starts = [{ x: container.x, y: container.y }, ...waypoints.slice(0, -1)];
  const dists  = waypoints.map((wp, i) => {
    const dx = wp.x - starts[i].x, dy = wp.y - starts[i].y;
    return Math.sqrt(dx * dx + dy * dy);
  });
  const totalDist = dists.reduce((s, d) => s + d, 0);

  if (totalDist < 2) {
    sprite.anims.play(`${charName}_down`, false);
    markArrived();
    return;
  }

  let wpIdx = 0;
  function walkNext() {
    if (wpIdx >= waypoints.length) {
      const prevIdx = waypoints.length - 1;
      const dx = waypoints[prevIdx].x - starts[prevIdx].x;
      const dy = waypoints[prevIdx].y - starts[prevIdx].y;
      sprite.anims.play(`${charName}_${getWalkDir(dx, dy)}`, false);
      markArrived();
      return;
    }

    const wp  = waypoints[wpIdx];
    const dx  = wp.x - container.x;
    const dy  = wp.y - container.y;
    const dist = dists[wpIdx];
    const dur  = Math.max(30, (dist / totalDist) * totalMs);
    const dir  = getWalkDir(dx, dy);

    sprite.anims.play(`${charName}_${dir}_walk`, true);
    scene.tweens.add({
      targets: container, x: wp.x, y: wp.y,
      duration: dur, ease: 'Linear',
      onComplete() { wpIdx++; walkNext(); },
    });
  }
  walkNext();
}
