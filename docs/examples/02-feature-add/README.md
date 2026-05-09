# Example 2: New Feature Implementation

**Goal:** Add dark mode toggle to React dashboard
**Metric:** `lighthouse_performance` (direction: higher)
**Verify:** `lighthouse --quiet --output json | jq '.categories.performance.score'`
**Guard:** `npm run typecheck && npm run lint`

## Scenario

A React dashboard needs a dark mode toggle. AutoResearch iterates through implementation approaches, testing each with Lighthouse performance scores to ensure the toggle doesn't degrade performance.

## Expected Outcome

- Iterations: 6
- Best performance: 0.92
- Kept: 3, Discarded: 3

## Run Initialization

```bash
autoresearch init \
  --goal "Add dark mode toggle to React dashboard without degrading performance" \
  --metric "lighthouse_performance" \
  --direction "higher" \
  --verify "lighthouse --quiet --output json | jq '.categories.performance.score'" \
  --guard "npm run typecheck && npm run lint" \
  --iterations 15
```

## Files

- [state.json](./state.json) — Run checkpoint at completion
- [results.tsv](./results.tsv) — Iteration log with decisions
- [report.md](./report.md) — End-of-run summary