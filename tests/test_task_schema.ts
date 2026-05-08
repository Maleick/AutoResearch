import { describe, it, expect } from "@jest/globals";
import { resolve } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const schema = await import(resolve(REPO_ROOT, "dist/task-schema.js"));

const { validateTaskContext } = schema;

describe("TaskContext validation", () => {
  it("accepts a complete TaskContext", () => {
    expect(
      validateTaskContext({
        id: "task-001",
        source: "api",
        goal: "improve coverage",
        metric: { name: "coverage", direction: "higher", baseline: "80" },
        verify_command: "npm test",
        constraints: {
          max_iterations: 3,
          max_duration_seconds: 600,
          required_keep_labels: ["pass"],
          required_stop_labels: ["blocked"],
        },
        iteration_policy: { mode: "foreground", stop_condition: "done" },
        metadata: { requester: "webhook" },
      })
    ).toBe(true);
  });

  it("rejects contexts missing required constraints", () => {
    expect(
      validateTaskContext({
        id: "task-002",
        source: "api",
        goal: "improve coverage",
        metric: { name: "coverage", direction: "higher" },
      })
    ).toBe(false);
  });

  it("rejects malformed constraint fields", () => {
    expect(
      validateTaskContext({
        id: "task-003",
        source: "api",
        goal: "improve coverage",
        metric: { name: "coverage", direction: "higher" },
        constraints: {
          max_iterations: "3",
          required_keep_labels: ["pass"],
        },
      })
    ).toBe(false);
  });
});
