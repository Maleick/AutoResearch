import { existsSync } from "fs";
import { resolvePath, parseRunState, readJsonFile } from "./helpers.js";
import { STATE_DEFAULT } from "./constants.js";

export interface WorkerOnceResult {
  ready: boolean;
  run_id: string;
  status: string;
  iteration: number;
  goal: string;
  metric?: string;
  reason?: string;
}

export function workerOnce(
  repo?: string,
  statePathValue?: string,
  _resultsPathValue?: string,
): WorkerOnceResult {
  const statePath = resolvePath(repo, statePathValue, STATE_DEFAULT);

  if (!existsSync(statePath)) {
    return {
      ready: false,
      run_id: "none",
      status: "missing",
      iteration: 0,
      goal: "(none)",
      reason: `No run state found at ${statePath}`,
    };
  }

  const state = parseRunState(readJsonFile(statePath));
  const runId = state.run_id ?? "unknown";

  const terminalStatuses = new Set(["completed", "stopped", "error"]);
  if (terminalStatuses.has(state.status)) {
    return {
      ready: false,
      run_id: runId,
      status: state.status,
      iteration: state.stats.total_iterations ?? 0,
      goal: state.goal ?? "(none)",
      reason: `Run is terminal (${state.status})`,
    };
  }

  if (state.flags?.stop_requested) {
    return {
      ready: false,
      run_id: runId,
      status: "stopping",
      iteration: state.stats.total_iterations ?? 0,
      goal: state.goal ?? "(none)",
      reason: "Stop requested",
    };
  }

  if (state.deadline_at) {
    const deadline = new Date(state.deadline_at).getTime();
    if (Date.now() > deadline) {
      return {
        ready: false,
        run_id: runId,
        status: "deadline_exceeded",
        iteration: state.stats.total_iterations ?? 0,
        goal: state.goal ?? "(none)",
        reason: `Deadline passed (${state.deadline_at})`,
      };
    }
  }

  const iterCap = state.iterations_cap;
  const currentIter = state.stats.total_iterations ?? 0;
  if (typeof iterCap === "number" && currentIter >= iterCap) {
    return {
      ready: false,
      run_id: runId,
      status: state.status,
      iteration: currentIter,
      goal: state.goal ?? "(none)",
      reason: `Iteration cap reached (${currentIter}/${iterCap})`,
    };
  }

  const nextIteration = currentIter + 1;

  return {
    ready: true,
    run_id: runId,
    status: state.status,
    iteration: nextIteration,
    goal: state.goal ?? "(none)",
    metric: state.metric ? `${state.metric.name || "metric"} (${state.metric.direction || "lower"})` : undefined,
    reason: undefined,
  };
}
