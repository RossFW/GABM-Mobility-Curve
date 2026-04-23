#!/usr/bin/env Rscript
# ============================================================
# Add calibration_by_age to existing regression JSONs.
# Re-fits Model 2 only (fast) — no DHARMa, no Model 3.
# Bins agents into 5-year age groups and stores per-bin
# observed vs predicted stay-home rate.
# Runtime: ~7 min sequential, ~2-3 min with 4 cores.
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

  preds <- as.numeric(predict(m2, type = "response"))
  df_tmp <- data.table(p = preds, y = df$stay_home, age = df$age_years)
  df_tmp[, age_bin := floor((age - 18) / 5)]
  calib <- df_tmp[, .(age_min   = min(age),
                      age_max   = max(age),
                      age_mid   = mean(age),
                      predicted = mean(p, na.rm = TRUE),
                      observed  = mean(y, na.rm = TRUE),
                      n         = .N), by = age_bin][order(age_bin)]

  existing$model2$calibration_by_age <- as.list(as.data.frame(calib))

  # Also stash a copy under model3.calibration_by_age for the A3 view to reuse.
  # (Age effect in M3 is nearly identical to M2 since mention flags don't interact with age.)
  if (!is.null(existing$model3)) {
    existing$model3$calibration_by_age <- as.list(as.data.frame(calib))
  }

  write_json(existing, json_path, auto_unbox = TRUE, digits = 8, pretty = TRUE)
  elapsed <- round((proc.time() - t0)["elapsed"], 1)
  list(key = config_key, status = sprintf("OK (%.1fs)", elapsed))
}

t0 <- proc.time()
if (n_cores > 1) {
  results <- mclapply(json_files, process_one, mc.cores = n_cores)
} else {
  results <- lapply(json_files, function(f) {
    r <- process_one(f)
    cat(sprintf("  %-50s %s\n", r$key, r$status))
    r
  })
}
cat(sprintf("\nWall time: %.1fs\n", (proc.time() - t0)["elapsed"]))
if (n_cores > 1) {
  for (r in results) cat(sprintf("  %-50s %s\n", r$key, r$status))
}
