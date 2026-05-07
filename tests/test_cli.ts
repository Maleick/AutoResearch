import { resolve } from "path";
import { fileURLToPath } from "url";
import { execSync } from "child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const CLI = resolve(REPO_ROOT, "dist/cli.js");
const STATE_PATH = resolve(REPO_ROOT, ".autoresearch", "state.json");
const RESULTS_PATH = resolve(REPO_ROOT, "autoresearch-results.tsv");
const MEMORY_PATH = resolve(REPO_ROOT, "autoresearch-memory.md");
const packageJson = JSON.parse(readFileSync(resolve(REPO_ROOT, "package.json"), "utf-8")) as { version: string };

const readIfExists = (path: string): string | undefined =>
  existsSync(path) ? readFileSync(path, "utf-8") : undefined;

const restoreFile = (path: string, original: string | undefined): void => {
  if (original === undefined) {
    try { rmSync(path); } catch {}
  } else {
    writeFileSync(path, original, "utf-8");
  }
};

describe("CLI Commands", () => {
  const originalState = readIfExists(STATE_PATH);
  const originalResults = readIfExists(RESULTS_PATH);
  const originalMemory = readIfExists(MEMORY_PATH);

  beforeAll(() => {
    mkdirSync(resolve(REPO_ROOT, ".autoresearch"), { recursive: true });
    writeFileSync(STATE_PATH, JSON.stringify({
      schema_version: 1,
      run_id: "test-run",
      created_at: "2026-05-03T00:00:00Z",
      updated_at: "2026-05-03T00:01:00Z",
      status: "running",
      mode: "foreground",
      goal: "test fixture goal",
      scope: "tests",
      metric: {
        name: "tests",
        direction: "lower",
        baseline: "1",
        best: "0",
        latest: "0",
      },
      verify: "npm test",
      label_requirements: { keep: [], stop: [] },
      artifact_paths: {
        results: RESULTS_PATH,
        state: STATE_PATH,
      },
      stats: {
        total_iterations: 1,
        kept: 1,
        discarded: 0,
        needs_human: 0,
        consecutive_discards: 0,
      },
      flags: {
        stop_requested: false,
        needs_human: false,
        background_active: false,
        stop_ready: false,
      },
      last_iteration: {
        iteration: 1,
        decision: "keep",
        metric_value: "0",
        change_summary: "seed fixture state",
        labels: [],
        timestamp: "2026-05-03T00:01:00Z",
        keep_labels_satisfied: true,
        stop_labels_satisfied: true,
        missing_keep_labels: [],
        missing_stop_labels: [],
      },
    }, null, 2) + "\n", "utf-8");
    writeFileSync(RESULTS_PATH, [
      "timestamp\titeration\tdecision\tmetric_value\tverify_status\tguard_status\thypothesis\tchange_summary\tlabels\tnote",
      "2026-05-03T00:01:00Z\t1\tkeep\t0\tpass\tpass\tfixture\tseed fixture state\tfixture\tbaseline",
    ].join("\n") + "\n", "utf-8");
    writeFileSync(MEMORY_PATH, "### Pattern: Keep fixture tests isolated\n\nCreate runtime artifacts in test setup instead of relying on local ignored files.\n", "utf-8");
  });

  afterAll(() => {
    restoreFile(STATE_PATH, originalState);
    restoreFile(RESULTS_PATH, originalResults);
    restoreFile(MEMORY_PATH, originalMemory);
    if (originalState === undefined) {
      try { rmSync(resolve(REPO_ROOT, ".autoresearch"), { recursive: true }); } catch {}
    }
  });

  describe("--verbose flag", () => {
    it("shows verbose output during init", () => {
      const out = execSync(`node ${CLI} init --goal "test" --metric "test" --verify "echo test" --verbose --dry-run 2>&1`, { encoding: "utf-8", cwd: REPO_ROOT });
      expect(out).toContain("[verbose]");
      expect(out).toContain("[dry-run]");
    });
  });

  describe("--dry-run flag", () => {
    it("prevents file creation in init", () => {
      const out = execSync(`node ${CLI} init --goal "test" --metric "test" --verify "echo" --dry-run 2>&1`, { encoding: "utf-8", cwd: REPO_ROOT });
      expect(out).toContain("Would initialize");
      expect(out).toContain("test");
    });
  });

  describe("--version flag", () => {
    it("outputs version info", () => {
      const out = execSync(`node ${CLI} --version`, { encoding: "utf-8" });
      expect(out).toContain("autoresearch");
      expect(out).toContain(packageJson.version);
    });

    it("accepts -v shorthand", () => {
      const out = execSync(`node ${CLI} -v`, { encoding: "utf-8" });
      expect(out).toContain("autoresearch");
    });
  });

  describe("--help flag", () => {
    it("shows usage", () => {
      const out = execSync(`node ${CLI} --help 2>&1`, { encoding: "utf-8" });
      expect(out).toContain("Usage:");
      expect(out).toContain("init");
      expect(out).toContain("status");
    });

    it("accepts -h shorthand", () => {
      const out = execSync(`node ${CLI} -h 2>&1`, { encoding: "utf-8" });
      expect(out).toContain("Usage:");
    });
  });

  describe("doctor command", () => {
    it("runs without error in repo root", () => {
      const out = execSync(`node ${CLI} doctor`, { encoding: "utf-8", cwd: REPO_ROOT });
      expect(out).toContain("autoresearch");
      expect(out).toContain("✓");
    });
  });

  describe("wizard command", () => {
    it("generates setup summary with goal", () => {
      const out = execSync(`node ${CLI} wizard --goal "test goal"`, { encoding: "utf-8", cwd: REPO_ROOT });
      const json = JSON.parse(out);
      expect(json.goal).toBe("test goal");
      expect(json.subagent_pool).toBeDefined();
    });
  });

  describe("export command", () => {
    it("requires existing run data", () => {
      expect(() => {
        execSync(`node ${CLI} export --repo /tmp/nonexistent`, { encoding: "utf-8" });
      }).toThrow("No run data found");
    });
  });

  describe("completion command", () => {
    it("generates bash completion", () => {
      const out = execSync(`node ${CLI} completion --shell bash`, { encoding: "utf-8" });
      expect(out).toContain("_autoresearch()");
      expect(out).toContain("complete -F _autoresearch");
    });

    it("generates fish completion", () => {
      const out = execSync(`node ${CLI} completion --shell fish`, { encoding: "utf-8" });
      expect(out).toContain("complete -c autoresearch");
    });

    it("rejects unknown shell", () => {
      expect(() => {
        execSync(`node ${CLI} completion --shell powershell`, { encoding: "utf-8" });
      }).toThrow("Unknown shell");
    });
  });

  describe("explain command", () => {
    it("shows human-readable run state", () => {
      const out = execSync(`node ${CLI} explain`, { encoding: "utf-8", cwd: REPO_ROOT });
      expect(out).toContain("Auto Research Run:");
    });

    it("supports --json flag", () => {
      const out = execSync(`node ${CLI} explain --json`, { encoding: "utf-8", cwd: REPO_ROOT });
      const json = JSON.parse(out);
      expect(json.status).toBeDefined();
    });
  });

  describe("history command", () => {
    it("shows iteration history", () => {
      const out = execSync(`node ${CLI} history`, { encoding: "utf-8", cwd: REPO_ROOT });
      expect(out).toContain("records");
    });

    it("supports --json flag", () => {
      const out = execSync(`node ${CLI} history --json`, { encoding: "utf-8", cwd: REPO_ROOT });
      const json = JSON.parse(out);
      expect(json.count).toBeDefined();
    });
  });

  describe("config command", () => {
    it("shows run configuration", () => {
      const out = execSync(`node ${CLI} config`, { encoding: "utf-8", cwd: REPO_ROOT });
      expect(out).toContain("Run Configuration");
    });
  });

  describe("validate command", () => {
    it("validates configuration", () => {
      const out = execSync(`node ${CLI} validate --goal "test" --metric "test" --verify "echo test"`, { encoding: "utf-8", cwd: REPO_ROOT });
      expect(out).toContain("✓ Configuration is valid");
    });

    it("reports missing required fields", () => {
      expect(() => {
        execSync(`node ${CLI} validate`, { encoding: "utf-8", cwd: REPO_ROOT });
      }).toThrow("Missing required");
    });

    it("requires explicit verify even when a command could be inferred", () => {
      const tmpDir = resolve(REPO_ROOT, ".autoresearch-test-validate-infer");
      rmSync(tmpDir, { recursive: true, force: true });
      mkdirSync(tmpDir, { recursive: true });
      writeFileSync(resolve(tmpDir, "package.json"), JSON.stringify({ scripts: { test: "echo ok" } }), "utf-8");

      try {
        try {
          execSync(`node ${CLI} validate --repo ${tmpDir} --goal "test" --metric "test" --json`, { encoding: "utf-8", cwd: REPO_ROOT });
          throw new Error("validate unexpectedly succeeded");
        } catch (error) {
          const stdout = (error as { stdout?: string }).stdout ?? "";
          const json = JSON.parse(stdout) as { valid: boolean; errors: string[] };
          expect(json.valid).toBe(false);
          expect(json.errors).toContain("Missing required: --verify");
        }
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    });
  });

  describe("summary command", () => {
    it("shows aggregate stats", () => {
      const out = execSync(`node ${CLI} summary`, { encoding: "utf-8", cwd: REPO_ROOT });
      expect(out).toContain("Total iterations");
    });

    it("supports --json flag", () => {
      const out = execSync(`node ${CLI} summary --json`, { encoding: "utf-8", cwd: REPO_ROOT });
      const json = JSON.parse(out);
      expect(json.total_records).toBeDefined();
    });
  });

  describe("suggest command", () => {
    it("suggests goals from memory", () => {
      const out = execSync(`node ${CLI} suggest`, { encoding: "utf-8", cwd: REPO_ROOT });
      expect(out).toContain("Memory Patterns");
    });
  });

  describe("report command", () => {
    it("generates markdown report", () => {
      const out = execSync(`node ${CLI} report`, { encoding: "utf-8", cwd: REPO_ROOT });
      expect(out).toContain("# Auto Research Report");
    });
  });

  describe("init command", () => {
    const tmpDir = resolve(REPO_ROOT, ".autoresearch-test-init");
    const tmpState = resolve(tmpDir, ".autoresearch", "state.json");
    const tmpResults = resolve(tmpDir, "autoresearch-results.tsv");

    afterEach(() => {
      try { rmSync(tmpDir, { recursive: true }); } catch {}
    });

    it("creates state and results files", () => {
      execSync(`node ${CLI} init --goal "test goal" --metric "tests" --verify "npm test" --repo ${tmpDir}`, { encoding: "utf-8" });
      expect(existsSync(tmpState)).toBe(true);
      expect(existsSync(tmpResults)).toBe(true);
    });

    it("initializes with default mode foreground", () => {
      execSync(`node ${CLI} init --goal "test goal" --metric "tests" --verify "npm test" --repo ${tmpDir}`, { encoding: "utf-8" });
      const state = JSON.parse(readFileSync(tmpState, "utf-8"));
      expect(state.mode).toBe("foreground");
    });

    it("initializes with background mode", () => {
      execSync(`node ${CLI} init --goal "test goal" --metric "tests" --verify "npm test" --mode background --repo ${tmpDir}`, { encoding: "utf-8" });
      const state = JSON.parse(readFileSync(tmpState, "utf-8"));
      expect(state.mode).toBe("background");
    });

    it("supports --fresh-start to overwrite existing", () => {
      execSync(`node ${CLI} init --goal "first" --metric "m1" --verify "echo 1" --repo ${tmpDir}`, { encoding: "utf-8" });
      execSync(`node ${CLI} init --goal "second" --metric "m2" --verify "echo 2" --repo ${tmpDir} --fresh-start`, { encoding: "utf-8" });
      const state = JSON.parse(readFileSync(tmpState, "utf-8"));
      expect(state.goal).toBe("second");
    });
  });

  describe("record command", () => {
    const tmpDir = resolve(REPO_ROOT, ".autoresearch-test-record");
    const tmpState = resolve(tmpDir, ".autoresearch", "state.json");
    const tmpResults = resolve(tmpDir, "autoresearch-results.tsv");

    beforeEach(() => {
      try { rmSync(tmpDir, { recursive: true }); } catch {}
      execSync(`node ${CLI} init --goal "test" --metric "tests" --verify "echo test" --repo ${tmpDir}`, { encoding: "utf-8" });
    });

    afterEach(() => {
      try { rmSync(tmpDir, { recursive: true }); } catch {}
    });

    it("appends iteration to results", () => {
      execSync(`node ${CLI} record --decision keep --metric-value 42 --verify-status pass --guard-status pass --change-summary "test change" --repo ${tmpDir}`, { encoding: "utf-8" });
      const results = readFileSync(tmpResults, "utf-8");
      expect(results).toContain("keep");
      expect(results).toContain("42");
    });

    it("appends multiple iterations", () => {
      execSync(`node ${CLI} record --decision keep --metric-value 10 --verify-status pass --guard-status pass --change-summary "first" --repo ${tmpDir}`, { encoding: "utf-8" });
      execSync(`node ${CLI} record --decision keep --metric-value 20 --verify-status pass --guard-status pass --change-summary "second" --repo ${tmpDir}`, { encoding: "utf-8" });
      const results = readFileSync(tmpResults, "utf-8");
      const lines = results.trim().split("\n");
      expect(lines.length).toBeGreaterThanOrEqual(3); // header + 2 records
    });
  });

  describe("stop and resume commands", () => {
    const tmpDir = resolve(REPO_ROOT, ".autoresearch-test-stop");
    const tmpState = resolve(tmpDir, ".autoresearch", "state.json");

    beforeEach(() => {
      try { rmSync(tmpDir, { recursive: true }); } catch {}
      execSync(`node ${CLI} init --goal "test" --metric "tests" --verify "echo test" --mode background --repo ${tmpDir}`, { encoding: "utf-8" });
    });

    afterEach(() => {
      try { rmSync(tmpDir, { recursive: true }); } catch {}
    });

    it("sets stop_requested flag", () => {
      execSync(`node ${CLI} stop --repo ${tmpDir}`, { encoding: "utf-8" });
      const state = JSON.parse(readFileSync(tmpState, "utf-8"));
      expect(state.flags.stop_requested).toBe(true);
    });

    it("resumes background run", () => {
      execSync(`node ${CLI} stop --repo ${tmpDir}`, { encoding: "utf-8" });
      const out = execSync(`node ${CLI} resume --repo ${tmpDir} --json`, { encoding: "utf-8" });
      const json = JSON.parse(out);
      expect(json.status).toBe("resumed");
    });
  });

  describe("export command", () => {
    it("exports run data as JSON", () => {
      const out = execSync(`node ${CLI} export --repo ${REPO_ROOT}`, { encoding: "utf-8", cwd: REPO_ROOT });
      const json = JSON.parse(out);
      expect(json.exported_at).toBeDefined();
      expect(json.state).toBeDefined();
    });
  });

  describe("complete command", () => {
    const tmpDir = resolve(REPO_ROOT, ".autoresearch-test-complete");
    const tmpState = resolve(tmpDir, ".autoresearch", "state.json");

    beforeEach(() => {
      try { rmSync(tmpDir, { recursive: true }); } catch {}
      execSync(`node ${CLI} init --goal "test" --metric "tests" --verify "echo test" --mode background --repo ${tmpDir}`, { encoding: "utf-8" });
    });

    afterEach(() => {
      try { rmSync(tmpDir, { recursive: true }); } catch {}
    });

    it("marks run as completed", () => {
      execSync(`node ${CLI} complete --repo ${tmpDir}`, { encoding: "utf-8" });
      const state = JSON.parse(readFileSync(tmpState, "utf-8"));
      expect(state.status).toBe("completed");
    });
  });

  describe("launch command", () => {
    const tmpDir = resolve(REPO_ROOT, ".autoresearch-test-launch");
    const tmpState = resolve(tmpDir, ".autoresearch", "state.json");
    const tmpLaunch = resolve(tmpDir, ".autoresearch", "launch.json");
    const tmpResults = resolve(tmpDir, "autoresearch-results.tsv");

    afterEach(() => {
      try { rmSync(tmpDir, { recursive: true }); } catch {}
    });

    it("creates state, results, and launch files", () => {
      const out = execSync(`node ${CLI} launch --goal "test goal" --metric "tests" --verify "npm test" --repo ${tmpDir}`, { encoding: "utf-8" });
      expect(existsSync(tmpState)).toBe(true);
      expect(existsSync(tmpResults)).toBe(true);
      expect(existsSync(tmpLaunch)).toBe(true);
    });

    it("outputs JSON with status launched and run_id", () => {
      const out = execSync(`node ${CLI} launch --goal "test goal" --metric "tests" --verify "npm test" --repo ${tmpDir}`, { encoding: "utf-8" });
      const json = JSON.parse(out);
      expect(json.status).toBe("launched");
      expect(json.run_id).toBeDefined();
      expect(json.launch_path).toBeDefined();
    });

    it("writes launch.json with run metadata", () => {
      execSync(`node ${CLI} launch --goal "test goal" --metric "tests" --verify "npm test" --repo ${tmpDir}`, { encoding: "utf-8" });
      const launch = JSON.parse(readFileSync(tmpLaunch, "utf-8"));
      expect(launch.run_id).toBeDefined();
      expect(launch.goal).toBe("test goal");
      expect(launch.mode).toBe("background");
    });

    it("initializes with background mode in state", () => {
      execSync(`node ${CLI} launch --goal "test goal" --metric "tests" --verify "npm test" --repo ${tmpDir}`, { encoding: "utf-8" });
      const state = JSON.parse(readFileSync(tmpState, "utf-8"));
      expect(state.mode).toBe("background");
    });

    it("accepts optional scope and guard parameters", () => {
      execSync(`node ${CLI} launch --goal "test goal" --metric "tests" --verify "npm test" --scope "src/" --guard "npm run lint" --repo ${tmpDir}`, { encoding: "utf-8" });
      const state = JSON.parse(readFileSync(tmpState, "utf-8"));
      expect(state.scope).toBe("src/");
      expect(state.guard).toBe("npm run lint");
    });
  });

  describe("config command with --json", () => {
    it("outputs configuration as JSON", () => {
      const out = execSync(`node ${CLI} config --json`, { encoding: "utf-8", cwd: REPO_ROOT });
      const json = JSON.parse(out);
      expect(json.goal).toBeDefined();
    });
  });

  describe("history command with --limit", () => {
    it("limits the number of records shown", () => {
      const out = execSync(`node ${CLI} history --limit 5`, { encoding: "utf-8", cwd: REPO_ROOT });
      expect(out).toContain("records");
    });
  });

  describe("suggest command", () => {
    it("suggests next goals from memory", () => {
      const out = execSync(`node ${CLI} suggest`, { encoding: "utf-8", cwd: REPO_ROOT });
      expect(out).toContain("Memory");
    });
  });

  describe("record command with labels", () => {
    const tmpDir = resolve(REPO_ROOT, ".autoresearch-test-record-labels");
    const tmpResults = resolve(tmpDir, "autoresearch-results.tsv");

    beforeEach(() => {
      try { rmSync(tmpDir, { recursive: true }); } catch {}
      execSync(`node ${CLI} init --goal "test" --metric "tests" --verify "echo test" --repo ${tmpDir}`, { encoding: "utf-8" });
    });

    afterEach(() => {
      try { rmSync(tmpDir, { recursive: true }); } catch {}
    });

    it("records iteration with labels", () => {
      execSync(`node ${CLI} record --decision keep --metric-value 42 --verify-status pass --guard-status pass --change-summary "test" --labels progress,test --repo ${tmpDir}`, { encoding: "utf-8" });
      const results = readFileSync(tmpResults, "utf-8");
      expect(results).toContain("progress");
      expect(results).toContain("test");
    });
  });

  describe("short flags", () => {
    const tmpDir = resolve(REPO_ROOT, ".autoresearch-test-short");
    const tmpState = resolve(tmpDir, ".autoresearch", "state.json");

    afterEach(() => {
      try { rmSync(tmpDir, { recursive: true }); } catch {}
    });

    it("accepts -g shorthand for --goal", () => {
      execSync(`node ${CLI} init -g "test" --metric "m" --verify "echo" --repo ${tmpDir}`, { encoding: "utf-8" });
      expect(existsSync(tmpState)).toBe(true);
    });

    it("accepts -m shorthand for --metric", () => {
      execSync(`node ${CLI} init --goal "test" -m "m" --verify "echo" --repo ${tmpDir}`, { encoding: "utf-8" });
      const state = JSON.parse(readFileSync(tmpState, "utf-8"));
      expect(state.metric.name).toBe("m");
    });

    it("accepts -v shorthand for --verify", () => {
      execSync(`node ${CLI} init --goal "test" --metric "m" -v "echo test" --repo ${tmpDir}`, { encoding: "utf-8" });
      const state = JSON.parse(readFileSync(tmpState, "utf-8"));
      expect(state.verify).toBe("echo test");
    });
  });

  describe("init with all options", () => {
    const tmpDir = resolve(REPO_ROOT, ".autoresearch-test-full");
    const tmpState = resolve(tmpDir, ".autoresearch", "state.json");

    afterEach(() => {
      try { rmSync(tmpDir, { recursive: true }); } catch {}
    });

    it("initializes with scope, direction, guard, iterations", () => {
      execSync(`node ${CLI} init --goal "test" --metric "m" --verify "echo" --scope "src/" --direction higher --guard "npm run lint" --iterations 50 --repo ${tmpDir}`, { encoding: "utf-8" });
      const state = JSON.parse(readFileSync(tmpState, "utf-8"));
      expect(state.scope).toBe("src/");
      expect(state.metric.direction).toBe("higher");
      expect(state.guard).toBe("npm run lint");
      expect(state.iterations_cap).toBe(50);
    });
  });

  describe("validate command", () => {
    it("validates with guard", () => {
      const out = execSync(`node ${CLI} validate --goal "test" --metric "test" --verify "echo test" --guard "npm run lint"`, { encoding: "utf-8", cwd: REPO_ROOT });
      expect(out).toContain("✓ Configuration is valid");
    });

    it("validates with iterations", () => {
      const out = execSync(`node ${CLI} validate --goal "test" --metric "test" --verify "echo test" --iterations 10`, { encoding: "utf-8", cwd: REPO_ROOT });
      expect(out).toContain("✓ Configuration is valid");
    });
  });

  describe("history command", () => {
    it("shows history with limit", () => {
      const out = execSync(`node ${CLI} history --limit 3`, { encoding: "utf-8", cwd: REPO_ROOT });
      expect(out).toContain("records");
    });

    it("shows history with json", () => {
      const out = execSync(`node ${CLI} history --json --limit 2`, { encoding: "utf-8", cwd: REPO_ROOT });
      const json = JSON.parse(out);
      expect(json.count).toBeDefined();
    });
  });

  describe("summary command", () => {
    it("shows summary with json", () => {
      const out = execSync(`node ${CLI} summary --json`, { encoding: "utf-8", cwd: REPO_ROOT });
      const json = JSON.parse(out);
      expect(json.total_records).toBeDefined();
    });
  });

  describe("status command", () => {
    it("shows human-readable status", () => {
      const out = execSync(`node ${CLI} status`, { encoding: "utf-8", cwd: REPO_ROOT });
      expect(out).toContain("Run:");
      expect(out).toContain("test fixture goal");
      expect(out).toContain("running");
    });

    it("outputs JSON with --json flag", () => {
      const out = execSync(`node ${CLI} status --json`, { encoding: "utf-8", cwd: REPO_ROOT });
      const json = JSON.parse(out);
      expect(json.status).toBe("running");
      expect(json.goal).toBe("test fixture goal");
      expect(json.metric).toBeDefined();
      expect(json.stats).toBeDefined();
      expect(json.stats.total_iterations).toBe(1);
    });

    it("reports error when no state exists", () => {
      const tmpDir = resolve(REPO_ROOT, ".autoresearch-test-status-none");
      try { rmSync(tmpDir, { recursive: true }); } catch {}
      expect(() => {
        execSync(`node ${CLI} status --repo ${tmpDir}`, { encoding: "utf-8" });
      }).toThrow("Missing file");
    });

    it("includes iteration count in output", () => {
      const out = execSync(`node ${CLI} status`, { encoding: "utf-8", cwd: REPO_ROOT });
      expect(out).toMatch(/1 iteration|1 kept/i);
    });
  });

  describe("unknown command", () => {
    it("exits with error for unknown command", () => {
      expect(() => {
        execSync(`node ${CLI} unknowncmd`, { encoding: "utf-8" });
      }).toThrow();
    });
  });

  describe("no args", () => {
    it("shows usage when no args provided", () => {
      const out = execSync(`node ${CLI} 2>&1`, { encoding: "utf-8" });
      expect(out).toContain("Usage:");
    });
  });

  describe("version output", () => {
    it("includes version number", () => {
      const out = execSync(`node ${CLI} --version`, { encoding: "utf-8" });
      expect(out).toContain(packageJson.version);
    });

    it("includes runtime info", () => {
      const out = execSync(`node ${CLI} --version`, { encoding: "utf-8" });
      expect(out).toContain("Node.js");
    });
  });

  describe("help output", () => {
    it("includes all commands", () => {
      const out = execSync(`node ${CLI} --help 2>&1`, { encoding: "utf-8" });
      expect(out).toContain("init");
      expect(out).toContain("status");
      expect(out).toContain("record");
      expect(out).toContain("complete");
    });

    it("includes all options", () => {
      const out = execSync(`node ${CLI} --help 2>&1`, { encoding: "utf-8" });
      expect(out).toContain("--goal");
      expect(out).toContain("--metric");
      expect(out).toContain("--verify");
    });
  });

  describe("init with dry-run", () => {
    it("shows preview without creating files", () => {
      const out = execSync(`node ${CLI} init --goal "test" --metric "test" --verify "echo test" --dry-run 2>&1`, { encoding: "utf-8" });
      expect(out).toContain("Would initialize");
      expect(out).toContain("dry-run");
    });
  });

  describe("record with hypothesis", () => {
    const tmpDir = resolve(REPO_ROOT, ".autoresearch-test-hypothesis");
    const tmpResults = resolve(tmpDir, "autoresearch-results.tsv");

    beforeEach(() => {
      try { rmSync(tmpDir, { recursive: true }); } catch {}
      execSync(`node ${CLI} init --goal "test" --metric "tests" --verify "echo test" --repo ${tmpDir}`, { encoding: "utf-8" });
    });

    afterEach(() => {
      try { rmSync(tmpDir, { recursive: true }); } catch {}
    });

    it("records hypothesis in results", () => {
      execSync(`node ${CLI} record --decision keep --metric-value 42 --verify-status pass --guard-status pass --change-summary "test" --hypothesis "my hypothesis" --repo ${tmpDir}`, { encoding: "utf-8" });
      const results = readFileSync(tmpResults, "utf-8");
      expect(results).toContain("my hypothesis");
    });
  });
});
