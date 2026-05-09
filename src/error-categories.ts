export type ErrorKind =
  | "validation"
  | "configuration"
  | "execution"
  | "state"
  | "filesystem"
  | "network"
  | "unknown";

export interface StructuredError {
  kind: ErrorKind;
  code: string;
  message: string;
  details?: Record<string, unknown>;
  recoverable: boolean;
}

export const ERROR_CODES: Record<ErrorKind, Record<string, string>> = {
  validation: {
    INVALID_GOAL: "Goal must be a non-empty string",
    INVALID_METRIC: "Metric must be a non-empty string",
    INVALID_DIRECTION: "Direction must be 'lower' or 'higher'",
    INVALID_VERIFY_COMMAND: "Verify command must be a non-empty string",
    INVALID_BRANCH_POLICY: "Branch policy must be one of: best, roulette, diverse",
    INVALID_ITERATIONS: "Iterations must be a positive integer",
  },
  configuration: {
    MISSING_CONFIG: "Required configuration is missing",
    INVALID_CONFIG: "Configuration value is invalid",
    PLUGIN_NOT_FOUND: "Plugin manifest not found",
    VERSION_MISMATCH: "Version mismatch detected",
  },
  execution: {
    VERIFY_FAILED: "Verification command failed",
    GUARD_FAILED: "Guard command failed",
    SCORER_FAILED: "Scorer command failed",
    SUBAGENT_ERROR: "Subagent execution error",
    TIMEOUT: "Operation timed out",
  },
  state: {
    STATE_NOT_FOUND: "Run state not found. Run 'autoresearch init' first.",
    STATE_CORRUPTED: "Run state is corrupted or unreadable",
    STATE_LOCKED: "Run state is locked by another process",
    INVALID_TRANSITION: "Invalid state transition requested",
  },
  filesystem: {
    FILE_NOT_FOUND: "Required file not found",
    PERMISSION_DENIED: "Permission denied accessing file",
    DISK_FULL: "Insufficient disk space",
    PATH_INVALID: "Invalid file path",
  },
  network: {
    NPM_REGISTRY_ERROR: "Failed to reach npm registry",
    UPDATE_CHECK_FAILED: "Update check failed",
    TIMEOUT: "Network request timed out",
  },
  unknown: {
    UNKNOWN_ERROR: "An unexpected error occurred",
  },
};

export function categorizeError(error: Error): StructuredError {
  const message = error.message;

  // Validation errors
  if (message.includes("Missing required") || message.includes("Invalid")) {
    const code = Object.keys(ERROR_CODES.validation).find((k) =>
      message.toLowerCase().includes(k.toLowerCase().replace(/_/g, " ")),
    ) || "INVALID_CONFIG";

    return {
      kind: "validation",
      code,
      message,
      recoverable: true,
    };
  }

  // State errors
  if (message.includes("state") || message.includes("State")) {
    if (message.includes("not found") || message.includes("No run")) {
      return {
        kind: "state",
        code: "STATE_NOT_FOUND",
        message,
        recoverable: true,
      };
    }
    if (message.includes("corrupt")) {
      return {
        kind: "state",
        code: "STATE_CORRUPTED",
        message,
        recoverable: false,
      };
    }
  }

  // Filesystem errors
  if (message.includes("ENOENT") || message.includes("not found") || message.includes("Permission")) {
    return {
      kind: "filesystem",
      code: message.includes("Permission") ? "PERMISSION_DENIED" : "FILE_NOT_FOUND",
      message,
      recoverable: message.includes("Permission"),
    };
  }

  // Execution errors
  if (message.includes("failed") || message.includes("timeout") || message.includes("Timed out")) {
    return {
      kind: "execution",
      code: message.includes("timeout") ? "TIMEOUT" : "VERIFY_FAILED",
      message,
      recoverable: true,
    };
  }

  // Default to unknown
  return {
    kind: "unknown",
    code: "UNKNOWN_ERROR",
    message,
    recoverable: false,
  };
}

export function formatStructuredError(error: StructuredError, useJson = false): string {
  if (useJson) {
    return JSON.stringify({
      error: {
        kind: error.kind,
        code: error.code,
        message: error.message,
        recoverable: error.recoverable,
        details: error.details,
      },
    });
  }

  const recoverableStr = error.recoverable ? "(recoverable)" : "(fatal)";
  return `[${error.kind}:${error.code}] ${error.message} ${recoverableStr}`;
}
