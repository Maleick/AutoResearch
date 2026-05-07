# AutoShip Result: Issue #38

## Summary
Implemented `--max-no-progress` option that stops the loop when score does not improve for N consecutive iterations.

## Changes
- Added `max_no_progress` field to `RunConfig` and `RunState` types
- Added stop condition check in `buildSupervisorSnapshot` when `consecutive_discards >= max_no_progress`
- Added `--max-no-progress` CLI option with short flag `-p`
- Added integration test for no-progress plateau detection

## Acceptance Criteria Met
- [x] Add `--max-no-progress` option with default guard
- [x] Add stop reason reporting in status/result records (reason: "no_progress")
- [x] Add tests for repeated plateau behavior