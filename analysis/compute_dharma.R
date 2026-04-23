#!/usr/bin/env Rscript
# ============================================================
# GABM Mobility Curve — DHARMa Residual Patcher
#
# Faster alternative to full regression rerun: fits ONLY Model 2
# (random-effects logit) per config, runs DHARMa, and patches the
# dharma field in the existing regression JSON files in place.
#
# Runtime: ~1 min per config × 21 configs = ~20 min sequential,
# or ~6-8 min with parallel::mclapply (4 cores).
#
# Usage:
#   Rscript analysis/compute_dharma.R                          # all 21, 1 core
#   Rscript analysis/compute_dharma.R --limit 1                # test first config only
#   Rscript analysis/compute_dharma.R --only openai_gpt-4o_off # one specific config
#   Rscript analysis/compute_dharma.R --cores 4                # all 21, 4 cores
# ============================================================

library(data.table)
library(lme4)
library(jsonlite)
library(DHARMa)
library(parallel)

# ── Args ──────────────────────────────────────────────────────
args_raw <- commandArgs(trailingOnly = TRUE)

n_cores <- 1L
cores_idx <- which(args_raw == "--cores")
if (length(cores_idx) > 0 && length(args_raw) > cores_idx) {
  n_cores <- max(1L, as.integer(args_raw[cores_idx + 1]))
}

n_limit <- Inf  # process all by default
limit_idx <- which(args_raw == "--limit")
if (length(limit_idx) > 0 && length(args_raw) > limit_idx) {
  n_limit <- as.integer(args_raw[limit_idx + 1])
}

only_key <- NULL  # restrict to a single config key
only_idx <- which(args_raw == "--only")
if (length(only_idx) > 0 && length(args_raw) > only_idx) {
  only_key <- args_raw[only_idx + 1]
}

force_run <- "--force" %in% args_raw  # rerun even if dharma already exists

cat(sprintf("Using %d core(s)", n_cores))
if (is.finite(n_limit)) cat(sprintf(", limit %d config(s)", n_limit))
if (!is.null(only_key)) cat(sprintf(", only '%s'", only_key))
if (force_run) cat(", FORCE rerun")
cat("\n")

# ── Paths ─────────────────────────────────────────────────────
script_args <- commandArgs(trailingOnly = FALSE)
script_path <- sub("--file=", "", script_args[grep("--file=", script_args)])
if (length(script_path) == 0) {
  BASE_DIR <- normalizePath(".")
} else {
  BASE_DIR <- normalizePath(file.path(dirname(script_path), ".."))
}
DATA_DIR  <- file.path(BASE_DIR, "viz", "data", "real")
OUT_DIR   <- file.path(DATA_DIR, "regressions")
AGENTS_FILE <- file.path(BASE_DIR, "agents", "agents.json")

cat("Base dir:", BASE_DIR, "\n")
cat("Regressions dir:", OUT_DIR, "\n\n")

# ── Load agents ───────────────────────────────────────────────
agents_raw <- fromJSON(AGENTS_FILE)
agents <- data.table(
  agent_id = agents_raw$agent_id,
  gender   = agents_raw$gender
)

# ── Discover configs that have a regression JSON ──────────────
json_files <- list.files(OUT_DIR, pattern = "\\.json$", full.names = TRUE)
cat("Found", length(json_files), "existing JSON files\n")

# Apply --only filter
if (!is.null(only_key)) {
  json_files <- json_files[grepl(only_key, basename(json_files), fixed = TRUE)]
}

# Apply --limit filter
if (is.finite(n_limit)) {
  json_files <- head(json_files, n_limit)
}

cat("Processing", length(json_files), "file(s)\n\n")

`%||%` <- function(a, b) if (!is.null(a)) a else b

# ── Per-config worker ─────────────────────────────────────────
process_config <- function(json_path) {
  config_key <- sub("\\.json$", "", basename(json_path))

  # Locate micro CSV using config_key as directory name
  micro_file <- file.path(DATA_DIR, config_key, "probe_results_micro.csv")
  if (!file.exists(micro_file)) {
    return(list(key = config_key, status = "SKIP — no micro CSV"))
  }

  # Read existing JSON
  existing <- tryCatch(fromJSON(json_path, simplifyVector = FALSE),
                       error = function(e) NULL)
  if (is.null(existing)) {
    return(list(key = config_key, status = "SKIP — unreadable JSON"))
  }

  # Skip if BOTH m1 and m2 dharma already populated (unless --force)
  m2_has <- !is.null(existing$model2$dharma) && !is.null(existing$model2$dharma$ks_p_value)
  m1_has <- !is.null(existing$model1$dharma) && !is.null(existing$model1$dharma$ks_p_value)
  if (!force_run && m2_has && m1_has) {
    return(list(key = config_key, status = "already has dharma (m1+m2) — skipped"))
  }

  t_overall <- proc.time()

  # ── Load data ──────────────────────────────────────────────
  df <- fread(micro_file)
  df[, stay_home   := ifelse(response == "yes", 1L, 0L)]
  df[, infection_pct := as.numeric(infection_level)]
  df <- merge(df, agents, by = "agent_id", all.x = TRUE)
  df[, male          := ifelse(gender == "male", 1L, 0L)]
  df[, extraverted   := ifelse(grepl("extroverted", traits), 1L, 0L)]
  df[, agreeable     := ifelse(grepl("\\bagreeable\\b", traits), 1L, 0L)]
  df[, conscientious := ifelse(grepl("unconscientious", traits), 0L, 1L)]
  df[, emot_stable   := ifelse(grepl("emotionally stable", traits), 1L, 0L)]
  df[, open_to_exp   := ifelse(grepl("open to experience", traits), 1L, 0L)]
  df[, age_years     := as.integer(age)]

  # ── Fit Model 2 ────────────────────────────────────────────
  t_glmer <- proc.time()
  m2 <- tryCatch(
    glmer(
      stay_home ~ infection_pct + I(infection_pct^2) +
        male + extraverted + agreeable + conscientious +
        emot_stable + open_to_exp + age_years +
        (1 | agent_id),
      family  = binomial,
      data    = df,
      control = glmerControl(optimizer = "bobyqa",
                             optCtrl   = list(maxfun = 100000))
    ),
    error = function(e) e
  )
  glmer_secs <- round((proc.time() - t_glmer)["elapsed"], 1)
  if (inherits(m2, "error")) {
    return(list(key = config_key,
                status = paste("Model 2 ERROR:", m2$message),
                timing = list(glmer_s = glmer_secs, dharma_s = NA, total_s = NA)))
  }

  # ── DHARMa for Model 2 ────────────────────────────────────
  t_dharma <- proc.time()
  sim <- tryCatch(
    DHARMa::simulateResiduals(fittedModel = m2, n = 250, plot = FALSE, seed = 42),
    error = function(e) NULL
  )
  dharma_info <- tryCatch({
    if (is.null(sim)) stop("simulateResiduals failed for M2")
    resids <- sim$scaledResiduals
    probs  <- seq(0.01, 0.99, by = 0.01)
    qvals  <- as.numeric(quantile(resids, probs = probs, na.rm = TRUE))
    t_unif <- DHARMa::testUniformity(sim, plot = FALSE)
    t_disp <- DHARMa::testDispersion(sim, plot = FALSE)
    list(
      n_sim            = 250L,
      n_obs            = length(resids),
      probs            = probs,
      quantiles        = qvals,
      ks_statistic     = as.numeric(t_unif$statistic),
      ks_p_value       = as.numeric(t_unif$p.value),
      dispersion_ratio = as.numeric(t_disp$statistic),
      dispersion_p     = as.numeric(t_disp$p.value)
    )
  }, error = function(e) {
    list(error = e$message)
  })
  dharma_secs <- round((proc.time() - t_dharma)["elapsed"], 1)

  # ── Fit Model 1 (fixed-effects glm) ────────────────────────
  t_glm <- proc.time()
  m1 <- tryCatch(
    glm(stay_home ~ infection_pct + I(infection_pct^2) + factor(agent_id),
        family = binomial, data = df),
    error = function(e) e
  )
  glm_secs <- round((proc.time() - t_glm)["elapsed"], 1)
  dharma1_secs <- NA_real_
  dharma1_info <- NULL
  sim1 <- NULL
  if (!inherits(m1, "error")) {
    t_dharma1 <- proc.time()
    sim1 <- tryCatch(
      DHARMa::simulateResiduals(fittedModel = m1, n = 250, plot = FALSE, seed = 42),
      error = function(e) NULL
    )
    dharma1_info <- tryCatch({
      if (is.null(sim1)) stop("simulateResiduals failed for M1")
      resids1 <- sim1$scaledResiduals
      probs1  <- seq(0.01, 0.99, by = 0.01)
      qvals1  <- as.numeric(quantile(resids1, probs = probs1, na.rm = TRUE))
      t_unif1 <- DHARMa::testUniformity(sim1, plot = FALSE)
      t_disp1 <- DHARMa::testDispersion(sim1, plot = FALSE)
      list(
        n_sim            = 250L,
        n_obs            = length(resids1),
        probs            = probs1,
        quantiles        = qvals1,
        ks_statistic     = as.numeric(t_unif1$statistic),
        ks_p_value       = as.numeric(t_unif1$p.value),
        dispersion_ratio = as.numeric(t_disp1$statistic),
        dispersion_p     = as.numeric(t_disp1$p.value)
      )
    }, error = function(e) {
      list(error = e$message)
    })
    dharma1_secs <- round((proc.time() - t_dharma1)["elapsed"], 1)
  }

  # ── Fit Model 3 (random-effects logit with trait × mention interactions) ──
  # Mirrors compute_regressions.R — load mention flags, build dynamic formula, fit glmer.
  t_m3 <- proc.time()
  m3 <- NULL
  m3_info <- NULL
  sim3 <- NULL
  flags_file <- file.path(DATA_DIR, config_key, "mention_flags.csv")
  if (file.exists(flags_file)) {
    flags <- tryCatch(fread(flags_file), error = function(e) NULL)
    if (!is.null(flags)) {
      df3 <- merge(df, flags, by = c("agent_id", "rep", "infection_level"), all.x = TRUE)
      flag_cols <- c("mentioned_ext", "mentioned_agr", "mentioned_con",
                     "mentioned_neu", "mentioned_ope",
                     "mentioned_infection", "mentioned_age")
      for (fc in flag_cols) {
        if (fc %in% names(df3)) df3[is.na(get(fc)), (fc) := 0L]
      }
      # Contrast check (≥5% and ≤95% mention rate) — include interactions only when sufficient
      interaction_map <- list(
        mentioned_ext = "extraverted", mentioned_agr = "agreeable",
        mentioned_con = "conscientious", mentioned_neu = "emot_stable",
        mentioned_ope = "open_to_exp", mentioned_infection = "infection_pct",
        mentioned_age = "age_years"
      )
      interaction_terms <- c()
      for (flag in names(interaction_map)) {
        rate <- mean(df3[[flag]], na.rm = TRUE)
        if (isTRUE(rate >= 0.05 && rate <= 0.95)) {
          interaction_terms <- c(interaction_terms,
                                 paste0(interaction_map[[flag]], ":", flag))
        }
      }
      base_terms <- c("infection_pct", "I(infection_pct^2)",
                      "male", "extraverted", "agreeable", "conscientious",
                      "emot_stable", "open_to_exp", "age_years")
      all_terms <- c(base_terms, flag_cols, interaction_terms)
      m3_formula <- as.formula(paste("stay_home ~", paste(all_terms, collapse = " + "),
                                      "+ (1 | agent_id)"))
      m3 <- tryCatch(
        glmer(m3_formula, family = binomial, data = df3,
              control = glmerControl(optimizer = "bobyqa",
                                      optCtrl = list(maxfun = 100000))),
        error = function(e) e
      )
      if (inherits(m3, "error")) {
        m3_info <- list(error = conditionMessage(m3))
        m3 <- NULL
      } else {
        sim3 <- tryCatch(
          DHARMa::simulateResiduals(fittedModel = m3, n = 250, plot = FALSE, seed = 42),
          error = function(e) NULL
        )
        m3_info <- tryCatch({
          if (is.null(sim3)) stop("simulateResiduals failed for M3")
          resids3 <- sim3$scaledResiduals
          probs3  <- seq(0.01, 0.99, by = 0.01)
          qvals3  <- as.numeric(quantile(resids3, probs = probs3, na.rm = TRUE))
          t_unif3 <- DHARMa::testUniformity(sim3, plot = FALSE)
          t_disp3 <- DHARMa::testDispersion(sim3, plot = FALSE)
          list(
            n_sim            = 250L,
            n_obs            = length(resids3),
            probs            = probs3,
            quantiles        = qvals3,
            ks_statistic     = as.numeric(t_unif3$statistic),
            ks_p_value       = as.numeric(t_unif3$p.value),
            dispersion_ratio = as.numeric(t_disp3$statistic),
            dispersion_p     = as.numeric(t_disp3$p.value)
          )
        }, error = function(e) list(error = e$message))
      }
    }
  }
  m3_secs <- round((proc.time() - t_m3)["elapsed"], 1)

  # ── Extra diagnostics: BLUPs (M2) + binned residuals (M1, M2) ──
  #
  # BLUPs: the 100 estimated random intercepts from Model 2.
  # Used for the "Random-Intercept Normality Q-Q" plot.
  blups_m2 <- tryCatch({
    re <- ranef(m2)$agent_id
    vals <- as.numeric(re[[1]])
    ids  <- rownames(re)
    list(
      agent_ids  = ids,
      intercepts = round(vals, 6),
      sd_estimated = round(as.data.frame(VarCorr(m2))$sdcor[1], 6)
    )
  }, error = function(e) NULL)

  # Binned residuals: for each infection level, average DHARMa scaled residual.
  # Under a correct model, expected mean = 0.5 at every bin.
  # Systematic departure = missing curvature/non-linearity vs infection.
  resids_by_inf_m2 <- tryCatch({
    if (!is.null(sim) && !is.null(sim$scaledResiduals)) {
      df_tmp <- data.table(r = sim$scaledResiduals, inf = df$infection_pct)
      df_tmp[, .(mean_resid = mean(r, na.rm = TRUE),
                 sd_resid   = sd(r,   na.rm = TRUE),
                 n          = .N), by = inf][order(inf)]
    } else NULL
  }, error = function(e) NULL)

  resids_by_inf_m1 <- tryCatch({
    if (exists("sim1") && !is.null(sim1) && !is.null(sim1$scaledResiduals)) {
      df_tmp <- data.table(r = sim1$scaledResiduals, inf = df$infection_pct)
      df_tmp[, .(mean_resid = mean(r, na.rm = TRUE),
                 sd_resid   = sd(r,   na.rm = TRUE),
                 n          = .N), by = inf][order(inf)]
    } else NULL
  }, error = function(e) NULL)

  # Calibration bins for Model 1 (FE logit): for each of 40 infection levels,
  # mean predicted P (averaged across all 100 agent dummies) vs observed rate.
  # Used for the Figure 24a "Calibration" view.
  calib_m1 <- tryCatch({
    if (!inherits(m1, "error")) {
      preds <- as.numeric(predict(m1, type = "response"))
      df_tmp <- data.table(p = preds, y = df$stay_home, inf = df$infection_pct)
      df_tmp[, .(predicted = mean(p, na.rm = TRUE),
                 observed  = mean(y, na.rm = TRUE),
                 n         = .N), by = inf][order(inf)]
    } else NULL
  }, error = function(e) NULL)

  # Binned residuals by age for Model 2 only (M1 absorbs age via agent dummies).
  # 10 age bins: 18-22, 23-27, ..., 63-67.
  resids_by_age_m2 <- tryCatch({
    if (!is.null(sim) && !is.null(sim$scaledResiduals)) {
      df_tmp <- data.table(r = sim$scaledResiduals, age = df$age_years)
      df_tmp[, age_bin := floor((age - 18) / 5)]
      df_tmp[, age_bin_label := paste0(18 + age_bin * 5, "-", 18 + age_bin * 5 + 4)]
      df_tmp[, .(age_min = min(age),
                 age_max = max(age),
                 age_mid = mean(age),
                 mean_resid = mean(r, na.rm = TRUE),
                 sd_resid   = sd(r,   na.rm = TRUE),
                 n          = .N), by = age_bin][order(age_bin)]
    } else NULL
  }, error = function(e) NULL)

  # BLUPs vs fixed-effect predictors (for Assumption 6 diagnostic).
  # For each predictor, compute association between BLUPs and that predictor:
  #   - Dummy predictors: mean BLUP(X=1) - mean BLUP(X=0)
  #   - Continuous (age): slope × range, so estimate = BLUP(oldest) - BLUP(youngest)
  # Both give a comparable log-odds-scale effect. A near-zero value means
  # the fixed-effect coefficient successfully absorbed the systematic variation
  # and the BLUPs are residual noise. A non-zero value hints at bias.
  blups_vs_preds <- tryCatch({
    if (!is.null(blups_m2) && length(blups_m2$intercepts) > 0) {
      agent_data <- unique(df[, .(agent_id, male, extraverted, agreeable,
                                   conscientious, emot_stable, open_to_exp, age_years)])
      blup_dt <- data.table(agent_id = as.character(blups_m2$agent_ids),
                            blup     = blups_m2$intercepts)
      agent_data[, agent_id := as.character(agent_id)]
      merged <- merge(blup_dt, agent_data, by = "agent_id", all.x = TRUE)

      dummy_assoc <- function(y, x) {
        y1 <- y[x == 1]; y0 <- y[x == 0]
        if (length(y1) < 2 || length(y0) < 2) return(list(estimate = NA, se = NA))
        list(
          estimate = as.numeric(mean(y1, na.rm = TRUE) - mean(y0, na.rm = TRUE)),
          se       = as.numeric(sqrt(var(y1, na.rm = TRUE) / length(y1) +
                                     var(y0, na.rm = TRUE) / length(y0)))
        )
      }
      cont_assoc <- function(y, x) {
        if (length(x) < 3 || var(x, na.rm = TRUE) == 0) return(list(estimate = NA, se = NA))
        fit <- tryCatch(lm(y ~ x), error = function(e) NULL)
        if (is.null(fit)) return(list(estimate = NA, se = NA))
        sl <- as.numeric(coef(fit)[2])
        sl_se <- as.numeric(summary(fit)$coefficients[2, 2])
        xr <- max(x, na.rm = TRUE) - min(x, na.rm = TRUE)
        list(estimate = sl * xr, se = sl_se * xr)
      }

      list(
        age          = c(cont_assoc(merged$blup, merged$age_years), list(type = "continuous")),
        male         = c(dummy_assoc(merged$blup, merged$male),         list(type = "dummy")),
        extraverted  = c(dummy_assoc(merged$blup, merged$extraverted),  list(type = "dummy")),
        agreeable    = c(dummy_assoc(merged$blup, merged$agreeable),    list(type = "dummy")),
        conscientious= c(dummy_assoc(merged$blup, merged$conscientious),list(type = "dummy")),
        emot_stable  = c(dummy_assoc(merged$blup, merged$emot_stable),  list(type = "dummy")),
        open_to_exp  = c(dummy_assoc(merged$blup, merged$open_to_exp),  list(type = "dummy"))
      )
    } else NULL
  }, error = function(e) NULL)

  # ── Model 3: extra diagnostics ──────────────────────────────
  blups_m3 <- NULL
  calib_m3 <- NULL
  resids_by_inf_m3 <- NULL
  resids_by_age_m3 <- NULL
  blups_vs_preds_m3 <- NULL
  if (!is.null(m3)) {
    blups_m3 <- tryCatch({
      re <- ranef(m3)$agent_id
      list(agent_ids = rownames(re),
           intercepts = round(as.numeric(re[[1]]), 6),
           sd_estimated = round(as.data.frame(VarCorr(m3))$sdcor[1], 6))
    }, error = function(e) NULL)

    # Calibration bins (mean predicted P vs observed rate, per infection level)
    calib_m3 <- tryCatch({
      preds <- as.numeric(predict(m3, type = "response"))
      df_tmp <- data.table(p = preds, y = df3$stay_home, inf = df3$infection_pct)
      df_tmp[, .(predicted = mean(p, na.rm = TRUE),
                 observed  = mean(y, na.rm = TRUE),
                 n         = .N), by = inf][order(inf)]
    }, error = function(e) NULL)

    # Residuals by infection (DHARMa scaled)
    resids_by_inf_m3 <- tryCatch({
      if (!is.null(sim3)) {
        df_tmp <- data.table(r = sim3$scaledResiduals, inf = df3$infection_pct)
        df_tmp[, .(mean_resid = mean(r, na.rm = TRUE),
                   sd_resid   = sd(r,   na.rm = TRUE),
                   n          = .N), by = inf][order(inf)]
      } else NULL
    }, error = function(e) NULL)

    # Residuals by age (DHARMa scaled, 5-year bins)
    resids_by_age_m3 <- tryCatch({
      if (!is.null(sim3)) {
        df_tmp <- data.table(r = sim3$scaledResiduals, age = df3$age_years)
        df_tmp[, age_bin := floor((age - 18) / 5)]
        df_tmp[, .(age_min = min(age),
                   age_max = max(age),
                   age_mid = mean(age),
                   mean_resid = mean(r, na.rm = TRUE),
                   sd_resid   = sd(r,   na.rm = TRUE),
                   n          = .N), by = age_bin][order(age_bin)]
      } else NULL
    }, error = function(e) NULL)

    # BLUPs vs predictors
    blups_vs_preds_m3 <- tryCatch({
      if (!is.null(blups_m3) && length(blups_m3$intercepts) > 0) {
        agent_data <- unique(df3[, .(agent_id, male, extraverted, agreeable,
                                      conscientious, emot_stable, open_to_exp, age_years)])
        blup_dt <- data.table(agent_id = as.character(blups_m3$agent_ids),
                              blup     = blups_m3$intercepts)
        agent_data[, agent_id := as.character(agent_id)]
        merged <- merge(blup_dt, agent_data, by = "agent_id", all.x = TRUE)
        dummy_assoc <- function(y, x) {
          y1 <- y[x == 1]; y0 <- y[x == 0]
          if (length(y1) < 2 || length(y0) < 2) return(list(estimate = NA, se = NA))
          list(estimate = as.numeric(mean(y1, na.rm = TRUE) - mean(y0, na.rm = TRUE)),
               se       = as.numeric(sqrt(var(y1, na.rm = TRUE) / length(y1) +
                                          var(y0, na.rm = TRUE) / length(y0))))
        }
        cont_assoc <- function(y, x) {
          if (length(x) < 3 || var(x, na.rm = TRUE) == 0) return(list(estimate = NA, se = NA))
          fit <- tryCatch(lm(y ~ x), error = function(e) NULL)
          if (is.null(fit)) return(list(estimate = NA, se = NA))
          sl <- as.numeric(coef(fit)[2])
          sl_se <- as.numeric(summary(fit)$coefficients[2, 2])
          xr <- max(x, na.rm = TRUE) - min(x, na.rm = TRUE)
          list(estimate = sl * xr, se = sl_se * xr)
        }
        list(
          age          = c(cont_assoc(merged$blup, merged$age_years), list(type = "continuous")),
          male         = c(dummy_assoc(merged$blup, merged$male),         list(type = "dummy")),
          extraverted  = c(dummy_assoc(merged$blup, merged$extraverted),  list(type = "dummy")),
          agreeable    = c(dummy_assoc(merged$blup, merged$agreeable),    list(type = "dummy")),
          conscientious= c(dummy_assoc(merged$blup, merged$conscientious),list(type = "dummy")),
          emot_stable  = c(dummy_assoc(merged$blup, merged$emot_stable),  list(type = "dummy")),
          open_to_exp  = c(dummy_assoc(merged$blup, merged$open_to_exp),  list(type = "dummy"))
        )
      } else NULL
    }, error = function(e) NULL)
  }

  total_secs <- round((proc.time() - t_overall)["elapsed"], 1)

  # ── Patch JSON in-place ────────────────────────────────────
  existing$model2$dharma <- dharma_info
  existing$model2$blups  <- blups_m2
  if (!is.null(resids_by_inf_m2)) {
    existing$model2$resids_by_infection <- as.list(as.data.frame(resids_by_inf_m2))
  }
  if (!is.null(resids_by_age_m2)) {
    existing$model2$resids_by_age <- as.list(as.data.frame(resids_by_age_m2))
  }
  if (!is.null(blups_vs_preds)) {
    existing$model2$blups_vs_predictors <- blups_vs_preds
  }
  if (!is.null(existing$model1) && !is.null(dharma1_info)) {
    existing$model1$dharma <- dharma1_info
    if (!is.null(resids_by_inf_m1)) {
      existing$model1$resids_by_infection <- as.list(as.data.frame(resids_by_inf_m1))
    }
    if (!is.null(calib_m1)) {
      existing$model1$calibration_bins <- as.list(as.data.frame(calib_m1))
    }
  }
  # Model 3 patches (overwrite existing model3 fields so we don't lose coefficients)
  if (is.null(existing$model3)) existing$model3 <- list()
  if (!is.null(m3_info)) existing$model3$dharma <- m3_info
  if (!is.null(blups_m3)) existing$model3$blups <- blups_m3
  if (!is.null(calib_m3)) existing$model3$calibration_bins <- as.list(as.data.frame(calib_m3))
  if (!is.null(resids_by_inf_m3)) existing$model3$resids_by_infection <- as.list(as.data.frame(resids_by_inf_m3))
  if (!is.null(resids_by_age_m3)) existing$model3$resids_by_age <- as.list(as.data.frame(resids_by_age_m3))
  if (!is.null(blups_vs_preds_m3)) existing$model3$blups_vs_predictors <- blups_vs_preds_m3
  write_json(existing, json_path, auto_unbox = TRUE, digits = 8, pretty = TRUE)

  m2_str <- if (!is.null(dharma_info$ks_p_value))
              sprintf("M2 KS=%.3f disp=%.3f", dharma_info$ks_p_value, dharma_info$dispersion_ratio)
            else paste("M2 err:", dharma_info$error)
  m1_str <- if (!is.null(dharma1_info) && !is.null(dharma1_info$ks_p_value))
              sprintf("M1 KS=%.3f disp=%.3f", dharma1_info$ks_p_value, dharma1_info$dispersion_ratio)
            else "M1 skip"
  timing_str <- sprintf("[glmer %.1fs | M2-DH %.1fs | glm %.1fs | M1-DH %.1fs | total %.1fs]",
                        glmer_secs, dharma_secs, glm_secs, dharma1_secs %||% 0, total_secs)
  list(key = config_key, status = paste(m2_str, "|", m1_str), timing = timing_str,
       glmer_s = glmer_secs, dharma_s = dharma_secs,
       glm_s = glm_secs, dharma1_s = dharma1_secs, total_s = total_secs)
}

# ── Run ───────────────────────────────────────────────────────
cat("Starting DHARMa patching...\n")
t0 <- proc.time()

if (n_cores > 1) {
  results <- mclapply(json_files, process_config, mc.cores = n_cores)
} else {
  results <- lapply(json_files, function(f) {
    r <- process_config(f)
    timing <- if (!is.null(r$timing)) r$timing else ""
    cat(sprintf("  %-50s %s  %s\n", r$key, r$status, timing))
    r
  })
}

wall_elapsed <- (proc.time() - t0)["elapsed"]
cat(sprintf("\nWall time: %.1f seconds\n", wall_elapsed))

if (n_cores > 1) {
  for (r in results) {
    timing <- if (!is.null(r$timing)) r$timing else ""
    cat(sprintf("  %-50s %s  %s\n", r$key, r$status, timing))
  }
  # Summary stats
  total_secs_all <- sapply(results, function(r) r$total_s %||% NA)
  valid <- total_secs_all[!is.na(total_secs_all)]
  if (length(valid) > 0) {
    cat(sprintf("\nPer-config: mean %.1fs, min %.1fs, max %.1fs\n",
                mean(valid), min(valid), max(valid)))
    cat(sprintf("Estimated full 21-config run at %d cores: ~%.0f seconds (~%.1f min)\n",
                n_cores, max(valid) * ceiling(21 / n_cores), max(valid) * ceiling(21 / n_cores) / 60))
  }
}

if (n_cores > 1) {
  for (r in results) cat(sprintf("  %-55s %s\n", r$key, r$status))
}
