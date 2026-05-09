import type { RunConfig, RunState, SupervisorSnapshot } from "./types.js";
import {
  utcNow,
  ensureParent,
  atomicWriteJson,
  readJsonFile,
  parseRunState,
  resolvePath,
  normalizeDirection,
  normalizeOperatingMode,
  parseDurationSeconds,
  normalizeLabels,
  missingRequiredLabels,
  writeGoalDoc,
  normalizeScorerStatus,
  AutoresearchError,
} from "./helpers.js";
import { RESULTS_DEFAULT, STATE_DEFAULT, SCORE_HISTORY_DEFAULT, GOAL_DEFAULT } from "./constants.js";
import { buildSubagentPoolPlan, buildContinuationPolicy, buildDraftPoolPlan } from "./subagent-pool.js";
import { writeFileSync, appendFileSync, existsSync, constants } from "fs";
import { lstat, open } from "fs/promises";

const MAX_RESULTS_BYTES = 10 * 1024 * 1024;

export async function initializeRun(
  repo: string | undefined,
  resultsPathValue: string | undefined,
  statePathValue: string | undefined,
  config: RunConfig,
  freshStart: boolean,
  goalPathValue?: string,
): Promise<RunState> {
  const resultsPath = resolvePath(repo, resultsPathValue, RESULTS_DEFAULT);
  const statePath = resolvePath(repo, statePathValue, STATE_DEFAULT);
  const goalPath = resolvePath(repo, goalPathValue, GOAL_DEFAULT);

  if (existsSync(statePath) && !freshStart) {
    throw new AutoresearchError(`${statePath} already exists. Use --fresh-start to archive.`);
  }

  const header = "timestamp\titeration\tdecision\tmetric_value\tinstrument_value\tverify_status\tguard_status\thypothesis\tchange_summary\tlabels\tnote\tid\tparent_id\tbranch\tstage\tagent\n";
  ensureParent(resultsPath);
  if (!existsSync(resultsPath)) {
    writeFileSync(resultsPath, header, "utf-8");
  }

  const state = makeStatePayload(config, resultsPath, statePath);
  atomicWriteJson(statePath, state);

  writeGoalDoc(goalPath, {
    goal: config.goal,
    metric: config.outcome_metric ?? config.metric,
    direction: config.outcome_direction ?? config.direction ?? "lower",
    verify: config.verify ?? "",
    guard: config.guard,
    constraints: undefined,
    file_map: config.scope || undefined,
    stop_conditions: config.stop_condition,
  });

  return state;
}

export async function appendIteration(
  repo: string | undefined,
  resultsPathValue: string | undefined,
  statePathValue: string | undefined,
  decision: string,
  metricValue: string | undefined,
  instrumentValue: string | undefined,
  verifyStatus: string,
  guardStatus: string,
  hypothesis: string | undefined,
  changeSummary: string,
  labels: string[] | undefined,
  note: string | undefined,
  iteration: number | undefined,
  scoreHistoryPathValue?: string,
  scorerStatusValue?: string | Record<string, number>,
  scoreComponentsValue?: Record<string, number>,
  lineage?: { id?: string; parent_id?: string; branch?: string; stage?: string; agent?: string },
): Promise<RunState> {
  const resultsPath = resolvePath(repo, resultsPathValue, RESULTS_DEFAULT);
  const statePath = resolvePath(repo, statePathValue, STATE_DEFAULT);
  const scoreHistoryPath = resolvePath(repo, scoreHistoryPathValue, SCORE_HISTORY_DEFAULT);
  const state = parseRunState(readJsonFile(statePath));

  const currentIteration = iteration ?? state.stats.total_iterations + 1;
  const now = utcNow();
  const scoreComponents = typeof scorerStatusValue === "object"
    ? scorerStatusValue
    : scoreComponentsValue;
  const scorerStatus = normalizeScorerStatus(typeof scorerStatusValue === "string" ? scorerStatusValue : undefined);
  const effectiveDecision = scorerStatus === "scorer-broken" && (decision === "keep" || decision === "discard")
    ? "needs_human"
    : decision;
  const labelList = normalizeLabels(labels ?? []);
  const labelReqs = state.label_requirements ?? { keep: [], stop: [] };
  const requiredKeep = normalizeLabels(labelReqs.keep ?? []);
  const requiredStop = normalizeLabels(labelReqs.stop ?? []);
  const missingKeep = missingRequiredLabels(labelList, requiredKeep);
  const missingStop = missingRequiredLabels(labelList, requiredStop);

  if (effectiveDecision === "keep" && missingKeep.length > 0) {
    throw new AutoresearchError(`Keep requires labels: ${missingKeep.join(", ")}`);
  }

  const lineageId = lineage?.id ?? `${state.run_id}-iter-${currentIteration}`;
  const lineageParentId = lineage?.parent_id ?? (currentIteration > 1 ? `${state.run_id}-iter-${currentIteration - 1}` : "");
  const lineageBranch = lineage?.branch ?? state.draft_pool?.best_branch_id ?? "main";
  const lineageStage = lineage?.stage ?? "experiment";
  const lineageAgent = lineage?.agent ?? "orchestrator";

  const resultRow = [
    now,
    String(currentIteration),
    effectiveDecision,
    metricValue ?? "",
    instrumentValue ?? "",
    verifyStatus,
    guardStatus,
    hypothesis ?? "",
    changeSummary,
    labelList.join(","),
    note ?? "",
    lineageId,
    lineageParentId,
    lineageBranch,
    lineageStage,
    lineageAgent,
  ].join("\t") + "\n";

  appendFileSync(resultsPath, resultRow, "utf-8");

  const scoreRecord: Record<string, unknown> = {
    timestamp: now,
    iteration: currentIteration,
    run_id: state.run_id,
    decision: effectiveDecision,
    scorer_status: scorerStatus,
    metric_value: metricValue ?? null,
    metric_name: state.metric.name,
    metric_direction: state.metric.direction,
    verify_status: verifyStatus,
    guard_status: guardStatus,
    id: lineageId,
    parent_id: lineageParentId,
    branch: lineageBranch,
    stage: lineageStage,
    agent: lineageAgent,
  };
  if (scoreComponents != null) {
    scoreRecord.score_components = scoreComponents;
  }
  await appendTextFileNoFollow(scoreHistoryPath, JSON.stringify(scoreRecord) + "\n", "score history file");

  const newState: RunState = {
    ...state,
    updated_at: now,
    status: "running",
    stats: {
      ...state.stats,
      total_iterations: currentIteration,
    },
    flags: {
      ...state.flags,
      stop_ready: effectiveDecision === "keep" && missingStop.length === 0,
    },
  };

  if (effectiveDecision === "keep") {
    newState.stats.kept = newState.stats.kept + 1;
    newState.stats.consecutive_discards = 0;
  } else if (effectiveDecision === "discard") {
    newState.stats.discarded = newState.stats.discarded + 1;
    newState.stats.consecutive_discards = newState.stats.consecutive_discards + 1;
  } else if (effectiveDecision === "needs_human") {
    newState.stats.needs_human = newState.stats.needs_human + 1;
    newState.flags.needs_human = true;
    newState.stats.consecutive_discards = 0;
  }

  newState.last_iteration = {
    iteration: currentIteration,
    decision: effectiveDecision,
    scorer_status: scorerStatus,
    metric_value: metricValue,
    instrument_value: instrumentValue,
    change_summary: changeSummary,
    labels: labelList,
    timestamp: now,
    keep_labels_satisfied: missingKeep.length === 0,
    stop_labels_satisfied: missingStop.length === 0,
    missing_keep_labels: missingKeep,
    missing_stop_labels: missingStop,
    id: lineageId,
    parent_id: lineageParentId,
    branch: lineageBranch,
    stage: lineageStage,
    agent: lineageAgent,
    score_components: scoreComponents,
  };

  atomicWriteJson(statePath, newState);
  return newState;
}

async function appendTextFileNoFollow(filePath: string, content: string, description: string): Promise<void> {
  ensureParent(filePath);

  try {
    const pathStats = await lstat(filePath);
    if (pathStats.isSymbolicLink()) {
      throw new AutoresearchError(`Refusing to append to symlinked ${description}: ${filePath}`);
    }
    if (!pathStats.isFile()) {
      throw new AutoresearchError(`Refusing to append to non-regular ${description}: ${filePath}`);
    }
  } catch (err) {
    if (err instanceof AutoresearchError) throw err;
    const code = (err as NodeJS.ErrnoException).code;
    if (code !== "ENOENT") throw err;
  }

  if (typeof constants.O_NOFOLLOW !== "number") {
    throw new AutoresearchError(
      `Refusing to append to ${description} because this platform does not support O_NOFOLLOW: ${filePath}`,
    );
  }

  let handle;
  try {
    handle = await open(
      filePath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_APPEND | constants.O_NOFOLLOW,
      0o600,
    );
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ELOOP") {
      throw new AutoresearchError(`Refusing to append to symlinked ${description}: ${filePath}`);
    }
    throw err;
  }

  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new AutoresearchError(`Refusing to append to non-regular ${description}: ${filePath}`);
    }
    await handle.writeFile(content, "utf-8");
  } finally {
    await handle.close();
  }
}

export function makeStatePayload(
  config: RunConfig,
  resultsPath: string,
  statePath: string,
): RunState {
  const now = utcNow();
  const durationSeconds = parseDurationSeconds(config.duration);
  const deadlineAt = durationSeconds != null
    ? new Date(Date.now() + durationSeconds * 1000).toISOString().split(".")[0] + "Z"
    : undefined;

  const subagentPool = buildSubagentPoolPlan({
    goal: config.goal,
    scope: config.scope ?? "current repository",
    mode: config.mode,
  });
  const continuationPolicy = buildContinuationPolicy(config.mode);
  const draftPool = (config.num_drafts ?? 1) > 1
    ? buildDraftPoolPlan({
        num_drafts: config.num_drafts ?? 1,
        branch_selection_policy: config.branch_selection_policy ?? "best",
        baseline_iteration: 0,
      })
    : undefined;

  const runId = config.run_tag ?? `run-${Date.now().toString(36)}`;
  return {
    schema_version: 1,
    run_id: runId,
    created_at: now,
    updated_at: now,
    status: "initialized",
    mode: config.mode,
    operating_mode: normalizeOperatingMode(config.operating_mode),
    goal: config.goal,
    scope: config.scope ?? "current repository",
    metric: {
      name: config.outcome_metric ?? config.metric,
      direction: normalizeDirection(config.outcome_direction ?? config.direction),
      baseline: config.baseline,
      best: config.baseline,
      latest: config.baseline,
    },
    instrument_metric: config.instrument_metric ? {
      name: config.instrument_metric,
      direction: normalizeDirection(config.instrument_direction ?? config.direction),
      baseline: config.baseline,
      best: config.baseline,
      latest: config.baseline,
    } : undefined,
    verify: config.verify,
    guard: config.guard,
    scorer: config.scorer,
    max_no_progress: config.max_no_progress,
    iterations_cap: config.iterations,
    duration: config.duration,
    duration_seconds: durationSeconds ?? undefined,
    deadline_at: deadlineAt,
    label_requirements: {
      keep: normalizeLabels(config.required_keep_labels ?? []),
      stop: normalizeLabels(config.required_stop_labels ?? []),
    },
    stop_condition: config.stop_condition,
    artifact_paths: {
      results: resultsPath,
      state: statePath,
    },
    stats: {
      total_iterations: 0,
      kept: 0,
      discarded: 0,
      needs_human: 0,
      consecutive_discards: 0,
      best_iteration: undefined,
    },
    flags: {
      stop_requested: false,
      needs_human: false,
      background_active: config.mode === "background",
      stop_ready: false,
    },
    subagent_pool: subagentPool,
    continuation_policy: continuationPolicy,
    draft_pool: draftPool,
    lineage: {
      id: `exp-${runId}`,
      parent_id: null,
      branch: "main",
      stage: "experiment",
      agent: "orchestrator",
    },
  };
}

export async function setStopRequested(
  repo: string | undefined,
  statePathValue: string | undefined,
): Promise<RunState> {
  const statePath = resolvePath(repo, statePathValue, STATE_DEFAULT);
  const state = parseRunState(readJsonFile(statePath));
  if (state.mode !== "background") {
    throw new AutoresearchError("Only background runs can be stopped.");
  }
  state.updated_at = utcNow();
  state.flags.stop_requested = true;
  state.flags.background_active = false;
  state.status = "stopping";
  atomicWriteJson(statePath, state);
  return state;
}

export async function resumeBackgroundRun(
  repo: string | undefined,
  statePathValue: string | undefined,
): Promise<RunState> {
  const statePath = resolvePath(repo, statePathValue, STATE_DEFAULT);
  const state = parseRunState(readJsonFile(statePath));
  if (state.mode !== "background") {
    throw new AutoresearchError("Only background runs can be resumed.");
  }
  if (state.status === "completed") {
    throw new AutoresearchError("Completed runs cannot be resumed.");
  }
  state.updated_at = utcNow();
  state.flags.stop_requested = false;
  state.flags.needs_human = false;
  state.flags.background_active = true;
  state.status = "running";
  atomicWriteJson(statePath, state);
  return state;
}

export async function completeRun(
  repo: string | undefined,
  statePathValue: string | undefined,
): Promise<RunState> {
  const statePath = resolvePath(repo, statePathValue, STATE_DEFAULT);
  const state = parseRunState(readJsonFile(statePath));
  if (state.status === "completed") return state;
  state.updated_at = utcNow();
  state.status = "completed";
  state.flags.background_active = false;
  state.flags.needs_human = false;
  state.flags.stop_requested = false;
  state.flags.stop_ready = false;
  atomicWriteJson(statePath, state);
  return state;
}


async function countResultsRows(resultsPath: string): Promise<number> {
  try {
    const pathStats = await lstat(resultsPath);
    if (pathStats.isSymbolicLink()) {
      throw new AutoresearchError(`Refusing to read symlinked results file: ${resultsPath}`);
    }
  } catch (err) {
    if (err instanceof AutoresearchError) throw err;
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return 0;
    throw err;
  }

  let handle;
  try {
    const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
    handle = await open(resultsPath, constants.O_RDONLY | noFollow);
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return 0;
    if (code === "ELOOP") {
      throw new AutoresearchError(`Refusing to read symlinked results file: ${resultsPath}`);
    }
    throw err;
  }

  try {
    const stats = await handle.stat();
    if (!stats.isFile()) {
      throw new AutoresearchError(`Refusing to read non-regular results file: ${resultsPath}`);
    }
    if (stats.size > MAX_RESULTS_BYTES) {
      throw new AutoresearchError(`Refusing to read results file larger than ${MAX_RESULTS_BYTES} bytes: ${resultsPath}`);
    }

    const content = await handle.readFile("utf-8");
    return content.split("\n").filter((l: string) => l.trim() && !l.startsWith("timestamp")).length;
  } finally {
    await handle.close();
  }
}

export async function buildSupervisorSnapshot(
  repo: string | undefined,
  resultsPathValue: string | undefined,
  statePathValue: string | undefined,
): Promise<SupervisorSnapshot> {
  const resultsPath = resolvePath(repo, resultsPathValue, RESULTS_DEFAULT);
  const statePath = resolvePath(repo, statePathValue, STATE_DEFAULT);
  const state = parseRunState(readJsonFile(statePath));

  const resultsRows = await countResultsRows(resultsPath);

  let decision = "relaunch";
  let reason = "ready_for_next_iteration";

  if (state.flags.stop_requested) {
    decision = "stop";
    reason = "stop_requested";
  } else if (state.flags.needs_human) {
    decision = "needs_human";
    reason = "human_input_required";
  } else if (state.deadline_at && new Date() >= new Date(state.deadline_at)) {
    decision = "stop";
    reason = "duration_elapsed";
  } else if (state.iterations_cap != null && state.stats.total_iterations >= state.iterations_cap) {
    decision = "stop";
    reason = "iteration_cap_reached";
  } else if (state.max_no_progress != null && state.stats.consecutive_discards >= state.max_no_progress) {
    decision = "stop";
    reason = "no_progress";
  } else if (state.status === "completed" || state.status === "stopped") {
    decision = "stop";
    reason = `state_${state.status}`;
  }

  return {
    decision,
    reason,
    run_id: state.run_id,
    status: state.status,
    mode: state.mode,
    operating_mode: state.operating_mode,
    goal: state.goal,
    metric: state.metric,
    instrument_metric: state.instrument_metric,
    stats: state.stats,
    last_iteration: state.last_iteration,
    results_rows: resultsRows,
    artifact_paths: state.artifact_paths,
    flags: state.flags,
    label_requirements: state.label_requirements,
    subagent_pool: state.subagent_pool,
    continuation_policy: state.continuation_policy,
    draft_pool: state.draft_pool,
  };
}

export interface ResultRow {
  timestamp: string;
  iteration: number;
  id: string;
  parent_id: string;
  branch: string;
  stage: string;
  agent: string;
  decision: string;
  metric_value: string;
  instrument_value: string;
  verify_status: string;
  guard_status: string;
  hypothesis: string;
  change_summary: string;
  labels: string;
  note: string;
}

export function parseResultRow(line: string): ResultRow | null {
  if (!line.trim()) return null;
  const parts = line.split("\t");

  if (parts.length < 11) return null;

if (parts.length === 11) {
    return {
      timestamp: parts[0],
      iteration: parseInt(parts[1], 10),
      decision: parts[2],
      metric_value: parts[3],
      instrument_value: parts[4],
      verify_status: parts[5],
      guard_status: parts[6],
      hypothesis: parts[7],
      change_summary: parts[8],
      labels: parts[9],
      note: parts[10],
      id: "",
      parent_id: "",
      branch: "main",
      stage: "",
      agent: "",
    };
  }

  if (parts.length < 16) return null;

  return {
    timestamp: parts[0],
    iteration: parseInt(parts[1], 10),
    id: parts[2],
    parent_id: parts[3],
    branch: parts[4],
    stage: parts[5],
    agent: parts[6],
    decision: parts[7],
    metric_value: parts[8],
    instrument_value: parts[9],
    verify_status: parts[10],
    guard_status: parts[11],
    hypothesis: parts[12],
    change_summary: parts[13],
    labels: parts[14],
    note: parts[15],
  };
}
