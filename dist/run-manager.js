import { utcNow, ensureParent, atomicWriteJson, readJsonFile, parseRunState, resolvePath, normalizeDirection, normalizeOperatingMode, parseDurationSeconds, normalizeLabels, missingRequiredLabels, AutoresearchError, } from "./helpers.js";
import { RESULTS_DEFAULT, STATE_DEFAULT } from "./constants.js";
import { buildSubagentPoolPlan, buildContinuationPolicy } from "./subagent-pool.js";
import { writeFileSync, appendFileSync, existsSync, constants } from "fs";
import { lstat, open } from "fs/promises";
const MAX_RESULTS_BYTES = 10 * 1024 * 1024;
export async function initializeRun(repo, resultsPathValue, statePathValue, config, freshStart) {
    const resultsPath = resolvePath(repo, resultsPathValue, RESULTS_DEFAULT);
    const statePath = resolvePath(repo, statePathValue, STATE_DEFAULT);
    if (existsSync(statePath) && !freshStart) {
        throw new AutoresearchError(`${statePath} already exists. Use --fresh-start to archive.`);
    }
    const header = "timestamp\titeration\tdecision\tmetric_value\tverify_status\tguard_status\thypothesis\tchange_summary\tlabels\tnote\n";
    ensureParent(resultsPath);
    if (!existsSync(resultsPath)) {
        writeFileSync(resultsPath, header, "utf-8");
    }
    const state = makeStatePayload(config, resultsPath, statePath);
    atomicWriteJson(statePath, state);
    return state;
}
export async function appendIteration(repo, resultsPathValue, statePathValue, decision, metricValue, verifyStatus, guardStatus, hypothesis, changeSummary, labels, note, iteration) {
    const resultsPath = resolvePath(repo, resultsPathValue, RESULTS_DEFAULT);
    const statePath = resolvePath(repo, statePathValue, STATE_DEFAULT);
    const state = parseRunState(readJsonFile(statePath));
    const currentIteration = iteration ?? state.stats.total_iterations + 1;
    const now = utcNow();
    const labelList = normalizeLabels(labels ?? []);
    const labelReqs = state.label_requirements ?? { keep: [], stop: [] };
    const requiredKeep = normalizeLabels(labelReqs.keep ?? []);
    const requiredStop = normalizeLabels(labelReqs.stop ?? []);
    const missingKeep = missingRequiredLabels(labelList, requiredKeep);
    const missingStop = missingRequiredLabels(labelList, requiredStop);
    if (decision === "keep" && missingKeep.length > 0) {
        throw new AutoresearchError(`Keep requires labels: ${missingKeep.join(", ")}`);
    }
    const resultRow = [
        now,
        String(currentIteration),
        decision,
        metricValue ?? "",
        verifyStatus,
        guardStatus,
        hypothesis ?? "",
        changeSummary,
        labelList.join(","),
        note ?? "",
    ].join("\t") + "\n";
    appendFileSync(resultsPath, resultRow, "utf-8");
    const newState = {
        ...state,
        updated_at: now,
        status: "running",
        stats: {
            ...state.stats,
            total_iterations: currentIteration,
        },
        flags: {
            ...state.flags,
            stop_ready: decision === "keep" && missingStop.length === 0,
        },
    };
    if (decision === "keep") {
        newState.stats.kept = newState.stats.kept + 1;
        newState.stats.consecutive_discards = 0;
    }
    else if (decision === "discard") {
        newState.stats.discarded = newState.stats.discarded + 1;
        newState.stats.consecutive_discards = newState.stats.consecutive_discards + 1;
    }
    else if (decision === "needs_human") {
        newState.stats.needs_human = newState.stats.needs_human + 1;
        newState.flags.needs_human = true;
        newState.stats.consecutive_discards = 0;
    }
    newState.last_iteration = {
        iteration: currentIteration,
        decision,
        metric_value: metricValue,
        change_summary: changeSummary,
        labels: labelList,
        timestamp: now,
        keep_labels_satisfied: missingKeep.length === 0,
        stop_labels_satisfied: missingStop.length === 0,
        missing_keep_labels: missingKeep,
        missing_stop_labels: missingStop,
    };
    atomicWriteJson(statePath, newState);
    return newState;
}
export function makeStatePayload(config, resultsPath, statePath) {
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
    return {
        schema_version: 1,
        run_id: config.run_tag ?? `run-${Date.now().toString(36)}`,
        created_at: now,
        updated_at: now,
        status: "initialized",
        mode: config.mode,
        operating_mode: normalizeOperatingMode(config.operating_mode),
        goal: config.goal,
        scope: config.scope ?? "current repository",
        metric: {
            name: config.metric,
            direction: normalizeDirection(config.direction),
            baseline: config.baseline,
            best: config.baseline,
            latest: config.baseline,
        },
        verify: config.verify,
        guard: config.guard,
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
    };
}
export async function setStopRequested(repo, statePathValue) {
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
export async function resumeBackgroundRun(repo, statePathValue) {
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
export async function completeRun(repo, statePathValue) {
    const statePath = resolvePath(repo, statePathValue, STATE_DEFAULT);
    const state = parseRunState(readJsonFile(statePath));
    if (state.status === "completed")
        return state;
    state.updated_at = utcNow();
    state.status = "completed";
    state.flags.background_active = false;
    state.flags.needs_human = false;
    state.flags.stop_requested = false;
    state.flags.stop_ready = false;
    atomicWriteJson(statePath, state);
    return state;
}
async function countResultsRows(resultsPath) {
    try {
        const pathStats = await lstat(resultsPath);
        if (pathStats.isSymbolicLink()) {
            throw new AutoresearchError(`Refusing to read symlinked results file: ${resultsPath}`);
        }
    }
    catch (err) {
        if (err instanceof AutoresearchError)
            throw err;
        const code = err.code;
        if (code === "ENOENT")
            return 0;
        throw err;
    }
    let handle;
    try {
        const noFollow = typeof constants.O_NOFOLLOW === "number" ? constants.O_NOFOLLOW : 0;
        handle = await open(resultsPath, constants.O_RDONLY | noFollow);
    }
    catch (err) {
        const code = err.code;
        if (code === "ENOENT")
            return 0;
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
        return content.split("\n").filter((l) => l.trim() && !l.startsWith("timestamp")).length;
    }
    finally {
        await handle.close();
    }
}
export async function buildSupervisorSnapshot(repo, resultsPathValue, statePathValue) {
    const resultsPath = resolvePath(repo, resultsPathValue, RESULTS_DEFAULT);
    const statePath = resolvePath(repo, statePathValue, STATE_DEFAULT);
    const state = parseRunState(readJsonFile(statePath));
    const resultsRows = await countResultsRows(resultsPath);
    let decision = "relaunch";
    let reason = "ready_for_next_iteration";
    if (state.flags.stop_requested) {
        decision = "stop";
        reason = "stop_requested";
    }
    else if (state.flags.needs_human) {
        decision = "needs_human";
        reason = "human_input_required";
    }
    else if (state.deadline_at && new Date() >= new Date(state.deadline_at)) {
        decision = "stop";
        reason = "duration_elapsed";
    }
    else if (state.iterations_cap != null && state.stats.total_iterations >= state.iterations_cap) {
        decision = "stop";
        reason = "iteration_cap_reached";
    }
    else if (state.max_no_progress != null && state.stats.consecutive_discards >= state.max_no_progress) {
        decision = "stop";
        reason = "no_progress";
    }
    else if (state.status === "completed" || state.status === "stopped") {
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
        stats: state.stats,
        last_iteration: state.last_iteration,
        results_rows: resultsRows,
        artifact_paths: state.artifact_paths,
        flags: state.flags,
        label_requirements: state.label_requirements,
    };
}
//# sourceMappingURL=run-manager.js.map