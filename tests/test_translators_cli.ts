import { describe, it, expect } from "@jest/globals";
import { resolve } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

const cli = await import(resolve(REPO_ROOT, "dist/translators/cli.js"));
const types = await import(resolve(REPO_ROOT, "dist/types.js"));
const schema = await import(resolve(REPO_ROOT, "dist/task-schema.js"));

type RunConfig = typeof types.RunConfig;
type TaskContext = typeof schema extends { TaskContext: infer T } ? T : never;

const { taskContextFromRunConfig, runConfigFromTaskContext } = cli;

describe("CLI Translation Layer", () => {
  describe("taskContextFromRunConfig", () => {
    it("converts basic RunConfig to TaskContext", () => {
      const config: RunConfig = {
        goal: "improve tests",
        metric: "coverage",
        direction: "higher",
        verify: "npm test",
        mode: "foreground",
      };

      const context = taskContextFromRunConfig("test-id-001", config);

      expect(context.id).toBe("test-id-001");
      expect(context.source).toBe("cli");
      expect(context.goal).toBe("improve tests");
      expect(context.metric.name).toBe("coverage");
      expect(context.metric.direction).toBe("higher");
      expect(context.verify_command).toBe("npm test");
      expect(context.iteration_policy.mode).toBe("foreground");
    });

    it("maps all optional constraints", () => {
      const config: RunConfig = {
        goal: "improve coverage",
        metric: "coverage_pct",
        direction: "higher",
        verify: "npm run test:coverage",
        guard: "npm run lint",
        mode: "background",
        scope: "src/",
        iterations: 20,
        duration: "2h",
        required_keep_labels: ["pass", "verified"],
        required_stop_labels: ["blocker"],
        run_tag: "v1.0",
        stop_condition: "10 iterations",
        baseline: "70",
      };

      const context = taskContextFromRunConfig("test-id-002", config);

      expect(context.scope).toBe("src/");
      expect(context.guard_command).toBe("npm run lint");
      expect(context.constraints.max_iterations).toBe(20);
      expect(context.constraints.max_duration_seconds).toBe(7200);
      expect(context.constraints.required_keep_labels).toEqual(["pass", "verified"]);
      expect(context.constraints.required_stop_labels).toEqual(["blocker"]);
      expect(context.metadata?.run_tag).toBe("v1.0");
      expect(context.iteration_policy.stop_condition).toBe("10 iterations");
      expect(context.metric.baseline).toBe("70");
    });

    it("handles duration parsing", () => {
      const configs: Array<{ config: RunConfig; expected: number }> = [
        { config: { goal: "test", metric: "m", direction: "lower", verify: "x", mode: "foreground", duration: "30m" }, expected: 1800 },
        { config: { goal: "test", metric: "m", direction: "lower", verify: "x", mode: "foreground", duration: "1h" }, expected: 3600 },
        { config: { goal: "test", metric: "m", direction: "lower", verify: "x", mode: "foreground", duration: "5s" }, expected: 5 },
        { config: { goal: "test", metric: "m", direction: "lower", verify: "x", mode: "foreground", duration: "1d" }, expected: 86400 },
      ];

      for (const { config, expected } of configs) {
        const context = taskContextFromRunConfig("test", config);
        expect(context.constraints.max_duration_seconds).toBe(expected);
      }
    });
  });

  describe("runConfigFromTaskContext", () => {
    it("converts TaskContext back to RunConfig", () => {
      const context = {
        id: "test-id-003",
        source: "cli" as const,
        goal: "improve tests",
        metric: { name: "coverage", direction: "higher" as const, baseline: "75" },
        verify_command: "npm test",
        guard_command: "npm run lint",
        constraints: {
          max_iterations: 15,
          max_duration_seconds: 3600,
          required_keep_labels: ["pass"],
          required_stop_labels: ["blocker"],
        },
        iteration_policy: {
          mode: "background" as const,
          stop_condition: "10 iterations",
        },
        metadata: { run_tag: "v2.0" },
      };

      const config = runConfigFromTaskContext(context);

      expect(config.goal).toBe("improve tests");
      expect(config.metric).toBe("coverage");
      expect(config.direction).toBe("higher");
      expect(config.verify).toBe("npm test");
      expect(config.guard).toBe("npm run lint");
      expect(config.mode).toBe("background");
      expect(config.iterations).toBe(15);
      expect(config.duration).toBe("1h");
      expect(config.required_keep_labels).toEqual(["pass"]);
      expect(config.required_stop_labels).toEqual(["blocker"]);
      expect(config.stop_condition).toBe("10 iterations");
      expect(config.run_tag).toBe("v2.0");
      expect(config.baseline).toBe("75");
    });

    it("handles missing optional fields", () => {
      const context = {
        id: "test-id-004",
        source: "cli" as const,
        goal: "simple test",
        metric: { name: "errors", direction: "lower" as const },
        constraints: {},
        iteration_policy: { mode: "foreground" as const },
      };

      const config = runConfigFromTaskContext(context);

      expect(config.goal).toBe("simple test");
      expect(config.metric).toBe("errors");
      expect(config.direction).toBe("lower");
      expect(config.verify).toBe("");
      expect(config.mode).toBe("foreground");
      expect(config.iterations).toBeUndefined();
      expect(config.duration).toBeUndefined();
    });
  });

  describe("round-trip fidelity", () => {
    it("preserves data through TaskContext -> RunConfig -> TaskContext", () => {
      const original: RunConfig = {
        goal: "round-trip test",
        metric: "accuracy",
        direction: "higher",
        verify: "python -m pytest",
        guard: "python -m mypy",
        mode: "background",
        scope: "src/ml/",
        iterations: 25,
        duration: "3h",
        required_keep_labels: ["pass", "lint-clean"],
        required_stop_labels: ["security-issue"],
        run_tag: "exp-v3",
        stop_condition: "20 iterations",
        baseline: "85",
      };

      const context = taskContextFromRunConfig("round-trip-001", original);
      const reconstructed = runConfigFromTaskContext(context);
      const secondPass = taskContextFromRunConfig("round-trip-002", reconstructed);

      expect(secondPass.goal).toBe(original.goal);
      expect(secondPass.metric.name).toBe(original.metric);
      expect(secondPass.metric.direction).toBe(original.direction);
      expect(secondPass.metric.baseline).toBe(original.baseline);
      expect(secondPass.verify_command).toBe(original.verify);
      expect(secondPass.guard_command).toBe(original.guard);
      expect(secondPass.scope).toBe(original.scope);
      expect(secondPass.constraints.max_iterations).toBe(original.iterations);
      expect(secondPass.constraints.max_duration_seconds).toBe(10800);
      expect(secondPass.constraints.required_keep_labels).toEqual(original.required_keep_labels);
      expect(secondPass.constraints.required_stop_labels).toEqual(original.required_stop_labels);
      expect(secondPass.iteration_policy.stop_condition).toBe(original.stop_condition);
    });
  });
});