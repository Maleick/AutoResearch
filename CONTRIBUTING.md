# Contributing to Auto Research

Auto Research is a cross-platform workflow bundle for coding agents. The repository now has two distribution surfaces:

- an OpenCode npm package and plugin payload
- a Hermes Agent skill and integration surface

The TypeScript runtime, OpenCode bundle, and Hermes skill docs are the source of truth for current behavior.

## Project structure

```text
src/                                  # CLI and runtime source
commands/                             # OpenCode slash command templates
skills/autoresearch/                  # OpenCode AutoResearch skill
skills/hermes/                        # Hermes Agent skill and integration docs
hooks/                                # Shell hooks and package verification
plugins/autoresearch.ts               # OpenCode plugin entry point
.opencode-plugin/plugin.json          # OpenCode package metadata
config/model-routing.json             # Local model routing reference config
scripts/model-router.sh               # Local model routing helper
docs/ and wiki/                       # Install, architecture, quickstart, release docs
tests/
```

## Working on the OpenCode package

When you change `src/`, `commands/`, `skills/autoresearch/`, `hooks/`, or `.opencode-plugin/`:

1. Keep runtime source, command templates, skill docs, and package metadata aligned.
2. Re-run focused TypeScript and package verification.
3. Do not commit generated `.autoresearch/` artifacts or result files.

```bash
npm run typecheck
npm run build
npm run verify:pack
npm test
```

## Working on Hermes support

Hermes support lives in `skills/hermes/` and uses the shared CLI state under `.autoresearch/state.json`. Update Hermes docs and prompts when:

- cronjob setup changes
- `delegate_task` behavior or concurrency changes
- state schema, result artifacts, or model routing changes
- installation instructions change

Keep Hermes guidance clear that commits and destructive rollback require explicit user approval.

## Version bumps

When releasing a new version, update these surfaces together:

1. `VERSION`
2. `CHANGELOG.md`
3. `README.md`
4. `package.json`
5. `package-lock.json`
6. `src/constants.ts`
7. `.opencode-plugin/plugin.json`

## Validation

Minimum validation for packaging changes:

```bash
npm run typecheck
npm run build
npm run verify:pack
npm test
```

For doc-heavy changes, also grep for stale repo or brand references:

```bash
rg -n "claude-autoresearch|research-results.tsv|autoresearch-state.json|plugins/codex-autoresearch|plugins/autoresearch/|.claude-plugin" README.md CHANGELOG.md CONTRIBUTING.md SECURITY.md wiki docs plugins skills
```
