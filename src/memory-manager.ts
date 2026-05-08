import {
  MemoryItem,
  PendingMemoryItem,
  MemoryConsolidationState,
  MemoryAuditLogEntry,
  MemoryProvenance,
  RunState,
} from "./types.js";
import { existsSync, readFileSync, appendFileSync, writeFileSync } from "fs";
import {
  utcNow,
  ensureParent,
  resolvePath,
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
      return `### Pattern: ${item.pattern}

**Description:** ${item.description || "Auto-generated pattern"}

**Provenance:**
- Run: \`${prov.run_id}\`
- Iteration: ${prov.iteration}
- Goal: ${prov.goal}
- Metric: ${prov.metric_name}=${prov.metric_value} (${prov.direction})
- Labels: ${prov.labels.join(", ")}
- Consolidated: ${item.consolidated_at}
- Verifications: ${item.verification_count}

`;
    })
    .join("---\n\n");

  ensureParent(memoryPath);
  writeFileSync(memoryPath, content, "utf-8");
}

export function getMemoryFilePath(
  repo: string | undefined,
  memoryPathValue: string | undefined
): string {
  return resolvePath(repo, memoryPathValue, MEMORY_DEFAULT);
}

export function getAuditLogPath(
  repo: string | undefined,
  auditPathValue: string | undefined
): string {
  return resolvePath(repo, auditPathValue, MEMORY_AUDIT_DEFAULT);
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

  lines.forEach((line, index) => {
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