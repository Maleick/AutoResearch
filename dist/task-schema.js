export function createTaskContext(params) {
    return {
        id: params.id,
        source: params.source,
        origin: params.origin,
        owner: params.owner,
        goal: params.goal,
        scope: params.scope,
        metric: params.metric,
        instrument_metric: params.instrument_metric,
        verify_command: params.verify_command,
        guard_command: params.guard_command,
        constraints: {
            max_iterations: params.max_iterations,
            max_duration_seconds: params.max_duration_seconds,
            required_keep_labels: params.required_keep_labels,
            required_stop_labels: params.required_stop_labels,
        },
        iteration_policy: {
            mode: params.mode ?? "foreground",
            stop_condition: params.stop_condition,
        },
        metadata: params.metadata,
    };
}
export function validateTaskContext(context) {
    if (typeof context !== "object" || context === null)
        return false;
    const obj = context;
    if (typeof obj.id !== "string")
        return false;
    if (!["cli", "hermes", "mcp", "webhook", "api"].includes(obj.source))
        return false;
    if (typeof obj.goal !== "string")
        return false;
    if (typeof obj.metric !== "object" || obj.metric === null)
        return false;
    const metric = obj.metric;
    if (typeof metric.name !== "string")
        return false;
    if (!["lower", "higher"].includes(metric.direction))
        return false;
    if (obj.instrument_metric !== undefined) {
        if (typeof obj.instrument_metric !== "object" || obj.instrument_metric === null)
            return false;
        const iMetric = obj.instrument_metric;
        if (typeof iMetric.name !== "string")
            return false;
        if (!["lower", "higher"].includes(iMetric.direction))
            return false;
    }
    return true;
}
//# sourceMappingURL=task-schema.js.map