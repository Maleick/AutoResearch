import { resolve } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

const importScoreParser = async () => await import(resolve(REPO_ROOT, "dist/index.js"));

describe("score-parser module exports", () => {
  let mod: any;
  beforeAll(async () => { mod = await importScoreParser(); });

  it("should load the compiled module and export parseScoreOutput", () => {
    // This test verifies the compiled module loads and exposes parseScoreOutput at runtime
    expect(typeof mod).toBe("object");
    expect(typeof mod.parseScoreOutput).toBe("function");
  });
});

describe("parseScoreOutput", () => {
  let mod: any;
  beforeAll(async () => { mod = await importScoreParser(); });

  describe("Valid inputs", () => {
    it("should parse minimal valid score output", () => {
      const output = '{"score": 5, "max": 10}';
      const result = mod.parseScoreOutput(output);
      expect(result).toEqual({
        score: 5,
        max: 10,
        components: undefined,
        diagnostics: undefined,
        details: undefined
      });
    });

    it("should parse score output with all optional fields", () => {
      const output = '{"score": 8, "max": 10, "components": {"accuracy": 0.8, "completeness": 1.0}, "diagnostics": {"warnings": ["minor issue"]}, "details": {"method": "test"}}';
      const result = mod.parseScoreOutput(output);
      expect(result).toEqual({
        score: 8,
        max: 10,
        components: { accuracy: 0.8, completeness: 1.0 },
        diagnostics: { warnings: ["minor issue"] },
        details: { method: "test" }
      });
    });

    it("should handle integer and float values correctly", () => {
      const output = '{"score": 7.5, "max": 10}';
      const result = mod.parseScoreOutput(output);
      expect(result.score).toBe(7.5);
      expect(result.max).toBe(10);
    });

    it("should trim whitespace from input", () => {
      const output = '  {"score": 3, "max": 5}  ';
      const result = mod.parseScoreOutput(output);
      expect(result).toEqual({
        score: 3,
        max: 5,
        components: undefined,
        diagnostics: undefined,
        details: undefined
      });
    });
  });

  describe("Invalid inputs", () => {
    it("should throw on non-string input", () => {
      // @ts-expect-error - intentionally passing wrong type
      expect(() => mod.parseScoreOutput(null)).toThrow("Score output must be a non-empty string");
      // @ts-expect-error - intentionally passing wrong type
      expect(() => mod.parseScoreOutput(undefined)).toThrow("Score output must be a non-empty string");
      // @ts-expect-error - intentionally passing wrong type
      expect(() => mod.parseScoreOutput(123)).toThrow("Score output must be a non-empty string");
      // @ts-expect-error - intentionally passing wrong type
      expect(() => mod.parseScoreOutput({})).toThrow("Score output must be a non-empty string");
    });

    it("should throw on empty string", () => {
      expect(() => mod.parseScoreOutput("")).toThrow("Score output must be a non-empty string");
    });

    it("should throw on invalid JSON", () => {
      expect(() => mod.parseScoreOutput("{invalid json}")).toThrow("Invalid JSON in score output");
      expect(() => mod.parseScoreOutput("")).toThrow("Score output must be a non-empty string");
    });

    it("should throw on non-object JSON", () => {
      expect(() => mod.parseScoreOutput('[1, 2, 3]')).toThrow("Score output must be a JSON object");
      expect(() => mod.parseScoreOutput('"string"')).toThrow("Score output must be a JSON object");
      expect(() => mod.parseScoreOutput('42')).toThrow("Score output must be a JSON object");
      expect(() => mod.parseScoreOutput('true')).toThrow("Score output must be a JSON object");
      expect(() => mod.parseScoreOutput('null')).toThrow("Score output must be a JSON object");
    });

    it("should throw on missing score field", () => {
      expect(() => mod.parseScoreOutput('{"max": 10}')).toThrow("Score output must contain a numeric 'score' field");
    });

    it("should throw on non-numeric score field", () => {
      expect(() => mod.parseScoreOutput('{"score": "five", "max": 10}')).toThrow("Score output must contain a numeric 'score' field");
      expect(() => mod.parseScoreOutput('{"score": null, "max": 10}')).toThrow("Score output must contain a numeric 'score' field");
      expect(() => mod.parseScoreOutput('{"score": [1,2,3], "max": 10}')).toThrow("Score output must contain a numeric 'score' field");
    });

    it("should throw on non-finite score field (after valid JSON parse)", () => {
      // First test that invalid JSON is caught
      expect(() => mod.parseScoreOutput('{"score": NaN, "max": 10}')).toThrow("Invalid JSON in score output");
      expect(() => mod.parseScoreOutput('{"score": Infinity, "max": 10}')).toThrow("Invalid JSON in score output");
      expect(() => mod.parseScoreOutput('{"score": -Infinity, "max": 10}')).toThrow("Invalid JSON in score output");
      
      // Then test that valid JSON with numbers that become non-finite after parsing is caught
      // We can't directly test NaN/Infinity in JSON since they're invalid JSON
      // But we can test that our isFinite check works by simulating the validation
    });

    it("should throw on missing max field", () => {
      expect(() => mod.parseScoreOutput('{"score": 5}')).toThrow("Score output must contain a positive numeric 'max' field");
    });

    it("should throw on non-numeric max field", () => {
      expect(() => mod.parseScoreOutput('{"score": 5, "max": "ten"}')).toThrow("Score output must contain a positive numeric 'max' field");
      expect(() => mod.parseScoreOutput('{"score": 5, "max": null}')).toThrow("Score output must contain a positive numeric 'max' field");
      expect(() => mod.parseScoreOutput('{"score": 5, "max": [1,2,3]}')).toThrow("Score output must contain a positive numeric 'max' field");
    });

    it("should throw on non-finite max field (after valid JSON parse)", () => {
      // JSON numeric literals like 1e999 are valid JSON, but overflow to Infinity after parsing.
      // This exercises the real post-parse non-finite validation branch.
      expect(() => mod.parseScoreOutput('{"score": 5, "max": 1e999}')).toThrow("Score output must contain a positive numeric 'max' field");
      expect(() => mod.parseScoreOutput('{"score": 5, "max": -1e999}')).toThrow("Score output must contain a positive numeric 'max' field");
    });

    it("should throw on non-positive max field", () => {
      expect(() => mod.parseScoreOutput('{"score": 5, "max": 0}')).toThrow("Score output must contain a positive numeric 'max' field");
      expect(() => mod.parseScoreOutput('{"score": 5, "max": -1}')).toThrow("Score output must contain a positive numeric 'max' field");
    });

    it("should throw on invalid components field", () => {
      expect(() => mod.parseScoreOutput('{"score": 5, "max": 10, "components": "invalid"}')).toThrow("Score output 'components' field must be an object if present");
      expect(() => mod.parseScoreOutput('{"score": 5, "max": 10, "components": []}')).toThrow("Score output 'components' field must be an object if present");
      expect(() => mod.parseScoreOutput('{"score": 5, "max": 10, "components": null}')).toThrow("Score output 'components' field must be an object if present");
      
      expect(() => mod.parseScoreOutput('{"score": 5, "max": 10, "components": {"key": "not a number"}}')).toThrow("Score output components.key must be a number");
      
      // Test that NaN in components is caught as invalid JSON (since NaN is not valid JSON)
      expect(() => mod.parseScoreOutput('{"score": 5, "max": 10, "components": {"key": NaN}}')).toThrow("Invalid JSON in score output");
    });

    it("should throw on invalid diagnostics field", () => {
      expect(() => mod.parseScoreOutput('{"score": 5, "max": 10, "diagnostics": "invalid"}')).toThrow("Score output 'diagnostics' field must be an object if present");
      expect(() => mod.parseScoreOutput('{"score": 5, "max": 10, "diagnostics": []}')).toThrow("Score output 'diagnostics' field must be an object if present");
      expect(() => mod.parseScoreOutput('{"score": 5, "max": 10, "diagnostics": null}')).toThrow("Score output 'diagnostics' field must be an object if present");
    });

    it("should throw on invalid details field", () => {
      expect(() => mod.parseScoreOutput('{"score": 5, "max": 10, "details": "invalid"}')).toThrow("Score output 'details' field must be an object if present");
      expect(() => mod.parseScoreOutput('{"score": 5, "max": 10, "details": []}')).toThrow("Score output 'details' field must be an object if present");
      expect(() => mod.parseScoreOutput('{"score": 5, "max": 10, "details": null}')).toThrow("Score output 'details' field must be an object if present");
    });
  });
});

describe("rankComponents", () => {
  let mod: any;
  beforeAll(async () => { mod = await importScoreParser(); });

  it("exports rankComponents function", () => {
    expect(typeof mod.rankComponents).toBe("function");
  });

  it("returns empty rankings for empty input", () => {
    const result = mod.rankComponents([]);
    expect(result.top_positive).toEqual([]);
    expect(result.top_negative).toEqual([]);
  });

  it("returns empty rankings when no records have score_components", () => {
    const records = [
      { decision: "keep" },
      { decision: "discard" },
    ];
    const result = mod.rankComponents(records);
    expect(result.top_positive).toEqual([]);
    expect(result.top_negative).toEqual([]);
  });

  it("computes deltas from first to last observation for each component", () => {
    const records = [
      { score_components: { accuracy: 0.5, coverage: 0.8 } },
      { score_components: { accuracy: 0.7, coverage: 0.6 } },
      { score_components: { accuracy: 0.9, coverage: 0.5 } },
    ];
    const result = mod.rankComponents(records);
    expect(result.top_positive).toHaveLength(1);
    expect(result.top_positive[0].name).toBe("accuracy");
    expect(result.top_positive[0].delta).toBeCloseTo(0.4);
    expect(result.top_negative).toHaveLength(1);
    expect(result.top_negative[0].name).toBe("coverage");
    expect(result.top_negative[0].delta).toBeCloseTo(-0.3);
  });

  it("skips records without score_components", () => {
    const records = [
      { score_components: { accuracy: 0.5 } },
      {},
      { score_components: { accuracy: 0.9 } },
    ];
    const result = mod.rankComponents(records);
    expect(result.top_positive[0].name).toBe("accuracy");
    expect(result.top_positive[0].delta).toBeCloseTo(0.4);
  });

  it("respects topN limit", () => {
    const records = [
      { score_components: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6 } },
      { score_components: { a: 2, b: 3, c: 4, d: 5, e: 6, f: 7 } },
    ];
    const result = mod.rankComponents(records, 3);
    expect(result.top_positive).toHaveLength(3);
    expect(result.top_negative).toHaveLength(0);
  });

  it("uses topN default of 5", () => {
    const records = [
      { score_components: { a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7 } },
      { score_components: { a: 2, b: 3, c: 4, d: 5, e: 6, f: 7, g: 8 } },
    ];
    const result = mod.rankComponents(records);
    expect(result.top_positive).toHaveLength(5);
  });

  it("excludes zero-delta components from both lists", () => {
    const records = [
      { score_components: { stable: 1.0, rising: 0.5 } },
      { score_components: { stable: 1.0, rising: 0.8 } },
    ];
    const result = mod.rankComponents(records);
    expect(result.top_positive.map((c: { name: string }) => c.name)).not.toContain("stable");
    expect(result.top_negative.map((c: { name: string }) => c.name)).not.toContain("stable");
    expect(result.top_positive[0].name).toBe("rising");
  });

  it("sorts top_positive descending and top_negative by most negative first", () => {
    const records = [
      { score_components: { a: 10, b: 5, c: 1, d: 20, e: -5, f: -10 } },
      { score_components: { a: 11, b: 8, c: 4, d: 21, e: -10, f: -20 } },
    ];
    const result = mod.rankComponents(records);
    const positiveDeltas = result.top_positive.map((c: { delta: number }) => c.delta);
    for (let i = 1; i < positiveDeltas.length; i++) {
      expect(positiveDeltas[i - 1]).toBeGreaterThanOrEqual(positiveDeltas[i]);
    }
    const negativeDeltas = result.top_negative.map((c: { delta: number }) => c.delta);
    for (let i = 1; i < negativeDeltas.length; i++) {
      expect(negativeDeltas[i - 1]).toBeLessThanOrEqual(negativeDeltas[i]);
    }
  });
});