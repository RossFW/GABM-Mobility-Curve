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
// Author Notes — Log Odds Walkthrough (Opus 4.5 deep-dive)
// ═══════════════════════════════════════════════════════════════
function renderLogOddsWalkthrough() {
  const el = document.getElementById('logodds-walkthrough');
  if (!el) return;

  const S = 'font-family:"Libre Baskerville","Georgia",serif;font-size:13px;line-height:1.7;color:#333;max-width:780px';
  const H4 = 'margin:24px 0 8px;font-size:14px;color:#111';
  const BOX = 'background:#f5f5f5;padding:10px 14px;border-radius:4px;margin:8px 0';
  const MONO = 'font-family:monospace;font-size:12px';
  const CODE = 'background:#e8e8e8;padding:1px 4px;border-radius:2px';

  let h = `<div style="${S}">`;

  // ── 0. The intuition: why zero matters ──────────────────────
  h += `<h4 style="${H4}">0. The intuition: why zero is the magic number</h4>`;
  h += '<p>Imagine a number line that encodes every possible probability &mdash; from "definitely going out" on the far left to "definitely staying home" on the far right:</p>';
  h += '<div style="background:#f5f5f5;padding:12px 16px;border-radius:6px;margin:10px 0;font-family:monospace;font-size:13px;text-align:center;letter-spacing:1px">';
  h += '&larr; go out &nbsp;&nbsp;&nbsp; <strong>&minus;4</strong> &nbsp;&nbsp; <strong>&minus;2</strong> &nbsp;&nbsp; <span style="color:#c00;font-weight:bold;font-size:15px">0 (50%)</span> &nbsp;&nbsp; <strong>+2</strong> &nbsp;&nbsp; <strong>+4</strong> &nbsp;&nbsp;&nbsp; stay home &rarr;';
  h += '</div>';
  h += '<p>This number line <em>is</em> the log-odds scale. The key insight: <strong>zero means 50/50</strong>. Here is why:</p>';
  h += '<ul style="margin:6px 0;padding-left:20px">';
  h += '<li>At 50% probability, the odds are 1:1 (equally likely either way)</li>';
  h += '<li>The natural logarithm of 1 is 0 &mdash; so log(1) = 0</li>';
  h += '<li>Therefore: 50% probability &harr; odds of 1 &harr; log-odds of 0</li>';
  h += '</ul>';
  h += '<p>Every positive value means "more likely to stay home than not" and every negative value means "more likely to go out." The further from zero, the more certain the decision. This is why the <strong>dashed line at y&nbsp;=&nbsp;0 in Figures 26 and 26a is the decision boundary</strong> &mdash; an agent flips from going out to staying home when their total log-odds crosses zero.</p>';
  h += '<p>The <strong>logistic function</strong> translates back: P&nbsp;=&nbsp;1&nbsp;/&nbsp;(1&nbsp;+&nbsp;e<sup>&minus;log-odds</sup>). Plug in 0 and you get P&nbsp;=&nbsp;1/(1+1)&nbsp;=&nbsp;0.5. That is the entire reason zero means 50%.</p>';

  // ── 1. What are log-odds? ──────────────────────────────────
  h += `<h4 style="${H4}">1. What are log-odds?</h4>`;
  h += '<p>Logistic regression models the probability of an event using <em>log-odds</em> (also called the <em>logit</em>). The progression from probability to log-odds works like this:</p>';
  h += '<ul style="margin:6px 0;padding-left:20px">';
  h += '<li><strong>Probability</strong> (P): the chance of staying home, between 0 and 1</li>';
  h += '<li><strong>Odds</strong>: P / (1 &minus; P) &mdash; "how much more likely to stay home than go out"</li>';
  h += '<li><strong>Log-odds</strong>: ln(odds) &mdash; the natural logarithm of the odds</li>';
  h += '</ul>';
  h += '<table class="ols-table" style="width:auto;margin:10px 0">';
  h += '<thead><tr><th>Probability</th><th>Odds</th><th>Log-odds</th><th>Interpretation</th></tr></thead>';
  h += '<tbody>';
  h += '<tr><td>0.10</td><td>0.11</td><td>&minus;2.20</td><td>Very unlikely to stay home</td></tr>';
  h += '<tr><td>0.25</td><td>0.33</td><td>&minus;1.10</td><td>Unlikely to stay home</td></tr>';
  h += '<tr><td>0.50</td><td>1.00</td><td>0.00</td><td>Equally likely either way</td></tr>';
  h += '<tr><td>0.75</td><td>3.00</td><td>1.10</td><td>Likely to stay home</td></tr>';
  h += '<tr><td>0.90</td><td>9.00</td><td>2.20</td><td>Very likely to stay home</td></tr>';
  h += '</tbody></table>';
  h += '<p>The key property: log-odds range from &minus;&infin; to +&infin;, making them suitable as a linear predictor in regression.</p>';

  // ── 2. Reading the regression table ────────────────────────
  h += `<h4 style="${H4}">2. Reading the regression table (Figure 23)</h4>`;
  h += '<p>Each row in the table is a predictor variable. The <strong>Coef</strong> column shows the change in log-odds of staying home for a one-unit change in that predictor, holding all other predictors constant.</p>';
  h += '<ul style="margin:6px 0;padding-left:20px">';
  h += '<li><strong>Positive coefficient</strong> &rarr; increases log-odds of staying home (more cautious)</li>';
  h += '<li><strong>Negative coefficient</strong> &rarr; decreases log-odds of staying home (more bold, goes out)</li>';
  h += '<li><strong>OR (Odds Ratio)</strong> = exp(coefficient) &mdash; the multiplicative effect on the odds</li>';
  h += '</ul>';
  h += `<div style="${BOX};font-size:13px">`;
  h += '<p style="margin:0 0 6px;font-weight:bold">Odds Ratio (formal definition):</p>';
  h += `<p style="margin:0 0 8px;${MONO}">OR = odds(trait present) / odds(trait absent)</p>`;
  h += '<p style="margin:0 0 4px">Where <em>odds</em> = P(staying home) / P(going out). For binary predictors (e.g., extraverted = 1 vs. 0):</p>';
  h += `<p style="margin:0;${MONO}">OR = [P(extraverted stays home) / P(extraverted goes out)]<br>`;
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;/ [P(introverted stays home) / P(introverted goes out)]</p>';
  h += '</div>';
  h += `<p>Since <code style="${CODE}">stay_home = 1</code> is our dependent variable, all ORs are framed in terms of staying home.</p>`;

  // ── 3. Worked example — Opus 4.5 ─────────────────────────
  h += `<h4 style="${H4}">3. Worked example (Claude Opus 4.5)</h4>`;
  h += '<p>From the Claude Opus 4.5 regression (Model 2, random-effects logit with 100 agent random intercepts, N = 20,000):</p>';
  h += '<table class="ols-table" style="width:auto;margin:10px 0">';
  h += '<thead><tr><th>Predictor</th><th>Coefficient</th><th>SE</th><th>OR = exp(Coef)</th><th>Sig</th><th>Meaning</th></tr></thead>';
  h += '<tbody>';
  h += '<tr><td>Intercept</td><td>&minus;14.973</td><td>1.441</td><td>3.1 &times; 10<sup>&minus;7</sup></td><td>***</td><td>Strong baseline pull toward going out</td></tr>';
  h += '<tr><td>Infection %</td><td>+2.507</td><td>0.096</td><td>12.27</td><td>***</td><td>Per 1pp: 12.3&times; the odds of staying home</td></tr>';
  h += '<tr><td>Infection %&sup2;</td><td>&minus;0.192</td><td>0.013</td><td>0.825</td><td>***</td><td>Diminishing returns at high infection</td></tr>';
  h += '<tr style="border-top:1px solid #ccc"><td>Conscientious</td><td>+8.896</td><td>0.812</td><td>7,299</td><td>***</td><td>7,299&times; odds of staying home vs. unconscientious</td></tr>';
  h += '<tr><td>Agreeable</td><td>+5.299</td><td>0.606</td><td>200</td><td>***</td><td>200&times; odds of staying home vs. antagonistic</td></tr>';
  h += '<tr><td>Open to Exp.</td><td>+2.447</td><td>0.601</td><td>11.5</td><td>***</td><td>11.5&times; odds of staying home vs. closed</td></tr>';
  h += '<tr><td>Male</td><td>&minus;1.798</td><td>0.573</td><td>0.166</td><td>**</td><td>Males have 16.6% the odds of staying home</td></tr>';
  h += '<tr><td>Extraverted</td><td>&minus;5.019</td><td>0.619</td><td>0.0066</td><td>***</td><td>0.66% the odds of staying home vs. introverted</td></tr>';
  h += '<tr><td>Emot. Stable</td><td>&minus;5.021</td><td>0.622</td><td>0.0066</td><td>***</td><td>0.66% the odds of staying home vs. neurotic</td></tr>';
  h += '<tr><td>Age (years)</td><td>+0.029</td><td>0.021</td><td>1.029</td><td>ns</td><td>Not significant &mdash; age has no detectable effect</td></tr>';
  h += '</tbody></table>';

  h += '<p><strong>Full calculation for a specific agent:</strong></p>';
  h += '<p>Consider Agent #42: an introverted, agreeable, conscientious, neurotic, closed female, age 40, at 3% infection:</p>';
  h += `<div style="${BOX};${MONO};overflow-x:auto">`;
  h += 'log-odds = &minus;14.973 (intercept)<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 2.507 &times; 3 (infection 3%) = +7.521<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ (&minus;0.192) &times; 9 (infection&sup2; = 3&sup2;) = &minus;1.732<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 0 (female, reference)<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 0 (introverted, reference)<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 5.299 (agreeable)<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 8.896 (conscientious)<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 0 (neurotic, reference)<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 0 (closed, reference)<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 0.029 &times; 40 (age) = +1.149<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= &minus;14.973 + 7.521 &minus; 1.732 + 5.299 + 8.896 + 1.149<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= <strong>+6.160</strong>';
  h += '</div>';
  h += '<p>Converting back to probability:</p>';
  h += `<div style="${BOX};${MONO}">`;
  h += 'odds = exp(6.160) = 473<br>';
  h += 'P(stay home) = 473 / (1 + 473) = <strong>0.9979</strong> (99.8%)';
  h += '</div>';
  h += '<p>This agent is virtually certain to stay home at 3% infection &mdash; driven by the conscientious trait (+8.896) and agreeableness (+5.299).</p>';

  h += '<p><strong>Now flip the traits.</strong> Consider Agent #17: an extraverted, antagonistic, unconscientious, emotionally stable, open male, age 25, at 3% infection:</p>';
  h += `<div style="${BOX};${MONO};overflow-x:auto">`;
  h += 'log-odds = &minus;14.973<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 7.521 &minus; 1.732 (infection 3%)<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ (&minus;1.798) (male)<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ (&minus;5.019) (extraverted)<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 0 (antagonistic, reference)<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 0 (unconscientious, reference)<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ (&minus;5.021) (emot. stable)<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 2.447 (open to exp.)<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;+ 0.029 &times; 25 (age) = +0.718<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= &minus;14.973 + 5.789 &minus; 1.798 &minus; 5.019 &minus; 5.021 + 2.447 + 0.718<br>';
  h += '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;= <strong>&minus;17.857</strong>';
  h += '</div>';
  h += `<div style="${BOX};${MONO}">`;
  h += 'P(stay home) = 1 / (1 + exp(17.857)) = <strong>0.000000018</strong> (essentially 0%)';
  h += '</div>';
  h += '<p>This agent will <em>never</em> stay home at 3% infection. The 24-point gap between these two agents (+6.2 vs. &minus;17.9) illustrates how personality creates an enormous spread in behavior under the same conditions.</p>';

  // ── 4. What OR > 1 and OR < 1 mean ────────────────────────
  h += `<h4 style="${H4}">4. What OR &gt; 1 and OR &lt; 1 mean</h4>`;
  h += '<table class="ols-table" style="width:auto;margin:10px 0">';
  h += '<thead><tr><th>OR value</th><th>Meaning</th><th>Opus 4.5 example</th></tr></thead>';
  h += '<tbody>';
  h += '<tr><td>OR &gt;&gt; 1</td><td>Much more likely to stay home</td><td>Conscientious: OR = 7,299</td></tr>';
  h += '<tr><td>OR &gt; 1</td><td>Somewhat more likely to stay home</td><td>Agreeable: OR = 200</td></tr>';
  h += '<tr><td>OR = 1</td><td>No effect</td><td>(reference line in forest plot)</td></tr>';
  h += '<tr><td>OR &lt; 1</td><td>More likely to go out</td><td>Extraverted: OR = 0.0066</td></tr>';
  h += '<tr><td>OR &lt;&lt; 1</td><td>Much more likely to go out</td><td>Emot. Stable: OR = 0.0066</td></tr>';
  h += '</tbody></table>';
  h += '<p><em>Note:</em> These extreme ORs (thousands or thousandths) are common in our data because LLM decisions are near-deterministic &mdash; a conscientious agent almost <em>always</em> stays home, producing very large effect sizes in the logistic model.</p>';

  // ── 5. Comparing effect sizes across predictors ────────────
  h += `<h4 style="${H4}">5. Comparing effect sizes: which traits matter most?</h4>`;
  h += '<p>A key question: of all the personality traits, which one has the <em>biggest</em> influence on the stay-home decision? This is the question of <strong>effect size</strong>.</p>';

  h += '<p><strong>The problem with odds ratios for comparison:</strong> ORs are multiplicative &mdash; an OR of 7,299 and an OR of 0.0066 are hard to compare visually. Is conscientiousness "bigger" than extraversion? One is 7,299&times; and the other is 1/151&times;. Apples and oranges.</p>';

  h += '<p><strong>The solution: use the log-odds (coefficient) scale.</strong> On this scale, the <em>absolute value</em> of the coefficient tells you the magnitude of the effect:</p>';

  h += '<table class="ols-table" style="width:auto;margin:10px 0">';
  h += '<thead><tr><th>Predictor</th><th>Coef</th><th>|Coef|</th><th>Direction</th><th>Rank</th></tr></thead>';
  h += '<tbody>';
  h += '<tr style="background:#f0fdf4"><td>Conscientious</td><td>+8.896</td><td>8.896</td><td>Stay home</td><td><strong>1st</strong></td></tr>';
  h += '<tr style="background:#f0fdf4"><td>Agreeable</td><td>+5.299</td><td>5.299</td><td>Stay home</td><td><strong>2nd</strong></td></tr>';
  h += '<tr style="background:#fef2f2"><td>Emot. Stable</td><td>&minus;5.021</td><td>5.021</td><td>Go out</td><td><strong>3rd</strong></td></tr>';
  h += '<tr style="background:#fef2f2"><td>Extraverted</td><td>&minus;5.019</td><td>5.019</td><td>Go out</td><td><strong>4th</strong></td></tr>';
  h += '<tr style="background:#f0fdf4"><td>Open to Exp.</td><td>+2.447</td><td>2.447</td><td>Stay home</td><td><strong>5th</strong></td></tr>';
  h += '<tr style="background:#fef2f2"><td>Male</td><td>&minus;1.798</td><td>1.798</td><td>Go out</td><td><strong>6th</strong></td></tr>';
  h += '<tr><td>Age (per year)</td><td>+0.029</td><td>0.029</td><td>&mdash;</td><td>ns</td></tr>';
  h += '</tbody></table>';

  h += '<p>Now we can see clearly: <strong>conscientiousness is the dominant trait</strong> under Opus 4.5, nearly twice as influential as any other single trait. Extraversion and emotional stability are almost identical in magnitude (&minus;5.02 vs. &minus;5.02) but push in opposite directions from conscientiousness.</p>';

  h += '<p>The coefficient bar chart below (Figure A1) makes this visual. See also the interactive calculator (Figure A2) where you can toggle traits and watch the log-odds move.</p>';

  // ── 5b. Why absolute coefficients work for binary predictors ──
  h += `<h4 style="${H4}">5b. Why this comparison works (and when it doesn't)</h4>`;
  h += '<p>For our <strong>binary trait predictors</strong> (each coded 0 or 1), the coefficient <em>is</em> the full effect of switching from 0 to 1. A one-unit change in the predictor produces exactly the coefficient&rsquo;s value of change in log-odds. This makes absolute values directly comparable: switching from introverted to extraverted shifts log-odds by &minus;5.019, while switching from unconscientious to conscientious shifts it by +8.896. The latter is 1.77&times; as powerful.</p>';

  h += '<p>For <strong>continuous predictors</strong> like infection rate or age, the story is different. The infection coefficient (+2.507) is a per-percentage-point effect: going from 2% to 3% infection adds 2.507 to log-odds. Going from 0% to 7% adds roughly 2.507 &times; 7 + (&minus;0.192) &times; 49 = 8.14 &mdash; which is nearly as large as the conscientiousness effect. So infection rate <em>at its full range</em> rivals the strongest trait.</p>';

  h += '<p><strong>The range matters.</strong> If you want to compare infection against personality traits, you should compare the coefficient multiplied by the variable&rsquo;s range (e.g., 0&ndash;7 for infection, 0&ndash;1 for binary traits). This is sometimes called the <em>range-scaled effect</em>.</p>';

  h += '<table class="ols-table" style="width:auto;margin:10px 0">';
  h += '<thead><tr><th>Predictor</th><th>Coef</th><th>Range</th><th>Coef &times; Range</th><th>Interpretation</th></tr></thead>';
  h += '<tbody>';
  h += '<tr><td>Conscientious</td><td>+8.896</td><td>0&ndash;1</td><td>8.896</td><td>Full trait switch</td></tr>';
  h += '<tr><td>Infection</td><td>+2.507</td><td>0&ndash;7%</td><td>~8.12*</td><td>Full range (with quadratic)</td></tr>';
  h += '<tr><td>Extraverted</td><td>&minus;5.019</td><td>0&ndash;1</td><td>5.019</td><td>Full trait switch</td></tr>';
  h += '<tr><td>Age</td><td>+0.029</td><td>18&ndash;65</td><td>1.36</td><td>Full age range (ns)</td></tr>';
  h += '</tbody></table>';
  h += '<p style="font-size:11px;color:#888">*Infection is quadratic: total = 2.507 &times; 7 + (&minus;0.192) &times; 49 = 17.55 &minus; 9.43 = 8.12</p>';
  h += '<p>This reveals that under Opus 4.5, personality (conscientiousness alone) and infection (over its full range) are roughly equal forces &mdash; but the intercept at &minus;14.97 means both must work together to get an agent to stay home.</p>';

  // ── 6. The odds ratio as a "how many times" multiplier ─────
  h += `<h4 style="${H4}">6. The odds ratio as a "how many times" multiplier</h4>`;
  h += '<p>Odds ratios have an intuitive interpretation that log-odds lack: they tell you <strong>how many times more (or less) likely</strong> an outcome is.</p>';

  h += `<div style="${BOX}">`;
  h += '<p style="margin:0 0 6px"><strong>Reading an OR for a binary predictor:</strong></p>';
  h += '<ul style="margin:0;padding-left:20px">';
  h += '<li>OR = 200 (agreeable): "An agreeable agent has <strong>200 times</strong> the odds of staying home compared to an antagonistic agent, all else equal."</li>';
  h += '<li>OR = 0.0066 (extraverted): "An extraverted agent has <strong>0.66% of the odds</strong> of staying home compared to an introverted agent." Equivalently: the introverted agent has <strong>1/0.0066 = 151 times</strong> the odds of staying home.</li>';
  h += '</ul>';
  h += '</div>';

  h += `<div style="${BOX}">`;
  h += '<p style="margin:0 0 6px"><strong>Reading an OR for a continuous predictor (infection rate):</strong></p>';
  h += '<ul style="margin:0;padding-left:20px">';
  h += '<li>OR = 12.27 (infection_pct): "For each <strong>1 percentage point</strong> increase in infection rate, the odds of staying home are multiplied by 12.27." So going from 2% to 3% infection multiplies odds by 12.27.</li>';
  h += '<li>Going from 0% to 3% multiplies odds by 12.27<sup>3</sup> = 1,849 &mdash; but the quadratic term (OR = 0.825 per squared unit) dampens this: actual multiplier is exp(2.507 &times; 3 &minus; 0.192 &times; 9) = exp(5.793) = 328.</li>';
  h += '</ul>';
  h += '</div>';

  h += '<p><strong>Caution:</strong> Odds ratios are <em>not</em> risk ratios. An OR of 200 does <em>not</em> mean "200 times more likely to stay home." It means 200 times the <em>odds</em>. When the baseline probability is small (say 1%), odds and probability are nearly identical, so OR approximates the risk ratio. But when baseline probability is high, they diverge substantially.</p>';

  // ── 7. Three Forces and the decision boundary ──────────────
  h += `<h4 style="${H4}">7. Three Forces and the decision boundary</h4>`;
  h += '<p>The logit model decomposes each agent&rsquo;s decision into three additive forces in log-odds space:</p>';
  h += '<div style="background:#f5f5f5;padding:12px 16px;border-radius:6px;margin:10px 0;font-family:monospace;font-size:13px">';
  h += 'total log-odds = <span style="color:#444;font-weight:bold">intercept</span> + <span style="color:#7C3AED;font-weight:bold">personality</span> + <span style="color:#c00;font-weight:bold">infection</span>';
  h += '</div>';
  h += '<p>An agent stays home when the total exceeds 0 (i.e., P &gt; 50%). Under Opus 4.5:</p>';
  h += '<ul style="margin:6px 0;padding-left:20px">';
  h += '<li><strong>Intercept = &minus;14.97</strong>: all agents start with a very strong pull toward going out. This is the deepest negative intercept in our sample &mdash; even deeper than GPT-4o (&minus;9.2).</li>';
  h += '<li><strong>Personality</strong> can range from roughly &minus;12 (extraverted + emotionally stable + antagonistic + unconscientious + closed male) to +17 (introverted + agreeable + conscientious + neurotic + open female). This is a <strong>29-point spread</strong>.</li>';
  h += '<li><strong>Infection</strong> at its maximum (7%) contributes about +8.12 log-odds units.</li>';
  h += '</ul>';
  h += '<p>Putting it together: the "most cautious" agent starts at &minus;14.97 + 17 = +2.0 log-odds. They stay home even at 0% infection. The "most bold" agent starts at &minus;14.97 &minus; 12 = &minus;27. Infection at 7% only adds 8.12, reaching &minus;19 &mdash; nowhere near zero. This agent <em>never</em> stays home.</p>';
  h += '<p>See <strong>Figure 26</strong> (Three Forces) and <strong>Figure 26a</strong> (Agent Decision Waterfall) in the Figure Comparisons section below for interactive visualizations of these forces.</p>';

  // ── 8. How ORs connect to log-odds ─────────────────────────
  h += `<h4 style="${H4}">8. How Odds Ratios connect to all of this</h4>`;
  h += '<p>Odds Ratios (OR) and log-odds are two views of the same thing:</p>';
  h += `<div style="${BOX};${MONO}">`;
  h += 'OR = exp(coefficient) &nbsp;&nbsp;&harr;&nbsp;&nbsp; coefficient = ln(OR)';
  h += '</div>';
  h += '<ul style="margin:6px 0;padding-left:20px">';
  h += '<li>OR &gt; 1 means positive log-odds &rarr; pushes toward staying home</li>';
  h += '<li>OR &lt; 1 means negative log-odds &rarr; pushes toward going out</li>';
  h += '<li>OR = 1 means zero log-odds &rarr; no effect</li>';
  h += '</ul>';
  h += '<p>The key advantage of log-odds: they <strong>add</strong>. You can sum the intercept + each trait&rsquo;s coefficient + infection&rsquo;s coefficient and compare the total to zero. On the OR scale, the equivalent operation is <em>multiplication</em> &mdash; which is harder to visualize. This is why Figures 26 and 26a use the log-odds scale.</p>';
  h += '<p>Figure 27 (Odds Ratio Landscape) uses the OR scale, which is better for showing <em>relative magnitude</em> (how many times more likely). The two scales are complementary views of the same model.</p>';

  // ── 9. Cross-model variation ───────────────────────────────
  h += `<h4 style="${H4}">9. Why coefficients vary across models</h4>`;
  h += '<p>Different LLMs interpret personality traits with vastly different magnitudes. Opus 4.5 shows conscientiousness as an OR of 7,299 and extraverted as OR = 0.0066. Other models may show the same trait with ORs of 5 or 50.</p>';

  h += '<table class="ols-table" style="width:auto;margin:10px 0">';
  h += '<thead><tr><th>Model</th><th>Conscientious coef</th><th>Extraverted coef</th><th>Intercept</th></tr></thead>';
  h += '<tbody>';
  h += '<tr><td>Claude Opus 4.5</td><td>+8.90</td><td>&minus;5.02</td><td>&minus;14.97</td></tr>';
  h += '<tr><td>Claude Sonnet 4.5</td><td>+7.76</td><td>&minus;5.41</td><td>&minus;7.47</td></tr>';
  h += '<tr><td>GPT-4o</td><td colspan="2" style="text-align:center"><em>(see Fig 31)</em></td><td>&minus;9.2</td></tr>';
  h += '<tr><td>GPT-5.2 (low)</td><td colspan="2" style="text-align:center"><em>(see Fig 31)</em></td><td>&minus;0.6</td></tr>';
  h += '</tbody></table>';

  h += '<p>This is a central finding (RQ5): the <em>direction</em> of trait effects is largely consistent across providers (conscientiousness always positive, extraversion always negative), but the <em>magnitude</em> varies by orders of magnitude. Opus 4.5 has some of the most extreme coefficients in the sample, with the deepest intercept and the widest personality spread. See <strong>Figure 29</strong> (cross-model forest plot) and <strong>Figure 30</strong> (trait effects) for comparisons across all 21 configurations.</p>';

  h += '</div>';
  el.innerHTML = h;
}

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
      // Value label
      const valX = b.value >= 0 ? x + barW + 4 : x - 4;
      const anchor = b.value >= 0 ? 'start' : 'end';
      const sigStr = b.sig && b.sig !== 'ns' ? ' ' + b.sig : (b.sig === '' ? ' ns' : ' ns');
      svg += `<text x="${valX}" y="${y + 4}" text-anchor="${anchor}" font-size="10" fill="#555" font-family="monospace">${b.value >= 0 ? '+' : ''}${b.value.toFixed(2)}${sigStr}</text>`;
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
