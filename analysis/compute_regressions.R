#!/usr/bin/env Rscript
# ============================================================
# GABM Mobility Curve — Regression Analysis
# Computes fixed-effects logit (Model 1), random-effects logit (Model 2),
# and mention-interaction logit (Model 3) for all 21 LLM configurations.
# Outputs JSON for viz dashboard.
# ============================================================

library(data.table)
library(lme4)
library(jsonlite)

# ── Paths (relative to project root) ──────────────────────────
args <- commandArgs(trailingOnly = FALSE)
script_path <- sub("--file=", "", args[grep("--file=", args)])
if (length(script_path) == 0) {
  # Fallback: assume running from project root
  BASE_DIR <- normalizePath(".")
} else {
  BASE_DIR <- normalizePath(file.path(dirname(script_path), ".."))
}
DATA_DIR    <- file.path(BASE_DIR, "viz", "data", "real")
AGENTS_FILE <- file.path(BASE_DIR, "agents", "agents.json")
MODELS_FILE <- file.path(BASE_DIR, "data", "metadata", "models.csv")
OUT_DIR     <- file.path(DATA_DIR, "regressions")

dir.create(OUT_DIR, showWarnings = FALSE, recursive = TRUE)

cat("Base dir:", BASE_DIR, "\n")
cat("Output dir:", OUT_DIR, "\n\n")

# ── Load agents (for gender lookup) ──────────────────────────
agents_raw <- fromJSON(AGENTS_FILE)
agents <- data.table(
  agent_id = agents_raw$agent_id,
  gender   = agents_raw$gender
)
cat("Loaded", nrow(agents), "agents\n")

# ── Build config list from directory names ───────────────────
config_dirs <- list.dirs(DATA_DIR, full.names = FALSE, recursive = FALSE)
config_dirs <- config_dirs[config_dirs != "regressions"]
config_dirs <- sort(config_dirs)
cat("Found", length(config_dirs), "config directories\n\n")

# ── Load models.csv for display labels ───────────────────────
models_meta <- fread(MODELS_FILE)
# Build config key the same way JS does: provider_alias(dots→underscores)_reasoning
models_meta[, config_key := paste0(
  provider, "_",
  gsub("\\.", "_", alias), "_",
  reasoning
)]
# Also handle dots in alias that become underscores AND hyphens
# Actually, looking at actual dir names vs alias: alias has dots (gpt-5.2),
# dirs have underscores (gpt-5_2). Let's also handle periods→underscores in alias
models_meta[, config_key := paste0(
  provider, "_",
  gsub("\\.", "_", alias), "_",
  reasoning
)]

# ── Helper: significance stars ───────────────────────────────
sig_stars <- function(p) {
  ifelse(p < 0.001, "***",
  ifelse(p < 0.01,  "**",
  ifelse(p < 0.05,  "*",
  ifelse(p < 0.1,   ".", ""))))
}

# ── Helper: extract coefficient info ─────────────────────────
extract_coefs <- function(coef_table, coef_names = NULL) {
  if (is.null(coef_names)) coef_names <- rownames(coef_table)
  result <- list()
  for (i in seq_along(coef_names)) {
    nm <- coef_names[i]
    est <- coef_table[i, "Estimate"]
    se  <- coef_table[i, "Std. Error"]
    z   <- coef_table[i, "z value"]
    p   <- coef_table[i, "Pr(>|z|)"]
    or  <- exp(est)
    or_lo <- exp(est - 1.96 * se)
    or_hi <- exp(est + 1.96 * se)

    # Clean name for JSON key
    key <- tolower(gsub("[^a-zA-Z0-9]", "_", nm))
    key <- gsub("_+", "_", key)
    key <- gsub("^_|_$", "", key)
    # Map specific names
    if (grepl("intercept", key, ignore.case = TRUE)) key <- "intercept"
    if (key == "infection_pct") key <- "infection_pct"
    if (key == "i_infection_pct_2_") key <- "infection_pct_sq"
    if (key == "i_infection_pct_2") key <- "infection_pct_sq"

    result[[key]] <- list(
      estimate = round(est, 6),
      se       = round(se, 6),
      z        = round(z, 4),
      p        = p,
      or       = or,
      or_ci_lo = or_lo,
      or_ci_hi = or_hi,
      sig      = sig_stars(p)
    )
  }
  result
}

# ── Process each config ──────────────────────────────────────
results_summary <- data.table(
  config_key = character(),
  m1_status  = character(),
  m2_status  = character(),
  m3_status  = character()
)

for (dir_name in config_dirs) {
  micro_file <- file.path(DATA_DIR, dir_name, "probe_results_micro.csv")
  if (!file.exists(micro_file)) {
    cat("SKIP:", dir_name, "— no micro CSV\n")
    next
  }

  cat("Processing:", dir_name, "... ")

  # Get label from models_meta
  meta_row <- models_meta[config_key == dir_name]
  label <- if (nrow(meta_row) > 0) {
    paste0(
      toupper(substr(meta_row$provider, 1, 1)),
      substr(meta_row$provider, 2, nchar(meta_row$provider)),
      " ", meta_row$alias,
      if (meta_row$reasoning != "off") paste0(" (", meta_row$reasoning, ")") else ""
    )
  } else {
    dir_name
  }

  output <- list(
    config_key = dir_name,
    label      = label,
    model1     = NULL,
    model2     = NULL,
    model3     = NULL
  )

  m1_status <- "ok"
  m2_status <- "ok"
  m3_status <- "ok"

  tryCatch({
    # Read micro CSV
    df <- fread(micro_file)

    # Code dependent variable
    df[, stay_home := ifelse(response == "yes", 1L, 0L)]

    # Infection rate as percentage (already in percentage in CSV)
    df[, infection_pct := as.numeric(infection_level)]

    # Join gender from agents
    df <- merge(df, agents, by = "agent_id", all.x = TRUE)

    # Code dummy variables from traits column (pipe-separated)
    df[, male        := ifelse(gender == "male", 1L, 0L)]
    df[, extraverted := ifelse(grepl("extroverted", traits), 1L, 0L)]
    df[, agreeable   := ifelse(grepl("\\bagreeable\\b", traits), 1L, 0L)]
    df[, conscientious := ifelse(grepl("unconscientious", traits), 0L, 1L)]
    df[, emot_stable := ifelse(grepl("emotionally stable", traits), 1L, 0L)]
    df[, open_to_exp := ifelse(grepl("open to experience", traits), 1L, 0L)]

    # Age as raw years (no transformation)
    df[, age_years := as.integer(age)]

    n_obs <- nrow(df)

    # ── Model 1: Fixed Effects Logit ──────────────────────
    tryCatch({
      m1 <- glm(stay_home ~ infection_pct + I(infection_pct^2) + factor(agent_id),
                 family = binomial, data = df)

      coef_table <- summary(m1)$coefficients
      # Extract only intercept + infection terms (first 3 rows)
      m1_coefs <- extract_coefs(coef_table[1:3, , drop = FALSE])

      output$model1 <- list(
        type         = "fixed_effects_logit",
        coefficients = m1_coefs,
        fit          = list(
          aic          = round(AIC(m1), 2),
          bic          = round(BIC(m1), 2),
          n            = n_obs,
          deviance     = round(deviance(m1), 2),
          null_deviance = round(m1$null.deviance, 2),
          pseudo_r2    = round(1 - deviance(m1) / m1$null.deviance, 4)
        )
      )
    }, error = function(e) {
      m1_status <<- paste("ERROR:", e$message)
      output$model1 <<- list(type = "fixed_effects_logit", error = e$message)
    })

    # ── Model 2: Random Effects Logit ─────────────────────
    tryCatch({
      m2 <- glmer(
        stay_home ~ infection_pct + I(infection_pct^2) +
          male + extraverted + agreeable + conscientious +
          emot_stable + open_to_exp + age_years +
          (1 | agent_id),
        family  = binomial,
        data    = df,
        control = glmerControl(
          optimizer = "bobyqa",
          optCtrl   = list(maxfun = 100000)
        )
      )

      coef_table <- summary(m2)$coefficients
      m2_coefs <- extract_coefs(coef_table)

      # Rename age_years key to just "age"
      if ("age_years" %in% names(m2_coefs)) {
        m2_coefs$age <- m2_coefs$age_years
        m2_coefs$age_years <- NULL
      }

      # Random effect variance
      re_var <- as.data.frame(VarCorr(m2))$vcov[1]

      # Check for convergence warnings
      conv_warn <- NULL
      if (length(m2@optinfo$conv$lme4$messages) > 0) {
        conv_warn <- paste(m2@optinfo$conv$lme4$messages, collapse = "; ")
      }

      # DHARMa simulated residuals (for calibration Q-Q in viz)
      # Scaled residuals under a well-specified model should be Uniform(0,1).
      # We store a compact CDF summary (99 quantiles) plus KS + dispersion tests.
      dharma_info <- NULL
      if (requireNamespace("DHARMa", quietly = TRUE)) {
        tryCatch({
          sim <- DHARMa::simulateResiduals(fittedModel = m2, n = 250,
                                           plot = FALSE, seed = 42)
          resids <- sim$scaledResiduals
          probs  <- seq(0.01, 0.99, by = 0.01)
          qvals  <- as.numeric(quantile(resids, probs = probs, na.rm = TRUE))
          t_unif <- DHARMa::testUniformity(sim, plot = FALSE)
          t_disp <- DHARMa::testDispersion(sim, plot = FALSE)
          dharma_info <- list(
            n_sim            = 250,
            n_obs            = length(resids),
            probs            = probs,
            quantiles        = qvals,
            ks_statistic     = as.numeric(t_unif$statistic),
            ks_p_value       = as.numeric(t_unif$p.value),
            dispersion_ratio = as.numeric(t_disp$statistic),
            dispersion_p     = as.numeric(t_disp$p.value)
          )
        }, error = function(e) {
          cat("[DHARMa failed:", e$message, "] ")
        })
      } else {
        cat("[DHARMa package not installed — skipping] ")
      }

      output$model2 <- list(
        type         = "random_effects_logit",
        coefficients = m2_coefs,
        fit          = list(
          aic         = round(AIC(m2), 2),
          bic         = round(BIC(m2), 2),
          n           = n_obs,
          n_groups    = length(unique(df$agent_id)),
          re_variance = round(re_var, 6)
        ),
        warning      = conv_warn,
        dharma       = dharma_info
      )
    }, error = function(e) {
      m2_status <<- paste("ERROR:", e$message)
      output$model2 <<- list(type = "random_effects_logit", error = e$message)
    })

    # ── Model 3: Mention-Interaction Logit ──────────────────
    # Same as Model 2, but adds mention flags + trait×mention interactions
    # Tests: when a model explicitly mentions a trait, does that trait have a stronger effect?
    tryCatch({
      # Read mention flags
      flags_file <- file.path(DATA_DIR, dir_name, "mention_flags.csv")
      if (!file.exists(flags_file)) {
        m3_status <<- "SKIP: no mention_flags.csv"
        output$model3 <<- list(type = "mention_interaction_logit", error = "No mention_flags.csv")
      } else {
        flags <- fread(flags_file)

        # Merge flags with df by agent_id, rep, infection_level
        df3 <- merge(df, flags,
                     by = c("agent_id", "rep", "infection_level"),
                     all.x = TRUE)

        # Check for merge quality
        na_flags <- sum(is.na(df3$mentioned_ext))
        if (na_flags > 0) {
          cat("[WARN: ", na_flags, " unmatched rows] ")
          # Fill NAs with 0
          flag_cols <- c("mentioned_ext", "mentioned_agr", "mentioned_con",
                        "mentioned_neu", "mentioned_ope",
                        "mentioned_infection", "mentioned_age")
          for (fc in flag_cols) {
            df3[is.na(get(fc)), (fc) := 0L]
          }
        }

        # Pre-check contrast: flag dimensions where mention rate < 5% or > 95%
        flag_cols <- c("mentioned_ext", "mentioned_agr", "mentioned_con",
                      "mentioned_neu", "mentioned_ope",
                      "mentioned_infection", "mentioned_age")
        contrast_flags <- list()
        for (fc in flag_cols) {
          rate <- mean(df3[[fc]], na.rm = TRUE)
          dim_name <- sub("mentioned_", "", fc)
          contrast_flags[[dim_name]] <- list(
            mention_rate = round(rate, 4),
            sufficient = rate >= 0.05 & rate <= 0.95
          )
        }

        # Build formula dynamically — include interactions only for sufficient contrast
        base_terms <- c("infection_pct", "I(infection_pct^2)",
                       "male", "extraverted", "agreeable", "conscientious",
                       "emot_stable", "open_to_exp", "age_years")

        # Always include mention main effects
        mention_terms <- flag_cols

        # Interaction terms (trait × mentioned_trait)
        interaction_map <- list(
          mentioned_ext = "extraverted",
          mentioned_agr = "agreeable",
          mentioned_con = "conscientious",
          mentioned_neu = "emot_stable",
          mentioned_ope = "open_to_exp",
          mentioned_infection = "infection_pct",
          mentioned_age = "age_years"
        )

        interaction_terms <- c()
        for (flag in names(interaction_map)) {
          dim_name <- sub("mentioned_", "", flag)
          if (contrast_flags[[dim_name]]$sufficient) {
            interaction_terms <- c(interaction_terms,
                                  paste0(interaction_map[[flag]], ":", flag))
          }
        }

        all_terms <- c(base_terms, mention_terms, interaction_terms)
        formula_str <- paste("stay_home ~", paste(all_terms, collapse = " + "),
                           "+ (1 | agent_id)")
        m3_formula <- as.formula(formula_str)

        cat("[M3: ", length(interaction_terms), " interactions] ")

        m3 <- glmer(
          m3_formula,
          family  = binomial,
          data    = df3,
          control = glmerControl(
            optimizer = "bobyqa",
            optCtrl   = list(maxfun = 200000)
          )
        )

        coef_table <- summary(m3)$coefficients
        m3_coefs <- extract_coefs(coef_table)

        # Rename age_years to age
        if ("age_years" %in% names(m3_coefs)) {
          m3_coefs$age <- m3_coefs$age_years
          m3_coefs$age_years <- NULL
        }

        # Random effect variance
        re_var <- as.data.frame(VarCorr(m3))$vcov[1]

        # Check convergence
        conv_warn <- NULL
        if (length(m3@optinfo$conv$lme4$messages) > 0) {
          conv_warn <- paste(m3@optinfo$conv$lme4$messages, collapse = "; ")
        }

        output$model3 <- list(
          type           = "mention_interaction_logit",
          formula        = formula_str,
          coefficients   = m3_coefs,
          contrast_flags = contrast_flags,
          n_interactions = length(interaction_terms),
          fit            = list(
            aic         = round(AIC(m3), 2),
            bic         = round(BIC(m3), 2),
            n           = nrow(df3),
            n_groups    = length(unique(df3$agent_id)),
            re_variance = round(re_var, 6)
          ),
          warning        = conv_warn
        )
      }
    }, error = function(e) {
      m3_status <<- paste("ERROR:", e$message)
      output$model3 <<- list(type = "mention_interaction_logit", error = e$message)
    })

    # Write JSON
    json_file <- file.path(OUT_DIR, paste0(dir_name, ".json"))
    write_json(output, json_file, pretty = TRUE, auto_unbox = TRUE, digits = 8)

  }, error = function(e) {
    cat("FATAL ERROR:", e$message, "\n")
    m1_status <- paste("FATAL:", e$message)
    m2_status <- paste("FATAL:", e$message)
    m3_status <- paste("FATAL:", e$message)
  })

  cat(m1_status, "/", m2_status, "/", m3_status, "\n")
  results_summary <- rbindlist(list(results_summary, data.table(
    config_key = dir_name, m1_status = m1_status, m2_status = m2_status,
    m3_status = m3_status
  )))
}

# ── Summary ──────────────────────────────────────────────────
cat("\n===== SUMMARY =====\n")
print(results_summary)
cat("\nJSON files written to:", OUT_DIR, "\n")
cat("Total configs processed:", nrow(results_summary), "\n")
