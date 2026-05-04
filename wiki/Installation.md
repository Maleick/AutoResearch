# Installation

Auto Research supports **OpenCode** and **Hermes Agent** runtimes.

## OpenCode Install

Paste this one-line install prompt into your agent. This URL follows the latest `main` instructions:

```text
Fetch and follow instructions from https://raw.githubusercontent.com/Maleick/AutoResearch/refs/heads/main/INSTALL.md
```

### Recommended: OpenCode Plugin Install

Add Auto Research to the `plugin` array in your global or project-level `opencode.json`:

```json
{
  "plugin": ["opencode-autoresearch@latest"]
}
```

Restart OpenCode, then run:

```text
/autoresearch
```

### Optional CLI Install

```bash
npm install -g opencode-autoresearch
autoresearch doctor
```

## Hermes Agent Install

```bash
# 1. Clone AutoResearch
git clone https://github.com/Maleick/AutoResearch.git
cd AutoResearch
npm install

# 2. Install the Hermes skill
mkdir -p ~/.hermes/skills/software-development/autoresearch
cp skills/hermes/autoresearch-prompt.md ~/.hermes/skills/software-development/autoresearch/SKILL.md
cp skills/hermes/INTEGRATION.md ~/.hermes/skills/software-development/autoresearch/REFERENCES.md

# 3. Create a cronjob
hermes cron create \
  --name "autoresearch-loop" \
  --workdir ~/projects/AutoResearch \
  --skill autoresearch-hermes \
  "every 15m" \
  "Run AutoResearch iteration loop. Detect phase from .autoresearch/state.json and execute one phase."
```

See [`skills/hermes/README.md`](https://github.com/Maleick/AutoResearch/blob/main/skills/hermes/README.md) for full Hermes setup and troubleshooting.

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

## Hermes Commands

Hermes uses cronjobs and `delegate_task` instead of slash commands. See [`skills/hermes/INTEGRATION.md`](https://github.com/Maleick/AutoResearch/blob/main/skills/hermes/INTEGRATION.md) for the full command mapping.

| OpenCode Command | Hermes Equivalent |
|-----------------|-------------------|
| `/autoresearch` | Cron runs iteration loop |
| `/autoresearch:plan` | Subagent task: plan experiments |
| `/autoresearch:debug` | Subagent task: debug failures |
| `/autoresearch:fix` | Subagent task: fix issues |
| `/autoresearch:learn` | Memory tool + pattern analysis |

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

See [INSTALL.md](https://github.com/Maleick/AutoResearch/blob/main/INSTALL.md), [docs/OPENCODE_INSTALL.md](https://github.com/Maleick/AutoResearch/blob/main/docs/OPENCODE_INSTALL.md), and [`.opencode/INSTALL.md`](https://github.com/Maleick/AutoResearch/blob/main/.opencode/INSTALL.md) for full install details.
