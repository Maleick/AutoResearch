# Living Documentation Process

Auto Research uses a living documentation process to keep docs synchronized with code changes. This prevents documentation drift and ensures accuracy.

## Change Proposal Checks

When behavior-changing code is modified, corresponding documentation must be updated.

### Scope Rules

| Code Change | Required Doc Updates |
|-------------|---------------------|
| `src/cli.ts` | `docs/CLI_CONTRACT.md`, `README.md`, or `INSTALL.md` |
| `src/run-manager.ts` | `docs/ARCHITECTURE.md` or `skills/autoresearch/references/loop-workflow.md` |
| `src/helpers.ts` | `docs/ARCHITECTURE.md` or `README.md` |
| `src/types.ts` | `docs/ARCHITECTURE.md` or `docs/CLI_CONTRACT.md` |
| `commands/*.md` | `README.md` or `wiki/` |
| `skills/*/*.md` | `README.md` or `wiki/` |

### Running Checks

**Local check (dry-run):**
```bash
./scripts/check-doc-changes.sh --dry-run
```

**Against specific base:**
```bash
./scripts/check-doc-changes.sh --dry-run origin/main
```

**Enforce check (fails if docs missing):**
```bash
./scripts/check-doc-changes.sh
```

## Documentation Update Guidelines

### Do
- Update docs in the same PR as the behavior change
- Scope doc changes to affected sections only
- Use clear diffs showing what changed

### Don't
- Rewrite entire docs for minor changes
- Update unrelated documentation
- Skip docs for user-facing changes

## CI Integration

This check can be wired into CI on pull requests. Example step:

```yaml
- name: Check documentation changes
  run: ./scripts/check-doc-changes.sh --dry-run origin/main
```

At the time of writing, this step is not enabled in `.github/workflows/validate.yml`.

## Dry-Run Mode

Use `--dry-run` to preview what documentation would be required without failing:

```bash
$ ./scripts/check-doc-changes.sh --dry-run
Checking documentation changes against HEAD~1...

Behavior-changing files modified:
  - src/cli.ts

Documentation status:
  MISSING updates for:
    - docs/CLI_CONTRACT.md or README.md (for CLI changes)

[DRY-RUN] Would fail CI - documentation updates required
```
