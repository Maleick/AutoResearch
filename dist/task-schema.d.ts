export type TaskSource = "cli" | "hermes" | "mcp" | "webhook" | "api";
export interface TaskContext {
    id: string;
    source: TaskSource;
    origin?: string;
    owner?: string;
    goal: string;
    scope?: string;
    metric: TaskMetric;
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
export declare function createTaskContext(params: {
    id: string;
    source: TaskSource;
    goal: string;
    metric: TaskMetric;
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
}): TaskContext;
export declare function validateTaskContext(context: unknown): context is TaskContext;
//# sourceMappingURL=task-schema.d.ts.map