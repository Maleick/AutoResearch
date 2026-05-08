import type {
  TaskContext,
  TaskMetric,
  TaskIterationPolicy,
} from "../task-schema.js";
import type { RunState } from "../types.js";

export interface HermesTaskPayload {
  run_id: string;
  goal: string;
  metric: {
    name: string;
    direction: "lower" | "higher";
    baseline?: string;
  };
  verify_command: string;
  guard_command?: string;
  mode: "foreground" | "background";
  scope?: string;
  max_iterations?: number;
  max_duration_seconds?: number;
  required_keep_labels?: string[];
  required_stop_labels?: string[];
  stop_condition?: string;
  origin?: string;
  owner?: string;
  metadata?: Record<string, unknown>;
}

export function taskContextFromHermesPayload(
  payload: HermesTaskPayload
): TaskContext {
  const metric: TaskMetric = {
    name: payload.metric.name,
    direction: payload.metric.direction,
    baseline: payload.metric.baseline,
  };

  const policy: TaskIterationPolicy = {
    mode: payload.mode,
    stop_condition: payload.stop_condition,
  };

  return {
    id: payload.run_id,
    source: "hermes",
    origin: payload.origin,
    owner: payload.owner,
    goal: payload.goal,
    scope: payload.scope,
    metric,
    verify_command: payload.verify_command,
    guard_command: payload.guard_command,
    constraints: {
      max_iterations: payload.max_iterations,
      max_duration_seconds: payload.max_duration_seconds,
      required_keep_labels: payload.required_keep_labels,
      required_stop_labels: payload.required_stop_labels,
    },
    iteration_policy: policy,
    metadata: payload.metadata,
  };
}

export function hermesPayloadFromTaskContext(
  context: TaskContext
): HermesTaskPayload {
  return {
    run_id: context.id,
    goal: context.goal,
    metric: {
      name: context.metric.name,
      direction: context.metric.direction,
      baseline: context.metric.baseline,
    },
    verify_command: context.verify_command ?? "",
    guard_command: context.guard_command,
    mode: context.iteration_policy?.mode ?? "foreground",
    scope: context.scope,
    max_iterations: context.constraints.max_iterations,
    max_duration_seconds: context.constraints.max_duration_seconds,
    required_keep_labels: context.constraints.required_keep_labels,
    required_stop_labels: context.constraints.required_stop_labels,
    stop_condition: context.iteration_policy?.stop_condition,
    origin: context.origin,
    owner: context.owner,
    metadata: context.metadata,
  };
}

export function taskContextFromRunState(state: RunState): TaskContext {
  return {
    id: state.run_id,
    source: "hermes",
    goal: state.goal,
    scope: state.scope,
    metric: {
      name: state.metric.name,
      direction: state.metric.direction as "lower" | "higher",
      baseline: state.metric.baseline,
    },
    verify_command: state.verify,
    guard_command: state.guard,
    constraints: {
      max_iterations: state.iterations_cap,
      max_duration_seconds: state.duration_seconds,
      required_keep_labels: state.label_requirements.keep,
      required_stop_labels: state.label_requirements.stop,
    },
    iteration_policy: {
      mode: state.mode as "foreground" | "background",
      stop_condition: state.stop_condition,
    },
    metadata: state.memory,
  };
}

export function runStateFromTaskContext(context: TaskContext): Partial<RunState> {
  return {
    run_id: context.id,
    goal: context.goal,
    scope: context.scope ?? "",
    metric: {
      name: context.metric.name,
      direction: context.metric.direction,
      baseline: context.metric.baseline,
    },
    verify: context.verify_command ?? "",
    guard: context.guard_command,
    mode: context.iteration_policy?.mode ?? "foreground",
    iterations_cap: context.constraints.max_iterations,
    duration_seconds: context.constraints.max_duration_seconds ?? undefined,
    stop_condition: context.iteration_policy?.stop_condition,
    label_requirements: {
      keep: context.constraints.required_keep_labels ?? [],
      stop: context.constraints.required_stop_labels ?? [],
    },
  };
}