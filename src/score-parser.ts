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

/**
 * A ranked component entry showing its name and net delta across a run.
 */
export interface ComponentDelta {
  /** Component name */
  name: string;
  /** Net change: last observed value minus first observed value */
  delta: number;
}

/**
 * Result of ranking components for a run.
 */
export interface ComponentRanking {
  /** Components with the most negative delta (largest decreases), sorted ascending by delta value (most negative first) */
  top_negative: ComponentDelta[];
  /** Components with the most positive delta (largest increases), sorted descending by delta value (most positive first) */
  top_positive: ComponentDelta[];
}

/**
 * Ranks score components across a sequence of score history records by their
 * net change from first to last observed value.
 *
 * Records without a `score_components` field are skipped. The function returns
 * the `topN` largest positive and negative deltas.
 *
 * @param records - Array of score history records, each optionally containing
 *   a `score_components` map.
 * @param topN - Maximum number of entries in each ranking list (default: 5).
 * @returns ComponentRanking with top_negative and top_positive lists.
 */
export function rankComponents(
  records: Array<{ score_components?: Record<string, number> }>,
  topN: number = 5,
): ComponentRanking {
  const first: Record<string, number> = {};
  const last: Record<string, number> = {};

  for (const rec of records) {
    if (rec.score_components == null) continue;
    for (const [name, value] of Object.entries(rec.score_components)) {
      if (!(name in first)) first[name] = value;
      last[name] = value;
    }
  }

  const deltas: ComponentDelta[] = Object.keys(first).map((name) => ({
    name,
    delta: (last[name] ?? first[name]) - first[name],
  }));

  const positive = deltas
    .filter((d) => d.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, topN);

  const negative = deltas
    .filter((d) => d.delta < 0)
    .sort((a, b) => a.delta - b.delta)
    .slice(0, topN);

  return { top_negative: negative, top_positive: positive };
}