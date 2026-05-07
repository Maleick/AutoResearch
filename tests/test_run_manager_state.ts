import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, readFileSync, mkdirSync, rmSync, existsSync, symlinkSync } from "fs";
import type { RunState, RunStats, RunFlags, Metric, LabelRequirements, ArtifactPaths } from "../src/types.js";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const TMP_DIR = resolve(REPO_ROOT, ".autoresearch-test-tmp");

const minimalMetric: Metric = {
  name: "test",
  direction: "lower",
};

const minimalStats: RunStats = {
  total_iterations: 0,
  kept: 0,
  discarded: 0,
  needs_human: 0,
  consecutive_discards: 0,
};

const minimalFlags: RunFlags = {
  stop_requested: false,
  needs_human: false,
  background_active: true,
  stop_ready: false,
};

const minimalLabelReqs: LabelRequirements = {
  keep: [],
  stop: [],
};

const minimalArtifactPaths: ArtifactPaths = {
  results: "results.tsv",
  state: "state.json",
};

beforeAll(() => {
  mkdirSync(TMP_DIR, { recursive: true });
});

function createMinimalState(overrides: Partial<RunState> = {}): RunState {
  return {
    schema_version: 1,
    run_id: "test-run",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: "running",
    mode: "background",
    goal: "test",
    scope: "test",
    metric: minimalMetric,
    verify: "npm test",
    label_requirements: minimalLabelReqs,
    artifact_paths: minimalArtifactPaths,
    stats: minimalStats,
    flags: minimalFlags,
    ...overrides,
  };
}

async function importRunManager() {
  return await import(resolve(REPO_ROOT, "dist/run-manager.js"));
}

async function importTypes() {
  return await import(resolve(REPO_ROOT, "dist/types.js"));
}

describe("makeStatePayload", () => {
  let mod: any;
  let types: any;
  beforeAll(async () => {
    mod = await importRunManager();
    types = await importTypes();
  });

  it("creates state with schema_version 1", () => {
    const config = { goal: "test", metric: "score", direction: "higher", verify: "npm test", mode: "foreground" };
    const state = mod.makeStatePayload(config, "results.tsv", "state.json");
    expect(state.schema_version).toBe(1);
    expect(state.status).toBe("initialized");
    expect(state.goal).toBe("test");
  });

  it("generates run_id from run_tag", () => {
    const config = { goal: "test", metric: "score", direction: "higher", verify: "npm test", mode: "foreground", run_tag: "my-run" };
    const state = mod.makeStatePayload(config, "results.tsv", "state.json");
    expect(state.run_id).toBe("my-run");
  });

  it("sets background_active when mode is background", () => {
    const config = { goal: "test", metric: "score", direction: "higher", verify: "npm test", mode: "background" };
    const state = mod.makeStatePayload(config, "results.tsv", "state.json");
    expect(state.flags.background_active).toBe(true);
  });

  it("does not set background_active in foreground", () => {
    const config = { goal: "test", metric: "score", direction: "higher", verify: "npm test", mode: "foreground" };
    const state = mod.makeStatePayload(config, "results.tsv", "state.json");
    expect(state.flags.background_active).toBe(false);
  });

  it("computes deadline_at from duration", () => {
    const config = { goal: "test", metric: "score", direction: "higher", verify: "npm test", mode: "foreground", duration: "1h" };
    const state = mod.makeStatePayload(config, "results.tsv", "state.json");
    expect(state.deadline_at).toBeDefined();
  });

  it("creates metric with name and direction", () => {
    const config = { goal: "test", metric: "coverage", direction: "higher", verify: "npm test", mode: "foreground" };
    const state = mod.makeStatePayload(config, "results.tsv", "state.json");
    expect(state.metric.name).toBe("coverage");
    expect(state.metric.direction).toBe("higher");
  });

  it("sets stop_ready to false initially", () => {
    const config = { goal: "test", metric: "score", direction: "higher", verify: "npm test", mode: "foreground" };
    const state = mod.makeStatePayload(config, "results.tsv", "state.json");
    expect(state.flags.stop_ready).toBe(false);
  });
});

describe("setStopRequested", () => {
  let mod: any;
  beforeAll(async () => { mod = await importRunManager(); });

  it("stops a background run", async () => {
    const stateDir = resolve(TMP_DIR, "setStopRequested-bg");
    const stateFile = resolve(stateDir, "state.json");
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(stateFile, JSON.stringify(createMinimalState({ mode: "background" })), "utf-8");
    const result = await mod.setStopRequested(stateDir, "state.json");
    expect(result.flags.stop_requested).toBe(true);
    expect(result.flags.background_active).toBe(false);
    expect(result.status).toBe("stopping");
  });

  it("rejects stopping a foreground run", async () => {
    const stateDir = resolve(TMP_DIR, "setStopRequested-fg");
    const stateFile = resolve(stateDir, "state.json");
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(stateFile, JSON.stringify(createMinimalState({ mode: "foreground" })), "utf-8");
    await expect(mod.setStopRequested(stateDir, "state.json")).rejects.toThrow("Only background runs can be stopped.");
  });
});

describe("resumeBackgroundRun", () => {
  let mod: any;
  beforeAll(async () => { mod = await importRunManager(); });

  it("resumes a stopped background run", async () => {
    const stateDir = resolve(TMP_DIR, "resumeBackgroundRun-stopped");
    const stateFile = resolve(stateDir, "state.json");
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(stateFile, JSON.stringify(createMinimalState({
      mode: "background",
      flags: { stop_requested: true, needs_human: false, background_active: false, stop_ready: true },
      status: "stopping",
    })), "utf-8");
    const result = await mod.resumeBackgroundRun(stateDir, "state.json");
    expect(result.flags.stop_requested).toBe(false);
    expect(result.flags.background_active).toBe(true);
    expect(result.status).toBe("running");
  });

  it("rejects resuming a completed run", async () => {
    const stateDir = resolve(TMP_DIR, "resumeBackgroundRun-completed");
    const stateFile = resolve(stateDir, "state.json");
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(stateFile, JSON.stringify(createMinimalState({ status: "completed" })), "utf-8");
    await expect(mod.resumeBackgroundRun(stateDir, "state.json")).rejects.toThrow("Completed runs cannot be resumed");
  });

  it("rejects resuming a foreground run", async () => {
    const stateDir = resolve(TMP_DIR, "resumeBackgroundRun-fg");
    const stateFile = resolve(stateDir, "state.json");
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(stateFile, JSON.stringify(createMinimalState({ mode: "foreground", status: "stopping" })), "utf-8");
    await expect(mod.resumeBackgroundRun(stateDir, "state.json")).rejects.toThrow("Only background runs can be resumed");
  });
});

describe("completeRun", () => {
  let mod: any;
  beforeAll(async () => { mod = await importRunManager(); });

  it("completes a running run", async () => {
    const stateDir = resolve(TMP_DIR, "completeRun-running");
    const stateFile = resolve(stateDir, "state.json");
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(stateFile, JSON.stringify(createMinimalState()), "utf-8");
    const result = await mod.completeRun(stateDir, "state.json");
    expect(result.status).toBe("completed");
    expect(result.flags.stop_requested).toBe(false);
    expect(result.flags.needs_human).toBe(false);
    expect(result.flags.background_active).toBe(false);
    expect(result.flags.stop_ready).toBe(false);
  });

  it("is idempotent on completed runs", async () => {
    const stateDir = resolve(TMP_DIR, "completeRun-idempotent");
    const stateFile = resolve(stateDir, "state.json");
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(stateFile, JSON.stringify(createMinimalState({ status: "completed" })), "utf-8");
    const stateBefore = JSON.parse(readFileSync(stateFile, "utf-8"));
    const result = await mod.completeRun(stateDir, "state.json");
    expect(result.status).toBe("completed");
    expect(result.updated_at).toBe(stateBefore.updated_at);
  });
});

describe("buildSupervisorSnapshot", () => {
  let mod: any;
  beforeAll(async () => { mod = await importRunManager(); });

  it("returns stop when stop_requested is true", async () => {
    const stateDir = resolve(TMP_DIR, "buildSupervisorSnapshot-stop");
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(resolve(stateDir, "state.json"), JSON.stringify(createMinimalState({
      flags: { stop_requested: true, needs_human: false, background_active: true, stop_ready: false },
    })), "utf-8");
    const snapshot = await mod.buildSupervisorSnapshot(stateDir, undefined, "state.json");
    expect(snapshot.decision).toBe("stop");
    expect(snapshot.reason).toBe("stop_requested");
  });

  it("returns needs_human when needs_human is true", async () => {
    const stateDir = resolve(TMP_DIR, "buildSupervisorSnapshot-human");
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(resolve(stateDir, "state.json"), JSON.stringify(createMinimalState({
      flags: { stop_requested: false, needs_human: true, background_active: true, stop_ready: false },
    })), "utf-8");
    const snapshot = await mod.buildSupervisorSnapshot(stateDir, undefined, "state.json");
    expect(snapshot.decision).toBe("needs_human");
  });

  it("returns stop when iteration cap reached", async () => {
    const stateDir = resolve(TMP_DIR, "buildSupervisorSnapshot-cap");
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(resolve(stateDir, "state.json"), JSON.stringify(createMinimalState({
      stats: { kept: 5, discarded: 0, needs_human: 0, consecutive_discards: 0, total_iterations: 10 },
      iterations_cap: 10,
    })), "utf-8");
    const snapshot = await mod.buildSupervisorSnapshot(stateDir, undefined, "state.json");
    expect(snapshot.decision).toBe("stop");
    expect(snapshot.reason).toBe("iteration_cap_reached");
  });

  it("returns stop for completed status", async () => {
    const stateDir = resolve(TMP_DIR, "buildSupervisorSnapshot-completed");
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(resolve(stateDir, "state.json"), JSON.stringify(createMinimalState({ status: "completed" })), "utf-8");
    const snapshot = await mod.buildSupervisorSnapshot(stateDir, undefined, "state.json");
    expect(snapshot.decision).toBe("stop");
    expect(snapshot.reason).toBe("state_completed");
  });

  it("returns stop when deadline elapsed", async () => {
    const stateDir = resolve(TMP_DIR, "buildSupervisorSnapshot-deadline");
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
    mkdirSync(stateDir, { recursive: true });
    const pastDeadline = new Date(Date.now() - 3600000).toISOString();
    writeFileSync(resolve(stateDir, "state.json"), JSON.stringify(createMinimalState({
      deadline_at: pastDeadline,
    })), "utf-8");
    const snapshot = await mod.buildSupervisorSnapshot(stateDir, undefined, "state.json");
    expect(snapshot.decision).toBe("stop");
    expect(snapshot.reason).toBe("duration_elapsed");
  });

  it("returns relaunch for healthy running state", async () => {
    const stateDir = resolve(TMP_DIR, "buildSupervisorSnapshot-relaunch");
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(resolve(stateDir, "state.json"), JSON.stringify(createMinimalState()), "utf-8");
    const snapshot = await mod.buildSupervisorSnapshot(stateDir, undefined, "state.json");
    expect(snapshot.decision).toBe("relaunch");
    expect(snapshot.reason).toBe("ready_for_next_iteration");
  });

  it("counts results rows from results file", async () => {
    const stateDir = resolve(TMP_DIR, "buildSupervisorSnapshot-rows");
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(resolve(stateDir, "state.json"), JSON.stringify(createMinimalState()), "utf-8");
    const header = "timestamp\titeration\tdecision\tmetric_value\tverify_status\tguard_status\thypothesis\tchange_summary\tlabels\tnote\n";
    const row = "2024-01-01T00:00:00Z\t1\tkeep\t42\tpass\tpass\thyp\tchange\tlabel\tnote\n";
    writeFileSync(resolve(stateDir, "autoresearch-results.tsv"), header + row, "utf-8");
    const snapshot = await mod.buildSupervisorSnapshot(stateDir, "autoresearch-results.tsv", "state.json");
    expect(snapshot.results_rows).toBe(1);
  });

  it("counts zero rows when results file is empty", async () => {
    const stateDir = resolve(TMP_DIR, "buildSupervisorSnapshot-empty");
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(resolve(stateDir, "state.json"), JSON.stringify(createMinimalState()), "utf-8");
    const header = "timestamp\titeration\tdecision\tmetric_value\tverify_status\tguard_status\thypothesis\tchange_summary\tlabels\tnote\n";
    writeFileSync(resolve(stateDir, "autoresearch-results.tsv"), header, "utf-8");
    const snapshot = await mod.buildSupervisorSnapshot(stateDir, "autoresearch-results.tsv", "state.json");
    expect(snapshot.results_rows).toBe(0);
  });

  it("rejects symlinked results files", async () => {
    const stateDir = resolve(TMP_DIR, "buildSupervisorSnapshot-symlink");
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(resolve(stateDir, "state.json"), JSON.stringify(createMinimalState()), "utf-8");
    symlinkSync("/dev/zero", resolve(stateDir, "autoresearch-results.tsv"));
    await expect(mod.buildSupervisorSnapshot(stateDir, "autoresearch-results.tsv", "state.json"))
      .rejects.toThrow("Refusing to read symlinked results file");
  });

  it("rejects oversized results files before reading them", async () => {
    const stateDir = resolve(TMP_DIR, "buildSupervisorSnapshot-oversized");
    try { rmSync(stateDir, { recursive: true, force: true }); } catch {}
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(resolve(stateDir, "state.json"), JSON.stringify(createMinimalState()), "utf-8");
    writeFileSync(resolve(stateDir, "autoresearch-results.tsv"), Buffer.alloc((10 * 1024 * 1024) + 1));
    await expect(mod.buildSupervisorSnapshot(stateDir, "autoresearch-results.tsv", "state.json"))
      .rejects.toThrow("Refusing to read results file larger than");
  });
});

describe("appendIteration", () => {
  let mod: any;
  beforeAll(async () => { mod = await importRunManager(); });

  const stateDir = resolve(TMP_DIR, "appendIteration");
  const stateFile = resolve(stateDir, "state.json");
  const resultsFile = resolve(stateDir, "autoresearch-results.tsv");

  function initState(overrides: Partial<RunState> = {}) {
    rmSync(stateDir, { recursive: true, force: true });
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(stateFile, JSON.stringify(createMinimalState(overrides)), "utf-8");
    if (!existsSync(resultsFile)) {
      const resultsDir = dirname(resultsFile);
      if (!existsSync(resultsDir)) mkdirSync(resultsDir, { recursive: true });
      const header = "timestamp\titeration\tdecision\tmetric_value\tverify_status\tguard_status\thypothesis\tchange_summary\tlabels\tnote\n";
      writeFileSync(resultsFile, header, "utf-8");
    }
  }

  it("appends a keep iteration and increments kept count", async () => {
    initState();
    const result = await mod.appendIteration(stateDir, "autoresearch-results.tsv", "state.json", "keep", "42", "pass", "pass", "hypothesis test", "change summary", ["fix"], "note");
    expect(result.stats.total_iterations).toBe(1);
    expect(result.stats.kept).toBe(1);
    expect(result.stats.discarded).toBe(0);
    expect(result.flags.stop_ready).toBe(true);
    expect(result.last_iteration.decision).toBe("keep");
    expect(result.last_iteration.metric_value).toBe("42");
  });

  it("appends a discard iteration and increments discard count", async () => {
    initState();
    const result = await mod.appendIteration(stateDir, "autoresearch-results.tsv", "state.json", "discard", "30", "fail", "pass", "hypothesis test", "change summary", ["fix"], "note");
    expect(result.stats.total_iterations).toBe(1);
    expect(result.stats.discarded).toBe(1);
    expect(result.stats.kept).toBe(0);
    expect(result.stats.consecutive_discards).toBe(1);
    expect(result.flags.stop_ready).toBe(false);
  });

  it("appends a needs_human iteration and sets flag", async () => {
    initState();
    const result = await mod.appendIteration(stateDir, "autoresearch-results.tsv", "state.json", "needs_human", "", "skip", "skip", "", "needs review", [], "");
    expect(result.stats.needs_human).toBe(1);
    expect(result.flags.needs_human).toBe(true);
  });

  it("tracks consecutive discards", async () => {
    initState();
    await mod.appendIteration(stateDir, "autoresearch-results.tsv", "state.json", "discard", "", "pass", "pass", "", "bad change", [], "");
    await mod.appendIteration(stateDir, "autoresearch-results.tsv", "state.json", "discard", "", "pass", "pass", "", "another bad", [], "");
    const result = await mod.appendIteration(stateDir, "autoresearch-results.tsv", "state.json", "discard", "", "fail", "pass", "", "third bad", [], "");
    expect(result.stats.discarded).toBe(3);
    expect(result.stats.consecutive_discards).toBe(3);
  });

  it("resets consecutive discards on keep", async () => {
    initState();
    await mod.appendIteration(stateDir, "autoresearch-results.tsv", "state.json", "discard", "", "pass", "pass", "", "bad", [], "");
    const result = await mod.appendIteration(stateDir, "autoresearch-results.tsv", "state.json", "keep", "80", "pass", "pass", "", "good", ["fix"], "");
    expect(result.stats.consecutive_discards).toBe(0);
    expect(result.stats.kept).toBe(1);
  });

  it("enforces required keep labels", async () => {
    initState({
      label_requirements: { keep: ["reviewed", "approved"], stop: [] },
    });
    await expect(mod.appendIteration(stateDir, "autoresearch-results.tsv", "state.json", "keep", "", "pass", "pass", "", "missing labels", [], "")).rejects.toThrow("Keep requires labels");
  });

  it("sets stop_ready false when stop labels are missing on keep", async () => {
    initState({
      label_requirements: { keep: [], stop: ["blocker_fixed"] },
    });
    const result = await mod.appendIteration(stateDir, "autoresearch-results.tsv", "state.json", "keep", "50", "pass", "pass", "", "missing stop label", ["fix"], "");
    expect(result.flags.stop_ready).toBe(false);
    expect(result.last_iteration.stop_labels_satisfied).toBe(false);
  });

  it("writes a tab-separated row to the results file", async () => {
    initState();
    await mod.appendIteration(stateDir, "autoresearch-results.tsv", "state.json", "keep", "90", "pass", "pass", "hyp", "change", ["test"], "note");
    const content = readFileSync(resultsFile, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(2); // header + 1 row
    expect(lines[1]).toContain("\tkeep\t90\tpass\tpass\t");
  });

  it("uses explicit iteration number when provided", async () => {
    initState();
    const result = await mod.appendIteration(stateDir, "autoresearch-results.tsv", "state.json", "keep", "10", "pass", "pass", "", "explicit iter", [], "", 42);
    expect(result.stats.total_iterations).toBe(42);
    expect(result.last_iteration.iteration).toBe(42);
  });

  it("persists state to disk", async () => {
    initState();
    await mod.appendIteration(stateDir, "autoresearch-results.tsv", "state.json", "keep", "95", "pass", "pass", "", "persist test", ["fix"], "");
    const diskState = JSON.parse(readFileSync(stateFile, "utf-8"));
    expect(diskState.stats.kept).toBe(1);
    expect(diskState.stats.total_iterations).toBe(1);
  });
});
