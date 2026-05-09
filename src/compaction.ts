import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync, readdirSync, readFileSync } from "fs";
import { resolve, join, basename } from "path";

export interface CompactionPlan {
  filesToArchive: string[];
  filesToPreserve: string[];
  estimatedSpaceReclaimed: number;
}

export interface CompactionResult {
  success: boolean;
  archived: string[];
  removed: string[];
  preserved: string[];
  spaceReclaimed: number;
  rollbackPath: string | null;
}

function getFileSize(path: string): number {
  try {
    return statSync(path).size;
  } catch {
    return 0;
  }
}

export function planCompaction(
  repoPath: string,
  preserveIterations: number,
): CompactionPlan {
  const autoresearchDir = resolve(repoPath, ".autoresearch");
  const plan: CompactionPlan = {
    filesToArchive: [],
    filesToRemove: [],
    filesToPreserve: [],
    estimatedSpaceReclaimed: 0,
  };

  if (!existsSync(autoresearchDir)) {
    return plan;
  }

  // Always preserve current state
  const statePath = resolve(autoresearchDir, "state.json");
  if (existsSync(statePath)) {
    plan.filesToPreserve.push(statePath);
  }

  // Always preserve current results
  const resultsPath = resolve(repoPath, "autoresearch-results.tsv");
  if (existsSync(resultsPath)) {
    plan.filesToPreserve.push(resultsPath);
  }

  // Preserve memory
  const memoryPath = resolve(repoPath, "autoresearch-memory.md");
  if (existsSync(memoryPath)) {
    plan.filesToPreserve.push(memoryPath);
  }

  // Look for historical run directories
  const items = readdirSync(autoresearchDir, { withFileTypes: true });
  const runDirs = items.filter((item) => item.isDirectory() && item.name.startsWith("run-"));

  // Sort by modification time (newest first)
  runDirs.sort((a: any, b: any) => {
    const aStat = statSync(join(autoresearchDir, a.name));
    const bStat = statSync(join(autoresearchDir, b.name));
    return bStat.mtime.getTime() - aStat.mtime.getTime();
  });

  runDirs.forEach((dir: any, index: number) => {
    const dirPath = join(autoresearchDir, dir.name);
    if (index < preserveIterations) {
      plan.filesToPreserve.push(dirPath);
    } else {
      const dirSize = getDirectorySize(dirPath);
      plan.filesToArchive.push(dirPath);
      plan.estimatedSpaceReclaimed += dirSize;
    }
  });

  // Old log files
  const logsDir = resolve(autoresearchDir, "logs");
  if (existsSync(logsDir)) {
    const logFiles = readdirSync(logsDir).filter((f) => f.endsWith(".log"));
    logFiles.forEach((logFile) => {
      const logPath = join(logsDir, logFile);
      const size = getFileSize(logPath);
      plan.filesToArchive.push(logPath);
      plan.estimatedSpaceReclaimed += size;
    });
  }

  return plan;
}

function getDirectorySize(dir: string): number {
  let total = 0;
  const items = readdirSync(dir, { withFileTypes: true });
  for (const item of items) {
    const itemPath = join(dir, item.name);
    if (item.isDirectory()) {
      total += getDirectorySize(itemPath);
    } else {
      total += getFileSize(itemPath);
    }
  }
  return total;
}

export function executeCompaction(
  repoPath: string,
  plan: CompactionPlan,
  dryRun = false,
): CompactionResult {
  const result: CompactionResult = {
    success: true,
    archived: [],
    removed: [],
    preserved: plan.filesToPreserve,
    spaceReclaimed: 0,
    rollbackPath: null,
  };

  if (plan.filesToArchive.length === 0) {
    return result;
  }

  const autoresearchDir = resolve(repoPath, ".autoresearch");
  const archiveDir = resolve(autoresearchDir, "archive", new Date().toISOString().replace(/[:.]/g, "-"));

  if (!dryRun) {
    mkdirSync(archiveDir, { recursive: true });
    result.rollbackPath = archiveDir;

    // Create rollback manifest
    const manifest = {
      archived_at: new Date().toISOString(),
      files: plan.filesToArchive,
      preserved: plan.filesToPreserve,
    };
    writeFileSync(resolve(archiveDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  }

  for (const filePath of plan.filesToArchive) {
    const baseName = basename(filePath);
    const archivePath = join(archiveDir, baseName);

    if (dryRun) {
      result.archived.push(`${filePath} (would archive to ${archivePath})`);
    } else {
      try {
        const size = getFileSize(filePath);
        renameSync(filePath, archivePath);
        result.archived.push(filePath);
        result.spaceReclaimed += size;
      } catch (error) {
        result.success = false;
        result.removed.push(`${filePath} (failed: ${(error as Error).message})`);
      }
    }
  }

  return result;
}

export function rollbackCompaction(rollbackPath: string): boolean {
  if (!existsSync(rollbackPath)) {
    return false;
  }

  const manifestPath = resolve(rollbackPath, "manifest.json");
  if (!existsSync(manifestPath)) {
    return false;
  }

  try {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));

    for (const filePath of manifest.files) {
      const baseName = basename(filePath);
      const archivePath = join(rollbackPath, baseName);
      if (existsSync(archivePath)) {
        // Remove any file that might have been created in place
        if (existsSync(filePath)) {
          rmSync(filePath, { recursive: true, force: true });
        }
        renameSync(archivePath, filePath);
      }
    }

    return true;
  } catch {
    return false;
  }
}
