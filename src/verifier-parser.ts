export type VerifierDecision = "keep" | "discard" | "needs_human";

export interface VerifierOutput {
  is_bug: boolean;
  summary: string;
  metric: string;
  confidence: number;
  evidence: string[];
  decision?: VerifierDecision;
  reason?: string;
}

export interface ValidationResult {
  valid: boolean;
  output?: VerifierOutput;
  blocker_reason?: string;
}

const VALID_CONFIDENCE_VALUES = [0, 0.25, 0.5, 0.75, 1.0];

export function parseVerifierOutput(output: string): ValidationResult {
  if (typeof output !== "string") {
    return {
      valid: false,
      blocker_reason: "Verifier output must be a non-empty string",
    };
  }

  const trimmedOutput = output.trim();
  if (!trimmedOutput) {
    return {
      valid: false,
      blocker_reason: "Verifier output must be a non-empty string",
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmedOutput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      valid: false,
      blocker_reason: `Invalid JSON in verifier output: ${message}`,
    };
  }

  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    return {
      valid: false,
      blocker_reason: "Verifier output must be a JSON object",
    };
  }

  const obj = parsed as Record<string, unknown>;

  if (!("is_bug" in obj)) {
    return {
      valid: false,
      blocker_reason: "Verifier output missing required field: is_bug",
    };
  }

  if (typeof obj.is_bug !== "boolean") {
    return {
      valid: false,
      blocker_reason: "Verifier output field 'is_bug' must be a boolean",
    };
  }

  if (!("summary" in obj)) {
    return {
      valid: false,
      blocker_reason: "Verifier output missing required field: summary",
    };
  }

  if (typeof obj.summary !== "string") {
    return {
      valid: false,
      blocker_reason: "Verifier output field 'summary' must be a string",
    };
  }

  if (!("metric" in obj)) {
    return {
      valid: false,
      blocker_reason: "Verifier output missing required field: metric",
    };
  }

  if (typeof obj.metric !== "string") {
    return {
      valid: false,
      blocker_reason: "Verifier output field 'metric' must be a string",
    };
  }

  if (!("confidence" in obj)) {
    return {
      valid: false,
      blocker_reason: "Verifier output missing required field: confidence",
    };
  }

  if (typeof obj.confidence !== "number" || !isFinite(obj.confidence)) {
    return {
      valid: false,
      blocker_reason: "Verifier output field 'confidence' must be a finite number",
    };
  }

  if (!VALID_CONFIDENCE_VALUES.includes(obj.confidence)) {
    return {
      valid: false,
      blocker_reason: `Verifier output field 'confidence' must be one of: ${VALID_CONFIDENCE_VALUES.join(", ")}`,
    };
  }

  if (!("evidence" in obj)) {
    return {
      valid: false,
      blocker_reason: "Verifier output missing required field: evidence",
    };
  }

  if (!Array.isArray(obj.evidence)) {
    return {
      valid: false,
      blocker_reason: "Verifier output field 'evidence' must be an array",
    };
  }

  const evidence = obj.evidence;
  for (let i = 0; i < evidence.length; i++) {
    if (typeof evidence[i] !== "string") {
      return {
        valid: false,
        blocker_reason: `Verifier output field 'evidence[${i}]' must be a string`,
      };
    }
  }

  let decision: VerifierDecision | undefined;
  if ("decision" in obj && obj.decision !== undefined) {
    if (typeof obj.decision !== "string") {
      return {
        valid: false,
        blocker_reason: "Verifier output field 'decision' must be a string",
      };
    }
    const normalizedDecision = obj.decision.toLowerCase().trim();
    if (!["keep", "discard", "needs_human"].includes(normalizedDecision)) {
      return {
        valid: false,
        blocker_reason: "Verifier output field 'decision' must be one of: keep, discard, needs_human",
      };
    }
    decision = normalizedDecision as VerifierDecision;
  }

  let reason: string | undefined;
  if ("reason" in obj && obj.reason !== undefined) {
    if (typeof obj.reason !== "string") {
      return {
        valid: false,
        blocker_reason: "Verifier output field 'reason' must be a string",
      };
    }
    reason = obj.reason;
  }

  return {
    valid: true,
    output: {
      is_bug: obj.is_bug as boolean,
      summary: obj.summary as string,
      metric: obj.metric as string,
      confidence: obj.confidence as number,
      evidence: obj.evidence as string[],
      decision,
      reason,
    },
  };
}

export function determineDecision(output: VerifierOutput): VerifierDecision {
  if (output.decision) {
    return output.decision;
  }

  if (output.is_bug) {
    return "discard";
  }

  return "keep";
}

export function isSafeToApply(result: ValidationResult): boolean {
  return (
    result.valid
    && result.output !== undefined
    && determineDecision(result.output) === "keep"
  );
}
