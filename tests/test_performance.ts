import { resolve } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

describe("Performance Benchmarks", () => {
  it("parses 1000 iterations in under 100ms", async () => {
    const { parseTsvFile } = await import(resolve(REPO_ROOT, "dist/helpers.js"));
    const lines = ["timestamp\titeration\tdecision\tmetric_value\tverify_status\tguard_status\thypothesis\tchange_summary\tlabels\tnote"];
    for (let i = 1; i <= 1000; i++) {
      lines.push(`2024-01-01T00:00:00Z\t${i}\tkeep\t${i}\tpass\tpass\thyp\tchange\tlabel\tnote`);
    }
    const tsv = lines.join("\n");
    
    const start = performance.now();
    const result = parseTsvFile(tsv);
    const elapsed = performance.now() - start;
    
    expect(result.length).toBe(1000);
    expect(elapsed).toBeLessThan(100);
  });

  it("builds subagent pool in under 150ms", async () => {
    const { buildSubagentPoolPlan } = await import(resolve(REPO_ROOT, "dist/subagent-pool.js"));
    
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      buildSubagentPoolPlan({ goal: "test goal", mode: "foreground" });
    }
    const elapsed = performance.now() - start;
    
    expect(elapsed).toBeLessThan(150);
  });

  it("resolves paths in under 100ms", async () => {
    const { resolvePath } = await import(resolve(REPO_ROOT, "dist/helpers.js"));
    
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      resolvePath(undefined, "rel/path", "default.txt");
    }
    const elapsed = performance.now() - start;
    
    expect(elapsed).toBeLessThan(100);
  });

  it("normalizes labels in under 50ms", async () => {
    const { normalizeLabels } = await import(resolve(REPO_ROOT, "dist/helpers.js"));
    
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      normalizeLabels(["a", "b", "c", "a", "b", "c"]);
    }
    const elapsed = performance.now() - start;
    
    expect(elapsed).toBeLessThan(50);
  });

  it("counts TSV rows in under 5ms", async () => {
    const { countTsvDataRows } = await import(resolve(REPO_ROOT, "dist/helpers.js"));
    const tsv = "header\n" + Array(1000).fill("row").join("\n");
    
    const start = performance.now();
    const result = countTsvDataRows(tsv);
    const elapsed = performance.now() - start;
    
    expect(result).toBe(1000);
    expect(elapsed).toBeLessThan(5);
  });

  it("builds wizard summary in under 200ms", async () => {
    const { buildSetupSummary } = await import(resolve(REPO_ROOT, "dist/wizard.js"));
    
    const start = performance.now();
    for (let i = 0; i < 100; i++) {
      buildSetupSummary(REPO_ROOT, { goal: "test goal", verify: "npm test" });
    }
    const elapsed = performance.now() - start;
    
    expect(elapsed).toBeLessThan(200);
  });
});
