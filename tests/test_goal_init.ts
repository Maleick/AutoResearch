import { resolve } from "path";
import { fileURLToPath } from "url";
import { execFileSync, spawnSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, writeFileSync, lstatSync } from "fs";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const CLI = resolve(REPO_ROOT, "dist/cli.js");
const NODE = process.execPath;

/** Run CLI via execFileSync to avoid shell injection alerts */
const runCLI = (args: string[], opts: { cwd?: string } = {}): string =>
  execFileSync(NODE, [CLI, ...args], { encoding: "utf-8", cwd: opts.cwd ?? REPO_ROOT });

/** Run CLI, capturing combined stderr+stdout regardless of exit code */
const runCLICombined = (args: string[], opts: { cwd?: string } = {}): string => {
  const result = spawnSync(NODE, [CLI, ...args], {
    encoding: "utf-8",
    cwd: opts.cwd ?? REPO_ROOT,
  });
  return (result.stdout ?? "") + (result.stderr ?? "");
};

const importGoalInit = async () => await import(resolve(REPO_ROOT, "dist/goal-init.js"));

describe("goal-init module", () => {
  let mod: any;
  beforeAll(async () => { mod = await importGoalInit(); });

  describe("GOAL_TEMPLATES", () => {
    it("has performance, quality, coverage, and custom templates", () => {
      const ids = mod.GOAL_TEMPLATES.map((t: any) => t.id);
      expect(ids).toContain("performance");
      expect(ids).toContain("quality");
      expect(ids).toContain("coverage");
      expect(ids).toContain("custom");
    });

    it("each template has id, name, description, and defaults", () => {
      for (const t of mod.GOAL_TEMPLATES) {
        expect(typeof t.id).toBe("string");
        expect(typeof t.name).toBe("string");
        expect(typeof t.description).toBe("string");
        expect(typeof t.defaults).toBe("object");
      }
    });
  });

  describe("getGoalTemplate", () => {
    it("returns template by id", () => {
      const t = mod.getGoalTemplate("performance");
      expect(t).toBeDefined();
      expect(t.id).toBe("performance");
    });

    it("returns undefined for unknown template", () => {
      const t = mod.getGoalTemplate("nonexistent");
      expect(t).toBeUndefined();
    });
  });

  describe("buildGoalDocument", () => {
    it("includes goal in output", () => {
      const doc = mod.buildGoalDocument({ goal: "reduce latency" });
      expect(doc).toContain("# Goal: reduce latency");
    });

    it("includes metric name in output", () => {
      const doc = mod.buildGoalDocument({ goal: "test", metric: "p99_ms" });
      expect(doc).toContain("p99_ms");
    });

    it("includes verify command in output", () => {
      const doc = mod.buildGoalDocument({ goal: "test", verify: "npm test" });
      expect(doc).toContain("`npm test`");
    });

    it("includes direction, defaults to lower", () => {
      const doc = mod.buildGoalDocument({ goal: "test" });
      expect(doc).toContain("lower");
    });

    it("includes higher direction when provided", () => {
      const doc = mod.buildGoalDocument({ goal: "test", direction: "higher" });
      expect(doc).toContain("higher");
    });

    it("includes mode, defaults to foreground", () => {
      const doc = mod.buildGoalDocument({ goal: "test" });
      expect(doc).toContain("foreground");
    });

    it("includes background mode when provided", () => {
      const doc = mod.buildGoalDocument({ goal: "test", mode: "background" });
      expect(doc).toContain("background");
    });

    it("includes scope when provided", () => {
      const doc = mod.buildGoalDocument({ goal: "test", scope: "src/" });
      expect(doc).toContain("src/");
    });

    it("includes guard when provided", () => {
      const doc = mod.buildGoalDocument({ goal: "test", guard: "npm run lint" });
      expect(doc).toContain("npm run lint");
    });

    it("omits guard when not provided", () => {
      const doc = mod.buildGoalDocument({ goal: "test" });
      expect(doc).not.toContain("Guard:");
    });

    it("includes iterations when provided", () => {
      const doc = mod.buildGoalDocument({ goal: "test", iterations: 20 });
      expect(doc).toContain("20");
    });

    it("includes duration when provided", () => {
      const doc = mod.buildGoalDocument({ goal: "test", duration: "2h" });
      expect(doc).toContain("2h");
    });

    it("includes stop_condition when provided", () => {
      const doc = mod.buildGoalDocument({ goal: "test", stop_condition: "10 iterations" });
      expect(doc).toContain("Stop Condition");
      expect(doc).toContain("10 iterations");
    });

    it("includes rollback_strategy when provided", () => {
      const doc = mod.buildGoalDocument({ goal: "test", rollback_strategy: "discard" });
      expect(doc).toContain("Rollback Strategy");
      expect(doc).toContain("discard");
    });

    it("includes template comment for non-custom templates", () => {
      const doc = mod.buildGoalDocument({ goal: "test", template: "performance" });
      expect(doc).toContain("<!-- template: performance -->");
    });

    it("omits template comment for custom template", () => {
      const doc = mod.buildGoalDocument({ goal: "test", template: "custom" });
      expect(doc).not.toContain("<!-- template:");
    });

    it("uses placeholder goal when not provided", () => {
      const doc = mod.buildGoalDocument({});
      expect(doc).toContain("<describe the outcome");
    });
  });

  describe("buildGoalInitResult", () => {
    it("returns correct fields", () => {
      const result = mod.buildGoalInitResult("/path/to/GOAL.md", { goal: "test", metric: "m", verify: "npm test" }, false);
      expect(result.goal_path).toBe("/path/to/GOAL.md");
      expect(result.goal).toBe("test");
      expect(result.metric).toBe("m");
      expect(result.verify).toBe("npm test");
      expect(result.direction).toBe("lower");
      expect(result.mode).toBe("foreground");
      expect(result.template).toBe("custom");
      expect(result.interactive).toBe(false);
    });

    it("sets interactive flag correctly", () => {
      const result = mod.buildGoalInitResult("/path/to/GOAL.md", { goal: "test" }, true);
      expect(result.interactive).toBe(true);
    });
  });
});

describe("CLI: goal command", () => {
  const tmpDir = resolve(REPO_ROOT, ".autoresearch-test-goal-init");
  const goalPath = resolve(tmpDir, ".autoresearch", "goal.md");

  afterEach(() => {
    try { rmSync(tmpDir, { recursive: true }); } catch {}
    try { rmSync(tmpDir + "-victim", { force: true }); } catch {}
    try { rmSync(tmpDir + "-outside", { force: true }); } catch {}
  });

  describe("goal help", () => {
    it("shows usage for goal help", () => {
      const out = runCLICombined(["goal", "help"]);
      expect(out).toContain("autoresearch goal <subcommand>");
      expect(out).toContain("init");
    });

    it("shows usage when no subcommand given", () => {
      const out = runCLICombined(["goal"]);
      expect(out).toContain("init");
    });

    it("rejects unknown subcommand", () => {
      const out = runCLICombined(["goal", "unknown"]);
      expect(out).toContain("Unknown goal subcommand");
    });
  });

  describe("goal init non-interactive", () => {
    it("creates default goal document under .autoresearch from flags", () => {
      mkdirSync(tmpDir, { recursive: true });
      runCLI(["goal", "init", "--goal", "reduce errors", "--metric", "failures", "--direction", "lower", "--verify", "npm test", "--repo", tmpDir]);
      expect(existsSync(goalPath)).toBe(true);
      const content = readFileSync(goalPath, "utf-8");
      expect(content).toContain("# Goal: reduce errors");
      expect(content).toContain("failures");
      expect(content).toContain("npm test");
    });

    it("outputs human-readable confirmation", () => {
      mkdirSync(tmpDir, { recursive: true });
      const out = runCLI(["goal", "init", "--goal", "reduce errors", "--metric", "failures", "--verify", "npm test", "--repo", tmpDir]);
      expect(out).toContain("✓ Goal definition written");
      expect(out).toContain("reduce errors");
    });

    it("outputs JSON when --json flag is set", () => {
      mkdirSync(tmpDir, { recursive: true });
      const out = runCLI(["goal", "init", "--goal", "reduce errors", "--metric", "failures", "--verify", "npm test", "--repo", tmpDir, "--json"]);
      const json = JSON.parse(out);
      expect(json.goal).toBe("reduce errors");
      expect(json.metric).toBe("failures");
      expect(json.goal_path).toBeDefined();
      expect(json.template).toBe("custom");
    });

    it("supports --dry-run without creating file", () => {
      mkdirSync(tmpDir, { recursive: true });
      const out = runCLI(["goal", "init", "--goal", "reduce errors", "--metric", "failures", "--verify", "npm test", "--repo", tmpDir, "--dry-run"]);
      expect(out).toContain("[dry-run]");
      expect(existsSync(goalPath)).toBe(false);
    });

    it("--dry-run with --json outputs JSON with dry_run true", () => {
      mkdirSync(tmpDir, { recursive: true });
      const out = runCLI(["goal", "init", "--goal", "reduce errors", "--metric", "failures", "--verify", "npm test", "--repo", tmpDir, "--dry-run", "--json"]);
      const json = JSON.parse(out);
      expect(json.dry_run).toBe(true);
      expect(existsSync(goalPath)).toBe(false);
    });

    it("supports performance template", () => {
      mkdirSync(tmpDir, { recursive: true });
      const out = runCLI(["goal", "init", "--template", "performance", "--dry-run", "--repo", tmpDir]);
      expect(out).toContain("benchmark_ms");
      expect(out).toContain("<!-- template: performance -->");
    });

    it("supports quality template", () => {
      mkdirSync(tmpDir, { recursive: true });
      const out = runCLI(["goal", "init", "--template", "quality", "--dry-run", "--repo", tmpDir]);
      expect(out).toContain("test_failures");
    });

    it("supports coverage template", () => {
      mkdirSync(tmpDir, { recursive: true });
      const out = runCLI(["goal", "init", "--template", "coverage", "--dry-run", "--repo", tmpDir]);
      expect(out).toContain("coverage_pct");
      expect(out).toContain("higher");
    });

    it("rejects unknown template", () => {
      mkdirSync(tmpDir, { recursive: true });
      const out = runCLICombined(["goal", "init", "--template", "unknown", "--repo", tmpDir]);
      expect(out).toContain("Unknown template");
    });

    it("allows overriding template fields with flags", () => {
      mkdirSync(tmpDir, { recursive: true });
      const out = runCLI(["goal", "init", "--template", "performance", "--goal", "custom goal override", "--dry-run", "--repo", tmpDir]);
      expect(out).toContain("# Goal: custom goal override");
    });

    it("supports custom goal-path", () => {
      mkdirSync(tmpDir, { recursive: true });
      const customPath = resolve(tmpDir, "MY_GOAL.md");
      runCLI(["goal", "init", "--goal", "test", "--metric", "m", "--verify", "echo", "--goal-path", customPath]);
      expect(existsSync(customPath)).toBe(true);
      rmSync(customPath, { force: true });
    });

    it("does not follow a symlinked default GOAL.md", () => {
      mkdirSync(tmpDir, { recursive: true });
      const outsidePath = tmpDir + "-victim";
      writeFileSync(outsidePath, "original content\n", "utf-8");
      symlinkSync(outsidePath, goalPath);

      runCLI(["goal", "init", "--goal", "test", "--metric", "m", "--verify", "echo", "--repo", tmpDir]);

      expect(readFileSync(outsidePath, "utf-8")).toBe("original content\n");
      expect(lstatSync(goalPath).isSymbolicLink()).toBe(false);
      expect(readFileSync(goalPath, "utf-8")).toContain("# Goal: test");
      rmSync(outsidePath, { force: true });
    });

    it("rejects goal paths that resolve outside the repository", () => {
      mkdirSync(tmpDir, { recursive: true });
      const outsidePath = tmpDir + "-outside";
      const result = spawnSync(NODE, [CLI, "goal", "init", "--goal", "test", "--metric", "m", "--verify", "echo", "--repo", tmpDir, "--goal-path", outsidePath], {
        encoding: "utf-8",
      });

      expect(result.status).not.toBe(0);
      expect((result.stdout ?? "") + (result.stderr ?? "")).toContain("Refusing to write outside repository");
      expect(existsSync(outsidePath)).toBe(false);
    });

    it("includes guard in GOAL.md when provided", () => {
      mkdirSync(tmpDir, { recursive: true });
      const out = runCLI(["goal", "init", "--goal", "test", "--metric", "m", "--verify", "npm test", "--guard", "npm run lint", "--dry-run", "--repo", tmpDir]);
      expect(out).toContain("npm run lint");
    });

    it("includes scope in GOAL.md when provided", () => {
      mkdirSync(tmpDir, { recursive: true });
      const out = runCLI(["goal", "init", "--goal", "test", "--metric", "m", "--verify", "npm test", "--scope", "src/", "--dry-run", "--repo", tmpDir]);
      expect(out).toContain("src/");
    });

    it("reads config from piped stdin JSON", () => {
      mkdirSync(tmpDir, { recursive: true });
      const stdinPayload = '{"goal":"stdin goal","metric":"errs","direction":"lower","verify":"npm test"}';
      const result = spawnSync(NODE, [CLI, "goal", "init", "--repo", tmpDir, "--json"], {
        encoding: "utf-8",
        input: stdinPayload,
      });
      const json = JSON.parse(result.stdout);
      expect(json.goal).toBe("stdin goal");
      expect(json.metric).toBe("errs");
      rmSync(goalPath, { force: true });
    });
  });
});
