---
title: "Statistical Foundations for Paper 3"
subtitle: "A Step-by-Step Guide to the Logit Regressions and DHARMa Diagnostics"
author: "Ross Williams"
date: "2026-04-17"
---

# Part 1 — The Study as Data

Before any statistical machinery, get the shape of what you collected fixed in your head. Every modeling choice that follows is driven by this shape.

## 1.1 What one row looks like

Each row in your micro-level CSV is **one binary decision** from one agent:

| agent_id | infection_level | rep | stay_home | traits                              | age | gender |
|----------|-----------------|-----|-----------|--------------------------------------|-----|--------|
| 0042     | 3.2%            | 2   | 1         | "extroverted \| agreeable \| ..."    | 34  | female |
| 0042     | 3.2%            | 3   | 0         | "extroverted \| agreeable \| ..."    | 34  | female |
| 0043     | 3.2%            | 2   | 1         | "introverted \| antagonistic \| ..." | 61  | male   |
| ...      | ...             | ... | ...       | ...                                  | ... | ...    |

`stay_home` is always **0 or 1** — there is no middle ground. This is the single most consequential fact about your data, because it rules out ordinary linear regression and forces you into the logistic family.

## 1.2 The 20,000 per config

For a single LLM configuration:

- 100 agents
- × 40 infection levels (0.175% to 7.0%, roughly)
- × 5 reps per (agent, infection) pair
- = **20,000 rows per config**

Across 21 configurations, that's **420,000 total decisions**.

Each config is analyzed separately — so when you fit Model 2 for Claude Opus 4.5, you're fitting a logit model to 20,000 binary observations from that one LLM.

## 1.3 Clustering

The 20,000 rows are **not independent**. Each agent contributes 200 rows (40 levels × 5 reps), so rows from the same agent are correlated: if agent 42 tends to stay home a lot relative to what their traits predict, all 200 of their rows will reflect that.

This clustering is exactly what the random-effects model (Model 2) accounts for — but we'll get there.

## 1.4 What drives what

The structural question: **which features of the agent or the situation push them toward staying home?**

Two kinds of predictors:

- **Within-agent varying**: `infection_level` (0–7%), and whether certain traits were `mentioned` in the LLM's response. These change from row to row for a single agent.
- **Between-agent fixed**: `traits` (extroverted, agreeable, etc.), `age`, `gender`. These are constant across all 200 rows from a given agent.

This split is why Models 1 and 2 differ in what they can estimate (Section 3).

---

# Part 2 — Stats Refresher

If the last stats class was a while back, this section is to get the key ideas back in working memory. Nothing exotic here.

## 2.1 Three different ways to talk about the same event

Say an agent has a **30% chance** of staying home. There are three equivalent ways to express that number, and you'll see all three in the paper:

| Quantity      | Formula           | Value   | Range          |
|---------------|-------------------|---------|----------------|
| Probability   | p                 | 0.30    | 0 to 1         |
| Odds          | p / (1 − p)       | 0.429   | 0 to ∞         |
| Log-odds      | ln( p / (1 − p) ) | −0.847  | −∞ to +∞       |

Why three scales?

**Probability** is intuitive but awkward to model directly — it's trapped in [0, 1]. If you run a linear regression on probability, your predictions can go negative or exceed 1. Meaningless.

**Odds** stretch to infinity on one side but still bottom out at 0. Also awkward.

**Log-odds** (a.k.a. the "logit") run from −∞ to +∞ with no boundaries. You can do linear regression on log-odds freely. That's the whole reason logistic regression exists: it regresses predictors on the **log-odds** of the outcome, then converts back to a probability at the end via the logistic function.

**Key conversions to have in your head:**

- Log-odds of **0** ↔ probability **0.5**
- Log-odds of **+1** ↔ probability ≈ **0.73**
- Log-odds of **+2** ↔ probability ≈ **0.88**
- Log-odds of **+4** ↔ probability ≈ **0.98**
- Log-odds of **−2** ↔ probability ≈ **0.12**

This S-curve is the logistic function:

$$p = \frac{1}{1 + e^{-\eta}}$$

where η is the log-odds. As η → ∞, p → 1. As η → −∞, p → 0. At η = 0, p = 0.5.

![S-curve sketch: x-axis is log-odds from -5 to +5, y-axis is probability, smooth sigmoid passing through (0, 0.5)]

## 2.2 Bernoulli trials

Each row's `stay_home` is a **Bernoulli trial**: a single coin-flip-like event with outcome 0 or 1, and some probability p of being 1. The whole job of logistic regression is: given the predictors for this row, what is p?

The model never says "this agent will stay home." It always says "the probability that this agent stays home is 0.47." Then nature (or the LLM) flips a biased coin.

**Why this matters for interpretation**: even a well-calibrated model will get plenty of individual predictions "wrong." An agent with p=0.3 who stays home isn't a model failure — that outcome has 30% probability. What we check is whether **across many observations** the predicted probabilities match the observed rates.

## 2.3 What a regression coefficient β means in logit

In ordinary linear regression, `β = 2` means "a one-unit increase in X raises Y by 2 units."

In logistic regression, `β = 2` means **"a one-unit increase in X raises the *log-odds* of Y=1 by 2"**. That's the scale of the coefficient. Translating to more intuitive quantities:

- **Odds ratio** = e^β. If β = 2, odds ratio = e² ≈ 7.39, meaning the odds of staying home are ~7× higher with one extra unit of X.
- **Probability change** depends on the baseline — you have to apply the logistic function to the new log-odds. A β of 2 moves a 50/50 agent to ~88%, but moves an already-90% agent to ~98%.

This last point matters: **the same β does different things to probability depending on where you started**, because the sigmoid is steeper in the middle than at the tails. Don't let a reviewer corner you on "what does β = 2 mean in everyday terms" — the answer is "it depends on the baseline probability, which is why we always plot the combined effect on the original probability scale (Figs 1–21)."

## 2.4 A worked micro-example

Imagine a tiny model with two predictors: intercept α = −1, and a trait β_extravert = +0.5.

- **Introverted agent** (extravert = 0) at intercept: log-odds = −1 → p = 0.269
- **Extraverted agent** (extravert = 1) at intercept: log-odds = −1 + 0.5 = −0.5 → p = 0.378

So the β = +0.5 "extravert" bump moved staying-home probability from 27% → 38%. An 11-percentage-point increase, but on the log-odds scale it's just +0.5.

Express this as an odds ratio: e^0.5 ≈ 1.65. So "extraverted agents have 1.65× the odds of staying home." Fine but note: that's odds, not probability. (Odds of 1.65× isn't "65% more likely" in the everyday sense.)

---

# Part 3 — Your Three Regression Models

You fit three different models per LLM configuration. Each one does a different job. Understanding *why* each exists makes the whole analysis legible.

## 3.1 Model 1 — Fixed-Effects Logit (`glm`)

**Formula:**

```r
glm(stay_home ~ infection_pct + I(infection_pct^2) + factor(agent_id),
    family = binomial, data = df)
```

**What "fixed effect" means here.** `factor(agent_id)` turns each agent's ID into a set of 99 dummy variables (one less than the number of agents; one is the reference). Each dummy gets its own coefficient. So you have one intercept plus one "agent offset" per agent. This is the *most flexible* way to absorb between-agent variation — each agent gets their own personal baseline.

**Why do this.** With 99 agent dummies, the only sources of variation left for the infection predictors to explain are *within-agent* variation. Each agent contributes 200 rows at 40 different infection levels — so the infection coefficient is estimated purely from how each agent's own behavior changes across infection levels, not from between-agent differences.

**What you give up.** You cannot estimate the effect of anything that's fixed at the agent level — traits, age, gender — because those are perfectly absorbed by the agent dummies. If extraversion doesn't vary within agent, no coefficient on extraversion can exist.

**What you report from Model 1.** Only the infection coefficients (main and squared). The 99 agent dummies are statistical nuisances you don't interpret individually.

**Shape of the infection coefficients:**

- `β_infection_pct` (linear): positive means "higher infection → more stay-home."
- `β_infection_pct_sq` (squared): captures curvature. Negative means the curve plateaus or saturates as infection rises (diminishing returns). Positive means the curve steepens.

## 3.2 Model 2 — Random-Effects Logit (`glmer`)

**Formula:**

```r
glmer(stay_home ~ infection_pct + I(infection_pct^2) +
                  male + extraverted + agreeable + conscientious +
                  emot_stable + open_to_exp + age_years +
                  (1 | agent_id),
      family = binomial, data = df)
```

**The key line is `(1 | agent_id)`.** This says: "fit a separate intercept for each agent, but assume those intercepts are drawn from a shared Normal distribution." This is called a **random intercept**.

**Why this is different from Model 1.**

- In Model 1, each agent's intercept is estimated completely independently (99 free parameters).
- In Model 2, agent intercepts are "shrunk" toward the overall mean. Agents with few observations don't wander far from the average; agents with consistent behavior still drift far. This is called **partial pooling** or **shrinkage**.

**What you buy with random effects.** Because the agent-specific offsets are *constrained* (they follow a Normal distribution rather than each being totally free), you now have degrees of freedom left over to estimate the **between-agent** predictors: traits, age, gender. This is why Model 2 gives you the trait coefficients that Model 1 cannot.

**Assumptions of Model 2 (these matter for diagnostics later):**

1. **The random intercepts are Normally distributed** around 0 with some variance σ²_agent. This is the thing `re_variance` reports.
2. **Given the random effect**, observations within an agent are independent Bernoulli trials. (Equivalently: after accounting for each agent's personal baseline, there's no additional structure like time-of-day patterns or response-order effects.)
3. **The logit link is correct** — the probability depends on a linear combination of predictors through the logistic function.
4. **No omitted variables** — there's no predictor you should have measured that would change the conclusions.

**The trait coefficients.** In your coding scheme:

- `male = 1` means male (reference: female). β_male > 0 means "males more likely to stay home, controlling for everything else."
- `extraverted = 1` means extraverted (reference: introverted). β_extraverted < 0 would mean "extraverted agents less likely to stay home." (Though interpret signs carefully — they depend on the reference category.)
- `age_years` is continuous (18–65). β_age > 0 means "each additional year of age raises stay-home log-odds by β."

## 3.3 Model 3 — With Mention Interactions

**Formula** (abbreviated — the actual fit has interactions for each Big Five dimension plus age and infection):

```r
glmer(stay_home ~ infection_pct + I(infection_pct^2) +
                  male + extraverted + ... + age_years +
                  mentioned_ext + mentioned_agr + ...
                  extraverted:mentioned_ext +
                  agreeable:mentioned_agr + ...
                  (1 | agent_id),
      family = binomial, data = df)
```

**What this adds.** The research question: *when the LLM explicitly mentions a trait in its reasoning, does that trait's effect on behavior get amplified?*

`mentioned_ext` is 1 if the LLM's free-text response contains a keyword indicating extraversion (e.g., "outgoing", "social"). 0 otherwise.

`extraverted:mentioned_ext` is the **interaction**: 1 only if the agent is extraverted *and* the LLM mentioned extraversion. 0 otherwise.

**Reading the coefficients:**

- `β_extraverted` = effect of being extraverted **when the trait is NOT mentioned**.
- `β_extraverted + β_interaction` = effect of being extraverted **when the trait IS mentioned**.

**If β_interaction > 0**: mentioning amplifies the trait's effect — extraverts are *even more* inclined in whichever direction they were already going.

**If β_interaction ≈ 0**: mentioning changes nothing. The LLM's prose is decorative; the behavior is the same either way.

**If β_interaction < 0**: mentioning *reverses* or *dampens* the trait effect. Rare but possible.

## 3.4 Worked example: the amplification question

Suppose for one config you see:

- `β_extraverted = −0.4` (extraverts less likely to stay home — they'd rather go out)
- `β_mentioned_ext = −0.1` (mentioning extraversion, on its own, slightly nudges *everyone* toward going out)
- `β_extraverted:mentioned_ext = −0.6` (the interaction)

Then:

- **Extravert, trait not mentioned**: log-odds shift = −0.4. Modest "I want to go out" push.
- **Extravert, trait mentioned**: log-odds shift = −0.4 + (−0.1) + (−0.6) = **−1.1**. Massive "I want to go out" push.
- **Introvert, trait not mentioned**: log-odds shift = 0. Baseline.
- **Introvert, trait mentioned**: log-odds shift = −0.1. The "mention" nudge doesn't interact because the interaction term requires extraverted = 1.

So mentioning extraversion in the LLM's response is associated with a *much* stronger "go out" signal among the agents who actually have that trait. That's the amplification finding, quantified.

## 3.5 When to cite which model

- **Infection dose-response curves (Figs 1–21)**: Model 1 or Model 2 both work. Model 1 is cleaner if you just want "within-agent" infection effects; Model 2 gives you predictions that incorporate agent-average effects.
- **Trait/demographic effects**: Model 2, always. Model 1 can't estimate them.
- **Whether mentioning a trait amplifies its effect**: Model 3, the interaction term is the answer.
- **Whole-model fit / calibration / DHARMa**: Model 2 (that's what you've been running DHARMa on).

---

# Part 4 — How to Read Each Figure

## 4.1 Figure 25 — Coefficient Table / Forest

**What it shows.** For Model 2, every coefficient (intercept, infection linear, infection²,  traits, age, gender) displayed as β ± CI with significance stars.

**How to scan it.**

1. Sign of the trait coefficients — which direction does each Big Five pole push behavior?
2. Which coefficients cross zero (the "no effect" line) — those aren't reliably distinguishable from zero.
3. Size of `β_infection_pct` — this is the headline "how much does rising infection nudge staying home?"

**Common misreadings.** Don't compare coefficient sizes across predictors with different scales. β_age = 0.01 (continuous years) and β_extraverted = 0.4 (0/1 dummy) aren't directly comparable because a "one unit increase" means different things. Multiply β_age by the age range (47 years) if you want a comparable quantity.

## 4.2 Figure 27 — Log-Odds Landscape

**What it shows.** For each of 21 LLMs, two horizontal bars:
- **Solid bar**: the personality range at 0% infection. Circle end = "most go-out-prone agent"; diamond end = "most stay-home-prone agent."
- **Dashed bar**: same range, but shifted by the log-odds effect of maximum infection. Open markers.

**How to scan it.**

- Horizontal position → absolute log-odds. Further right = more stay-home-prone.
- Bar length → how much personality variation the LLM encodes. Longer bar = personality matters more.
- Distance between solid and dashed bars → how much infection moves the needle.

**What to look for.**

- **Infection-driven models**: solid and dashed bars are far apart. The LLM responds strongly to infection rate.
- **Personality-driven models**: bars are long. Personality variation is big relative to infection shift.
- **Flat models**: bars are short and close together. The LLM barely differentiates between agents or infection states.

## 4.3 Figure 28 — Forest Plot with OR axis

**What it shows.** For each Big Five dimension plus age, a panel containing 21 dots (one per model), each at the β value with CI whiskers. Dots are filled when significant (p < .05), hollow/faded otherwise. Secondary x-axis shows odds ratios (e^β).

**How to scan it.**

- Column position → effect direction + magnitude.
- Filled vs. hollow → did this model's data reliably distinguish the effect from zero?
- Whisker width → precision of the estimate.

**Useful framing.** A model where most dots are filled and in the same direction is a model that strongly encodes that trait dimension. A model where dots are scattered around zero is a model that treats that trait as behaviorally irrelevant.

## 4.4 Figure 24 — Personality Ranking Accuracy

(You may know this one better than I do — skim but the core idea is usually: does the model's implied agent ordering match the agents' objective trait count?)

## 4.5 Figure 24b — Calibration + DHARMa Q-Q

**Per-model small multiples (default view).** Each panel:
- x-axis: model-predicted P(stay-home), 0 to 1
- y-axis: observed proportion of stay-home in that bin, 0 to 1
- Diagonal line = perfect calibration
- Dots = 40 bins (one per infection level)
- MAD below = mean absolute deviation across bins, in percentage points

**What to look for.** Dots hugging the diagonal = well-calibrated. Dots systematically above diagonal at low x = model under-predicts stay-home at low infection (rare). Dots systematically below diagonal at high x = model over-predicts stay-home at high infection.

**DHARMa Q-Q view.** Discussed in Parts 6–7 in detail.

## 4.6 Response Analysis Figures (35, 36, 37)

- **Fig 35 — Amplification forest plot**: for each Big Five dimension, panel showing β_mentioned and β_interaction per model.
- **Fig 36 — Cross-model amplification**: 4-dot-per-panel view of the log-odds positions under each (trait × mention) combination.
- **Fig 37 — Amplification matrix**: dense grid of all 21 models × all trait-mention combinations. Blue = less stay-home, red = more. Opacity = significance.

**How to read them together.** The forest plot (35) is the summary statistic; the matrix (37) is the scanning tool for "which cell jumps out?"; the cross-model view (36) is for understanding *absolute* positions (where the model actually predicts agents end up), not just deltas.

---

# Part 5 — Why Standard Residuals Fail for Your Models

This section motivates why DHARMa exists. Skip it if you're already convinced; dig in if you'd like to understand the mechanics.

## 5.1 Residuals in linear (OLS) regression — the simple case

In ordinary least squares regression on continuous outcomes:

$$y_i = \beta_0 + \beta_1 x_i + \varepsilon_i$$

the **residual** is `y_i − ŷ_i` (observed minus predicted). If the model is correct, these residuals should be:

1. Centered on zero (no bias)
2. Normally distributed
3. Have constant variance (homoskedastic)
4. Uncorrelated with the predictors

You diagnose the model by plotting residuals against fitted values, predictors, or theoretical Normal quantiles (the classic Normal Q-Q plot). Systematic shapes indicate something's off.

## 5.2 Why this breaks when outcomes are binary

Now your outcome is 0 or 1, and your prediction `ŷ_i` is a probability between 0 and 1. So your residual `y_i − ŷ_i` can only take two values per observation:

- If `y_i = 1`: residual is `1 − p̂`
- If `y_i = 0`: residual is `−p̂`

These residuals are:

1. **Not continuous** — only two discrete values per row.
2. **Bounded** — always in [−1, 1].
3. **Heteroskedastic** — variance depends on `p̂`: Var(residual) = p̂(1 − p̂). Near p̂ = 0 or p̂ = 1, variance shrinks to zero; near p̂ = 0.5, it peaks.
4. **Not Normal** — they can never be Normally distributed; they're Bernoulli-tied.

You can't use Normal Q-Q plots directly. The assumptions of the residual diagnostic don't hold.

## 5.3 Old-school fixes (Pearson, Deviance residuals)

Statisticians patched this up with **Pearson residuals**:

$$r_i^{Pearson} = \frac{y_i - \hat{p}_i}{\sqrt{\hat{p}_i(1 - \hat{p}_i)}}$$

This standardizes the residual by its expected standard deviation, fixing the heteroskedasticity. At large sample sizes, with enough repeated observations in each predictor bin, Pearson residuals become approximately Normal and you can Q-Q plot them.

**Deviance residuals** do a similar thing using the likelihood-based contribution of each observation; they too become roughly Normal in the limit.

**Why this is shaky for your case.**

1. **Binary outcomes without repeated bins don't aggregate nicely.** At the individual-row level, even Pearson residuals are still bimodal (one value for `y=1`, another for `y=0`). You have to aggregate into bins before the Normal approximation kicks in — which you did do in the calibration plot (40 infection bins), but that aggregation throws away information.
2. **Random effects complicate "prediction."** With `(1 | agent_id)`, what's `ŷ_i`? The prediction conditional on the estimated random intercept for agent i? Or the marginal prediction averaging over random effects? They're different numbers, and residuals built from each mean different things.
3. **Mixed-model residuals at the observation level aren't covered by standard theory.** No one really knows what distribution they should follow.

## 5.4 The clean alternative: simulate and compare

DHARMa's insight: *forget trying to derive analytic residual distributions*. Instead, just **simulate**. Ask the fitted model to generate data that looks like what the real data would look like *if the model were correct*. Then compare the real data to those simulations.

This is closer to how Bayesian posterior predictive checks work. It's a thoroughly modern, computational approach, and it sidesteps the entire Pearson-vs-deviance-vs-whatever debate.

---

# Part 6 — DHARMa, From Scratch

Now we build DHARMa's residual from the ground up.

## 6.1 The Probability Integral Transform (PIT) — the foundational trick

**Theorem (PIT)**: Let X be a continuous random variable with CDF F. Then the random variable U = F(X) is Uniformly distributed on [0, 1].

**Intuition.** The CDF maps each possible value of X to its quantile position — "what fraction of the distribution is at or below this value?" If X actually is drawn from F, then its quantile position is uniformly random: it's equally likely to land in any percentile.

**Sketch of why.** Pick any u ∈ [0, 1]. Then:

$$P(U \leq u) = P(F(X) \leq u) = P(X \leq F^{-1}(u)) = F(F^{-1}(u)) = u$$

The CDF of U is P(U ≤ u) = u, which is the Uniform(0,1) CDF. Done.

**Why this matters.** If you want to check whether a model is correct, you can plug observed data into the model's predicted CDF and check that the resulting quantiles are Uniform(0,1). Any deviation from uniformity is evidence of model misspecification.

## 6.2 The discrete problem

The PIT theorem needs **continuous** data. Your outcomes are binary. The CDF of a Bernoulli(p) distribution isn't continuous — it's a step function with jumps at 0 and 1:

```
F(x) =  0        if x < 0
        1 − p    if 0 ≤ x < 1
        1        if x ≥ 1
```

So `F(observed)` isn't a well-defined single number — it's an interval (the jump). If `observed = 0`, the CDF "at" 0 is the jump from 0 to (1 − p). If `observed = 1`, it's the jump from (1 − p) to 1.

**Randomized PIT** fixes this: for each observation, sample a uniform value *from the jump interval*.

- `observed = 0` → residual ~ Uniform(0, 1 − p)
- `observed = 1` → residual ~ Uniform(1 − p, 1)

**Why this works (the density math).**

Take any single observation with true probability p. Its randomized residual has:

- Probability p of being observed = 1, contributing Uniform(1 − p, 1) with density `1/p` on that interval.
- Probability (1 − p) of being observed = 0, contributing Uniform(0, 1 − p) with density `1/(1 − p)` on that interval.

Multiply each case by its probability of occurring:

- Density contribution on [1 − p, 1]: `p × 1/p = 1`.
- Density contribution on [0, 1 − p]: `(1 − p) × 1/(1 − p) = 1`.

**The density is exactly 1 across the full [0, 1] interval — Uniform(0, 1).**

This is independent of what p is. Any single observation, correctly modeled, produces a Uniform(0,1) residual.

And across 20,000 independent observations all correctly modeled, you get 20,000 independent Uniform(0,1) draws. Their empirical CDF should lie on the diagonal of a Q-Q plot against the theoretical Uniform.

## 6.3 How DHARMa implements this via simulation

The math in 6.2 assumes you know the true p for each observation. You don't — you know the *fitted* model's estimate. DHARMa handles this by:

1. **Simulating 250 datasets** from the fitted model. For each row i, draw 250 Bernoulli outcomes using the fitted p_i.
2. **Building a per-observation empirical CDF** from those 250 draws. For observation i, the simulated CDF is essentially just:
    - P(simulated < observed) and P(simulated ≤ observed)
    - For binary data with observed = 0: simulated CDF jumps from 0 to `(1 − p̂_i)` at 0. Equivalently, jump interval is `[0, 1 − p̂_i]`.
    - For binary data with observed = 1: jump interval is `[1 − p̂_i, 1]`.
3. **Randomized residual draw.** Sample one Uniform value from that jump interval. Call that the scaled residual for observation i.

Under a correct model, the estimated p̂_i converges to the true p_i in large samples, so the residuals behave as the theoretical Uniform(0,1) analysis predicts.

DHARMa stores these 20,000 scaled residuals (one per observation) and provides them for diagnostic plotting.

## 6.4 What the "250 simulations" is doing

You might wonder why 250 and what exactly it does.

For simple cases like binary outcomes, you don't strictly need simulation — you could just compute the Bernoulli CDF directly. But DHARMa is general — it works for Poisson, negative binomial, zero-inflated, whatever — and those distributions don't always have simple closed-form CDFs under a GLMM. Simulation sidesteps this by treating the model as a black-box generator.

250 is enough draws to get the per-observation CDF resolved to about 1/250 = 0.4% granularity, which is plenty for diagnostic-plot purposes. More sims = more precision, less is noisier. DHARMa defaults to 250 for speed.

## 6.5 What the stored `quantiles` vector in your JSONs is

The `compute_dharma.R` patcher doesn't store all 20,000 per-observation residuals (that would bloat the JSONs). Instead it stores **99 summary quantiles**: the 1st, 2nd, ..., 99th percentile of the empirical distribution of residuals. Those 99 numbers, plotted at the theoretical Uniform positions [0.01, 0.02, ..., 0.99], give you the Q-Q curve you see in Fig 24b.

This is an excellent compression: the Q-Q plot only cares about the shape of the empirical CDF, and 99 quantiles capture that shape with almost no loss.

---

# Part 7 — Interpreting DHARMa Output

## 7.1 The Q-Q plot, mechanically

- **x-axis**: theoretical quantile position, 0 to 1. At x = 0.3, you're asking "what's the 30th percentile of a Uniform(0,1)?" — trivially, 0.3.
- **y-axis**: observed quantile position — i.e., the 30th percentile of *your* residuals.
- **Diagonal**: perfect Uniform residual distribution.
- **Your curve**: the empirical CDF of 20,000 residuals, summarized by 99 stored percentiles.

Any departure from the diagonal is a distributional mismatch between your observed residuals and Uniform(0,1) — evidence of model misspecification.

## 7.2 Shape library — what deviations mean

**Curve tightly hugs diagonal.** No detectable issue with residual distribution. The model is calibrated across the full probability range. This is the ideal.

**Curve S-shape** (below diagonal at left, above at right).

```
  1 ┤       ╭──
    │    ╭──╯
0.5 ┤───╯
    │╭─╯
  0 ┼────────
    0  0.5   1
```

The empirical CDF is *narrower* than Uniform — residuals cluster toward the middle, avoiding the tails. Interpretation: the model is *more confident than it should be*. Predicted probabilities are too close to 0 or 1 when the real outcomes are less certain. Underdispersion.

**Inverse S-shape** (above at left, below at right).

```
  1 ┤─────╮
    │     ╰─╮
0.5 ┤       ╰───
    │          ╰─
  0 ┼────────
    0  0.5    1
```

The empirical CDF is *wider* than Uniform — residuals pile up at the extremes. Interpretation: the model's predictions are *under-confident* or there's extra variance not captured (e.g., an omitted grouping factor, residual agent heterogeneity). Overdispersion.

**Curve consistently above diagonal.** Residuals skewed toward larger values (more observations fall near 1 than expected). Model is systematically *under-predicting* the outcome — predicting low probabilities when reality is higher.

**Curve consistently below diagonal.** Opposite: model is systematically *over-predicting*.

**Sag/bulge near middle only.** Model is fine at the tails but miscalibrated in the middle probability range — could indicate missing non-linearity in a key predictor.

## 7.3 The Kolmogorov-Smirnov test

**What it computes.** The KS statistic is the maximum vertical distance between your empirical CDF (the Q-Q curve) and the diagonal. A small KS stat means the curves are close; large means they're far.

The **p-value** is the probability, under the null hypothesis that the residuals truly are Uniform(0,1), of seeing a KS statistic at least as large as what you observed.

- **p ≥ .05**: can't reject uniformity. The curve is close enough to the diagonal given the sample size.
- **p < .05**: reject uniformity. Some kind of systematic deviation exists.

**The over-power problem at N = 20,000.** With 20,000 observations, the KS test is extraordinarily sensitive. Even tiny deviations (e.g., the empirical CDF sitting 0.01 below the diagonal in one small region) will push the p-value below 0.05. That doesn't mean the model is *meaningfully* miscalibrated — just that the deviation is detectable with this much data.

Rule of thumb for your paper: **visual inspection trumps the p-value at this sample size**. If the curve is visibly hugging the diagonal, that's good calibration even if KS p = 0.001. Report both; lean on the visual.

## 7.4 The dispersion ratio

**What it computes.** `Var(observed residuals) / Var(expected residuals under the fitted model)`. DHARMa computes this by comparing the variance of the *actual* scaled residuals to what the variance would be under the simulated null distribution.

- **Ratio = 1.0**: perfect. Model's variance assumptions are correct.
- **Ratio > 1.0**: overdispersion. The real data has more variance than the model predicts. Usually because:
    - Unmeasured heterogeneity at the observation level (e.g., if there's correlation between reps from the same agent that the random intercept doesn't fully absorb).
    - Missing nonlinear predictors.
    - Outliers.
- **Ratio < 1.0**: underdispersion. The real data is *less* variable than the model predicts. Usually because:
    - Agents are more deterministic than a Bernoulli with the given p would predict. For an LLM, this often happens because temperature sampling produces high rep-to-rep agreement — the "agent" is essentially giving the same answer every time, which is *less random* than a p = 0.5 coin flip would be.
    - Response ceilings/floors.

**Interpretation ranges (informal).**

- **0.90 – 1.10**: unremarkable. No real concern.
- **0.75 – 0.90** or **1.10 – 1.25**: mild dispersion deviation. Worth noting but usually not a problem.
- **Outside 0.75 – 1.25**: the model's variance assumptions are visibly off. Consider whether there's a structural issue (missing random slope, correlated reps, etc.).

**Your results in this framing.**

- Most configs: 0.9 – 1.1. Fine.
- Claude Opus 4.5 at 1.14: mild overdispersion. Probably residual agent heterogeneity the random intercept isn't fully capturing.
- Claude Sonnet 4.0 at 0.74 and GPT-5.2 off at 0.62: meaningful underdispersion. These LLMs are giving *highly consistent* answers across reps — less random than Bernoulli assumes. Worth flagging in the paper.

## 7.5 How to present the diagnostics in Paper 3

A suggested paragraph structure:

> We diagnosed the random-effects logit specification (Model 2) for each of the 21 configurations using DHARMa's simulated residuals (Hartig 2022), with 250 simulated datasets per fit. Figure 24b displays the Q-Q plot of scaled residuals against the theoretical Uniform(0,1) distribution for each configuration, along with Kolmogorov-Smirnov tests of uniformity and dispersion ratios.
>
> Visually, [most / N of 21] configurations track the diagonal closely, indicating good calibration across the probability range. Dispersion ratios fell in the 0.9–1.1 range for [N] configurations, with mild overdispersion in [list] and underdispersion in [list]. The underdispersion in [Sonnet 4.0 / GPT-5.2 off] reflects the high rep-to-rep agreement these models exhibit (see Figure 39), such that the binomial variance assumption slightly overstates observation-level variability.
>
> Kolmogorov-Smirnov p-values were generally small, reflecting the statistical power of 20,000 observations per configuration to detect even small deviations from perfect uniformity. We emphasize visual calibration and dispersion ratios over KS p-values for this reason.

---

# Part 8 — Putting It All Together

## 8.1 The full statistical story in one page

1. You have 420,000 binary decisions across 21 LLM configurations.
2. Within each config, you estimate the effect of infection level, traits, age, and gender on the probability of staying home using **logistic regression** (Model 2, random-effects).
3. You also estimate whether *explicitly mentioning* a trait amplifies its behavioral effect, via interaction terms (Model 3).
4. You cross-validate the fits using DHARMa simulated residuals — the Q-Q plots in Fig 24b, the KS test, and the dispersion ratio tell you which configurations are well-calibrated and which have visible variance-assumption violations.
5. The figures then tell the comparative story: which LLMs encode rich personality variation, which are infection-sensitive, which amplify mentions, and which are essentially flat.

## 8.2 Caveats worth pre-empting

- **KS p-values over-power at N = 20k**. Reviewers who see "KS p < .001" might mistake it for catastrophic misfit. Head it off in-text.
- **Random-intercept-only specification**. You use `(1 | agent_id)`, not random slopes. If a reviewer asks "why not random slopes on infection?", the answer is that within-agent infection responses are already captured by the fixed effects; additional random slopes would be over-parameterized given 200 obs/agent.
- **Trait keyword detection noise**. `mentioned_ext` is 1 if certain keywords appear. This is a noisy proxy. If keyword lists were too narrow, `β_mentioned` underestimates the real effect; if too broad, it picks up false positives. You tightened these in March 2026 per your roadmap; note the keyword set in the methods.
- **Temperature = 1 for reasoning models; varies elsewhere.** Response stochasticity differs across configs, which affects the dispersion ratio (mechanically — a low-temperature model gives more consistent responses, driving the ratio down).

## 8.3 Things you can stop worrying about

- The logit link — standard, well-understood, appropriate for binary data with continuous predictors.
- Estimating SEs with `glmer` — lme4 uses a Laplace approximation for the likelihood; at N = 20k with 100 agents, this is very accurate.
- Multiple testing within a single model — individual coefficient tests are not the main inference; the forest plots show the pattern across configurations, which is the actual unit of inference.

---

# Appendix A — Other Concepts Worth a Refresher

## A.1 Significance testing (α, Type I/II)

- **Null hypothesis (H₀)**: some specific claim, usually "no effect" (β = 0).
- **p-value**: probability of seeing data at least this extreme if H₀ is true.
- **α (significance level)**: the threshold at which you reject H₀. Conventionally 0.05.
- **Type I error**: rejecting H₀ when it's actually true. Controlled by α.
- **Type II error**: failing to reject H₀ when it's actually false. Controlled by sample size and effect size.

For your data, Type I errors are mostly a non-issue — with N = 20k you have enormous statistical power. The opposite problem — declaring tiny, meaningless effects "significant" — is the real concern. Always pair p-values with effect sizes.

## A.2 Multiple comparisons

If you run 21 configs × ~9 trait/demographic coefficients = ~189 coefficient tests, you'd expect ~9 to be "significant" at α = 0.05 by chance alone. This doesn't invalidate your analysis because you're not interpreting each coefficient as a separate inferential claim — you're looking at patterns across models.

If a reviewer insists, you can apply Bonferroni (divide α by the number of tests) or use FDR (Benjamini-Hochberg) — but flag in-text that the primary inference is at the model level, not per-coefficient.

## A.3 AIC and BIC

- **AIC** (Akaike Information Criterion): `−2 × log-likelihood + 2 × k`, where k is the number of parameters. Lower is better. Rewards fit, penalizes complexity.
- **BIC** (Bayesian Information Criterion): `−2 × log-likelihood + ln(n) × k`. Lower is better. Same spirit but penalizes complexity more harshly at large n.

Useful for comparing nested or non-nested models on the same data. **AIC differences of ~10 are substantial; ~2–6 are suggestive but not decisive.** Not useful for absolute model quality — they only say "Model A fits the same data better than Model B" in relative terms.

## A.4 Confidence intervals

A **95% CI** for a coefficient means: "if we repeated this study many times under identical conditions and constructed CIs the same way, 95% of those intervals would contain the true value."

It does *not* mean "there is a 95% probability that the true β is in this particular interval." That's the Bayesian credible-interval interpretation, which requires a prior.

A CI that excludes zero is equivalent to rejecting H₀: β = 0 at α = 0.05.

## A.5 Effect size ≠ significance

At N = 20k, even a β of 0.01 can be "significant" (p < .05). But translated to probability: 0.01 log-odds ≈ 0.25 percentage-point change in probability at baseline. Vanishingly small.

Always ask: "is this effect size meaningful in context?" For stay-home probability, a β that moves probability by less than ~2 percentage points is probably not worth calling an "effect" in the written paper, even if it's statistically significant.

## A.6 Temperature, thinking budgets, and LLM stochasticity

Paper-specific: the configurations differ not just in underlying LLM but in **temperature settings** and **reasoning budgets** (e.g., GPT-5.2 high/medium/low). These mechanically affect response variance:

- Higher temperature → more rep-to-rep disagreement → dispersion ratio closer to 1 or above
- Lower temperature → more rep-to-rep agreement → dispersion ratio below 1

Keep this in mind when interpreting diagnostic differences across configs.

---

# Appendix B — R Commands Cheat Sheet

## B.1 Running the full regression pipeline

```bash
cd "GABM 3rd paper/GABM mobility curve"
Rscript analysis/compute_regressions.R
```

Fits all 3 models for all 21 configs. Writes JSON to `viz/data/real/regressions/`. Takes 30–60 minutes depending on configs and lme4 convergence.

## B.2 Running DHARMa only (patching existing JSONs)

```bash
Rscript analysis/compute_dharma.R --cores 4 --force
```

Re-fits only Model 2 per config, runs DHARMa, patches the `model2.dharma` field in each JSON. ~5 minutes with 4 cores.

Flags:

- `--only <config_key>`: restrict to a single config (e.g. `anthropic_claude-opus-4-5_off`)
- `--limit N`: process only the first N configs
- `--force`: re-run even if `dharma` field already exists

## B.3 Key R snippets

**Fit a logit GLMM:**

```r
m <- glmer(stay_home ~ infection_pct + I(infection_pct^2) +
                       male + extraverted + ... + (1 | agent_id),
           family = binomial, data = df,
           control = glmerControl(optimizer = "bobyqa",
                                   optCtrl = list(maxfun = 100000)))
summary(m)
```

**Extract coefficients:**

```r
coef_table <- summary(m)$coefficients
# Each row: Estimate, Std. Error, z value, Pr(>|z|)
```

**Run DHARMa:**

```r
library(DHARMa)
sim <- simulateResiduals(fittedModel = m, n = 250, plot = FALSE, seed = 42)
testUniformity(sim, plot = FALSE)   # KS test
testDispersion(sim, plot = FALSE)   # dispersion ratio
plot(sim)                            # full diagnostic panel
```

---

# Appendix C — Glossary

**α (alpha)**. Significance threshold, usually 0.05. Probability of a Type I error under H₀.

**β (beta)**. A regression coefficient. In logit regression, on the log-odds scale.

**Bernoulli trial**. A single binary outcome (0/1) with some probability p of being 1.

**Binomial distribution**. The distribution of the count of 1s in n independent Bernoulli trials.

**CDF (Cumulative Distribution Function)**. A function F(x) giving P(X ≤ x). Always between 0 and 1, monotone non-decreasing.

**Confidence interval (CI)**. A range of parameter values consistent with the data at a specified confidence level (usually 95%).

**DHARMa**. An R package for simulated residual diagnostics in GLMMs.

**Dispersion ratio**. Observed residual variance / expected residual variance. Target 1.0.

**Fixed effect**. A regression coefficient estimated independently, with no distributional constraint.

**GLMM (Generalized Linear Mixed Model)**. A regression model with a non-identity link function (e.g., logit) plus random effects.

**glmer**. The function in R's `lme4` package for fitting GLMMs with a logit (or other) link.

**Intercept (α or β₀)**. The model's prediction (on the linear scale) when all predictors are at their reference value.

**Interaction**. A term of the form `X₁ × X₂`: the combined effect of two predictors exceeds or falls short of the sum of their individual effects.

**Kolmogorov-Smirnov (KS) test**. A test of whether two distributions (often empirical vs. theoretical) differ, based on the maximum vertical distance between their CDFs.

**Likelihood**. The probability of the observed data given a set of parameter values, treated as a function of the parameters.

**Link function**. The transformation relating the linear predictor (βX) to the expected outcome. Identity in OLS, logit in logistic regression.

**Log-odds (logit)**. ln(p / (1 − p)). The natural scale for logistic regression.

**Odds**. p / (1 − p). "The odds of staying home are X:1."

**Odds ratio**. e^β. Multiplicative change in odds per unit change in predictor.

**PIT (Probability Integral Transform)**. The theorem that F(X) is Uniform(0,1) for continuous X with CDF F.

**Pearson residual**. (y − p̂) / sqrt(p̂(1 − p̂)). Standardized residual for binary outcomes.

**Random intercept**. An agent-specific offset, modeled as drawn from Normal(0, σ²). Shrunk toward 0 via partial pooling.

**Residual**. Observed minus predicted. Various forms (raw, Pearson, deviance, scaled) for different model types.

**Scaled residual**. DHARMa's randomized-PIT residual. Should be Uniform(0,1) under a correct model.

**Shrinkage / Partial pooling**. The tendency of random-effect estimates to be pulled toward the overall mean, especially for groups with few observations.

**σ² (sigma-squared)**. A variance parameter. In your case, σ²_agent is the variance of the random intercept distribution.

**Type I error**. False positive: rejecting H₀ when it's true.

**Type II error**. False negative: failing to reject H₀ when it's false.

**Uniform(0,1)**. The flat distribution on [0, 1]. Each value is equally likely.

**Variance**. Expected squared deviation from the mean. E[(X − μ)²].

---

*End of document. Questions, corrections, and additions to: rossfw@vt.edu.*
