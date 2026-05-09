# Example Gallery

Reproducible Auto Research run examples with complete artifacts.

## Available Examples

| Example | Goal | Metric | Iterations | Outcome |
|---------|------|--------|-------------|---------|
| [01: Test Coverage](./01-test-coverage/) | Increase test coverage from 65% to 80% | `coverage_pct` (higher) | 8 | 81.2% achieved |
| [02: Feature Add](./02-feature-add/) | Add dark mode toggle without degrading performance | `lighthouse_performance` (higher) | 6 | 0.92 score |
| [03: Performance Optimization](./03-perf-optimization/) | Reduce API P99 latency from 450ms to under 200ms | `p99_latency_ms` (lower) | 12 | 187ms achieved |

## What You'll Find

Each example includes:

- **README.md** — Scenario description, run initialization command, expected outcomes
- **state.json** — Run checkpoint showing full state at completion
- **results.tsv** — Iteration-by-iteration log with decisions and metrics
- **report.md** — End-of-run summary with key learnings

## Using These Examples

1. **Understand the loop** — See how each iteration is verified mechanically
2. **Learn from patterns** — Review kept vs. discarded decisions
3. **Reproduce locally** — Run the initialization command to recreate the scenario
4. **Study artifacts** — Examine state.json, results.tsv, and report.md formats

## Add Your Own

To add an example:
1. Run a successful Auto Research iteration
2. Copy relevant artifacts to `docs/examples/XX-name/`
3. Add entry to this index with brief description