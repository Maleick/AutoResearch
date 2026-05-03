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
  status=$(jq -r '.status' .autoresearch/state.json)
  phase=$(jq -r '.phase' .autoresearch/state.json)
else
  status="none"
  phase="init"
fi
```

**Decision tree:**
- `status` = "none" → **Phase INIT** (create run config)
- `phase` = "plan" → **Phase PLAN** (design experiment)
- `phase` = "modify" → **Phase MODIFY** (implement change)
- `phase` = "verify" → **Phase VERIFY** (run tests/metrics)
- `phase` = "decide" → **Phase DECIDE** (keep or discard)
- `phase` = "learn" → **Phase LEARN** (record patterns)
- `status` = "stopped" or iterations >= max → **STOP** (report final)

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

3. Create `.autoresearch/state.json`:
```json
{
  "run_id": "{{date}}-{{n}}",
  "status": "running",
  "phase": "plan",
  "mode": "background",
  "goal": "{{goal}}",
  "metric": "{{metric}}",
  "direction": "{{direction}}",
  "verify": "{{verify_command}}",
  "guard": "{{guard_command}}",
  "baseline": {{baseline_value}},
  "current_best": {{baseline_value}},
  "iterations": [],
  "stats": {"total": 0, "kept": 0, "discarded": 0},
  "max_iterations": {{max}},
  "flags": {"needs_human": false, "stop_requested": false}
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
4. Update state.json: `phase = "modify"`, record plan

**STOP after plan.** Next run will be Phase MODIFY.

## Phase MODIFY

1. Read state.json for the planned change
2. Implement the focused change (one change per iteration)
3. Run guard command to ensure nothing is broken:
```bash
{{guard_command}}
```
4. Update state.json: `phase = "verify"`

**STOP after modify.** Next run will be Phase VERIFY.

## Phase VERIFY

1. Run verify command to measure metric:
```bash
{{verify_command}}
```
2. Parse result to extract metric value
3. Compare to `current_best`:
   - If direction = "higher" and new > current_best → improvement
   - If direction = "lower" and new < current_best → improvement
4. Update state.json: `phase = "decide"`, record metric value

**STOP after verify.** Next run will be Phase DECIDE.

## Phase DECIDE

1. Read state.json for metric comparison
2. **Keep** if improved:
   - Update `current_best` to new value
   - Increment `kept` count
   - Commit changes with conventional message
   - Record iteration as "kept"
3. **Discard** if not improved or regressed:
   - Revert changes (git reset or rollback)
   - Increment `discarded` count
   - Record iteration as "discarded"
4. Check stop conditions:
   - `total_iterations >= max_iterations` → `status = "complete"`
   - `stop_requested` → `status = "stopped"`
   - Otherwise → `phase = "learn"`

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

4. Update state.json: `phase = "plan"`, increment `total`

**STOP after learn.** Next run will be Phase PLAN (next iteration).

## Phase STOP (Complete or Stopped)

1. Generate final report:
```bash
cat .autoresearch/state.json | jq -r '
  "Run \(.run_id) complete",
  "Goal: \(.goal)",
  "Iterations: \(.stats.total) (\(.stats.kept) kept, \(.stats.discarded) discarded)",
  "Best: \(.current_best) (baseline: \(.baseline))",
  "Improvement: \((.current_best - .baseline) / .baseline * 100)%"
'
```

2. Archive state:
```bash
mv .autoresearch/state.json .autoresearch/archive/{{run_id}}.json
```

3. Report results to user

**STOP. Run complete.**

## Rules

- **One phase per cron run** — never combine
- **Mechanical verification only** — no intuition
- **Keep strict improvements** — discard everything else
- **Use [SILENT] for no-op phases**
- **Never exceed max_iterations**
- **Respect stop_requested flag**
- **Record every iteration** before starting next

## Context Variables

| Variable | Source |
|----------|--------|
| `{{workdir}}` | Cronjob `workdir` setting |
| `{{goal}}` | State file or config |
| `{{metric}}` | State file or config |
| `{{verify_command}}` | State file or config |
| `{{guard_command}}` | State file or config |
| `{{current_best}}` | State file |
| `{{baseline}}` | State file |
| `{{max}}` | State file (default 20) |

## Skills

Load for guidance:
- `autoresearch` — OpenCode AutoResearch skill (concepts apply)
- `textquest-quality-gate` — validation sequence

**Start by detecting phase from state.json. Execute exactly ONE phase. STOP.**
