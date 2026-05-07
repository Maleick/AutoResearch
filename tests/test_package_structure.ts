import { mkdtempSync, readFileSync, existsSync, mkdirSync, symlinkSync, writeFileSync, rmSync } from "fs";
import { resolve } from "path";
import { fileURLToPath } from "url";
import { execFileSync } from "child_process";
import { tmpdir } from "os";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

const readJson = (filePath: string): Record<string, unknown> =>
  JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;

describe("package.json", () => {
  it("declares name as opencode-autoresearch", () => {
    expect(readJson(resolve(REPO_ROOT, "package.json")).name).toBe("opencode-autoresearch");
  });

  it("has bin entry for autoresearch", () => {
    const bin = readJson(resolve(REPO_ROOT, "package.json")).bin as Record<string, string>;
    expect(bin.autoresearch).toBeDefined();
  });

  it("has type module", () => {
    expect(readJson(resolve(REPO_ROOT, "package.json")).type).toBe("module");
  });

  it("files array excludes scripts/", () => {
    const files = readJson(resolve(REPO_ROOT, "package.json")).files as string[];
    expect(files).not.toContain("scripts/");
  });

  it("packages public docs explicitly instead of the whole docs tree", () => {
    const files = readJson(resolve(REPO_ROOT, "package.json")).files as string[];
    expect(files).not.toContain("docs");
    expect(files).not.toContain("plugins");
    expect(files).toContain("docs/OPENCODE_INSTALL.md");
    expect(files).toContain("docs/RELEASE.md");
    expect(files).toContain("plugins/autoresearch.ts");
  });

  it("packages repo-level OpenCode install guide", () => {
    const files = readJson(resolve(REPO_ROOT, "package.json")).files as string[];
    expect(files).toContain("INSTALL.md");
    expect(files).toContain(".opencode/INSTALL.md");
    expect(files).not.toContain(".opencode");
    expect(files).toContain("AGENTS.md");
  });

  it("does not package broad local OpenCode config", () => {
    const verifier = readFileSync(resolve(REPO_ROOT, "hooks/verify-package.sh"), "utf-8");
    expect(verifier).toContain('"INSTALL.md"');
    expect(verifier).toContain('".opencode/INSTALL.md"');
    expect(verifier).not.toContain('".opencode",');
    expect(verifier).not.toContain('"docs",');
    expect(verifier).not.toContain('"plugins",');
    expect(verifier).toContain('"autoresearch-results.tsv"');
    expect(verifier).toContain('"autoresearch-report.md"');
    expect(verifier).toContain('"autoresearch-memory.md"');
  });

  it("has build and typecheck scripts", () => {
    const scripts = readJson(resolve(REPO_ROOT, "package.json")).scripts as Record<string, string>;
    expect(scripts.build).toBeDefined();
    expect(scripts.typecheck).toBeDefined();
  });
});

describe(".opencode-plugin/plugin.json", () => {
  it("declares name as autoresearch", () => {
    expect(readJson(resolve(REPO_ROOT, ".opencode-plugin/plugin.json")).name).toBe("autoresearch");
  });

  it("declares skills path", () => {
    expect(readJson(resolve(REPO_ROOT, ".opencode-plugin/plugin.json")).skills).toBe("./skills/");
  });

  it("declares commands path", () => {
    expect(readJson(resolve(REPO_ROOT, ".opencode-plugin/plugin.json")).commands).toBe("./commands/");
  });
});

describe("commands/", () => {
  it("has main autoresearch.md", () => {
    const content = readFileSync(resolve(REPO_ROOT, "commands/autoresearch.md"), "utf-8");
    expect(content).toContain("/autoresearch");
  });

  it("has mode command files", () => {
    const modes = ["plan", "debug", "fix", "learn", "predict", "scenario", "security", "ship"];
    for (const mode of modes) {
      const path = resolve(REPO_ROOT, `commands/autoresearch/${mode}.md`);
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf-8");
      expect(content).toContain(`autoresearch:${mode}`);
    }
  });
});

describe("skills/autoresearch/", () => {
  it("has SKILL.md", () => {
    const content = readFileSync(resolve(REPO_ROOT, "skills/autoresearch/SKILL.md"), "utf-8");
    expect(content).toContain("Auto Research");
    expect(content).toContain("/autoresearch");
  });

  it("has loop-workflow.md reference", () => {
    expect(existsSync(resolve(REPO_ROOT, "skills/autoresearch/references/loop-workflow.md"))).toBe(true);
  });

  it("has core-principles.md reference", () => {
    expect(existsSync(resolve(REPO_ROOT, "skills/autoresearch/references/core-principles.md"))).toBe(true);
  });
});

describe("hooks/", () => {
  const backgroundState = (statePath: string, resultsPath: string) => JSON.stringify({
    schema_version: 1,
    run_id: "hook-test",
    created_at: "2026-05-03T00:00:00Z",
    updated_at: "2026-05-03T00:00:00Z",
    status: "running",
    mode: "background",
    goal: "test hook safety",
    scope: "tests",
    metric: { name: "tests", direction: "lower" },
    verify: "npm test",
    label_requirements: { keep: [], stop: [] },
    artifact_paths: { results: resultsPath, state: statePath },
    stats: { total_iterations: 0, kept: 0, discarded: 0, needs_human: 0 },
    flags: { stop_requested: false, needs_human: false, background_active: true, stop_ready: false },
  }, null, 2) + "\n";

  it("has init.sh", () => {
    const content = readFileSync(resolve(REPO_ROOT, "hooks/init.sh"), "utf-8");
    expect(content).toContain("#!/bin/sh");
  });

  it("has status.sh", () => {
    const content = readFileSync(resolve(REPO_ROOT, "hooks/status.sh"), "utf-8");
    expect(content).toContain("state.json");
  });

  it("has stop.sh", () => {
    const content = readFileSync(resolve(REPO_ROOT, "hooks/stop.sh"), "utf-8");
    expect(content).toContain("stop_requested");
  });

  it("does not interpolate AUTORESEARCH_STATE into inline JavaScript", () => {
    const status = readFileSync(resolve(REPO_ROOT, "hooks/status.sh"), "utf-8");
    const stop = readFileSync(resolve(REPO_ROOT, "hooks/stop.sh"), "utf-8");

    expect(status).toContain("process.env.AUTORESEARCH_STATUS_FILE");
    expect(stop).toContain("process.env.AUTORESEARCH_STATUS_FILE");
    expect(status).not.toContain("readFileSync('$STATUS_FILE'");
    expect(stop).not.toContain("readFileSync('$STATUS_FILE'");
  });

  it("rejects symlinked stop state files", () => {
    const tempRoot = mkdtempSync(resolve(tmpdir(), "autoresearch-hook-"));
    try {
      const target = resolve(tempRoot, "target-state.json");
      const link = resolve(tempRoot, ".autoresearch", "state.json");
      mkdirSync(resolve(tempRoot, ".autoresearch"), { recursive: true });
      writeFileSync(target, backgroundState(link, resolve(tempRoot, "autoresearch-results.tsv")), "utf-8");
      symlinkSync(target, link);

      const out = execFileSync("sh", [resolve(REPO_ROOT, "hooks/stop.sh")], {
        cwd: tempRoot,
        encoding: "utf-8",
        env: { ...process.env, AUTORESEARCH_STATE: link },
      });

      expect(out).toContain("Refusing symlinked state file.");
      expect(readFileSync(target, "utf-8")).toContain('"stop_requested": false');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it("rejects stop state files outside the workspace", () => {
    const tempRoot = mkdtempSync(resolve(tmpdir(), "autoresearch-hook-"));
    const outsideRoot = mkdtempSync(resolve(tmpdir(), "autoresearch-outside-"));
    try {
      const outsideState = resolve(outsideRoot, "state.json");
      writeFileSync(outsideState, backgroundState(outsideState, resolve(outsideRoot, "autoresearch-results.tsv")), "utf-8");

      const out = execFileSync("sh", [resolve(REPO_ROOT, "hooks/stop.sh")], {
        cwd: tempRoot,
        encoding: "utf-8",
        env: { ...process.env, AUTORESEARCH_STATE: outsideState },
      });

      expect(out).toContain("Refusing state file outside workspace.");
      expect(readFileSync(outsideState, "utf-8")).toContain('"stop_requested": false');
    } finally {
      rmSync(tempRoot, { recursive: true, force: true });
      rmSync(outsideRoot, { recursive: true, force: true });
    }
  });
});

describe(".opencode/", () => {
  it("has OpenCode install guide with plugin and npm paths", () => {
    const content = readFileSync(resolve(REPO_ROOT, ".opencode/INSTALL.md"), "utf-8");
    expect(content).toContain('"plugin": ["opencode-autoresearch@latest"]');
    expect(content).toContain("npm install -g opencode-autoresearch");
    expect(content).toContain("opencode-autoresearch doctor");
  });
});

describe("INSTALL.md", () => {
  it("has root OpenCode handoff instructions", () => {
    const content = readFileSync(resolve(REPO_ROOT, "INSTALL.md"), "utf-8");
    expect(content).toContain("## One-Line OpenCode Install");
    expect(content).toContain("Paste this one line into OpenCode");
    expect(content).toContain("Fetch and follow instructions from https://raw.githubusercontent.com/Maleick/AutoResearch/refs/heads/main/INSTALL.md");
    expect(content).toContain('"plugin": ["opencode-autoresearch@latest"]');
    expect(content).toContain("npm install -g opencode-autoresearch");
    expect(content).toContain("opencode-autoresearch doctor");
  });

  it("is linked from README installation section", () => {
    const content = readFileSync(resolve(REPO_ROOT, "README.md"), "utf-8");
    const version = readJson(resolve(REPO_ROOT, "package.json")).version as string;
    expect(content).toContain(`v${version}`);
    expect(content).toContain("paste this one-line install prompt");
    expect(content).toContain("Fetch and follow instructions from https://raw.githubusercontent.com/Maleick/AutoResearch/refs/heads/main/INSTALL.md");
    expect(content).toContain("See [`INSTALL.md`](INSTALL.md)");
  });
});

describe("GitHub Pages custom domain", () => {
  it("keeps the docs CNAME for the custom domain", () => {
    const cname = readFileSync(resolve(REPO_ROOT, "docs/CNAME"), "utf-8").trim();
    const files = readJson(resolve(REPO_ROOT, "package.json")).files as string[];

    expect(cname).toBe("autoresearch.teamoperator.red");
    expect(files).toContain("docs/CNAME");
  });
});

describe("AGENTS.md", () => {
  it("is tracked repository guidance, not local-only context", () => {
    const content = readFileSync(resolve(REPO_ROOT, "AGENTS.md"), "utf-8");
    expect(content).toContain("Auto Research");
    expect(content).toContain("npm run verify:pack");
  });
});

describe("release workflow", () => {
  it("runs tests before semantic-release publishing", () => {
    const content = readFileSync(resolve(REPO_ROOT, ".github/workflows/release.yml"), "utf-8");
    expect(content).toContain("npm test");
    expect(content).toContain("node-version: '22.14.0'");
    expect(content).toContain("npx semantic-release");
  });
});

describe("No legacy Claude/Codex artifacts remain", () => {
  it("no plugins/codex-autoresearch directory", () => {
    expect(existsSync(resolve(REPO_ROOT, "plugins/codex-autoresearch"))).toBe(false);
  });

  it("no plugins/autoresearch directory", () => {
    expect(existsSync(resolve(REPO_ROOT, "plugins/autoresearch"))).toBe(false);
  });

  it("no .claude-plugin directory", () => {
    expect(existsSync(resolve(REPO_ROOT, ".claude-plugin"))).toBe(false);
  });

  it("no agents directory", () => {
    expect(existsSync(resolve(REPO_ROOT, "agents"))).toBe(false);
  });

  it("no root SKILL.md", () => {
    expect(existsSync(resolve(REPO_ROOT, "SKILL.md"))).toBe(false);
  });

  it("no Python scripts in scripts/", async () => {
    const scriptsDir = resolve(REPO_ROOT, "scripts");
    if (existsSync(scriptsDir)) {
      const { readdirSync } = await import("fs");
      const files = readdirSync(scriptsDir).filter((f: string) => f.endsWith(".py"));
      expect(files.length).toBe(0);
    }
  });
});

describe("docs/", () => {
  it("has OPENCODE_INSTALL.md", () => {
    const content = readFileSync(resolve(REPO_ROOT, "docs/OPENCODE_INSTALL.md"), "utf-8");
    expect(content).toContain("opencode-autoresearch");
    expect(content).toContain("/autoresearch");
  });

  it("has RELEASE.md", () => {
    const content = readFileSync(resolve(REPO_ROOT, "docs/RELEASE.md"), "utf-8");
    expect(content).toContain("npm publish");
  });

  it("has ARCHITECTURE.md", () => {
    const content = readFileSync(resolve(REPO_ROOT, "docs/ARCHITECTURE.md"), "utf-8");
    expect(content).toContain("Auto Research");
  });

  it("has QUICKSTART.md", () => {
    const content = readFileSync(resolve(REPO_ROOT, "docs/QUICKSTART.md"), "utf-8");
    expect(content).toContain("autoresearch");
  });
});

describe("wiki/", () => {
  it("has Home.md", () => {
    const content = readFileSync(resolve(REPO_ROOT, "wiki/Home.md"), "utf-8");
    expect(content).toContain("Auto Research");
  });

  it("has Contributing.md", () => {
    const content = readFileSync(resolve(REPO_ROOT, "wiki/Contributing.md"), "utf-8");
    expect(content).toContain("autoresearch");
  });
});

describe("commands/", () => {
  it("has autoresearch.md with main command", () => {
    const content = readFileSync(resolve(REPO_ROOT, "commands/autoresearch.md"), "utf-8");
    expect(content).toContain("/autoresearch");
  });

  it("has mode commands", () => {
    const modes = ["plan", "debug", "fix", "learn", "predict", "scenario", "security", "ship"];
    for (const mode of modes) {
      const path = resolve(REPO_ROOT, `commands/autoresearch/${mode}.md`);
      expect(existsSync(path)).toBe(true);
      const content = readFileSync(path, "utf-8");
      expect(content.length).toBeGreaterThan(0);
    }
  });
});

describe("skills/", () => {
  it("has autoresearch skill", () => {
    const content = readFileSync(resolve(REPO_ROOT, "skills/autoresearch/SKILL.md"), "utf-8");
    expect(content).toContain("Auto Research");
    expect(content).toContain("/autoresearch");
  });

  it("has loop-workflow reference", () => {
    expect(existsSync(resolve(REPO_ROOT, "skills/autoresearch/references/loop-workflow.md"))).toBe(true);
  });

  it("has core-principles reference", () => {
    expect(existsSync(resolve(REPO_ROOT, "skills/autoresearch/references/core-principles.md"))).toBe(true);
  });
});
