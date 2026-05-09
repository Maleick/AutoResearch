# OpenCode + Hermes Parity Matrix

This document maps feature parity between the OpenCode and Hermes Agent runtimes. Use it to validate cross-runtime compatibility and identify runtime-specific behavior.

## Feature Matrix

| Feature | OpenCode | Hermes | Notes |
|---------|----------|--------|-------|
| **Entry Point** | `/autoresearch` slash command | Cronjob or `delegate_task` | Hermes requires manual cron setup |
| **Subagent Pool** | Standing pool (unlimited) | Batch via `delegate_task` (max 3) | Hermes limited by platform concurrency |
| **Real-time Execution** | Yes | No (15m intervals) | Hermes is poll-based |
| **Background Mode** | `autoresearch launch` | Native cron | Both support unattended execution |
| **Resume** | `autoresearch resume` | Automatic via cron | Hermes resumes on next tick |
| **State Format** | `.autoresearch/state.json` | Same file format | Fully compatible |
| **Results Format** | `autoresearch-results.tsv` | Same TSV format | Fully compatible |
| **Memory** | `autoresearch-memory.md` | `memory` tool + file | Hermes has additional memory tool |
| **CLI Commands** | All commands | Subset via cron | Hermes uses skill prompt for commands |
| **Slash Commands** | 8 variants (`/autoresearch:*`) | Not applicable | Hermes uses separate cron jobs |
| **Plugin Install** | `opencode.json` plugin array | Skill files in `~/.hermes/skills/` | Different install mechanisms |
| **Update Check** | Automatic at startup | Not implemented | Hermes relies on manual updates |
| **Wizard** | Interactive TTY | Not available | Hermes uses static skill prompt |
| **JSON Output** | `--json` flag | Not applicable | Hermes output goes to logs |
| **Config Command** | `autoresearch config` | Not applicable | Hermes config is in cron definition |
| **Status Command** | `autoresearch status` | `cat .autoresearch/state.json` | Hermes uses file inspection |
| **Stop Command** | `autoresearch stop` | `hermes cron pause` | Different mechanisms |
| **Export Command** | `autoresearch export` | Manual file copy | Hermes has no built-in export |
| **Completion** | Shell completions | Not applicable | Hermes uses native cron |
| **Doctor** | `autoresearch doctor` | Not applicable | Hermes has no equivalent |
| **Heartbeat** | In state `updated_at` | In state `updated_at` | Same mechanism |
| **Log Output** | stderr/stdout | `hermes logs --component cron` | Different log destinations |

## Command Mapping

| OpenCode Command | Hermes Equivalent | Status |
|------------------|-------------------|--------|
| `/autoresearch` | Cron runs iteration loop | ✅ Equivalent |
| `/autoresearch:plan` | Subagent task: plan experiments | ⚠️ Manual setup |
| `/autoresearch:debug` | Subagent task: debug failures | ⚠️ Manual setup |
| `/autoresearch:fix` | Subagent task: fix issues | ⚠️ Manual setup |
| `/autoresearch:learn` | Memory tool + pattern analysis | ⚠️ Partial |
| `/autoresearch:predict` | Subagent task: predict outcomes | ⚠️ Manual setup |
| `/autoresearch:scenario` | Subagent task: expand scenarios | ⚠️ Manual setup |
| `/autoresearch:security` | Subagent task: security audit | ⚠️ Manual setup |
| `/autoresearch:ship` | Subagent task: ship checks | ⚠️ Manual setup |
| `autoresearch init` | Initialize before cron | ✅ Equivalent |
| `autoresearch status` | `cat .autoresearch/state.json` | ⚠️ Different UX |
| `autoresearch resume` | Cron continues automatically | ⚠️ Different UX |
| `autoresearch stop` | `hermes cron pause` | ⚠️ Different mechanism |
| `autoresearch report` | Manual report generation | ❌ Not automated |
| `autoresearch leaderboard` | Not available | ❌ Missing |

## State Compatibility

Both runtimes use the same `.autoresearch/state.json` format:

```json
{
  "schema_version": 1,
  "run_id": "...",
  "status": "running",
  "mode": "background",
  "operating_mode": "converge",
  "goal": "...",
  "metric": { "name": "...", "direction": "lower" },
  "verify": "...",
  "stats": { "total_iterations": 0, "kept": 0, "discarded": 0, "needs_human": 0 },
  "flags": { "stop_requested": false, "needs_human": false, "background_active": true }
}
```

**Migration path**: Copy `.autoresearch/` directory between runtimes. No conversion needed.

## Validation Checklist

Before claiming cross-runtime compatibility, verify:

- [ ] State file reads correctly in both runtimes
- [ ] Results TSV parses identically
- [ ] Memory file format is compatible
- [ ] Goal document schema matches
- [ ] Stop/resume behavior is equivalent
- [ ] Error handling produces similar outcomes

## Known Divergences

1. **Subagent Concurrency**: OpenCode uses standing pool; Hermes batches max 3
2. **Real-time Feedback**: OpenCode shows progress immediately; Hermes logs every 15m
3. **Interactive Features**: OpenCode has TTY wizard; Hermes is fully automated
4. **Command Surface**: OpenCode has slash commands; Hermes uses cron + skills
5. **Update Mechanism**: OpenCode checks npm; Hermes requires manual git pull

## Testing Cross-Runtime

```bash
# 1. Start run in OpenCode
autoresearch init --goal "Test" --metric "m" --verify "echo ok"
autoresearch launch

# 2. Copy state to Hermes project
cp -r .autoresearch ~/hermes-project/

# 3. Verify Hermes can read state
hermes run --skill autoresearch-hermes --workdir ~/hermes-project

# 4. Compare results
diff .autoresearch/state.json ~/hermes-project/.autoresearch/state.json
```
