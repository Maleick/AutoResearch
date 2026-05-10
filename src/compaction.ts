import { existsSync, mkdirSync, renameSync, rmSync, statSync, writeFileSync, readdirSync, readFileSync, realpathSync } from "fs";
import { resolve, join, basename, dirname, isAbsolute, relative } from "path";

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

  // Archive older log files while preserving active logs
  const logsDir = resolve(autoresearchDir, "logs");
  if (existsSync(logsDir)) {
    const logFiles = readdirSync(logsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(".log"))
      .map((entry) => entry.name);
    let newestLogFile: string | null = null;
    let newestLogMtime = -Infinity;
    for (const logFile of logFiles) {
      const logPath = join(logsDir, logFile);
      const mtime = statSync(logPath).mtimeMs;
      if (mtime > newestLogMtime) {
        newestLogMtime = mtime;
        newestLogFile = logFile;
      }
    }
    const preservedLogs = new Set<string>(["worker.log"]);
    if (newestLogFile) preservedLogs.add(newestLogFile);
    logFiles.forEach((logFile) => {
      const logPath = join(logsDir, logFile);
      if (preservedLogs.has(logFile)) {
        plan.filesToPreserve.push(logPath);
        return;
      }
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
        const size = statSync(filePath).isDirectory() ? getDirectorySize(filePath) : getFileSize(filePath);
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

function isPathInside(childPath: string, parentPath: string): boolean {
  const relationship = relative(parentPath, childPath);
  return relationship === "" || (!relationship.startsWith("..") && !isAbsolute(relationship));
}

function getRollbackAutoresearchDir(rollbackDir: string): string | null {
  const archiveDir = dirname(rollbackDir);
  if (basename(archiveDir) !== "archive") {
    return null;
  }

  const autoresearchDir = dirname(archiveDir);
  if (basename(autoresearchDir) !== ".autoresearch") {
    return null;
  }

  return autoresearchDir;
}

function nearestExistingPath(path: string): string | null {
  let current = path;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }

  return current;
}

function isRollbackDestinationAllowed(
  destinationPath: string,
  autoresearchDir: string,
  archiveRoot: string,
  realAutoresearchDir: string,
  realArchiveRoot: string,
): boolean {
  if (
    !isPathInside(destinationPath, autoresearchDir) ||
    isPathInside(destinationPath, archiveRoot) ||
    destinationPath === autoresearchDir
  ) {
    return false;
  }

  const existingDestinationPath = nearestExistingPath(destinationPath);
  if (!existingDestinationPath) {
    return false;
  }

  const realDestinationPath = realpathSync(existingDestinationPath);
  return isPathInside(realDestinationPath, realAutoresearchDir) && !isPathInside(realDestinationPath, realArchiveRoot);
}

interface RollbackOperation {
  archivePath: string;
  destinationPath: string;
}

export function rollbackCompaction(rollbackPath: string): boolean {
  const rollbackDir = resolve(rollbackPath);
  if (!existsSync(rollbackDir)) {
    return false;
  }

  const autoresearchDir = getRollbackAutoresearchDir(rollbackDir);
  if (!autoresearchDir) {
    return false;
  }

  const archiveRoot = dirname(rollbackDir);
  const manifestPath = resolve(rollbackDir, "manifest.json");
  if (!existsSync(manifestPath)) {
    return false;
  }

  try {
    const realAutoresearchDir = realpathSync(autoresearchDir);
    const realArchiveRoot = realpathSync(archiveRoot);
    const manifest: unknown = JSON.parse(readFileSync(manifestPath, "utf-8"));
    if (
      typeof manifest !== "object" ||
      manifest === null ||
      !("files" in manifest) ||
      !Array.isArray(manifest.files)
    ) {
      return false;
    }

    const operations: RollbackOperation[] = [];
    for (const filePath of manifest.files) {
      if (typeof filePath !== "string" || filePath.length === 0) {
        return false;
      }

      const destinationPath = resolve(filePath);
      if (
        !isRollbackDestinationAllowed(
          destinationPath,
          autoresearchDir,
          archiveRoot,
          realAutoresearchDir,
          realArchiveRoot,
        )
      ) {
        return false;
      }

      const archivePath = resolve(rollbackDir, basename(destinationPath));
      if (!isPathInside(archivePath, rollbackDir) || archivePath === manifestPath) {
        return false;
      }

      operations.push({ archivePath, destinationPath });
    }

    for (const { archivePath, destinationPath } of operations) {
      if (existsSync(archivePath)) {
        // Remove any file that might have been created in place
        if (existsSync(destinationPath)) {
          rmSync(destinationPath, { recursive: true, force: true });
        }
        renameSync(archivePath, destinationPath);
      }
    }

    return true;
  } catch {
    return false;
  }
}
