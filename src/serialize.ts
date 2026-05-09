export function stableJsonStringify(value: unknown, space?: number): string {
  if (value === null || value === undefined) {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    const items = value.map((item) => stableJsonStringify(item, space));
    return "[" + items.join(",") + "]";
  }

  if (typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    const entries = keys.map((key) => {
      const k = JSON.stringify(key);
      const v = stableJsonStringify((value as Record<string, unknown>)[key], space);
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
