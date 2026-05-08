import { AutoresearchError } from "./helpers.js";

/**
 * Represents the standardized score contract
 */
export interface ScoreOutput {
  /** The current score value (required) */
  score: number;
  /** The maximum possible score (required) */
  max: number;
  /** Optional component breakdown */
  components?: Record<string, number>;
  /** Optional diagnostic information */
  diagnostics?: Record<string, unknown>;
  /** Optional additional details */
  details?: Record<string, unknown>;
}

/**
 * Parses and validates score script output according to the standardized contract
 * @param output - Raw string output from a score script
 * @returns Parsed and validated ScoreOutput object
 * @throws AutoresearchError if the output is invalid
 */
export function parseScoreOutput(output: string): ScoreOutput {
  if (typeof output !== 'string') {
    throw new AutoresearchError("Score output must be a non-empty string");
  }

  const trimmedOutput = output.trim();
  if (!trimmedOutput) {
    throw new AutoresearchError("Score output must be a non-empty string");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmedOutput);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new AutoresearchError(`Invalid JSON in score output: ${message}`);
  }

  // Validate that we have an object
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AutoresearchError("Score output must be a JSON object");
  }

  const obj = parsed as Record<string, unknown>;

  // Validate required 'score' field
  if (!('score' in obj) || typeof obj.score !== 'number' || !isFinite(obj.score)) {
    throw new AutoresearchError("Score output must contain a numeric 'score' field");
  }

  // Validate required 'max' field
  if (!('max' in obj) || typeof obj.max !== 'number' || !isFinite(obj.max) || obj.max <= 0) {
    throw new AutoresearchError("Score output must contain a positive numeric 'max' field");
  }

  // Validate optional 'components' field if present
  if ('components' in obj && obj.components !== undefined) {
    if (obj.components === null || typeof obj.components !== 'object' || Array.isArray(obj.components)) {
      throw new AutoresearchError("Score output 'components' field must be an object if present");
    }
    
    // Validate that all component values are numbers
    const components = obj.components as Record<string, unknown>;
    for (const [key, value] of Object.entries(components)) {
      if (typeof value !== 'number' || !isFinite(value)) {
        throw new AutoresearchError(`Score output components.${key} must be a number`);
      }
    }
  }

  // Validate optional 'diagnostics' field if present
  if ('diagnostics' in obj && obj.diagnostics !== undefined) {
    if (obj.diagnostics === null || typeof obj.diagnostics !== 'object' || Array.isArray(obj.diagnostics)) {
      throw new AutoresearchError("Score output 'diagnostics' field must be an object if present");
    }
  }

  // Validate optional 'details' field if present
  if ('details' in obj && obj.details !== undefined) {
    if (obj.details === null || typeof obj.details !== 'object' || Array.isArray(obj.details)) {
      throw new AutoresearchError("Score output 'details' field must be an object if present");
    }
  }

  // Return the validated object with proper typing
  return {
    score: obj.score as number,
    max: obj.max as number,
    components: obj.components as Record<string, number> | undefined,
    diagnostics: obj.diagnostics as Record<string, unknown> | undefined,
    details: obj.details as Record<string, unknown> | undefined
  };
}