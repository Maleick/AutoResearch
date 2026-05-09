import { categorizeError, formatStructuredError, ERROR_CODES } from "../src/error-categories.js";

describe("Error Categories", () => {
  describe("categorizeError", () => {
    it("categorizes validation errors", () => {
      const error = new Error("Missing required: --goal");
      const structured = categorizeError(error);
      expect(structured.kind).toBe("validation");
      expect(structured.recoverable).toBe(true);
    });

    it("categorizes state errors", () => {
      const error = new Error("No run state found. Run 'autoresearch init' first.");
      const structured = categorizeError(error);
      expect(structured.kind).toBe("state");
      expect(structured.code).toBe("STATE_NOT_FOUND");
      expect(structured.recoverable).toBe(true);
    });

    it("categorizes filesystem errors", () => {
      const error = new Error("ENOENT: no such file or directory");
      const structured = categorizeError(error);
      expect(structured.kind).toBe("filesystem");
      expect(structured.code).toBe("FILE_NOT_FOUND");
    });

    it("categorizes execution errors", () => {
      const error = new Error("Verification command failed");
      const structured = categorizeError(error);
      expect(structured.kind).toBe("execution");
      expect(structured.recoverable).toBe(true);
    });

    it("defaults to unknown for unrecognized errors", () => {
      const error = new Error("Something weird happened");
      const structured = categorizeError(error);
      expect(structured.kind).toBe("unknown");
      expect(structured.code).toBe("UNKNOWN_ERROR");
      expect(structured.recoverable).toBe(false);
    });
  });

  describe("formatStructuredError", () => {
    it("formats text output", () => {
      const error = {
        kind: "validation" as const,
        code: "INVALID_GOAL",
        message: "Goal is required",
        recoverable: true,
      };
      const formatted = formatStructuredError(error);
      expect(formatted).toContain("validation:INVALID_GOAL");
      expect(formatted).toContain("Goal is required");
      expect(formatted).toContain("recoverable");
    });

    it("formats JSON output", () => {
      const error = {
        kind: "state" as const,
        code: "STATE_NOT_FOUND",
        message: "State missing",
        recoverable: true,
      };
      const formatted = formatStructuredError(error, true);
      const parsed = JSON.parse(formatted);
      expect(parsed.error.kind).toBe("state");
      expect(parsed.error.code).toBe("STATE_NOT_FOUND");
    });
  });

  describe("ERROR_CODES", () => {
    it("has validation error codes", () => {
      expect(ERROR_CODES.validation.INVALID_GOAL).toBeDefined();
      expect(ERROR_CODES.validation.INVALID_DIRECTION).toBeDefined();
    });

    it("has state error codes", () => {
      expect(ERROR_CODES.state.STATE_NOT_FOUND).toBeDefined();
      expect(ERROR_CODES.state.STATE_CORRUPTED).toBeDefined();
    });
  });
});
