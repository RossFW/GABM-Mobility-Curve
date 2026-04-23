#!/usr/bin/env Rscript
# ============================================================
# GABM Mobility Curve — Model 3 Strict Re-fit
#
# Re-fits ONLY Model 3 (random-effects logit with trait × mention
# interactions) using a STRICTER contrast threshold: a mention flag
# is included (as both main effect AND interaction) only if its rate
# is in [10%, 90%]. The old compute_regressions.R used 5-95% and
# kept mention main effects unconditionally, which produced huge SEs
# for near-constant mention flags (e.g. mentioned_con ~100%).
#
# This script:
#   1. Loads each config's data
#   2. Computes mention rates per dimension
#   3. Builds a formula that EXCLUDES both main effect and interaction
#      for dimensions outside [10%, 90%]
#   4. Fits glmer, runs DHARMa
#   5. Patches model3 fields in the JSON (coefficients, dharma, blups,
#      calibration_bins, resids_by_infection, resids_by_age,
#      blups_vs_predictors, contrast_flags)
#   6. Leaves Model 1 and Model 2 untouched
#
# Usage:
#   Rscript analysis/refit_model3_strict.R --only <config_key>  # one config
#   Rscript analysis/refit_model3_strict.R --cores 4            # all 21
#   Rscript analysis/refit_model3_strict.R --threshold 0.10     # override (default 0.10)
# ============================================================

library(data.table)
library(lme4)
library(jsonlite)
library(DHARMa)
library(parallel)

# ── Args ──────────────────────────────────────────────────────
args_raw <- commandArgs(trailingOnly = TRUE)
n_cores <- 1L
ix <- which(args_raw == "--cores")
if (length(ix) > 0 && length(args_raw) > ix) n_cores <- max(1L, as.integer(args_raw[ix + 1]))

only_key <- NULL
ix <- which(args_raw == "--only")
if (length(ix) > 0 && length(args_raw) > ix) only_key <- args_raw[ix + 1]

threshold <- 0.10
ix <- which(args_raw == "--threshold")
if (length(ix) > 0 && length(args_raw) > ix) threshold <- as.numeric(args_raw[ix + 1])

cat(sprintf("Threshold: mention rate in [%.2f, %.2f] to include main effect + interaction\n",
            threshold, 1 - threshold))
cat(sprintf("Cores: %d\n", n_cores))
if (!is.null(only_key)) cat(sprintf("Only: %s\n", only_key))

# ── Paths ─────────────────────────────────────────────────────
script_args <- commandArgs(trailingOnly = FALSE)
script_path <- sub("--file=", "", script_args[grep("--file=", script_args)])
BASE_DIR <- if (length(script_path) == 0) { normalizePath(".") } else { normalizePath(file.path(dirname(script_path), "..")) }
DATA_DIR    <- file.path(BASE_DIR, "viz", "data", "real")
OUT_DIR     <- file.path(DATA_DIR, "regressions")
AGENTS_FILE <- file.path(BASE_DIR, "agents", "agents.json")

agents_raw <- fromJSON(AGENTS_FILE)
agents <- data.table(agent_id = agents_raw$agent_id, gender = agents_raw$gender)

json_files <- list.files(OUT_DIR, pattern = "\\.json$", full.names = TRUE)
if (!is.null(only_key)) {
  json_files <- json_files[grepl(only_key, basename(json_files), fixed = TRUE)]
}
cat(sprintf("Processing %d file(s)\n\n", length(json_files)))

# ── Helper: significance stars ───────────────────────────────
sig_stars <- function(p) {
  ifelse(p < 0.001, "***",
  ifelse(p < 0.01,  "**",
  ifelse(p < 0.05,  "*",
  ifelse(p < 0.1,   ".", ""))))
}
extract_coefs <- function(coef_table) {
  result <- list()
  nms <- rownames(coef_table)
  for (i in seq_along(nms)) {
    nm <- nms[i]
    est <- coef_table[i, "Estimate"]; se <- coef_table[i, "Std. Error"]
    z <- coef_table[i, "z value"]; p <- coef_table[i, "Pr(>|z|)"]
    key <- tolower(gsub("[^a-zA-Z0-9]", "_", nm))
    key <- gsub("_+", "_", key); key <- gsub("^_|_$", "", key)
    if (grepl("intercept", key, ignore.case = TRUE)) key <- "intercept"
    if (key == "i_infection_pct_2_" || key == "i_infection_pct_2") key <- "infection_pct_sq"
    result[[key]] <- list(
      estimate = round(est, 6), se = round(se, 6),
      z = round(z, 4), p = p,
      or = exp(est), or_ci_lo = exp(est - 1.96 * se), or_ci_hi = exp(est + 1.96 * se),
      sig = sig_stars(p)
    )
  }
  result
}

# ── Per-config worker ─────────────────────────────────────────
process_one <- function(json_path) {
  config_key <- sub("\\.json$", "", basename(json_path))
  micro_file <- file.path(DATA_DIR, config_key, "probe_results_micro.csv")
  flags_file <- file.path(DATA_DIR, config_key, "mention_flags.csv")
  if (!file.exists(micro_file)) return(list(key = config_key, status = "SKIP no micro"))
  if (!file.exists(flags_file)) return(list(key = config_key, status = "SKIP no flags"))

  existing <- tryCatch(fromJSON(json_path, simplifyVector = FALSE), error = function(e) NULL)
  if (is.null(existing)) return(list(key = config_key, status = "SKIP unreadable"))

  t0 <- proc.time()

  # Load + prep data
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

  flags <- fread(flags_file)
  df3 <- merge(df, flags, by = c("agent_id", "rep", "infection_level"), all.x = TRUE)
  flag_cols <- c("mentioned_ext", "mentioned_agr", "mentioned_con",
                 "mentioned_neu", "mentioned_ope",
                 "mentioned_infection", "mentioned_age")
  for (fc in flag_cols) if (fc %in% names(df3)) df3[is.na(get(fc)), (fc) := 0L]

  # ── STRICT contrast check (new logic) ────────────────────
  # For each flag, check if rate is in [threshold, 1-threshold].
  # If NOT, exclude BOTH the main effect AND its interaction.
  interaction_map <- list(
    mentioned_ext         = "extraverted",
    mentioned_agr         = "agreeable",
    mentioned_con         = "conscientious",
    mentioned_neu         = "emot_stable",
    mentioned_ope         = "open_to_exp",
    mentioned_infection   = "infection_pct",
    mentioned_age         = "age_years"
  )
  contrast_flags <- list()
  included_mention_main <- c()
  interaction_terms <- c()
  for (flag in flag_cols) {
    rate <- mean(df3[[flag]], na.rm = TRUE)
    dim_name <- sub("mentioned_", "", flag)
    sufficient <- isTRUE(rate >= threshold && rate <= (1 - threshold))
    contrast_flags[[dim_name]] <- list(
      mention_rate = round(rate, 4),
      sufficient = sufficient,
      threshold = threshold
    )
    if (sufficient) {
      included_mention_main <- c(included_mention_main, flag)
      interaction_terms <- c(interaction_terms,
                             paste0(interaction_map[[flag]], ":", flag))
    }
  }

  base_terms <- c("infection_pct", "I(infection_pct^2)",
                  "male", "extraverted", "agreeable", "conscientious",
                  "emot_stable", "open_to_exp", "age_years")
  all_terms <- c(base_terms, included_mention_main, interaction_terms)
  formula_str <- paste("stay_home ~", paste(all_terms, collapse = " + "),
                        "+ (1 | agent_id)")
  m3_formula <- as.formula(formula_str)

  cat(sprintf("[%s] %d mention + %d interaction terms (excluded: %s)\n",
              config_key, length(included_mention_main), length(interaction_terms),
              paste(setdiff(flag_cols, included_mention_main), collapse = ", ")))

  # Fit glmer
  t_fit <- proc.time()
  m3 <- tryCatch(
    glmer(m3_formula, family = binomial, data = df3,
          control = glmerControl(optimizer = "bobyqa",
                                  optCtrl = list(maxfun = 100000))),
    error = function(e) e
  )
  fit_secs <- round((proc.time() - t_fit)["elapsed"], 1)

  if (inherits(m3, "error")) {
    return(list(key = config_key, status = paste("ERROR:", conditionMessage(m3)),
                fit_s = fit_secs, total_s = NA))
  }

  coef_table <- summary(m3)$coefficients
  m3_coefs <- extract_coefs(coef_table)
  if ("age_years" %in% names(m3_coefs)) {
    m3_coefs$age <- m3_coefs$age_years
    m3_coefs$age_years <- NULL
  }
  re_var <- as.data.frame(VarCorr(m3))$vcov[1]
  conv_warn <- NULL
  if (length(m3@optinfo$conv$lme4$messages) > 0) {
    conv_warn <- paste(m3@optinfo$conv$lme4$messages, collapse = "; ")
  }

  # DHARMa
  t_dh <- proc.time()
  sim3 <- tryCatch(
    DHARMa::simulateResiduals(fittedModel = m3, n = 250, plot = FALSE, seed = 42),
    error = function(e) NULL
  )
  dharma_info <- tryCatch({
    if (is.null(sim3)) stop("simulateResiduals failed")
    resids <- sim3$scaledResiduals
    probs <- seq(0.01, 0.99, by = 0.01)
    qvals <- as.numeric(quantile(resids, probs = probs, na.rm = TRUE))
    t_unif <- DHARMa::testUniformity(sim3, plot = FALSE)
    t_disp <- DHARMa::testDispersion(sim3, plot = FALSE)
    list(n_sim = 250L, n_obs = length(resids), probs = probs, quantiles = qvals,
         ks_statistic = as.numeric(t_unif$statistic),
         ks_p_value = as.numeric(t_unif$p.value),
         dispersion_ratio = as.numeric(t_disp$statistic),
         dispersion_p = as.numeric(t_disp$p.value))
  }, error = function(e) list(error = e$message))
  dh_secs <- round((proc.time() - t_dh)["elapsed"], 1)

  # BLUPs
  blups_m3 <- tryCatch({
    re <- ranef(m3)$agent_id
    list(agent_ids = rownames(re), intercepts = round(as.numeric(re[[1]]), 6),
         sd_estimated = round(as.data.frame(VarCorr(m3))$sdcor[1], 6))
  }, error = function(e) NULL)

  # Calibration bins
  calib_m3 <- tryCatch({
    preds <- as.numeric(predict(m3, type = "response"))
    df_tmp <- data.table(p = preds, y = df3$stay_home, inf = df3$infection_pct)
    df_tmp[, .(predicted = mean(p, na.rm = TRUE),
               observed  = mean(y, na.rm = TRUE),
               n         = .N), by = inf][order(inf)]
  }, error = function(e) NULL)

  # Calibration by age
  calib_by_age_m3 <- tryCatch({
    preds <- as.numeric(predict(m3, type = "response"))
    df_tmp <- data.table(p = preds, y = df3$stay_home, age = df3$age_years)
    df_tmp[, age_bin := floor((age - 18) / 5)]
    df_tmp[, .(age_min = min(age), age_max = max(age), age_mid = mean(age),
               predicted = mean(p, na.rm = TRUE), observed = mean(y, na.rm = TRUE),
               n = .N), by = age_bin][order(age_bin)]
  }, error = function(e) NULL)

  # Residuals by infection/age
  resids_by_inf_m3 <- tryCatch({
    if (!is.null(sim3)) {
      df_tmp <- data.table(r = sim3$scaledResiduals, inf = df3$infection_pct)
      df_tmp[, .(mean_resid = mean(r, na.rm = TRUE),
                 sd_resid   = sd(r,   na.rm = TRUE),
                 n          = .N), by = inf][order(inf)]
    } else NULL
  }, error = function(e) NULL)
  resids_by_age_m3 <- tryCatch({
    if (!is.null(sim3)) {
      df_tmp <- data.table(r = sim3$scaledResiduals, age = df3$age_years)
      df_tmp[, age_bin := floor((age - 18) / 5)]
      df_tmp[, .(age_min = min(age), age_max = max(age), age_mid = mean(age),
                 mean_resid = mean(r, na.rm = TRUE), sd_resid = sd(r, na.rm = TRUE),
                 n = .N), by = age_bin][order(age_bin)]
    } else NULL
  }, error = function(e) NULL)

  # BLUPs vs predictors
  blups_vs_preds_m3 <- tryCatch({
    if (!is.null(blups_m3)) {
      agent_data <- unique(df3[, .(agent_id, male, extraverted, agreeable,
                                    conscientious, emot_stable, open_to_exp, age_years)])
      blup_dt <- data.table(agent_id = as.character(blups_m3$agent_ids),
                            blup = blups_m3$intercepts)
      agent_data[, agent_id := as.character(agent_id)]
      merged <- merge(blup_dt, agent_data, by = "agent_id", all.x = TRUE)
      dummy_assoc <- function(y, x) {
        y1 <- y[x == 1]; y0 <- y[x == 0]
        if (length(y1) < 2 || length(y0) < 2) return(list(estimate = NA, se = NA))
        list(estimate = as.numeric(mean(y1, na.rm = TRUE) - mean(y0, na.rm = TRUE)),
             se = as.numeric(sqrt(var(y1, na.rm = TRUE)/length(y1) + var(y0, na.rm = TRUE)/length(y0))))
      }
      cont_assoc <- function(y, x) {
        if (length(x) < 3 || var(x, na.rm = TRUE) == 0) return(list(estimate = NA, se = NA))
        fit <- tryCatch(lm(y ~ x), error = function(e) NULL)
        if (is.null(fit)) return(list(estimate = NA, se = NA))
        sl <- as.numeric(coef(fit)[2]); sl_se <- as.numeric(summary(fit)$coefficients[2,2])
        xr <- max(x, na.rm = TRUE) - min(x, na.rm = TRUE)
        list(estimate = sl * xr, se = sl_se * xr)
      }
      list(
        age          = c(cont_assoc(merged$blup, merged$age_years), list(type = "continuous")),
        male         = c(dummy_assoc(merged$blup, merged$male),        list(type = "dummy")),
        extraverted  = c(dummy_assoc(merged$blup, merged$extraverted), list(type = "dummy")),
        agreeable    = c(dummy_assoc(merged$blup, merged$agreeable),   list(type = "dummy")),
        conscientious= c(dummy_assoc(merged$blup, merged$conscientious),list(type = "dummy")),
        emot_stable  = c(dummy_assoc(merged$blup, merged$emot_stable), list(type = "dummy")),
        open_to_exp  = c(dummy_assoc(merged$blup, merged$open_to_exp), list(type = "dummy"))
      )
    } else NULL
  }, error = function(e) NULL)

  total_secs <- round((proc.time() - t0)["elapsed"], 1)

  # ── Patch JSON ───────────────────────────────────────────────
  existing$model3 <- list(
    type          = "mention_interaction_logit_strict",
    formula       = formula_str,
    coefficients  = m3_coefs,
    contrast_flags = contrast_flags,
    n_interactions = length(interaction_terms),
    n_mention_main = length(included_mention_main),
    threshold      = threshold,
    fit = list(
      aic = round(AIC(m3), 2), bic = round(BIC(m3), 2),
      n = nrow(df3), n_groups = length(unique(df3$agent_id)),
      re_variance = round(re_var, 6)
    ),
    warning = conv_warn,
    dharma = dharma_info,
    blups  = blups_m3,
    calibration_bins = if (!is.null(calib_m3)) as.list(as.data.frame(calib_m3)) else NULL,
    calibration_by_age = if (!is.null(calib_by_age_m3)) as.list(as.data.frame(calib_by_age_m3)) else NULL,
    resids_by_infection = if (!is.null(resids_by_inf_m3)) as.list(as.data.frame(resids_by_inf_m3)) else NULL,
    resids_by_age = if (!is.null(resids_by_age_m3)) as.list(as.data.frame(resids_by_age_m3)) else NULL,
    blups_vs_predictors = blups_vs_preds_m3
  )
  write_json(existing, json_path, auto_unbox = TRUE, digits = 8, pretty = TRUE)

  disp <- if (!is.null(dharma_info$dispersion_ratio)) sprintf("disp=%.2f", dharma_info$dispersion_ratio) else "disp=?"
  max_se <- if (length(m3_coefs) > 0) {
    max(sapply(m3_coefs, function(c) if (is.list(c)) c$se else NA), na.rm = TRUE)
  } else NA
  list(key = config_key,
       status = sprintf("OK %s · max SE=%.2f · fit %.1fs · dharma %.1fs · total %.1fs",
                       disp, max_se, fit_secs, dh_secs, total_secs),
       fit_s = fit_secs, dharma_s = dh_secs, total_s = total_secs,
       max_se = max_se)
}

t_run <- proc.time()
if (n_cores > 1) {
  results <- mclapply(json_files, process_one, mc.cores = n_cores)
} else {
  results <- lapply(json_files, function(f) {
    r <- process_one(f)
    cat(sprintf("  %-55s %s\n", r$key, r$status))
    r
  })
}
wall <- (proc.time() - t_run)["elapsed"]
cat(sprintf("\nWall time: %.1fs\n", wall))
if (n_cores > 1) {
  for (r in results) cat(sprintf("  %-55s %s\n", r$key, r$status))
}
