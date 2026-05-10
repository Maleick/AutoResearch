import { mkdtempSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, lstatSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { fileURLToPath } from "url";
import { resolve } from "path";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const importTaskQueue = async () => await import(resolve(REPO_ROOT, "dist/task-queue.js"));

describe("task queue manifest writes", () => {
  let tmpRoot: string;

  beforeEach(() => {
    tmpRoot = mkdtempSync(join(tmpdir(), "autoresearch-task-queue-"));
  });

  afterEach(() => {
    try { rmSync(tmpRoot, { recursive: true, force: true }); } catch {}
  });

  it("does not follow an existing queue manifest symlink on enqueue", async () => {
    const repo = join(tmpRoot, "repo");
    const autoresearchDir = join(repo, ".autoresearch");
    const queuePath = join(autoresearchDir, "task-queue.json");
    const victimPath = join(tmpRoot, "victim-config.json");
    mkdirSync(autoresearchDir, { recursive: true });
    writeFileSync(victimPath, "SENTINEL_DO_NOT_OVERWRITE\n", "utf-8");
    symlinkSync(victimPath, queuePath);

    const { enqueueTasks } = await importTaskQueue();
    const tasks = await enqueueTasks(repo, [
      { goal: "safe goal", metric: "safe metric", verify: "true" },
    ]);

    expect(tasks).toHaveLength(1);
    expect(readFileSync(victimPath, "utf-8")).toBe("SENTINEL_DO_NOT_OVERWRITE\n");
    expect(lstatSync(queuePath).isSymbolicLink()).toBe(false);
    expect(readFileSync(queuePath, "utf-8")).toContain("safe goal");
  });

  it("refuses to write the queue manifest through a symlinked .autoresearch directory", async () => {
    const repo = join(tmpRoot, "repo");
    const outsideDir = join(tmpRoot, "outside-autoresearch");
    const autoresearchDir = join(repo, ".autoresearch");
    mkdirSync(repo, { recursive: true });
    mkdirSync(outsideDir, { recursive: true });
    symlinkSync(outsideDir, autoresearchDir);

    const { enqueueTasks } = await importTaskQueue();
    await expect(enqueueTasks(repo, [
      { goal: "unsafe goal", metric: "metric", verify: "true" },
    ])).rejects.toThrow("Refusing to write outside repository");
  });
});
