import { closeSync, constants as fsConstants, existsSync, fstatSync, lstatSync, openSync, readFileSync } from "fs";
import { resolvePath } from "./helpers.js";
import { SCORE_HISTORY_DEFAULT } from "./constants.js";

const MAX_SCORE_HISTORY_BYTES = 10 * 1024 * 1024;

const readScoreHistoryFile = (filePath: string): string => {
  const linkStats = lstatSync(filePath);
  if (linkStats.isSymbolicLink()) {
    throw new Error(`Refusing to read score history symlink: ${filePath}`);
  }
  if (!linkStats.isFile()) {
    throw new Error(`Refusing to read non-regular score history file: ${filePath}`);
  }
  if (linkStats.size > MAX_SCORE_HISTORY_BYTES) {
    throw new Error(`Score history is too large to read safely (${linkStats.size} bytes; max ${MAX_SCORE_HISTORY_BYTES} bytes): ${filePath}`);
  }
  if (typeof fsConstants.O_NOFOLLOW !== "number") {
    throw new Error(`Refusing to read score history because this platform does not support O_NOFOLLOW: ${filePath}`);
  }

  const fd = openSync(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const fileStats = fstatSync(fd);
    if (!fileStats.isFile()) {
      throw new Error(`Refusing to read non-regular score history file: ${filePath}`);
    }
    if (fileStats.size > MAX_SCORE_HISTORY_BYTES) {
      throw new Error(`Score history is too large to read safely (${fileStats.size} bytes; max ${MAX_SCORE_HISTORY_BYTES} bytes): ${filePath}`);
    }
    return readFileSync(fd, "utf-8");
  } finally {
    closeSync(fd);
  }
};

export interface FailureCluster {
  pattern: string;
  count: number;
  window_start: string;
  window_end: string;
  first_iteration: number;
  last_iteration: number;
}

export interface IssueCandidate {
  id: string;
  title: string;
  goal: string;
  metric: string;
  verify: string;
  evidence: {
    total_runs: number;
    total_discards: number;
    clusters: FailureCluster[];
  };
  suggest_command: string;
}

export function detectFailureClusters(
  repo?: string,
  scoreHistoryPath?: string,
  thresholdWindow = 5,
  minFailures = 3,
): FailureCluster[] {
  const historyPath = resolvePath(repo, scoreHistoryPath, SCORE_HISTORY_DEFAULT);
  if (!existsSync(historyPath)) return [];

  const lines = readScoreHistoryFile(historyPath)
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  const records = lines
    .map((l) => {
      try { return JSON.parse(l); } catch { return null; }
    })
    .filter(Boolean);

  const discards = records.filter((r: Record<string, unknown>) => r.decision === "discard");
  if (discards.length < minFailures) return [];

  const clusters: FailureCluster[] = [];
  for (let i = 0; i < discards.length; i++) {
    const current = discards[i] as Record<string, unknown>;
    const currentIter = Number(current.iteration) || 0;

    let clusterCount = 1;
    let lastInCluster = current;

    for (let j = i + 1; j < discards.length; j++) {
      const next = discards[j] as Record<string, unknown>;
      const nextIter = Number(next.iteration) || 0;
      if (nextIter - currentIter <= thresholdWindow) {
        clusterCount++;
        lastInCluster = next;
      } else {
        break;
      }
    }

    if (clusterCount >= minFailures) {
      clusters.push({
        pattern: `Repeated discards in window ${currentIter}-${lastInCluster.iteration}`,
        count: clusterCount,
        window_start: String(current.timestamp_at || current.created_at || "unknown"),
        window_end: String(lastInCluster.timestamp_at || lastInCluster.created_at || "unknown"),
        first_iteration: currentIter,
        last_iteration: Number(lastInCluster.iteration) || currentIter,
      });
      i += clusterCount - 1; // Skip already counted
    }
  }

  return clusters;
}

export function generateIssueCandidate(
  repo?: string,
  goal?: string,
  metric?: string,
  verify?: string,
  scoreHistoryPath?: string,
  thresholdWindow = 5,
  minFailures = 3,
): IssueCandidate | null {
  const clusters = detectFailureClusters(repo, scoreHistoryPath, thresholdWindow, minFailures);
  if (clusters.length === 0) return null;

  const totalDiscards = clusters.reduce((s, c) => s + c.count, 0);
  const bestCluster = clusters.reduce((a, b) => a.count > b.count ? a : b);

  const title = goal
    ? `Fix repeated failures: ${goal} (${bestCluster.count} discards in window)`
    : `Fix repeated discard patterns (${totalDiscards} total discards)`;

  const effectiveGoal = goal || "Reduce repeated discard patterns";
  const effectiveMetric = metric || "success_rate";
  const effectiveVerify = verify || "autoresearch validate";

  return {
    id: `evidence-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    title,
    goal: effectiveGoal,
    metric: effectiveMetric,
    verify: effectiveVerify,
    evidence: {
      total_runs: clusters.length,
      total_discards: totalDiscards,
      clusters,
    },
    suggest_command: `autoresearch init --goal "${effectiveGoal}" --metric "${effectiveMetric}" --verify "${effectiveVerify}"`,
  };
}
