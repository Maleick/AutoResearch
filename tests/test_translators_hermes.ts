import { describe, it, expect } from "@jest/globals";
import { resolve } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

const hermes = await import(resolve(REPO_ROOT, "dist/translators/hermes.js"));
const types = await import(resolve(REPO_ROOT, "dist/types.js"));
const schema = await import(resolve(REPO_ROOT, "dist/task-schema.js"));

type HermesTaskPayload = typeof hermes.HermesTaskPayload;
type RunState = typeof types.RunState;

const { taskContextFromHermesPayload, hermesPayloadFromTaskContext, taskContextFromRunState } = hermes;

describe("Hermes Translation Layer", () => {
  describe("taskContextFromHermesPayload", () => {
    it("converts Hermes task payload to TaskContext", () => {
      const payload: HermesTaskPayload = {
        run_id: "hermes-001",
        goal: "improve coverage",
        metric: { name: "coverage_pct", direction: "higher", baseline: "72" },
        verify_command: "npm run test:coverage",
        guard_command: "npm run typecheck",
        mode: "background",
        scope: "src/",
        max_iterations: 20,
        max_duration_seconds: 7200,
        required_keep_labels: ["pass"],
        required_stop_labels: ["blocker"],
        stop_condition: "10 iterations",
        origin: "hermes-cron",
        owner: "hermes-agent",
      };

      const context = taskContextFromHermesPayload(payload);

      expect(context.id).toBe("hermes-001");
      expect(context.source).toBe("hermes");
      expect(context.goal).toBe("improve coverage");
      expect(context.metric.name).toBe("coverage_pct");
      expect(context.metric.direction).toBe("higher");
      expect(context.metric.baseline).toBe("72");
      expect(context.verify_command).toBe("npm run test:coverage");
      expect(context.guard_command).toBe("npm run typecheck");
      expect(context.scope).toBe("src/");
      expect(context.constraints.max_iterations).toBe(20);
      expect(context.constraints.max_duration_seconds).toBe(7200);
      expect(context.constraints.required_keep_labels).toEqual(["pass"]);
      expect(context.constraints.required_stop_labels).toEqual(["blocker"]);
      expect(context.iteration_policy.mode).toBe("background");
      expect(context.iteration_policy.stop_condition).toBe("10 iterations");
      expect(context.origin).toBe("hermes-cron");
      expect(context.owner).toBe("hermes-agent");
    });

    it("handles minimal payload", () => {
      const payload: HermesTaskPayload = {
        run_id: "hermes-002",
        goal: "simple task",
        metric: { name: "errors", direction: "lower" },
        verify_command: "npm test",
        mode: "foreground",
      };

      const context = taskContextFromHermesPayload(payload);

      expect(context.id).toBe("hermes-002");
      expect(context.source).toBe("hermes");
      expect(context.goal).toBe("simple task");
      expect(context.metric.name).toBe("errors");
      expect(context.metric.direction).toBe("lower");
      expect(context.constraints.max_iterations).toBeUndefined();
      expect(context.constraints.max_duration_seconds).toBeUndefined();
      expect(context.constraints.required_keep_labels).toBeUndefined();
      expect(context.iteration_policy.mode).toBe("foreground");
    });

    it("preserves metadata from payload", () => {
      const payload: HermesTaskPayload = {
        run_id: "hermes-003",
        goal: "metadata test",
        metric: { name: "score", direction: "higher" },
        verify_command: "python -m pytest",
        mode: "foreground",
        metadata: { cron_id: "auto-001", priority: "high", tags: ["test", "coverage"] },
      };

      const context = taskContextFromHermesPayload(payload);

      expect(context.metadata).toBeDefined();
      expect(context.metadata?.cron_id).toBe("auto-001");
      expect(context.metadata?.priority).toBe("high");
      expect(context.metadata?.tags).toEqual(["test", "coverage"]);
    });
  });

  describe("hermesPayloadFromTaskContext", () => {
    it("converts TaskContext back to Hermes payload", () => {
      const context = {
        id: "hermes-payload-001",
        source: "hermes" as const,
        origin: "delegate_task",
        owner: "subagent-pool",
        goal: "improve performance",
        scope: "lib/",
        metric: { name: "latency_ms", direction: "lower", baseline: "50" },
        verify_command: "npm run benchmark",
        guard_command: "npm run lint",
        constraints: {
          max_iterations: 15,
          max_duration_seconds: 5400,
          required_keep_labels: ["fast", "stable"],
          required_stop_labels: ["regression"],
        },
        iteration_policy: {
          mode: "background" as const,
          stop_condition: "5 iterations",
        },
        metadata: { priority: "high" },
      };

      const payload = hermesPayloadFromTaskContext(context);

      expect(payload.run_id).toBe("hermes-payload-001");
      expect(payload.goal).toBe("improve performance");
      expect(payload.metric.name).toBe("latency_ms");
      expect(payload.metric.direction).toBe("lower");
      expect(payload.metric.baseline).toBe("50");
      expect(payload.verify_command).toBe("npm run benchmark");
      expect(payload.guard_command).toBe("npm run lint");
      expect(payload.scope).toBe("lib/");
      expect(payload.mode).toBe("background");
      expect(payload.max_iterations).toBe(15);
      expect(payload.max_duration_seconds).toBe(5400);
      expect(payload.required_keep_labels).toEqual(["fast", "stable"]);
      expect(payload.required_stop_labels).toEqual(["regression"]);
      expect(payload.stop_condition).toBe("5 iterations");
      expect(payload.origin).toBe("delegate_task");
      expect(payload.owner).toBe("subagent-pool");
    });

    it("handles missing optional fields", () => {
      const context = {
        id: "minimal-context",
        source: "hermes" as const,
        goal: "minimal task",
        metric: { name: "count", direction: "lower" },
        constraints: {},
        iteration_policy: { mode: "foreground" as const },
      };

      const payload = hermesPayloadFromTaskContext(context);

      expect(payload.run_id).toBe("minimal-context");
      expect(payload.goal).toBe("minimal task");
      expect(payload.metric.name).toBe("count");
      expect(payload.verify_command).toBe("");
      expect(payload.mode).toBe("foreground");
      expect(payload.max_iterations).toBeUndefined();
      expect(payload.guard_command).toBeUndefined();
    });
  });

  describe("taskContextFromRunState", () => {
    it("converts RunState to TaskContext", () => {
      const state: RunState = {
        schema_version: 1,
        run_id: "state-001",
        created_at: "2026-05-07T12:00:00Z",
        updated_at: "2026-05-07T14:00:00Z",
        status: "running",
        mode: "background",
        goal: "improve coverage",
        scope: "src/",
        metric: { name: "coverage_pct", direction: "higher", baseline: "70", best: "75", latest: "73" },
        verify: "npm run test:coverage",
        guard: "npm run typecheck",
        iterations_cap: 20,
        duration_seconds: 3600,
        label_requirements: { keep: ["pass", "verified"], stop: ["blocker"] },
        stop_condition: "10 iterations",
        artifact_paths: { results: "autoresearch-results.tsv", state: ".autoresearch/state.json" },
        stats: { total_iterations: 5, kept: 4, discarded: 1, needs_human: 0, consecutive_discards: 1 },
        flags: { stop_requested: false, needs_human: false, background_active: true, stop_ready: false },
      };

      const context = taskContextFromRunState(state);

      expect(context.id).toBe("state-001");
      expect(context.source).toBe("hermes");
      expect(context.goal).toBe("improve coverage");
      expect(context.scope).toBe("src/");
      expect(context.metric.name).toBe("coverage_pct");
      expect(context.metric.direction).toBe("higher");
      expect(context.metric.baseline).toBe("70");
      expect(context.verify_command).toBe("npm run test:coverage");
      expect(context.guard_command).toBe("npm run typecheck");
      expect(context.constraints.max_iterations).toBe(20);
      expect(context.constraints.max_duration_seconds).toBe(3600);
      expect(context.constraints.required_keep_labels).toEqual(["pass", "verified"]);
      expect(context.constraints.required_stop_labels).toEqual(["blocker"]);
      expect(context.iteration_policy.mode).toBe("background");
      expect(context.iteration_policy.stop_condition).toBe("10 iterations");
    });
  });

  describe("round-trip fidelity", () => {
    it("preserves data through Hermes -> TaskContext -> Hermes", () => {
      const original: HermesTaskPayload = {
        run_id: "round-trip-hermes",
        goal: "coverage improvement",
        metric: { name: "coverage_pct", direction: "higher", baseline: "80" },
        verify_command: "npm run test:coverage",
        guard_command: "npm run lint",
        mode: "background",
        scope: "src/lib/",
        max_iterations: 25,
        max_duration_seconds: 10800,
        required_keep_labels: ["pass", "verified", "lint-clean"],
        required_stop_labels: ["security-issue", "regression"],
        stop_condition: "20 iterations",
        origin: "cron-job-001",
        owner: "hermes-agent",
        metadata: { cron_interval: "15m", priority: "high" },
      };

      const context = taskContextFromHermesPayload(original);
      const reconstructed = hermesPayloadFromTaskContext(context);
      const secondPass = taskContextFromHermesPayload(reconstructed);

      expect(secondPass.id).toBe(original.run_id);
      expect(secondPass.goal).toBe(original.goal);
      expect(secondPass.metric.name).toBe(original.metric.name);
      expect(secondPass.metric.direction).toBe(original.metric.direction);
      expect(secondPass.metric.baseline).toBe(original.metric.baseline);
      expect(secondPass.verify_command).toBe(original.verify_command);
      expect(secondPass.guard_command).toBe(original.guard_command);
      expect(secondPass.iteration_policy?.mode).toBe(original.mode);
      expect(secondPass.scope).toBe(original.scope);
      expect(secondPass.constraints.max_iterations).toBe(original.max_iterations);
      expect(secondPass.constraints.max_duration_seconds).toBe(original.max_duration_seconds);
      expect(secondPass.constraints.required_keep_labels).toEqual(original.required_keep_labels);
      expect(secondPass.constraints.required_stop_labels).toEqual(original.required_stop_labels);
      expect(secondPass.iteration_policy?.stop_condition).toBe(original.stop_condition);
      expect(secondPass.origin).toBe(original.origin);
      expect(secondPass.owner).toBe(original.owner);
      expect(secondPass.metadata).toEqual(original.metadata);
    });

    it("preserves data through RunState -> TaskContext -> Hermes", () => {
      const state: RunState = {
        schema_version: 1,
        run_id: "state-roundtrip-001",
        created_at: "2026-05-07T10:00:00Z",
        updated_at: "2026-05-07T12:00:00Z",
        status: "running",
        mode: "foreground",
        goal: "performance tuning",
        scope: "lib/",
        metric: { name: "latency_ms", direction: "lower", baseline: "100" },
        verify: "npm run benchmark",
        guard: "npm run typecheck",
        iterations_cap: 30,
        duration_seconds: 7200,
        label_requirements: { keep: ["fast"], stop: ["slow"] },
        stop_condition: "25 iterations",
        artifact_paths: { results: "results.tsv", state: "state.json" },
        stats: { total_iterations: 10, kept: 8, discarded: 2, needs_human: 0, consecutive_discards: 0 },
        flags: { stop_requested: false, needs_human: false, background_active: false, stop_ready: false },
      };

      const context = taskContextFromRunState(state);
      const hermesPayload = hermesPayloadFromTaskContext(context);

      expect(hermesPayload.run_id).toBe(state.run_id);
      expect(hermesPayload.goal).toBe(state.goal);
      expect(hermesPayload.metric.name).toBe(state.metric.name);
      expect(hermesPayload.metric.direction).toBe(state.metric.direction);
      expect(hermesPayload.metric.baseline).toBe(state.metric.baseline);
      expect(hermesPayload.verify_command).toBe(state.verify);
      expect(hermesPayload.guard_command).toBe(state.guard);
      expect(hermesPayload.mode).toBe(state.mode);
      expect(hermesPayload.scope).toBe(state.scope);
      expect(hermesPayload.max_iterations).toBe(state.iterations_cap);
      expect(hermesPayload.max_duration_seconds).toBe(state.duration_seconds);
      expect(hermesPayload.required_keep_labels).toEqual(state.label_requirements.keep);
      expect(hermesPayload.required_stop_labels).toEqual(state.label_requirements.stop);
      expect(hermesPayload.stop_condition).toBe(state.stop_condition);
    });
  });
});