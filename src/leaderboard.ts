import { existsSync, readFileSync, readdirSync } from "fs";
import { resolve } from "path";

export interface LeaderboardEntry {
  run_id: string;
  goal: string;
  metric: string;
  direction: string;
  total_iterations: number;
  kept: number;
  discarded: number;
  success_rate: string;
  best_value: string | null;
  latest_value: string | null;
  runtime_seconds: number | null;
  completed_at: string | null;
}

export interface Leaderboard {
  generated_at: string;
  entries: LeaderboardEntry[];
  summary: {
    total_runs: number;
    total_iterations: number;
    overall_success_rate: string;
  };
}

function parseResultsFile(resultsPath: string): { kept: number; discarded: number; bestValue: string | null; latestValue: string | null } {
  if (!existsSync(resultsPath)) {
    return { kept: 0, discarded: 0, bestValue: null, latestValue: null };
  }

  const lines = readFileSync(resultsPath, "utf-8").trim().split("\n");
  if (lines.length < 2) {
    return { kept: 0, discarded: 0, bestValue: null, latestValue: null };
  }

  const headers = lines[0].split("\t");
  const decisionIdx = headers.indexOf("decision");
  const metricValueIdx = headers.indexOf("metric_value");

  if (decisionIdx === -1 || metricValueIdx === -1) {
    return { kept: 0, discarded: 0, bestValue: null, latestValue: null };
  }

  let kept = 0;
  let discarded = 0;
  let bestValue: string | null = null;
  let latestValue: string | null = null;

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split("\t");
    if (cols.length <= decisionIdx) continue;

    const decision = cols[decisionIdx];
    const metricValue = cols[metricValueIdx];

    if (decision === "keep") kept++;
    else if (decision === "discard") discarded++;

    if (metricValue) {
      latestValue = metricValue;
      if (bestValue === null || metricValue < bestValue) {
        bestValue = metricValue;
      }
    }
  }

  return { kept, discarded, bestValue, latestValue };
}

function calculateRuntime(state: Record<string, unknown>): number | null {
  const created = state.created_at as string | undefined;
  const updated = state.updated_at as string | undefined;
  if (!created || !updated) return null;

  const start = new Date(created).getTime();
  const end = new Date(updated).getTime();
  if (isNaN(start) || isNaN(end)) return null;

  return Math.round((end - start) / 1000);
}

export function generateLeaderboard(repoPath: string): Leaderboard {
  const autoresearchDir = resolve(repoPath, ".autoresearch");
  const entries: LeaderboardEntry[] = [];

  if (!existsSync(autoresearchDir)) {
    return {
      generated_at: new Date().toISOString(),
      entries,
      summary: { total_runs: 0, total_iterations: 0, overall_success_rate: "0%" },
    };
  }

  const items = readdirSync(autoresearchDir, { withFileTypes: true });
  const runDirs = items.filter((item) => item.isDirectory() && item.name.startsWith("run-"));

  for (const dir of runDirs) {
    const runPath = resolve(autoresearchDir, dir.name);
    const statePath = resolve(runPath, "state.json");
    const resultsPath = resolve(runPath, "results.tsv");

    if (!existsSync(statePath)) continue;

    try {
      const state = JSON.parse(readFileSync(statePath, "utf-8"));
      const results = parseResultsFile(resultsPath);
      const runtime = calculateRuntime(state);

      entries.push({
        run_id: state.run_id || dir.name,
        goal: state.goal || "Unknown",
        metric: state.metric?.name || "Unknown",
        direction: state.metric?.direction || "lower",
        total_iterations: results.kept + results.discarded,
        kept: results.kept,
        discarded: results.discarded,
        success_rate: entries.length > 0
          ? `${((results.kept / (results.kept + results.discarded)) * 100).toFixed(1)}%`
          : "0%",
        best_value: results.bestValue,
        latest_value: results.latestValue,
        runtime_seconds: runtime,
        completed_at: state.updated_at || null,
      });
    } catch {
      // Skip corrupted state files
      continue;
    }
  }

  // Sort by completion date (most recent first)
  entries.sort((a, b) => {
    if (!a.completed_at && !b.completed_at) return 0;
    if (!a.completed_at) return 1;
    if (!b.completed_at) return -1;
    return new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime();
  });

  const totalIterations = entries.reduce((sum, e) => sum + e.total_iterations, 0);
  const totalKept = entries.reduce((sum, e) => sum + e.kept, 0);
  const overallRate = totalIterations > 0
    ? `${((totalKept / totalIterations) * 100).toFixed(1)}%`
    : "0%";

  return {
    generated_at: new Date().toISOString(),
    entries,
    summary: {
      total_runs: entries.length,
      total_iterations: totalIterations,
      overall_success_rate: overallRate,
    },
  };
}

export function formatLeaderboardMarkdown(leaderboard: Leaderboard): string {
  const lines: string[] = [
    "# Auto Research Leaderboard",
    "",
    `Generated: ${leaderboard.generated_at}`,
    "",
    "| Run | Goal | Metric | Iterations | Kept | Success Rate | Best | Runtime |",
    "|-----|------|--------|-----------:|-----:|-------------:|-----:|--------:|",
  ];

  for (const entry of leaderboard.entries) {
    const runtime = entry.runtime_seconds
      ? `${Math.round(entry.runtime_seconds / 60)}m`
      : "—";
    lines.push(
      `| ${entry.run_id} | ${entry.goal} | ${entry.metric} (${entry.direction}) | ${entry.total_iterations} | ${entry.kept} | ${entry.success_rate} | ${entry.best_value ?? "—"} | ${runtime} |`,
    );
  }

  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- **Total Runs:** ${leaderboard.summary.total_runs}`);
  lines.push(`- **Total Iterations:** ${leaderboard.summary.total_iterations}`);
  lines.push(`- **Overall Success Rate:** ${leaderboard.summary.overall_success_rate}`);
  lines.push("");

  return lines.join("\n");
}
