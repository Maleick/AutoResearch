# /autoresearch:digest

Generate a re-entry digest summarizing the active run state for operator handoff.

## Activation

Run `/autoresearch:digest` to get a summary of the current AutoResearch run state.

Add `--json` flag for machine-readable output suitable for scripts.

## When to Use

Use this command when:
- Returning to a long-running AutoResearch session
- Needing a quick context summary for handoffs
- Preparing to continue work after a break
- Sharing run status with team members
- Feeding run status into automated workflows

## Execution

The digest command:
1. Checks if `.autoresearch/state.json` exists
2. If it exists, reads and formats the current state
3. If it doesn't exist, informs the user no active run is found
4. Outputs run status, goal, metric information, stats, last iteration, next action, blockers, and flags

## Output

Human-readable format shows:
- Run ID and status
- Current goal and metric information
- Statistics (iterations kept/discarded/needs_human)
- Last iteration summary
- Next recommended action
- Any blockers or flags needing attention

JSON format (with `--json` flag) provides the same data in machine-readable form for scripting.

Example usage:
```bash
autoresearch digest
autoresearch digest --json
```