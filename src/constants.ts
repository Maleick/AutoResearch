export const VERSION = "3.14.2";
export const PACKAGE_NAME = "opencode-autoresearch";
export const SKILL_NAME = "autoresearch";
export const PRODUCT_BRAND = "Auto Research";
export const RESULTS_DEFAULT = "autoresearch-results.tsv";
export const STATE_DEFAULT = ".autoresearch/state.json";
export const SCORE_HISTORY_DEFAULT = ".autoresearch/score-history.jsonl";
export const LAUNCH_DEFAULT = ".autoresearch/launch.json";
export const MEMORY_DEFAULT = "autoresearch-memory.md";
export const MEMORY_AUDIT_DEFAULT = ".autoresearch/memory-audit.log";
export const GOAL_DEFAULT = ".autoresearch/goal.md";
export const MEMORY_CONSOLIDATION_THRESHOLD = 3;
export const MAX_DRAFTS = 64;
export const MEMORY_EXPIRY_DAYS = 30;

export const RUN_STAGES = ["draft", "debug", "improve", "verify", "complete"] as const;
export const STAGE_TRANSITIONS: Record<string, string[]> = {
  draft: ["debug", "draft"],
  debug: ["improve", "debug", "draft"],
  improve: ["verify", "improve", "debug"],
  verify: ["complete", "improve", "verify"],
  complete: [],
};
