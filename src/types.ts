export interface LabelRequirements {
  keep: string[];
  stop: string[];
}

export interface ArtifactPaths {
  results: string;
  state: string;
}

export interface RunConfig {
  goal: string;
  metric: string;
  direction: string;
  verify: string;
  mode: string;
  operating_mode?: string;
  scope?: string;
  guard?: string;
  iterations?: number;
  max_no_progress?: number;
  duration?: string;
  memory_path?: string;
  required_keep_labels?: string[];
  required_stop_labels?: string[];
  run_tag?: string;
  stop_condition?: string;
  baseline?: string;
  num_drafts?: number;
  branch_selection_policy?: "best" | "roulette" | "diverse";
  outcome_metric?: string;
  outcome_direction?: string;
  instrument_metric?: string;
  instrument_direction?: string;
}

export type WizardConfig = Partial<Omit<RunConfig, 'baseline'>> & {
  rollback_strategy?: string;
};

export interface Metric extends Record<string, unknown> {
  name: string;
  direction: string;
  baseline?: string;
  best?: string;
  latest?: string;
}

export interface RunStats {
  total_iterations: number;
  kept: number;
  discarded: number;
  needs_human: number;
  consecutive_discards: number;
  best_iteration?: number;
}

export interface RunFlags {
  stop_requested: boolean;
  needs_human: boolean;
  background_active: boolean;
  stop_ready: boolean;
}

export interface LastIteration {
  iteration: number;
  decision: string;
  metric_value?: string;
  instrument_value?: string;
  change_summary: string;
  labels: string[];
  timestamp: string;
  keep_labels_satisfied: boolean;
  stop_labels_satisfied: boolean;
  missing_keep_labels: string[];
  missing_stop_labels: string[];
  score_components?: Record<string, number>;
}

export type OperatingMode = "converge" | "continuous" | "supervised";

export interface RunState {
  schema_version: number;
  run_id: string;
  created_at: string;
  updated_at: string;
  status: string;
  mode: string;
  operating_mode: OperatingMode;
  goal: string;
  scope: string;
  metric: Metric;
  instrument_metric?: Metric;
  verify: string;
  guard?: string;
  max_no_progress?: number;
  iterations_cap?: number;
  duration?: string;
  duration_seconds?: number;
  deadline_at?: string;
  memory?: Record<string, unknown>;
  subagent_pool?: Record<string, unknown>;
  continuation_policy?: Record<string, unknown>;
  label_requirements: LabelRequirements;
  stop_condition?: string;
  artifact_paths: ArtifactPaths;
  stats: RunStats;
  flags: RunFlags;
  last_iteration?: LastIteration;
  draft_pool?: DraftPoolConfig;
}

export interface SupervisorSnapshot {
  decision: string;
  reason: string;
  run_id: string;
  status: string;
  mode: string;
  operating_mode: OperatingMode;
  goal: string;
  metric: Metric;
  instrument_metric?: Metric;
  stats: RunStats;
  last_iteration?: LastIteration;
  results_rows: number;
  artifact_paths: ArtifactPaths;
  flags: RunFlags;
  label_requirements: LabelRequirements;
  subagent_pool?: Record<string, unknown>;
  continuation_policy?: Record<string, unknown>;
  subagent_guidance?: Record<string, unknown>;
  draft_pool?: DraftPoolConfig;
}

export interface DraftBranch {
  branch_id: string;
  iteration: number;
  parent_iteration: number;
  metric_value?: string;
  status: "pending" | "running" | "completed" | "discarded";
}

export interface MemoryProvenance {
  run_id: string;
  iteration: number;
  goal: string;
  metric_name: string;
  metric_value: string;
  direction: string;
  timestamp: string;
  labels: string[];
}

export interface MemoryItem {
  id: string;
  pattern: string;
  description: string;
  provenance: MemoryProvenance;
  verification_count: number;
  first_observed: string;
  consolidated_at: string;
  status: "active" | "expired";
  expired_at?: string;
}

export interface PendingMemoryItem {
  id: string;
  pattern: string;
  description: string;
  provenance: MemoryProvenance;
  verification_count: number;
  first_observed: string;
  last_verified: string;
}

export interface MemoryConsolidationState {
  pending_items: PendingMemoryItem[];
  consolidated_items: MemoryItem[];
  consolidation_threshold: number;
  last_consolidated?: string;
}

export interface MemoryAuditLogEntry {
  timestamp: string;
  action: "added" | "expired" | "promoted";
  item_id: string;
  pattern: string;
  provenance: MemoryProvenance;
  verification_count: number;
  reason?: string;
}

export interface DraftPoolConfig {
  kind: "autoresearch_draft_pool";
  version: number;
  num_drafts: number;
  branch_selection_policy: "best" | "roulette" | "diverse";
  active_drafts: DraftBranch[];
  best_branch_id?: string;
}
