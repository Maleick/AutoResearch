import { planCompaction, executeCompaction } from "../src/compaction.js";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "fs";
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
});
