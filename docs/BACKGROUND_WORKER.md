# Background Worker Lifecycle

Auto Research supports background execution via `autoresearch launch` (OpenCode) or Hermes cronjobs. This document describes the worker lifecycle, heartbeat mechanism, and recovery procedures.

## Worker States

A background worker transitions through the following states:

| State | Description | Transitions |
|-------|-------------|-------------|
| `initialized` | Run configured but not started | → `running` |
| `running` | Actively executing iterations | → `stopped`, → `completed`, → `needs_human` |
| `stopped` | Stop requested or interrupted | → `running` (via resume) |
| `completed` | Goal achieved or iteration cap reached | Terminal |
| `needs_human` | Blocked requiring operator intervention | → `running` (after resolution) |

## Heartbeat Metadata

The worker writes heartbeat metadata to `.autoresearch/state.json` on every iteration:

```json
{
  "updated_at": "2026-05-09T20:30:00Z",
  "flags": {
    "background_active": true,
    "stop_requested": false
  },
  "stats": {
    "total_iterations": 15,
    "kept": 8,
    "discarded": 6,
    "needs_human": 1
  }
}
```

### Heartbeat Fields

- `updated_at`: ISO 8601 timestamp of last activity
- `flags.background_active`: True while worker is processing
- `flags.stop_requested`: Set to true to request graceful shutdown
- `stats.total_iterations`: Cumulative iteration count

## Cron Setup

### Hermes Agent

```bash
hermes cron create \
  --name "autoresearch-loop" \
  --workdir ~/projects/AutoResearch \
  --skill autoresearch-hermes \
  "every 15m" \
  "Run AutoResearch iteration loop. Detect phase from .autoresearch/state.json and execute one phase."
```

### systemd (Linux)

```ini
# /etc/systemd/system/autoresearch.service
[Unit]
Description=Auto Research Background Worker
After=network.target

[Service]
Type=oneshot
WorkingDirectory=/home/user/projects/AutoResearch
ExecStart=/usr/bin/npx opencode-autoresearch worker --once
User=user

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/autoresearch.timer
[Unit]
Description=Run Auto Research every 15 minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=15min

[Install]
WantedBy=timers.target
```

Enable and start:
```bash
sudo systemctl enable autoresearch.timer
sudo systemctl start autoresearch.timer
```

## Stale Worker Detection

A worker is considered stale if:

1. `updated_at` is older than 2× the expected iteration interval
2. `flags.background_active` is true but no progress in `stats.total_iterations`
3. Process PID no longer exists (when PID tracking is available)

### Detection Script

```bash
#!/bin/bash
# Check for stale worker
STATE_FILE=".autoresearch/state.json"
if [ -f "$STATE_FILE" ]; then
  UPDATED=$(jq -r '.updated_at' "$STATE_FILE")
  NOW=$(date -u +%s)
  LAST=$(date -d "$UPDATED" +%s 2>/dev/null || echo 0)
  DIFF=$((NOW - LAST))
  
  if [ $DIFF -gt 1800 ]; then
    echo "WARNING: Worker stale for $DIFF seconds"
    echo "Consider: autoresearch resume --repo ."
  fi
fi
```

## Recovery Procedures

### Graceful Stop

```bash
# Method 1: Set stop flag
jq '.flags.stop_requested = true' .autoresearch/state.json > tmp.json && mv tmp.json .autoresearch/state.json

# Method 2: CLI command
autoresearch stop
```

### Resume After Interruption

```bash
# Check current state
autoresearch status

# Resume execution
autoresearch resume

# Or with explicit repo
autoresearch resume --repo ~/projects/AutoResearch
```

### Reset Corrupted State

```bash
# Backup first
cp .autoresearch/state.json .autoresearch/state.json.backup.$(date +%s)

# Remove state (next run will re-init)
rm .autoresearch/state.json

# Re-initialize
autoresearch init --goal "..." --metric "..." --verify "..."
```

## Restart Behavior

When a worker restarts:

1. Reads existing state from `.autoresearch/state.json`
2. Validates state schema version
3. Resumes from last recorded iteration
4. Continues until stop condition or iteration cap

If state is missing or corrupted:
- OpenCode: Prompts for re-initialization
- Hermes: Logs error and skips iteration (operator must re-init)

## Log Rotation

Background workers append to `.autoresearch/logs/worker.log`. Rotate logs to prevent disk exhaustion:

```bash
# Add to cron
0 0 * * * logrotate /etc/logrotate.d/autoresearch
```

```
# /etc/logrotate.d/autoresearch
/home/user/projects/AutoResearch/.autoresearch/logs/worker.log {
  daily
  rotate 7
  compress
  delaycompress
  missingok
}
```

## Monitoring Checklist

- [ ] Worker heartbeat updated within expected interval
- [ ] `stats.total_iterations` incrementing
- [ ] Disk space available for logs and state
- [ ] No `flags.needs_human` blocking execution
- [ ] Cron/timer service active and enabled
- [ ] Network access available (for update checks, if enabled)
