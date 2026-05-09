export interface MetricMeasurement {
  value: number;
  direction: "lower" | "higher";
  valid: boolean;
  reason?: string;
}

export interface ComparisonResult {
  isBetter: boolean;
  isEquivalent: boolean;
  reason: string;
}

export function compareMetrics(
  current: MetricMeasurement,
  baseline: MetricMeasurement,
): ComparisonResult {
  if (!current.valid) {
    return {
      isBetter: false,
      isEquivalent: false,
      reason: current.reason || "Current measurement is invalid",
    };
  }

  if (!baseline.valid) {
    return {
      isBetter: true,
      isEquivalent: false,
      reason: "Baseline measurement is invalid; current is valid",
    };
  }

  if (current.direction !== baseline.direction) {
    return {
      isBetter: false,
      isEquivalent: false,
      reason: `Direction mismatch: current=${current.direction}, baseline=${baseline.direction}`,
    };
  }

  const diff = current.value - baseline.value;
  const epsilon = 1e-10;

  if (Math.abs(diff) < epsilon) {
    return {
      isBetter: false,
      isEquivalent: true,
      reason: `Values are equivalent (${current.value} ≈ ${baseline.value})`,
    };
  }

  const isBetter = current.direction === "lower" ? diff < 0 : diff > 0;

  return {
    isBetter,
    isEquivalent: false,
    reason: isBetter
      ? `${current.value} is better than ${baseline.value} (${current.direction})`
      : `${current.value} is worse than ${baseline.value} (${current.direction})`,
  };
}

export function parseMetricValue(value: unknown): number | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function validateMetricMeasurement(
  value: unknown,
  direction: unknown,
): MetricMeasurement {
  const parsedValue = parseMetricValue(value);
  const valid = parsedValue !== null && (direction === "lower" || direction === "higher");

  return {
    value: parsedValue ?? 0,
    direction: direction === "higher" ? "higher" : "lower",
    valid,
    reason: valid ? undefined : `Invalid measurement: value=${value}, direction=${direction}`,
  };
}
