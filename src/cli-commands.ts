import { existsSync, readFileSync, writeFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import {
  printJson, printJsonEnvelope, resolveRepo, parseRunState, parsePositiveInt,
  sanitizeForTerminal, getInstalledPackagePath, getInstalledPackageInfo,
  readUpdateCache, getGlobalNpmPrefix, readGoalDoc, atomicWriteTextInRepo,
  resolvePath, readJsonFile, normalizeResultStatus, normalizeScorerStatus,
  AutoresearchError, normalizeDirection, normalizeMode,
} from "./helpers.js";
import {
  initializeRun, appendIteration, setStopRequested, resumeBackgroundRun,
  completeRun, buildSupervisorSnapshot, buildRunDigest,
} from "./run-manager.js";
import {
  VERSION, PACKAGE_NAME, SKILL_NAME,
  MAX_DRAFTS, RESULTS_DEFAULT, STATE_DEFAULT, LAUNCH_DEFAULT,
  MEMORY_DEFAULT, SCORE_HISTORY_DEFAULT, GOAL_DEFAULT,
} from "./constants.js";
import {
  tsvField, escapeMarkdownInline, escapeMarkdownTableCell,
  formatDisplayValue, formatMetricValue, formatTimestamp,
  formatMarkdownField, parseMemoryPatternHeading,
  readScoreHistoryFile, readTailLines,
  normalizeBranchPolicy, parseBranchPolicyOverrides,
  parseArgs, shouldSkipUpdateCheck, HELP_FLAGS,
} from "./cli-helpers.js";

export type CommandGroup = Record<string, string | string[]>;

/* ── wizard ── */
export async function handleWizard(grouped: CommandGroup, _useJson: boolean): Promise<number> {
  const { buildSetupSummary } = await import("./wizard.js");
  const config = {
    goal: grouped.goal as string | undefined,
    scope: grouped.scope as string | undefined,
    metric: grouped.metric as string | undefined,
    direction: grouped.direction as string | undefined,
    verify: grouped.verify as string | undefined,
    guard: grouped.guard as string | undefined,
    mode: grouped.mode as string | undefined,
    iterations: parsePositiveInt(grouped.iterations as string | undefined, "iterations"),
    max_no_progress: parsePositiveInt(grouped["max-no-progress"] as string | undefined, "max-no-progress"),
    duration: grouped.duration as string | undefined,
    memory_path: grouped["memory-path"] as string | undefined,
    required_keep_labels: grouped["required-keep-labels"] as string[] | undefined,
    required_stop_labels: grouped["required-stop-labels"] as string[] | undefined,
    stop_condition: grouped["stop-condition"] as string | undefined,
    rollback_strategy: grouped["rollback-strategy"] as string | undefined,
  };
  printJsonEnvelope("wizard", buildSetupSummary(grouped.repo as string | undefined, config));
  return 0;
}

/* ── init ── */
export async function handleInit(
  grouped: CommandGroup, verbose: boolean, dryRun: boolean, _useJson: boolean,
): Promise<number> {
  if (verbose) console.error(`[verbose] Initializing run with goal: ${formatDisplayValue(grouped.goal)}`);
  if (dryRun) {
    console.log("[dry-run] Would initialize run with config:");
    console.log(JSON.stringify({
      goal: grouped.goal,
      metric: grouped.metric,
      direction: grouped.direction || "lower",
      mode: grouped.mode || "foreground",
    }, null, 2));
    return 0;
  }
  
  const config = {
    goal: grouped.goal as string,
    metric: (grouped.metric || grouped["outcome-metric"]) as string,
    direction: (grouped.direction || grouped["outcome-direction"]) as string || "lower",
    verify: grouped.verify as string,
    mode: grouped.mode as string || "foreground",
    scope: grouped.scope as string | undefined,
    guard: grouped.guard as string | undefined,
    scorer: grouped.scorer as string | undefined,
    iterations: parsePositiveInt(grouped.iterations as string | undefined, "iterations"),
    max_no_progress: parsePositiveInt(grouped["max-no-progress"] as string | undefined, "max-no-progress"),
    duration: grouped.duration as string | undefined,
    memory_path: grouped["memory-path"] as string | undefined,
    required_keep_labels: grouped["required-keep-labels"] as string[] | undefined,
    required_stop_labels: grouped["required-stop-labels"] as string[] | undefined,
    run_tag: grouped["run-tag"] as string | undefined,
    stop_condition: grouped["stop-condition"] as string | undefined,
    baseline: grouped.baseline as string | undefined,
    num_drafts: parsePositiveInt(grouped["num-drafts"] as string | undefined, "num_drafts", { max: MAX_DRAFTS }) ?? 1,
    branch_selection_policy: normalizeBranchPolicy(grouped["branch-policy"] as string | undefined),
    branch_policy_overrides: parseBranchPolicyOverrides(grouped["branch-policy-overrides"] as string | undefined),
    outcome_metric: grouped["outcome-metric"] as string | undefined,
    outcome_direction: grouped["outcome-direction"] as string | undefined,
    instrument_metric: grouped["instrument-metric"] as string | undefined,
    instrument_direction: grouped["instrument-direction"] as string | undefined,
    max_debug_depth: parsePositiveInt(grouped["max-debug-depth"] as string | undefined, "max_debug_depth"),
    branch_failure_budget: parsePositiveInt(grouped["branch-failure-budget"] as string | undefined, "branch_failure_budget"),
  };
  const state = await initializeRun(
    grouped.repo as string | undefined,
    grouped["results-path"] as string | undefined,
    grouped["state-path"] as string | undefined,
    config,
    grouped["fresh-start"] === "true",
  );
  printJson(state);
  return 0;
}

/* ── status ── */
export async function handleStatus(grouped: CommandGroup, useJson: boolean): Promise<number> {
  
  const snapshot = await buildSupervisorSnapshot(
    grouped.repo as string | undefined,
    grouped["results-path"] as string | undefined,
    grouped["state-path"] as string | undefined,
  );
  if (useJson) {
    printJsonEnvelope("status", snapshot);
    return 0;
  }
  const s = snapshot;
  const stats = s.stats;
  console.log(`Run:     ${formatDisplayValue(s.run_id)}`);
  console.log(`Status:  ${formatDisplayValue(s.status)}`);
  console.log(`Mode:    ${formatDisplayValue(s.mode)}`);
  console.log(`Op Mode: ${formatDisplayValue(s.operating_mode)}`);
  console.log(`Goal:    ${formatDisplayValue(s.goal)}`);
  if (s.metric) {
    const m = s.metric;
    console.log(`Metric:  ${formatDisplayValue(m.name)} (${formatDisplayValue(m.direction)})`);
    console.log(`  best:  ${formatMetricValue(m.best)}`);
    console.log(`  latest: ${formatMetricValue(m.latest)}`);
  }
  if (stats) {
    console.log(`Stats:   ${stats.total_iterations} iterations, ${stats.kept} kept, ${stats.discarded} discarded`);
  }
  console.log(`Results: ${s.results_rows} rows`);
  const lastIter = s.last_iteration;
  if (lastIter && lastIter.iteration) {
    const stageTag = lastIter.stage ? ` [${formatDisplayValue(lastIter.stage)}]` : "";
    console.log(`Last:    iter ${formatDisplayValue(lastIter.iteration)}${stageTag} \u2014 ${formatDisplayValue(lastIter.decision)} (${formatMetricValue(lastIter.metric_value)})`);
    if (lastIter.score_components != null && typeof lastIter.score_components === "object") {
      const parts = Object.entries(lastIter.score_components as Record<string, number>)
        .map(([k, v]) => `${formatDisplayValue(k)}:${typeof v === "number" ? v.toFixed(4) : formatDisplayValue(v)}`)
        .join(", ");
      if (parts.length > 0) console.log(`  Components: [${parts}]`);
    }
    if (lastIter.selected_action) console.log(`  Action:   ${formatDisplayValue(lastIter.selected_action)}`);
  }
  const flags = s.flags;
  if (flags?.needs_human) console.log("\u26a0  Needs human input");
  if (flags?.stop_requested) console.log("\u23f9  Stop requested");
  if (flags?.context_pressure) {
    const cp = flags.context_pressure;
    const warnings = Array.isArray(cp.warnings) ? cp.warnings : [];
    if (warnings.length > 0) {
      for (const w of warnings) console.log(`\u1f638 Context pressure: ${formatDisplayValue(w)}`);
    }
  }
  return 0;
}

/* ── explain ── */
export async function handleExplain(grouped: CommandGroup, useJson: boolean): Promise<number> {
  const { buildSupervisorSnapshot } = await import("./run-manager.js");
  const snapshot = await buildSupervisorSnapshot(
    grouped.repo as string | undefined,
    grouped["results-path"] as string | undefined,
    grouped["state-path"] as string | undefined,
  );
  const s = snapshot;
  const stats = s.stats;
  const lastIter = s.last_iteration;
  const flags = s.flags;
  if (useJson) {
    printJsonEnvelope("explain", snapshot);
    return 0;
  }
  const statusEmoji: Record<string, string> = {
    running: "\ud83d\udd04", completed: "\u2705", initialized: "\ud83d\udccb",
    stopping: "\u23f9", stopped: "\u23f8",
  };
  const statusKey = typeof s.status === "string" ? s.status : "";
  const candidateEmoji = Object.prototype.hasOwnProperty.call(statusEmoji, statusKey)
    ? statusEmoji[statusKey] : undefined;
  const emoji = typeof candidateEmoji === "string" ? candidateEmoji : "\u26aa";
  console.log(`${emoji} Auto Research Run: ${formatDisplayValue(s.run_id)}`);
  console.log(`   Goal:      ${formatDisplayValue(s.goal)}`);
  console.log(`   Status:    ${formatDisplayValue(s.status)}`);
  console.log(`   Mode:      ${formatDisplayValue(s.mode)}`);
  console.log(`   Op Mode:   ${formatDisplayValue(s.operating_mode)}`);
  if (s.metric) {
    const m = s.metric;
    console.log(`   Metric:    ${formatDisplayValue(m.name)} \u2192 ${formatMetricValue(m.latest)} (best: ${formatMetricValue(m.best)}, dir: ${formatDisplayValue(m.direction)})`);
  }
  if (stats) {
    console.log(`   Progress:  ${stats.total_iterations} iterations | ${stats.kept} kept | ${stats.discarded} discarded`);
  }
  if (lastIter && lastIter.iteration) {
    console.log(`   Last iter: #${formatDisplayValue(lastIter.iteration)} \u2014 ${formatDisplayValue(lastIter.decision)}`);
    if (lastIter.change_summary) console.log(`   Change:    ${formatDisplayValue(lastIter.change_summary)}`);
    if (lastIter.score_components != null && typeof lastIter.score_components === "object") {
      const parts = Object.entries(lastIter.score_components as Record<string, number>)
        .map(([k, v]) => `${formatDisplayValue(k)}:${typeof v === "number" ? v.toFixed(4) : formatDisplayValue(v)}`)
        .join(", ");
      if (parts.length > 0) console.log(`   Components: [${parts}]`);
    }
  }
  if (flags?.needs_human) console.log("   \u26a0  Needs human review");
  if (flags?.stop_requested) console.log("   \u23f9  Stop was requested");
  if (flags?.background_active) console.log("   \ud83d\udce1  Background active");
  return 0;
}

/* ── history ── */
export async function handleHistory(grouped: CommandGroup, useJson: boolean): Promise<number> {
  const resultsPath = resolvePath(
    grouped.repo as string | undefined,
    grouped["results-path"] as string | undefined,
    RESULTS_DEFAULT,
  );
  if (!existsSync(resultsPath)) {
    console.log("No results file found.");
    return 0;
  }
  const content = readFileSync(resultsPath, "utf-8");
  const lines = content.trim().split("\n");
  if (lines.length <= 1) {
    console.log("No iteration records yet.");
    return 0;
  }
  const limit = parsePositiveInt(grouped.limit as string | undefined, "limit") ?? 10;
  const headers = lines[0].split("\t");
  const records = lines.slice(1).reverse().slice(0, limit);
  if (useJson) {
    const parsed = records.map((r: string) => {
      const cols = r.split("\t");
      const obj: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        obj[headers[i]!] = cols[i] ?? "";
      }
      return obj;
    });
    printJsonEnvelope("history", { count: records.length, records: parsed });
    return 0;
  }
  for (const r of records) {
    const cols = r.split("\t");
    if (cols.length >= 4) {
      const decision = tsvField(headers, cols, "decision", 2);
      const metricValue = tsvField(headers, cols, "metric_value", 3);
      const emoji = decision === "keep" ? "\u2713" : decision === "discard" ? "\u2717" : "\u26a0";
      const changeSummary = tsvField(headers, cols, "change_summary", 8);
      console.log(`${emoji}  #${formatDisplayValue(cols[1])}  ${formatDisplayValue(decision)}  (${formatMetricValue(metricValue)})  ${formatDisplayValue(changeSummary.substring(0, 60))}`);
    }
  }
  console.log(`\nShowing ${Math.min(limit, records.length)} of ${lines.length - 1} records.`);
  return 0;
}

/* ── scores ── */
export async function handleScores(grouped: CommandGroup, useJson: boolean): Promise<number> {
  const scoreHistoryPath = resolvePath(
    grouped.repo as string | undefined,
    grouped["score-history-path"] as string | undefined,
    SCORE_HISTORY_DEFAULT,
  );
  if (!existsSync(scoreHistoryPath)) {
    console.log("No score history found.");
    return 0;
  }
  const limit = parsePositiveInt(grouped.limit as string | undefined, "limit") ?? 10;
  const showTopComponents = grouped["top-components"] === "true";
  if (showTopComponents) {
    const allLines = readScoreHistoryFile(scoreHistoryPath)
      .split("\n").map((l: string) => l.trim()).filter(Boolean);
    const allParsed = allLines.map((r: string) => {
      try { return JSON.parse(r); } catch { return null; }
    }).filter(Boolean);
    if (allParsed.length === 0) {
      console.log("No score records yet.");
      return 0;
    }
    const { rankComponents } = await import("./score-parser.js");
    const ranking = rankComponents(allParsed);
    if (useJson) {
      printJsonEnvelope("scores", { count: allParsed.length, scores: allParsed.slice(-limit), ranking });
      return 0;
    }
    console.log("Component Rankings:");
    if (ranking.top_positive.length > 0) {
      console.log("  Top improving components:");
      for (const c of ranking.top_positive) {
        console.log(`    + ${formatDisplayValue(c.name)}  \u0394+${c.delta.toFixed(4)}`);
      }
    }
    if (ranking.top_negative.length > 0) {
      console.log("  Top declining components:");
      for (const c of ranking.top_negative) {
        console.log(`    - ${formatDisplayValue(c.name)}  \u0394${c.delta.toFixed(4)}`);
      }
    }
    if (ranking.top_positive.length === 0 && ranking.top_negative.length === 0) {
      console.log("  No component data found.");
    }
    console.log(`\nAnalyzed ${allParsed.length} score records.`);
    return 0;
  }
  const records = readTailLines(scoreHistoryPath, limit);
  if (records.length === 0) {
    console.log("No score records yet.");
    return 0;
  }
  if (useJson) {
    const parsed = records.map((r: string) => {
      try { return JSON.parse(r); } catch { return null; }
    }).filter(Boolean);
    printJsonEnvelope("scores", { count: parsed.length, scores: parsed });
    return 0;
  }
  console.log("Score History (latest " + Math.min(limit, records.length) + "):");
  const recordsOrdered = records.slice().reverse();
  for (let i = 0; i < recordsOrdered.length; i += 1) {
    const r = recordsOrdered[i];
    try {
      const rec = JSON.parse(r);
      let trend = "";
      if (i + 1 < recordsOrdered.length) {
        try {
          const prevRec = JSON.parse(recordsOrdered[i + 1]);
          const cv = typeof rec.metric_value === "number" ? rec.metric_value : Number(rec.metric_value);
          const pv = typeof prevRec.metric_value === "number" ? prevRec.metric_value : Number(prevRec.metric_value);
          if (Number.isFinite(cv) && Number.isFinite(pv)) {
            if (cv === pv) trend = "\u2192";
            else if (rec.metric_direction === "higher") trend = cv > pv ? "\u2191" : "\u2193";
            else trend = cv < pv ? "\u2191" : "\u2193";
          }
        } catch { /* ignore */ }
      }
      let componentLine = "";
      if (rec.score_components != null && typeof rec.score_components === "object") {
        const parts = Object.entries(rec.score_components as Record<string, number>)
          .map(([k, v]) => `${formatDisplayValue(k)}:${typeof v === "number" ? v.toFixed(4) : formatDisplayValue(v)}`)
          .join(", ");
        if (parts.length > 0) componentLine = `  [${parts}]`;
      }
      let componentDeltaLine = "";
      if (componentLine && i + 1 < recordsOrdered.length) {
        try {
          const prevRec = JSON.parse(recordsOrdered[i + 1]);
          if (prevRec.score_components != null && typeof prevRec.score_components === "object") {
            const deltas: string[] = [];
            for (const [k, v] of Object.entries(rec.score_components as Record<string, number>)) {
              const prev = (prevRec.score_components as Record<string, number>)[k];
              if (typeof prev === "number" && typeof v === "number") {
                const d = v - prev;
                if (d !== 0) deltas.push(`${formatDisplayValue(k)}:${d > 0 ? "+" : ""}${d.toFixed(4)}`);
              }
            }
            if (deltas.length > 0) componentDeltaLine = `  \u0394[${deltas.join(", ")}]`;
          }
        } catch { /* ignore */ }
      }
      console.log(`  #${rec.iteration}  ${trend}  ${rec.metric_value ?? "\u2014"}  (${rec.decision})  ${rec.verify_status}${componentLine}${componentDeltaLine}`);
    } catch {
      console.log(`  [parse error]`);
    }
  }
  console.log(`\nShowing ${records.length} score records.`);
  return 0;
}

/* ── score ── */
export async function handleScore(grouped: CommandGroup, useJson: boolean): Promise<number> {
  const AErr = AutoresearchError;
  const scorerCmd = grouped.scorer as string | undefined;
  if (!scorerCmd) {
    throw new AErr("No scorer provided. Pass --scorer <cmd> to run a scorer explicitly.");
  }
  const repoBase = resolveRepo(grouped.repo as string | undefined);
  let rawOutput: string;
  try {
    rawOutput = execSync(scorerCmd, { encoding: "utf-8", cwd: repoBase, stdio: ["ignore", "pipe", "pipe"] });
  } catch (err) {
    const e = err as { message?: string; stderr?: Buffer | string };
    const stderr = typeof e.stderr === "string" ? e.stderr.trim() : (Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf-8").trim() : "");
    throw new AErr(stderr || (err instanceof Error ? err.message : String(err)));
  }
  const { parseScoreOutput } = await import("./score-parser.js");
  const scored = parseScoreOutput(rawOutput);
  const normalized = scored.score / scored.max;
  const percent = (normalized * 100).toFixed(1) + "%";
  if (useJson) {
    printJsonEnvelope("score", {
      score: scored.score, max: scored.max, normalized, percent,
      components: scored.components ?? null,
      diagnostics: scored.diagnostics ?? null,
      details: scored.details ?? null,
    });
    return 0;
  }
  console.log(`Score: ${scored.score} / ${scored.max} (${percent})`);
  if (scored.components && Object.keys(scored.components).length > 0) {
    console.log("Components:");
    for (const [key, val] of Object.entries(scored.components)) {
      console.log(`  ${formatDisplayValue(key)}: ${formatDisplayValue(val)}`);
    }
  }
  if (scored.diagnostics && Object.keys(scored.diagnostics).length > 0) {
    console.log("Diagnostics:");
    for (const [key, val] of Object.entries(scored.diagnostics)) {
      console.log(`  ${formatDisplayValue(key)}: ${formatDisplayValue(val)}`);
    }
  }
  return 0;
}

/* ── config ── */
export async function handleConfig(grouped: CommandGroup, useJson: boolean): Promise<number> {
  const statePath = resolvePath(
    grouped.repo as string | undefined,
    grouped["state-path"] as string | undefined,
    STATE_DEFAULT,
  );
  if (!existsSync(statePath)) {
    console.log("No run state found. Run 'autoresearch init' first.");
    return 0;
  }
  const state = parseRunState(readJsonFile(statePath));
  if (useJson) {
    printJsonEnvelope("config", {
      goal: state.goal, mode: state.mode, metric: state.metric, scope: state.scope,
      iterations_cap: state.iterations_cap, deadline_at: state.deadline_at,
      verify: state.verify, guard: state.guard, scorer: state.scorer ?? null,
      subagent_pool: state.subagent_pool ? "configured" : "none",
      label_requirements: state.label_requirements,
    });
    return 0;
  }
  console.log("Run Configuration:");
  console.log(`  Goal:     ${formatDisplayValue(state.goal)}`);
  console.log(`  Mode:     ${formatDisplayValue(state.mode)}`);
  console.log(`  Op Mode:  ${formatDisplayValue(state.operating_mode)}`);
  if (state.metric) {
    console.log(`  Metric:   ${formatDisplayValue(state.metric.name)} (${formatDisplayValue(state.metric.direction)})`);
  }
  console.log(`  Scope:    ${formatDisplayValue(state.scope)}`);
  console.log(`  Iter cap: ${formatDisplayValue(state.iterations_cap)}`);
  console.log(`  Deadline: ${formatDisplayValue(state.deadline_at ? formatTimestamp(state.deadline_at) : "\u2014")}`);
  console.log(`  Verify:   ${formatDisplayValue(state.verify)}`);
  console.log(`  Guard:    ${formatDisplayValue(state.guard)}`);
  console.log(`  Scorer:   ${formatDisplayValue(state.scorer ?? "\u2014")}`);
  console.log(`  Pool:     ${state.subagent_pool ? "configured" : "none"}`);
  return 0;
}

/* ── contract ── */
export async function handleContract(useJson: boolean): Promise<number> {
  const schemas = {
    schema_version: "1.0.0",
    description: "Auto Research runtime contract schemas",
    state: {
      type: "object",
      required: ["schema_version", "run_id", "created_at", "updated_at", "status", "mode", "operating_mode", "goal", "scope", "metric", "verify", "label_requirements", "artifact_paths", "stats", "flags"],
      properties: {
        schema_version: { type: "number", description: "State schema version" },
        run_id: { type: "string", description: "Unique run identifier" },
        created_at: { type: "string", format: "date-time", description: "Run creation timestamp" },
        updated_at: { type: "string", format: "date-time", description: "Last update timestamp" },
        status: { type: "string", enum: ["initialized", "running", "stopping", "stopped", "completed", "needs_human"], description: "Run status" },
        mode: { type: "string", enum: ["foreground", "background"], description: "Execution mode" },
        operating_mode: { type: "string", enum: ["converge", "continuous", "supervised"], description: "Operating mode" },
        goal: { type: "string" }, scope: { type: "string" },
        metric: { type: "object", required: ["name", "direction"], properties: { name: { type: "string" }, direction: { type: "string", enum: ["higher", "lower"] }, baseline: { type: "string" }, best: { type: "string" }, latest: { type: "string" } } },
        instrument_metric: { type: "object" }, verify: { type: "string" }, guard: { type: "string" }, scorer: { type: "string" },
        iterations_cap: { type: "number" }, duration: { type: "string" }, duration_seconds: { type: "number" }, deadline_at: { type: "string", format: "date-time" },
        label_requirements: { type: "object", required: ["keep", "stop"], properties: { keep: { type: "array", items: { type: "string" } }, stop: { type: "array", items: { type: "string" } } } },
        artifact_paths: { type: "object", required: ["results", "state"], properties: { results: { type: "string" }, state: { type: "string" } } },
        stats: { type: "object", required: ["total_iterations", "kept", "discarded", "needs_human"], properties: { total_iterations: { type: "number" }, kept: { type: "number" }, discarded: { type: "number" }, needs_human: { type: "number" }, consecutive_discards: { type: "number" }, best_iteration: { type: "number" }, debug_depth: { type: "number" } } },
        flags: { type: "object", required: ["stop_requested", "needs_human", "background_active", "stop_ready"], properties: { stop_requested: { type: "boolean" }, needs_human: { type: "boolean" }, background_active: { type: "boolean" }, stop_ready: { type: "boolean" } } },
        last_iteration: { type: "object", properties: { iteration: { type: "number" }, decision: { type: "string", enum: ["keep", "discard", "needs_human"] }, metric_value: { type: "string" }, change_summary: { type: "string" }, labels: { type: "array", items: { type: "string" } }, timestamp: { type: "string", format: "date-time" } } },
        draft_pool: { type: "object" }, lineage: { type: "object" }, budget_exhausted: { type: "boolean" }, budget_blocker_reason: { type: "string" },
      },
    },
    result_row: { type: "object", properties: { iteration: { type: "number" }, decision: { type: "string" }, metric_value: { type: "string" }, verify_status: { type: "string" }, guard_status: { type: "string" }, change_summary: { type: "string" }, labels: { type: "array", items: { type: "string" } }, timestamp: { type: "string" }, note: { type: "string" } } },
    goal_doc: { type: "object", required: ["goal", "metric", "direction", "verify"], properties: { goal: { type: "string" }, metric: { type: "string" }, direction: { type: "string", enum: ["higher", "lower"] }, verify: { type: "string" }, guard: { type: "string" }, constraints: { type: "string" }, file_map: { type: "string" }, stop_conditions: { type: "string" } } },
  };
  if (useJson) {
    printJsonEnvelope("contract", schemas);
    return 0;
  }
  console.log("Auto Research Contract Schemas");
  console.log("==============================");
  console.log("");
  console.log("State Schema:");
  console.log(`  Version:    ${schemas.state.properties.schema_version.type}`);
  console.log(`  Required:   ${schemas.state.required.join(", ")}`);
  console.log("");
  console.log("Result Row Schema:");
  console.log(`  Properties: ${Object.keys(schemas.result_row.properties).join(", ")}`);
  console.log("");
  console.log("Goal Doc Schema:");
  console.log(`  Required:   ${schemas.goal_doc.required.join(", ")}`);
  console.log("");
  console.log("Use --json for full machine-readable schema output.");
  return 0;
}

/* ── summary ── */
export async function handleSummary(grouped: CommandGroup, useJson: boolean): Promise<number> {
  const resultsPath = resolvePath(
    grouped.repo as string | undefined,
    grouped["results-path"] as string | undefined,
    RESULTS_DEFAULT,
  );
  if (!existsSync(resultsPath)) {
    console.log("No results file found. No runs completed yet.");
    return 0;
  }
  const content = readFileSync(resultsPath, "utf-8");
  const lines = content.trim().split("\n");
  const records = lines.slice(1).filter(Boolean);
  let totalKept = 0, totalDiscarded = 0, totalNeedsHuman = 0;
  const runIds = new Set<string>();
  for (const r of records) {
    const cols = r.split("\t");
    const dec = cols[2];
    if (dec === "keep") totalKept++;
    else if (dec === "discard") totalDiscarded++;
    else if (dec === "needs_human") totalNeedsHuman++;
    const iterTags = cols[1].split(":");
    if (iterTags.length >= 2) runIds.add(iterTags[0]);
  }
  if (useJson) {
    printJsonEnvelope("summary", {
      total_records: records.length, total_kept: totalKept,
      total_discarded: totalDiscarded, total_needs_human: totalNeedsHuman,
      keep_rate: records.length > 0 ? (totalKept / records.length * 100).toFixed(1) + "%" : "0%",
      distinct_run_ids: Array.from(runIds),
    });
    return 0;
  }
  console.log("Auto Research Summary");
  console.log(`  Total iterations:   ${records.length}`);
  console.log(`  Kept:               ${totalKept}`);
  console.log(`  Discarded:          ${totalDiscarded}`);
  console.log(`  Needs human:        ${totalNeedsHuman}`);
  console.log(`  Keep rate:          ${records.length > 0 ? (totalKept / records.length * 100).toFixed(1) : 0}%`);
  console.log(`  Distinct runs:      ${runIds.size}`);
  return 0;
}

/* ── validate ── */
export async function handleValidate(grouped: CommandGroup, useJson: boolean): Promise<number> {
  
  const errors: string[] = [];
  if (!grouped.goal) errors.push("Missing required: --goal");
  if (!grouped.metric && !grouped["outcome-metric"]) errors.push("Missing required: --metric or --outcome-metric");
  try { if (grouped.direction) normalizeDirection(grouped.direction as string); }
  catch (e) { errors.push(`Invalid direction: ${(e as Error).message}`); }
  try { if (grouped.mode) normalizeMode(grouped.mode as string); }
  catch (e) { errors.push(`Invalid mode: ${(e as Error).message}`); }
  if (!grouped.verify) errors.push("Missing required: --verify");
  if (useJson) {
    printJsonEnvelope("validate", { valid: errors.length === 0, errors });
    return errors.length > 0 ? 1 : 0;
  }
  if (errors.length === 0) {
    console.log("\u2713 Configuration is valid");
    console.log(`  Goal: ${grouped.goal}`);
    console.log(`  Metric: ${grouped.metric || grouped["outcome-metric"]} (${grouped.direction || grouped["outcome-direction"] || "lower"})`);
    console.log(`  Verify: ${grouped.verify}`);
    console.log(`  Mode: ${grouped.mode || "foreground"}`);
  } else {
    console.error("\u2717 Configuration errors:");
    for (const err of errors) console.error(`  - ${formatDisplayValue(err)}`);
    return 1;
  }
  return 0;
}

/* ── report ── */
export async function handleReport(grouped: CommandGroup, useJson: boolean): Promise<number> {
  const statePath = resolvePath(
    grouped.repo as string | undefined,
    grouped["state-path"] as string | undefined,
    STATE_DEFAULT,
  );
  const resultsPath = resolvePath(
    grouped.repo as string | undefined,
    grouped["results-path"] as string | undefined,
    RESULTS_DEFAULT,
  );
  if (!existsSync(statePath)) {
    console.log("No run state found.");
    return 0;
  }
  const state = parseRunState(readJsonFile(statePath));
  let results: string[] = [];
  let resultHeaders: string[] = [];
  if (existsSync(resultsPath)) {
    const content = readFileSync(resultsPath, "utf-8");
    const resultLines = content.trim().split("\n");
    resultHeaders = resultLines[0]?.split("\t") ?? [];
    results = resultLines.slice(1).filter(Boolean);
  }
  if (useJson) {
    printJsonEnvelope("report", { state, results_count: results.length });
    return 0;
  }
  console.log(`# Auto Research Report`);
  console.log(`\n**Run:** ${formatMarkdownField(state.run_id)}`);
  console.log(`**Goal:** ${formatMarkdownField(state.goal)}`);
  console.log(`**Status:** ${formatMarkdownField(state.status)}`);
  console.log(`**Mode:** ${formatMarkdownField(state.mode)}`);
  console.log(`**Op Mode:** ${formatMarkdownField(state.operating_mode)}`);
  if (state.metric) {
    console.log(`**Metric:** ${formatMarkdownField(state.metric.name)} (${formatMarkdownField(state.metric.direction)})`);
    console.log(`**Best:** ${formatMarkdownField(state.metric.best)} | **Latest:** ${formatMarkdownField(state.metric.latest)}`);
  }
  if (state.stats) {
    const s = state.stats;
    console.log(`\n## Stats`);
    console.log(`- Iterations: ${formatMarkdownField(s.total_iterations)}`);
    console.log(`- Kept: ${formatMarkdownField(s.kept)}`);
    console.log(`- Discarded: ${formatMarkdownField(s.discarded)}`);
    console.log(`- Needs human: ${formatMarkdownField(s.needs_human)}`);
    if (s.best_iteration !== undefined && results.length > 0) {
      const bestIterationResults = results.filter(r => {
        const cols = r.split("\t");
        return cols[1] === String(s.best_iteration);
      });
      if (bestIterationResults.length > 0) {
        const bestCols = bestIterationResults[0].split("\t");
        const bestChangeSummary = tsvField(resultHeaders, bestCols, "change_summary", 7);
        console.log(`- Best attempt: iteration ${formatMarkdownField(String(s.best_iteration))} \u2014 ${formatMarkdownField(bestChangeSummary.substring(0, 60))}`);
      }
    }
  }
  console.log(`\n## Milestone Progress`);
  if (state.stats) {
    const s = state.stats;
    const total = s.total_iterations;
    const successRate = total > 0 ? ((s.kept / total) * 100).toFixed(1) : "0";
    console.log(`- **Progress:** ${formatMarkdownField(s.kept)} kept / ${formatMarkdownField(total)} total iterations (${formatMarkdownField(successRate)}% success rate)`);
    if (state.iterations_cap) {
      const progressPct = ((total / state.iterations_cap) * 100).toFixed(1);
      console.log(`- **Cap:** ${formatMarkdownField(total)} / ${formatMarkdownField(state.iterations_cap)} iterations (${formatMarkdownField(progressPct)}% of cap)`);
    }
    if (state.created_at) {
      const startedAtMs = Date.parse(state.created_at);
      const endedAtMs = state.updated_at ? Date.parse(state.updated_at) : Date.now();
      if (!Number.isNaN(startedAtMs) && !Number.isNaN(endedAtMs) && endedAtMs >= startedAtMs) {
        console.log(`- **Elapsed:** ${formatMarkdownField(Math.round((endedAtMs - startedAtMs) / 1000 / 60))} minutes`);
      }
    }
    if (state.last_iteration && state.last_iteration.decision === "keep") {
      console.log(`- **Next candidate:** Iteration ${formatMarkdownField(state.last_iteration.iteration)} (kept)`);
    } else if (s.best_iteration) {
      console.log(`- **Best candidate:** Iteration ${formatMarkdownField(s.best_iteration)}`);
    }
  }
  console.log(`\n## Artifacts`);
  console.log(`- State: ${formatMarkdownField(state.artifact_paths?.state || ".autoresearch/state.json")}`);
  console.log(`- Results: ${formatMarkdownField(state.artifact_paths?.results || "autoresearch-results.tsv")}`);
  if (grouped.repo) console.log(`- Repository: ${formatMarkdownField(grouped.repo as string)}`);
  if (state.draft_pool && state.draft_pool.active_drafts) {
    const failedBranches = state.draft_pool.active_drafts.filter((d: { status: string }) => d.status === "discarded");
    if (failedBranches.length > 0) {
      console.log(`\n## Failed Branches`);
      for (const branch of failedBranches.slice(0, 5)) {
        console.log(`- Branch ${formatMarkdownField(branch.branch_id)}: iteration ${formatMarkdownField(String(branch.iteration))} (parent: ${formatMarkdownField(String(branch.parent_iteration))}) \u2014 ${formatMarkdownField(branch.metric_value ?? "no metric")}`);
      }
      if (failedBranches.length > 5) {
        console.log(`  ... and ${formatMarkdownField(String(failedBranches.length - 5))} more failed branches`);
      }
    }
  }
  if (state.flags.needs_human) {
    console.log(`\n## Blockers`);
    console.log(`- Human input required: ${formatMarkdownField(state.last_iteration?.change_summary ?? "awaiting user decision")}`);
    if (state.last_iteration?.note) {
      console.log(`- Details: ${formatMarkdownField(state.last_iteration.note.substring(0, 100))}${state.last_iteration.note.length > 100 ? "..." : ""}`);
    }
  }
  console.log(`\n## Next Actions`);
  if (state.status === "running") {
    if (state.flags.needs_human) console.log("- Awaiting human input");
    else if (state.flags.stop_requested) console.log("- Stop requested, will complete current iteration");
    else console.log("- Continue with next iteration");
  } else if (state.status === "completed") {
    console.log("- Run completed successfully");
  } else if (state.status === "stopped" || state.status === "stopping") {
    console.log("- Run stopped; use 'autoresearch resume' to continue");
  } else {
    console.log("- Initialize a new run with 'autoresearch init'");
  }
  if (results.length > 0) {
    console.log(`\n## Iterations`);
    for (const r of results) {
      const cols = r.split("\t");
      if (cols.length >= 4) {
        const decision = tsvField(resultHeaders, cols, "decision", 2);
        const metricValue = tsvField(resultHeaders, cols, "metric_value", 3);
        const changeSummary = tsvField(resultHeaders, cols, "change_summary", 8);
        console.log(`- ${formatMarkdownField(cols[1])}: ${formatMarkdownField(decision)} (${formatMarkdownField(metricValue)}) \u2014 ${formatMarkdownField(changeSummary).substring(0, 60)}`);
      }
    }
  }
  return 0;
}

/* ── suggest ── */
export async function handleSuggest(grouped: CommandGroup, useJson: boolean): Promise<number> {
  const evidenceGated = grouped.evidence === "true";
  if (evidenceGated) {
    const { generateIssueCandidate } = await import("./evidence.js");
    const candidate = generateIssueCandidate(
      grouped.repo as string | undefined,
      grouped.goal as string | undefined,
      grouped.metric as string | undefined,
      grouped.verify as string | undefined,
      grouped["score-history-path"] as string | undefined,
    );
    if (!candidate) {
      if (useJson) {
        printJsonEnvelope("suggest", { candidates: [], reason: "insufficient_evidence" });
      } else {
        console.log("No evidence-gated issue candidates found.");
      }
      return 0;
    }
    if (useJson) {
      printJsonEnvelope("suggest", { candidates: [candidate], evidence_gated: true });
    } else {
      console.log(`Evidence-Gated Issue Candidate:`);
      console.log(`  Title:   ${candidate.title}`);
      console.log(`  Goal:    ${candidate.goal}`);
      console.log(`  Metric:  ${candidate.metric}`);
      console.log(`  Evidence: ${candidate.evidence.total_discards} discards in ${candidate.evidence.total_runs} cluster(s)`);
      console.log(`  Suggested command: ${candidate.suggest_command}`);
    }
    return 0;
  }
  const memoryPath = resolvePath(
    grouped.repo as string | undefined,
    grouped["memory-path"] as string | undefined,
    MEMORY_DEFAULT,
  );
  if (!existsSync(memoryPath)) {
    console.log("No memory file found.");
    return 0;
  }
  const memory = readFileSync(memoryPath, "utf-8");
  const patterns = memory.match(/^### Pattern: [^\n]+/gm) ?? [];
  const suggestions = patterns.map(parseMemoryPatternHeading);
  if (useJson) {
    printJsonEnvelope("suggest", { patterns_found: suggestions.length, suggestions });
    return 0;
  }
  console.log("Memory Patterns \u2014 candidate next goals:");
  for (const suggestion of suggestions) {
    console.log(`  \u2192 ${formatDisplayValue(suggestion)}`);
  }
  console.log(`\n${suggestions.length} patterns available.`);
  return 0;
}

/* ── export ── */
export async function handleExport(grouped: CommandGroup): Promise<number> {
  const resultsPath = resolvePath(
    grouped.repo as string | undefined,
    grouped["results-path"] as string | undefined,
    RESULTS_DEFAULT,
  );
  const statePath = resolvePath(
    grouped.repo as string | undefined,
    grouped["state-path"] as string | undefined,
    STATE_DEFAULT,
  );
  const format = grouped.format as string || "json";
  if (!existsSync(resultsPath) || !existsSync(statePath)) {
    console.error("No run data found.");
    return 1;
  }
  const results = readFileSync(resultsPath, "utf-8");
  const state = JSON.parse(readFileSync(statePath, "utf-8"));
  const lines = results.trim().split("\n");
  const headers = lines[0].split("\t");
  const records = lines.slice(1).filter(Boolean).map((r: string) => {
    const cols = r.split("\t");
    const obj: Record<string, string> = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]!] = cols[i] ?? "";
    return obj;
  });
  const exportData = {
    exported_at: new Date().toISOString(), state,
    iterations: records,
    summary: { total: records.length, kept: records.filter((r: Record<string, string>) => r.decision === "keep").length, discarded: records.filter((r: Record<string, string>) => r.decision === "discard").length },
  };
  if (format === "json") {
    printJsonEnvelope("export", exportData);
  } else if (format === "md" || format === "markdown") {
    console.log(`# Auto Research Export`);
    console.log(`\n**Run:** ${escapeMarkdownInline(exportData.state.run_id) || "\u2014"}`);
    console.log(`**Goal:** ${escapeMarkdownInline(exportData.state.goal) || "\u2014"}`);
    console.log(`**Exported:** ${escapeMarkdownInline(exportData.exported_at)}`);
    console.log(`\n## Summary`);
    console.log(`- Total iterations: ${exportData.summary.total}`);
    console.log(`- Kept: ${exportData.summary.kept}`);
    console.log(`- Discarded: ${exportData.summary.discarded}`);
    console.log(`\n## Iterations`);
    console.log(`| # | Decision | Metric | Summary |`);
    console.log(`|---|----------|--------|---------|`);
    for (const r of records) {
      console.log(`| ${escapeMarkdownTableCell(r.iteration)} | ${escapeMarkdownTableCell(r.decision)} | ${escapeMarkdownTableCell(r.metric_value)} | ${escapeMarkdownTableCell(r.change_summary?.substring(0, 50))} |`);
    }
  } else {
    console.error(`Unknown format: ${format}`);
    return 1;
  }
  return 0;
}

/* ── completion ── */
export async function handleCompletion(grouped: CommandGroup): Promise<number> {
  const shell = grouped.shell as string || "bash";
  const commands = ["init", "goal", "wizard", "status", "explain", "history", "config", "summary", "suggest", "launch", "complete", "stop", "resume", "record", "doctor", "pack", "export", "completion"];
  const options = ["--repo", "--goal", "--metric", "--direction", "--verify", "--guard", "--mode", "--scope", "--iterations", "--duration", "--num-drafts", "--branch-policy", "--json", "--results-path", "--state-path", "--fresh-start", "--memory-path", "--format", "--shell"];
  if (shell === "bash" || shell === "zsh") {
    console.log(`# Completion for ${shell}`);
    console.log(`_autoresearch() {`);
    console.log(`  local cur="\${COMP_WORDS[COMP_CWORD]}"`);
    console.log(`  local cmds="${commands.join(" ")}"`);
    console.log(`  local opts="${options.join(" ")}"`);
    console.log(`  if [ $COMP_CWORD -eq 1 ]; then`);
    console.log(`    COMPREPLY=($(compgen -W "$cmds" -- "$cur"))`);
    console.log(`  else`);
    console.log(`    COMPREPLY=($(compgen -W "$opts" -- "$cur"))`);
    console.log(`  fi`);
    console.log(`}; complete -F _autoresearch autoresearch`);
  } else if (shell === "fish") {
    console.log(`# Completion for fish`);
    for (const cmd of commands) console.log(`complete -c autoresearch -n '__fish_use_subcommand' -a '${cmd}'`);
    for (const opt of options) console.log(`complete -c autoresearch -n '__fish_seen_subcommand_from ${commands.join(" ")}' -l ${opt.slice(2)}`);
  } else {
    console.error(`Unknown shell: ${shell}`);
    return 1;
  }
  return 0;
}

/* ── launch ── */
export async function handleLaunch(grouped: CommandGroup, dryRun: boolean): Promise<number> {
  const config = {
    goal: grouped.goal as string,
    metric: (grouped.metric || grouped["outcome-metric"]) as string,
    direction: (grouped.direction || grouped["outcome-direction"]) as string || "lower",
    verify: grouped.verify as string,
    mode: "background",
    scope: grouped.scope as string | undefined,
    guard: grouped.guard as string | undefined,
    scorer: grouped.scorer as string | undefined,
    iterations: parsePositiveInt(grouped.iterations as string | undefined, "iterations"),
    max_no_progress: parsePositiveInt(grouped["max-no-progress"] as string | undefined, "max-no-progress"),
    max_debug_depth: parsePositiveInt(grouped["max-debug-depth"] as string | undefined, "max_debug_depth"),
    branch_failure_budget: parsePositiveInt(grouped["branch-failure-budget"] as string | undefined, "branch_failure_budget"),
    duration: grouped.duration as string | undefined,
    memory_path: grouped["memory-path"] as string | undefined,
    required_keep_labels: grouped["required-keep-labels"] as string[] | undefined,
    required_stop_labels: grouped["required-stop-labels"] as string[] | undefined,
    run_tag: grouped["run-tag"] as string | undefined,
    stop_condition: grouped["stop-condition"] as string | undefined,
    baseline: grouped.baseline as string | undefined,
    num_drafts: parsePositiveInt(grouped["num-drafts"] as string | undefined, "num_drafts", { max: MAX_DRAFTS }) ?? 1,
    branch_selection_policy: normalizeBranchPolicy(grouped["branch-policy"] as string | undefined),
    branch_policy_overrides: parseBranchPolicyOverrides(grouped["branch-policy-overrides"] as string | undefined),
    outcome_metric: grouped["outcome-metric"] as string | undefined,
    outcome_direction: grouped["outcome-direction"] as string | undefined,
    instrument_metric: grouped["instrument-metric"] as string | undefined,
    instrument_direction: grouped["instrument-direction"] as string | undefined,
  };
  const launchPath = resolvePath(
    grouped.repo as string | undefined,
    grouped["launch-path"] as string | undefined,
    LAUNCH_DEFAULT,
  );
  if (dryRun) {
    console.log("[dry-run] Would launch background run");
    console.log(JSON.stringify({ ...config, launch_path: launchPath }, null, 2));
    return 0;
  }
  const { initializeRun } = await import("./run-manager.js");
  const state = await initializeRun(
    grouped.repo as string | undefined,
    grouped["results-path"] as string | undefined,
    grouped["state-path"] as string | undefined,
    config,
    grouped["fresh-start"] === "true",
  );
  writeFileSync(launchPath, JSON.stringify({ run_id: state.run_id, goal: state.goal, mode: "background" }, null, 2) + "\n", "utf-8");
  printJsonEnvelope("launch", { status: "launched", run_id: state.run_id, launch_path: launchPath });
  return 0;
}

/* ── complete ── */
export async function handleComplete(grouped: CommandGroup, dryRun: boolean): Promise<number> {
  if (dryRun) { console.log("[dry-run] Would mark run complete"); return 0; }
  
  const state = await completeRun(grouped.repo as string | undefined, grouped["state-path"] as string | undefined);
  printJsonEnvelope("complete", { status: "completed", run_id: state.run_id });
  return 0;
}

/* ── stop ── */
export async function handleStop(grouped: CommandGroup, dryRun: boolean): Promise<number> {
  if (dryRun) { console.log("[dry-run] Would request stop"); return 0; }
  
  const state = await setStopRequested(grouped.repo as string | undefined, grouped["state-path"] as string | undefined);
  printJsonEnvelope("stop", { status: "stop_requested", run_id: state.run_id });
  return 0;
}

/* ── resume ── */
export async function handleResume(grouped: CommandGroup, dryRun: boolean): Promise<number> {
  if (dryRun) { console.log("[dry-run] Would resume background run"); return 0; }
  
  const state = await resumeBackgroundRun(grouped.repo as string | undefined, grouped["state-path"] as string | undefined);
  printJsonEnvelope("resume", { status: "resumed", run_id: state.run_id });
  return 0;
}

/* ── record ── */
export async function handleRecord(grouped: CommandGroup, dryRun: boolean): Promise<number> {
  const vs = grouped["verify-status"] as string || "pass";
  const gs = grouped["guard-status"] as string || "skip";
  const scorerStatus = normalizeScorerStatus(grouped["scorer-status"] as string | undefined);
  const iteration = parsePositiveInt(grouped.iteration as string | undefined, "iteration");
  let scoreComponents: Record<string, number> | undefined;
  if (grouped["score-components"]) {
    try {
      const parsed = JSON.parse(grouped["score-components"] as string);
      if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new Error('score-components must be a JSON object');
      }
      scoreComponents = parsed as Record<string, number>;
    } catch (e) {
      console.error(`Invalid --score-components: ${(e as Error).message}`);
      return 1;
    }
  }
  if (dryRun) {
    console.log("[dry-run] Would record result");
    console.log(JSON.stringify({
      decision: grouped.decision, metric_value: grouped["metric-value"],
      scorer_status: scorerStatus, verify_status: normalizeResultStatus(vs, "verify_status"),
      guard_status: normalizeResultStatus(gs, "guard_status"),
      change_summary: grouped["change-summary"], iteration, score_components: scoreComponents,
    }, null, 2));
    return 0;
  }
  
  const lineage: Record<string, unknown> = {};
  const stage = grouped.stage as string | undefined;
  if (stage) lineage.stage = stage;
  const selectedAction = grouped["selected-action"] as string | undefined;
  if (selectedAction) lineage.selected_action = selectedAction;
  const state = await appendIteration(
    grouped.repo as string | undefined,
    grouped["results-path"] as string | undefined,
    grouped["state-path"] as string | undefined,
    grouped.decision as string,
    grouped["metric-value"] as string | undefined,
    grouped["instrument-value"] as string | undefined,
    normalizeResultStatus(vs, "verify_status"),
    normalizeResultStatus(gs, "guard_status"),
    grouped.hypothesis as string | undefined,
    grouped["change-summary"] as string,
    grouped.labels ? (Array.isArray(grouped.labels) ? grouped.labels : [grouped.labels]) : undefined,
    grouped.note as string | undefined,
    iteration, undefined, scorerStatus, scoreComponents,
    Object.keys(lineage).length > 0 ? lineage : undefined,
  );
  printJsonEnvelope("record", state);
  return 0;
}

/* ── digest ── */
export async function handleDigest(grouped: CommandGroup, useJson: boolean, dryRun: boolean): Promise<number> {
  if (dryRun) { console.log("[dry-run] Would generate digest"); return 0; }
  
  const digest = await buildRunDigest(
    grouped.repo as string | undefined,
    grouped["results-path"] as string | undefined,
    grouped["state-path"] as string | undefined,
  );
  if (useJson) {
    printJsonEnvelope("digest", digest);
    return 0;
  }
  console.log(`# Auto Research Digest`);
  console.log(`\n**Run ID:** ${formatMarkdownField(digest.run_id || "\u2014")}`);
  console.log(`**Status:** ${sanitizeForTerminal(digest.status || "\u2014")}`);
  console.log(`**Mode:** ${formatMarkdownField(digest.mode || "\u2014")}`);
  console.log(`**Goal:** ${formatMarkdownField(digest.goal || "\u2014")}`);
  if (digest.metric) {
    const m = digest.metric;
    console.log(`**Metric:** ${sanitizeForTerminal(m.name)} (${sanitizeForTerminal(m.direction)})`);
    console.log(`  Best: ${formatMarkdownField(m.best || "\u2014")} | Latest: ${formatMarkdownField(m.latest || "\u2014")}`);
  }
  if (digest.stats) {
    const s = digest.stats;
    console.log(`\n## Stats`);
    console.log(`- Iterations: ${formatMarkdownField(s.total_iterations || "\u2014")}`);
    console.log(`- Kept: ${formatMarkdownField(s.kept || "\u2014")}`);
    console.log(`- Discarded: ${formatMarkdownField(s.discarded || "\u2014")}`);
    console.log(`- Needs human: ${formatMarkdownField(s.needs_human || "\u2014")}`);
  }
  if (digest.last_iteration) {
    const li = digest.last_iteration;
    console.log(`\n## Last Iteration`);
    console.log(`- #${formatMarkdownField(li.iteration || "\u2014")}: ${formatMarkdownField(li.decision || "\u2014")} (${formatMarkdownField(li.metric_value || "\u2014")})`);
    if (li.change_summary) console.log(`- Change: ${formatMarkdownField(li.change_summary.substring(0, 100))}${li.change_summary.length > 100 ? "..." : ""}`);
  }
  console.log(`\n## Next Action`);
  console.log(`${sanitizeForTerminal(digest.next_action || "No specific next action recommended")}`);
  if (digest.blockers && digest.blockers.length > 0) {
    console.log(`\n## Blockers`);
    for (const blocker of digest.blockers) console.log(`- ${formatMarkdownField(blocker)}`);
  } else {
    console.log(`\n## Blockers\nNone identified`);
  }
  if (digest.flags && Object.keys(digest.flags).length > 0) {
    console.log(`\n## Flags`);
    for (const [key, value] of Object.entries(digest.flags)) console.log(`- ${formatMarkdownField(key)}: ${formatMarkdownField(value)}`);
  }
  return 0;
}

/* ── doctor ── */
export async function handleDoctor(grouped: CommandGroup, useJson: boolean): Promise<number> {
  const base = resolveRepo(grouped.repo as string | undefined);
  const checks: Array<{ name: string; ok: boolean; detail?: string }> = [];
  const cmdDir = resolve(base, "commands");
  const skillsDir = resolve(base, "skills/autoresearch");
  const hooksDir = resolve(base, "hooks");
  const cmdFiles = existsSync(cmdDir) ? readdirSync(cmdDir).filter((f: string) => f.endsWith(".md")) : [];
  const skillFiles = existsSync(skillsDir) ? readdirSync(skillsDir) : [];
  const hookFiles = existsSync(hooksDir) ? readdirSync(hooksDir).filter((f: string) => f.endsWith(".sh")) : [];
  checks.push({ name: "commands", ok: cmdFiles.length > 0, detail: `${cmdFiles.length} command files` });
  checks.push({ name: "skills", ok: skillFiles.length > 0, detail: `${skillFiles.length} skill files` });
  checks.push({ name: "hooks", ok: hookFiles.length > 0, detail: `${hookFiles.length} hook scripts` });
  checks.push({ name: "dist", ok: existsSync(resolve(base, "dist/cli.js")), detail: "dist/cli.js" });
  checks.push({ name: "plugin", ok: existsSync(resolve(base, ".opencode-plugin/plugin.json")), detail: "plugin manifest" });
  checks.push({ name: "VERSION", ok: existsSync(resolve(base, "VERSION")), detail: "version marker" });
  const globalPrefix = getGlobalNpmPrefix();
  const installedPath = getInstalledPackagePath(PACKAGE_NAME);
  const installedInfo = installedPath ? getInstalledPackageInfo(PACKAGE_NAME) : null;
  const updateCache = readUpdateCache();
  const updateStatus = {
    cache_exists: updateCache !== null, last_check: updateCache?.last_check || null,
    current_version: updateCache?.current_version || null, latest_version: updateCache?.latest_version || null,
    update_available: updateCache?.update_available || false,
    update_disabled: process.env.AUTORESEARCH_NO_UPDATE === "1",
    skipped: shouldSkipUpdateCheck(process.argv.slice(2)).skip,
    skip_reason: shouldSkipUpdateCheck(process.argv.slice(2)).reason,
  };
  if (useJson) {
    const { getWhatsNew } = await import("./whats-new.js");
    const wn = getWhatsNew(base);
    printJsonEnvelope("doctor", {
      version: VERSION, skill_name: SKILL_NAME, runtime: `Node.js ${process.version}`,
      source: { package_name: PACKAGE_NAME, global_path: installedPath || null, global_prefix: globalPrefix || null, installed_version: installedInfo?.version || null },
      update: updateStatus, checks, checks_passed: checks.filter((c) => !c.ok).length === 0,
      whats_new: wn ? { features: wn.features, fixes: wn.fixes } : null,
    });
    return 0;
  }
  console.log(`${SKILL_NAME} ${VERSION} (${PACKAGE_NAME})`);
  console.log(`Runtime: Node.js ${process.version}\n`);
  console.log("Source:");
  console.log(`  Package:    ${PACKAGE_NAME}`);
  if (installedPath) {
    console.log(`  Global:     ${installedPath}`);
    if (globalPrefix) console.log(`  Prefix:     ${globalPrefix}`);
  } else {
    console.log("  Global:     not found via npm -g");
  }
  console.log("\nUpdate:");
  if (updateStatus.skipped) console.log(`  Skipped:    yes (${updateStatus.skip_reason})`);
  else if (updateCache) {
    console.log(`  Last check: ${updateCache.last_check}`);
    console.log(`  Current:    ${updateCache.current_version}`);
    console.log(`  Latest:     ${updateCache.latest_version}`);
    console.log(`  Available:  ${updateCache.update_available ? "yes" : "no"}`);
  } else {
    console.log("  Cache:      no update check recorded");
  }
  console.log("\nInstallation Checks:");
  let maxNameLen = 0;
  for (const c of checks) maxNameLen = Math.max(maxNameLen, c.name.length);
  for (const c of checks) {
    console.log(`  ${c.ok ? "\u2713" : "\u2717"} ${c.name.padEnd(maxNameLen + 2)}${c.detail ?? (c.ok ? "present" : "missing")}`);
  }
  const failed = checks.filter((c) => !c.ok).length;
  if (failed > 0) {
    console.error(`\n${failed} check(s) failed.`);
    return 1;
  }
  console.log(`\nAll ${checks.length} checks passed.`);
  if (grouped["whats-new"] === "true") {
    const { getWhatsNew, formatWhatsNew } = await import("./whats-new.js");
    const wn2 = getWhatsNew(base);
    if (wn2) console.log("\n" + formatWhatsNew(wn2));
  }
  return 0;
}

/* ── goal ── */
export async function handleGoal(
  grouped: CommandGroup, cmdArgs: string[], useJson: boolean, _verbose: boolean, _dryRun: boolean,
): Promise<number> {
  const rawSubCmd = cmdArgs[0];
  const subCmd = rawSubCmd && !rawSubCmd.startsWith("-") ? rawSubCmd : undefined;
  if ((!subCmd && cmdArgs.length === 0) || subCmd === "help" || (subCmd && HELP_FLAGS.includes(subCmd))) {
    console.error("Usage: autoresearch goal <subcommand> [options]");
    console.error("Subcommands: init\tCreate a GOAL.md goal definition file");
    console.error("Options (goal init):");
    console.error("  --goal, --metric, --direction, --verify, --guard, --mode");
    console.error("  --scope, --iterations, --duration, --template");
    console.error("  --goal-path, --dry-run, --json");
    return 0;
  }
  if (!subCmd) {
    const goalPath = resolvePath(
      grouped.repo as string | undefined,
      grouped["goal-path"] as string | undefined,
      GOAL_DEFAULT,
    );
    if (!existsSync(goalPath)) { console.log("No goal document found."); return 0; }
    const doc = readGoalDoc(goalPath);
    if (useJson) { printJsonEnvelope("goal", doc); return 0; }
    console.log(`Goal:             ${formatDisplayValue(doc.goal)}`);
    console.log(`Metric:           ${formatDisplayValue(doc.metric)} (${formatDisplayValue(doc.direction)})`);
    console.log(`Verify:           ${formatDisplayValue(doc.verify)}`);
    if (doc.guard) console.log(`Guard:            ${formatDisplayValue(doc.guard)}`);
    if (doc.file_map) console.log(`File map:         ${formatDisplayValue(doc.file_map)}`);
    if (doc.constraints) console.log(`Constraints:      ${formatDisplayValue(doc.constraints)}`);
    if (doc.stop_conditions) console.log(`Stop conditions:  ${formatDisplayValue(doc.stop_conditions)}`);
    return 0;
  }
  if (subCmd !== "init") {
    console.error(`Unknown goal subcommand: ${subCmd}`);
    return 1;
  }
  const goalArgs = cmdArgs.slice(1);
  const goalParsed = parseArgs(goalArgs);
  const goalGrouped: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(goalParsed)) {
    goalGrouped[k] = v;
  }
  const useGoalJson = goalGrouped.json === "true";
  const isGoalDryRun = goalGrouped["dry-run"] === "true";
  const { GOAL_TEMPLATES, getGoalTemplate, buildGoalDocument, buildGoalInitResult } = await import("./goal-init.js");
  const templateId = (goalGrouped.template as string | undefined) ?? "custom";
  if (!GOAL_TEMPLATES.find((t: { id: string }) => t.id === templateId)) {
    console.error(`Unknown template: ${templateId}. Valid: ${GOAL_TEMPLATES.map((t: { id: string }) => t.id).join(", ")}`);
    return 1;
  }
  const template = getGoalTemplate(templateId);
  const templateDefaults = template?.defaults ?? {};
  let config: Record<string, unknown> = {
    goal: goalGrouped.goal ?? templateDefaults.goal,
    metric: goalGrouped.metric ?? templateDefaults.metric,
    direction: goalGrouped.direction ?? templateDefaults.direction,
    verify: goalGrouped.verify ?? templateDefaults.verify,
    guard: goalGrouped.guard ?? templateDefaults.guard,
    mode: goalGrouped.mode ?? templateDefaults.mode,
    scope: goalGrouped.scope ?? templateDefaults.scope,
    iterations: goalGrouped.iterations ? parsePositiveInt(goalGrouped.iterations as string, "iterations") : templateDefaults.iterations,
    duration: goalGrouped.duration ?? templateDefaults.duration,
    stop_condition: goalGrouped["stop-condition"] ?? templateDefaults.stop_condition,
    rollback_strategy: goalGrouped["rollback-strategy"] ?? templateDefaults.rollback_strategy,
    template: templateId,
  };
  const isTTY = process.stdin.isTTY === true;
  const hasRequiredFlags = Boolean(config.goal && config.metric && config.verify);
  if (!hasRequiredFlags && !isTTY) {
    let stdinData = "";
    try {
      stdinData = await new Promise<string>((resolve, reject) => {
        const chunks: Buffer[] = [];
        process.stdin.on("data", (chunk) => chunks.push(chunk as Buffer));
        process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
        process.stdin.on("error", reject);
        setTimeout(() => resolve(""), 200);
      });
      stdinData = stdinData.trim();
    } catch { stdinData = ""; }
    if (stdinData) {
      try {
        config = { ...config, ...JSON.parse(stdinData) as Record<string, unknown>, template: templateId };
      } catch {
        console.error("Failed to parse stdin as JSON.");
        return 1;
      }
    }
  }
  if (!config.goal && isTTY) {
    const readline = await import("readline");
    const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
    const ask = (prompt: string, defaultVal?: string): Promise<string> =>
      new Promise((resolve) => {
        rl.question(`${prompt}${defaultVal ? ` [${defaultVal}]` : ""}: `, (answer: string) => {
          resolve(answer.trim() || defaultVal || "");
        });
      });
    process.stderr.write("\nAutoresearch Goal Init \u2014 Interactive Wizard\n\n");
    if (!config.goal) config.goal = await ask("Goal (what outcome should this run optimize?)", config.goal as string | undefined);
    if (!config.metric) config.metric = await ask("Metric name", (config.metric as string | undefined) ?? "primary_metric");
    if (!config.direction) config.direction = await ask("Direction (lower/higher)", (config.direction as string | undefined) ?? "lower");
    if (!config.verify) config.verify = await ask("Verify command", config.verify as string | undefined);
    if (!config.guard) { const guard = await ask("Guard command (optional)"); if (guard) config.guard = guard; }
    if (!config.scope) config.scope = await ask("Scope", (config.scope as string | undefined) ?? "current repository");
    if (!config.mode) config.mode = await ask("Mode (foreground/background)", (config.mode as string | undefined) ?? "foreground");
    rl.close();
  }
  const goalPath = resolvePath(
    goalGrouped.repo as string | undefined,
    goalGrouped["goal-path"] as string | undefined,
    GOAL_DEFAULT,
  );
  const document = buildGoalDocument(config as Parameters<typeof buildGoalDocument>[0]);
  const result = buildGoalInitResult(goalPath, config as Parameters<typeof buildGoalDocument>[0], !hasRequiredFlags && isTTY);
  if (isGoalDryRun) {
    if (useGoalJson) { printJsonEnvelope("goal", { ...result, dry_run: true }); }
    else { console.log("[dry-run] Would write goal document to: " + goalPath + "\n"); console.log(document); }
    return 0;
  }
  atomicWriteTextInRepo(goalGrouped.repo as string | undefined, goalPath, document);
  if (useGoalJson) { printJsonEnvelope("goal", result); }
  else {
    console.log(`\u2713 Goal definition written to ${goalPath}`);
    console.log(`  Goal:    ${result.goal ?? "(unset)"}`);
    console.log(`  Metric:  ${result.metric ?? "(unset)"} (${result.direction})`);
    console.log(`  Verify:  ${result.verify ?? "(unset)"}`);
    console.log(`  Mode:    ${result.mode}`);
    if (result.template !== "custom") console.log(`  Template: ${result.template}`);
  }
  return 0;
}

/* ── queue ── */
export async function handleQueue(grouped: CommandGroup, cmdArgs: string[], useJson: boolean, _dryRun: boolean): Promise<number> {
  const subCmd = cmdArgs[0] || "list";
  if (subCmd === "help") {
    console.error("Usage: autoresearch queue <subcommand> [options]");
    console.error("Subcommands: list, enqueue, clean");
    return 0;
  }
  if (subCmd === "enqueue") {
    if (!grouped.goal || !grouped.metric || !grouped.verify) {
      console.error("--goal, --metric, and --verify are required for enqueue");
      return 1;
    }
    const { enqueueTasks } = await import("./task-queue.js");
    const tasks = await enqueueTasks(
      grouped.repo as string | undefined,
      [{ goal: grouped.goal as string, metric: grouped.metric as string, verify: grouped.verify as string }],
    );
    if (useJson) { printJson({ enqueued: tasks }); }
    else { for (const t of tasks) console.log(`Enqueued: ${t.id} - ${t.goal}`); }
    return 0;
  }
  if (subCmd === "clean") {
    const { listTasks, writeManifest, resolveQueuePath } = await import("./task-queue.js");
    const queuePath = resolveQueuePath(grouped.repo as string | undefined);
    const manifest = await listTasks(grouped.repo as string | undefined);
    const before = manifest.tasks.length;
    manifest.tasks = manifest.tasks.filter((t: { status: string }) => t.status === "pending" || t.status === "leased");
    manifest.updated_at = new Date().toISOString();
    await writeManifest(queuePath, manifest, grouped.repo as string | undefined);
    const removed = before - manifest.tasks.length;
    if (useJson) { printJson({ removed }); }
    else { console.log(`Cleaned ${removed} completed/failed tasks. ${manifest.tasks.length} remain.`); }
    return 0;
  }
  const { listTasks } = await import("./task-queue.js");
  const manifest = await listTasks(grouped.repo as string | undefined);
  if (useJson) { printJson(manifest); }
  else {
    if (manifest.tasks.length === 0) { console.log("No tasks in queue."); }
    else {
      console.log(`Task Queue (${manifest.tasks.length} tasks):`);
      for (const task of manifest.tasks) {
        const icon = task.status === "completed" ? "v" : task.status === "failed" ? "x" : task.status === "leased" ? ">" : "*";
        console.log(`  ${icon} ${task.id}  [${task.status}]  ${task.goal}`);
      }
    }
  }
  return 0;
}

/* ── pack ── */
export async function handlePack(grouped: CommandGroup, cmdArgs: string[], useJson: boolean): Promise<number> {
  const subCmd = cmdArgs[0] || "help";
  if (subCmd === "help" || (subCmd !== "export" && subCmd !== "list" && subCmd !== "inspect")) {
    console.error("Usage: autoresearch pack <subcommand> [options]");
    console.error("Subcommands: export, list, inspect");
    return 0;
  }
  if (subCmd === "export") {
    const { exportPack } = await import("./strategy-pack.js");
    const result = exportPack(grouped.repo as string | undefined, grouped["state-path"] as string | undefined);
    if (!result) { console.error("No run state found."); return 1; }
    if (useJson) { printJsonEnvelope("pack", { exported: result.path, pack: result.pack }); }
    else {
      console.log(`Strategy pack exported: ${result.path}`);
      console.log(`  Goal:    ${result.pack.goal}`);
      console.log(`  Metric:  ${result.pack.metric}`);
      console.log(`  Success: ${result.pack.evidence.success_rate}`);
    }
    return 0;
  }
  if (subCmd === "list") {
    const { listPacks } = await import("./strategy-pack.js");
    const packs = listPacks(grouped.repo as string | undefined);
    if (useJson) { printJsonEnvelope("pack", { packs }); }
    else { console.log(packs.length === 0 ? "No strategy packs found." : `Strategy Packs (${packs.length}):`); for (const p of packs) console.log(`  ${p.name}`); }
    return 0;
  }
  if (subCmd === "inspect") {
    const name = cmdArgs[1];
    if (!name) { console.error("Usage: autoresearch pack inspect <name>"); return 1; }
    const { readPack } = await import("./strategy-pack.js");
    const content = readPack(grouped.repo as string | undefined, name);
    if (!content) { console.error(`Pack not found: ${name}`); return 1; }
    console.log(content);
    return 0;
  }
  return 0;
}

/* ── leaderboard ── */
export async function handleLeaderboard(grouped: CommandGroup, useJson: boolean): Promise<number> {
  const { generateLeaderboard, formatLeaderboardMarkdown, formatLeaderboardText } = await import("./leaderboard.js");
  const repo = resolveRepo(grouped.repo as string | undefined);
  const leaderboard = generateLeaderboard(repo);
  if (useJson) { printJson(leaderboard); return 0; }
  if (leaderboard.entries.length === 0) { console.log("No runs found."); return 0; }
  if (grouped.format === "markdown") { console.log(formatLeaderboardMarkdown(leaderboard)); }
  else { console.log(formatLeaderboardText(leaderboard)); }
  return 0;
}

/* ── worker ── */
export async function handleWorker(grouped: CommandGroup, useJson: boolean): Promise<number> {
  const once = grouped.once === "true";
  if (!once) {
    console.error("worker requires --once flag");
    return 1;
  }
  const { workerOnce } = await import("./worker.js");
  const result = workerOnce(
    grouped.repo as string | undefined,
    grouped["state-path"] as string | undefined,
    grouped["results-path"] as string | undefined,
  );
  if (useJson) { printJsonEnvelope("worker", result); }
  else {
    if (result.ready) {
      console.log(`\u2713 Ready for iteration ${result.iteration}`);
      console.log(`  Run ID:  ${result.run_id}`);
      console.log(`  Status:  ${result.status}`);
      console.log(`  Goal:    ${result.goal}`);
    } else {
      console.log(`\u2717 Not ready: ${result.reason || "unknown"}`);
      console.log(`  Run ID: ${result.run_id}`);
    }
  }
  return result.ready ? 0 : 1;
}
