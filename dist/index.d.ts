export declare const id = "autoresearch";
export declare const repoRoot: any;
export declare const version = "3.6.0";
type OpenCodeConfig = {
    command?: Record<string, {
        template: string;
    }>;
    skills?: {
        paths?: string[];
    };
};
export declare function server(): Promise<{
    config(config: OpenCodeConfig): void;
    event(): undefined;
}>;
declare const _default: {
    id: string;
    server: typeof server;
};
export default _default;
export { VERSION, PACKAGE_NAME, PRODUCT_BRAND, SKILL_NAME, } from "./constants.js";
export { createTaskContext, validateTaskContext, } from "./task-schema.js";
export { taskContextFromRunConfig, runConfigFromTaskContext, } from "./translators/cli.js";
export { taskContextFromHermesPayload, hermesPayloadFromTaskContext, taskContextFromRunState, } from "./translators/hermes.js";
export type { TaskSource, TaskContext, TaskMetric, TaskConstraints, TaskIterationPolicy, TaskResult, } from "./task-schema.js";
export type { HermesTaskPayload, } from "./translators/hermes.js";
export type { RunConfig, WizardConfig, Metric, RunStats, RunFlags, LastIteration, RunState, SupervisorSnapshot, LabelRequirements, ArtifactPaths, } from "./types.js";
//# sourceMappingURL=index.d.ts.map