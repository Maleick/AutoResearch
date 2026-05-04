# Security

Auto Research can modify code unattended, so the project keeps explicit safety rules across OpenCode and Hermes runtime surfaces.

## Core safety model

- Branch isolation: keep experiments off the default branch.
- Mechanical verification: do not keep a change without a verify command.
- Guard enforcement: treat regressions as discard conditions, not optional warnings.
- State persistence: record authoritative run state in `.autoresearch/state.json`.
- Artifact hygiene: treat run artifacts as generated state, not source files to commit.
- Approval gate: do not commit changes or run destructive rollback/reset operations unless the user explicitly approves them.

## Runtime artifacts

Runtime state and result files are generated artifacts:

- `.autoresearch/state.json`
- `.autoresearch/launch.json`
- `autoresearch-results.tsv`
- `autoresearch-report.md`
- `autoresearch-memory.md`

These files should not be committed unless a release or test fixture explicitly requires a sanitized example.

## Source of truth

Runtime source lives in `src/`. OpenCode commands and skills live in `commands/` and `skills/autoresearch/`. Hermes Agent guidance lives in `skills/hermes/`. OpenCode package metadata lives in `.opencode-plugin/plugin.json`.

## Reporting

If you find a security issue in Auto Research itself, open a private security advisory on [GitHub](https://github.com/Maleick/AutoResearch/security/advisories).
