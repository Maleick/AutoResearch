import { MemoryItem, MemoryConsolidationState, MemoryAuditLogEntry, MemoryProvenance, RunState } from "./types.js";
export declare function createInitialMemoryState(): MemoryConsolidationState;
export declare function createMemoryStateWithThreshold(threshold: number): MemoryConsolidationState;
export declare function buildMemoryProvenance(state: RunState): MemoryProvenance;
export declare function addPendingMemoryItem(state: MemoryConsolidationState, pattern: string, description: string, provenance: MemoryProvenance): MemoryConsolidationState;
export declare function recordSuccessfulVerification(state: MemoryConsolidationState, pattern: string, provenance: MemoryProvenance): MemoryConsolidationState;
export declare function addMemoryAuditEntry(state: MemoryConsolidationState, auditLogPath?: string): {
    state: MemoryConsolidationState;
    auditEntries: MemoryAuditLogEntry[];
};
export declare function consolidateReadyItems(state: MemoryConsolidationState, auditLogPath?: string): {
    state: MemoryConsolidationState;
    auditEntries: MemoryAuditLogEntry[];
};
export declare function expireOldMemories(state: MemoryConsolidationState, auditLogPath?: string): {
    state: MemoryConsolidationState;
    auditEntries: MemoryAuditLogEntry[];
};
export declare function writeMemoryFile(memoryPath: string, consolidatedItems: MemoryItem[]): void;
export declare function getMemoryFilePath(repo: string | undefined, memoryPathValue: string | undefined): string;
export declare function getAuditLogPath(repo: string | undefined, auditPathValue: string | undefined): string;
export declare function readAuditLog(path: string): MemoryAuditLogEntry[];
export declare function getActivePatterns(state: MemoryConsolidationState): string[];
//# sourceMappingURL=memory-manager.d.ts.map