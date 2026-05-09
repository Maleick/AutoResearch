# Update Check Policy

Auto Research includes an automatic update check that runs at startup for most commands. This document describes when the check is performed, when it is skipped, and how to opt out.

## Behavior

The update status currently reads locally cached update metadata when present.

- **Cache location**: `~/.cache/opencode-autoresearch/update-check.json`
- **Current behavior**: Cache display only (no live npm registry probe yet)
- **Default**: Enabled for all users (opt-out, not opt-in)

## Skip Matrix

The update check is explicitly skipped in the following scenarios:

| Scenario | Skip Reason | Rationale |
|----------|-------------|-----------|
| `--version` or `-v` | Version flags | Fast path for version queries |
| `--help` or `-h` or `help` | Help flags | Fast path for help queries |
| `AUTORESEARCH_NO_UPDATE=1` | Environment opt-out | User-configurable disable |
| `CI=true` (detected) | CI environment | Avoid noise in automated pipelines |

## Opt-Out

To permanently disable update checks, set the environment variable:

```bash
export AUTORESEARCH_NO_UPDATE=1
```

Or for a single invocation:

```bash
AUTORESEARCH_NO_UPDATE=1 autoresearch status
```

## Verification

The `autoresearch doctor` command reports the update check status:

```bash
autoresearch doctor
# Output includes:
#   Disabled:   no
#   Last check: 2026-05-09T14:32:00Z
#   Latest:     3.13.1
#   Available:  no
```

## Implementation Notes

- The update check runs **after** command parsing but **before** command execution.
- Skip decisions are made at the CLI entry point (`src/cli.ts`) before any subcommand logic.
- The actual network probe (npm registry fetch) is not yet implemented; only the cache read/write infrastructure exists.
- When implemented, the probe will run asynchronously and report via stderr without blocking command execution.
