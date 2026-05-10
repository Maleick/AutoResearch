import { planCompaction, executeCompaction, rollbackCompaction } from "../src/compaction.js";
import { mkdirSync, writeFileSync, rmSync, existsSync, utimesSync, readFileSync, symlinkSync } from "fs";
import { resolve } from "path";

const REPO_ROOT = process.cwd();

describe("Compaction", () => {
  const tmpDir = resolve(REPO_ROOT, ".autoresearch-test-compaction");

  beforeEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty plan when no autoresearch directory", () => {
    const plan = planCompaction(tmpDir, 5);
    expect(plan.filesToArchive).toHaveLength(0);
    expect(plan.filesToPreserve).toHaveLength(0);
  });

  it("preserves current state and results", () => {
    const autoDir = resolve(tmpDir, ".autoresearch");
    mkdirSync(autoDir, { recursive: true });
    writeFileSync(resolve(autoDir, "state.json"), "{}");
    writeFileSync(resolve(tmpDir, "autoresearch-results.tsv"), "timestamp\titeration\tdecision\n");

    const plan = planCompaction(tmpDir, 5);
    expect(plan.filesToPreserve).toContain(resolve(autoDir, "state.json"));
    expect(plan.filesToPreserve).toContain(resolve(tmpDir, "autoresearch-results.tsv"));
  });

  it("plans to archive old run directories", () => {
    const autoDir = resolve(tmpDir, ".autoresearch");
    mkdirSync(autoDir, { recursive: true });
    writeFileSync(resolve(autoDir, "state.json"), "{}");

    // Create old run directories
    for (let i = 1; i <= 3; i++) {
      const runDir = resolve(autoDir, `run-old-${i}`);
      mkdirSync(runDir, { recursive: true });
      writeFileSync(resolve(runDir, "state.json"), `{}`);
    }

    const plan = planCompaction(tmpDir, 2);
    expect(plan.filesToArchive.length).toBeGreaterThan(0);
    expect(plan.filesToPreserve.length).toBeGreaterThan(0);
  });

  it("executes compaction in dry-run mode", () => {
    const autoDir = resolve(tmpDir, ".autoresearch");
    mkdirSync(autoDir, { recursive: true });
    writeFileSync(resolve(autoDir, "state.json"), "{}");

    const plan = planCompaction(tmpDir, 5);
    const result = executeCompaction(tmpDir, plan, true);
    expect(result.success).toBe(true);
    expect(result.archived.length).toBe(0); // dry-run doesn't actually archive
  });

  it("preserves active worker/newest logs and archives older logs", () => {
    const logsDir = resolve(tmpDir, ".autoresearch", "logs");
    mkdirSync(logsDir, { recursive: true });
    const workerLog = resolve(logsDir, "worker.log");
    const oldLog = resolve(logsDir, "old.log");
    const recentLog = resolve(logsDir, "recent.log");
    writeFileSync(workerLog, "worker");
    writeFileSync(oldLog, "old");
    writeFileSync(recentLog, "recent");
    utimesSync(oldLog, new Date("2026-01-01T00:00:00Z"), new Date("2026-01-01T00:00:00Z"));
    utimesSync(workerLog, new Date("2026-01-02T00:00:00Z"), new Date("2026-01-02T00:00:00Z"));
    utimesSync(recentLog, new Date("2026-01-03T00:00:00Z"), new Date("2026-01-03T00:00:00Z"));

    const plan = planCompaction(tmpDir, 5);
    expect(plan.filesToPreserve).toContain(workerLog);
    expect(plan.filesToPreserve).toContain(recentLog);
    expect(plan.filesToArchive).toContain(oldLog);
    expect(plan.filesToArchive).not.toContain(workerLog);
    expect(plan.filesToArchive).not.toContain(recentLog);
  });

  it("tracks reclaimed space for archived directories", () => {
    const runDir = resolve(tmpDir, ".autoresearch", "run-old-1");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(resolve(runDir, "results.tsv"), "1234567890");

    const plan = planCompaction(tmpDir, 0);
    const result = executeCompaction(tmpDir, plan, false);
    expect(result.success).toBe(true);
    expect(result.spaceReclaimed).toBeGreaterThanOrEqual(10);
    expect(existsSync(runDir)).toBe(false);
  });
  it("rolls back archived files inside the autoresearch directory", () => {
    const autoDir = resolve(tmpDir, ".autoresearch");
    const runDir = resolve(autoDir, "run-old-1");
    mkdirSync(runDir, { recursive: true });
    writeFileSync(resolve(runDir, "state.json"), "archived");

    const plan = planCompaction(tmpDir, 0);
    const result = executeCompaction(tmpDir, plan, false);
    expect(result.success).toBe(true);
    expect(result.rollbackPath).not.toBeNull();
    expect(existsSync(runDir)).toBe(false);

    expect(rollbackCompaction(result.rollbackPath!)).toBe(true);
    expect(readFileSync(resolve(runDir, "state.json"), "utf-8")).toBe("archived");
  });

  it("rejects rollback manifests with destinations outside .autoresearch", () => {
    const rollbackDir = resolve(tmpDir, ".autoresearch", "archive", "malicious");
    const outsideDir = resolve(tmpDir, "outside-target");
    mkdirSync(rollbackDir, { recursive: true });
    mkdirSync(outsideDir, { recursive: true });
    writeFileSync(resolve(outsideDir, "secret.txt"), "keep");
    writeFileSync(resolve(rollbackDir, "outside-target"), "replacement");
    writeFileSync(
      resolve(rollbackDir, "manifest.json"),
      JSON.stringify({ files: [outsideDir] }),
    );

    expect(rollbackCompaction(rollbackDir)).toBe(false);
    expect(readFileSync(resolve(outsideDir, "secret.txt"), "utf-8")).toBe("keep");
  });

  it("rejects rollback destinations that traverse symlinked directories", () => {
    const rollbackDir = resolve(tmpDir, ".autoresearch", "archive", "malicious");
    const outsideDir = resolve(tmpDir, "outside-link-target");
    const logsLink = resolve(tmpDir, ".autoresearch", "logs");
    const destination = resolve(logsLink, "old.log");
    mkdirSync(rollbackDir, { recursive: true });
    mkdirSync(outsideDir, { recursive: true });
    symlinkSync(outsideDir, logsLink, "dir");
    writeFileSync(resolve(outsideDir, "old.log"), "keep");
    writeFileSync(resolve(rollbackDir, "old.log"), "replacement");
    writeFileSync(
      resolve(rollbackDir, "manifest.json"),
      JSON.stringify({ files: [destination] }),
    );

    expect(rollbackCompaction(rollbackDir)).toBe(false);
    expect(readFileSync(resolve(outsideDir, "old.log"), "utf-8")).toBe("keep");
  });


});
