import { compareMetrics, parseMetricValue, validateMetricMeasurement } from "../src/metric-comparator.js";

describe("Metric Comparator", () => {
  describe("compareMetrics", () => {
    it("prefers lower values when direction is lower", () => {
      const result = compareMetrics(
        { value: 10, direction: "lower", valid: true },
        { value: 20, direction: "lower", valid: true },
      );
      expect(result.isBetter).toBe(true);
      expect(result.isEquivalent).toBe(false);
    });

    it("prefers higher values when direction is higher", () => {
      const result = compareMetrics(
        { value: 20, direction: "higher", valid: true },
        { value: 10, direction: "higher", valid: true },
      );
      expect(result.isBetter).toBe(true);
      expect(result.isEquivalent).toBe(false);
    });

    it("marks equivalent values", () => {
      const result = compareMetrics(
        { value: 10, direction: "lower", valid: true },
        { value: 10, direction: "lower", valid: true },
      );
      expect(result.isBetter).toBe(false);
      expect(result.isEquivalent).toBe(true);
    });

    it("rejects invalid current measurement", () => {
      const result = compareMetrics(
        { value: 10, direction: "lower", valid: false, reason: "Parse error" },
        { value: 20, direction: "lower", valid: true },
      );
      expect(result.isBetter).toBe(false);
      expect(result.reason).toContain("Parse error");
    });

    it("accepts valid current over invalid baseline", () => {
      const result = compareMetrics(
        { value: 10, direction: "lower", valid: true },
        { value: 20, direction: "lower", valid: false },
      );
      expect(result.isBetter).toBe(true);
    });

    it("rejects direction mismatch", () => {
      const result = compareMetrics(
        { value: 10, direction: "lower", valid: true },
        { value: 20, direction: "higher", valid: true },
      );
      expect(result.isBetter).toBe(false);
      expect(result.reason).toContain("Direction mismatch");
    });
  });

  describe("parseMetricValue", () => {
    it("parses valid numbers", () => {
      expect(parseMetricValue("42")).toBe(42);
      expect(parseMetricValue(42)).toBe(42);
      expect(parseMetricValue("3.14")).toBe(3.14);
    });

    it("returns null for invalid values", () => {
      expect(parseMetricValue("")).toBeNull();
      expect(parseMetricValue(null)).toBeNull();
      expect(parseMetricValue(undefined)).toBeNull();
      expect(parseMetricValue("abc")).toBeNull();
      expect(parseMetricValue(NaN)).toBeNull();
    });
  });

  describe("validateMetricMeasurement", () => {
    it("creates valid measurement for good inputs", () => {
      const m = validateMetricMeasurement("42", "lower");
      expect(m.valid).toBe(true);
      expect(m.value).toBe(42);
      expect(m.direction).toBe("lower");
      expect(m.reason).toBeUndefined();
    });

    it("creates invalid measurement for bad inputs", () => {
      const m = validateMetricMeasurement("abc", "lower");
      expect(m.valid).toBe(false);
      expect(m.reason).toContain("Invalid measurement");
    });

    it("defaults invalid direction to lower", () => {
      const m = validateMetricMeasurement("42", "invalid");
      expect(m.valid).toBe(false);
      expect(m.direction).toBe("lower");
    });
  });
});
