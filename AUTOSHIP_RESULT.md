# AutoShip Result: Issue #41 - A7: Add dual-metric support for outcome and instrumentation

## Summary
Implemented dual-metric support allowing separation of real optimization objectives from measurement quality/risk metrics.

## Changes Made

### Core Implementation

1. **types.ts** - Added new fields to interfaces:
   - `RunConfig`: Added `outcome_metric`, `outcome_direction`, `instrument_metric`, `instrument_direction`
   - `RunState`: Added optional `instrument_metric` field
   - `LastIteration`: Added `instrument_value` field
   - `SupervisorSnapshot`: Added `instrument_metric` field

2. **run-manager.ts** - Updated to handle dual metrics:
   - TSV header now includes `instrument_value` column
   - `appendIteration` accepts optional `instrumentValue` parameter
   - `makeStatePayload` creates instrument_metric when provided
   - `buildSupervisorSnapshot` includes instrument_metric in output

3. **cli.ts** - Added CLI support:
   - New options: `--outcome-metric`, `--outcome-direction`, `--instrument-metric`, `--instrument-direction`
   - Updated `init`, `launch`, and `record` commands to support dual metrics

4. **task-schema.ts** - Added schema support:
   - Added optional `instrument_metric` to `TaskContext`
   - Updated `createTaskContext` to accept optional `instrument_metric`

5. **translators/cli.ts** - Updated translator:
   - `taskContextFromRunConfig` handles outcome and instrument metrics
   - `runConfigFromTaskContext` preserves both metrics

### Documentation

6. **docs/DUAL_METRICS.md** - New anti-gaming patterns documentation covering:
   - Why dual metrics matter
   - CLI usage examples
   - Safe anti-gaming patterns (independent verification, complementary metrics, label requirements, etc.)
   - Decision logic explanation

## Test Results

- TypeScript typecheck: PASSED
- Build: PASSED
- Tests: 476 passed, 0 failed

## Usage Example

```bash
# Initialize with dual metrics
autoresearch init \
  --goal "improve response time" \
  --outcome-metric "p95_latency_ms" \
  --outcome-direction "lower" \
  --instrument-metric "sample_size" \
  --instrument-direction "higher" \
  --verify "npm test"

# Record iteration with both metrics
autoresearch record \
  --decision keep \
  --metric-value "45" \
  --instrument-value "1000" \
  --verify-status pass
```

## Acceptance Criteria Met

- [x] Support `outcome_metric` and `instrument_metric` in run config
- [x] Prioritize outcome metric for keep decisions and surface instrument metric separately
- [x] Document safe anti-gaming patterns in docs