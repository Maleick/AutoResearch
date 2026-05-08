# Dual Metric Support: Anti-Gaming Patterns

> Safe practices for using outcome and instrument metrics in Auto Research.

## Overview

Auto Research supports two types of metrics:

| Metric Type | Purpose | Used For |
|-------------|---------|----------|
| `outcome_metric` | The real optimization objective | Keep/discard decisions |
| `instrument_metric` | Measurement quality/risk indicator | Surfaced separately for visibility |

## Why Two Metrics?

Using a single metric creates an incentive to "game" the system—optimizing the metric without achieving the actual goal. By separating the **outcome** (what you actually want) from the **instrument** (how you measure it), you can:

1. **Detect gaming**: If the instrument metric degrades while the outcome metric improves, something is wrong.
2. **Measure measurement quality**: Track confidence in your outcome measurements.
3. **Capture risk**: Surface additional signals that indicate unintended side effects.

## CLI Usage

```bash
# Initialize with dual metrics (--outcome-metric is used as the primary metric)
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
  --verify-status pass \
  --guard-status pass
```

## Anti-Gaming Patterns

### 1. Independent Verification

Always include a guard command that runs independently of your optimization:

```bash
autoresearch init \
  --goal "reduce bugs" \
  --outcome-metric "bug_count" \
  --instrument-metric "test_coverage" \
  --guard "npm run security-scan"
```

The guard catches regressions that the optimization might miss.

### 2. Complementary Metrics

Choose instrument metrics that are:
- **Harder to game**: Not directly optimizable by the same changes
- **Indicative of quality**: Correlate with actual goal achievement
- **Independent**: Not directly caused by outcome metric changes

**Good combinations:**
- Outcome: `error_rate` (lower) + Instrument: `test_coverage` (higher)
- Outcome: `response_time_p95` (lower) + Instrument: `sample_size` (higher)
- Outcome: `customer_satisfaction` (higher) + Instrument: `response_count` (higher)

**Avoid:**
- Outcome: `test_passes` + Instrument: `test_count` (both can be gamed by adding trivial tests)

### 3. Label Requirements

Require specific labels for keep decisions to prevent gaming:

```bash
autoresearch init \
  --goal "improve performance" \
  --outcome-metric "latency_ms" \
  --required-keep-labels "performance review security review" \
  --required-stop-labels "regression"
```

This ensures human verification before accepting changes.

### 4. Direction Awareness

Understand how each metric direction affects incentives:

| Direction | Gaming Risk | Mitigation |
|-----------|-------------|------------|
| `lower` | Can reduce by removing features | Guard against feature removal |
| `higher` | Can increase by adding throwaway code | Require code review labels |

### 5. Baseline Tracking

Always set a baseline to detect when metrics become unreliable:

```bash
autoresearch init \
  --goal "optimize memory" \
  --outcome-metric "memory_mb" \
  --baseline "256"
```

If the instrument metric (e.g., `sample_size`) drops significantly below baseline, the outcome measurements may be unreliable.

## Decision Logic

The keep decision is based **only** on the outcome metric:

1. Compare current `metric_value` against best recorded value
2. Direction determines if "better" is higher or lower
3. Instrument metric is recorded but not used in decision
4. Both values are logged in results for later analysis

## Viewing Metrics

```bash
# View current state with both metrics
autoresearch status

# View iteration history
autoresearch history

# Export for analysis
autoresearch export --format json
```

## Example: Performance Optimization

```bash
# Goal: Optimize API response time while maintaining test quality
autoresearch init \
  --goal "reduce API latency" \
  --outcome-metric "p95_response_ms" \
  --outcome-direction "lower" \
  --instrument-metric "test_coverage_percent" \
  --instrument-direction "higher" \
  --verify "npm test && npm run performance:benchmark" \
  --guard "npm run security:audit" \
  --required-keep-labels "performance benchmark security" \
  --max-no-progress 5
```

In this setup:
- **Keep decisions** are based on `p95_response_ms` improvements
- **Instrument metric** (`test_coverage_percent`) surfaces measurement quality
- If coverage drops while latency improves, investigate for test skipping
- Guard catches security regressions that performance optimization might introduce