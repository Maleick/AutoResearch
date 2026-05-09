# Example 1: Test Coverage Improvement

**Goal:** Increase test coverage from 65% to 80%
**Metric:** `coverage_pct` (direction: higher)
**Verify:** `npm run test:coverage`
**Guard:** `npm run typecheck`

## Scenario

A mid-sized TypeScript project with legacy code and incomplete test coverage. The goal is to methodically improve test coverage by identifying uncovered modules and adding targeted tests.

## Expected Outcome

- Iterations: 8
- Best coverage: 81.2%
- Kept: 5, Discarded: 3

## Run Initialization

```bash
autoresearch init \
  --goal "Increase test coverage from 65% to 80%" \
  --metric "coverage_pct" \
  --direction "higher" \
  --verify "npm run test:coverage" \
  --guard "npm run typecheck" \
  --iterations 20
```

## Files

- [state.json](./state.json) — Run checkpoint at iteration 8
- [results.tsv](./results.tsv) — Iteration log with decisions
- [report.md](./report.md) — End-of-run summary