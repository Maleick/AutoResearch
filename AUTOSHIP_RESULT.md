# A6: Standardize score script contract - Implementation Complete

## Summary
Successfully implemented a standardized score script contract for AutoResearch with:
1. A `ScoreOutput` interface defining the required `score` and `max` fields plus optional `components`, `diagnostics`, and `details` fields
2. A `parseScoreOutput` function that validates and parses score script output according to the contract
3. Comprehensive test suite covering valid and invalid cases

## Changes Made

### 1. Created `src/score-parser.ts`
- Defined `ScoreOutput` interface with:
  - Required `score`: number (current score value)
  - Required `max`: number (maximum possible score, must be positive)
  - Optional `components`: Record<string, number> (component breakdown)
  - Optional `diagnostics`: Record<string, unknown> (diagnostic information)
  - Optional `details`: Record<string, unknown> (additional details)
- Implemented `parseScoreOutput` function that:
  - Validates input is a non-empty string
  - Parses JSON and throws descriptive errors for invalid JSON
  - Validates required fields exist and have correct types
  - Validates optional fields if present
  - Returns properly typed ScoreOutput object

### 2. Updated `src/index.ts`
- Exported `parseScoreOutput` function
- Exported `ScoreOutput` type
- Made the score parsing functionality available to other modules

### 3. Created `tests/test_score_parser.ts`
- Comprehensive test suite with 19 test cases covering:
  - Valid inputs: minimal score output, all optional fields, integer/float values, whitespace handling
  - Invalid inputs: non-string inputs, empty string, invalid JSON, non-object JSON
  - Field validation: missing/non-numeric score, missing/non-positive max
  - Optional field validation: invalid components, diagnostics, details
  - Edge cases: NaN, Infinity values (caught as invalid JSON)

### 4. Verified Implementation
- All tests pass (495/495 tests)
- Type checking passes with no errors
- Build succeeds without warnings
- Export verification: functions properly exported from index.ts

## Acceptance Criteria Verification

✅ **Require JSON schema with at least `score` and `max` fields**
- Implemented in `ScoreOutput` interface
- Enforced by `parseScoreOutput` function validation

✅ **Allow optional `components`, `diagnostics`, and `details` fields**
- Defined as optional in `ScoreOutput` interface
- Properly validated when present in `parseScoreOutput` function

✅ **Implement parser tests with malformed-score and valid-score cases**
- Created comprehensive test suite in `tests/test_score_parser.ts`
- Tests cover both valid score outputs and various malformed cases
- All 19 tests pass

## Technical Details

The implementation follows these principles:
- **Fail-fast validation**: Throws descriptive `AutoresearchError` for any validation failure
- **Type safety**: Full TypeScript support with proper typing throughout
- **Backward compatibility**: Only adds validation, doesn't change existing valid score formats
- **Clear error messages**: Each validation failure provides specific guidance on what went wrong

## Usage Example

```typescript
import { parseScoreOutput, type ScoreOutput } from '@opencode-autoresearch/core';

// Valid minimal score
const result1 = parseScoreOutput('{"score": 7, "max": 10}');
// result1: { score: 7, max: 10, components: undefined, diagnostics: undefined, details: undefined }

// Valid with all fields
const result2 = parseScoreOutput('{"score": 8.5, "max": 10, "components": {"accuracy": 0.8}, "diagnostics": {"note": "good"}, "details": {"method": "test"}}');
// result2 includes all parsed fields

// Invalid cases throw descriptive errors
parseScoreOutput('{"score": "invalid", "max": 10}'); 
// Throws: "Score output must contain a numeric 'score' field"
```

## Files Modified
- `src/score-parser.ts` (new)
- `src/index.ts` (modified)
- `tests/test_score_parser.ts` (new)

All changes are limited to the scope of standardizing the score script contract as specified in issue #40.