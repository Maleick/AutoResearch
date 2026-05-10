type JsonSerializationContext = "root" | "array" | "object";

function stableJsonStringifyValue(
  value: unknown,
  space: number | undefined,
  context: JsonSerializationContext,
): string | undefined {
  if (value === undefined || typeof value === "function" || typeof value === "symbol") {
    return context === "array" || context === "root" ? "null" : undefined;
  }

  if (value === null) {
    return "null";
  }

  if (Array.isArray(value)) {
    const items = Array.from({ length: value.length }, (_, index) => {
      return stableJsonStringifyValue(value[index], space, "array") ?? "null";
    });
    return "[" + items.join(",") + "]";
  }

  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const entries = keys.flatMap((key) => {
      const v = stableJsonStringifyValue((value as Record<string, unknown>)[key], space, "object");
      if (v === undefined) {
        return [];
      }

      const k = JSON.stringify(key);
      return `${k}:${space ? " " : ""}${v}`;
    });

    if (space) {
      const innerIndent = " ".repeat(space);
      const inner = entries.map((e) => innerIndent + e).join(",\n");
      return "{\n" + inner + "\n}";
    }

    return "{" + entries.join(",") + "}";
  }

  return JSON.stringify(value);
}

export function stableJsonStringify(value: unknown, space?: number): string {
  return stableJsonStringifyValue(value, space, "root") ?? "null";
}

export function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

export function validateDeterministicJson(json: string): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  if (json.includes("\r")) {
    issues.push("Contains CR line endings (use LF only)");
  }

  try {
    const parsed = JSON.parse(json);
    const stable = stableJsonStringify(parsed);
    const stableParsed = JSON.parse(stable);
    if (JSON.stringify(parsed) !== JSON.stringify(stableParsed)) {
      issues.push("JSON keys are not sorted or contain non-deterministic ordering");
    }
  } catch {
    issues.push("Failed to parse JSON");
    return { valid: false, issues };
  }

  return { valid: issues.length === 0, issues };
}

export function stableJsonWrite(value: unknown): string {
  return stableJsonStringify(value, 2) + "\n";
}
