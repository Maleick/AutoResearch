# Auto Research Changelog

## [3.3.3] - 2026-05-03

### Added
- **Root install handoff**: Added `INSTALL.md` with a raw OpenCode handoff URL, plugin install instructions, npm CLI alternatives, verification, updating, troubleshooting, and safety notes.

### Changed
- **Installation docs**: Updated README, OpenCode install docs, and wiki installation guidance to mirror the Code Archaeology install handoff pattern.
- **Package verification**: Required root `INSTALL.md`, narrowed docs/plugin package allowlists to explicit public files, and kept internal planning files out of package dry-run validation.

## [3.3.2] - 2026-05-03

### Added
- **OpenCode install guide**: Added `.opencode/INSTALL.md` with native `opencode.json` plugin installation, CLI alternative, update notes, and troubleshooting.
- **Agent guide**: Added tracked `AGENTS.md` with repository-specific development, security, and verification rules.

### Changed
- **Installation docs**: Updated README, docs, and wiki install instructions to recommend OpenCode's native npm plugin flow first.
- **Release pipeline**: Added the missing `npm test` gate to the release workflow and aligned release docs with trusted npm publishing.
- **Package verification**: Required `.opencode/INSTALL.md` and `AGENTS.md` in package dry-run validation.

### Fixed
- **Hook hardening**: Passed `AUTORESEARCH_STATE` into inline Node scripts through environment variables instead of interpolating it into JavaScript source.
- **Version references**: Aligned architecture and release docs for v3.3.2.

## [3.3.1] - 2026-04-29

### Fixed
- **README typo**: `opencode-autoship` → `opencode-autoresearch`
- **Package verification**: Added `plugins/` directory to allowlist in `verify-package.sh`
- **Git hygiene**: Removed accidentally committed `.autoresearch-test-tmp/` test artifacts
- **Git hygiene**: Added `.autoresearch-test-tmp/` to `.gitignore`

### Changed
- **Version references**: Updated all docs from v3.2.0 to v3.3.1 (ARCHITECTURE.md, wiki/Home.md, banner SVG)
- **Documentation**: Added `plugins/` directory to package layout docs (ARCHITECTURE.md, wiki/Contributing.md)

## [3.3.0] - 2026-04-28

### Added
- **9 new CLI commands**: explain, history, config, report, summary, suggest, export, completion, validate
- **New flags**: --version/-v, --json, --verbose, --dry-run
- **Enhanced doctor command**: 6 checks with detailed output
- **Shell completion support**: bash, zsh, fish
- **Export functionality**: JSON and Markdown formats
- **Pre-flight validation**: validate command for config checking
- **Performance benchmarks**: 3 performance tests
- **Quickstart guide**: docs/QUICKSTART.md

### Changed
- **Type system overhaul**: 6 new interfaces, eliminated Record<string, unknown> casts
- **Code quality cleanup**: 8 specialist subagents, 242 deletions, 175 insertions
- **Subagent pool**: 10 roles including meta_orchestrator for self-improvement
- **Word-boundary trigger matching**: Prevents false positives
- **TSV utilities**: Centralized parsing helpers

### Fixed
- **normalizeLabels**: Handles null, undefined, numbers, nested arrays
- **readJsonFile**: Proper error messages for missing vs invalid JSON
- **Wizard scope resolution**: Uses path.basename() instead of split/pop
- **Trigger matching**: Word boundaries prevent partial matches

## [3.2.0] - 2026-04-27

### Added
- Recursive self-improvement loop support
- Mermaid diagrams in documentation
- Enhanced subagent pool with meta-orchestrator role
- AGENTS.md guide
- verify-package.sh script

### Changed
- README overhaul with banner and diagrams
- Wiki pages with architecture charts
- GitHub Actions for automated releases
- Package.json alignment with AutoShip

## [3.1.0] - 2026-04-13

### Added
- OpenCode-only runtime
- ESM module support
- TypeScript strict mode

## [2.2.1] - 2026-04-13

### Fixed
- Documentation fixes
- Type definitions

## [2.2.0] - 2026-04-13

### Added
- Initial release
- Core iteration loop
- Subagent-first orchestration

## [2.1.0] - 2026-04-01

### Added
- Full documentation
- New flags and protocol improvements
