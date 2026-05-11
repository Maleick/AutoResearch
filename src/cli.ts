#!/usr/bin/env node
import { MAX_DRAFTS } from "./constants.js";
import { VERSION_FLAGS, HELP_FLAGS, parseArgs } from "./cli-helpers.js";
import type { CommandGroup } from "./cli-commands.js";
import {
  handleWizard, handleInit, handleStatus, handleExplain,
  handleHistory, handleScores, handleScore, handleConfig,
  handleContract, handleSummary, handleValidate, handleReport,
  handleSuggest, handleExport, handleCompletion, handleLaunch,
  handleComplete, handleStop, handleResume, handleRecord,
  handleDigest, handleDoctor, handleGoal, handleQueue,
  handlePack, handleLeaderboard, handleWorker,
} from "./cli-commands.js";

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
  console.error("  digest     Generate re-entry digest for operator handoff");
  console.error("  config     Show runtime configuration");
  console.error("  contract   Print runtime contract schemas");
  console.error("  summary    Aggregate stats across runs");
  console.error("  suggest    Suggest next goal from memory");
  console.error("  launch     Launch a background run");
  console.error("  complete   Mark a run complete");
  console.error("  stop       Request a background run stop");
  console.error("  resume     Resume a background run");
  console.error("  record     Record an experiment result");
  console.error("  queue      Manage background task queue");
  console.error("  pack       Export and inspect strategy packs");
  console.error("  leaderboard Show local leaderboard across runs");
  console.error("  doctor     Verify package installation and version");
  console.error("  export     Export run data in JSON or markdown");
  console.error("  validate   Validate run configuration");
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
  console.error("  --max-debug-depth  Max debug loop depth before stop");
  console.error("  --branch-failure-budget  Max failures per branch before stop");
  console.error("  --duration      Wall-clock cap (e.g., 5h or 300m)");
  console.error(`  --num-drafts    Number of parallel drafts (default: 1, max: ${MAX_DRAFTS})`);
  console.error("  --branch-policy Branch selection policy: best, roulette, diverse");
  console.error("  --max-debug-depth   Max debug experiment depth before stop");
  console.error("  --branch-failure-budget  Per-branch failure budget before stop");
  console.error("  --json          Output raw JSON (default: human-readable)");
  console.error("  --results-path  Custom results TSV path");
  console.error("  --state-path    Custom state JSON path");
  console.error("  --fresh-start   Archive previous artifacts before starting");
  console.error("  --goal-path     Output path for GOAL.md (used by goal init)");
  console.error("  --template      Goal template: performance, quality, coverage, custom");
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

const groupArgs = (pargs: Record<string, string>): CommandGroup => {
  const grouped: CommandGroup = {};
  for (const [k, v] of Object.entries(pargs)) {
    if (k === "required-keep-labels" || k === "required-stop-labels" || k === "labels") {
      grouped[k] = (v as string).split(/\s+/).filter(Boolean);
    } else {
      grouped[k] = v;
    }
  }
  return grouped;
};

const main = async (): Promise<number> => {
  const args = process.argv.slice(2);
  if (args.length === 0) { usage(); return 0; }
  const first = args[0];
  if (VERSION_FLAGS.includes(first)) {
    const { VERSION, PACKAGE_NAME, SKILL_NAME } = await import("./constants.js");
    console.log(`${SKILL_NAME} ${VERSION} (${PACKAGE_NAME})`);
    console.log("Runtime: Node.js " + process.version);
    return 0;
  }
  if (HELP_FLAGS.includes(first)) { usage(); return 0; }

  const [cmd, ...cmdArgs] = args;
  const pargs = parseArgs(cmdArgs);
  const useJson = pargs.json === "true";
  const verbose = pargs.verbose === "true";
  const dryRun = pargs["dry-run"] === "true";
  const grouped = groupArgs(pargs);

  try {
    switch (cmd) {
      case "wizard": return handleWizard(grouped, useJson);
      case "init": return handleInit(grouped, verbose, dryRun, useJson);
      case "status": return handleStatus(grouped, useJson);
      case "explain": return handleExplain(grouped, useJson);
      case "history": return handleHistory(grouped, useJson);
      case "scores": return handleScores(grouped, useJson);
      case "score": return handleScore(grouped, useJson);
      case "config": return handleConfig(grouped, useJson);
      case "contract": return handleContract(useJson);
      case "summary": return handleSummary(grouped, useJson);
      case "validate": return handleValidate(grouped, useJson);
      case "report": return handleReport(grouped, useJson);
      case "suggest": return handleSuggest(grouped, useJson);
      case "export": return handleExport(grouped);
      case "completion": return handleCompletion(grouped);
      case "launch": return handleLaunch(grouped, dryRun);
      case "complete": return handleComplete(grouped, dryRun);
      case "stop": return handleStop(grouped, dryRun);
      case "resume": return handleResume(grouped, dryRun);
      case "record": return handleRecord(grouped, dryRun);
      case "digest": return handleDigest(grouped, useJson, dryRun);
      case "doctor": return handleDoctor(grouped, useJson);
      case "goal": return handleGoal(grouped, cmdArgs, useJson, verbose, dryRun);
      case "queue": return handleQueue(grouped, cmdArgs, useJson, dryRun);
      case "pack": return handlePack(grouped, cmdArgs, useJson);
      case "leaderboard": return handleLeaderboard(grouped, useJson);
      case "worker": return handleWorker(grouped, useJson);
      default:
        console.error(`Unknown command: ${cmd}`);
        console.error("Run 'autoresearch --help' for usage.");
        return 1;
    }
  } catch (exc) {
    const { categorizeError, formatStructuredError } = await import("./error-categories.js");
    const structured = categorizeError(exc);
    if (useJson) {
      console.error(formatStructuredError(structured, true));
    } else {
      console.error(formatStructuredError(structured, false));
    }
    return 2;
  }
};

main().then((code) => process.exit(code)).catch((err) => {
  console.error(err);
  process.exit(1);
});
