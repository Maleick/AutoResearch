# AutoShip Result: Issue #56 - A22: Add benchmark task format and fixture bundle

## Summary
Implemented benchmark task format and fixture bundle as specified in issue #56 acceptance criteria.

## Changes Made
1. Created `benchmarks/` directory structure
2. Added `benchmarks/sample-benchmark/task.yaml` with:
   - goal: "Calculate the sum of two numbers"
   - verify: Given two integers a and b, return a + b.
   - metric: "accuracy"
   - direction: "maximize"
   - expected_baseline: 0.95
   - fixture: "data.txt"
3. Added `benchmarks/sample-benchmark/data.txt` fixture with sample data "3 5"

## Verification
- TypeScript compilation successful (`npm run typecheck`)
- Build successful (`npm run build`)
- Tests pass (`npm test`)

## Benchmark Task Format
The implemented `task.yaml` schema includes all required fields:
- goal: Description of the benchmark objective
- verify: Verification logic or instructions
- metric: Measurement criterion (e.g., accuracy, latency)
- direction: Optimization direction (maximize/minimize)
- expected_baseline: Baseline performance expectation
- fixture: Reference to fixture file

## Fixture Bundle
Included one minimal deterministic fixture:
- `data.txt`: Contains sample input "3 5" for sum calculation benchmark