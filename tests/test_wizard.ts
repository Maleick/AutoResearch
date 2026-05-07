import { mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { basename, resolve } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

const importWizard = async () => await import(resolve(REPO_ROOT, "dist/wizard.js"));

describe("buildSetupSummary", () => {
  let mod: any;
  beforeAll(async () => { mod = await importWizard(); });

  it("returns default scope from repo basename", () => {
    const result = mod.buildSetupSummary("/my/repo", { goal: "improve speed" });
    expect(result.scope).toBe("repo");
    expect(result.goal).toBe("improve speed");
  });

  it("falls back to current working directory basename when repo is undefined", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve speed" });
    expect(result.scope).toBe(basename(process.cwd()));
  });

  it("uses provided scope", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", scope: "src/" });
    expect(result.scope).toBe("src/");
  });

  it("infers verify from repo when not provided", () => {
    const result = mod.buildSetupSummary(REPO_ROOT, { goal: "improve" });
    expect(result.verify).toBe("npm test");
  });

  it("uses provided verify when set", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", verify: "make test" });
    expect(result.verify).toBe("make test");
  });

  it("defaults direction to lower", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve" });
    expect(result.direction).toBe("lower");
  });

  it("uses provided direction", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", direction: "higher" });
    expect(result.direction).toBe("higher");
  });

  it("defaults mode to foreground", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve" });
    expect(result.mode).toBe("foreground");
  });

  it("uses provided mode", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", mode: "background" });
    expect(result.mode).toBe("background");
  });

  it("parses duration string", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", duration: "2h" });
    expect(result.duration_seconds).toBe(7200);
    expect(result.duration).toBe("2h");
  });

  it("reports missing goal in missing_required and questions", () => {
    const result = mod.buildSetupSummary(undefined, {});
    expect(result.missing_required).toContain("goal");
    const qIds = result.questions.map((q: any) => q.id);
    expect(qIds).toContain("goal");
  });

  it("reports missing verify when inference fails", () => {
    const result = mod.buildSetupSummary("/nonexistent", {});
    expect(result.missing_required).toContain("verify");
  });

  it("requires explicit verify confirmation even when npm test is inferred", () => {
    const repo = mkdtempSync(resolve(tmpdir(), "autoresearch-wizard-"));
    try {
      writeFileSync(resolve(repo, "package.json"), JSON.stringify({ scripts: { test: "node hostile.js" } }), "utf-8");
      const result = mod.buildSetupSummary(repo, { goal: "improve safely" });

      expect(result.verify).toBe("npm test");
      expect(result.missing_required).toContain("verify");
      expect(result.questions.map((q: any) => q.id)).toContain("verify");
    } finally {
      rmSync(repo, { recursive: true, force: true });
    }
  });

  it("includes subagent_pool in summary", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", mode: "foreground" });
    expect(result.subagent_pool.kind).toBe("autoresearch_subagent_pool");
    expect(result.subagent_pool.goal).toBe("improve");
  });

  it("includes continuation_policy in summary", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", mode: "foreground" });
    expect(result.continuation_policy.approval_boundary).toBe("pre_launch");
  });

  it("defaults metric to 'primary verify metric'", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve" });
    expect(result.metric).toBe("primary verify metric");
  });

  it("defaults rollback_strategy", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve" });
    expect(result.rollback_strategy).toContain("discard current");
  });

  it("normalizes required keep labels", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", required_keep_labels: "a,b" });
    expect(result.required_keep_labels).toEqual(["a", "b"]);
  });

  it("generates stop_condition from provided config", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", verify: "npm test", iterations: 10 });
    expect(result.stop_condition).toContain("10 iterations complete");
  });

  it("includes guard in output when provided", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", guard: "npm run lint" });
    expect(result.guard).toBe("npm run lint");
  });

  it("includes iterations when provided", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", iterations: 50 });
    expect(result.iterations_cap).toBe(50);
  });

  it("omits iterations when not provided", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve" });
    expect(result.iterations_cap).toBeUndefined();
  });

  it("sets missing_verify_command when inference fails", () => {
    const result = mod.buildSetupSummary("/tmp/empty-dir-12345", { goal: "improve" });
    expect(result.missing_required).toContain("verify");
    expect(result.verify).toBe("<set verify command>");
  });

  it("includes duration when provided", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", duration: "5h" });
    expect(result.duration).toBe("5h");
    expect(result.duration_seconds).toBe(18000);
  });

  it("includes required_stop_labels when provided", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", required_stop_labels: "blocker" });
    expect(result.required_stop_labels).toEqual(["blocker"]);
  });

  it("defaults required_keep_labels to empty", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve" });
    expect(result.required_keep_labels).toEqual([]);
  });

  it("includes questions array when goal missing", () => {
    const result = mod.buildSetupSummary(undefined, {});
    expect(Array.isArray(result.questions)).toBe(true);
    expect(result.questions.length).toBeGreaterThan(0);
    const qIds = result.questions.map((q: any) => q.id);
    expect(qIds).toContain("goal");
  });

  it("questions have id, prompt, and reason fields", () => {
    const result = mod.buildSetupSummary(undefined, {});
    expect(result.questions.length).toBeGreaterThan(0);
    const q = result.questions[0];
    expect(q.id).toBeDefined();
    expect(q.prompt).toBeDefined();
    expect(q.reason).toBeDefined();
  });

  it("includes stop_condition with verify and iterations", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", verify: "npm test", iterations: 10 });
    expect(result.stop_condition).toContain("npm test");
    expect(result.stop_condition).toContain("10 iterations complete");
  });

  it("includes stop_condition with duration", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", verify: "npm test", duration: "2h" });
    expect(result.stop_condition).toContain("2h elapses");
  });

  it("defaults stop_condition when nothing provided", () => {
    const result = mod.buildSetupSummary("/tmp/nonexistent", {});
    expect(result.stop_condition).toBe("stop when ");
  });

  it("includes rollback_strategy", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve" });
    expect(typeof result.rollback_strategy).toBe("string");
    expect(result.rollback_strategy.length).toBeGreaterThan(0);
  });

  it("uses custom rollback_strategy when provided", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", rollback_strategy: "custom strategy" });
    expect(result.rollback_strategy).toBe("custom strategy");
  });

  it("includes guard when provided", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", guard: "npm run lint" });
    expect(result.guard).toBe("npm run lint");
  });

  it("omits guard when not provided", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve" });
    expect(result.guard).toBeUndefined();
  });

  it("includes mode in output", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", mode: "background" });
    expect(result.mode).toBe("background");
  });

  it("defaults mode to foreground", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve" });
    expect(result.mode).toBe("foreground");
  });

  it("includes direction in output", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", direction: "higher" });
    expect(result.direction).toBe("higher");
  });

  it("defaults direction to lower", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve" });
    expect(result.direction).toBe("lower");
  });

  it("includes metric in output", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", metric: "coverage" });
    expect(result.metric).toBe("coverage");
  });

  it("defaults metric to primary verify metric", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve" });
    expect(result.metric).toBe("primary verify metric");
  });

  it("includes verify in output", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", verify: "npm test" });
    expect(result.verify).toBe("npm test");
  });

  it("infers verify from repo", () => {
    const result = mod.buildSetupSummary(REPO_ROOT, { goal: "improve" });
    expect(result.verify).toBe("npm test");
  });

  it("sets missing_required when goal is missing", () => {
    const result = mod.buildSetupSummary(undefined, {});
    expect(result.missing_required).toContain("goal");
  });

  it("sets missing_required when verify cannot be inferred", () => {
    const result = mod.buildSetupSummary("/tmp/nonexistent", { goal: "improve" });
    expect(result.missing_required).toContain("verify");
  });

  it("questions include verify when not provided", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve" });
    const qIds = result.questions.map((q: any) => q.id);
    expect(qIds).toContain("verify");
  });

  it("questions include mode when not provided", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve" });
    const qIds = result.questions.map((q: any) => q.id);
    expect(qIds).toContain("mode");
  });

  it("subagent_pool has correct goal", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "test goal" });
    expect(result.subagent_pool.goal).toBe("test goal");
  });

  it("subagent_pool has correct scope", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve", scope: "src/" });
    expect(result.subagent_pool.scope).toBe("src/");
  });

  it("continuation_policy has correct approval_boundary", () => {
    const result = mod.buildSetupSummary(undefined, { goal: "improve" });
    expect(result.continuation_policy.approval_boundary).toBe("pre_launch");
  });
});
