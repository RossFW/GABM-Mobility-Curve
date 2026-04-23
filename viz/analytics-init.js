'use strict';
// analytics-init.js — Tab switching, section nav, regression toggles, init()
// Extracted from analytics.js during refactor (March 2026)

// ═══════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════
// ── Tab switching ─────────────────────────────────────────────
// ── Section filter sub-nav ────────────────────────────────────
function filterSectionTab(paneId, navId, filter) {
  document.querySelectorAll(`#${navId} .section-link`).forEach(l =>
    l.classList.toggle('active', l.dataset.filter === filter)
  );
  // Section headers only shown in 'all' view
  document.querySelectorAll(`#${paneId} .curve-section-header`).forEach(el => {
    el.style.display = (filter === 'all') ? '' : 'none';
  });
  // Show/hide figure sections by data-section attribute
  document.querySelectorAll(`#${paneId} .section[data-section]`).forEach(el => {
    el.style.display = (filter === 'all' || el.dataset.section === filter) ? 'block' : 'none';
  });
}

function initSectionNavs() {
  document.querySelectorAll('#curves-section-nav .section-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      filterSectionTab('tab-curves', 'curves-section-nav', link.dataset.filter);
    });
  });
  document.querySelectorAll('#agents-section-nav .section-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      filterSectionTab('tab-agents', 'agents-section-nav', link.dataset.filter);
    });
  });
  document.querySelectorAll('#responses-section-nav .section-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      filterSectionTab('tab-responses', 'responses-section-nav', link.dataset.filter);
    });
  });
  document.querySelectorAll('#author-section-nav .section-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      filterSectionTab('tab-author', 'author-section-nav', link.dataset.filter);
    });
  });
  document.querySelectorAll('#appendix-section-nav .section-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      filterSectionTab('tab-appendix', 'appendix-section-nav', link.dataset.filter);
    });
  });

  // Initialize all tabs to "all" view so display:none sections become visible
  filterSectionTab('tab-curves', 'curves-section-nav', 'all');
  filterSectionTab('tab-agents', 'agents-section-nav', 'all');
  filterSectionTab('tab-responses', 'responses-section-nav', 'all');
  filterSectionTab('tab-author', 'author-section-nav', 'all');
  filterSectionTab('tab-appendix', 'appendix-section-nav', 'all');
}

function initTabs() {
  document.querySelectorAll('#tab-nav .tab-link').forEach(link => {
    link.addEventListener('click', e => {
      e.preventDefault();
      const tab = link.dataset.tab;
      document.querySelectorAll('#tab-nav .tab-link').forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
      const pane = document.getElementById('tab-' + tab);
      if (pane) pane.classList.add('active');
      // Lazy-render Cohort Analysis on first visit
      // (Also triggers Appendix validation figures — they live in tab-appendix
      // DOM but share the same data-load + render path as Cohort.)
      if ((tab === 'agents' || tab === 'appendix') && !tab3Rendered) {
        renderAgentAnalysis();
        tab3Rendered = true;
      }
      // Lazy-render Appendix A mobility-curve regressions on first Appendix visit
      if (tab === 'appendix' && !appendixRegressionsRendered) {
        renderAppendixARegressions();
        appendixRegressionsRendered = true;
      }
      // Lazy-render Response Analysis on first visit
      if (tab === 'responses' && !agentTabRendered) {
        agentTabRendered = true;
        loadAgentsJSON(initFig23Spotlight);
        initResponseAnalysisFigures();
      }
      // Lazy-render Author Notes comparisons + interactive figures
      if (tab === 'author') {
        renderAuthorComparisons();
        renderAuthorPerModelComparisons();
        renderFigA1CoefficientBars();
        renderFigA2Calculator();
        renderFigA3CrossModelEffects();
      }
    });
  });
  // Activate first tab
  document.getElementById('tab-curves').classList.add('active');
}

const regToggleRendered = {};
const regToggleConfigs = {
  // Reasoning comparisons (array form → renderReasoningRegTable)
  'reg-gpt52': [
    'openai_gpt-5_2_off', 'openai_gpt-5_2_low',
    'openai_gpt-5_2_medium', 'openai_gpt-5_2_high',
  ],
  'reg-gemini3flash': [
    'gemini_gemini-3-flash-preview_off', 'gemini_gemini-3-flash-preview_low',
    'gemini_gemini-3-flash-preview_medium', 'gemini_gemini-3-flash-preview_high',
  ],
  // Model comparisons (object form → renderModelDummyRegTable)
  'reg-figAnthro': {
    configs:  ['anthropic_claude-haiku-4-5_off', 'anthropic_claude-sonnet-4-5_off', 'anthropic_claude-opus-4-5_off'],
    labels:   ['Sonnet 4.5', 'Opus 4.5'],
    baseline: 'Claude Haiku 4.5',
  },
  'reg-figGeminiLite': {
    configs:  ['gemini_gemini-2_5-flash-lite_off', 'gemini_gemini-2_5-flash_off'],
    labels:   ['2.5 Flash'],
    baseline: 'Gemini 2.5 Flash Lite',
  },
  'reg-figD': {
    configs:  ['gemini_gemini-2_0-flash_off', 'gemini_gemini-2_5-flash_off', 'gemini_gemini-3-flash-preview_off'],
    labels:   ['2.5 Flash', '3 Flash'],
    baseline: 'Gemini 2.0 Flash',
  },
  'reg-figAnthroGen': {
    configs:  ['anthropic_claude-sonnet-4-0_off', 'anthropic_claude-sonnet-4-5_off'],
    labels:   ['Sonnet 4.5'],
    baseline: 'Claude Sonnet 4.0',
  },
  'reg-figC': {
    configs:  ['openai_gpt-3_5-turbo_off', 'openai_gpt-4o_off', 'openai_gpt-5_1_off', 'openai_gpt-5_2_off'],
    labels:   ['GPT-4o', 'GPT-5.1', 'GPT-5.2'],
    baseline: 'GPT-3.5 Turbo',
  },
  'reg-figFlagship': {
    configs:  ['anthropic_claude-opus-4-5_off', 'openai_gpt-5_2_off', 'gemini_gemini-3-flash-preview_off'],
    labels:   ['GPT-5.2', 'Gemini 3 Flash'],
    baseline: 'Claude Opus 4.5',
  },
  // Knowledge Cutoff groupings
  'reg-figCutPre24': {
    configs:  ['openai_gpt-3_5-turbo_off', 'anthropic_claude-3-haiku-20240307_off', 'openai_gpt-4o_off'],
    labels:   ['Claude 3 Haiku', 'GPT-4o'],
    baseline: 'GPT-3.5 Turbo',
  },
  'reg-figCutMid24': {
    configs:  ['openai_gpt-4_1_off', 'openai_o3_required', 'gemini_gemini-2_0-flash_off', 'openai_gpt-5_1_off'],
    labels:   ['o3', 'Gemini 2.0 Flash', 'GPT-5.1'],
    baseline: 'GPT-4.1',
  },
  'reg-figCutEarly25': {
    configs:  ['anthropic_claude-sonnet-4-5_off', 'anthropic_claude-haiku-4-5_off', 'anthropic_claude-sonnet-4-0_off',
               'gemini_gemini-2_5-flash_off', 'gemini_gemini-2_5-flash-lite_off', 'gemini_gemini-3-flash-preview_off'],
    labels:   ['Haiku 4.5', 'Sonnet 4.0', 'Gemini 2.5 Flash', 'Gemini 2.5 Flash Lite', 'Gemini 3 Flash'],
    baseline: 'Claude Sonnet 4.5',
  },
  'reg-figCutLate25': {
    configs:  ['anthropic_claude-opus-4-5_off', 'openai_gpt-5_2_off'],
    labels:   ['GPT-5.2'],
    baseline: 'Claude Opus 4.5',
  },
  // Release Date groupings
  'reg-figRelLegacy': {
    configs:  ['openai_gpt-3_5-turbo_off', 'anthropic_claude-3-haiku-20240307_off', 'openai_gpt-4o_off'],
    labels:   ['Claude 3 Haiku', 'GPT-4o'],
    baseline: 'GPT-3.5 Turbo',
  },
  'reg-figRelSpring': {
    configs:  ['gemini_gemini-2_0-flash_off', 'openai_gpt-4_1_off', 'openai_o3_required',
               'anthropic_claude-sonnet-4-0_off', 'gemini_gemini-2_5-flash_off', 'gemini_gemini-2_5-flash-lite_off'],
    labels:   ['GPT-4.1', 'o3', 'Sonnet 4.0', 'Gemini 2.5 Flash', 'Gemini 2.5 Flash Lite'],
    baseline: 'Gemini 2.0 Flash',
  },
  'reg-figRelLate': {
    configs:  ['anthropic_claude-sonnet-4-5_off', 'anthropic_claude-haiku-4-5_off', 'anthropic_claude-opus-4-5_off',
               'openai_gpt-5_1_off', 'openai_gpt-5_2_off', 'gemini_gemini-3-flash-preview_off'],
    labels:   ['Haiku 4.5', 'Opus 4.5', 'GPT-5.1', 'GPT-5.2', 'Gemini 3 Flash'],
    baseline: 'Claude Sonnet 4.5',
  },
};

// Appendix A panel aliases — same configs, distinct IDs for pre-rendered
// Appendix A mirror of the Mobility Curves regression panels.
[
  'reg-gpt52', 'reg-gemini3flash', 'reg-figAnthro', 'reg-figGeminiLite',
  'reg-figD', 'reg-figAnthroGen', 'reg-figC', 'reg-figFlagship',
  'reg-figCutPre24', 'reg-figCutMid24', 'reg-figCutEarly25', 'reg-figCutLate25',
  'reg-figRelLegacy', 'reg-figRelSpring', 'reg-figRelLate',
].forEach(baseId => {
  if (regToggleConfigs[baseId]) {
    regToggleConfigs[baseId + '-app'] = regToggleConfigs[baseId];
  }
});

// Render the Appendix A mobility-curve regression tables (pre-rendered,
// not behind a toggle). Mirrors the logic inside initRegToggles.
function renderAppendixARegressions() {
  const appendixIds = [
    'reg-gpt52-app', 'reg-gemini3flash-app',
    'reg-figAnthro-app', 'reg-figGeminiLite-app',
    'reg-figD-app', 'reg-figAnthroGen-app', 'reg-figC-app',
    'reg-figFlagship-app',
    'reg-figCutPre24-app', 'reg-figCutMid24-app',
    'reg-figCutEarly25-app', 'reg-figCutLate25-app',
    'reg-figRelLegacy-app', 'reg-figRelSpring-app', 'reg-figRelLate-app',
  ];
  for (const id of appendixIds) {
    const cfg = regToggleConfigs[id];
    const el = document.getElementById(id);
    if (!cfg || !el) continue;
    if (Array.isArray(cfg)) {
      renderReasoningRegTable(id, cfg);
    } else {
      renderModelDummyRegTable(id, cfg.configs, cfg.labels, cfg.baseline);
    }
  }
}

function initRegToggles() {
  document.querySelectorAll('.reg-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const panel = document.getElementById(targetId);
      if (!panel) return;
      const open = panel.style.display !== 'none';
      panel.style.display = open ? 'none' : 'block';
      btn.textContent = open ? 'Show Regression \u25be' : 'Hide Regression \u25b4';
      if (!open && !regToggleRendered[targetId]) {
        const cfg = regToggleConfigs[targetId];
        if (Array.isArray(cfg)) {
          renderReasoningRegTable(targetId, cfg);
        } else {
          renderModelDummyRegTable(targetId, cfg.configs, cfg.labels, cfg.baseline);
        }
        regToggleRendered[targetId] = true;
      }
    });
  });
}

function init() {
  initTabs();
  initRegToggles();
  initSectionNavs();
  renderLogOddsWalkthrough();

  Papa.parse(CONFIG.ALL_MACRO, {
    download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
    complete({ data }) {
      macroData = data;
      document.getElementById('loading').style.display = 'none';

      // Compute OLS for all 21 configs
      computeAllOLS();

      // ── Tab 1: Mobility Curves ────────────────────────────────
      renderFigA();
      renderFigB();
      renderFigAnthro();
      renderFigGeminiLite();
      renderFigD();
      renderFigAnthroGen();
      renderFigC();
      renderFigFlagship();
      renderFigCutPre24();
      renderFigCutMid24();
      renderFigCutEarly25();
      renderFigCutLate25();
      renderFigRelLegacy();
      renderFigRelSpring();
      renderFigRelLate();
      renderS3();

      // Figure 20: Comparison Tool (needs micro data, lazy-loaded on run)
      initFigJ();

      // Figure 19: heatmap model picker
      buildModelPicker('fig19-model-select', 0, idx => {
        s7SelectedIdx = idx;
        loadMicro(idx, (rows, cfg) => renderS7(rows, cfg));
      });
      loadMicro(0, (rows, cfg) => renderS7(rows, cfg));

      // Figure 20: concordance model picker
      buildModelPicker('fig20-model-select', 0, idx => {
        loadMicro(idx, (rows, cfg) => renderFig22bConcordance(rows, cfg));
      });
      loadMicro(0, (rows, cfg) => renderFig22bConcordance(rows, cfg));

      // Load metadata (for timeline figures)
      Papa.parse('data/metadata/models.csv', {
        download: true, header: true, dynamicTyping: true, skipEmptyLines: true,
        complete({ data }) {
          modelMetadata = data;
          renderReleaseTimeline();
          renderCutoffTimeline();
        },
      });
    },
    error() {
      document.getElementById('loading').innerHTML =
        '<span style="color:#c00">Failed to load macro data. Is the HTTP server running from the viz/ directory?</span>';
    },
  });
}

init();
