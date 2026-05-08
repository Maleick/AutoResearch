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
    if (!isRecord(context))
        return false;
    const obj = context;
    if (typeof obj.id !== "string")
        return false;
    if (!["cli", "hermes", "mcp", "webhook", "api"].includes(obj.source))
        return false;
    if (!isOptionalString(obj.origin))
        return false;
    if (!isOptionalString(obj.owner))
        return false;
    if (typeof obj.goal !== "string")
        return false;
    if (!isOptionalString(obj.scope))
        return false;
    if (!isRecord(obj.metric))
        return false;
    const metric = obj.metric;
    if (typeof metric.name !== "string")
        return false;
    if (!["lower", "higher"].includes(metric.direction))
        return false;
    if (!isOptionalString(metric.baseline))
        return false;
    if (!isOptionalString(metric.target))
        return false;
    if (!isOptionalString(obj.verify_command))
        return false;
    if (!isOptionalString(obj.guard_command))
        return false;
    if (!isRecord(obj.constraints))
        return false;
    const constraints = obj.constraints;
    if (!isOptionalNumber(constraints.max_iterations))
        return false;
    if (!isOptionalNumber(constraints.max_duration_seconds))
        return false;
    if (!isOptionalStringArray(constraints.required_keep_labels))
        return false;
    if (!isOptionalStringArray(constraints.required_stop_labels))
        return false;
    if (obj.iteration_policy !== undefined) {
        if (!isRecord(obj.iteration_policy))
            return false;
        const policy = obj.iteration_policy;
        if (!["foreground", "background"].includes(policy.mode))
            return false;
        if (!isOptionalString(policy.stop_condition))
            return false;
        if (!isOptionalString(policy.rollback_strategy))
            return false;
    }
    if (obj.metadata !== undefined && !isRecord(obj.metadata))
        return false;
    return true;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
function isOptionalString(value) {
    return value === undefined || typeof value === "string";
}
function isOptionalNumber(value) {
    return value === undefined || typeof value === "number";
}
function isOptionalStringArray(value) {
    return value === undefined || (Array.isArray(value) && value.every((item) => typeof item === "string"));
}
//# sourceMappingURL=task-schema.js.map