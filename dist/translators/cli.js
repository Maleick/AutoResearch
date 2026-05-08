export function taskContextFromRunConfig(id, config) {
    const metric = {
        name: config.outcome_metric ?? config.metric,
        direction: (config.outcome_direction ?? config.direction),
        baseline: config.baseline,
    };
    const instrumentMetric = config.instrument_metric
        ? {
            name: config.instrument_metric,
            direction: (config.instrument_direction ?? config.direction),
            baseline: config.baseline,
        }
        : undefined;
    const policy = {
        mode: config.mode,
        stop_condition: config.stop_condition,
    };
    return {
        id,
        source: "cli",
        goal: config.goal,
        scope: config.scope,
        metric,
        instrument_metric: instrumentMetric,
        verify_command: config.verify,
        guard_command: config.guard,
        constraints: {
            max_iterations: config.iterations,
            max_duration_seconds: config.duration ? parseDuration(config.duration) : undefined,
            required_keep_labels: config.required_keep_labels,
            required_stop_labels: config.required_stop_labels,
        },
        iteration_policy: policy,
        metadata: config.run_tag ? { run_tag: config.run_tag } : undefined,
    };
}
export function runConfigFromTaskContext(context) {
    return {
        goal: context.goal,
        metric: context.metric.name,
        direction: context.metric.direction,
        verify: context.verify_command ?? "",
        guard: context.guard_command ?? "",
        mode: context.iteration_policy?.mode ?? "foreground",
        scope: context.scope,
        iterations: context.constraints.max_iterations,
        duration: context.constraints.max_duration_seconds
            ? formatDuration(context.constraints.max_duration_seconds)
            : undefined,
        required_keep_labels: context.constraints.required_keep_labels,
        required_stop_labels: context.constraints.required_stop_labels,
        stop_condition: context.iteration_policy?.stop_condition,
        run_tag: context.metadata?.run_tag ?? undefined,
        baseline: context.metric.baseline,
        outcome_metric: context.metric.name,
        outcome_direction: context.metric.direction,
        instrument_metric: context.instrument_metric?.name,
        instrument_direction: context.instrument_metric?.direction,
    };
}
function parseDuration(value) {
    const normalized = value.trim().toLowerCase();
    if (/^\d+$/.test(normalized)) {
        return parseInt(normalized) || undefined;
    }
    const tokens = [...normalized.matchAll(/(\d+)([smhd])/g)];
    let total = 0;
    for (const match of tokens) {
        const amount = parseInt(match[1]);
        const unit = match[2];
        const multiplier = { s: 1, m: 60, h: 3600, d: 86400 };
        total += amount * multiplier[unit];
    }
    return total > 0 ? total : undefined;
}
function formatDuration(seconds) {
    if (seconds >= 86400)
        return `${Math.floor(seconds / 86400)}d`;
    if (seconds >= 3600)
        return `${Math.floor(seconds / 3600)}h`;
    if (seconds >= 60)
        return `${Math.floor(seconds / 60)}m`;
    return `${seconds}s`;
}
//# sourceMappingURL=cli.js.map