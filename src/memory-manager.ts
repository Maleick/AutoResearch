import {
  MemoryItem,
  PendingMemoryItem,
  MemoryConsolidationState,
  MemoryAuditLogEntry,
  MemoryProvenance,
  RunState,
} from "./types.js";
import {
  existsSync,
  readFileSync,
  appendFileSync,
  lstatSync,
  openSync,
  writeSync,
  closeSync,
  constants as fsConstants,
} from "fs";
import { dirname, isAbsolute, parse, relative, resolve, sep } from "path";
import {
  utcNow,
  ensureParent,
  AutoresearchError,
} from "./helpers.js";
import {
  MEMORY_DEFAULT,
  MEMORY_AUDIT_DEFAULT,
  MEMORY_CONSOLIDATION_THRESHOLD,
  MEMORY_EXPIRY_DAYS,
} from "./constants.js";

function generateId(): string {
  return `mem-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createInitialMemoryState(): MemoryConsolidationState {
  return {
    pending_items: [],
    consolidated_items: [],
    consolidation_threshold: MEMORY_CONSOLIDATION_THRESHOLD,
  };
}

export function createMemoryStateWithThreshold(
  threshold: number
): MemoryConsolidationState {
  if (!Number.isInteger(threshold) || threshold < 1) {
    throw new AutoresearchError(
      `Invalid consolidation threshold: ${threshold} (must be a positive integer >= 1)`
    );
  }
  return {
    pending_items: [],
    consolidated_items: [],
    consolidation_threshold: threshold,
  };
}

export function buildMemoryProvenance(state: RunState): MemoryProvenance {
  return {
    run_id: state.run_id,
    iteration: state.stats.total_iterations,
    goal: state.goal,
    metric_name: state.metric.name,
    metric_value: state.metric.latest ?? "",
    direction: state.metric.direction,
    timestamp: state.last_iteration?.timestamp ?? utcNow(),
    labels: state.last_iteration?.labels ?? [],
  };
}

export function addPendingMemoryItem(
  state: MemoryConsolidationState,
  pattern: string,
  description: string,
  provenance: MemoryProvenance
): MemoryConsolidationState {
  const existingIndex = state.pending_items.findIndex(
    (p) => p.pattern === pattern
  );

  if (existingIndex >= 0) {
    const updated = [...state.pending_items];
    const existing = updated[existingIndex];
    updated[existingIndex] = {
      ...existing,
      description: existing.description === "" && description !== "" ? description : existing.description,
      verification_count: existing.verification_count + 1,
      last_verified: utcNow(),
      provenance,
    };
    return { ...state, pending_items: updated };
  }

  const now = utcNow();
  const newItem: PendingMemoryItem = {
    id: generateId(),
    pattern,
    description,
    provenance,
    verification_count: 1,
    first_observed: now,
    last_verified: now,
  };

  return {
    ...state,
    pending_items: [...state.pending_items, newItem],
  };
}

export function recordSuccessfulVerification(
  state: MemoryConsolidationState,
  pattern: string,
  provenance: MemoryProvenance
): MemoryConsolidationState {
  return addPendingMemoryItem(state, pattern, "", provenance);
}

export function addMemoryAuditEntry(
  state: MemoryConsolidationState,
  auditLogPath?: string
): { state: MemoryConsolidationState; auditEntries: MemoryAuditLogEntry[] } {
  const auditEntries: MemoryAuditLogEntry[] = [];

  for (const item of state.pending_items) {
    const entry: MemoryAuditLogEntry = {
      timestamp: utcNow(),
      action: "added",
      item_id: item.id,
      pattern: item.pattern,
      provenance: item.provenance,
      verification_count: item.verification_count,
    };
    auditEntries.push(entry);

    if (auditLogPath) {
      appendAuditLogEntry(auditLogPath, entry);
    }
  }

  return { state, auditEntries };
}

function shouldConsolidate(item: PendingMemoryItem, threshold: number): boolean {
  return item.verification_count >= threshold;
}

function createMemoryItem(
  pending: PendingMemoryItem
): MemoryItem {
  const now = utcNow();
  return {
    id: pending.id,
    pattern: pending.pattern,
    description: pending.description,
    provenance: pending.provenance,
    verification_count: pending.verification_count,
    first_observed: pending.first_observed,
    consolidated_at: now,
    status: "active",
  };
}

export function consolidateReadyItems(
  state: MemoryConsolidationState,
  auditLogPath?: string
): { state: MemoryConsolidationState; auditEntries: MemoryAuditLogEntry[] } {
  const auditEntries: MemoryAuditLogEntry[] = [];
  const toPromote: PendingMemoryItem[] = [];
  const remaining: PendingMemoryItem[] = [];

  for (const item of state.pending_items) {
    if (shouldConsolidate(item, state.consolidation_threshold)) {
      toPromote.push(item);
    } else {
      remaining.push(item);
    }
  }

  if (toPromote.length === 0) {
    return { state, auditEntries: [] };
  }

  const newConsolidated = toPromote.map(createMemoryItem);
  const now = utcNow();

  const existingActivePatterns = new Set(
    state.consolidated_items
      .filter((item) => item.status === "active")
      .map((item) => item.pattern)
  );

  for (const item of toPromote) {
    if (existingActivePatterns.has(item.pattern)) {
      continue;
    }
    const entry: MemoryAuditLogEntry = {
      timestamp: now,
      action: "promoted",
      item_id: item.id,
      pattern: item.pattern,
      provenance: item.provenance,
      verification_count: item.verification_count,
      reason: `Reached threshold of ${state.consolidation_threshold} verifications`,
    };
    auditEntries.push(entry);

    if (auditLogPath) {
      appendAuditLogEntry(auditLogPath, entry);
    }
  }

  return {
    state: {
      ...state,
      pending_items: remaining,
      consolidated_items: [
        ...state.consolidated_items,
        ...newConsolidated.filter((item) => !existingActivePatterns.has(item.pattern)),
      ],
      last_consolidated: now,
    },
    auditEntries,
  };
}

export function expireOldMemories(
  state: MemoryConsolidationState,
  auditLogPath?: string
): { state: MemoryConsolidationState; auditEntries: MemoryAuditLogEntry[] } {
  const auditEntries: MemoryAuditLogEntry[] = [];
  const now = new Date();
  const expiryMs = MEMORY_EXPIRY_DAYS * 24 * 60 * 60 * 1000;

  const updated: MemoryItem[] = [];
  for (const item of state.consolidated_items) {
    const consolidatedAt = new Date(item.consolidated_at);
    const ageMs = now.getTime() - consolidatedAt.getTime();

    if (ageMs >= expiryMs && item.status === "active") {
      const expired: MemoryItem = {
        ...item,
        status: "expired",
        expired_at: utcNow(),
      };
      updated.push(expired);

      const entry: MemoryAuditLogEntry = {
        timestamp: utcNow(),
        action: "expired",
        item_id: item.id,
        pattern: item.pattern,
        provenance: item.provenance,
        verification_count: item.verification_count,
        reason: `Expired after ${MEMORY_EXPIRY_DAYS} days`,
      };
      auditEntries.push(entry);

      if (auditLogPath) {
        appendAuditLogEntry(auditLogPath, entry);
      }
    } else {
      updated.push(item);
    }
  }

  return {
    state: { ...state, consolidated_items: updated },
    auditEntries,
  };
}

function appendAuditLogEntry(path: string, entry: MemoryAuditLogEntry): void {
  ensureParent(path);
  const line = JSON.stringify(entry) + "\n";
  appendFileSync(path, line, "utf-8");
}

export function writeMemoryFile(
  memoryPath: string,
  consolidatedItems: MemoryItem[]
): void {
  const header = `# AutoResearch Memory\n\nPatterns extracted from successful iteration cycles.\n\n---\n\n`;
  const content = header + consolidatedItems
    .filter((item) => item.status === "active")
    .map((item) => {
      const prov = item.provenance;
      const description = item.description || "Auto-generated pattern";
      return `### Pattern: ${sanitizeMemoryText(item.pattern)}

**Description:** ${sanitizeMemoryText(description)}

**Provenance:**
- Run: \`${sanitizeMemoryText(prov.run_id)}\`
- Iteration: ${sanitizeMemoryText(prov.iteration)}
- Goal: ${sanitizeMemoryText(prov.goal)}
- Metric: ${sanitizeMemoryText(prov.metric_name)}=${sanitizeMemoryText(prov.metric_value)} (${sanitizeMemoryText(prov.direction)})
- Labels: ${prov.labels.map(sanitizeMemoryText).join(", ")}
- Consolidated: ${sanitizeMemoryText(item.consolidated_at)}
- Verifications: ${sanitizeMemoryText(item.verification_count)}

`;
    })
    .join("---\n\n");

  writeMemoryFileSafely(memoryPath, content);
}

export function getMemoryFilePath(
  repo: string | undefined,
  memoryPathValue: string | undefined
): string {
  return resolvePathWithinRepo(repo, memoryPathValue, MEMORY_DEFAULT);
}

export function getAuditLogPath(
  repo: string | undefined,
  auditPathValue: string | undefined
): string {
  return resolvePathWithinRepo(repo, auditPathValue, MEMORY_AUDIT_DEFAULT);
}

function sanitizeMemoryText(value: unknown): string {
  return String(value)
    .replace(/`/g, "'")
    .replace(/[\r\n\t]/g, (char) => {
      switch (char) {
        case "\r": return "\\r";
        case "\n": return "\\n";
        case "\t": return "\\t";
        default: return " ";
      }
    })
    .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f-\x9f]/g, " ");
}

function writeMemoryFileSafely(memoryPath: string, content: string): void {
  const target = resolve(memoryPath);
  assertPathContainsNoSymlinks(dirname(target));
  ensureParent(target);
  assertPathContainsNoSymlinks(target);

  const flags = fsConstants.O_WRONLY
    | fsConstants.O_CREAT
    | fsConstants.O_TRUNC
    | (fsConstants.O_NOFOLLOW ?? 0);
  const fd = openSync(target, flags, 0o600);
  try {
    const buffer = Buffer.from(content, "utf-8");
    let offset = 0;
    while (offset < buffer.length) {
      const bytesWritten = writeSync(fd, buffer, offset, buffer.length - offset);
      if (bytesWritten <= 0) {
        throw new AutoresearchError(
          `Failed to write complete memory file: ${target}`
        );
      }
      offset += bytesWritten;
    }
  } finally {
    closeSync(fd);
  }
}

function assertPathContainsNoSymlinks(target: string): void {
  const parsed = parse(target);
  const relativeParts = target
    .slice(parsed.root.length)
    .split(sep)
    .filter(Boolean);
  let current = parsed.root;

  for (const part of relativeParts) {
    current = resolve(current, part);
    if (!existsSync(current)) {
      continue;
    }
    if (lstatSync(current).isSymbolicLink()) {
      throw new AutoresearchError(
        `Refusing to write memory file through symlink: ${current}`
      );
    }
  }
}

function resolvePathWithinRepo(
  repo: string | undefined,
  value: string | undefined,
  defaultName: string
): string {
  const repoRoot = resolve(repo ?? ".");
  const target = value
    ? (isAbsolute(value) ? resolve(value) : resolve(repoRoot, value))
    : resolve(repoRoot, defaultName);

  const repoRelativePath = relative(repoRoot, target);
  if (
    repoRelativePath === "" ||
    repoRelativePath.startsWith(`..${sep}`) ||
    repoRelativePath === ".." ||
    isAbsolute(repoRelativePath)
  ) {
    throw new AutoresearchError(
      `Memory path must stay within repository: ${target}`
    );
  }

  return target;
}

export function readAuditLog(path: string): MemoryAuditLogEntry[] {
  if (!existsSync(path)) {
    return [];
  }
  const content = readFileSync(path, "utf-8");
  if (!content.trim()) {
    return [];
  }

  const entries: MemoryAuditLogEntry[] = [];
  const lines = content.split("\n");

  lines.forEach((line) => {
    if (!line.trim()) {
      return;
    }

    try {
      entries.push(JSON.parse(line) as MemoryAuditLogEntry);
    } catch {
      return;
    }
  });

  return entries;
}

export function getActivePatterns(state: MemoryConsolidationState): string[] {
  return state.consolidated_items
    .filter((item) => item.status === "active")
    .map((item) => item.pattern);
}