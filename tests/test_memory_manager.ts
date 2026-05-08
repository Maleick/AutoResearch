import { resolve } from "path";
import { fileURLToPath } from "url";
import { unlinkSync, existsSync, mkdirSync, rmSync, readFileSync, writeFileSync } from "fs";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

const importMemoryManager = async () =>
  await import(resolve(REPO_ROOT, "dist/memory-manager.js"));

describe("Memory Manager", () => {
  let mod: any;

  beforeAll(async () => {
    mod = await importMemoryManager();
  });

  describe("createInitialMemoryState", () => {
    it("creates state with empty arrays", () => {
      const state = mod.createInitialMemoryState();
      expect(state.pending_items).toEqual([]);
      expect(state.consolidated_items).toEqual([]);
    });

    it("uses default consolidation threshold", () => {
      const state = mod.createInitialMemoryState();
      expect(state.consolidation_threshold).toBe(3);
    });
  });

  describe("createMemoryStateWithThreshold", () => {
    it("creates state with custom threshold", () => {
      const state = mod.createMemoryStateWithThreshold(5);
      expect(state.consolidation_threshold).toBe(5);
    });

    it("allows threshold of 1", () => {
      const state = mod.createMemoryStateWithThreshold(1);
      expect(state.consolidation_threshold).toBe(1);
    });

    it("throws for threshold of 0", () => {
      expect(() => mod.createMemoryStateWithThreshold(0)).toThrow(
        /Invalid consolidation threshold/
      );
    });

    it("throws for negative threshold", () => {
      expect(() => mod.createMemoryStateWithThreshold(-5)).toThrow(
        /Invalid consolidation threshold/
      );
    });

    it("throws for NaN threshold", () => {
      expect(() => mod.createMemoryStateWithThreshold(NaN)).toThrow(
        /Invalid consolidation threshold/
      );
    });

    it("throws for non-integer threshold", () => {
      expect(() => mod.createMemoryStateWithThreshold(2.5)).toThrow(
        /Invalid consolidation threshold/
      );
    });
  });

  describe("addPendingMemoryItem", () => {
    it("adds new pending memory item", () => {
      const state = mod.createInitialMemoryState();
      const provenance = {
        run_id: "test-run",
        iteration: 1,
        goal: "test goal",
        metric_name: "test_metric",
        metric_value: "0.5",
        direction: "lower",
        timestamp: "2024-01-01T00:00:00Z",
        labels: [],
      };

      const result = mod.addPendingMemoryItem(
        state,
        "test pattern",
        "Test pattern description",
        provenance
      );

      expect(result.pending_items).toHaveLength(1);
      expect(result.pending_items[0].pattern).toBe("test pattern");
      expect(result.pending_items[0].description).toBe(
        "Test pattern description"
      );
      expect(result.pending_items[0].verification_count).toBe(1);
      expect(result.pending_items[0].provenance).toEqual(provenance);
    });

    it("increments verification count for existing pattern", () => {
      const state = mod.createInitialMemoryState();
      const provenance1 = {
        run_id: "test-run",
        iteration: 1,
        goal: "test goal",
        metric_name: "test_metric",
        metric_value: "0.5",
        direction: "lower",
        timestamp: "2024-01-01T00:00:00Z",
        labels: [],
      };
      const provenance2 = {
        ...provenance1,
        iteration: 2,
        metric_value: "0.4",
      };

      let result = mod.addPendingMemoryItem(
        state,
        "duplicate pattern",
        "Description",
        provenance1
      );
      result = mod.addPendingMemoryItem(
        result,
        "duplicate pattern",
        "Description",
        provenance2
      );

      expect(result.pending_items).toHaveLength(1);
      expect(result.pending_items[0].verification_count).toBe(2);
      expect(result.pending_items[0].provenance).toEqual(provenance2);
    });

    it("updates description when stored description is empty and incoming is non-empty", () => {
      const state = mod.createInitialMemoryState();
      const provenance = {
        run_id: "test-run",
        iteration: 1,
        goal: "test goal",
        metric_name: "test_metric",
        metric_value: "0.5",
        direction: "lower",
        timestamp: "2024-01-01T00:00:00Z",
        labels: [],
      };

      // First add via recordSuccessfulVerification (empty description)
      let result = mod.recordSuccessfulVerification(state, "pattern-a", provenance);
      expect(result.pending_items[0].description).toBe("");

      // Then update with real description via addPendingMemoryItem
      result = mod.addPendingMemoryItem(result, "pattern-a", "Real description", provenance);
      expect(result.pending_items[0].description).toBe("Real description");
      expect(result.pending_items[0].verification_count).toBe(2);
    });

    it("does not overwrite non-empty description with empty incoming description", () => {
      const state = mod.createInitialMemoryState();
      const provenance = {
        run_id: "test-run",
        iteration: 1,
        goal: "test goal",
        metric_name: "test_metric",
        metric_value: "0.5",
        direction: "lower",
        timestamp: "2024-01-01T00:00:00Z",
        labels: [],
      };

      // First add with real description
      let result = mod.addPendingMemoryItem(state, "pattern-b", "Real description", provenance);
      // Then call recordSuccessfulVerification (empty description)
      result = mod.recordSuccessfulVerification(result, "pattern-b", provenance);

      expect(result.pending_items[0].description).toBe("Real description");
      expect(result.pending_items[0].verification_count).toBe(2);
    });
  });

  describe("recordSuccessfulVerification", () => {
    it("increments verification count via addPendingMemoryItem", () => {
      const state = mod.createInitialMemoryState();
      const provenance = {
        run_id: "test-run",
        iteration: 1,
        goal: "test goal",
        metric_name: "test_metric",
        metric_value: "0.5",
        direction: "lower",
        timestamp: "2024-01-01T00:00:00Z",
        labels: [],
      };

      const result = mod.recordSuccessfulVerification(
        state,
        "verified pattern",
        provenance
      );

      expect(result.pending_items).toHaveLength(1);
      expect(result.pending_items[0].verification_count).toBe(1);
    });
  });

  describe("consolidateReadyItems", () => {
    it("does not promote items below threshold", () => {
      const state = mod.createMemoryStateWithThreshold(3);
      const provenance = {
        run_id: "test-run",
        iteration: 1,
        goal: "test goal",
        metric_name: "test_metric",
        metric_value: "0.5",
        direction: "lower",
        timestamp: "2024-01-01T00:00:00Z",
        labels: [],
      };

      let result = mod.addPendingMemoryItem(
        state,
        "pattern1",
        "Description",
        provenance
      );
      result = mod.recordSuccessfulVerification(result, "pattern1", provenance);

      const { state: finalState, auditEntries } =
        mod.consolidateReadyItems(result);

      expect(finalState.pending_items).toHaveLength(1);
      expect(finalState.consolidated_items).toHaveLength(0);
      expect(auditEntries).toHaveLength(0);
    });

    it("promotes items at threshold", () => {
      const state = mod.createMemoryStateWithThreshold(3);
      const provenance = {
        run_id: "test-run",
        iteration: 1,
        goal: "test goal",
        metric_name: "test_metric",
        metric_value: "0.5",
        direction: "lower",
        timestamp: "2024-01-01T00:00:00Z",
        labels: [],
      };

      let result = mod.addPendingMemoryItem(
        state,
        "pattern1",
        "Description",
        provenance
      );
      result = mod.recordSuccessfulVerification(result, "pattern1", provenance);
      result = mod.recordSuccessfulVerification(result, "pattern1", provenance);

      const { state: finalState, auditEntries } =
        mod.consolidateReadyItems(result);

      expect(finalState.pending_items).toHaveLength(0);
      expect(finalState.consolidated_items).toHaveLength(1);
      expect(finalState.consolidated_items[0].pattern).toBe("pattern1");
      expect(finalState.consolidated_items[0].status).toBe("active");
    });

    it("creates audit log entry for promoted items", () => {
      const state = mod.createMemoryStateWithThreshold(3);
      const provenance = {
        run_id: "test-run",
        iteration: 1,
        goal: "test goal",
        metric_name: "test_metric",
        metric_value: "0.5",
        direction: "lower",
        timestamp: "2024-01-01T00:00:00Z",
        labels: [],
      };

      let result = mod.addPendingMemoryItem(
        state,
        "pattern1",
        "Description",
        provenance
      );
      result = mod.recordSuccessfulVerification(result, "pattern1", provenance);
      result = mod.recordSuccessfulVerification(result, "pattern1", provenance);

      const { auditEntries } = mod.consolidateReadyItems(result);

      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0].action).toBe("promoted");
      expect(auditEntries[0].pattern).toBe("pattern1");
      expect(auditEntries[0].verification_count).toBe(3);
      expect(auditEntries[0].provenance).toEqual(provenance);
    });

    it("promotes multiple items at threshold", () => {
      const state = mod.createMemoryStateWithThreshold(1);
      const provenance = {
        run_id: "test-run",
        iteration: 1,
        goal: "test goal",
        metric_name: "test_metric",
        metric_value: "0.5",
        direction: "lower",
        timestamp: "2024-01-01T00:00:00Z",
        labels: [],
      };

      let result = mod.addPendingMemoryItem(
        state,
        "pattern1",
        "Description 1",
        provenance
      );
      result = mod.addPendingMemoryItem(
        result,
        "pattern2",
        "Description 2",
        provenance
      );

      const { state: finalState, auditEntries } =
        mod.consolidateReadyItems(result);

      expect(finalState.pending_items).toHaveLength(0);
      expect(finalState.consolidated_items).toHaveLength(2);
      expect(auditEntries).toHaveLength(2);
    });

    it("writes audit log to file when path provided", () => {
      const state = mod.createMemoryStateWithThreshold(1);
      const provenance = {
        run_id: "test-run",
        iteration: 1,
        goal: "test goal",
        metric_name: "test_metric",
        metric_value: "0.5",
        direction: "lower",
        timestamp: "2024-01-01T00:00:00Z",
        labels: [],
      };

      let result = mod.addPendingMemoryItem(
        state,
        "pattern1",
        "Description",
        provenance
      );

      const auditLogPath = resolve(
        REPO_ROOT,
        ".autoresearch-test-memory-audit.log"
      );

      mod.consolidateReadyItems(result, auditLogPath);

      try {
        expect(existsSync(auditLogPath)).toBe(true);
        const content = readFileSync(auditLogPath, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);
        expect(lines).toHaveLength(1);
        const entry = JSON.parse(lines[0]);
        expect(entry.action).toBe("promoted");
        expect(entry.pattern).toBe("pattern1");
      } finally {
        try {
          unlinkSync(auditLogPath);
        } catch {}
      }
    });

    it("skips re-promotion when active pattern already exists in consolidated_items", () => {
      const state = mod.createMemoryStateWithThreshold(1);
      const provenance = {
        run_id: "test-run",
        iteration: 1,
        goal: "test goal",
        metric_name: "test_metric",
        metric_value: "0.5",
        direction: "lower",
        timestamp: "2024-01-01T00:00:00Z",
        labels: [],
      };

      // First promotion
      let result = mod.addPendingMemoryItem(state, "pattern1", "Description", provenance);
      const { state: afterFirst } = mod.consolidateReadyItems(result);
      expect(afterFirst.consolidated_items).toHaveLength(1);

      // Re-add same pattern to pending and try to consolidate again
      result = mod.addPendingMemoryItem(afterFirst, "pattern1", "Description", provenance);
      const { state: afterSecond, auditEntries } = mod.consolidateReadyItems(result);

      // Should not create a duplicate active entry
      const activePatterns = afterSecond.consolidated_items.filter((i: { status: string }) => i.status === "active");
      expect(activePatterns).toHaveLength(1);
      // Audit entries should be empty (skipped the duplicate)
      expect(auditEntries).toHaveLength(0);
    });
  });

  describe("expireOldMemories", () => {
    const createExpiredState = () => {
      const state = mod.createInitialMemoryState();
      const provenance = {
        run_id: "test-run",
        iteration: 1,
        goal: "test goal",
        metric_name: "test_metric",
        metric_value: "0.5",
        direction: "lower",
        timestamp: "2024-01-01T00:00:00Z",
        labels: [],
      };

      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31);

      const item = {
        id: "mem-old",
        pattern: "old pattern",
        description: "Description",
        provenance,
        verification_count: 3,
        first_observed: "2024-01-01T00:00:00Z",
        consolidated_at: oldDate.toISOString(),
        status: "active" as const,
      };

      return {
        ...state,
        consolidated_items: [item],
      };
    };

    it("marks old items as expired", () => {
      const state = createExpiredState();
      const { state: resultState, auditEntries } = mod.expireOldMemories(state);

      expect(resultState.consolidated_items[0].status).toBe("expired");
      expect(resultState.consolidated_items[0].expired_at).toBeDefined();
      expect(auditEntries).toHaveLength(1);
      expect(auditEntries[0].action).toBe("expired");
      expect(auditEntries[0].pattern).toBe("old pattern");
    });

    it("keeps recent items active", () => {
      const state = mod.createInitialMemoryState();
      const provenance = {
        run_id: "test-run",
        iteration: 1,
        goal: "test goal",
        metric_name: "test_metric",
        metric_value: "0.5",
        direction: "lower",
        timestamp: "2024-01-01T00:00:00Z",
        labels: [],
      };

      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 1);

      const item = {
        id: "mem-recent",
        pattern: "recent pattern",
        description: "Description",
        provenance,
        verification_count: 3,
        first_observed: "2024-01-01T00:00:00Z",
        consolidated_at: recentDate.toISOString(),
        status: "active" as const,
      };

      const stateWithRecent = {
        ...state,
        consolidated_items: [item],
      };

      const { state: resultState, auditEntries } = mod.expireOldMemories(
        stateWithRecent
      );

      expect(resultState.consolidated_items[0].status).toBe("active");
      expect(resultState.consolidated_items[0].expired_at).toBeUndefined();
      expect(auditEntries).toHaveLength(0);
    });

    it("writes audit log for expired items", () => {
      const state = createExpiredState();
      const auditLogPath = resolve(
        REPO_ROOT,
        ".autoresearch-test-memory-expire.log"
      );

      mod.expireOldMemories(state, auditLogPath);

      try {
        expect(existsSync(auditLogPath)).toBe(true);
        const content = readFileSync(auditLogPath, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);
        expect(lines).toHaveLength(1);
        const entry = JSON.parse(lines[0]);
        expect(entry.action).toBe("expired");
        expect(entry.pattern).toBe("old pattern");
      } finally {
        try {
          unlinkSync(auditLogPath);
        } catch {}
      }
    });
  });

  describe("getActivePatterns", () => {
    it("returns only active pattern strings", () => {
      const state = mod.createInitialMemoryState();
      const provenance = {
        run_id: "test-run",
        iteration: 1,
        goal: "test goal",
        metric_name: "test_metric",
        metric_value: "0.5",
        direction: "lower",
        timestamp: "2024-01-01T00:00:00Z",
        labels: [],
      };

      const now = new Date();
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 31);

      state.consolidated_items = [
        {
          id: "mem-1",
          pattern: "active pattern",
          description: "",
          provenance,
          verification_count: 3,
          first_observed: "2024-01-01T00:00:00Z",
          consolidated_at: now.toISOString(),
          status: "active",
        },
        {
          id: "mem-2",
          pattern: "expired pattern",
          description: "",
          provenance,
          verification_count: 3,
          first_observed: "2024-01-01T00:00:00Z",
          consolidated_at: oldDate.toISOString(),
          status: "expired",
          expired_at: now.toISOString(),
        },
      ];

      const patterns = mod.getActivePatterns(state);
      expect(patterns).toEqual(["active pattern"]);
    });

    it("returns empty array for empty state", () => {
      const state = mod.createInitialMemoryState();
      const patterns = mod.getActivePatterns(state);
      expect(patterns).toEqual([]);
    });
  });

  describe("addMemoryAuditEntry", () => {
    it("returns audit entries for all pending items", () => {
      const state = mod.createInitialMemoryState();
      const provenance = {
        run_id: "test-run",
        iteration: 1,
        goal: "test goal",
        metric_name: "test_metric",
        metric_value: "0.5",
        direction: "lower",
        timestamp: "2024-01-01T00:00:00Z",
        labels: [],
      };

      let result = mod.addPendingMemoryItem(
        state,
        "pattern1",
        "Description 1",
        provenance
      );
      result = mod.addPendingMemoryItem(result, "pattern2", "Description 2", provenance);

      const { auditEntries } = mod.addMemoryAuditEntry(result);

      expect(auditEntries).toHaveLength(2);
      expect(auditEntries[0].action).toBe("added");
      expect(auditEntries[0].pattern).toBe("pattern1");
      expect(auditEntries[1].pattern).toBe("pattern2");
    });

    it("writes audit log to file when path provided", () => {
      const state = mod.createInitialMemoryState();
      const provenance = {
        run_id: "test-run",
        iteration: 1,
        goal: "test goal",
        metric_name: "test_metric",
        metric_value: "0.5",
        direction: "lower",
        timestamp: "2024-01-01T00:00:00Z",
        labels: [],
      };

      const result = mod.addPendingMemoryItem(
        state,
        "pattern1",
        "Description",
        provenance
      );

      const auditLogPath = resolve(
        REPO_ROOT,
        ".autoresearch-test-added-audit.log"
      );

      mod.addMemoryAuditEntry(result, auditLogPath);

      try {
        expect(existsSync(auditLogPath)).toBe(true);
        const content = readFileSync(auditLogPath, "utf-8");
        const lines = content.trim().split("\n").filter(Boolean);
        expect(lines).toHaveLength(1);
        const entry = JSON.parse(lines[0]);
        expect(entry.action).toBe("added");
        expect(entry.pattern).toBe("pattern1");
      } finally {
        try {
          unlinkSync(auditLogPath);
        } catch {}
      }
    });

    it("returns empty entries for empty pending items", () => {
      const state = mod.createInitialMemoryState();
      const { auditEntries } = mod.addMemoryAuditEntry(state);
      expect(auditEntries).toHaveLength(0);
    });
  });

  describe("readAuditLog", () => {
    it("returns empty array for nonexistent file", () => {
      const entries = mod.readAuditLog(
        resolve(REPO_ROOT, ".nonexistent-audit.log")
      );
      expect(entries).toEqual([]);
    });

    it("parses valid audit log file", () => {
      const auditLogPath = resolve(REPO_ROOT, ".autoresearch-test-audit-parse.log");
      const entry = {
        timestamp: "2024-01-01T00:00:00Z",
        action: "promoted",
        item_id: "mem-1",
        pattern: "test pattern",
        provenance: {
          run_id: "test-run",
          iteration: 1,
          goal: "test goal",
          metric_name: "test_metric",
          metric_value: "0.5",
          direction: "lower",
          timestamp: "2024-01-01T00:00:00Z",
          labels: [],
        },
        verification_count: 3,
        reason: "Reached threshold",
      };

      try {
        writeFileSync(auditLogPath, JSON.stringify(entry) + "\n", "utf-8");
        const entries = mod.readAuditLog(auditLogPath);
        expect(entries).toHaveLength(1);
        expect(entries[0].action).toBe("promoted");
        expect(entries[0].pattern).toBe("test pattern");
      } finally {
        try {
          unlinkSync(auditLogPath);
        } catch {}
      }
    });
  });

  describe("getMemoryFilePath", () => {
    it("returns absolute path as-is", () => {
      const path = mod.getMemoryFilePath(undefined, "/abs/path/memory.md");
      expect(path).toBe("/abs/path/memory.md");
    });

    it("resolves relative path against repo", () => {
      const path = mod.getMemoryFilePath("/my/repo", "memory.md");
      expect(path).toBe(resolve("/my/repo", "memory.md"));
    });

    it("uses default when no path provided", () => {
      const path = mod.getMemoryFilePath("/my/repo", undefined);
      expect(path).toBe(resolve("/my/repo", "autoresearch-memory.md"));
    });
  });

  describe("getAuditLogPath", () => {
    it("returns absolute path as-is", () => {
      const path = mod.getAuditLogPath(undefined, "/abs/path/audit.log");
      expect(path).toBe("/abs/path/audit.log");
    });

    it("resolves relative path against repo", () => {
      const path = mod.getAuditLogPath("/my/repo", "audit.log");
      expect(path).toBe(resolve("/my/repo", "audit.log"));
    });

    it("uses default when no path provided", () => {
      const path = mod.getAuditLogPath("/my/repo", undefined);
      expect(path).toBe(resolve("/my/repo", ".autoresearch/memory-audit.log"));
    });
  });

  describe("buildMemoryProvenance", () => {
    it("builds provenance from run state", async () => {
      const { buildMemoryProvenance } = mod;
      const runState = {
        run_id: "run-123",
        stats: { total_iterations: 5 },
        goal: "improve coverage",
        metric: {
          name: "coverage",
          direction: "higher",
          latest: "85%",
        },
        last_iteration: {
          timestamp: "2024-01-01T00:00:00Z",
          labels: ["label1", "label2"],
        },
      } as any;

      const provenance = buildMemoryProvenance(runState);

      expect(provenance.run_id).toBe("run-123");
      expect(provenance.iteration).toBe(5);
      expect(provenance.goal).toBe("improve coverage");
      expect(provenance.metric_name).toBe("coverage");
      expect(provenance.metric_value).toBe("85%");
      expect(provenance.direction).toBe("higher");
      expect(provenance.labels).toEqual(["label1", "label2"]);
    });
  });

  describe("writeMemoryFile", () => {
    const makeProvenance = () => ({
      run_id: "run-abc",
      iteration: 2,
      goal: "reduce error rate",
      metric_name: "error_rate",
      metric_value: "0.02",
      direction: "lower",
      timestamp: "2024-06-01T00:00:00Z",
      labels: ["prod", "fast"],
    });

    const makeItem = (overrides: Record<string, unknown> = {}) => ({
      id: "mem-test-1",
      pattern: "cache results between runs",
      description: "Caching avoids redundant computation",
      provenance: makeProvenance(),
      verification_count: 4,
      first_observed: "2024-06-01T00:00:00Z",
      consolidated_at: "2024-06-02T00:00:00Z",
      status: "active" as const,
      ...overrides,
    });

    it("writes a file with the correct header", () => {
      const memPath = resolve(REPO_ROOT, ".autoresearch-test-write-memory.md");
      try {
        mod.writeMemoryFile(memPath, [makeItem()]);
        const content = readFileSync(memPath, "utf-8");
        expect(content).toContain("# AutoResearch Memory");
        expect(content).toContain("Patterns extracted from successful iteration cycles.");
      } finally {
        try { unlinkSync(memPath); } catch {}
      }
    });

    it("includes pattern heading and description", () => {
      const memPath = resolve(REPO_ROOT, ".autoresearch-test-write-memory2.md");
      try {
        mod.writeMemoryFile(memPath, [makeItem()]);
        const content = readFileSync(memPath, "utf-8");
        expect(content).toContain("### Pattern: cache results between runs");
        expect(content).toContain("**Description:** Caching avoids redundant computation");
      } finally {
        try { unlinkSync(memPath); } catch {}
      }
    });

    it("includes provenance fields", () => {
      const memPath = resolve(REPO_ROOT, ".autoresearch-test-write-memory3.md");
      try {
        mod.writeMemoryFile(memPath, [makeItem()]);
        const content = readFileSync(memPath, "utf-8");
        expect(content).toContain("run-abc");
        expect(content).toContain("reduce error rate");
        expect(content).toContain("error_rate=0.02 (lower)");
        expect(content).toContain("prod, fast");
        expect(content).toContain("Verifications: 4");
      } finally {
        try { unlinkSync(memPath); } catch {}
      }
    });

    it("filters out expired items", () => {
      const memPath = resolve(REPO_ROOT, ".autoresearch-test-write-memory4.md");
      try {
        const active = makeItem({ pattern: "active-pattern" });
        const expired = makeItem({
          id: "mem-test-2",
          pattern: "expired-pattern",
          status: "expired",
          expired_at: "2024-06-10T00:00:00Z",
        });
        mod.writeMemoryFile(memPath, [active, expired]);
        const content = readFileSync(memPath, "utf-8");
        expect(content).toContain("active-pattern");
        expect(content).not.toContain("expired-pattern");
      } finally {
        try { unlinkSync(memPath); } catch {}
      }
    });

    it("uses fallback description when description is empty", () => {
      const memPath = resolve(REPO_ROOT, ".autoresearch-test-write-memory5.md");
      try {
        mod.writeMemoryFile(memPath, [makeItem({ description: "" })]);
        const content = readFileSync(memPath, "utf-8");
        expect(content).toContain("**Description:** Auto-generated pattern");
      } finally {
        try { unlinkSync(memPath); } catch {}
      }
    });

    it("writes empty header when no active items", () => {
      const memPath = resolve(REPO_ROOT, ".autoresearch-test-write-memory6.md");
      try {
        mod.writeMemoryFile(memPath, []);
        const content = readFileSync(memPath, "utf-8");
        expect(content).toContain("# AutoResearch Memory");
        expect(content).not.toContain("### Pattern:");
      } finally {
        try { unlinkSync(memPath); } catch {}
      }
    });
  });
});