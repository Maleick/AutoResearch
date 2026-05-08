import type { DraftBranch, DraftPoolConfig } from "./types.js";
export interface RoleTemplate {
    id: string;
    name: string;
    focus: string;
    triggers?: string[];
}
export declare function buildSubagentPoolPlan(params: {
    goal: string;
    scope?: string;
    mode: string;
}): Record<string, unknown>;
export declare function buildContinuationPolicy(mode: string): Record<string, unknown>;
export interface DraftPoolConfigInput {
    num_drafts: number;
    branch_selection_policy: "best" | "roulette" | "diverse";
    baseline_iteration?: number;
}
export declare function buildDraftPoolPlan(input: DraftPoolConfigInput): DraftPoolConfig;
export declare function selectNextBranch(activeDrafts: DraftBranch[], policy: "best" | "roulette" | "diverse", direction: "lower" | "higher"): string | undefined;
//# sourceMappingURL=subagent-pool.d.ts.map