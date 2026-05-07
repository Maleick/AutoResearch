import type { WizardConfig } from "./types.js";
import { basename } from "path";
import {
  resolveRepo,
  normalizeDirection,
  normalizeMode,
  parseDurationSeconds,
  normalizeLabels,
  inferVerifyCommand,
} from "./helpers.js";
import { buildSubagentPoolPlan, buildContinuationPolicy } from "./subagent-pool.js";

export function buildSetupSummary(
  repo: string | undefined,
  config: WizardConfig,
): Record<string, unknown> {
  const explicitVerify = config.verify?.trim();
  const verify = explicitVerify || inferVerifyCommand(repo);
  const direction = normalizeDirection(config.direction);
  const mode = normalizeMode(config.mode);
  const durationSeconds = parseDurationSeconds(config.duration);
  const scope = config.scope ?? (basename(resolveRepo(repo)) || "current repository");
  const subagentPool = buildSubagentPoolPlan({
    goal: config.goal ?? "pending",
    scope,
    mode: config.mode ?? "foreground",
  });
  const continuationPolicy = buildContinuationPolicy(mode);

  const missingRequired: string[] = [];
  if (!config.goal) missingRequired.push("goal");
  if (!explicitVerify) missingRequired.push("verify");

  const stopReasons: string[] = [];
  if (verify !== "<set verify command>") {
    stopReasons.push(`\`${verify}\` reaches the target metric`);
  }
  if (config.iterations != null) stopReasons.push(`${config.iterations} iterations complete`);
  if (config.duration) stopReasons.push(`${config.duration} elapses`);

  const questions: { id: string; prompt: string; reason: string }[] = [];
  if (!config.goal) questions.push({ id: "goal", prompt: "What outcome should this run optimize for?", reason: "The loop needs one concrete result to chase." });
  if (!explicitVerify) questions.push({ id: "verify", prompt: "What command should mechanically verify the metric?", reason: "The loop should not keep changes on intuition alone." });
  if (!config.mode) questions.push({ id: "mode", prompt: "Should the run stay in `foreground` or move to `background`?", reason: "The skill requires an explicit run-mode choice." });

  return {
    goal: config.goal,
    scope,
    metric: config.metric ?? "primary verify metric",
    direction,
    verify,
    guard: config.guard,
    mode,
    iterations_cap: config.iterations,
    duration: config.duration,
    duration_seconds: durationSeconds,
    subagent_pool: subagentPool,
    continuation_policy: continuationPolicy,
    required_keep_labels: normalizeLabels(config.required_keep_labels ?? []),
    required_stop_labels: normalizeLabels(config.required_stop_labels ?? []),
    stop_condition: config.stop_condition ?? `stop when ${stopReasons.join(" or ")}`,
    rollback_strategy: config.rollback_strategy ?? "discard current experiment and keep last verified state",
    missing_required: missingRequired,
    questions,
  };
}
