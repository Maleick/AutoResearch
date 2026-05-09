import { generateLeaderboard, formatLeaderboardMarkdown } from "../src/leaderboard.js";
import { mkdirSync, writeFileSync, rmSync } from "fs";
import { resolve } from "path";

const REPO_ROOT = process.cwd();

describe("Leaderboard", () => {
  const tmpDir = resolve(REPO_ROOT, ".autoresearch-test-leaderboard");

  beforeEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("returns empty leaderboard when no runs exist", () => {
    const lb = generateLeaderboard(tmpDir);
    expect(lb.entries).toHaveLength(0);
    expect(lb.summary.total_runs).toBe(0);
  });

  it("generates leaderboard from run directories", () => {
    const runDir = resolve(tmpDir, ".autoresearch", "run-test-1");
    mkdirSync(runDir, { recursive: true });

    writeFileSync(
      resolve(runDir, "state.json"),
      JSON.stringify({
        run_id: "run-test-1",
        goal: "Reduce errors",
        metric: { name: "errors", direction: "lower" },
        created_at: "2026-05-01T10:00:00Z",
        updated_at: "2026-05-01T11:00:00Z",
      }),
    );

    writeFileSync(
      resolve(runDir, "results.tsv"),
      "timestamp\titeration\tdecision\tmetric_value\tinstrument_value\tverify_status\tguard_status\thypothesis\tchange_summary\tlabels\tnote\n" +
      "2026-05-01T10:05:00Z\t1\tkeep\t10\t\tok\tok\t\tReduced errors\t\t\n" +
      "2026-05-01T10:10:00Z\t2\tdiscard\t15\t\tok\tok\t\tIncreased errors\t\t\n" +
      "2026-05-01T10:15:00Z\t3\tkeep\t8\t\tok\tok\t\tFixed bug\t\t\n",
    );

    const lb = generateLeaderboard(tmpDir);
    expect(lb.entries).toHaveLength(1);
    expect(lb.entries[0].run_id).toBe("run-test-1");
    expect(lb.entries[0].goal).toBe("Reduce errors");
    expect(lb.entries[0].total_iterations).toBe(3);
    expect(lb.entries[0].kept).toBe(2);
    expect(lb.entries[0].discarded).toBe(1);
    expect(lb.entries[0].success_rate).toBe("66.7%");
    expect(lb.entries[0].best_value).toBe("8");
    expect(lb.entries[0].runtime_seconds).toBe(3600);
  });

  it("formats markdown output", () => {
    const lb = {
      generated_at: "2026-05-09T00:00:00Z",
      entries: [
        {
          run_id: "run-1",
          goal: "Test",
          metric: "coverage",
          direction: "higher",
          total_iterations: 5,
          kept: 3,
          discarded: 2,
          success_rate: "60.0%",
          best_value: "85",
          latest_value: "80",
          runtime_seconds: 600,
          completed_at: "2026-05-09T00:00:00Z",
        },
      ],
      summary: {
        total_runs: 1,
        total_iterations: 5,
        overall_success_rate: "60.0%",
      },
    };

    const md = formatLeaderboardMarkdown(lb);
    expect(md).toContain("# Auto Research Leaderboard");
    expect(md).toContain("run-1");
    expect(md).toContain("Test");
    expect(md).toContain("coverage");
    expect(md).toContain("60.0%");
    expect(md).toContain("10m");
  });
});
