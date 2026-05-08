#!/usr/bin/env node
import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve } from "path";
import { printJson, resolveRepo, parseRunState, parsePositiveInt, sanitizeForTerminal, getInstalledPackagePath, getInstalledPackageInfo, readUpdateCache, getGlobalNpmPrefix } from "./helpers.js";
const VERSION_FLAGS = ["--version", "-v"];
const HELP_FLAGS = ["--help", "-h", "help"];
const usage = () => {
    console.error("Usage: autoresearch <command> [options]");
    console.error("");
    console.error("Commands:");
    console.error("  init       Initialize a run");
    console.error("  wizard     Generate a setup summary");
    console.error("  status     Print run status");
    console.error("  explain    Human-readable run state");
    console.error("  history    Show recent iteration log");
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
    console.error("  --verify        Mechanical verification command");
    console.error("  --guard         Guard command for regression catch");
    console.error("  --mode          foreground or background");
    console.error("  --scope         In-scope files or subsystem");
    console.error("  --iterations    Iteration cap");
    console.error("  --max-no-progress  Max consecutive discards before stop");
    console.error("  --duration      Wall-clock cap (e.g., 5h or 300m)");
    console.error("  --json          Output raw JSON (default: human-readable)");
    console.error("  --results-path  Custom results TSV path");
    console.error("  --state-path    Custom state JSON path");
    console.error("  --fresh-start   Archive previous artifacts before starting");
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
    console.error("  autoresearch status");
    console.error("  autoresearch explain");
    console.error("  autoresearch history");
};
const parseArgs = (args) => {
    const result = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i].startsWith("--")) {
            const key = args[i].slice(2);
            if (i + 1 < args.length && !args[i + 1].startsWith("--") && !args[i + 1].startsWith("-")) {
                result[key] = args[++i];
            }
            else {
                result[key] = "true";
            }
        }
        else if (args[i].startsWith("-") && args[i].length === 2 && args[i] !== "--") {
            const shortToLong = {
                r: "repo", g: "goal", m: "metric", d: "direction",
                v: "verify", n: "guard", o: "mode", s: "scope",
                i: "iterations", t: "duration", p: "max-no-progress",
            };
            const key = shortToLong[args[i][1]] ?? args[i].slice(1);
            if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
                result[key] = args[++i];
            }
            else {
                result[key] = "true";
            }
        }
    }
    return result;
};
const markdownInlineEscapes = {
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
const markdownHtmlEscapes = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
};
const escapeMarkdownInline = (value) => {
    return sanitizeForTerminal(value ?? "")
        .replace(/[&<>"]/g, (char) => markdownHtmlEscapes[char])
        .replace(/[\r\n\t]+/g, " ")
        .replace(/\s{2,}/g, " ")
        .trim()
        .replace(/[\\`*_{}\[\]()#+\-.!|]/g, (char) => markdownInlineEscapes[char]);
};
const escapeMarkdownTableCell = (value) => {
    const escaped = escapeMarkdownInline(value);
    return escaped.length > 0 ? escaped : "—";
};
const formatDisplayValue = (val) => {
    if (val === undefined || val === null)
        return "—";
    return sanitizeForTerminal(val);
};
const formatMetricValue = formatDisplayValue;
const formatTimestamp = (ts) => {
    try {
        const d = new Date(ts);
        return d.toLocaleString();
    }
    catch {
        return ts;
    }
};
const markdownEscapePattern = /([\\`*_{}[\]()#+\-.!|>])/g;
const terminalControlPattern = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g;
const controlCharacterPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;
const sanitizeMarkdownText = (value) => {
    if (value === undefined || value === null)
        return "—";
    return String(value)
        .replace(terminalControlPattern, "")
        .replace(controlCharacterPattern, "")
        .replace(/\r?\n|\r/g, " ")
        .replace(/\t/g, " ");
};
const formatMarkdownField = (value) => {
    return sanitizeMarkdownText(value).replace(markdownEscapePattern, "\\$1");
};
const main = async () => {
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
    const grouped = {};
    for (const [k, v] of Object.entries(pargs)) {
        if (k === "required-keep-labels" || k === "required-stop-labels" || k === "labels") {
            grouped[k] = v.split(/\s+/).filter(Boolean);
        }
        else {
            grouped[k] = v;
        }
    }
    try {
        switch (cmd) {
            case "wizard": {
                const { buildSetupSummary } = await import("./wizard.js");
                const config = {
                    goal: grouped.goal,
                    scope: grouped.scope,
                    metric: grouped.metric,
                    direction: grouped.direction,
                    verify: grouped.verify,
                    guard: grouped.guard,
                    mode: grouped.mode,
                    iterations: parsePositiveInt(grouped.iterations, "iterations"),
                    max_no_progress: parsePositiveInt(grouped["max-no-progress"], "max-no-progress"),
                    duration: grouped.duration,
                    memory_path: grouped["memory-path"],
                    required_keep_labels: grouped["required-keep-labels"],
                    required_stop_labels: grouped["required-stop-labels"],
                    stop_condition: grouped["stop-condition"],
                    rollback_strategy: grouped["rollback-strategy"],
                };
                printJson(buildSetupSummary(grouped.repo, config));
                break;
            }
            case "init": {
                if (verbose)
                    console.error(`[verbose] Initializing run with goal: ${formatDisplayValue(grouped.goal)}`);
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
                    goal: grouped.goal,
                    metric: grouped.metric,
                    direction: grouped.direction || "lower",
                    verify: grouped.verify,
                    mode: grouped.mode || "foreground",
                    scope: grouped.scope,
                    guard: grouped.guard,
                    iterations: parsePositiveInt(grouped.iterations, "iterations"),
                    max_no_progress: parsePositiveInt(grouped["max-no-progress"], "max-no-progress"),
                    duration: grouped.duration,
                    memory_path: grouped["memory-path"],
                    required_keep_labels: grouped["required-keep-labels"],
                    required_stop_labels: grouped["required-stop-labels"],
                    run_tag: grouped["run-tag"],
                    stop_condition: grouped["stop-condition"],
                    baseline: grouped.baseline,
                    outcome_metric: grouped["outcome-metric"],
                    outcome_direction: grouped["outcome-direction"],
                    instrument_metric: grouped["instrument-metric"],
                    instrument_direction: grouped["instrument-direction"],
                };
                const state = await initializeRun(grouped.repo, grouped["results-path"], grouped["state-path"], config, grouped["fresh-start"] === "true");
                printJson(state);
                break;
            }
            case "status": {
                const { buildSupervisorSnapshot } = await import("./run-manager.js");
                const snapshot = await buildSupervisorSnapshot(grouped.repo, grouped["results-path"], grouped["state-path"]);
                if (useJson) {
                    printJson(snapshot);
                }
                else {
                    const s = snapshot;
                    const stats = s.stats;
                    console.log(`Run:     ${formatDisplayValue(s.run_id)}`);
                    console.log(`Status:  ${formatDisplayValue(s.status)}`);
                    console.log(`Mode:    ${formatDisplayValue(s.mode)}`);
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
                    }
                    const flags = s.flags;
                    if (flags?.needs_human)
                        console.log("⚠  Needs human input");
                    if (flags?.stop_requested)
                        console.log("⏹  Stop requested");
                }
                break;
            }
            case "explain": {
                const { buildSupervisorSnapshot } = await import("./run-manager.js");
                const snapshot = await buildSupervisorSnapshot(grouped.repo, grouped["results-path"], grouped["state-path"]);
                const s = snapshot;
                const stats = s.stats;
                const lastIter = s.last_iteration;
                const flags = s.flags;
                if (useJson) {
                    printJson(snapshot);
                    break;
                }
                const statusEmoji = {
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
                if (s.metric) {
                    const m = s.metric;
                    console.log(`   Metric:    ${formatDisplayValue(m.name)} → ${formatMetricValue(m.latest)} (best: ${formatMetricValue(m.best)}, dir: ${formatDisplayValue(m.direction)})`);
                }
                if (stats) {
                    console.log(`   Progress:  ${stats.total_iterations} iterations | ${stats.kept} kept | ${stats.discarded} discarded`);
                }
                if (lastIter && lastIter.iteration) {
                    console.log(`   Last iter: #${formatDisplayValue(lastIter.iteration)} — ${formatDisplayValue(lastIter.decision)}`);
                    if (lastIter.change_summary)
                        console.log(`   Change:    ${formatDisplayValue(lastIter.change_summary)}`);
                }
                if (flags?.needs_human)
                    console.log("   ⚠  Needs human review");
                if (flags?.stop_requested)
                    console.log("   ⏹  Stop was requested");
                if (flags?.background_active)
                    console.log("   📡  Background active — `autoresearch status` to check");
                break;
            }
            case "history": {
                const { resolvePath } = await import("./helpers.js");
                const { RESULTS_DEFAULT } = await import("./constants.js");
                const resultsPath = resolvePath(grouped.repo, grouped["results-path"], RESULTS_DEFAULT);
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
                const limit = parsePositiveInt(grouped.limit, "limit") ?? 10;
                const records = lines.slice(1).reverse().slice(0, limit);
                if (useJson) {
                    const headers = lines[0].split("\t");
                    const parsed = records.map((r) => {
                        const cols = r.split("\t");
                        const obj = {};
                        for (let i = 0; i < headers.length; i++) {
                            obj[headers[i]] = cols[i] ?? "";
                        }
                        return obj;
                    });
                    printJson({ count: records.length, records: parsed });
                    break;
                }
                for (const r of records) {
                    const cols = r.split("\t");
                    if (cols.length >= 8) {
                        const emoji = cols[2] === "keep" ? "✓" : cols[2] === "discard" ? "✗" : "⚠";
                        console.log(`${emoji}  #${formatDisplayValue(cols[1])}  ${formatDisplayValue(cols[2])}  (${formatMetricValue(cols[3])})  ${formatDisplayValue(cols[7].substring(0, 60))}`);
                    }
                }
                console.log(`\nShowing ${Math.min(limit, records.length)} of ${lines.length - 1} records.`);
                break;
            }
            case "config": {
                const { resolvePath, readJsonFile } = await import("./helpers.js");
                const { STATE_DEFAULT } = await import("./constants.js");
                const statePath = resolvePath(grouped.repo, grouped["state-path"], STATE_DEFAULT);
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
                        subagent_pool: state.subagent_pool ? "configured" : "none",
                        label_requirements: state.label_requirements,
                    });
                    break;
                }
                console.log("Run Configuration:");
                console.log(`  Goal:     ${formatDisplayValue(state.goal)}`);
                console.log(`  Mode:     ${formatDisplayValue(state.mode)}`);
                if (state.metric) {
                    const m = state.metric;
                    console.log(`  Metric:   ${formatDisplayValue(m.name)} (${formatDisplayValue(m.direction)})`);
                }
                console.log(`  Scope:    ${formatDisplayValue(state.scope)}`);
                console.log(`  Iter cap: ${formatDisplayValue(state.iterations_cap)}`);
                console.log(`  Deadline: ${formatDisplayValue(state.deadline_at ? formatTimestamp(state.deadline_at) : "—")}`);
                console.log(`  Verify:   ${formatDisplayValue(state.verify)}`);
                console.log(`  Guard:    ${formatDisplayValue(state.guard)}`);
                console.log(`  Pool:     ${state.subagent_pool ? "configured" : "none"}`);
                break;
            }
            case "summary": {
                const { resolvePath } = await import("./helpers.js");
                const { RESULTS_DEFAULT } = await import("./constants.js");
                const resultsPath = resolvePath(grouped.repo, grouped["results-path"], RESULTS_DEFAULT);
                if (!existsSync(resultsPath)) {
                    console.log("No results file found. No runs completed yet.");
                    break;
                }
                const content = readFileSync(resultsPath, "utf-8");
                const lines = content.trim().split("\n");
                const records = lines.slice(1).filter(Boolean);
                let totalKept = 0, totalDiscarded = 0, totalNeedsHuman = 0;
                const runIds = new Set();
                for (const r of records) {
                    const cols = r.split("\t");
                    const dec = cols[2];
                    if (dec === "keep")
                        totalKept++;
                    else if (dec === "discard")
                        totalDiscarded++;
                    else if (dec === "needs_human")
                        totalNeedsHuman++;
                    const iterTags = cols[1].split(":");
                    if (iterTags.length >= 2)
                        runIds.add(iterTags[0]);
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
                const errors = [];
                if (!grouped.goal)
                    errors.push("Missing required: --goal");
                if (!grouped.metric)
                    errors.push("Missing required: --metric");
                try {
                    if (grouped.direction)
                        normalizeDirection(grouped.direction);
                }
                catch (e) {
                    errors.push(`Invalid direction: ${e.message}`);
                }
                try {
                    if (grouped.mode)
                        normalizeMode(grouped.mode);
                }
                catch (e) {
                    errors.push(`Invalid mode: ${e.message}`);
                }
                if (!grouped.verify)
                    errors.push("Missing required: --verify");
                if (useJson) {
                    printJson({ valid: errors.length === 0, errors });
                    return errors.length > 0 ? 1 : 0;
                }
                if (errors.length === 0) {
                    console.log("✓ Configuration is valid");
                    console.log(`  Goal: ${grouped.goal}`);
                    console.log(`  Metric: ${grouped.metric} (${grouped.direction || "lower"})`);
                    console.log(`  Verify: ${grouped.verify}`);
                    console.log(`  Mode: ${grouped.mode || "foreground"}`);
                }
                else {
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
                const statePath = resolvePath(grouped.repo, grouped["state-path"], STATE_DEFAULT);
                const resultsPath = resolvePath(grouped.repo, grouped["results-path"], RESULTS_DEFAULT);
                if (!existsSync(statePath)) {
                    console.log("No run state found. Run 'autoresearch init' first.");
                    break;
                }
                const state = parseRunState(readJsonFile(statePath));
                let results = [];
                if (existsSync(resultsPath)) {
                    const content = readFileSync(resultsPath, "utf-8");
                    results = content.trim().split("\n").slice(1).filter(Boolean);
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
                        if (cols.length >= 8) {
                            console.log(`- ${formatMarkdownField(cols[1])}: ${formatMarkdownField(cols[2])} (${formatMarkdownField(cols[3])}) — ${formatMarkdownField(cols[7]).substring(0, 60)}`);
                        }
                    }
                }
                break;
            }
            case "suggest": {
                const { resolvePath } = await import("./helpers.js");
                const { MEMORY_DEFAULT } = await import("./constants.js");
                const memoryPath = resolvePath(grouped.repo, grouped["memory-path"], MEMORY_DEFAULT);
                if (!existsSync(memoryPath)) {
                    console.log("No memory file found. Run a self-improvement cycle first.");
                    break;
                }
                const memory = readFileSync(memoryPath, "utf-8");
                const patterns = memory.match(/### Pattern: [^\n]+/g) ?? [];
                if (useJson) {
                    printJson({ patterns_found: patterns.length, suggestions: patterns.map((p) => p.replace("### Pattern: ", "")) });
                    break;
                }
                console.log("Memory Patterns — candidate next goals:");
                for (const p of patterns) {
                    console.log(`  → ${formatDisplayValue(p.replace("### Pattern: ", ""))}`);
                }
                console.log(`\n${patterns.length} patterns available. Use 'autoresearch init --goal "..."' to start a new run.`);
                break;
            }
            case "export": {
                const { resolvePath } = await import("./helpers.js");
                const { RESULTS_DEFAULT, STATE_DEFAULT } = await import("./constants.js");
                const resultsPath = resolvePath(grouped.repo, grouped["results-path"], RESULTS_DEFAULT);
                const statePath = resolvePath(grouped.repo, grouped["state-path"], STATE_DEFAULT);
                const format = grouped.format || "json";
                if (!existsSync(resultsPath) || !existsSync(statePath)) {
                    console.error("No run data found. Run 'autoresearch init' first.");
                    return 1;
                }
                const results = readFileSync(resultsPath, "utf-8");
                const state = readFileSync(statePath, "utf-8");
                const lines = results.trim().split("\n");
                const headers = lines[0].split("\t");
                const records = lines.slice(1).filter(Boolean).map((r) => {
                    const cols = r.split("\t");
                    const obj = {};
                    for (let i = 0; i < headers.length; i++) {
                        obj[headers[i]] = cols[i] ?? "";
                    }
                    return obj;
                });
                const exportData = {
                    exported_at: new Date().toISOString(),
                    state: JSON.parse(state),
                    iterations: records,
                    summary: {
                        total: records.length,
                        kept: records.filter((r) => r.decision === "keep").length,
                        discarded: records.filter((r) => r.decision === "discard").length,
                    },
                };
                if (format === "json") {
                    console.log(JSON.stringify(exportData, null, 2));
                }
                else if (format === "md" || format === "markdown") {
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
                }
                else {
                    console.error(`Unknown format: ${format}. Supported: json, md`);
                    return 1;
                }
                break;
            }
            case "completion": {
                const shell = grouped.shell || "bash";
                const commands = ["init", "wizard", "status", "explain", "history", "config", "summary", "suggest", "launch", "complete", "stop", "resume", "record", "doctor", "export", "completion", "help"];
                const options = ["--repo", "--goal", "--metric", "--direction", "--verify", "--guard", "--mode", "--scope", "--iterations", "--duration", "--json", "--results-path", "--state-path", "--fresh-start", "--memory-path", "--format", "--shell"];
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
                }
                else if (shell === "fish") {
                    console.log(`# Auto Research CLI completion for fish`);
                    for (const cmd of commands) {
                        console.log(`complete -c autoresearch -n '__fish_use_subcommand' -a '${cmd}'`);
                    }
                    for (const opt of options) {
                        console.log(`complete -c autoresearch -n '__fish_seen_subcommand_from ${commands.join(" ")}' -l ${opt.slice(2)}`);
                    }
                }
                else {
                    console.error(`Unknown shell: ${shell}. Supported: bash, zsh, fish`);
                    return 1;
                }
                break;
            }
            case "launch": {
                const { resolvePath } = await import("./helpers.js");
                const { LAUNCH_DEFAULT } = await import("./constants.js");
                const config = {
                    goal: grouped.goal,
                    metric: grouped.metric,
                    direction: grouped.direction || "lower",
                    verify: grouped.verify,
                    mode: "background",
                    scope: grouped.scope,
                    guard: grouped.guard,
                    iterations: parsePositiveInt(grouped.iterations, "iterations"),
                    max_no_progress: parsePositiveInt(grouped["max-no-progress"], "max-no-progress"),
                    duration: grouped.duration,
                    memory_path: grouped["memory-path"],
                    required_keep_labels: grouped["required-keep-labels"],
                    required_stop_labels: grouped["required-stop-labels"],
                    run_tag: grouped["run-tag"],
                    stop_condition: grouped["stop-condition"],
                    baseline: grouped.baseline,
                    outcome_metric: grouped["outcome-metric"],
                    outcome_direction: grouped["outcome-direction"],
                    instrument_metric: grouped["instrument-metric"],
                    instrument_direction: grouped["instrument-direction"],
                };
                const launchPath = resolvePath(grouped.repo, grouped["launch-path"], LAUNCH_DEFAULT);
                if (dryRun) {
                    console.log("[dry-run] Would launch background run with config:");
                    console.log(JSON.stringify({ ...config, launch_path: launchPath }, null, 2));
                    return 0;
                }
                const { initializeRun } = await import("./run-manager.js");
                const { writeFileSync } = await import("fs");
                const state = await initializeRun(grouped.repo, grouped["results-path"], grouped["state-path"], config, grouped["fresh-start"] === "true");
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
                const state = await completeRun(grouped.repo, grouped["state-path"]);
                printJson({ status: "completed", run_id: state.run_id });
                break;
            }
            case "stop": {
                if (dryRun) {
                    console.log("[dry-run] Would request background run stop");
                    return 0;
                }
                const { setStopRequested } = await import("./run-manager.js");
                const state = await setStopRequested(grouped.repo, grouped["state-path"]);
                printJson({ status: "stop_requested", run_id: state.run_id });
                break;
            }
            case "resume": {
                if (dryRun) {
                    console.log("[dry-run] Would resume background run");
                    return 0;
                }
                const { resumeBackgroundRun } = await import("./run-manager.js");
                const state = await resumeBackgroundRun(grouped.repo, grouped["state-path"]);
                printJson({ status: "resumed", run_id: state.run_id });
                break;
            }
            case "record": {
                const { normalizeResultStatus } = await import("./helpers.js");
                const vs = grouped["verify-status"] || "pass";
                const gs = grouped["guard-status"] || "skip";
                const iteration = parsePositiveInt(grouped.iteration, "iteration");
                if (dryRun) {
                    console.log("[dry-run] Would record experiment result:");
                    console.log(JSON.stringify({
                        decision: grouped.decision,
                        metric_value: grouped["metric-value"],
                        instrument_value: grouped["instrument-value"],
                        verify_status: normalizeResultStatus(vs, "verify_status"),
                        guard_status: normalizeResultStatus(gs, "guard_status"),
                        hypothesis: grouped.hypothesis,
                        change_summary: grouped["change-summary"],
                        labels: grouped.labels ? (Array.isArray(grouped.labels) ? grouped.labels : [grouped.labels]) : undefined,
                        note: grouped.note,
                        iteration,
                    }, null, 2));
                    return 0;
                }
                const { appendIteration } = await import("./run-manager.js");
                const state = await appendIteration(grouped.repo, grouped["results-path"], grouped["state-path"], grouped.decision, grouped["metric-value"], grouped["instrument-value"], normalizeResultStatus(vs, "verify_status"), normalizeResultStatus(gs, "guard_status"), grouped.hypothesis, grouped["change-summary"], grouped.labels ? (Array.isArray(grouped.labels) ? grouped.labels : [grouped.labels]) : undefined, grouped.note, iteration);
                printJson(state);
                break;
            }
            case "doctor": {
                const { VERSION, PACKAGE_NAME, SKILL_NAME } = await import("./constants.js");
                const base = resolveRepo(grouped.repo);
                const checks = [];
                const cmdDir = resolve(base, "commands");
                const skillsDir = resolve(base, "skills/autoresearch");
                const hooksDir = resolve(base, "hooks");
                const cmdFiles = existsSync(cmdDir) ? readdirSync(cmdDir).filter((f) => f.endsWith(".md")) : [];
                const skillFiles = existsSync(skillsDir) ? readdirSync(skillsDir) : [];
                const hookFiles = existsSync(hooksDir) ? readdirSync(hooksDir).filter((f) => f.endsWith(".sh")) : [];
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
                    if (globalPrefix)
                        console.log(`  Prefix:     ${globalPrefix}`);
                    if (installedInfo?.repository)
                        console.log(`  Repo:       ${installedInfo.repository}`);
                }
                else {
                    console.log("  Global:     not found via npm -g");
                }
                console.log("");
                console.log("Update:");
                if (updateCache) {
                    console.log(`  Last check: ${updateCache.last_check}`);
                    console.log(`  Current:    ${updateCache.current_version}`);
                    console.log(`  Latest:     ${updateCache.latest_version}`);
                    console.log(`  Available:  ${updateCache.update_available ? "yes" : "no"}`);
                }
                else {
                    console.log("  Cache:      no update check recorded");
                }
                console.log(`  Disabled:   ${process.env.AUTORESEARCH_NO_UPDATE === "1" ? "yes (AUTORESEARCH_NO_UPDATE=1)" : "no"}`);
                console.log("");
                console.log("Installation Checks:");
                let maxNameLen = 0;
                for (const c of checks)
                    maxNameLen = Math.max(maxNameLen, c.name.length);
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
            default: {
                console.error(`Unknown command: ${cmd}`);
                console.error("Run 'autoresearch --help' for usage.");
                return 1;
            }
        }
    }
    catch (exc) {
        console.error(exc.message);
        return 2;
    }
    return 0;
};
main().then((code) => process.exit(code)).catch((err) => {
    console.error(err);
    process.exit(1);
});
//# sourceMappingURL=cli.js.map