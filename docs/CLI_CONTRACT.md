# AutoResearch CLI Contract

This document defines the contractual interface for AutoResearch CLI—stable guarantees for stdout, stderr, and exit behavior that agents and automation can rely on.

## Version

```bash
autoresearch --version
```

Output format:
```
AutoResearch <version> (opencode-autoresearch)
Runtime: Node.js <runtime-version>
```

- `<version>` follows semver (e.g., `3.4.1`)
- Patch releases never break existing contract
- Minor releases may add commands or options but never remove them

## Commands

| Command | Description | Stability |
|--------|------------|----------|
| `init` | Initialize a run | Stable |
| `wizard` | Generate setup summary | Stable |
| `status` | Print run status | Stable |
| `explain` | Human-readable run state | Stable |
| `history` | Show iteration log | Stable |
| `scores` | Show score history | Stable |
| `config` | Show runtime config | Stable |
| `summary` | Aggregate stats | Stable |
| `suggest` | Next goal from memory | Stable |
| `launch` | Launch background run | Stable |
| `complete` | Mark run complete | Stable |
| `stop` | Request run stop | Stable |
| `resume` | Resume background run | Stable |
| `record` | Record experiment | Stable |
| `doctor` | Verify installation | Stable |
| `validate` | Validate config | Stable |
| `report` | Generate report | Stable |
| `export` | Export run data | Stable |
| `completion` | Shell completions | Stable |
| `help` | Show help | Stable |

### Stability Levels

- **Stable**: Contract is frozen. Agents can rely on output format, exit codes, and behavior.
- **Experimental**: May change. Not recommended for automation.

## Output Modes

### Human-Readable (default)

- Formatted tables, emoji indicators, prose explanations
- Sent to stdout
- Locale-formatted timestamps

### JSON (`--json`)

- Raw JSON to stdout for parsing
- Always `{"key": "value"}` — no extra text
- Use for automation

```bash
autoresearch status --json
```

### Verbose (`--verbose`)

- Debug info to stderr
- Includes internal state transitions

### Dry-Run (`--dry-run`)

- Preview without executing
- Outputs intended state to stdout

## Exit Codes

| Code | Meaning |
|------|--------|
| `0` | Success |
| `1` | Invalid command or arguments |
| `2` | Internal error (exception) |

### Code 0 — Success

- Command completed as documented
- Data may be empty (e.g., "No results file found")

### Code 1 — Client Error

- Unknown command
- Invalid arguments
- Required option missing

### Code 2 — Runtime Error

- Uncaught exception
- File system failure
- External dependency error

## Error Format

### Human Mode

Errors go to stderr with clear message:

```
✗ Configuration errors:
  - Missing required: --goal
```

### JSON Mode

Errors still go to stderr but exit code signals error class.

```bash
autoresearch status --json  # Returns Code 2 on error
```

### Structured Error JSON (future)

Planned format for `--json` with errors:

```json
{
  "error": {
    "code": "ENOENT",
    "message": "No run state found",
    "hint": "Run 'autoresearch init' first"
  }
}
```

## stdout / stderr Contracts

### stdout

- **Command output**: Data, formatted tables, progress
- **JSON mode**: Raw JSON object as single value
- **No mixing**: Human mode never mixes JSON with prose

### stderr

- **Usage errors**: Invalid args, missing required
- **Warnings**: Deprecations, update available
- **Verbose debug**: Internal state when `--verbose`

### Examples

```bash
# Success - human
autoresearch status
# => "Run: abc123  Status: running  ..."

# Success - json  
autoresearch status --json
# => {"run_id":"abc123","status":"running",...}

# Error - human
autoresearch unknown-cmd
# => "Unknown command: unknown-cmd"
# => Exit 1

# Error - json
autoresearch init --json
# => nothing (missing required fields)
# => Exit 1
```

## Versioning Guarantees

1. **Backward compat**: Commands added in v1.x stay through v2.x
2. **Output format**: JSON output never breaks existing keys
3. **Exit codes**: Same code for same error class
4. **Deprecation**: Warn via stderr for 1 minor release before removal

## Auto-Update Behavior

- `--version` and `--help` skip update check
- Runtime checks after command dispatch
- Update failures warn once and continue
- Set `AUTORESEARCH_NO_UPDATE=1` to skip

## Shell Completion

`completion` command generates tab-completion scripts:

```bash
# Bash/Zsh
autoresearch completion --shell bash

# Fish
autoresearch completion --shell fish
```