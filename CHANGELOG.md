# [3.6.0](https://github.com/Maleick/AutoResearch/compare/v3.5.0...v3.6.0) (2026-05-07)


### Features

* add doctor source diagnostics ([#73](https://github.com/Maleick/AutoResearch/issues/73)) ([#122](https://github.com/Maleick/AutoResearch/issues/122)) ([add511a](https://github.com/Maleick/AutoResearch/commit/add511a2c741894a5ca66089235bbaa815331680))

# [3.5.0](https://github.com/Maleick/AutoResearch/compare/v3.4.1...v3.5.0) (2026-05-07)


### Bug Fixes

* bound status results file reads ([#116](https://github.com/Maleick/AutoResearch/issues/116)) ([628b203](https://github.com/Maleick/AutoResearch/commit/628b203e736d564a4858d992a212e4a63fdb0980))
* escape Markdown export fields to prevent injection ([#115](https://github.com/Maleick/AutoResearch/issues/115)) ([76cb6de](https://github.com/Maleick/AutoResearch/commit/76cb6de5fa27c30cd7131a02532bb36609f10f79))
* honor dry-run for mutating cli commands ([#118](https://github.com/Maleick/AutoResearch/issues/118)) ([4b879f6](https://github.com/Maleick/AutoResearch/commit/4b879f6683c57a27cfb9b6ff229c587f82d18d19))
* **install:** avoid cron prompt command substitution ([#111](https://github.com/Maleick/AutoResearch/issues/111)) ([927edac](https://github.com/Maleick/AutoResearch/commit/927edacf0bb0ccb7f6b3f10a539d223837ecb954))
* require explicit verify in validate ([#117](https://github.com/Maleick/AutoResearch/issues/117)) ([fd71f54](https://github.com/Maleick/AutoResearch/commit/fd71f54b812b6bb98442c892a9f1e7c52007d0f4))
* run semantic-release on supported node ([#120](https://github.com/Maleick/AutoResearch/issues/120)) ([f457d9b](https://github.com/Maleick/AutoResearch/commit/f457d9be213351c414165e009dee3df916def407))
* sanitize report markdown fields ([#114](https://github.com/Maleick/AutoResearch/issues/114)) ([6d67814](https://github.com/Maleick/AutoResearch/commit/6d67814666ab27a7f7066313d293d7fccecd9e72))


### Features

* add workflow issue templates ([#84](https://github.com/Maleick/AutoResearch/issues/84)) ([#121](https://github.com/Maleick/AutoResearch/issues/121)) ([aca0468](https://github.com/Maleick/AutoResearch/commit/aca04684648b1107d83a424948abe6ae1b128153))

## [3.4.1](https://github.com/Maleick/AutoResearch/compare/v3.4.0...v3.4.1) (2026-05-07)


### Bug Fixes

* **install:** avoid cron prompt command substitution ([#110](https://github.com/Maleick/AutoResearch/issues/110)) ([72c3816](https://github.com/Maleick/AutoResearch/commit/72c3816105eaf1e069ed0347d8d320ce96707d06))

# [3.4.0](https://github.com/Maleick/AutoResearch/compare/v3.3.3...v3.4.0) (2026-05-07)


### Bug Fixes

* anchor OpenCode command skill references ([#27](https://github.com/Maleick/AutoResearch/issues/27)) ([05552ac](https://github.com/Maleick/AutoResearch/commit/05552ac615e69e0cc246e929fdd8de5384dbdba0))
* avoid Hermes init shell interpolation ([#28](https://github.com/Maleick/AutoResearch/issues/28)) ([5c3511d](https://github.com/Maleick/AutoResearch/commit/5c3511da03032a895791eac5322779f6428d4441))
* expose OpenCode plugin entry ([3fbf3a6](https://github.com/Maleick/AutoResearch/commit/3fbf3a6a664d446f37a2b3c4efa2483a5762fbb9))
* **hermes:** require trusted cron commands ([#29](https://github.com/Maleick/AutoResearch/issues/29)) ([75df509](https://github.com/Maleick/AutoResearch/commit/75df509fbb36f1fca7b8e2d95cb166aa5efcfe07))
* pass model router args safely ([#31](https://github.com/Maleick/AutoResearch/issues/31)) ([de0e9e8](https://github.com/Maleick/AutoResearch/commit/de0e9e852f958e453f3e81bc0e6618bba2e4282e))
* register OpenCode plugin surfaces ([3faadf1](https://github.com/Maleick/AutoResearch/commit/3faadf128793758b00671341bd7e1636c5bcf66c))
* run releases on Node 22 ([#33](https://github.com/Maleick/AutoResearch/issues/33)) ([029678d](https://github.com/Maleick/AutoResearch/commit/029678d362488b0b74a86713ab590d372a5e6c5b))


### Features

* **hermes:** add full Hermes Agent runtime support ([190f133](https://github.com/Maleick/AutoResearch/commit/190f13355ab85b09391d959125e532cae16042e2)), closes [#hermes-support](https://github.com/Maleick/AutoResearch/issues/hermes-support) [#multi-runtime](https://github.com/Maleick/AutoResearch/issues/multi-runtime)
* **routing:** add intelligent model routing for free-tier priority ([3f7ecba](https://github.com/Maleick/AutoResearch/commit/3f7ecba7a52e3059bc9fba071eaa65db0f4c5bd4))

# Auto Research Changelog

## [3.3.4] - 2026-05-04

### Fixed
- **OpenCode plugin export**: Added the v1 default plugin object required by OpenCode's npm/local plugin loader.
- **OpenCode surface registration**: Registered packaged AutoResearch commands and skill paths from the plugin config hook so `/autoresearch` and the `autoresearch` skill are available after plugin load.

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
