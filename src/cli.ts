#!/usr/bin/env node
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, readdirSync } from "fs";
import { resolve } from "path";
import { execSync } from "child_process";
import { MAX_DRAFTS } from "./constants.js";
import { printJson, resolveRepo, parseRunState, parsePositiveInt, sanitizeForTerminal, getInstalledPackagePath, getInstalledPackageInfo, readUpdateCache, getGlobalNpmPrefix, readGoalDoc, atomicWriteTextInRepo } from "./helpers.js";


const VERSION_FLAGS = ["--version", "-v"];
const HELP_FLAGS = ["--help", "-h", "help"];
const BRANCH_POLICIES = ["best", "roulette", "diverse"] as const;
type BranchPolicy = typeof BRANCH_POLICIES[number];

const usage = (): void => {
  console.error("Usage: autoresearch <command> [options]");
  console.error("");
  console.error("Commands:");
  console.error("  init       Initialize a run");
  console.error("  goal       Manage goal definitions (subcommands: init)");
  console.error("  wizard     Generate a setup summary");
  console.error("  status     Print run status");
  console.error("  explain    Human-readable run state");
  console.error("  goal       Show or validate the goal document");
  console.error("  history    Show recent iteration log");
  console.error("  scores     Show score trend history");
  console.error("  score      Run the configured scorer and show normalized output");
  console.error("  config     Show runtime configuration");
  console.error("  summary    Aggregate stats across runs");
  console.error("  suggest    Suggest next goal from memory");
  console.error("  launch     Launch a background run");
  console.error("  complete   Mark a run complete");
  console.error("  stop       Request a background run stop");
  console.error("  resume     Resume a background run");
  console.error("  record     Record an experiment result");
  console.error("  doctor     Verify package installation and version");
  console.error("  help       Show this help");
  console.error("");
  console.error("Options:");
  console.error("  --repo          Repository root (default: current directory)");
  console.error("  --goal          Desired run outcome");
  console.error("  --metric        Metric name to track (default outcome metric)");
  console.error("  --direction     lower or higher (for outcome metric)");
  console.error("  --outcome-metric    Primary metric for keep decisions");
  console.error("  --outcome-direction Direction for outcome metric");
  console.error("  --instrument-metric Measurement quality/risk metric (surfaced separately)");
  console.error("  --instrument-direction Direction for instrument metric");
  console.error("  --instrument-value  Recorded value for the instrument metric");
  console.error("  --scorer-status     ok, ok-low-score, or scorer-broken (default: ok)");
  console.error("  --verify        Mechanical verification command");
  console.error("  --guard         Guard command for regression catch");
  console.error("  --scorer        Scorer command (outputs JSON with score and max fields)");
  console.error("  --mode          foreground or background");
  console.error("  --scope         In-scope files or subsystem");
  console.error("  --iterations    Iteration cap");
  console.error("  --max-no-progress  Max consecutive discards before stop");
  console.error("  --duration      Wall-clock cap (e.g., 5h or 300m)");
  console.error(`  --num-drafts    Number of parallel drafts (default: 1, max: ${MAX_DRAFTS})`);
  console.error("  --branch-policy Branch selection policy: best, roulette, diverse");
  console.error("  --json          Output raw JSON (default: human-readable)");
  console.error("  --results-path  Custom results TSV path");
  console.error("  --state-path    Custom state JSON path");
  console.error("  --fresh-start   Archive previous artifacts before starting");
  console.error("  --goal-path     Output path for GOAL.md (used by goal init)");
  console.error("  --template      Goal template: performance, quality, coverage, custom (used by goal init)");
  console.error("");
  console.error("Flags:");
  console.error("  -h, --help      Show this help");
  console.error("  -v, --version   Show version");
  console.error("  --verbose       Enable verbose output");
  console.error("  --dry-run       Preview changes without executing");
  console.error("");
  console.error("Examples:");
  console.error("  autoresearch wizard --goal \"optimize response time\"");
  console.error("  autoresearch init --goal \"reduce errors\" --metric errors --direction lower --verify \"npm test\"");
  console.error("  autoresearch goal init --goal \"reduce errors\" --metric errors --direction lower --verify \"npm test\"");
  console.error("  autoresearch goal init --template performance");
  console.error("  autoresearch status");
  console.error("  autoresearch explain");
  console.error("  autoresearch history");
  console.error("  autoresearch score --scorer \"node score.js\"");
};

const parseArgs = (args: string[]): Record<string, string> => {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const key = args[i].slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith("--") && !args[i + 1].startsWith("-")) {
        result[key] = args[++i];
      } else {
        result[key] = "true";
      }
    } else if (args[i].startsWith("-") && args[i].length === 2 && args[i] !== "--") {
      const shortToLong: Record<string, string> = {
        r: "repo", g: "goal", m: "metric", d: "direction",
        v: "verify", n: "guard", o: "mode", s: "scope",
        i: "iterations", t: "duration",
        f: "num-drafts", b: "branch-policy",
        p: "max-no-progress",
      };
      const key = shortToLong[args[i][1]] ?? args[i].slice(1);
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        result[key] = args[++i];
      } else {
        result[key] = "true";
      }
    }
  }
  return result;
};

const tsvField = (headers: string[], cols: string[], field: string, legacyIndex: number): string => {
  const fieldIndex = headers.indexOf(field);
  if (fieldIndex >= 0) return cols[fieldIndex] ?? "";
  return cols[legacyIndex] ?? "";
};

const markdownInlineEscapes: Record<string, string> = {
  "\\": "\\\\",
  "`": "\\`",
  "*": "\\*",
  "_": "\\_",
  "{": "\\{",
  "}": "\\}",
  "[": "\\[",
  "]": "\\]",
  "(": "\\(",
  ")": "\\)",
  "#": "\\#",
  "+": "\\+",
  "-": "\\-",
  ".": "\\.",
  "!": "\\!",
  "|": "\\|",
};

const markdownHtmlEscapes: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
};

const escapeMarkdownInline = (value: unknown): string => {
  return sanitizeForTerminal(value ?? "")
    .replace(/[&<>"]/g, (char) => markdownHtmlEscapes[char]!)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[\\`*_{}\[\]()#+\-.!|]/g, (char) => markdownInlineEscapes[char]!);
};

const escapeMarkdownTableCell = (value: unknown): string => {
  const escaped = escapeMarkdownInline(value);
  return escaped.length > 0 ? escaped : "—";
};

const formatDisplayValue = (val: unknown): string => {
  if (val === undefined || val === null) return "—";
  return sanitizeForTerminal(val);
};

const parseMemoryPatternHeading = (heading: string): string => {
  const raw = heading.replace(/^### Pattern: /, "");
  const trimmed = raw.trimEnd();
  if (trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") return parsed;
    } catch {
      // Fall through to the raw heading text for backward compatibility.
    }
  }
  return trimmed;
};

const formatMetricValue = formatDisplayValue;

const formatTimestamp = (ts: string): string => {
  try {
    const d = new Date(ts);
    return d.toLocaleString();
  } catch {
    return ts;
  }
};

const readTailLines = (filePath: string, limit: number): string[] => {
  if (limit <= 0) return [];

  const fd = openSync(filePath, "r");
  try {
    const size = fstatSync(fd).size;
    if (size === 0) return [];

    const chunkSize = 64 * 1024;
    const lines: string[] = [];
    let position = size;
    let remainder = Buffer.alloc(0);

    while (position > 0 && lines.length < limit) {
      const bytesToRead = Math.min(chunkSize, position);
      position -= bytesToRead;

      const chunk = Buffer.alloc(bytesToRead);
      const bytesRead = readSync(fd, chunk, 0, bytesToRead, position);
      const data = Buffer.concat([chunk.subarray(0, bytesRead), remainder]);

      let end = data.length;
      for (let i = data.length - 1; i >= 0 && lines.length < limit; i -= 1) {
        if (data[i] === 0x0a) {
          const line = data.subarray(i + 1, end).toString("utf-8").trim();
          if (line.length > 0) lines.push(line);
          end = i;
        }
      }
      remainder = data.subarray(0, end);
    }

    if (lines.length < limit) {
      const line = remainder.toString("utf-8").trim();
      if (line.length > 0) lines.push(line);
    }

    return lines.reverse();
  } finally {
    closeSync(fd);
  }
};
const markdownEscapePattern = /([\\`*_{}[\]()#+\-.!|>])/g;
const terminalControlPattern = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g;
const controlCharacterPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

const sanitizeMarkdownText = (value: unknown): string => {
  if (value === undefined || value === null) return "—";
  return String(value)
    .replace(terminalControlPattern, "")
    .replace(controlCharacterPattern, "")
    .replace(/\r?\n|\r/g, " ")
    .replace(/\t/g, " ");
};

const formatMarkdownField = (value: unknown): string => {
  return sanitizeMarkdownText(value).replace(markdownEscapePattern, "\\$1");
};


const normalizeBranchPolicy = (value: string | undefined): BranchPolicy => {
  if (value == null || value === "") return "best";
  if ((BRANCH_POLICIES as readonly string[]).includes(value)) return value as BranchPolicy;
  throw new Error(`Invalid branch policy: ${value}. Expected one of: ${BRANCH_POLICIES.join(", ")}`);
};

const main = async (): Promise<number> => {
  const args = process.argv.slice(2);

  // Handle standalone flags
  if (args.length === 0) {
    usage();
    return 0;
  }

  const first = args[0];
  if (VERSION_FLAGS.includes(first)) {
    const { VERSION, PACKAGE_NAME, SKILL_NAME } = await import("./constants.js");
    console.log(`${SKILL_NAME} ${VERSION} (${PACKAGE_NAME})`);
    console.log("Runtime: Node.js " + process.version);
    return 0;
  }
  if (HELP_FLAGS.includes(first)) {
    usage();
    return 0;
  }

  const [cmd, ...cmdArgs] = args;
  const pargs = parseArgs(cmdArgs);
  const useJson = pargs.json === "true";
  const verbose = pargs.verbose === "true";
  const dryRun = pargs["dry-run"] === "true";

  const grouped: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries(pargs)) {
    if (k === "required-keep-labels" || k === "required-stop-labels" || k === "labels") {
      grouped[k] = (v as string).split(/\s+/).filter(Boolean);
    } else {
      grouped[k] = v;
    }
  }

  try {
    switch (cmd) {
      case "wizard": {
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
        printJson(buildSetupSummary(grouped.repo as string | undefined, config));
        break;
      }
      case "init": {
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
        const { initializeRun } = await import("./run-manager.js");
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
          outcome_metric: grouped["outcome-metric"] as string | undefined,
          outcome_direction: grouped["outcome-direction"] as string | undefined,
          instrument_metric: grouped["instrument-metric"] as string | undefined,
          instrument_direction: grouped["instrument-direction"] as string | undefined,
        };
        const state = await initializeRun(
          grouped.repo as string | undefined,
          grouped["results-path"] as string | undefined,
          grouped["state-path"] as string | undefined,
          config,
          grouped["fresh-start"] === "true",
        );
        printJson(state);
        break;
      }
      case "status": {
        const { buildSupervisorSnapshot } = await import("./run-manager.js");
        const snapshot = await buildSupervisorSnapshot(
          grouped.repo as string | undefined,
          grouped["results-path"] as string | undefined,
          grouped["state-path"] as string | undefined,
        );
        if (useJson) {
          printJson(snapshot);
        } else {
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
            console.log(`Last:    iter ${formatDisplayValue(lastIter.iteration)} — ${formatDisplayValue(lastIter.decision)} (${formatMetricValue(lastIter.metric_value)})`);
            if (lastIter.score_components != null && typeof lastIter.score_components === "object") {
              const parts = Object.entries(lastIter.score_components as Record<string, number>)
                .map(([k, v]) => `${formatDisplayValue(k)}:${typeof v === "number" ? v.toFixed(4) : formatDisplayValue(v)}`)
                .join(", ");
              if (parts.length > 0) console.log(`  Components: [${parts}]`);
            }
          }
          const flags = s.flags;
          if (flags?.needs_human) console.log("⚠  Needs human input");
          if (flags?.stop_requested) console.log("⏹  Stop requested");
        }
        break;
      }
      case "explain": {
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
          printJson(snapshot);
          break;
        }

        const statusEmoji: Record<string, string> = {
          running: "🔄", completed: "✅", initialized: "📋", stopping: "⏹", stopped: "⏸",
        };
        const statusKey = typeof s.status === "string" ? s.status : "";
        const candidateEmoji = Object.prototype.hasOwnProperty.call(statusEmoji, statusKey)
          ? statusEmoji[statusKey]
          : undefined;
        const emoji = typeof candidateEmoji === "string" ? candidateEmoji : "⚪";
        console.log(`${emoji} Auto Research Run: ${formatDisplayValue(s.run_id)}`);
        console.log(`   Goal:      ${formatDisplayValue(s.goal)}`);
        console.log(`   Status:    ${formatDisplayValue(s.status)}`);
        console.log(`   Mode:      ${formatDisplayValue(s.mode)}`);
        console.log(`   Op Mode:   ${formatDisplayValue(s.operating_mode)}`);
        if (s.metric) {
          const m = s.metric;
          console.log(`   Metric:    ${formatDisplayValue(m.name)} → ${formatMetricValue(m.latest)} (best: ${formatMetricValue(m.best)}, dir: ${formatDisplayValue(m.direction)})`);
        }
        if (stats) {
          console.log(`   Progress:  ${stats.total_iterations} iterations | ${stats.kept} kept | ${stats.discarded} discarded`);
        }
        if (lastIter && lastIter.iteration) {
          console.log(`   Last iter: #${formatDisplayValue(lastIter.iteration)} — ${formatDisplayValue(lastIter.decision)}`);
          if (lastIter.change_summary) console.log(`   Change:    ${formatDisplayValue(lastIter.change_summary)}`);
          if (lastIter.score_components != null && typeof lastIter.score_components === "object") {
            const parts = Object.entries(lastIter.score_components as Record<string, number>)
              .map(([k, v]) => `${formatDisplayValue(k)}:${typeof v === "number" ? v.toFixed(4) : formatDisplayValue(v)}`)
              .join(", ");
            if (parts.length > 0) console.log(`   Components: [${parts}]`);
          }
        }
        if (flags?.needs_human) console.log("   ⚠  Needs human review");
        if (flags?.stop_requested) console.log("   ⏹  Stop was requested");
        if (flags?.background_active) console.log("   📡  Background active — `autoresearch status` to check");
        break;
      }
      case "history": {
        const { resolvePath } = await import("./helpers.js");
        const { RESULTS_DEFAULT } = await import("./constants.js");
        const resultsPath = resolvePath(grouped.repo as string | undefined, grouped["results-path"] as string | undefined, RESULTS_DEFAULT);
        if (!existsSync(resultsPath)) {
          console.log("No results file found.");
          break;
        }
        const content = readFileSync(resultsPath, "utf-8");
        const lines = content.trim().split("\n");
        if (lines.length <= 1) {
          console.log("No iteration records yet.");
          break;
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
          printJson({ count: records.length, records: parsed });
          break;
        }
        for (const r of records) {
          const cols = r.split("\t");
          if (cols.length >= 4) {
            const decision = tsvField(headers, cols, "decision", 2);
            const metricValue = tsvField(headers, cols, "metric_value", 3);
            const emoji = decision === "keep" ? "✓" : decision === "discard" ? "✗" : "⚠";
            const changeSummary = tsvField(headers, cols, "change_summary", 8);
            console.log(`${emoji}  #${formatDisplayValue(cols[1])}  ${formatDisplayValue(decision)}  (${formatMetricValue(metricValue)})  ${formatDisplayValue(changeSummary.substring(0, 60))}`);
          }
        }
        console.log(`\nShowing ${Math.min(limit, records.length)} of ${lines.length - 1} records.`);
        break;
      }
      case "scores": {
        const { resolvePath } = await import("./helpers.js");
        const { SCORE_HISTORY_DEFAULT } = await import("./constants.js");
        const scoreHistoryPath = resolvePath(grouped.repo as string | undefined, grouped["score-history-path"] as string | undefined, SCORE_HISTORY_DEFAULT);
        if (!existsSync(scoreHistoryPath)) {
          console.log("No score history found.");
          break;
        }
        const limit = parsePositiveInt(grouped.limit as string | undefined, "limit") ?? 10;
        const showTopComponents = grouped["top-components"] === "true";
        if (showTopComponents) {
          const allLines = readFileSync(scoreHistoryPath, "utf-8")
            .split("\n")
            .map((l: string) => l.trim())
            .filter(Boolean);
          const allParsed = allLines.map((r: string) => {
            try { return JSON.parse(r); } catch { return null; }
          }).filter(Boolean);
          if (allParsed.length === 0) {
            console.log("No score records yet.");
            break;
          }
          const { rankComponents } = await import("./score-parser.js");
          const ranking = rankComponents(allParsed);
          if (useJson) {
            printJson({ count: allParsed.length, scores: allParsed.slice(-limit), ranking });
            break;
          }
          console.log("Component Rankings:");
          if (ranking.top_positive.length > 0) {
            console.log("  Top improving components:");
            for (const c of ranking.top_positive) {
              console.log(`    + ${formatDisplayValue(c.name)}  Δ+${c.delta.toFixed(4)}`);
            }
          }
          if (ranking.top_negative.length > 0) {
            console.log("  Top declining components:");
            for (const c of ranking.top_negative) {
              console.log(`    - ${formatDisplayValue(c.name)}  Δ${c.delta.toFixed(4)}`);
            }
          }
          if (ranking.top_positive.length === 0 && ranking.top_negative.length === 0) {
            console.log("  No component data found in score history.");
          }
          console.log(`\nAnalyzed ${allParsed.length} score records.`);
          break;
        }
        const records = readTailLines(scoreHistoryPath, limit);
        if (records.length === 0) {
          console.log("No score records yet.");
          break;
        }
        if (useJson) {
          const parsed = records.map((r: string) => {
            try {
              return JSON.parse(r);
            } catch {
              return null;
            }
          }).filter(Boolean);
          printJson({ count: parsed.length, scores: parsed });
          break;
        }
        console.log("Score History (latest " + Math.min(limit, records.length) + "):");
        const recordsOrdered = records.slice().reverse();
        const parseMetricNumber = (value: unknown): number | null => {
          if (typeof value === "number") {
            return Number.isFinite(value) ? value : null;
          }
          if (typeof value === "string") {
            const parsed = Number(value);
            return Number.isFinite(parsed) ? parsed : null;
          }
          return null;
        };
        for (let i = 0; i < recordsOrdered.length; i += 1) {
          const r = recordsOrdered[i];
          try {
            const rec = JSON.parse(r);
            let trend = "";
            if (i + 1 < recordsOrdered.length) {
              try {
                const previousRec = JSON.parse(recordsOrdered[i + 1]);
                const currentMetricValue = parseMetricNumber(rec.metric_value);
                const previousMetricValue = parseMetricNumber(previousRec.metric_value);
                if (currentMetricValue !== null && previousMetricValue !== null) {
                  if (currentMetricValue === previousMetricValue) {
                    trend = "→";
                  } else if (rec.metric_direction === "higher") {
                    trend = currentMetricValue > previousMetricValue ? "↑" : "↓";
                  } else {
                    trend = currentMetricValue < previousMetricValue ? "↑" : "↓";
                  }
                }
              } catch {
                trend = "";
              }
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
                      if (d !== 0) {
                        deltas.push(`${formatDisplayValue(k)}:${d > 0 ? "+" : ""}${d.toFixed(4)}`);
                      }
                    }
                  }
                  if (deltas.length > 0) componentDeltaLine = `  Δ[${deltas.join(", ")}]`;
                }
              } catch {
                // ignore delta parse errors
              }
            }
            console.log(`  #${rec.iteration}  ${trend}  ${rec.metric_value ?? "—"}  (${rec.decision})  ${rec.verify_status}${componentLine}${componentDeltaLine}`);
          } catch {
            console.log(`  [parse error]`);
          }
        }
        console.log(`\nShowing ${records.length} score records.`);
        break;
      }
      case "score": {
        const { resolvePath, readJsonFile, AutoresearchError: AErr } = await import("./helpers.js");
        const { STATE_DEFAULT } = await import("./constants.js");
        const { parseScoreOutput } = await import("./score-parser.js");

        // Resolve scorer: --scorer flag takes priority, else use state.scorer
        let scorerCmd = grouped.scorer as string | undefined;
        if (!scorerCmd) {
          const statePath = resolvePath(grouped.repo as string | undefined, grouped["state-path"] as string | undefined, STATE_DEFAULT);
          if (existsSync(statePath)) {
            const state = parseRunState(readJsonFile(statePath));
            scorerCmd = state.scorer;
          }
        }
        if (!scorerCmd) {
          throw new AErr("No scorer configured. Provide --scorer <cmd> or configure a scorer via autoresearch init --scorer <cmd>.");
        }

        const repoBase = resolveRepo(grouped.repo as string | undefined);
        let rawOutput: string;
        try {
          rawOutput = execSync(scorerCmd, { encoding: "utf-8", cwd: repoBase, stdio: ["ignore", "pipe", "pipe"] });
        } catch (err) {
          const e = err as { message?: string; stderr?: Buffer | string };
          const stderr = typeof e.stderr === "string" ? e.stderr.trim() : (Buffer.isBuffer(e.stderr) ? e.stderr.toString("utf-8").trim() : "");
          const errMsg = stderr || (err instanceof Error ? err.message : String(err));
          throw new AErr(`Scorer command failed: ${errMsg}`);
        }

        const scored = parseScoreOutput(rawOutput);
        const normalized = scored.score / scored.max;
        const percent = (normalized * 100).toFixed(1) + "%";

        if (useJson) {
          printJson({
            score: scored.score,
            max: scored.max,
            normalized,
            percent,
            components: scored.components ?? null,
            diagnostics: scored.diagnostics ?? null,
            details: scored.details ?? null,
          });
          break;
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
        break;
      }
      case "config": {
        const { resolvePath, readJsonFile } = await import("./helpers.js");
        const { STATE_DEFAULT } = await import("./constants.js");
        const statePath = resolvePath(grouped.repo as string | undefined, grouped["state-path"] as string | undefined, STATE_DEFAULT);
        if (!existsSync(statePath)) {
          console.log("No run state found. Run 'autoresearch init' first.");
          break;
        }
        const state = parseRunState(readJsonFile(statePath));
        if (useJson) {
          printJson({
            goal: state.goal,
            mode: state.mode,
            metric: state.metric,
            scope: state.scope,
            iterations_cap: state.iterations_cap,
            deadline_at: state.deadline_at,
            verify: state.verify,
            guard: state.guard,
            scorer: state.scorer ?? null,
            subagent_pool: state.subagent_pool ? "configured" : "none",
            label_requirements: state.label_requirements,
          });
          break;
        }
        console.log("Run Configuration:");
        console.log(`  Goal:     ${formatDisplayValue(state.goal)}`);
        console.log(`  Mode:     ${formatDisplayValue(state.mode)}`);
        console.log(`  Op Mode:  ${formatDisplayValue(state.operating_mode)}`);
        if (state.metric) {
          const m = state.metric;
          console.log(`  Metric:   ${formatDisplayValue(m.name)} (${formatDisplayValue(m.direction)})`);
        }
        console.log(`  Scope:    ${formatDisplayValue(state.scope)}`);
        console.log(`  Iter cap: ${formatDisplayValue(state.iterations_cap)}`);
        console.log(`  Deadline: ${formatDisplayValue(state.deadline_at ? formatTimestamp(state.deadline_at as string) : "—")}`);
        console.log(`  Verify:   ${formatDisplayValue(state.verify)}`);
        console.log(`  Guard:    ${formatDisplayValue(state.guard)}`);
        console.log(`  Scorer:   ${formatDisplayValue(state.scorer ?? "—")}`);
        console.log(`  Pool:     ${state.subagent_pool ? "configured" : "none"}`);
        break;
      }
      case "summary": {
        const { resolvePath } = await import("./helpers.js");
        const { RESULTS_DEFAULT } = await import("./constants.js");
        const resultsPath = resolvePath(grouped.repo as string | undefined, grouped["results-path"] as string | undefined, RESULTS_DEFAULT);
        if (!existsSync(resultsPath)) {
          console.log("No results file found. No runs completed yet.");
          break;
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
          printJson({
            total_records: records.length,
            total_kept: totalKept,
            total_discarded: totalDiscarded,
            total_needs_human: totalNeedsHuman,
            keep_rate: records.length > 0 ? (totalKept / records.length * 100).toFixed(1) + "%" : "0%",
            distinct_run_ids: Array.from(runIds),
          });
          break;
        }
        console.log("Auto Research Summary");
        console.log(`  Total iterations:   ${records.length}`);
        console.log(`  Kept:               ${totalKept}`);
        console.log(`  Discarded:          ${totalDiscarded}`);
        console.log(`  Needs human:        ${totalNeedsHuman}`);
        console.log(`  Keep rate:          ${records.length > 0 ? (totalKept / records.length * 100).toFixed(1) : 0}%`);
        console.log(`  Distinct runs:      ${runIds.size}`);
        break;
      }
      case "validate": {
        const { normalizeDirection, normalizeMode } = await import("./helpers.js");
        const errors: string[] = [];
        
        if (!grouped.goal) errors.push("Missing required: --goal");
        if (!grouped.metric && !grouped["outcome-metric"]) errors.push("Missing required: --metric or --outcome-metric");
        
        try {
          if (grouped.direction) normalizeDirection(grouped.direction as string);
        } catch (e) {
          errors.push(`Invalid direction: ${(e as Error).message}`);
        }
        
        try {
          if (grouped.mode) normalizeMode(grouped.mode as string);
        } catch (e) {
          errors.push(`Invalid mode: ${(e as Error).message}`);
        }
        
        if (!grouped.verify) errors.push("Missing required: --verify");
        
        if (useJson) {
          printJson({ valid: errors.length === 0, errors });
          return errors.length > 0 ? 1 : 0;
        }
        
        if (errors.length === 0) {
          console.log("✓ Configuration is valid");
          console.log(`  Goal: ${grouped.goal}`);
          console.log(`  Metric: ${grouped.metric || grouped["outcome-metric"]} (${grouped.direction || grouped["outcome-direction"] || "lower"})`);
          console.log(`  Verify: ${grouped.verify}`);
          console.log(`  Mode: ${grouped.mode || "foreground"}`);
        } else {
          console.error("✗ Configuration errors:");
          for (const err of errors) {
            console.error(`  - ${formatDisplayValue(err)}`);
          }
          return 1;
        }
        break;
      }
      case "report": {
        const { resolvePath, readJsonFile } = await import("./helpers.js");
        const { STATE_DEFAULT, RESULTS_DEFAULT } = await import("./constants.js");
        const statePath = resolvePath(grouped.repo as string | undefined, grouped["state-path"] as string | undefined, STATE_DEFAULT);
        const resultsPath = resolvePath(grouped.repo as string | undefined, grouped["results-path"] as string | undefined, RESULTS_DEFAULT);
        
        if (!existsSync(statePath)) {
          console.log("No run state found. Run 'autoresearch init' first.");
          break;
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
          printJson({ state, results_count: results.length });
          break;
        }
        
        console.log(`# Auto Research Report`);
        console.log(`\n**Run:** ${formatMarkdownField(state.run_id)}`);
        console.log(`**Goal:** ${formatMarkdownField(state.goal)}`);
        console.log(`**Status:** ${formatMarkdownField(state.status)}`);
        console.log(`**Mode:** ${formatMarkdownField(state.mode)}`);
        console.log(`**Op Mode:** ${formatMarkdownField(state.operating_mode)}`);
        if (state.metric) {
          const m = state.metric;
          console.log(`**Metric:** ${formatMarkdownField(m.name)} (${formatMarkdownField(m.direction)})`);
          console.log(`**Best:** ${formatMarkdownField(m.best)} | **Latest:** ${formatMarkdownField(m.latest)}`);
        }
        if (state.stats) {
          const s = state.stats;
          console.log(`\n## Stats`);
          console.log(`- Iterations: ${formatMarkdownField(s.total_iterations)}`);
          console.log(`- Kept: ${formatMarkdownField(s.kept)}`);
          console.log(`- Discarded: ${formatMarkdownField(s.discarded)}`);
          console.log(`- Needs human: ${formatMarkdownField(s.needs_human)}`);
        }
        if (results.length > 0) {
          console.log(`\n## Iterations`);
          for (const r of results) {
            const cols = r.split("\t");
            if (cols.length >= 4) {
              const decision = tsvField(resultHeaders, cols, "decision", 2);
              const metricValue = tsvField(resultHeaders, cols, "metric_value", 3);
              const changeSummary = tsvField(resultHeaders, cols, "change_summary", 8);
              console.log(`- ${formatMarkdownField(cols[1])}: ${formatMarkdownField(decision)} (${formatMarkdownField(metricValue)}) — ${formatMarkdownField(changeSummary).substring(0, 60)}`);
            }
          }
        }
        break;
      }
      case "suggest": {
        const { resolvePath } = await import("./helpers.js");
        const { MEMORY_DEFAULT } = await import("./constants.js");
        const memoryPath = resolvePath(grouped.repo as string | undefined, grouped["memory-path"] as string | undefined, MEMORY_DEFAULT);
        if (!existsSync(memoryPath)) {
          console.log("No memory file found. Run a self-improvement cycle first.");
          break;
        }
        const memory = readFileSync(memoryPath, "utf-8");
        const patterns = memory.match(/### Pattern: [^\n]+/g) ?? [];
        const suggestions = patterns.map(parseMemoryPatternHeading);
        if (useJson) {
          printJson({ patterns_found: suggestions.length, suggestions });
          break;
        }
        console.log("Memory Patterns — candidate next goals:");
        for (const suggestion of suggestions) {
          console.log(`  → ${formatDisplayValue(suggestion)}`);
        }
        console.log(`\n${suggestions.length} patterns available. Use 'autoresearch init --goal "..."' to start a new run.`);
        break;
      }
      case "export": {
        const { resolvePath } = await import("./helpers.js");
        const { RESULTS_DEFAULT, STATE_DEFAULT } = await import("./constants.js");
        const resultsPath = resolvePath(grouped.repo as string | undefined, grouped["results-path"] as string | undefined, RESULTS_DEFAULT);
        const statePath = resolvePath(grouped.repo as string | undefined, grouped["state-path"] as string | undefined, STATE_DEFAULT);
        const format = grouped.format as string || "json";
        
        if (!existsSync(resultsPath) || !existsSync(statePath)) {
          console.error("No run data found. Run 'autoresearch init' first.");
          return 1;
        }
        
        const results = readFileSync(resultsPath, "utf-8");
        const state = readFileSync(statePath, "utf-8");
        const lines = results.trim().split("\n");
        const headers = lines[0].split("\t");
        const records = lines.slice(1).filter(Boolean).map((r: string) => {
          const cols = r.split("\t");
          const obj: Record<string, string> = {};
          for (let i = 0; i < headers.length; i++) {
            obj[headers[i]!] = cols[i] ?? "";
          }
          return obj;
        });
        
        const exportData = {
          exported_at: new Date().toISOString(),
          state: JSON.parse(state),
          iterations: records,
          summary: {
            total: records.length,
            kept: records.filter((r: Record<string, string>) => r.decision === "keep").length,
            discarded: records.filter((r: Record<string, string>) => r.decision === "discard").length,
          },
        };
        
        if (format === "json") {
          console.log(JSON.stringify(exportData, null, 2));
        } else if (format === "md" || format === "markdown") {
          console.log(`# Auto Research Export`);
          console.log(`\n**Run:** ${escapeMarkdownInline(exportData.state.run_id) || "—"}`);
          console.log(`**Goal:** ${escapeMarkdownInline(exportData.state.goal) || "—"}`);
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
          console.error(`Unknown format: ${format}. Supported: json, md`);
          return 1;
        }
        break;
      }
      case "completion": {
        const shell = grouped.shell as string || "bash";
        const commands = ["init", "goal", "wizard", "status", "explain", "history", "config", "summary", "suggest", "launch", "complete", "stop", "resume", "record", "doctor", "export", "completion", "help"];
        const options = ["--repo", "--goal", "--metric", "--direction", "--verify", "--guard", "--mode", "--scope", "--iterations", "--duration", "--num-drafts", "--branch-policy", "--json", "--results-path", "--state-path", "--fresh-start", "--memory-path", "--format", "--shell", "--goal-path", "--template"];
        
        if (shell === "bash" || shell === "zsh") {
          console.log(`# Auto Research CLI completion for ${shell}`);
          console.log(`_autoresearch() {`);
          console.log(`  local cur="\${COMP_WORDS[COMP_CWORD]}"`);
          console.log(`  local cmds="${commands.join(" ")}"`);
          console.log(`  local opts="${options.join(" ")}"`);
          console.log(`  if [ $COMP_CWORD -eq 1 ]; then`);
          console.log(`    COMPREPLY=($(compgen -W "$cmds" -- "$cur"))`);
          console.log(`  else`);
          console.log(`    COMPREPLY=($(compgen -W "$opts" -- "$cur"))`);
          console.log(`  fi`);
          console.log(`}`);
          console.log(`complete -F _autoresearch autoresearch`);
        } else if (shell === "fish") {
          console.log(`# Auto Research CLI completion for fish`);
          for (const cmd of commands) {
            console.log(`complete -c autoresearch -n '__fish_use_subcommand' -a '${cmd}'`);
          }
          for (const opt of options) {
            console.log(`complete -c autoresearch -n '__fish_seen_subcommand_from ${commands.join(" ")}' -l ${opt.slice(2)}`);
          }
        } else {
          console.error(`Unknown shell: ${shell}. Supported: bash, zsh, fish`);
          return 1;
        }
        break;
      }
      case "launch": {
        const { resolvePath } = await import("./helpers.js");
        const { LAUNCH_DEFAULT } = await import("./constants.js");
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
          duration: grouped.duration as string | undefined,
          memory_path: grouped["memory-path"] as string | undefined,
          required_keep_labels: grouped["required-keep-labels"] as string[] | undefined,
          required_stop_labels: grouped["required-stop-labels"] as string[] | undefined,
          run_tag: grouped["run-tag"] as string | undefined,
          stop_condition: grouped["stop-condition"] as string | undefined,
          baseline: grouped.baseline as string | undefined,
          num_drafts: parsePositiveInt(grouped["num-drafts"] as string | undefined, "num_drafts", { max: MAX_DRAFTS }) ?? 1,
          branch_selection_policy: normalizeBranchPolicy(grouped["branch-policy"] as string | undefined),
          outcome_metric: grouped["outcome-metric"] as string | undefined,
          outcome_direction: grouped["outcome-direction"] as string | undefined,
          instrument_metric: grouped["instrument-metric"] as string | undefined,
          instrument_direction: grouped["instrument-direction"] as string | undefined,
        };
        const launchPath = resolvePath(grouped.repo as string | undefined, grouped["launch-path"] as string | undefined, LAUNCH_DEFAULT);
        if (dryRun) {
          console.log("[dry-run] Would launch background run with config:");
          console.log(JSON.stringify({ ...config, launch_path: launchPath }, null, 2));
          return 0;
        }
        const { initializeRun } = await import("./run-manager.js");
        const { writeFileSync } = await import("fs");
        const state = await initializeRun(
          grouped.repo as string | undefined,
          grouped["results-path"] as string | undefined,
          grouped["state-path"] as string | undefined,
          config,
          grouped["fresh-start"] === "true",
        );
        writeFileSync(launchPath, JSON.stringify({ run_id: state.run_id, goal: state.goal, mode: "background" }, null, 2) + "\n", "utf-8");
        printJson({ status: "launched", run_id: state.run_id, launch_path: launchPath });
        break;
      }
      case "complete": {
        if (dryRun) {
          console.log("[dry-run] Would mark run complete");
          return 0;
        }
        const { completeRun } = await import("./run-manager.js");
        const state = await completeRun(grouped.repo as string | undefined, grouped["state-path"] as string | undefined);
        printJson({ status: "completed", run_id: state.run_id });
        break;
      }
      case "stop": {
        if (dryRun) {
          console.log("[dry-run] Would request background run stop");
          return 0;
        }
        const { setStopRequested } = await import("./run-manager.js");
        const state = await setStopRequested(grouped.repo as string | undefined, grouped["state-path"] as string | undefined);
        printJson({ status: "stop_requested", run_id: state.run_id });
        break;
      }
      case "resume": {
        if (dryRun) {
          console.log("[dry-run] Would resume background run");
          return 0;
        }
        const { resumeBackgroundRun } = await import("./run-manager.js");
        const state = await resumeBackgroundRun(grouped.repo as string | undefined, grouped["state-path"] as string | undefined);
        printJson({ status: "resumed", run_id: state.run_id });
        break;
      }
      case "record": {
        const { normalizeResultStatus, normalizeScorerStatus } = await import("./helpers.js");
        const vs = (grouped["verify-status"] as string) || "pass";
        const gs = (grouped["guard-status"] as string) || "skip";
        const scorerStatus = normalizeScorerStatus(grouped["scorer-status"] as string | undefined);
        const iteration = parsePositiveInt(grouped.iteration as string | undefined, "iteration");
        let scoreComponents: Record<string, number> | undefined;
        if (grouped["score-components"]) {
          try {
            const parsed = JSON.parse(grouped["score-components"] as string);
            if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
              throw new Error('score-components must be a JSON object with string keys and numeric values, e.g., {"accuracy": 0.8, "coverage": 0.6}');
            }
            scoreComponents = parsed as Record<string, number>;
          } catch (e) {
            console.error(`Invalid --score-components: ${(e as Error).message}`);
            return 1;
          }
        }
        if (dryRun) {
          console.log("[dry-run] Would record experiment result:");
          console.log(JSON.stringify({
            decision: grouped.decision,
            metric_value: grouped["metric-value"],
            instrument_value: grouped["instrument-value"],
            scorer_status: scorerStatus,
            verify_status: normalizeResultStatus(vs, "verify_status"),
            guard_status: normalizeResultStatus(gs, "guard_status"),
            hypothesis: grouped.hypothesis,
            change_summary: grouped["change-summary"],
            labels: grouped.labels ? (Array.isArray(grouped.labels) ? grouped.labels : [grouped.labels]) : undefined,
            note: grouped.note,
            iteration,
            score_components: scoreComponents,
          }, null, 2));
          return 0;
        }
        const { appendIteration } = await import("./run-manager.js");
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
          iteration,
          undefined,
          scorerStatus,
          scoreComponents,
          );
        printJson(state);
        break;
      }
      case "doctor": {
        const { VERSION, PACKAGE_NAME, SKILL_NAME } = await import("./constants.js");

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
          cache_exists: updateCache !== null,
          last_check: updateCache?.last_check || null,
          current_version: updateCache?.current_version || null,
          latest_version: updateCache?.latest_version || null,
          update_available: updateCache?.update_available || false,
          update_disabled: process.env.AUTORESEARCH_NO_UPDATE === "1",
        };

        if (useJson) {
          printJson({
            version: VERSION,
            skill_name: SKILL_NAME,
            runtime: `Node.js ${process.version}`,
            source: {
              package_name: PACKAGE_NAME,
              global_path: installedPath || null,
              global_prefix: globalPrefix || null,
              installed_version: installedInfo?.version || null,
              installed_description: installedInfo?.description || null,
              installed_repository: installedInfo?.repository || null,
            },
            update: updateStatus,
            checks: checks,
            checks_passed: checks.filter((c) => !c.ok).length === 0,
          });
          break;
        }

        console.log(`${SKILL_NAME} ${VERSION} (${PACKAGE_NAME})`);
        console.log(`Runtime: Node.js ${process.version}`);
        console.log("");

        console.log("Source:");
        console.log(`  Package:    ${PACKAGE_NAME}`);
        if (installedPath) {
          console.log(`  Global:     ${installedPath}`);
          if (globalPrefix) console.log(`  Prefix:     ${globalPrefix}`);
          if (installedInfo?.repository) console.log(`  Repo:       ${installedInfo.repository}`);
        } else {
          console.log("  Global:     not found via npm -g");
        }
        console.log("");

        console.log("Update:");
        if (updateCache) {
          console.log(`  Last check: ${updateCache.last_check}`);
          console.log(`  Current:    ${updateCache.current_version}`);
          console.log(`  Latest:     ${updateCache.latest_version}`);
          console.log(`  Available:  ${updateCache.update_available ? "yes" : "no"}`);
        } else {
          console.log("  Cache:      no update check recorded");
        }
        console.log(`  Disabled:   ${process.env.AUTORESEARCH_NO_UPDATE === "1" ? "yes (AUTORESEARCH_NO_UPDATE=1)" : "no"}`);
        console.log("");

        console.log("Installation Checks:");
        let maxNameLen = 0;
        for (const c of checks) maxNameLen = Math.max(maxNameLen, c.name.length);

        for (const c of checks) {
          const padded = c.name.padEnd(maxNameLen + 2);
          console.log(`  ${c.ok ? "✓" : "✗"} ${padded}${c.detail ?? (c.ok ? "present" : "missing")}`);
        }

        const failed = checks.filter((c) => !c.ok).length;
        if (failed > 0) {
          console.error(`\n${failed} check(s) failed. Reinstall with 'npm install -g opencode-autoresearch'.`);
          return 1;
        }
        console.log(`\nAll ${checks.length} checks passed.`);
        break;
      }
      case "goal": {
<<<<<<< HEAD
        const rawSubCmd = cmdArgs[0];
        const subCmd = rawSubCmd && !rawSubCmd.startsWith("-") ? rawSubCmd : undefined;
        if ((!subCmd && cmdArgs.length === 0) || subCmd === "help" || (subCmd && HELP_FLAGS.includes(subCmd))) {
=======
        const subCmd = cmdArgs[0];
        if (subCmd?.startsWith("--")) {
          const { resolvePath, readGoalDoc } = await import("./helpers.js");
          const { GOAL_DEFAULT } = await import("./constants.js");
          const goalPath = resolvePath(grouped.repo as string | undefined, grouped["goal-path"] as string | undefined, GOAL_DEFAULT);
          if (!existsSync(goalPath)) {
            console.log("No goal document found. Run 'autoresearch init' first.");
            break;
          }
          const doc = readGoalDoc(goalPath);
          if (useJson) {
            printJson(doc);
            break;
          }
          console.log(`Goal:             ${formatDisplayValue(doc.goal)}`);
          console.log(`Metric:           ${formatDisplayValue(doc.metric)} (${formatDisplayValue(doc.direction)})`);
          console.log(`Verify:           ${formatDisplayValue(doc.verify)}`);
          if (doc.guard) console.log(`Guard:            ${formatDisplayValue(doc.guard)}`);
          if (doc.file_map) console.log(`File map:         ${formatDisplayValue(doc.file_map)}`);
          if (doc.constraints) console.log(`Constraints:      ${formatDisplayValue(doc.constraints)}`);
          if (doc.stop_conditions) console.log(`Stop conditions:  ${formatDisplayValue(doc.stop_conditions)}`);
          break;
        }
        if (!subCmd || subCmd === "help" || HELP_FLAGS.includes(subCmd)) {
>>>>>>> origin/chore/repo-cleanup-release-recovery
          console.error("Usage: autoresearch goal <subcommand> [options]");
          console.error("");
          console.error("Subcommands:");
          console.error("  init    Create a GOAL.md goal definition file");
          console.error("");
          console.error("Options (goal init):");
          console.error("  --goal          Goal description");
          console.error("  --metric        Metric name to track");
          console.error("  --direction     lower or higher (default: lower)");
          console.error("  --verify        Mechanical verification command");
          console.error("  --guard         Guard command for regression catch");
          console.error("  --mode          foreground or background (default: foreground)");
          console.error("  --scope         In-scope files or subsystem");
          console.error("  --iterations    Iteration cap");
          console.error("  --duration      Wall-clock cap (e.g., 5h or 300m)");
          console.error("  --template      Preset template: performance, quality, coverage, custom");
          console.error("  --goal-path     Output file path (default: .autoresearch/goal.md)");
          console.error("  --dry-run       Preview without writing the file");
          console.error("  --json          Output result as JSON");
          console.error("");
          console.error("Examples:");
          console.error("  autoresearch goal init --goal \"reduce errors\" --metric failures --direction lower --verify \"npm test\"");
          console.error("  autoresearch goal init --template performance");
          console.error("  autoresearch goal init  # interactive wizard");
          return 0;
        }
        if (!subCmd) {
          const { GOAL_DEFAULT } = await import("./constants.js");
          const { resolvePath } = await import("./helpers.js");
          const goalPath = resolvePath(grouped.repo as string | undefined, grouped["goal-path"] as string | undefined, GOAL_DEFAULT);
          if (!existsSync(goalPath)) {
            console.log("No goal document found. Run 'autoresearch init' first.");
            break;
          }
          const doc = readGoalDoc(goalPath);
          if (useJson) {
            printJson(doc);
            break;
          }
          console.log(`Goal:             ${formatDisplayValue(doc.goal)}`);
          console.log(`Metric:           ${formatDisplayValue(doc.metric)} (${formatDisplayValue(doc.direction)})`);
          console.log(`Verify:           ${formatDisplayValue(doc.verify)}`);
          if (doc.guard) console.log(`Guard:            ${formatDisplayValue(doc.guard)}`);
          if (doc.file_map) console.log(`File map:         ${formatDisplayValue(doc.file_map)}`);
          if (doc.constraints) console.log(`Constraints:      ${formatDisplayValue(doc.constraints)}`);
          if (doc.stop_conditions) console.log(`Stop conditions:  ${formatDisplayValue(doc.stop_conditions)}`);
          break;
        }
        if (subCmd !== "init") {
          console.error(`Unknown goal subcommand: ${subCmd}`);
          console.error("Run 'autoresearch goal help' for usage.");
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
        const { GOAL_DEFAULT } = await import("./constants.js");
        const { resolvePath } = await import("./helpers.js");
        const { existsSync: goalExistsSync } = await import("fs");

        const templateId = (goalGrouped.template as string | undefined) ?? "custom";
        if (!GOAL_TEMPLATES.find((t) => t.id === templateId)) {
          console.error(`Unknown template: ${templateId}. Valid templates: ${GOAL_TEMPLATES.map((t) => t.id).join(", ")}`);
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
          // Non-interactive stdin: try to read JSON from stdin
          let stdinData = "";
          try {
            stdinData = await new Promise<string>((resolve, reject) => {
              const chunks: Buffer[] = [];
              process.stdin.on("data", (chunk) => chunks.push(chunk as Buffer));
              process.stdin.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
              process.stdin.on("error", reject);
              // Resolve immediately if stdin is closed / empty
              setTimeout(() => resolve(""), 200);
            });
            stdinData = stdinData.trim();
          } catch {
            stdinData = "";
          }
          if (stdinData) {
            try {
              const parsed = JSON.parse(stdinData) as Record<string, unknown>;
              config = { ...config, ...parsed, template: templateId };
            } catch {
              console.error("Failed to parse stdin as JSON. Provide valid JSON or use --goal, --metric, --verify flags.");
              return 1;
            }
          }
        }

        if (!config.goal && isTTY) {
          // Interactive wizard
          const readline = await import("readline");
          const rl = readline.createInterface({ input: process.stdin, output: process.stderr });
          const ask = (prompt: string, defaultVal?: string): Promise<string> =>
            new Promise((resolve) => {
              const suffix = defaultVal ? ` [${defaultVal}]` : "";
              rl.question(`${prompt}${suffix}: `, (answer: string) => {
                resolve(answer.trim() || defaultVal || "");
              });
            });

          process.stderr.write("\nAutoresearch Goal Init — Interactive Wizard\n");
          process.stderr.write("Press Enter to accept default values shown in brackets.\n\n");

          if (!config.goal) config.goal = await ask("Goal (what outcome should this run optimize?)", config.goal as string | undefined);
          if (!config.metric) config.metric = await ask("Metric name", (config.metric as string | undefined) ?? "primary_metric");
          if (!config.direction) config.direction = await ask("Direction (lower/higher)", (config.direction as string | undefined) ?? "lower");
          if (!config.verify) config.verify = await ask("Verify command", config.verify as string | undefined);
          if (!config.guard) {
            const guard = await ask("Guard command (optional, press Enter to skip)");
            if (guard) config.guard = guard;
          }
          if (!config.scope) config.scope = await ask("Scope (files or subsystem)", (config.scope as string | undefined) ?? "current repository");
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
          if (useGoalJson) {
            printJson({ ...result, dry_run: true });
          } else {
            console.log("[dry-run] Would write goal document to: " + goalPath);
            console.log("");
            console.log(document);
          }
          return 0;
        }

        if (goalExistsSync(goalPath) && !goalGrouped["force"]) {
          // Overwrite allowed by default (like init), but warn
          if (verbose) console.error(`[verbose] Overwriting existing ${goalPath}`);
        }

        atomicWriteTextInRepo(goalGrouped.repo as string | undefined, goalPath, document);

        if (useGoalJson) {
          printJson(result);
        } else {
          console.log(`✓ Goal definition written to ${goalPath}`);
          console.log(`  Goal:    ${result.goal ?? "(unset)"}`);
          console.log(`  Metric:  ${result.metric ?? "(unset)"} (${result.direction})`);
          console.log(`  Verify:  ${result.verify ?? "(unset)"}`);
          console.log(`  Mode:    ${result.mode}`);
          if (result.template !== "custom") console.log(`  Template: ${result.template}`);
          console.log("");
          console.log(`Run 'autoresearch init --goal "..." --metric "..." --verify "..."' to start a run.`);
        }
        break;
      }
      default: {
        console.error(`Unknown command: ${cmd}`);
        console.error("Run 'autoresearch --help' for usage.");
        return 1;
      }
    }
  } catch (exc) {
    console.error((exc as Error).message);
    return 2;
  }
  return 0;
}

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(1);
});
