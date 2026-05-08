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
export declare function parseScoreOutput(output: string): ScoreOutput;
//# sourceMappingURL=score-parser.d.ts.map