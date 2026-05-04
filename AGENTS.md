# Auto Research Agent Guide

## Project Purpose

Auto Research is an OpenCode and Hermes Agent workflow bundle plus npm package for structured autonomous improve-verify loops.

## Source of Truth

- Runtime source lives in `src/`.
- OpenCode commands live in `commands/`.
- The Auto Research skill bundle lives in `skills/autoresearch/`.
- The Hermes Agent skill bundle and integration docs live in `skills/hermes/`.
- Shell hooks live in `hooks/`.
- OpenCode package metadata lives in `.opencode-plugin/plugin.json`.
- Installation, architecture, and release docs live in `docs/` and `wiki/`.

## Development Rules

- Build context from existing files before changing behavior.
- Prefer the smallest correct change.
- Do not commit, tag, push, create releases, or publish packages unless the user explicitly asks.
- Do not commit runtime artifacts from `.autoresearch/` or generated result files.
- Keep `VERSION`, `package.json`, `package-lock.json`, `src/constants.ts`, and `.opencode-plugin/plugin.json` aligned for releases.
- When Hermes cron, `delegate_task`, model routing, or install behavior changes, keep `README.md`, `INSTALL.md`, `docs/`, `wiki/`, and `skills/hermes/` aligned.

## Security Rules

- Do not add install flows that pipe remote scripts into a shell.
- Keep package contents guarded by `hooks/verify-package.sh`.
- Do not hardcode secrets, tokens, credentials, or private paths.
- Pass shell variables into inline scripts through environment variables or argv, not by interpolating into source code.

## Verification

Run the focused relevant checks before claiming work is complete. Release-prep changes should run:

```bash
npm audit --audit-level=moderate
npm run typecheck
npm run build
npm run verify:pack
npm test
npm pack --dry-run
```
