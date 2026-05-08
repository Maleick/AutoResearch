# Task Context Schema Integration Guide

## Overview

The `TaskContext` schema provides a neutral interface for task definitions across CLI, MCP, Hermes, and future integrations.

## Schema Location

- **Schema definition**: `src/task-schema.ts`
- **CLI translator**: `src/translators/cli.ts`
- **Hermes translator**: `src/translators/hermes.ts`

## TaskContext Structure

```typescript
interface TaskContext {
  id: string;                      // Unique task identifier
  source: TaskSource;              // Origin: cli | hermes | mcp | webhook | api
  origin?: string;                 // Optional origin identifier
  owner?: string;                 // Optional owner/reference
  goal: string;                   // Task objective
  scope?: string;                 // In-scope files or subsystem
  metric: TaskMetric;             // Metric definition
  verify_command?: string;        // Mechanical verification command
  guard_command?: string;         // Regression guard command
  constraints: TaskConstraints;   // Iteration and label constraints
  iteration_policy?: TaskIterationPolicy;
  metadata?: Record<string, unknown>;
}
```

## Source Integrations

### CLI Integration

CLI commands produce `RunConfig` objects that translate to `TaskContext`:

```typescript
import { taskContextFromRunConfig, runConfigFromTaskContext } from "./translators/cli.js";

// CLI -> TaskContext
const context = taskContextFromRunConfig(taskId, runConfig);

// TaskContext -> CLI
const config = runConfigFromTaskContext(context);
```

### Hermes Integration

Hermes cron/prompt payloads translate to/from `TaskContext`:

```typescript
import { taskContextFromHermesPayload, hermesPayloadFromTaskContext, taskContextFromRunState } from "./translators/hermes.js";

// Hermes payload -> TaskContext
const context = taskContextFromHermesPayload(payload);

// TaskContext -> Hermes payload
const payload = hermesPayloadFromTaskContext(context);

// RunState (from state.json) -> TaskContext
const context = taskContextFromRunState(state);
```

## Adding New Integrations

### Step 1: Define the Translator

Create `src/translators/<source>.ts`:

```typescript
import type { TaskContext } from "../task-schema.js";

export interface YourSourcePayload {
  // Your integration's native payload structure
}

// TaskContext -> YourSource
export function yourPayloadFromTaskContext(context: TaskContext): YourSourcePayload {
  return {
    run_id: context.id,
    goal: context.goal,
    metric: { name: context.metric.name, direction: context.metric.direction },
    // ... map other fields
  };
}

// YourSource -> TaskContext
export function taskContextFromYourPayload(payload: YourSourcePayload): TaskContext {
  return {
    id: payload.run_id,
    source: "your_source" as TaskSource,
    goal: payload.goal,
    metric: { name: payload.metric.name, direction: payload.metric.direction },
    // ... map other fields
  };
}
```

### Step 2: Add Tests

Follow the pattern in `tests/test_translators_cli.ts` and `tests/test_translators_hermes.ts`.

### Step 3: Export from Index

Add exports to `src/index.ts`:

```typescript
export { taskContextFromRunConfig, runConfigFromTaskContext } from "./translators/cli.js";
export { taskContextFromHermesPayload, hermesPayloadFromTaskContext, taskContextFromRunState } from "./translators/hermes.js";
```

## Extension Points

### Custom Metrics

Extend `TaskMetric` for domain-specific metrics:

```typescript
interface CustomMetric extends TaskMetric {
  threshold?: number;
  aggregation?: "avg" | "max" | "min";
}
```

### Custom Constraints

Add constraint types as needed:

```typescript
interface CustomConstraints extends TaskConstraints {
  max_cost_usd?: number;
  allowed_languages?: string[];
}
```

### Custom Metadata

Pass integration-specific data via metadata:

```typescript
const context: TaskContext = {
  // ...
  metadata: {
    webhook_id: "wh-123",
    callback_url: "https://...",
    custom_field: "value",
  },
};
```

## Validation

Use `validateTaskContext()` to verify incoming data:

```typescript
import { validateTaskContext } from "./task-schema.js";

if (!validateTaskContext(incomingData)) {
  throw new Error("Invalid task context");
}
```

## Schema Versioning

The schema is designed for forward compatibility:
- New optional fields can be added without breaking existing integrations
- Required fields should remain minimal
- Use metadata for integration-specific extensions

## Hermes State Mapping

The `RunState` format used in `.autoresearch/state.json` maps directly to `TaskContext`:

| RunState Field | TaskContext Field |
|----------------|------------------|
| run_id | id |
| goal | goal |
| scope | scope |
| metric | metric |
| verify | verify_command |
| guard | guard_command |
| iterations_cap | constraints.max_iterations |
| duration_seconds | constraints.max_duration_seconds |
| label_requirements.keep | constraints.required_keep_labels |
| label_requirements.stop | constraints.required_stop_labels |
| mode | iteration_policy.mode |
| stop_condition | iteration_policy.stop_condition |
| memory | metadata |