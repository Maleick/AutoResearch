# Release Process

This package uses semantic-release to publish GitHub Releases and npm packages. Pull requests validate release readiness; merges to `main` publish automatically.

## Version Alignment

During normal releases, semantic-release updates `VERSION`, `package.json`, `package-lock.json`, `src/constants.ts`, `.opencode-plugin/plugin.json`, `README.md`, and `CHANGELOG.md`. Do not hand-edit these files for routine patch/minor releases.

## Release Steps

### 1. Prepare a conventional commit

Use a semantic-release compatible commit message such as `fix: restore release build` or `feat: add workflow mode`. Do not manually tag releases for the normal path.

### 2. Build and verify

```bash
npm ci
npm run build
npm run typecheck
npm run verify:pack
npm test
```

### 3. Open and merge a pull request

```bash
git add -A
git commit -m "fix: restore release build"
git push -u origin <branch>
gh pr create --fill
```

After CI passes, merge the pull request into `main`. The merge to `main` triggers `release.yml`.

### 4. Automated release

GitHub Actions will:

1. Build and type-check
2. Verify package contents
3. Run tests
4. Run semantic-release on `main`
5. Update release-managed version files and `CHANGELOG.md`
6. Create a GitHub Release
7. Publish npm `latest` with provenance through trusted publishing

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
- selected `docs/` files — `ARCHITECTURE.md`, `OPENCODE_INSTALL.md`, `QUICKSTART.md`, `RELEASE.md`, documentation site assets, and `CNAME`
- `INSTALL.md` — Public raw OpenCode install handoff
- `.opencode/INSTALL.md` — OpenCode native plugin install guide
- `.opencode-plugin/plugin.json` — OpenCode plugin manifest
- `AGENTS.md` — Agent guide
- `VERSION` — Version marker
- `README.md` — Product overview
- `LICENSE` — MIT license

Runtime artifacts (`.autoresearch/`) and Node modules are **not** included.
