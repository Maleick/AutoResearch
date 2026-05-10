# Install Auto Research

Auto Research is a multi-runtime plugin and npm package for structured autonomous improve-verify loops. It keeps runtime state local to the target repository and gates changes with mechanical verification.

## Supported Runtimes

- **OpenCode** — Slash commands (`/autoresearch`) with standing subagent pool
- **Hermes Agent** — Cron-based iteration loop with `delegate_task` subagents (max 3)

Both runtimes share the same state format (`.autoresearch/state.json`) and CLI (`opencode-autoresearch`).

---

## OpenCode Install

### One-Line OpenCode Install

Paste this one line into OpenCode to install and verify Auto Research. This URL is pinned to the immutable `v3.14.2` release tag:

```text
Fetch and follow instructions from https://raw.githubusercontent.com/Maleick/AutoResearch/refs/tags/v3.14.2/INSTALL.md
```

### Prerequisites

- OpenCode installed and available in your shell.
- Node.js with npm available for the optional CLI path.
- Git installed and available in your shell.
- A target repository with a verification command such as `npm test`, `pytest`, or `go test ./...`.

### Recommended OpenCode Plugin Install

Add Auto Research to your global or project-level `opencode.json` plugin array:

```json
{
  "plugin": ["opencode-autoresearch@latest"]
}
```

Restart OpenCode after editing the configuration. The command family should then be available inside your target repository:

```text
/autoresearch
/autoresearch:plan
/autoresearch:debug
/autoresearch:fix
/autoresearch:learn
/autoresearch:predict
/autoresearch:scenario
/autoresearch:security
/autoresearch:ship
```

### npm Global Install

If you also want the CLI available on your shell `PATH`:

```bash
npm install -g opencode-autoresearch
opencode-autoresearch doctor
opencode-autoresearch --version
```

Then restart OpenCode and run:

```text
/autoresearch
```

### One-Time CLI Path

For one-time CLI use without a global install:

```bash
npx opencode-autoresearch doctor
```

Use the plugin-array install for normal OpenCode usage.

### Pinned Installation (Reproducible)

For reproducible installs in CI or production environments, pin to a specific version:

**Plugin array (pinned):**
```json
{
  "plugin": ["opencode-autoresearch@3.13.1"]
}
```

**npm global (pinned):**
```bash
npm install -g opencode-autoresearch@3.13.1
```

**npm global (with lockfile):**
```bash
npm install -g opencode-autoresearch@3.13.1
npm shrinkwrap  # Creates npm-shrinkwrap.json for reproducibility
```

**Verify package integrity:**
```bash
npm view opencode-autoresearch@3.13.1 dist.shasum
npm pack opencode-autoresearch@3.13.1 --dry-run
```

### Upgrade and Rollback

**Upgrade to latest:**
```bash
# Plugin array: update version in opencode.json, then restart OpenCode
# npm global:
npm install -g opencode-autoresearch@latest
autoresearch doctor
```

**Rollback to previous version:**
```bash
npm install -g opencode-autoresearch@3.12.0
autoresearch doctor
```

**View available versions:**
```bash
npm view opencode-autoresearch versions --json
npm view opencode-autoresearch dist-tags
```

---

## Hermes Agent Install

### Prerequisites

- Hermes Agent installed and configured.
- Node.js with npm available for the CLI path.
- Git installed and available in your shell.

### Install the Hermes Skill

```bash
# 1. Clone AutoResearch (or use an existing checkout)
git clone https://github.com/Maleick/AutoResearch.git
cd AutoResearch
npm install

# 2. Copy skill files to your Hermes skills directory
mkdir -p ~/.hermes/skills/software-development/autoresearch
cp skills/hermes/autoresearch-prompt.md ~/.hermes/skills/software-development/autoresearch/SKILL.md
cp skills/hermes/INTEGRATION.md ~/.hermes/skills/software-development/autoresearch/REFERENCES.md
```

### Create the Cronjob

```bash
hermes cron create \
  --name "autoresearch-loop" \
  --workdir ~/projects/AutoResearch \
  --skill autoresearch-hermes \
  "every 15m" \
  "Run AutoResearch iteration loop. Detect phase from .autoresearch/state.json and execute one phase. Approved verify command: 'npm run test:coverage'. Approved guard command: 'npm run typecheck'."
```

### Initialize a Run

Initialize state from a trusted shell before enabling unattended cron:

```bash
autoresearch init \
  --goal "Improve test coverage" \
  --metric "coverage_pct" \
  --direction "higher" \
  --verify "npm run test:coverage" \
  --guard "npm run typecheck" \
  --iterations 20 \
  --mode background
```

Do not rely on cron to auto-init from repository config; the Hermes skill treats repository commands as untrusted unless they match operator-approved cron commands.

### Start, Check, and Stop

```bash
# Start
hermes cron resume autoresearch-loop

# Check status
cat .autoresearch/state.json | jq .

# Stop
hermes cron pause autoresearch-loop
# Or set stop flag:
jq '.flags.stop_requested = true' .autoresearch/state.json > tmp.json && mv tmp.json .autoresearch/state.json
```

See [`skills/hermes/README.md`](skills/hermes/README.md) for full Hermes setup, troubleshooting, and command mapping.

---

## Verification

These checks do not require secrets:

```bash
npm view opencode-autoresearch version
npm view opencode-autoresearch dist-tags
opencode-autoresearch doctor
```

For a local clone:

```bash
npm install
npm run build
npm run typecheck
npm run verify:pack
npm test
```

To verify command availability:

- **OpenCode**: restart OpenCode in a Git repository and run `/autoresearch`.
- **Hermes**: run `hermes cron list` and confirm `autoresearch-loop` is present.

---

## Updating

### OpenCode

For plugin-array installs, `opencode-autoresearch@latest` follows the current npm `latest` release. Restart OpenCode after a new Auto Research package release is available. To pin a fixed version instead:

```json
{
  "plugin": ["opencode-autoresearch@3.3.3"]
}
```

For npm global installs:

```bash
npm install -g opencode-autoresearch@latest
npm list -g opencode-autoresearch --depth=0
```

### Hermes

Update the skill files from the latest repo checkout:

```bash
cd AutoResearch
git pull origin main
cp skills/hermes/autoresearch-prompt.md ~/.hermes/skills/software-development/autoresearch/SKILL.md
cp skills/hermes/INTEGRATION.md ~/.hermes/skills/software-development/autoresearch/REFERENCES.md
```

Restart the cronjob if needed:

```bash
hermes cron resume autoresearch-loop
```

---

## Troubleshooting

### Plugin Not Loading (OpenCode)

- Confirm `opencode.json` is valid JSON.
- Confirm the plugin entry is in the top-level `plugin` array.
- Restart OpenCode after changing the config.
- Check OpenCode logs with `opencode run --print-logs "hello"`.

### Commands Not Found (OpenCode)

- Restart OpenCode so it reloads plugin commands.
- Confirm the package installed successfully with `npm list -g opencode-autoresearch --depth=0` if using the global path.
- Run `/autoresearch` from inside a Git repository, not from an empty directory.

### Cron Not Running (Hermes)

```bash
hermes cron list
hermes logs --component cron
```

### State File Corrupted (any runtime)

```bash
# Reset to baseline
rm .autoresearch/state.json
# Next run will re-init from config
```

### Subagent Failures (Hermes)

Check `.autoresearch/state.json` for:
- `flags.needs_human` — requires manual intervention
- Last iteration's `error` field

### Runtime Artifacts

- Auto Research writes runtime state to `.autoresearch/` in the target repository.
- Do not commit `.autoresearch/`, `autoresearch-results.tsv`, `autoresearch-report.md`, or `autoresearch-memory.md` unless you intentionally want to share run outputs.

---

## Safety Notes

- Start with a measurable goal, metric, and verification command.
- Review generated reports before relying on unattended background runs.
- Keep verification mechanical; do not accept improvements based on intuition alone.
- Do not pipe remote install scripts into a shell.

---

## Links

- Documentation: https://github.com/Maleick/AutoResearch/tree/main/docs
- Wiki: https://github.com/Maleick/AutoResearch/wiki
- Releases: https://github.com/Maleick/AutoResearch/releases
- Issues: https://github.com/Maleick/AutoResearch/issues
- Hermes docs: https://hermes-agent.nousresearch.com/docs
