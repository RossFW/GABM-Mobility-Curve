#!/usr/bin/env Rscript
# ============================================================
# Add calibration_bins (by infection) to existing regression JSONs
# for MODEL 2 (random-effects logit) only.
#
# Why: model1 and model3 already store a `calibration_bins` field
# (mean predicted P vs observed rate per infection level, using the
# CONDITIONAL prediction from predict(model, type="response")).
# model2 never had it, so the C.2.1 calibration figure fell back to
# a JS marginal reconstruction (random intercepts forced to 0), which
# made the random-effects model look mis-calibrated when it isn't.
#
# This script refits Model 2 per config and stores model2$calibration_bins
# with the SAME structure as model1/model3 (keys: inf, predicted, observed, n),
# so all three C.X.1 panels become apples-to-apples (conditional).
#
# Re-fits Model 2 only (fast) — no DHARMa, no Model 3.
# Runtime: ~7 min sequential, ~2-3 min with 4 cores.
#
# Usage:
#   Rscript analysis/add_calibration_by_infection.R            # all 21, 1 core
#   Rscript analysis/add_calibration_by_infection.R --cores 4  # all 21, 4 cores
# ============================================================

library(data.table)
library(lme4)
library(jsonlite)
library(parallel)

args_raw <- commandArgs(trailingOnly = TRUE)
n_cores <- 1L
cores_idx <- which(args_raw == "--cores")
if (length(cores_idx) > 0 && length(args_raw) > cores_idx) {
  n_cores <- max(1L, as.integer(args_raw[cores_idx + 1]))
}

script_args <- commandArgs(trailingOnly = FALSE)
script_path <- sub("--file=", "", script_args[grep("--file=", script_args)])
BASE_DIR <- if (length(script_path) == 0) { normalizePath(".") } else { normalizePath(file.path(dirname(script_path), "..")) }
DATA_DIR    <- file.path(BASE_DIR, "viz", "data", "real")
OUT_DIR     <- file.path(DATA_DIR, "regressions")
AGENTS_FILE <- file.path(BASE_DIR, "agents", "agents.json")

agents_raw <- fromJSON(AGENTS_FILE)
agents <- data.table(agent_id = agents_raw$agent_id,
                     gender   = agents_raw$gender)

json_files <- list.files(OUT_DIR, pattern = "\\.json$", full.names = TRUE)
cat("Processing", length(json_files), "configs with", n_cores, "core(s)\n\n")

process_one <- function(json_path) {
  config_key <- sub("\\.json$", "", basename(json_path))
  micro_file <- file.path(DATA_DIR, config_key, "probe_results_micro.csv")
  if (!file.exists(micro_file)) return(list(key = config_key, status = "SKIP no micro"))

  existing <- tryCatch(fromJSON(json_path, simplifyVector = FALSE),
                       error = function(e) NULL)
  if (is.null(existing)) return(list(key = config_key, status = "SKIP json unreadable"))

  df <- fread(micro_file)
  df[, stay_home     := ifelse(response == "yes", 1L, 0L)]
  df[, infection_pct := as.numeric(infection_level)]
  df <- merge(df, agents, by = "agent_id", all.x = TRUE)
  df[, male          := ifelse(gender == "male", 1L, 0L)]
  df[, extraverted   := ifelse(grepl("extroverted", traits), 1L, 0L)]
  df[, agreeable     := ifelse(grepl("\\bagreeable\\b", traits), 1L, 0L)]
  df[, conscientious := ifelse(grepl("unconscientious", traits), 0L, 1L)]
  df[, emot_stable   := ifelse(grepl("emotionally stable", traits), 1L, 0L)]
  df[, open_to_exp   := ifelse(grepl("open to experience", traits), 1L, 0L)]
  df[, age_years     := as.integer(age)]

  t0 <- proc.time()
  m2 <- tryCatch(
    glmer(stay_home ~ infection_pct + I(infection_pct^2) +
                      male + extraverted + agreeable + conscientious +
                      emot_stable + open_to_exp + age_years +
                      (1 | agent_id),
          family  = binomial, data = df,
          control = glmerControl(optimizer = "bobyqa",
                                  optCtrl   = list(maxfun = 100000))),
    error = function(e) e
  )
  if (inherits(m2, "error")) {
    return(list(key = config_key, status = paste("M2 ERROR:", m2$message)))
  }

  # CONDITIONAL prediction (includes each agent's fitted random intercept),
  # exactly mirroring how model1/model3 calibration_bins are computed.
  preds <- as.numeric(predict(m2, type = "response"))
  df_tmp <- data.table(p = preds, y = df$stay_home, inf = df$infection_pct)
  calib <- df_tmp[, .(predicted = mean(p, na.rm = TRUE),
                      observed  = mean(y, na.rm = TRUE),
                      n         = .N), by = inf][order(inf)]

  existing$model2$calibration_bins <- as.list(as.data.frame(calib))

  write_json(existing, json_path, auto_unbox = TRUE, digits = 8, pretty = TRUE)
  elapsed <- round((proc.time() - t0)["elapsed"], 1)
  list(key = config_key, status = sprintf("OK (%.1fs, %d bins)", elapsed, nrow(calib)))
}

t0 <- proc.time()
if (n_cores > 1) {
  results <- mclapply(json_files, process_one, mc.cores = n_cores)
  for (r in results) cat(sprintf("  %-50s %s\n", r$key, r$status))
} else {
  results <- lapply(json_files, function(f) {
    r <- process_one(f)
    cat(sprintf("  %-50s %s\n", r$key, r$status))
    r
  })
}
cat(sprintf("\nWall time: %.1fs\n", (proc.time() - t0)["elapsed"]))
