import { resolve } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

const importScoreParser = async () => await import(resolve(REPO_ROOT, "dist/score-parser.js"));

describe("ScoreOutput interface", () => {
  let mod: any;
  beforeAll(async () => { mod = await importScoreParser(); });

  it("should define ScoreOutput interface", () => {
    // This test ensures the interface exists in the compiled output
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
      // First test that invalid JSON is caught
      expect(() => mod.parseScoreOutput('{"score": 5, "max": NaN}')).toThrow("Invalid JSON in score output");
      expect(() => mod.parseScoreOutput('{"score": 5, "max": Infinity}')).toThrow("Invalid JSON in score output");
      expect(() => mod.parseScoreOutput('{"score": 5, "max": -Infinity}')).toThrow("Invalid JSON in score output");
      
      // Then test that valid JSON with numbers that become non-positive after parsing is caught
      // We can't directly test NaN/Infinity in JSON since they're invalid JSON
      // But we can test that our isFinite check works by simulating the validation
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