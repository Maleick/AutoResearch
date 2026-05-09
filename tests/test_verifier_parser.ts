import { resolve } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

async function importPackageApi() {
  return await import(resolve(REPO_ROOT, "dist/index.js"));
}

describe("Verifier output parser", () => {
  let mod: any;
  beforeAll(async () => { mod = await importPackageApi(); });

  function verifierOutput(overrides: Record<string, unknown> = {}) {
    return JSON.stringify({
      is_bug: false,
      summary: "change is acceptable",
      metric: "tests",
      confidence: 1,
      evidence: ["tests pass"],
      ...overrides,
    });
  }

  it("treats an accepted verifier decision as safe to apply", () => {
    const result = mod.parseVerifierOutput(verifierOutput({ decision: "keep" }));

    expect(result.valid).toBe(true);
    expect(mod.determineDecision(result.output)).toBe("keep");
    expect(mod.isSafeToApply(result)).toBe(true);
  });

  it("does not apply explicit discard decisions", () => {
    const result = mod.parseVerifierOutput(verifierOutput({
      is_bug: true,
      summary: "bad",
      evidence: ["fails"],
      decision: "discard",
    }));

    expect(result.valid).toBe(true);
    expect(mod.determineDecision(result.output)).toBe("discard");
    expect(mod.isSafeToApply(result)).toBe(false);
  });

  it("does not apply verifier outputs that imply discard from is_bug", () => {
    const result = mod.parseVerifierOutput(verifierOutput({
      is_bug: true,
      summary: "regression detected",
      evidence: ["regression fails"],
    }));

    expect(result.valid).toBe(true);
    expect(mod.determineDecision(result.output)).toBe("discard");
    expect(mod.isSafeToApply(result)).toBe(false);
  });

  it("does not apply verifier outputs that require human review", () => {
    const result = mod.parseVerifierOutput(verifierOutput({ decision: "needs_human" }));

    expect(result.valid).toBe(true);
    expect(mod.determineDecision(result.output)).toBe("needs_human");
    expect(mod.isSafeToApply(result)).toBe(false);
  });
});
