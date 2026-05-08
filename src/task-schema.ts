export type TaskSource = "cli" | "hermes" | "mcp" | "webhook" | "api";

export interface TaskContext {
  id: string;
  source: TaskSource;
  origin?: string;
  owner?: string;
  goal: string;
  scope?: string;
  metric: TaskMetric;
  instrument_metric?: TaskMetric;
  verify_command?: string;
  guard_command?: string;
  constraints: TaskConstraints;
  iteration_policy?: TaskIterationPolicy;
  metadata?: Record<string, unknown>;
}

export interface TaskMetric {
  name: string;
  direction: "lower" | "higher";
  baseline?: string;
  target?: string;
}

export interface TaskConstraints {
  max_iterations?: number;
  max_duration_seconds?: number;
  required_keep_labels?: string[];
  required_stop_labels?: string[];
}

export interface TaskIterationPolicy {
  mode: "foreground" | "background";
  stop_condition?: string;
  rollback_strategy?: string;
}

export interface TaskResult {
  task_id: string;
  decision: "keep" | "discard" | "needs_human" | "stopped";
  metric_value?: string;
  change_summary?: string;
  labels: string[];
  timestamp: string;
}

export function createTaskContext(params: {
  id: string;
  source: TaskSource;
  goal: string;
  metric: TaskMetric;
  instrument_metric?: TaskMetric;
  verify_command?: string;
  guard_command?: string;
  scope?: string;
  max_iterations?: number;
  max_duration_seconds?: number;
  mode?: "foreground" | "background";
  required_keep_labels?: string[];
  required_stop_labels?: string[];
  origin?: string;
  owner?: string;
  stop_condition?: string;
  metadata?: Record<string, unknown>;
}): TaskContext {
  return {
    id: params.id,
    source: params.source,
    origin: params.origin,
    owner: params.owner,
    goal: params.goal,
    scope: params.scope,
    metric: params.metric,
    instrument_metric: params.instrument_metric,
    verify_command: params.verify_command,
    guard_command: params.guard_command,
    constraints: {
      max_iterations: params.max_iterations,
      max_duration_seconds: params.max_duration_seconds,
      required_keep_labels: params.required_keep_labels,
      required_stop_labels: params.required_stop_labels,
    },
    iteration_policy: {
      mode: params.mode ?? "foreground",
      stop_condition: params.stop_condition,
    },
    metadata: params.metadata,
  };
}

export function validateTaskContext(context: unknown): context is TaskContext {
  if (typeof context !== "object" || context === null) return false;
  const obj = context as Record<string, unknown>;
  if (typeof obj.id !== "string") return false;
  if (!["cli", "hermes", "mcp", "webhook", "api"].includes(obj.source as string)) return false;
  if (typeof obj.goal !== "string") return false;
  if (!isValidMetricShape(obj.metric)) return false;
  if (obj.instrument_metric !== undefined && !isValidMetricShape(obj.instrument_metric)) return false;
  return true;
}

function isValidMetricShape(metric: unknown): boolean {
  if (typeof metric !== "object" || metric === null) return false;
  const m = metric as Record<string, unknown>;
  return typeof m.name === "string" && ["lower", "higher"].includes(m.direction as string);
}