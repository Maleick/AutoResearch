# Release Process

This package uses npm publish for releases. GitHub Actions automates the full release pipeline.

## Version Alignment

`VERSION`, `package.json`, `package-lock.json`, `src/constants.ts`, and `.opencode-plugin/plugin.json` must all stay aligned. The `VERSION` file is the canonical source of truth.

## Release Steps

### 1. Update version

```bash
# Update VERSION file
echo "3.3.2" > VERSION

# Sync to package.json
npm version 3.3.2 --no-git-tag-version

# Sync to src/constants.ts
# Update the VERSION export manually or use sed
```

### 2. Build and verify

```bash
npm ci
npm run build
npm run typecheck
npm run verify:pack
npm test
```

### 3. Update CHANGELOG

Add a new section for the version in `CHANGELOG.md`:

```markdown
## [3.3.2] - YYYY-MM-DD

### Added
- Recursive self-improvement loop support
- Mermaid diagrams in documentation
- Enhanced subagent pool with meta-orchestrator role

### Changed
- Updated README with banner and visual diagrams
- Improved wiki pages with architecture charts
```

### 4. Commit and tag

```bash
git add -A
git commit -m "Release v3.3.2"
git tag v3.3.2
git push origin main v3.3.2
```

### 5. Automated release

GitHub Actions will:

1. Build and type-check
2. Verify package contents
3. Run tests
4. Create a GitHub Release with the CHANGELOG section
5. Publish to npm with provenance through trusted publishing

## Manual publish (fallback)

If you need to publish manually:

```bash
npm run build
npm run typecheck
npm run verify:pack
npm publish --access public
```

## Package Contents

The shipped package includes:

- `dist/` — Compiled TypeScript (CLI entry point, helpers, subagent pool, run manager)
- `commands/` — OpenCode command surfaces (`autoresearch.md`, `autoresearch/*.md`)
- `skills/autoresearch/` — Skill bundle with references
- `hooks/` — Shell hooks for session lifecycle
- `docs/` — Installation, architecture, and release docs
- `.opencode/INSTALL.md` — OpenCode native plugin install guide
- `.opencode-plugin/plugin.json` — OpenCode plugin manifest
- `AGENTS.md` — Agent guide
- `VERSION` — Version marker
- `README.md` — Product overview
- `LICENSE` — MIT license

Runtime artifacts (`.autoresearch/`) and Node modules are **not** included.
