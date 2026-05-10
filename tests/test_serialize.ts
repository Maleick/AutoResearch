import { stableJsonStringify, stableJsonWrite, validateDeterministicJson, normalizeLineEndings } from "../src/serialize.js";

describe("Serialize", () => {
  describe("stableJsonStringify", () => {
    it("sorts object keys", () => {
      const obj = { z: 1, a: 2, m: 3 };
      const out = stableJsonStringify(obj);
      expect(out).toBe('{"a":2,"m":3,"z":1}');
    });

    it("handles nested objects", () => {
      const obj = { b: { y: 1, x: 2 }, a: 1 };
      const out = stableJsonStringify(obj);
      expect(out).toBe('{"a":1,"b":{"x":2,"y":1}}');
    });

    it("handles arrays", () => {
      const arr = [3, 1, 2];
      const out = stableJsonStringify(arr);
      expect(out).toBe("[3,1,2]");
    });

    it("applies spacing", () => {
      const obj = { z: 1 };
      const out = stableJsonStringify(obj, 2);
      expect(out).toBe('{\n  "z": 1\n}');
    });

    it("handles null and primitives", () => {
      expect(stableJsonStringify(null)).toBe("null");
      expect(stableJsonStringify(42)).toBe("42");
      expect(stableJsonStringify("hello")).toBe('"hello"');
    });
  });

  describe("stableJsonWrite", () => {
    it("produces LF-terminated JSON", () => {
      const out = stableJsonWrite({ a: 1 });
      expect(out.endsWith("\n")).toBe(true);
      expect(out).not.toContain("\r");
    });
  });

  describe("normalizeLineEndings", () => {
    it("converts CRLF to LF", () => {
      expect(normalizeLineEndings("a\r\nb")).toBe("a\nb");
    });

    it("converts CR to LF", () => {
      expect(normalizeLineEndings("a\rb")).toBe("a\nb");
    });
  });

  describe("validateDeterministicJson", () => {
    it("validates sorted keys", () => {
      const result = validateDeterministicJson('{"a":1,"b":2}\n');
      expect(result.valid).toBe(true);
    });

    it("flags unsorted keys", () => {
      const result = validateDeterministicJson('{"b":2,"a":1}\n');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes("not sorted"))).toBe(true);
    });

    it("flags CR line endings", () => {
      const result = validateDeterministicJson('{"a":1}\r\n');
      expect(result.valid).toBe(false);
      expect(result.issues.some((i) => i.includes("CR"))).toBe(true);
    });

    it("handles invalid JSON", () => {
      const result = validateDeterministicJson("not json");
      expect(result.valid).toBe(false);
    });
  });
});
