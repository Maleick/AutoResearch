# Installation

## Recommended: OpenCode Plugin Install

Add Auto Research to the `plugin` array in your global or project-level `opencode.json`:

```json
{
  "plugin": ["opencode-autoresearch"]
}
```

Restart OpenCode, then run:

```text
/autoresearch
```

## Optional CLI Install

```bash
npm install -g opencode-autoresearch
opencode-autoresearch doctor
```

## OpenCode Commands

- `/autoresearch` — Default improve-verify loop
- `/autoresearch:plan` — Planning workflow
- `/autoresearch:debug` — Debugging workflow
- `/autoresearch:fix` — Fix workflow
- `/autoresearch:learn` — Learning workflow
- `/autoresearch:predict` — Prediction workflow
- `/autoresearch:scenario` — Scenario expansion
- `/autoresearch:security` — Security review
- `/autoresearch:ship` — Ship-readiness workflow

## CLI Commands

```bash
autoresearch init --goal "Improve reliability" --metric failures --direction lower --verify "npm test"
autoresearch status
autoresearch stop
autoresearch resume
autoresearch complete
```

## Runtime Artifacts

- `.autoresearch/state.json` — Current run state
- `.autoresearch/launch.json` — Background launch manifest
- `autoresearch-results.tsv` — Iteration log
- `autoresearch-report.md` — End-of-run report
- `autoresearch-memory.md` — Reusable memory

See [docs/OPENCODE_INSTALL.md](docs/OPENCODE_INSTALL.md) and [`.opencode/INSTALL.md`](.opencode/INSTALL.md) for full install details.
