import { resolve } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, rmSync, existsSync, readFileSync, symlinkSync, writeFileSync } from "fs";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

describe("run-manager", () => {
  const tmpDir = resolve(REPO_ROOT, ".autoresearch-test-tmp-manager");

  beforeEach(() => {
    try { rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
    mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    try { rmSync(tmpDir, { recursive: true }); } catch { /* ignore */ }
  });

  describe("initializeRun", () => {
    it("writes state.json and results.tsv", async () => {
      const { initializeRun } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      const state = await initializeRun(tmpDir, undefined, undefined, config, false);
      expect(state.status).toBe("initialized");
      expect(existsSync(resolve(tmpDir, ".autoresearch/state.json"))).toBe(true);
      expect(existsSync(resolve(tmpDir, "autoresearch-results.tsv"))).toBe(true);
    });

    it("rejects duplicate run without fresh-start", async () => {
      const { initializeRun } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      await expect(initializeRun(tmpDir, undefined, undefined, config, false)).rejects.toThrow();
    });

    it("allows overwrite with fresh-start", async () => {
      const { initializeRun } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config1 = {
        goal: "First goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      const config2 = {
        goal: "Second goal",
        metric: "tests",
        direction: "higher",
        verify: "npm test",
        mode: "background",
      };
      await initializeRun(tmpDir, undefined, undefined, config1, false);
      const state = await initializeRun(tmpDir, undefined, undefined, config2, true);
      expect(state.goal).toBe("Second goal");
      expect(state.mode).toBe("background");
    });
  });

  describe("appendIteration", () => {
    it("appends iteration to results file", async () => {
      const { initializeRun, appendIteration } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      const state = await appendIteration(
        tmpDir, undefined, undefined,
        "keep", "42", undefined, "pass", "pass",
        "test hypothesis", "test change", ["progress"], "note"
      );
      expect(state.stats.total_iterations).toBe(1);
      const results = readFileSync(resolve(tmpDir, "autoresearch-results.tsv"), "utf-8");
      expect(results).toContain("keep");
      expect(results).toContain("42");
      expect(results).toContain("test change");
    });

    it("increments iteration counter", async () => {
      const { initializeRun, appendIteration } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      await appendIteration(tmpDir, undefined, undefined, "keep", "10", undefined, "pass", "pass", "", "first", [], "");
      await appendIteration(tmpDir, undefined, undefined, "keep", "20", undefined, "pass", "pass", "", "second", [], "");
      const state = await appendIteration(tmpDir, undefined, undefined, "discard", "15", undefined, "fail", "pass", "", "third", [], "");
      expect(state.stats.total_iterations).toBe(3);
    });

    it("writes score history to the default jsonl artifact", async () => {
      const { initializeRun, appendIteration } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      await appendIteration(tmpDir, undefined, undefined, "keep", "42", undefined, "pass", "pass", "test hypothesis", "test change", ["progress"], "note");

      const scoreHistoryPath = resolve(tmpDir, ".autoresearch", "score-history.jsonl");
      expect(existsSync(scoreHistoryPath)).toBe(true);

      const scoreHistory = readFileSync(scoreHistoryPath, "utf-8").trim().split("\n").map((line) => JSON.parse(line));
      expect(scoreHistory).toHaveLength(1);
      expect(scoreHistory[0]).toMatchObject({
        iteration: 1,
        decision: "keep",
        scorer_status: "ok",
        metric_value: "42",
        metric_name: "defects",
        metric_direction: "lower",
        verify_status: "pass",
        guard_status: "pass",
      });
    });

    it("records scorer-broken and avoids automatic discard decisions", async () => {
      const { initializeRun, appendIteration } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      await appendIteration(
        tmpDir,
        undefined,
        undefined,
        "discard",
        "42",
        undefined,
        "pass",
        "pass",
        "test hypothesis",
        "score script failed",
        [],
        "",
        undefined,
        undefined,
        "scorer-broken",
      );

      const scoreHistoryPath = resolve(tmpDir, ".autoresearch", "score-history.jsonl");
      const scoreHistory = readFileSync(scoreHistoryPath, "utf-8").trim().split("\n").map((line) => JSON.parse(line));
      expect(scoreHistory[0]).toMatchObject({
        decision: "needs_human",
        scorer_status: "scorer-broken",
      });
    });

    it("writes score history to a custom path when provided", async () => {
      const { initializeRun, appendIteration } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      const customScoreHistoryPath = resolve(tmpDir, "artifacts", "scores.jsonl");
      await initializeRun(tmpDir, undefined, undefined, config, false);
      await appendIteration(
        tmpDir,
        undefined,
        undefined,
        "discard",
        "12",
        undefined,
        "fail",
        "pass",
        "",
        "custom path",
        [],
        "",
        undefined,
        customScoreHistoryPath,
      );

      expect(existsSync(customScoreHistoryPath)).toBe(true);
      const scoreHistory = readFileSync(customScoreHistoryPath, "utf-8").trim().split("\n").map((line) => JSON.parse(line));
      expect(scoreHistory[0]).toMatchObject({
        iteration: 1,
        decision: "discard",
        metric_value: "12",
      });
    });

    it("rejects a symlinked score history artifact", async () => {
      const { initializeRun, appendIteration } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      const scoreHistoryPath = resolve(tmpDir, ".autoresearch", "score-history.jsonl");
      const targetPath = resolve(tmpDir, "outside-target");
      writeFileSync(targetPath, "original", "utf-8");
      symlinkSync(targetPath, scoreHistoryPath);

      await expect(appendIteration(tmpDir, undefined, undefined, "keep", "42", undefined, "pass", "pass", "", "change", [], ""))
        .rejects.toThrow("Refusing to append to symlinked score history file");
      expect(readFileSync(targetPath, "utf-8")).toBe("original");
    });

    it("stores score_components in score history and last_iteration when provided", async () => {
      const { initializeRun, appendIteration } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      const components = { accuracy: 0.8, coverage: 0.6 };
      const state = await appendIteration(
        tmpDir, undefined, undefined,
        "keep", "5", undefined,
        "pass", "pass",
        "", "with components",
        [], "",
        undefined, undefined,
        components,
      );

      // Components in last_iteration
      expect(state.last_iteration?.score_components).toEqual(components);

      // Components in score history JSONL
      const scoreHistoryPath = resolve(tmpDir, ".autoresearch", "score-history.jsonl");
      const records = readFileSync(scoreHistoryPath, "utf-8").trim().split("\n").map((l) => JSON.parse(l));
      expect(records[0].score_components).toEqual(components);
    });

    it("omits score_components from score history when not provided", async () => {
      const { initializeRun, appendIteration } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      const state = await appendIteration(
        tmpDir, undefined, undefined,
        "keep", "5", undefined,
        "pass", "pass",
        "", "no components",
        [], "",
      );

      expect(state.last_iteration?.score_components).toBeUndefined();

      const scoreHistoryPath = resolve(tmpDir, ".autoresearch", "score-history.jsonl");
      const records = readFileSync(scoreHistoryPath, "utf-8").trim().split("\n").map((l) => JSON.parse(l));
      expect(records[0]).not.toHaveProperty("score_components");
    });
  });

  describe("completeRun", () => {
    it("marks run as completed", async () => {
      const { initializeRun, completeRun } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      const state = await completeRun(tmpDir, undefined);
      expect(state.status).toBe("completed");
    });
  });

  describe("buildSupervisorSnapshot", () => {
    it("returns snapshot with stats", async () => {
      const { initializeRun, appendIteration, buildSupervisorSnapshot } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      await appendIteration(tmpDir, undefined, undefined, "keep", "10", undefined, "pass", "pass", "", "first", [], "");
      const snapshot = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot.run_id).toBeDefined();
      expect(snapshot.status).toBe("running");
      expect(snapshot.stats.total_iterations).toBe(1);
      expect(snapshot.stats.kept).toBe(1);
    });

    it("returns snapshot with metric info", async () => {
      const { initializeRun, appendIteration, buildSupervisorSnapshot } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      await appendIteration(tmpDir, undefined, undefined, "keep", "42", undefined, "pass", "pass", "", "test", [], "");
      const snapshot = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot.metric).toBeDefined();
      expect(snapshot.metric.name).toBe("defects");
      expect(snapshot.metric.direction).toBe("lower");
    });

    it("returns snapshot with last iteration", async () => {
      const { initializeRun, appendIteration, buildSupervisorSnapshot } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      await appendIteration(tmpDir, undefined, undefined, "discard", "30", undefined, "fail", "pass", "", "bad", [], "");
      const snapshot = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot.last_iteration).toBeDefined();
      expect(snapshot.last_iteration.decision).toBe("discard");
      expect(snapshot.last_iteration.metric_value).toBe("30");
    });

    it("returns snapshot with flags", async () => {
      const { initializeRun, appendIteration, buildSupervisorSnapshot } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      await appendIteration(tmpDir, undefined, undefined, "keep", "10", undefined, "pass", "pass", "", "good", [], "");
      const snapshot = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot.flags).toBeDefined();
      expect(snapshot.flags.stop_ready).toBe(true);
    });

    it("returns snapshot with results row count", async () => {
      const { initializeRun, appendIteration, buildSupervisorSnapshot } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      await appendIteration(tmpDir, undefined, undefined, "keep", "10", undefined, "pass", "pass", "", "first", [], "");
      await appendIteration(tmpDir, undefined, undefined, "keep", "20", undefined, "pass", "pass", "", "second", [], "");
      const snapshot = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot.results_rows).toBe(2);
    });

    it("returns snapshot with zero results rows for new run", async () => {
      const { initializeRun, buildSupervisorSnapshot } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      const snapshot = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot.results_rows).toBe(0);
    });

    it("returns snapshot with artifact paths", async () => {
      const { initializeRun, buildSupervisorSnapshot } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      const snapshot = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot.artifact_paths).toBeDefined();
      expect(snapshot.artifact_paths.results).toBeDefined();
      expect(snapshot.artifact_paths.state).toBeDefined();
    });

    it("returns snapshot with label requirements", async () => {
      const { initializeRun, buildSupervisorSnapshot } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      const snapshot = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot.label_requirements).toBeDefined();
    });

    it("returns correct decision for stop_requested", async () => {
      const { initializeRun, appendIteration, buildSupervisorSnapshot } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "background",
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      await appendIteration(tmpDir, undefined, undefined, "keep", "10", undefined, "pass", "pass", "", "test", [], "");
      const { setStopRequested } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      await setStopRequested(tmpDir, undefined);
      const snapshot = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot.decision).toBe("stop");
      expect(snapshot.reason).toBe("stop_requested");
    });

    it("stops when max-no-progress threshold reached", async () => {
      const { initializeRun, appendIteration, buildSupervisorSnapshot } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
        max_no_progress: 3,
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      await appendIteration(tmpDir, undefined, undefined, "discard", "10", undefined, "fail", "pass", "", "bad1", [], "");
      await appendIteration(tmpDir, undefined, undefined, "discard", "10", undefined, "fail", "pass", "", "bad2", [], "");
      const snapshot1 = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot1.decision).toBe("relaunch");
      await appendIteration(tmpDir, undefined, undefined, "discard", "10", undefined, "fail", "pass", "", "bad3", [], "");
      const snapshot2 = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot2.decision).toBe("stop");
      expect(snapshot2.reason).toBe("no_progress");
    });
  });

  describe("debug budget enforcement", () => {
    it("stops when max-debug-depth exhausted", async () => {
      const { initializeRun, appendIteration, buildSupervisorSnapshot } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "debug critical bug",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
        max_debug_depth: 2,
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      await appendIteration(tmpDir, undefined, undefined, "discard", "10", undefined, "fail", "pass", "", "debug1", [], "");
      const snapshot1 = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot1.decision).toBe("relaunch");
      expect(snapshot1.max_debug_depth).toBe(2);
      await appendIteration(tmpDir, undefined, undefined, "discard", "10", undefined, "fail", "pass", "", "debug2", [], "");
      const snapshot2 = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot2.decision).toBe("stop");
      expect(snapshot2.reason).toBe("debug_depth_exhausted");
      expect(snapshot2.budget_exhausted).toBe(true);
    });

    it("stops when branch-failure-budget exhausted", async () => {
      const { initializeRun, appendIteration, buildSupervisorSnapshot } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "debug critical bug",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
        branch_failure_budget: 2,
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      await appendIteration(tmpDir, undefined, undefined, "discard", "10", undefined, "fail", "pass", "", "branch1", [], "");
      const snapshot1 = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot1.decision).toBe("relaunch");
      expect(snapshot1.branch_failure_budget).toBe(2);
      await appendIteration(tmpDir, undefined, undefined, "discard", "10", undefined, "fail", "pass", "", "branch2", [], "");
      const snapshot2 = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot2.decision).toBe("stop");
      expect(snapshot2.reason).toBe("branch_failure_budget_exhausted");
      expect(snapshot2.budget_exhausted).toBe(true);
    });

    it("stops completed runs with unexhausted branch-failure-budget", async () => {
      const { initializeRun, completeRun, buildSupervisorSnapshot } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "debug critical bug",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
        branch_failure_budget: 2,
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      await completeRun(tmpDir, undefined);

      const snapshot = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot.decision).toBe("stop");
      expect(snapshot.reason).toBe("state_completed");
      expect(snapshot.budget_exhausted).toBe(false);
    });

    it("initializes debug stats to zero", async () => {
      const { initializeRun, buildSupervisorSnapshot } = await import(resolve(REPO_ROOT, "dist/run-manager.js"));
      const config = {
        goal: "Test goal",
        metric: "defects",
        direction: "lower",
        verify: "echo 0",
        mode: "foreground",
        max_debug_depth: 5,
        branch_failure_budget: 3,
      };
      await initializeRun(tmpDir, undefined, undefined, config, false);
      const snapshot = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot.max_debug_depth).toBe(5);
      expect(snapshot.branch_failure_budget).toBe(3);
      expect(snapshot.stats.debug_depth).toBe(0);
      expect(snapshot.stats.branch_failures).toBe(0);
    });
  });
});
