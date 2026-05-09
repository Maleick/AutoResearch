# Example 3: Performance Optimization

**Goal:** Reduce API response time from 450ms to under 200ms
**Metric:** `p99_latency_ms` (direction: lower)
**Verify:** `node benchmark.js --metric p99`
**Guard:** `npm run test:integration`

## Scenario

A Node.js API endpoint has slow response times (450ms P99). AutoResearch systematically tests optimization approaches—caching, database indexing, query optimization—measuring each with real-world load testing.

## Expected Outcome

- Iterations: 12
- Best latency: 187ms
- Kept: 4, Discarded: 8

## Run Initialization

```bash
autoresearch init \
  --goal "Reduce /api/users endpoint P99 latency from 450ms to under 200ms" \
  --metric "p99_latency_ms" \
  --direction "lower" \
  --verify "node benchmark.js --metric p99" \
  --guard "npm run test:integration" \
  --iterations 20 \
  --max_no_progress 6
```

## Files

- [state.json](./state.json) — Run checkpoint at completion
- [results.tsv](./results.tsv) — Iteration log with decisions
- [report.md](./report.md) — End-of-run summary