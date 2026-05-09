# Auto Research Concept Model

This document defines the canonical concepts used throughout Auto Research to ensure shared terminology across CLI, state, and documentation.

## Core Concepts

### Run

A **Run** is a complete execute-verify loop execution with a specific goal, metric, and verification mechanism. It represents a single autonomous improvement process.

**Files:**
- `src/types.ts` - `RunConfig`, `RunState` interfaces
- `src/run-manager.ts` - `initializeRun`, `appendIteration`, `completeRun` functions
- `src/helpers.ts` - State management helpers
- `src/constants.ts` - Default state and results paths

**Command Surface:**
- `/autoresearch` - Main improve-verify loop command
- `autoresearch init` - Initialize a new run
- `autoresearch launch` - Launch background run
- `autoresearch status` - Check run status
- `autoresearch stop` - Request run stop
- `autoresearch resume` - Resume background run
- `autoresearch complete` - Mark run complete

### Iteration

An **Iteration** is a single experiment cycle within a Run, consisting of: hypothesis formation, focused change, mechanical verification, and keep/discard decision.

**Files:**
- `src/types.ts` - `LastIteration` interface, `RunStats` tracking
- `src/run-manager.ts` - `appendIteration` function (core iteration recording)
- `src/helpers.ts` - UTC timestamp generation for iterations
- `skills/autoresearch/references/loop-workflow.md` - Iteration workflow definition

**Command Surface:**
- Implicit in all `/autoresearch:*` commands
- `autoresearch record` - Manually record iteration result
- Progress updates during command execution show current iteration

### Metric

A **Metric** is a numeric value that tracks progress toward the run's goal, measured mechanically by the verify command.

**Files:**
- `src/types.ts` - `Metric` interface (name, direction, baseline, best, latest)
- `src/run-manager.ts` - Metric handling in `makeStatePayload` and `appendIteration`
- `src/helpers.ts` - Direction normalization (`normalizeDirection`)
- `tests/test_types.ts` - Metric structure validation

**Command Surface:**
- `/autoresearch` requires `--metric` parameter
- `/autoresearch:plan` - Metric planning workflow
- `autoresearch init --metric "<name>" --direction "<lower|higher>"` - CLI initialization

### Verifier

A **Verifier** is the mechanical command or process that measures the metric value for an iteration.

**Files:**
- `src/types.ts` - `RunConfig.verify` field, `RunState.verify` field
- `src/run-manager.ts` - Verify status handling in `appendIteration`
- `src/helpers.ts` - Exit code processing for verification
- `skills/autoresearch/references/verify*` references (various verification patterns)

**Command Surface:**
- `/autoresearch` requires `--verify` parameter
- `autoresearch init --verify "<command>"` - CLI initialization
- Verification status appears in iteration logs and supervisor snapshots

### Guard

A **Guard** is an optional secondary check that identifies risks not captured by the primary metric, helping prevent regressions.

**Files:**
- `src/types.ts` - `RunConfig.guard` field, `RunState.guard` field
- `src/run-manager.ts` - Guard status handling in `appendIteration`
- `src/helpers.ts` - Guard execution and status processing
- `skills/autoresearch/references/core-principles.md` - "Keep a guard when the target metric does not capture regression risk"

**Command Surface:**
- `/autoresearch` accepts optional `--guard` parameter
- `autoresearch init --guard "<command>"` - CLI initialization
- Guard status tracked alongside verification in results

### Memory

**Memory** refers to the persistent storage of learned patterns, verified improvements, and reusable knowledge across runs.

**Files:**
- `src/types.ts` - `MemoryItem`, `MemoryProvenance`, `MemoryConsolidationState` interfaces
- `src/memory-manager.ts` - Core memory management implementation
- `src/helpers.ts` - Memory file path resolution (`getMemoryFilePath`)
- `skills/autoresearch/references/learn-workflow.md` - Memory workflow
- `docs/DUAL_METRICS.md` - Memory's role in dual-track optimization

**Command Surface:**
- `/autoresearch:learn` - Learning workflow for pattern extraction
- `autoresearch record` - Records iterations that feed memory
- Memory artifacts: `autoresearch-memory.md` (generated file)
- Self-improvement runs update memory automatically

### Subagent

A **Subagent** is a specialized AI agent instance that performs focused tasks (context gathering, analysis, verification, etc.) to support the main orchestrator agent.

**Files:**
- `src/subagent-pool.ts` - Subagent pool creation and role definitions
- `src/types.ts` - `subagent_pool` field in `RunState`
- `src/run-manager.ts` - Subagent pool integration in `makeStatePayload`
- `skills/autoresearch/references/subagent-orchestration.md` - Orchestration model
- `docs/ARCHITECTURE.md` - Subagent pool roles and purposes (Scout, Analyst, Verifier, Synthesizer, etc.)

**Command Surface:**
- `/autoresearch` - Uses standing subagent pool by default
- `/autoresearch:*` modes - May activate specialized subagent roles
- Subagent activation controlled via `activation.during_setup/iterations/resume` in pool configuration

## Concept Relationships

```mermaid
graph TD
    Run -->|contains| Iteration
    Iteration -->|measures| Metric
    Iteration -->|uses| Verifier
    Iteration -->|optional| Guard
    Run -->|accumulates| Memory
    Run -->|orchestrates| Subagent
    Subagent -->|supports| Iteration
    Memory -->|informs| Future Runs
```

## Usage in Documentation

These concepts should be referenced consistently in:
- Command descriptions (`commands/`)
- Skill references (`skills/autoresearch/references/`)
- Architecture documents (`docs/`)
- API documentation (TypeScript interfaces)
- Tutorial materials and onboarding guides

## Updates and Maintenance

When modifying concept implementations:
1. Update corresponding TypeScript interfaces in `src/types.ts`
2. Adjust command surfaces in `commands/`
3. Update skill references if workflow changes
4. Reflect changes in this document
5. Ensure alignment between OpenCode and Hermes Agent surfaces