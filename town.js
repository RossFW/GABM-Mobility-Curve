// ============================================================
// GABM Mobility Curve — Town.js
// Entry point: Phaser boot, data loading, playback loop.
//
// Depends on (loaded before this file):
//   papaparse.min.js, config.js, phaser.min.js,
//   map-layout.js, agent-schedule.js, town-render.js,
//   town-pathfinding.js, town-agents.js, town-ui.js
// ============================================================

'use strict';

// --- Viewport constants ---
const VIEW_W = 960;
const VIEW_H = 640;
const DEFAULT_ZOOM = 0.35;
const MIN_ZOOM = Math.max(VIEW_W / MAP_PX_W, VIEW_H / MAP_PX_H);

// --- Probe data ---
let agentDecisions    = {};  // levelIdx -> agentId -> 'yes'|'no' (majority vote)
let agentVoteCount    = {};  // levelIdx -> agentId -> {yes: n, no: n}
let agentReasoning    = {};  // levelIdx -> agentId -> first reasoning text
let agentAllReasoning = {};  // levelIdx -> agentId -> [reasoning per rep]
let agentsInfo        = {};  // agentId -> {name, age, traits}
let allModelsMacro    = {};  // configKey -> {level -> {pct_stay_home, ...}}

let maxStep = 39;          // 40 infection levels (0-39)
let currentStep    = 0;    // current infection level index
let currentSubStep = 0;    // 0 = out, 1 = go home
let currentModelIndex = 0; // index into CONFIG.MODELS

let isPlaying  = false;
let playSpeed  = 1;
let playTimer  = null;

// --- Phaser scene ref ---
let scene;

// --- Camera state ---
let isDragging = false;
let dragStartX = 0, dragStartY = 0;
let camScrollX0 = 0, camScrollY0 = 0;
const FOLLOW_ZOOM = 0.85;
const keysDown = new Set();

// ===============================================================
// PHASER BOOT
// ===============================================================

const game = window.__game = new Phaser.Game({
  type:            Phaser.WEBGL,
  width:           VIEW_W,
  height:          VIEW_H,
  backgroundColor: '#6AAF4A',
  parent:          'game-container',
  render: { antialias: false, roundPixels: false, pixelArt: true },
  scene:           { preload, create, update },
});

// ===============================================================
// PHASER LIFECYCLE
// ===============================================================

function preload() {
  CHAR_NAMES.forEach(name => {
    this.load.atlas(name, `assets/characters/${name}.png`, 'assets/characters/atlas.json');
  });

  const loaded = new Set();
  HOME_HOUSES.forEach(h => {
    const key = `house_${h.folder}_${h.sprite}`;
    if (!loaded.has(key)) {
      loaded.add(key);
      this.load.image(key, `assets/dewberry/houses/${h.folder}/${h.sprite}.png`);
    }
  });

  // Nature border assets
  const natAssets = {
    nat_tree_oak_1: 'assets/dewberry/trees/tree_oak_1.png',
    nat_tree_oak_2: 'assets/dewberry/trees/tree_oak_2.png',
    nat_tree_oak_3: 'assets/dewberry/trees/tree_oak_3.png',
    nat_pine_1: 'assets/dewberry/nature/pine_tree_1.png',
    nat_pine_2: 'assets/dewberry/nature/pine_tree_2.png',
    nat_pine_3: 'assets/dewberry/nature/pine_tree_3.png',
    nat_dew_1: 'assets/dewberry/nature/dewberry_bush_1.png',
    nat_dew_2: 'assets/dewberry/nature/dewberry_bush_2.png',
    nat_dew_3: 'assets/dewberry/nature/dewberry_bush_3.png',
    nat_lily: 'assets/dewberry/nature/lily_pads.png',
    nat_cattails: 'assets/dewberry/nature/cattails.png',
    nat_cabin: 'assets/dewberry/nature/cabin.png',
    nat_campfire: 'assets/dewberry/nature/campfire.png',
    nat_log_seat_1: 'assets/dewberry/nature/log_seat_1.png',
    nat_log_seat_2: 'assets/dewberry/nature/log_seat_2.png',
    nat_woodpile: 'assets/dewberry/nature/woodpile.png',
    nat_boulder_l: 'assets/dewberry/nature/boulder_large.png',
    nat_boulder_m: 'assets/dewberry/nature/boulder_medium.png',
    nat_boulder_s: 'assets/dewberry/nature/boulder_small.png',
    nat_berry_basket: 'assets/dewberry/nature/berry_basket.png',
    nat_mushroom: 'assets/dewberry/nature/mushroom_cluster.png',
    nat_fallen_log: 'assets/dewberry/nature/fallen_log.png',
    nat_sign: 'assets/dewberry/decorations/sign.png',
    nat_bush_1: 'assets/dewberry/decorations/bush_1.png',
    nat_bush_2: 'assets/dewberry/decorations/bush_2.png',
    nat_flowers_1: 'assets/dewberry/decorations/flowers_1.png',
    nat_flowers_2: 'assets/dewberry/decorations/flowers_2.png',
    nat_flowers_3: 'assets/dewberry/decorations/flowers_3.png',
  };
  for (const [key, path] of Object.entries(natAssets)) this.load.image(key, path);

  // Interior furniture sprites
  const intAssets = [
    'desk_student', 'chair_wooden', 'blackboard', 'podium_teacher', 'desk_teacher',
    'bookshelf_tall', 'bookshelf_wide', 'reading_table', 'globe',
    'table_round', 'table_long', 'chair_cushioned', 'sofa', 'potted_plant_indoor',
    'rug_ornate', 'counter_shop', 'cabinet_medicine', 'bed_single', 'bed_hospital',
    'stove_kitchen', 'barrel', 'crate_wooden', 'fireplace', 'piano', 'pulpit', 'pew_church', 'altar',
    'coffee_machine', 'pastry_display', 'cafe_menu_board', 'coffee_cups',
    'cafe_table_set', 'sink_kitchen', 'shelf_bottles',
    'market_shelf', 'produce_basket', 'cash_register',
    'workbench', 'tool_rack',
    'hay_bale', 'water_trough', 'pitchfork_rack', 'sack_grain', 'milk_pail',
  ];
  intAssets.forEach(name => this.load.image('int_' + name, `assets/dewberry/interiors/${name}.png`));
  this.load.image('int_potted_plant', 'assets/dewberry/interiors/potted_plant_indoor.png');

  const decoAssets = [
    'garden_plot', 'garden_arch', 'watering_can', 'scarecrow',
    'pond_water', 'duck', 'picnic_blanket',
    'swing_set', 'picnic_table', 'gazebo',
    'bench_1', 'bench_2', 'flowers_1', 'flowers_2', 'flowers_3',
    'fountain', 'bush_1', 'bush_2', 'lamp_1',
  ];
  decoAssets.forEach(name => this.load.image('ext_' + name, `assets/dewberry/decorations/${name}.png`));
  const natDecoAssets = ['lily_pads', 'boulder_small', 'log_seat_1'];
  natDecoAssets.forEach(name => this.load.image('ext_' + name, `assets/dewberry/nature/${name}.png`));
}

function create() {
  scene = this;

  const terrainGrid = buildTerrainGrid();
  renderTerrain(scene, terrainGrid);
  renderBuildings(scene);
  renderFurniture(scene);
  renderTownDecorations(scene);
  placeDecorations(scene, terrainGrid);
  renderHomes(scene);
  drawLocationLabels(scene);

  collisionGrid = buildCollisionGrid(terrainGrid);

  createAnimations(scene);
  buildAgentContainers(scene);

  // Camera
  const cam = scene.cameras.main;
  cam.setBounds(0, 0, MAP_PX_W, MAP_PX_H);
  cam.setZoom(DEFAULT_ZOOM);
  cam.setScroll(MAP_PX_W / 2 - VIEW_W / 2, MAP_PX_H / 2 - VIEW_H / 2);

  // Mouse-drag pan
  scene.input.on('pointerdown', ptr => {
    isDragging = true;
    dragStartX = ptr.x; dragStartY = ptr.y;
    camScrollX0 = cam.scrollX; camScrollY0 = cam.scrollY;
  });
  scene.input.on('pointermove', ptr => {
    if (!isDragging) return;
    const dx = Math.abs(ptr.x - dragStartX), dy = Math.abs(ptr.y - dragStartY);
    if ((dx > 5 || dy > 5) && lockedAgentId >= 0) unlockFollow();
    cam.setScroll(
      camScrollX0 - (ptr.x - dragStartX) / cam.zoom,
      camScrollY0 - (ptr.y - dragStartY) / cam.zoom
    );
  });
  scene.input.on('pointerup', () => { isDragging = false; });
  window.addEventListener('mouseup', () => { isDragging = false; });

  // Scroll-wheel zoom
  game.canvas.addEventListener('wheel', e => {
    if (lockedAgentId >= 0) unlockFollow();
    const z = scene.cameras.main.zoom;
    scene.cameras.main.setZoom(Phaser.Math.Clamp(z - e.deltaY * 0.001, MIN_ZOOM, 2.0));
    updateZoomLabel();
    e.preventDefault();
  }, { passive: false });

  // Zoom buttons
  ['btn-zoom-in', 'btn-zoom-out', 'btn-zoom-reset'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('click', () => {
      const z = scene.cameras.main.zoom;
      if (id === 'btn-zoom-in')    scene.cameras.main.setZoom(Phaser.Math.Clamp(z * 1.25, MIN_ZOOM, 2.0));
      if (id === 'btn-zoom-out')   scene.cameras.main.setZoom(Phaser.Math.Clamp(z * 0.8,  MIN_ZOOM, 2.0));
      if (id === 'btn-zoom-reset') {
        scene.cameras.main.setZoom(DEFAULT_ZOOM);
        cam.setScroll(MAP_PX_W / 2 - VIEW_W / 2, MAP_PX_H / 2 - VIEW_H / 2);
      }
      updateZoomLabel();
    });
  });

  // Agent click
  function handleAgentClick(clientX, clientY) {
    const rect = game.canvas.getBoundingClientRect();
    const sx = (clientX - rect.left) * (VIEW_W / rect.width);
    const sy = (clientY - rect.top)  * (VIEW_H / rect.height);
    const wp = cam.getWorldPoint(sx, sy);
    const wx = Math.round(wp.x); const wy = Math.round(wp.y);

    const clickR = Math.max(24, 40 / cam.zoom);
    let closestId = -1, closestDist = clickR * clickR;
    agentContainers.forEach((c, id) => {
      const dx = c.x - wx, dy = c.y - wy;
      const d2 = dx * dx + dy * dy;
      if (d2 < closestDist) { closestDist = d2; closestId = id; }
    });

    if (hoverRing) hoverRing.clear();

    if (closestId >= 0) {
      lockedAgentId = closestId;
      showBioPanel(closestId);
      scene.tweens.add({
        targets: agentContainers[closestId],
        scaleX: 1.8, scaleY: 1.8,
        duration: 120, ease: 'Quad.Out', yoyo: true,
        onComplete() { agentContainers[closestId].setScale(1.0); },
      });
      const targetZoom = Math.max(FOLLOW_ZOOM, cam.zoom);
      scene.tweens.add({
        targets: cam, zoom: targetZoom,
        duration: 400, ease: 'Quad.Out',
        onUpdate() { updateZoomLabel(); },
      });
      centerCameraOnAgent(closestId, 400);
    } else {
      unlockFollow();
    }
  }

  game.canvas.addEventListener('mousemove', onCanvasMouseMove);
  game.canvas.addEventListener('click', e => handleAgentClick(e.clientX, e.clientY));
  game.canvas.addEventListener('touchend', e => {
    if (e.changedTouches.length === 1) {
      const t = e.changedTouches[0];
      handleAgentClick(t.clientX, t.clientY);
    }
  }, { passive: true });

  // Keyboard
  scene.input.keyboard.on('keydown-SPACE', togglePlay);
  scene.input.keyboard.on('keydown-ESC', () => { if (lockedAgentId >= 0) unlockFollow(); });
  scene.input.keyboard.on('keydown', e => {
    keysDown.add(e.key);
    if (e.shiftKey && e.key === 'ArrowLeft')  { pausePlay(); stepBy(-1); }
    if (e.shiftKey && e.key === 'ArrowRight') { pausePlay(); stepBy(1); }
    if (!e.shiftKey && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key) && lockedAgentId >= 0) unlockFollow();
    if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)) e.preventDefault();
  });
  scene.input.keyboard.on('keyup', e => keysDown.delete(e.key));

  // Debug collision overlay
  let collOverlay = null;
  scene.input.keyboard.on('keydown-C', () => {
    if (collOverlay) { collOverlay.destroy(); collOverlay = null; return; }
    collOverlay = scene.add.graphics().setDepth(25).setAlpha(0.35);
    for (let y = 0; y < MAP_TILES_H; y++) {
      for (let x = 0; x < MAP_TILES_W; x++) {
        collOverlay.fillStyle(collisionGrid[y][x] ? 0xFF0000 : 0x00FF00, 1);
        collOverlay.fillRect(x * TILE, y * TILE, TILE, TILE);
      }
    }
  });

  // Debug path overlay
  let pathOverlay = null;
  let pathOverlayEnabled = false;
  scene.input.keyboard.on('keydown-P', () => {
    pathOverlayEnabled = !pathOverlayEnabled;
    if (!pathOverlayEnabled && pathOverlay) {
      pathOverlay.destroy(); pathOverlay = null;
    } else if (pathOverlayEnabled && !pathOverlay) {
      pathOverlay = scene.add.graphics().setDepth(24).setAlpha(0.6);
    }
  });
  window._pathOverlayBegin = () => {
    if (!pathOverlayEnabled) return null;
    if (pathOverlay) pathOverlay.clear();
    else pathOverlay = scene.add.graphics().setDepth(24).setAlpha(0.6);
    return pathOverlay;
  };
  window._pathOverlayGet = () => {
    if (!pathOverlayEnabled) return null;
    return pathOverlay;
  };

  loadAllData();
}

function updateZoomLabel() {
  const el = document.getElementById('zoom-label');
  if (el) el.textContent = Math.round(scene.cameras.main.zoom * 100) + '%';
}

function centerCameraOnAgent(id, durationMs) {
  const cam = scene.cameras.main;
  const c = agentContainers[id];
  const targetX = c.x - VIEW_W / 2;
  const targetY = c.y - VIEW_H / 2;
  if (durationMs > 0) {
    scene.tweens.add({
      targets: cam, scrollX: targetX, scrollY: targetY,
      duration: durationMs, ease: 'Quad.Out',
    });
  } else {
    cam.setScroll(targetX, targetY);
  }
}

function unlockFollow() {
  lockedAgentId = -1;
  const bioPanel = document.getElementById('bio-panel');
  if (hoverRing) hoverRing.clear();
  if (bioPanel) bioPanel.innerHTML = '<div class="bio-placeholder">CLICK OR HOVER<br>AN AGENT<br>TO VIEW BIO<br>&amp; REASONING</div>';
}

function update() {
  // Camera follow
  if (lockedAgentId >= 0 && scene && agentContainers[lockedAgentId]) {
    const cam = scene.cameras.main;
    const c = agentContainers[lockedAgentId];
    cam.setScroll(
      cam.scrollX + (c.x - VIEW_W / 2 - cam.scrollX) * 0.12,
      cam.scrollY + (c.y - VIEW_H / 2 - cam.scrollY) * 0.12
    );
    // Only re-render bio if step/agent changed (not every frame)
    const bioPanelKey = `${lockedAgentId}-${currentStep}-${currentSubStep}`;
    if (bioPanelKey !== lastBioPanelKey) {
      lastBioPanelKey = bioPanelKey;
      showBioPanel(lockedAgentId);
    }
  }

  // Arrow-key pan
  if (keysDown.size > 0 && scene && lockedAgentId < 0) {
    const cam = scene.cameras.main;
    const panPx = 8 / cam.zoom;
    if (keysDown.has('ArrowLeft'))  cam.setScroll(cam.scrollX - panPx, cam.scrollY);
    if (keysDown.has('ArrowRight')) cam.setScroll(cam.scrollX + panPx, cam.scrollY);
    if (keysDown.has('ArrowUp'))    cam.setScroll(cam.scrollX, cam.scrollY - panPx);
    if (keysDown.has('ArrowDown'))  cam.setScroll(cam.scrollX, cam.scrollY + panPx);
  }
}

// ===============================================================
// DATA LOADING
// ===============================================================

function loadAllData() {
  const loadingEl = document.getElementById('loading');
  loadingEl.textContent = 'LOADING AGENTS...';

  // Load agents.json
  fetch('agents/agents.json')
    .then(r => r.json())
    .then(agents => {
      agents.forEach(a => {
        agentsInfo[a.agent_id] = a;
      });
      loadingEl.textContent = 'LOADING COMPARISON DATA...';
      return loadAllMacroData();
    })
    .then(() => {
      loadingEl.textContent = 'LOADING MODEL DATA...';
      return loadModelMicroData(currentModelIndex);
    })
    .then(() => {
      loadingEl.style.display = 'none';
      initViz();
    })
    .catch(err => {
      showError('Failed to load data: ' + err.message);
    });
}

function loadAllMacroData() {
  return new Promise((resolve, reject) => {
    Papa.parse(CONFIG.ALL_MACRO, {
      download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
      complete({ data }) {
        data.forEach(row => {
          const key = configDirKey({
            provider: row.provider,
            model: row.model,
            reasoning: row.reasoning,
          });
          if (!allModelsMacro[key]) allModelsMacro[key] = {};
          allModelsMacro[key][row.infection_level] = row;
        });
        resolve();
      },
      error(err) { reject(err); },
    });
  });
}

function loadModelMicroData(modelIdx) {
  const m = CONFIG.MODELS[modelIdx];
  const key = configDirKey(m);
  const path = `${CONFIG.DATA_BASE}/${key}/probe_results_micro.csv`;

  // Reset decisions
  agentDecisions = {};
  agentReasoning = {};
  agentVoteCount = {};
  agentAllReasoning = {};

  return new Promise((resolve, reject) => {
    Papa.parse(path, {
      download: true, header: true, dynamicTyping: false, skipEmptyLines: true,
      complete({ data }) {
        // Group by infection_level, take majority vote across reps
        const voteMap = {};   // level -> agentId -> {yes: n, no: n}
        const reasonMap = {}; // level -> agentId -> first reasoning
        const allReasonMap = {}; // level -> agentId -> [all reasoning texts]

        data.forEach(row => {
          const level = parseFloat(row.infection_level);
          const id = parseInt(row.agent_id);
          const levelIdx = CONFIG.INFECTION_LEVELS.indexOf(level);
          if (levelIdx < 0) return;

          if (!voteMap[levelIdx]) voteMap[levelIdx] = {};
          if (!voteMap[levelIdx][id]) voteMap[levelIdx][id] = { yes: 0, no: 0 };
          voteMap[levelIdx][id][row.response]++;

          if (!reasonMap[levelIdx]) reasonMap[levelIdx] = {};
          if (!reasonMap[levelIdx][id]) reasonMap[levelIdx][id] = row.reasoning_text;

          if (!allReasonMap[levelIdx]) allReasonMap[levelIdx] = {};
          if (!allReasonMap[levelIdx][id]) allReasonMap[levelIdx][id] = [];
          allReasonMap[levelIdx][id].push({ response: row.response, text: row.reasoning_text || '' });
        });

        // Convert votes to decisions
        for (const [levelIdx, agents] of Object.entries(voteMap)) {
          agentDecisions[levelIdx] = {};
          for (const [id, votes] of Object.entries(agents)) {
            agentDecisions[levelIdx][id] = votes.yes >= votes.no ? 'yes' : 'no';
          }
        }
        agentReasoning = reasonMap;
        agentVoteCount = voteMap;
        agentAllReasoning = allReasonMap;

        resolve();
      },
      error(err) { reject(err); },
    });
  });
}

function showError(msg) {
  document.getElementById('loading').style.display = 'none';
  const el = document.getElementById('error-msg');
  el.style.display = 'block';
  el.textContent = msg;
}

// ===============================================================
// VIZ INIT
// ===============================================================

function placeAgentsAtHome() {
  for (let id = 0; id < agentContainers.length; id++) {
    const homePos = getHomePosT(id);
    agentContainers[id].x = homePos.x;
    agentContainers[id].y = homePos.y;
    agentLocKey[id]  = 'home';
    agentDestPos[id] = homePos;
    agentSettled[id] = true;
    agentSprites[id].anims.play(`${agentCharNames[id]}_down`, false);
    agentContainers[id].setVisible(false);
    setHomeLit(id, true);

    // Update decision visuals for current step
    const decision = (typeof agentDecisions !== 'undefined' && agentDecisions[currentStep])
      ? agentDecisions[currentStep][id] : 'no';
    updateDecisionBadge(id, decision);
    updateDecisionGlow(id, decision);
    updateNameLabelColor(id, decision);

    // Set name labels from agents.json
    const info = agentsInfo[id];
    if (info && agentNameLabels[id]) {
      agentNameLabels[id].setText(info.name);
      agentInitials[id] = info.name.slice(0, 2).toUpperCase();
    }
  }
}

function initViz() {
  // Scrubber
  const scrubber = document.getElementById('scrubber');
  scrubber.max = maxStep;
  scrubber.addEventListener('input', () => {
    pausePlay();
    goToStep(parseInt(scrubber.value, 10), 0, 'home');
  });

  // Show controls
  document.getElementById('controls').style.display = 'flex';
  document.getElementById('scrubber-row').style.display = 'block';
  document.getElementById('hint').style.display = 'block';

  // Play button
  document.getElementById('btn-play-pause').addEventListener('click', togglePlay);

  // Speed buttons
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      playSpeed = parseFloat(btn.dataset.speed);
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (isPlaying && playTimer) {
        clearTimeout(playTimer);
        killAgentTweens();
        scheduleNextSubStep();
      }
    });
  });

  // Model selector
  const modelSelect = document.getElementById('model-select');
  if (modelSelect) {
    modelSelect.addEventListener('change', () => {
      pausePlay();
      const idx = parseInt(modelSelect.value);
      switchModel(idx);
    });
  }

  placeAgentsAtHome();

  currentStep = 0;
  currentSubStep = 0;
  scrubber.value = 0;
  updateInfoDisplay();
  updateChartPlayheads();
}

// ===============================================================
// MODEL SWITCHING
// ===============================================================

function switchModel(modelIdx) {
  // Fully stop playback and reset UI state
  isPlaying = false;
  if (playTimer) { clearTimeout(playTimer); playTimer = null; }
  killAgentTweens();
  document.getElementById('btn-play-pause').textContent = '\u25b6 PLAY';
  lockedAgentId = -1;
  lastHoveredId = -1;

  currentModelIndex = modelIdx;

  // Sync dropdown
  const sel = document.getElementById('model-selector');
  if (sel) sel.value = modelIdx;

  const loadingEl = document.getElementById('loading');
  loadingEl.style.display = 'block';
  loadingEl.textContent = 'LOADING MODEL...';

  loadModelMicroData(modelIdx).then(() => {
    loadingEl.style.display = 'none';

    // Reset to beginning: all agents at home, step 0
    currentStep = 0;
    currentSubStep = 0;
    document.getElementById('scrubber').value = 0;
    placeAgentsAtHome();
    updateInfoDisplay();
    updateChartPlayheads();

    // Clear bio panel
    const bioPanel = document.getElementById('bio-panel');
    if (bioPanel) bioPanel.innerHTML = '<div style="color:#4a6580;font-size:5px;font-family:\'Press Start 2P\',monospace;text-align:center;padding:40px 10px;line-height:2.4">CLICK OR HOVER<br>AN AGENT<br>TO VIEW BIO<br>&amp; REASONING</div>';
  });
}

// ===============================================================
// AGENT FOCUS (scroll + zoom to agent on click)
// ===============================================================

function focusOnAgent(id) {
  if (id < 0 || id >= agentContainers.length) return;
  lockedAgentId = id;
  showBioPanel(id);

  // Scroll game container into view
  const gameEl = document.getElementById('game-container');
  if (gameEl) gameEl.scrollIntoView({ behavior: 'smooth', block: 'start' });

  // Zoom camera to agent
  const cam = scene.cameras.main;
  const ac = agentContainers[id];
  if (cam && ac) {
    cam.pan(ac.x, ac.y, 400, 'Power2');
    cam.zoomTo(FOLLOW_ZOOM, 400, 'Power2');
  }
}

// ===============================================================
// STEP NAVIGATION
// ===============================================================

function goToStep(step, subStep, animate) {
  currentStep    = Math.max(0, Math.min(step, maxStep));
  currentSubStep = Math.max(0, Math.min(subStep || 0, 1));
  document.getElementById('scrubber').value = currentStep;
  updateInfoDisplay();
  if (animate === 'home') {
    // Reset to start-of-day: all agents at home
    killAgentTweens();
    placeAgentsAtHome();
  } else {
    moveAgents(animate !== false);
  }
  updateChartPlayheads();
}

function updateInfoDisplay() {
  const level = CONFIG.INFECTION_LEVELS[currentStep] || 0;
  const m = CONFIG.MODELS[currentModelIndex];

  // Model info in header
  const modelNameEl = document.getElementById('current-model-name');
  const modelDetailEl = document.getElementById('current-model-detail');
  if (modelNameEl) {
    modelNameEl.textContent = m.label;
    modelNameEl.style.color = m.color;
  }
  if (modelDetailEl) {
    modelDetailEl.textContent = `${m.provider} · reasoning: ${m.reasoning}`;
  }

  // Infection level
  const levelEl = document.getElementById('infection-level');
  if (levelEl) levelEl.textContent = `Infection: ${level.toFixed(1)}%`;

  // Counts
  let nOut = 0, nHome = 0;
  for (let id = 0; id < 100; id++) {
    const d = agentDecisions[currentStep]?.[id] || 'no';
    if (d === 'yes') nHome++; else nOut++;
  }
  const countsEl = document.getElementById('agent-counts');
  if (countsEl) {
    countsEl.innerHTML = `<span style="color:#3B82F6">Out: ${nOut}</span> · <span style="color:#F97316">Home: ${nHome}</span>`;
  }

  // Substep label
  const subLabel = currentSubStep === 0 ? 'Morning — Agents going out' : 'Evening — Agents going home';
  const dayEl = document.getElementById('day-counter');
  if (dayEl) dayEl.textContent = subLabel;

  // Update model selector
  const modelSelect = document.getElementById('model-select');
  if (modelSelect && modelSelect.value !== String(currentModelIndex)) {
    modelSelect.value = currentModelIndex;
  }
}

function stepBy(delta) {
  let newSub = currentSubStep + delta;
  let newStep = currentStep;
  if (newSub < 0) {
    newStep = Math.max(0, newStep - 1);
    newSub = 1;
  } else if (newSub > 1) {
    newStep = Math.min(maxStep, newStep + 1);
    newSub = 0;
  }
  goToStep(newStep, newSub, true);
}

// ===============================================================
// PLAYBACK
// ===============================================================

function togglePlay() { isPlaying ? pausePlay() : startPlay(); }

function startPlay() {
  isPlaying = true;
  document.getElementById('btn-play-pause').textContent = '⏸ PAUSE';
  scheduleNextSubStep();
}

function pausePlay() {
  isPlaying = false;
  document.getElementById('btn-play-pause').textContent = '▶ PLAY';
  if (playTimer) { clearTimeout(playTimer); playTimer = null; }
  killAgentTweens();
}

function scheduleNextSubStep() {
  if (!isPlaying) return;
  moveAgents(true);
  updateInfoDisplay();
  updateChartPlayheads();

  const subStepMs = Math.max(200, Math.round(10000 / playSpeed));
  const holdMs    = Math.max(30, Math.round(2000 / playSpeed));
  playTimer = setTimeout(() => { if (isPlaying) advanceSubStep(); }, subStepMs + holdMs);
}

function advanceSubStep() {
  if (currentSubStep < 1) {
    currentSubStep++;
    scheduleNextSubStep();
  } else if (currentStep < maxStep) {
    currentStep++;
    currentSubStep = 0;
    document.getElementById('scrubber').value = currentStep;
    scheduleNextSubStep();
  } else {
    pausePlay();
  }
}
