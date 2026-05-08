import { resolve } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

const importSubagentPool = async () => await import(resolve(REPO_ROOT, "dist/subagent-pool.js"));

describe("buildDraftPoolPlan", () => {
  let mod: any;
  beforeAll(async () => { mod = await importSubagentPool(); });

  it("creates a draft pool with correct kind", () => {
    const pool = mod.buildDraftPoolPlan({
      num_drafts: 3,
      branch_selection_policy: "best",
    });
    expect(pool.kind).toBe("autoresearch_draft_pool");
    expect(pool.version).toBe(1);
  });

  it("creates correct number of drafts", () => {
    const pool = mod.buildDraftPoolPlan({
      num_drafts: 4,
      branch_selection_policy: "roulette",
    });
    expect(pool.num_drafts).toBe(4);
    expect(pool.active_drafts.length).toBe(4);
  });

  it("assigns unique branch IDs", () => {
    const pool1 = mod.buildDraftPoolPlan({
      num_drafts: 2,
      branch_selection_policy: "best",
    });
    const pool2 = mod.buildDraftPoolPlan({
      num_drafts: 2,
      branch_selection_policy: "best",
    });
    const ids1 = pool1.active_drafts.map((d: any) => d.branch_id);
    const ids2 = pool2.active_drafts.map((d: any) => d.branch_id);
    expect(ids1[0]).not.toBe(ids2[0]);
  });

  it("sets all drafts to pending status", () => {
    const pool = mod.buildDraftPoolPlan({
      num_drafts: 3,
      branch_selection_policy: "best",
    });
    for (const draft of pool.active_drafts) {
      expect(draft.status).toBe("pending");
    }
  });

  it("sets parent iteration from baseline", () => {
    const pool = mod.buildDraftPoolPlan({
      num_drafts: 2,
      branch_selection_policy: "best",
      baseline_iteration: 5,
    });
    for (const draft of pool.active_drafts) {
      expect(draft.parent_iteration).toBe(5);
    }
  });

  it("sets sequential iterations for drafts", () => {
    const pool = mod.buildDraftPoolPlan({
      num_drafts: 3,
      branch_selection_policy: "diverse",
    });
    expect(pool.active_drafts[0].iteration).toBe(1);
    expect(pool.active_drafts[1].iteration).toBe(2);
    expect(pool.active_drafts[2].iteration).toBe(3);
  });

  it("stores branch_selection_policy", () => {
    const pool = mod.buildDraftPoolPlan({
      num_drafts: 2,
      branch_selection_policy: "roulette",
    });
    expect(pool.branch_selection_policy).toBe("roulette");
  });

  it("sets best_branch_id to first draft", () => {
    const pool = mod.buildDraftPoolPlan({
      num_drafts: 3,
      branch_selection_policy: "best",
    });
    expect(pool.best_branch_id).toBe(pool.active_drafts[0].branch_id);
  });

  it("handles num_drafts of 1", () => {
    const pool = mod.buildDraftPoolPlan({
      num_drafts: 1,
      branch_selection_policy: "best",
    });
    expect(pool.num_drafts).toBe(1);
    expect(pool.active_drafts.length).toBe(1);
  });
});

describe("selectNextBranch", () => {
  let mod: any;
  beforeAll(async () => { mod = await importSubagentPool(); });

  it("returns pending draft when no completed drafts", () => {
    const drafts = [
      { branch_id: "draft-1", iteration: 1, metric_value: "10", status: "pending" },
      { branch_id: "draft-2", iteration: 2, metric_value: "20", status: "pending" },
    ];
    const next = mod.selectNextBranch(drafts, "best", "lower");
    expect(next).toBe("draft-1");
  });

  it("selects best for lower direction", () => {
    const drafts = [
      { branch_id: "draft-1", iteration: 1, metric_value: "10", status: "completed" },
      { branch_id: "draft-2", iteration: 2, metric_value: "5", status: "completed" },
      { branch_id: "draft-3", iteration: 3, metric_value: "20", status: "completed" },
    ];
    const next = mod.selectNextBranch(drafts, "best", "lower");
    expect(next).toBe("draft-2");
  });

  it("selects best for higher direction", () => {
    const drafts = [
      { branch_id: "draft-1", iteration: 1, metric_value: "10", status: "completed" },
      { branch_id: "draft-2", iteration: 2, metric_value: "5", status: "completed" },
      { branch_id: "draft-3", iteration: 3, metric_value: "20", status: "completed" },
    ];
    const next = mod.selectNextBranch(drafts, "best", "higher");
    expect(next).toBe("draft-3");
  });

  it("returns first pending when drafts have no metric values", () => {
    const drafts = [
      { branch_id: "draft-1", iteration: 1, metric_value: undefined, status: "completed" },
      { branch_id: "draft-2", iteration: 2, status: "pending" },
    ];
    const next = mod.selectNextBranch(drafts, "best", "lower");
    expect(next).toBe("draft-2");
  });

  it("returns undefined when no drafts exist", () => {
    const drafts: any[] = [];
    const next = mod.selectNextBranch(drafts, "best", "lower");
    expect(next).toBeUndefined();
  });

  it("handles non-numeric metric values", () => {
    const drafts = [
      { branch_id: "draft-1", iteration: 1, metric_value: "abc", status: "completed" },
      { branch_id: "draft-2", iteration: 2, metric_value: "xyz", status: "completed" },
    ];
    const next = mod.selectNextBranch(drafts, "best", "lower");
    expect(next).toBeDefined();
  });

  it("considers only completed drafts for best selection", () => {
    const drafts = [
      { branch_id: "draft-1", iteration: 1, metric_value: "100", status: "pending" },
      { branch_id: "draft-2", iteration: 2, metric_value: "10", status: "completed" },
      { branch_id: "draft-3", iteration: 3, metric_value: "5", status: "completed" },
    ];
    const next = mod.selectNextBranch(drafts, "best", "lower");
    expect(next).toBe("draft-3");
  });
});