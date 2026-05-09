import { resolve } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const CLI = resolve(REPO_ROOT, "dist/cli.js");

describe("GoalDoc helpers", () => {
  let mod: {
    formatGoalDoc: (doc: unknown) => string;
    parseGoalDocContent: (content: string) => unknown;
    writeGoalDoc: (path: string, doc: unknown) => void;
    readGoalDoc: (path: string) => unknown;
  };

  beforeAll(async () => {
    mod = await import(resolve(REPO_ROOT, "dist/helpers.js")) as typeof mod;
  });

  it("formatGoalDoc produces expected sections", () => {
    const doc = {
      goal: "Reduce errors",
      metric: "errors",
      direction: "lower",
      verify: "npm test",
      guard: "npm run typecheck",
      constraints: "No breaking changes",
      file_map: "src/**",
      stop_conditions: "errors === 0",
    };
    const output = mod.formatGoalDoc(doc);
    expect(output).toContain("# AutoResearch Goal");
    expect(output).toContain("<!-- autoresearch goal.md -->");
    expect(output).toContain("## goal\nReduce errors");
    expect(output).toContain("## metric\nerrors");
    expect(output).toContain("## direction\nlower");
    expect(output).toContain("## verify\nnpm test");
    expect(output).toContain("## guard\nnpm run typecheck");
    expect(output).toContain("## constraints\nNo breaking changes");
    expect(output).toContain("## file_map\nsrc/**");
    expect(output).toContain("## stop_conditions\nerrors === 0");
  });

  it("formatGoalDoc handles optional fields as empty sections", () => {
    const doc = {
      goal: "My goal",
      metric: "score",
      direction: "higher",
      verify: "make test",
    };
    const output = mod.formatGoalDoc(doc);
    expect(output).toContain("## guard\n");
    expect(output).toContain("## constraints\n");
    expect(output).toContain("## file_map\n");
    expect(output).toContain("## stop_conditions\n");
  });

  it("parseGoalDocContent round-trips with formatGoalDoc", () => {
    const doc = {
      goal: "Optimize response time",
      metric: "latency_ms",
      direction: "lower",
      verify: "npm run bench",
      guard: "npm test",
      constraints: "No dependencies added",
      file_map: "src/server.ts",
      stop_conditions: "latency < 100ms",
    };
    const content = mod.formatGoalDoc(doc);
    const parsed = mod.parseGoalDocContent(content) as typeof doc;
    expect(parsed.goal).toBe(doc.goal);
    expect(parsed.metric).toBe(doc.metric);
    expect(parsed.direction).toBe(doc.direction);
    expect(parsed.verify).toBe(doc.verify);
    expect(parsed.guard).toBe(doc.guard);
    expect(parsed.constraints).toBe(doc.constraints);
    expect(parsed.file_map).toBe(doc.file_map);
    expect(parsed.stop_conditions).toBe(doc.stop_conditions);
  });

  it("parseGoalDocContent defaults direction to 'lower' when missing", () => {
    const content = "# AutoResearch Goal\n\n## goal\nTest\n\n## metric\nm\n\n## verify\ncmd\n";
    const parsed = mod.parseGoalDocContent(content) as { direction: string };
    expect(parsed.direction).toBe("lower");
  });

  it("parseGoalDocContent returns undefined for empty optional fields", () => {
    const doc = { goal: "g", metric: "m", direction: "lower", verify: "v" };
    const content = mod.formatGoalDoc(doc);
    const parsed = mod.parseGoalDocContent(content) as typeof doc & {
      guard?: string;
      constraints?: string;
    };
    expect(parsed.guard).toBeUndefined();
    expect(parsed.constraints).toBeUndefined();
  });

  it("writeGoalDoc creates a file and readGoalDoc reads it back", () => {
    const tmpDir = resolve(tmpdir(), `test-goal-doc-${Date.now()}`);
    mkdirSync(tmpDir, { recursive: true });
    const goalPath = resolve(tmpDir, "goal.md");
    try {
      const doc = {
        goal: "Write tests",
        metric: "coverage",
        direction: "higher",
        verify: "jest",
        guard: undefined,
        constraints: undefined,
        file_map: undefined,
        stop_conditions: undefined,
      };
      mod.writeGoalDoc(goalPath, doc);
      expect(existsSync(goalPath)).toBe(true);
      const read = mod.readGoalDoc(goalPath) as typeof doc;
      expect(read.goal).toBe("Write tests");
      expect(read.metric).toBe("coverage");
      expect(read.direction).toBe("higher");
      expect(read.verify).toBe("jest");
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("readGoalDoc throws AutoresearchError when file missing", async () => {
    expect(() => mod.readGoalDoc("/nonexistent/path/goal.md")).toThrow("Missing file:");
  });
});

describe("CLI goal command", () => {
  let tmpDir: string;
  let goalPath: string;

  beforeEach(() => {
    tmpDir = resolve(tmpdir(), `test-cli-goal-${Date.now()}`);
    mkdirSync(resolve(tmpDir, ".autoresearch"), { recursive: true });
    goalPath = resolve(tmpDir, ".autoresearch", "goal.md");
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("reports when no goal document exists", () => {
    const out = execFileSync("node", [CLI, "goal", "--repo", tmpDir], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });
    expect(out).toContain("No goal document found");
  });

  it("displays goal document in human-readable form", async () => {
    const { writeGoalDoc } = await import(resolve(REPO_ROOT, "dist/helpers.js")) as {
      writeGoalDoc: (path: string, doc: object) => void;
    };
    writeGoalDoc(goalPath, {
      goal: "Reduce latency",
      metric: "latency_ms",
      direction: "lower",
      verify: "npm run bench",
      guard: "npm test",
      constraints: undefined,
      file_map: undefined,
      stop_conditions: undefined,
    });
    const out = execFileSync("node", [CLI, "goal", "--repo", tmpDir], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });
    expect(out).toContain("Reduce latency");
    expect(out).toContain("latency_ms");
    expect(out).toContain("lower");
    expect(out).toContain("npm run bench");
    expect(out).toContain("npm test");
  });

  it("outputs goal document as JSON with --json flag", async () => {
    const { writeGoalDoc } = await import(resolve(REPO_ROOT, "dist/helpers.js")) as {
      writeGoalDoc: (path: string, doc: object) => void;
    };
    writeGoalDoc(goalPath, {
      goal: "Improve coverage",
      metric: "coverage",
      direction: "higher",
      verify: "jest",
      guard: undefined,
      constraints: undefined,
      file_map: undefined,
      stop_conditions: undefined,
    });
    const out = execFileSync("node", [CLI, "goal", "--json", "--repo", tmpDir], {
      encoding: "utf-8",
      cwd: REPO_ROOT,
    });
    const parsed = JSON.parse(out);
    expect(parsed.goal).toBe("Improve coverage");
    expect(parsed.metric).toBe("coverage");
    expect(parsed.direction).toBe("higher");
    expect(parsed.verify).toBe("jest");
  });

  it("init creates goal.md alongside state.json", () => {
    const out = execFileSync(
      "node",
      [CLI, "init", "--goal", "reduce bugs", "--metric", "bugs", "--direction", "lower",
       "--verify", "npm test", "--repo", tmpDir],
      { encoding: "utf-8", cwd: REPO_ROOT },
    );
    expect(existsSync(goalPath)).toBe(true);
    const content = readFileSync(goalPath, "utf-8");
    expect(content).toContain("reduce bugs");
    expect(content).toContain("bugs");
    expect(content).toContain("lower");
    expect(content).toContain("npm test");
  });

  it("init with scope writes file_map in goal.md", () => {
    execFileSync(
      "node",
      [CLI, "init", "--goal", "fix lint", "--metric", "warnings", "--direction", "lower",
       "--verify", "npm run lint", "--scope", "src/**", "--repo", tmpDir],
      { encoding: "utf-8", cwd: REPO_ROOT },
    );
    const content = readFileSync(goalPath, "utf-8");
    expect(content).toContain("src/**");
  });
});
