---
name: autoresearch-hermes
description: AutoResearch iteration loop for Hermes Agent — plan, modify, verify, keep/discard, learn, repeat.
trigger: When running AutoResearch on Hermes Agent via cronjob or delegate_task.
---

# AutoResearch Hermes Skill

## One Phase Per Cron Run

Each cron run executes exactly ONE phase of the AutoResearch loop. Do not combine phases.

## Phase Detection (run FIRST)

```bash
cd {{workdir}}
if [ -f .autoresearch/state.json ]; then
  if ! command -v jq >/dev/null 2>&1; then
    echo "ERROR: jq is required to read .autoresearch/state.json"
    exit 1
  fi
  status=$(jq -r '.status' .autoresearch/state.json)
  phase=$(jq -r '.memory.hermes_phase // "plan"' .autoresearch/state.json)
  total_iterations=$(jq -r '.stats.total_iterations // 0' .autoresearch/state.json)
  iterations_cap=$(jq -r '.iterations_cap // 20' .autoresearch/state.json)
else
  status="none"
  phase="init"
  total_iterations=0
  iterations_cap=20
fi
```

**Decision tree:**
- `status` = "none" → **Phase INIT** (create run config)
- `status` = "stopped" or "completed" → **STOP** (report final)
- `total_iterations >= iterations_cap` → **STOP** (report final)
- `phase` = "plan" → **Phase PLAN** (design experiment)
- `phase` = "modify" → **Phase MODIFY** (implement change)
- `phase` = "verify" → **Phase VERIFY** (run tests/metrics)
- `phase` = "decide" → **Phase DECIDE** (keep or discard)
- `phase` = "learn" → **Phase LEARN** (record patterns)

## Phase INIT

1. Read `autoresearch-config.json` or prompt for:
   - Goal (e.g., "Improve test coverage")
   - Metric (e.g., "coverage_pct")
   - Direction ("higher" or "lower")
   - Verify command (e.g., "npm run test:coverage")
   - Guard command (e.g., "npm run typecheck")
   - Max iterations (default: 20)
   - Mode ("background" for cron)

2. Baseline current metric:
```bash
{{verify_command}}
```

3. Prefer the shared AutoResearch CLI for state creation:
```bash
autoresearch init \
  --goal "{{goal}}" \
  --metric "{{metric}}" \
  --direction "{{direction}}" \
  --verify "{{verify_command}}" \
  --guard "{{guard_command}}" \
  --iterations {{max}} \
  --mode background
```

If the CLI is unavailable, create `.autoresearch/state.json` using the canonical `RunState` shape:
```json
{
  "schema_version": 1,
  "run_id": "{{date}}-{{n}}",
  "created_at": "{{iso_timestamp}}",
  "updated_at": "{{iso_timestamp}}",
  "status": "initialized",
  "mode": "background",
  "goal": "{{goal}}",
  "scope": "current repository",
  "metric": {
    "name": "{{metric}}",
    "direction": "{{direction}}",
    "baseline": "{{baseline_value}}",
    "best": "{{baseline_value}}",
    "latest": "{{baseline_value}}"
  },
  "verify": "{{verify_command}}",
  "guard": "{{guard_command}}",
  "iterations_cap": {{max}},
  "label_requirements": {"keep": [], "stop": []},
  "artifact_paths": {
    "results": "autoresearch-results.tsv",
    "state": ".autoresearch/state.json"
  },
  "stats": {
    "total_iterations": 0,
    "kept": 0,
    "discarded": 0,
    "needs_human": 0,
    "consecutive_discards": 0
  },
  "flags": {
    "stop_requested": false,
    "needs_human": false,
    "background_active": true,
    "stop_ready": false
  }
}
```

**STOP after init.** Next run will be Phase PLAN.

## Phase PLAN

1. Read state.json to understand current run
2. Spawn **Scout subagent** to find improvement opportunities:
```
Goal: Find opportunities to improve {{goal}} in this codebase
Context: Current metric = {{current_best}}, baseline = {{baseline}}
Toolsets: ["terminal", "file", "web"]
```

3. Scout returns: proposed change, expected impact, files to touch
4. Update state.json: set `memory.hermes_phase = "modify"`, record plan in `memory.hermes_plan`, and update `updated_at`

**STOP after plan.** Next run will be Phase MODIFY.

## Phase MODIFY

1. Read state.json for the planned change
2. Implement the focused change (one change per iteration)
3. Run guard command to ensure nothing is broken:
```bash
{{guard_command}}
```
4. Update state.json: set `memory.hermes_phase = "verify"` and update `updated_at`

**STOP after modify.** Next run will be Phase VERIFY.

## Phase VERIFY

1. Run verify command to measure metric:
```bash
{{verify_command}}
```
2. Parse result to extract metric value
3. Compare to `metric.best`:
   - If `metric.direction` = "higher" and new > `metric.best` → improvement
   - If `metric.direction` = "lower" and new < `metric.best` → improvement
4. Update state.json: set `memory.hermes_phase = "decide"`, record metric value in `memory.hermes_latest_metric`, and update `metric.latest`

**STOP after verify.** Next run will be Phase DECIDE.

## Phase DECIDE

1. Read state.json for metric comparison
2. **Keep** if improved:
   - Update `metric.best` and `metric.latest` to new value
   - Increment `kept` count
   - Record the recommended conventional commit message
   - Commit changes only if the user explicitly approved commits for this run
   - Record iteration as "kept" with `autoresearch record --decision keep --metric-value "{{new_value}}" --verify-status pass --guard-status pass --change-summary "{{change_summary}}"`
3. **Discard** if not improved or regressed:
   - Prefer a safe patch rollback for only the experiment changes
   - Use `git reset`, branch deletion, or other destructive rollback only with explicit user approval
   - Increment `discarded` count
   - Record iteration as "discarded" with `autoresearch record --decision discard --metric-value "{{new_value}}" --verify-status pass --guard-status pass --change-summary "{{change_summary}}"`
4. Check stop conditions:
   - `stats.total_iterations >= iterations_cap` → run `autoresearch complete`
   - `flags.stop_requested` → set `status = "stopped"` and `flags.background_active = false`
   - Otherwise → `memory.hermes_phase = "learn"`

**STOP after decide.** Next run will be Phase LEARN or STOP.

## Phase LEARN

1. Read all iterations from state.json
2. Spawn **Analyst subagent** to find patterns:
```
Goal: Analyze kept vs discarded iterations to find patterns
Context: {{iterations_json}}
Toolsets: ["file"]
```

3. Update Hermes memory with learnings:
```
memory add: "AutoResearch strategy for {{project_type}}: {{pattern}}"
```

4. Update state.json: `memory.hermes_phase = "plan"`. Do not increment `stats.total_iterations` here; `autoresearch record` owns iteration counts.

**STOP after learn.** Next run will be Phase PLAN (next iteration).

## Phase STOP (Complete or Stopped)

1. Generate final report:
```bash
cat .autoresearch/state.json | jq -r '
  "Run \(.run_id) complete",
  "Goal: \(.goal)",
  "Iterations: \(.stats.total_iterations) (\(.stats.kept) kept, \(.stats.discarded) discarded)",
  "Best: \(.metric.best) (baseline: \(.metric.baseline))",
  "Latest: \(.metric.latest)"
'
```

2. Leave `.autoresearch/state.json` in place as the canonical shared CLI state. If an archive copy is needed, copy it instead of moving it:
```bash
mkdir -p .autoresearch/archive
cp .autoresearch/state.json .autoresearch/archive/{{run_id}}.json
```

3. Report results to user

**STOP. Run complete.**

## Rules

- **One phase per cron run** — never combine
- **Mechanical verification only** — no intuition
- **Keep strict improvements** — discard everything else
- **Use [SILENT] for no-op phases**
- **Never exceed iterations_cap**
- **Respect stop_requested flag**
- **Record every iteration** before starting next
- **Never commit or destructively reset without explicit approval**

## Context Variables

| Variable | Source |
|----------|--------|
| `{{workdir}}` | Cronjob `workdir` setting |
| `{{goal}}` | State file or config |
| `{{metric}}` | State file or config |
| `{{verify_command}}` | State file or config |
| `{{guard_command}}` | State file or config |
| `{{current_best}}` | `metric.best` in state file |
| `{{baseline}}` | `metric.baseline` in state file |
| `{{max}}` | `iterations_cap` in state file (default 20) |

## Skills

Load for guidance when available:
- `autoresearch` — OpenCode AutoResearch skill (concepts apply)

**Start by detecting phase from state.json. Execute exactly ONE phase. STOP.**
