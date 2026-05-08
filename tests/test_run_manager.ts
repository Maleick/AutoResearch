import { resolve } from "path";
import { fileURLToPath } from "url";
import { mkdirSync, rmSync, existsSync, readFileSync } from "fs";

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
        "keep", "42", "pass", "pass",
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
      await appendIteration(tmpDir, undefined, undefined, "keep", "10", "pass", "pass", "", "first", [], "");
      await appendIteration(tmpDir, undefined, undefined, "keep", "20", "pass", "pass", "", "second", [], "");
      const state = await appendIteration(tmpDir, undefined, undefined, "discard", "15", "fail", "pass", "", "third", [], "");
      expect(state.stats.total_iterations).toBe(3);
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
      await appendIteration(tmpDir, undefined, undefined, "keep", "10", "pass", "pass", "", "first", [], "");
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
      await appendIteration(tmpDir, undefined, undefined, "keep", "42", "pass", "pass", "", "test", [], "");
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
      await appendIteration(tmpDir, undefined, undefined, "discard", "30", "fail", "pass", "", "bad", [], "");
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
      await appendIteration(tmpDir, undefined, undefined, "keep", "10", "pass", "pass", "", "good", [], "");
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
      await appendIteration(tmpDir, undefined, undefined, "keep", "10", "pass", "pass", "", "first", [], "");
      await appendIteration(tmpDir, undefined, undefined, "keep", "20", "pass", "pass", "", "second", [], "");
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
      await appendIteration(tmpDir, undefined, undefined, "keep", "10", "pass", "pass", "", "test", [], "");
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
      await appendIteration(tmpDir, undefined, undefined, "discard", "10", "fail", "pass", "", "bad1", [], "");
      await appendIteration(tmpDir, undefined, undefined, "discard", "10", "fail", "pass", "", "bad2", [], "");
      const snapshot1 = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot1.decision).toBe("relaunch");
      await appendIteration(tmpDir, undefined, undefined, "discard", "10", "fail", "pass", "", "bad3", [], "");
      const snapshot2 = await buildSupervisorSnapshot(tmpDir, undefined, undefined);
      expect(snapshot2.decision).toBe("stop");
      expect(snapshot2.reason).toBe("no_progress");
    });
  });
});