# Update Check Cache Notes

Auto Research currently exposes update-check information through cache inspection in the `doctor` command. There is no automatic startup update probe yet.

## Current Behavior

- **Read-only cache inspection**: `autoresearch doctor` reads update metadata when cache data exists.
- **Cache location**: `~/.cache/opencode-autoresearch/update-check.json`
- **No startup probe**: command startup does not contact npm for update checks today.
- **No TTL enforcement in CLI runtime**: cache freshness rules are not enforced by the current implementation.

## Verification

Run:

```bash
autoresearch doctor
```

If cache data exists, output includes fields such as last check time, latest version, and whether an update is available.

## Implementation Notes

- Cache access is implemented in `src/helpers.ts` via `readUpdateCache`.
- Runtime reporting is surfaced by the `doctor` command in `src/cli.ts`.
- Automatic network probing may be added later; until then this document intentionally reflects the current read-only behavior.
