import type { WizardConfig } from "./types.js";
import { normalizeDirection, normalizeMode } from "./helpers.js";

export interface GoalTemplate {
  id: string;
  name: string;
  description: string;
  defaults: Partial<WizardConfig>;
}

export const GOAL_TEMPLATES: GoalTemplate[] = [
  {
    id: "performance",
    name: "Performance",
    description: "Reduce runtime or memory usage",
    defaults: {
      goal: "Reduce runtime or memory usage",
      metric: "benchmark_ms",
      direction: "lower",
      verify: "npm run bench",
      scope: "src/",
    },
  },
  {
    id: "quality",
    name: "Quality",
    description: "Reduce error rate or test failures",
    defaults: {
      goal: "Reduce test failures and improve code quality",
      metric: "test_failures",
      direction: "lower",
      verify: "npm test",
      scope: "src/",
    },
  },
  {
    id: "coverage",
    name: "Coverage",
    description: "Increase test coverage",
    defaults: {
      goal: "Increase test coverage",
      metric: "coverage_pct",
      direction: "higher",
      verify: "npm run coverage",
      scope: "src/",
    },
  },
  {
    id: "custom",
    name: "Custom",
    description: "Blank template — fill in all fields",
    defaults: {},
  },
];

export function getGoalTemplate(id: string): GoalTemplate | undefined {
  return GOAL_TEMPLATES.find((t) => t.id === id);
}

export function buildGoalDocument(config: WizardConfig & { template?: string }): string {
  const direction = normalizeDirection(config.direction);
  const mode = normalizeMode(config.mode);

  const lines: string[] = [];
  lines.push(`# Goal: ${config.goal ?? "<describe the outcome you want to achieve>"}`);
  lines.push("");
  lines.push("## Metric");
  lines.push(`- **Name:** ${config.metric ?? "<metric name>"}`);
  lines.push(`- **Direction:** ${direction}`);
  lines.push("");
  lines.push("## Verification");
  lines.push(`- **Verify:** \`${config.verify ?? "<command to measure the metric>"}\``);
  if (config.guard) {
    lines.push(`- **Guard:** \`${config.guard}\``);
  }
  lines.push("");
  lines.push("## Scope");
  lines.push(config.scope ?? "current repository");
  lines.push("");
  lines.push("## Run Configuration");
  lines.push(`- **Mode:** ${mode}`);
  if (config.iterations != null) {
    lines.push(`- **Iterations:** ${config.iterations}`);
  }
  if (config.duration) {
    lines.push(`- **Duration:** ${config.duration}`);
  }
  if (config.stop_condition) {
    lines.push("");
    lines.push("## Stop Condition");
    lines.push(config.stop_condition);
  }
  if (config.rollback_strategy) {
    lines.push("");
    lines.push("## Rollback Strategy");
    lines.push(config.rollback_strategy);
  }
  if (config.template && config.template !== "custom") {
    lines.push("");
    lines.push(`<!-- template: ${config.template} -->`);
  }
  lines.push("");
  return lines.join("\n");
}

export interface GoalInitResult {
  goal_path: string;
  goal: string | undefined;
  metric: string | undefined;
  direction: string;
  verify: string | undefined;
  guard: string | undefined;
  mode: string;
  scope: string | undefined;
  iterations: number | undefined;
  duration: string | undefined;
  template: string;
  interactive: boolean;
}

export function buildGoalInitResult(
  goalPath: string,
  config: WizardConfig & { template?: string },
  interactive: boolean,
): GoalInitResult {
  return {
    goal_path: goalPath,
    goal: config.goal,
    metric: config.metric,
    direction: normalizeDirection(config.direction),
    verify: config.verify,
    guard: config.guard,
    mode: normalizeMode(config.mode),
    scope: config.scope,
    iterations: config.iterations,
    duration: config.duration,
    template: config.template ?? "custom",
    interactive,
  };
}
