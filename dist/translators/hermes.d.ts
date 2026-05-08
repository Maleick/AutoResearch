import type { TaskContext } from "../task-schema.js";
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
export declare function taskContextFromHermesPayload(payload: HermesTaskPayload): TaskContext;
export declare function hermesPayloadFromTaskContext(context: TaskContext): HermesTaskPayload;
export declare function taskContextFromRunState(state: RunState): TaskContext;
export declare function runStateFromTaskContext(context: TaskContext): Partial<RunState>;
//# sourceMappingURL=hermes.d.ts.map