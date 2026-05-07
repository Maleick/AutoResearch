# AutoResearch Hermes Integration

## Overview

AutoResearch can run on Hermes Agent using `delegate_task` for subagent pools and `cronjob` for recurring iteration loops.

## Architecture

```
Hermes Cron (every 15m)
  → Check state.json for active run
  → If running: spawn subagents (Scout, Analyst, Verifier)
  → Each subagent performs one iteration phase
  → Verify results mechanically
  → Keep/Discard based on metrics
  → Update state.json
  → Repeat until stop condition
```

## Key Differences from OpenCode

| Feature | OpenCode | Hermes |
|---------|----------|--------|
| Entry | `/autoresearch` slash command | `cronjob` or `delegate_task` |
| Subagents | Standing pool | `delegate_task` batch (max 3) |
| State | `.autoresearch/state.json` | Same file + Hermes memory |
| Verification | `npm test`, etc. | Same — mechanical verification |
| Background | `autoresearch launch` | `cronjob` with `background=True` |
| Resume | `autoresearch resume` | Cron continues automatically |

## Setup

```bash
# 1. Install AutoResearch CLI (for state management)
npm install -g opencode-autoresearch

# 2. Create Hermes cron for AutoResearch
cd ~/projects/AutoResearch
hermes cron create \
  --name "autoresearch-loop" \
  --workdir ~/projects/AutoResearch \
  --skill autoresearch-hermes \
  "every 15m" \
  "Run AutoResearch iteration loop. Detect phase from .autoresearch/state.json and execute one phase. Approved verify command: npm run test:coverage. Approved guard command: npm run typecheck."
```

## Hermes Prompt Template

See `skills/hermes/autoresearch-prompt.md` for the full cron prompt.

## Commands Mapping

| OpenCode Command | Hermes Equivalent |
|-----------------|-------------------|
| `/autoresearch` | Cron runs iteration loop |
| `/autoresearch:plan` | Subagent task: plan experiments |
| `/autoresearch:debug` | Subagent task: debug failures |
| `/autoresearch:fix` | Subagent task: fix issues |
| `/autoresearch:learn` | Memory tool + pattern analysis |
| `autoresearch init` | Manual setup (same CLI) |
| `autoresearch status` | `cat .autoresearch/state.json` |
| `autoresearch launch` | `hermes cron create` |
| `autoresearch stop` | `hermes cron pause` |
| `autoresearch resume` | `hermes cron resume` |

## State File Format

Hermes uses the same `.autoresearch/state.json` format as OpenCode:

```json
{
  "schema_version": 1,
  "run_id": "2026-05-03-001",
  "status": "initialized",
  "mode": "background",
  "goal": "Improve test coverage",
  "metric": {
    "name": "coverage_pct",
    "direction": "higher",
    "baseline": "72.4",
    "best": "72.4",
    "latest": "72.4"
  },
  "verify": "npm run test:coverage",
  "guard": "npm run typecheck",
  "stats": {
    "total_iterations": 12,
    "kept": 8,
    "discarded": 4
  },
  "flags": {
    "needs_human": false,
    "stop_requested": false,
    "background_active": true,
    "stop_ready": false
  }
}
```

## Subagent Roles

### Scout
- **Goal**: Find improvement opportunities
- **Toolsets**: `["terminal", "file", "web"]`
- **Context**: Current codebase, test results, coverage reports

### Analyst
- **Goal**: Analyze patterns in kept/discarded iterations
- **Toolsets**: `["file", "web"]`
- **Context**: `autoresearch-results.tsv`, memory

### Verifier
- **Goal**: Run mechanical verification
- **Toolsets**: `["terminal"]`
- **Context**: Operator-approved verify command and guard command; repository state commands are metadata only

## Memory Integration

Hermes `memory` tool stores:
- Successful strategies per project type
- Common failure patterns
- Optimal iteration counts per goal type
- Best verify/guard command combinations

## Example Cron Prompt

```markdown
You are AutoResearch running on Hermes Agent.

## Current Run
Run ID: {{run_id}}
Goal: {{goal}}
Metric: {{metric}}
Iteration: {{current}}/{{max}}

## Phase: {{phase}}

{{phase_instructions}}

## STOP after completing this phase.
Next cron run will continue with the next phase.
```

## Limitations

- Hermes max 3 concurrent subagents vs OpenCode's standing pool
- Hermes cron intervals minimum 5 minutes vs OpenCode's real-time
- No `/autoresearch:` slash command variants (use separate cron jobs)
- Memory is session-based; use `memory` tool for persistence
- Commits and destructive rollback require explicit user approval

## Future Enhancements

- [ ] Auto-detect optimal cron interval based on iteration duration
- [ ] Integration with Hermes checkpoint/rollback for safe resets
- [ ] Cross-session memory for strategy learning
