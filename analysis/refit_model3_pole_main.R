#!/usr/bin/env Rscript
# ============================================================
# GABM Mobility Curve — Model 3 POLE-LEVEL, MAIN-EFFECTS ONLY
#
# Per-pole mention flags (10 poles + 2 context) entered as main
# effects on top of trait dummies. NO trait×mention interactions.
#
# Rationale: interaction terms produce within-group collinearity
# because pole keywords mostly appear inside the matching trait
# group. Without interactions the model is identified and each
# mention coefficient answers: "conditional on the agent's actual
# trait, does their reasoning invoking this pole predict behavior?"
#
# Inclusion rule: pole mention rate in [threshold, 1-threshold].
# Default threshold = 0.15.
#
# Usage:
#   Rscript analysis/refit_model3_pole_main.R --cores 4
#   Rscript analysis/refit_model3_pole_main.R --only <config_key>
# ============================================================

library(data.table)
library(lme4)
library(jsonlite)
library(DHARMa)
library(parallel)

args_raw <- commandArgs(trailingOnly = TRUE)
n_cores <- 1L
ix <- which(args_raw == "--cores"); if (length(ix) > 0 && length(args_raw) > ix) n_cores <- max(1L, as.integer(args_raw[ix + 1]))
only_key <- NULL
ix <- which(args_raw == "--only"); if (length(ix) > 0 && length(args_raw) > ix) only_key <- args_raw[ix + 1]
threshold <- 0.15
ix <- which(args_raw == "--threshold"); if (length(ix) > 0 && length(args_raw) > ix) threshold <- as.numeric(args_raw[ix + 1])
optimizer_choice <- "bobyqa"
ix <- which(args_raw == "--optimizer"); if (length(ix) > 0 && length(args_raw) > ix) optimizer_choice <- args_raw[ix + 1]
dry_run <- any(args_raw == "--dry-run")

cat(sprintf("Threshold: pole mention rate in [%.2f, %.2f]\n", threshold, 1 - threshold))
cat(sprintf("Cores: %d\n", n_cores))
cat(sprintf("Optimizer: %s\n", optimizer_choice))
if (dry_run) cat("DRY RUN: won't write JSON\n")
if (!is.null(only_key)) cat(sprintf("Only: %s\n", only_key))

script_args <- commandArgs(trailingOnly = FALSE)
script_path <- sub("--file=", "", script_args[grep("--file=", script_args)])
BASE_DIR <- if (length(script_path) == 0) { normalizePath(".") } else { normalizePath(file.path(dirname(script_path), "..")) }
DATA_DIR <- file.path(BASE_DIR, "viz", "data", "real")
OUT_DIR  <- file.path(DATA_DIR, "regressions")
AGENTS_FILE <- file.path(BASE_DIR, "agents", "agents.json")
TRAIT_MENTIONS_FILE <- file.path(DATA_DIR, "trait_mentions.json")

agents_raw <- fromJSON(AGENTS_FILE)
agents <- data.table(agent_id = agents_raw$agent_id, gender = agents_raw$gender)

# Load within-group rates (Fig 32 values) — filter source of truth
trait_mentions <- fromJSON(TRAIT_MENTIONS_FILE, simplifyVector = FALSE)
fig32_pole_rates <- trait_mentions$pole_rates
fig32_context_rates <- trait_mentions$mention_rates  # overall rates for infection/age

json_files <- list.files(OUT_DIR, pattern = "\\.json$", full.names = TRUE)
if (!is.null(only_key)) json_files <- json_files[grepl(only_key, basename(json_files), fixed = TRUE)]
cat(sprintf("Processing %d file(s)\n\n", length(json_files)))

sig_stars <- function(p) ifelse(p < 0.001, "***", ifelse(p < 0.01, "**", ifelse(p < 0.05, "*", ifelse(p < 0.1, ".", ""))))
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
    result[[key]] <- list(estimate = round(est, 6), se = round(se, 6),
                          z = round(z, 4), p = p, or = exp(est),
                          or_ci_lo = exp(est - 1.96 * se), or_ci_hi = exp(est + 1.96 * se),
                          sig = sig_stars(p))
  }
  result
}

POLE_NAMES <- c("extroverted", "introverted", "agreeable", "antagonistic",
                "conscientious", "unconscientious", "neurotic", "emot_stable",
                "open", "closed")
# For each pole: which agent-trait column in Fig 32 (trait_mentions.json
# pole_rates) gates it, and which Big Five dimension it belongs to.
# Rule: exclude `mentioned_<pole>` from Model 3 iff the within-group rate
# for agents assigned that pole is outside [threshold, 1-threshold].
POLE_TO_FIGKEY <- list(
  extroverted      = "extraversion_positive",
  introverted      = "extraversion_negative",
  agreeable        = "agreeableness_positive",
  antagonistic     = "agreeableness_negative",
  conscientious    = "conscientiousness_positive",
  unconscientious  = "conscientiousness_negative",
  neurotic         = "neuroticism_positive",
  emot_stable      = "neuroticism_negative",
  open             = "openness_positive",
  closed           = "openness_negative"
)
CONTEXT_FLAGS <- c("infection", "age")
TRAIT_MENTIONS_FILE <- NULL  # resolved below after BASE_DIR

process_one <- function(json_path) {
  config_key <- sub("\\.json$", "", basename(json_path))
  micro_file <- file.path(DATA_DIR, config_key, "probe_results_micro.csv")
  flags_file <- file.path(DATA_DIR, config_key, "mention_flags_pole.csv")
  if (!file.exists(micro_file)) return(list(key = config_key, status = "SKIP no micro"))
  if (!file.exists(flags_file)) return(list(key = config_key, status = "SKIP no pole flags"))
  existing <- tryCatch(fromJSON(json_path, simplifyVector = FALSE), error = function(e) NULL)
  if (is.null(existing)) return(list(key = config_key, status = "SKIP unreadable"))

  t0 <- proc.time()
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
  all_mention_cols <- c(paste0("mentioned_", POLE_NAMES), "mentioned_infection", "mentioned_age")
  for (fc in all_mention_cols) if (fc %in% names(df3)) df3[is.na(get(fc)), (fc) := 0L]

  pole_flags <- list()
  context_flags_info <- list()
  included_main <- c()
  # Filter rule (per user spec): exclude mentioned_<pole> iff the Fig-32
  # within-group rate for agents assigned that pole is outside [threshold, 1-threshold].
  # Rates come from trait_mentions.json (identical to what the dashboard displays).
  config_pole_rates <- fig32_pole_rates[[config_key]]
  for (pole in POLE_NAMES) {
    fc <- paste0("mentioned_", pole)
    fig_key <- POLE_TO_FIGKEY[[pole]]
    wg_rate <- NA_real_
    if (!is.null(config_pole_rates) && !is.null(config_pole_rates[[fig_key]])) {
      wg_rate <- as.numeric(config_pole_rates[[fig_key]])
    }
    sufficient <- !is.na(wg_rate) && wg_rate >= threshold && wg_rate <= (1 - threshold)
    pole_flags[[pole]] <- list(within_group_rate = round(wg_rate, 4),
                                fig32_key = fig_key,
                                sufficient = sufficient)
    if (sufficient) included_main <- c(included_main, fc)
  }
  config_ctx_rates <- fig32_context_rates[[config_key]]
  for (ctx in CONTEXT_FLAGS) {
    fc <- paste0("mentioned_", ctx)
    rate <- NA_real_
    if (!is.null(config_ctx_rates) && !is.null(config_ctx_rates[[ctx]])) {
      rate <- as.numeric(config_ctx_rates[[ctx]])
    }
    sufficient <- !is.na(rate) && rate >= threshold && rate <= (1 - threshold)
    context_flags_info[[ctx]] <- list(mention_rate = round(rate, 4), sufficient = sufficient)
    if (sufficient) included_main <- c(included_main, fc)
  }

  base_terms <- c("infection_pct", "I(infection_pct^2)",
                  "male", "extraverted", "agreeable", "conscientious",
                  "emot_stable", "open_to_exp", "age_years")
  all_terms <- c(base_terms, included_main)
  formula_str <- paste("stay_home ~", paste(all_terms, collapse = " + "), "+ (1 | agent_id)")
  m3_formula <- as.formula(formula_str)

  excluded <- setdiff(paste0("mentioned_", c(POLE_NAMES, CONTEXT_FLAGS)), included_main)
  cat(sprintf("[%s] %d mention main effects included  (excluded: %s)\n",
              config_key, length(included_main),
              if (length(excluded) > 0) paste(excluded, collapse = ", ") else "none"))

  t_fit <- proc.time()
  ctrl <- switch(optimizer_choice,
    "bobyqa"    = glmerControl(optimizer = "bobyqa",    optCtrl = list(maxfun = 100000)),
    "nloptwrap" = glmerControl(optimizer = "nloptwrap", optCtrl = list(maxeval = 100000)),
    "Nelder_Mead" = glmerControl(optimizer = "Nelder_Mead", optCtrl = list(maxfun = 100000)),
    glmerControl(optimizer = "bobyqa", optCtrl = list(maxfun = 100000))
  )
  m3 <- tryCatch(
    glmer(m3_formula, family = binomial, data = df3, control = ctrl),
    error = function(e) e
  )
  fit_secs <- round((proc.time() - t_fit)["elapsed"], 1)
  if (inherits(m3, "error")) {
    return(list(key = config_key, status = paste("ERROR:", conditionMessage(m3)), fit_s = fit_secs))
  }

  coef_table <- summary(m3)$coefficients
  m3_coefs <- extract_coefs(coef_table)
  if ("age_years" %in% names(m3_coefs)) { m3_coefs$age <- m3_coefs$age_years; m3_coefs$age_years <- NULL }
  re_var <- as.data.frame(VarCorr(m3))$vcov[1]
  conv_warn <- NULL
  if (length(m3@optinfo$conv$lme4$messages) > 0) conv_warn <- paste(m3@optinfo$conv$lme4$messages, collapse = "; ")

  t_dh <- proc.time()
  sim3 <- tryCatch(DHARMa::simulateResiduals(fittedModel = m3, n = 250, plot = FALSE, seed = 42),
                    error = function(e) NULL)
  dharma_info <- tryCatch({
    if (is.null(sim3)) stop("simulateResiduals failed")
    resids <- sim3$scaledResiduals
    probs <- seq(0.01, 0.99, by = 0.01)
    qvals <- as.numeric(quantile(resids, probs = probs, na.rm = TRUE))
    t_unif <- DHARMa::testUniformity(sim3, plot = FALSE)
    t_disp <- DHARMa::testDispersion(sim3, plot = FALSE)
    list(n_sim = 250L, n_obs = length(resids), probs = probs, quantiles = qvals,
         ks_statistic = as.numeric(t_unif$statistic), ks_p_value = as.numeric(t_unif$p.value),
         dispersion_ratio = as.numeric(t_disp$statistic), dispersion_p = as.numeric(t_disp$p.value))
  }, error = function(e) list(error = e$message))
  dh_secs <- round((proc.time() - t_dh)["elapsed"], 1)

  blups_m3 <- tryCatch({
    re <- ranef(m3)$agent_id
    list(agent_ids = rownames(re), intercepts = round(as.numeric(re[[1]]), 6),
         sd_estimated = round(as.data.frame(VarCorr(m3))$sdcor[1], 6))
  }, error = function(e) NULL)

  calib_m3 <- tryCatch({
    preds <- as.numeric(predict(m3, type = "response"))
    df_tmp <- data.table(p = preds, y = df3$stay_home, inf = df3$infection_pct)
    df_tmp[, .(predicted = mean(p, na.rm = TRUE), observed = mean(y, na.rm = TRUE),
               n = .N), by = inf][order(inf)]
  }, error = function(e) NULL)
  calib_by_age_m3 <- tryCatch({
    preds <- as.numeric(predict(m3, type = "response"))
    df_tmp <- data.table(p = preds, y = df3$stay_home, age = df3$age_years)
    df_tmp[, age_bin := floor((age - 18) / 5)]
    df_tmp[, .(age_min = min(age), age_max = max(age), age_mid = mean(age),
               predicted = mean(p, na.rm = TRUE), observed = mean(y, na.rm = TRUE),
               n = .N), by = age_bin][order(age_bin)]
  }, error = function(e) NULL)
  resids_by_inf <- tryCatch({
    if (!is.null(sim3)) {
      df_tmp <- data.table(r = sim3$scaledResiduals, inf = df3$infection_pct)
      df_tmp[, .(mean_resid = mean(r, na.rm = TRUE), sd_resid = sd(r, na.rm = TRUE),
                 n = .N), by = inf][order(inf)]
    } else NULL
  }, error = function(e) NULL)
  resids_by_age <- tryCatch({
    if (!is.null(sim3)) {
      df_tmp <- data.table(r = sim3$scaledResiduals, age = df3$age_years)
      df_tmp[, age_bin := floor((age - 18) / 5)]
      df_tmp[, .(age_min = min(age), age_max = max(age), age_mid = mean(age),
                 mean_resid = mean(r, na.rm = TRUE), sd_resid = sd(r, na.rm = TRUE),
                 n = .N), by = age_bin][order(age_bin)]
    } else NULL
  }, error = function(e) NULL)

  blups_vs_preds <- tryCatch({
    if (!is.null(blups_m3)) {
      agent_data <- unique(df3[, .(agent_id, male, extraverted, agreeable,
                                    conscientious, emot_stable, open_to_exp, age_years)])
      blup_dt <- data.table(agent_id = as.character(blups_m3$agent_ids), blup = blups_m3$intercepts)
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
        conscientious= c(dummy_assoc(merged$blup, merged$conscientious), list(type = "dummy")),
        emot_stable  = c(dummy_assoc(merged$blup, merged$emot_stable), list(type = "dummy")),
        open_to_exp  = c(dummy_assoc(merged$blup, merged$open_to_exp), list(type = "dummy"))
      )
    } else NULL
  }, error = function(e) NULL)

  total_secs <- round((proc.time() - t0)["elapsed"], 1)

  existing$model3 <- list(
    type           = "pole_mention_main_only_logit",
    formula        = formula_str,
    coefficients   = m3_coefs,
    pole_flags     = pole_flags,
    context_flags  = context_flags_info,
    n_mention_main = length(included_main),
    n_interactions = 0L,
    threshold      = threshold,
    fit = list(aic = round(AIC(m3), 2), bic = round(BIC(m3), 2),
               n = nrow(df3), n_groups = length(unique(df3$agent_id)),
               re_variance = round(re_var, 6)),
    warning = conv_warn, dharma = dharma_info, blups = blups_m3,
    calibration_bins   = if (!is.null(calib_m3)) as.list(as.data.frame(calib_m3)) else NULL,
    calibration_by_age = if (!is.null(calib_by_age_m3)) as.list(as.data.frame(calib_by_age_m3)) else NULL,
    resids_by_infection = if (!is.null(resids_by_inf)) as.list(as.data.frame(resids_by_inf)) else NULL,
    resids_by_age      = if (!is.null(resids_by_age)) as.list(as.data.frame(resids_by_age)) else NULL,
    blups_vs_predictors = blups_vs_preds
  )
  if (!dry_run) write_json(existing, json_path, auto_unbox = TRUE, digits = 8, pretty = TRUE)

  disp <- if (!is.null(dharma_info$dispersion_ratio)) sprintf("disp=%.2f", dharma_info$dispersion_ratio) else "disp=?"
  max_se <- if (length(m3_coefs) > 0) {
    max(sapply(m3_coefs, function(c) if (is.list(c)) c$se else NA), na.rm = TRUE)
  } else NA
  list(key = config_key,
       status = sprintf("OK %s · max SE=%.2f · fit %.1fs · dh %.1fs · total %.1fs",
                       disp, max_se, fit_secs, dh_secs, total_secs))
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
