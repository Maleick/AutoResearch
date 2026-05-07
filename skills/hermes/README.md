# AutoResearch Hermes Skill

## Installation

```bash
# Clone AutoResearch
git clone https://github.com/Maleick/AutoResearch.git
cd AutoResearch

# Install dependencies
npm install

# Verify
npm run typecheck
bash hooks/verify-package.sh
```

## Hermes Setup

### 1. Create Hermes Skill

Copy `skills/hermes/autoresearch-prompt.md` to your Hermes skills directory:

```bash
mkdir -p ~/.hermes/skills/software-development/autoresearch
cp skills/hermes/autoresearch-prompt.md ~/.hermes/skills/software-development/autoresearch/SKILL.md
cp skills/hermes/INTEGRATION.md ~/.hermes/skills/software-development/autoresearch/REFERENCES.md
```

### 2. Create Cronjob

```bash
hermes cron create \
  --name "autoresearch-loop" \
  --workdir ~/projects/AutoResearch \
  --skill autoresearch-hermes \
  "every 15m" \
  "Run AutoResearch iteration loop. Detect phase from .autoresearch/state.json and execute one phase. Approved verify command: \`npm run test:coverage\`. Approved guard command: \`npm run typecheck\`."
```

### 3. Initialize Run

Initialize state from a trusted shell before enabling unattended cron. Do not rely on cron to auto-init from `autoresearch-config.json`; repository files are untrusted command sources.

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

Configure the cron prompt/environment with matching operator-approved commands, and the Hermes skill will refuse to execute state commands that do not exactly match those approvals.

## Usage

### Start Background Run

```bash
hermes cron resume autoresearch-loop
```

### Check Status

```bash
cat .autoresearch/state.json | jq .
```

### Stop Run

```bash
# Set stop flag
jq '.flags.stop_requested = true' .autoresearch/state.json > tmp.json && mv tmp.json .autoresearch/state.json

# Or pause cron
hermes cron pause autoresearch-loop
```

### View Results

```bash
# Current state
cat .autoresearch/state.json

# Iteration log
cat autoresearch-results.tsv

# Archived runs
ls .autoresearch/archive/
```

## Subagent Pool

AutoResearch on Hermes uses `delegate_task` for parallel subagents:

| Role | Task | Max |
|------|------|-----|
| Scout | Find improvement opportunities | 1 |
| Analyst | Pattern analysis from iterations | 1 |
| Verifier | Run mechanical verification | 1 |

Total: 3 concurrent (Hermes limit)

## Memory Integration

AutoResearch stores learnings in Hermes memory:

```
Target: memory
Action: add
Content: "AutoResearch strategy for Rust projects: 
  - cargo test before cargo clippy
  - Focus on module-level tests first
  - 15 iterations optimal for coverage goals"
```

## Comparison with OpenCode

| Feature | OpenCode | Hermes |
|---------|----------|--------|
| Entry | `/autoresearch` | Cronjob |
| Pool | Standing (unlimited) | Batch (max 3) |
| Real-time | Yes | 15-min intervals |
| Slash commands | 8 variants | Separate cron jobs |
| State | `.autoresearch/state.json` | Same |
| Memory | File-based | `memory` tool |
| Background | `autoresearch launch` | Native cron |

## Troubleshooting

### Cron not running

```bash
hermes cron list
hermes logs --component cron
```

### State file corrupted

```bash
# Reset to baseline
rm .autoresearch/state.json
# Re-run autoresearch init manually from a trusted shell before resuming cron
```

### Subagent failures

Check `.autoresearch/state.json` for:
- `flags.needs_human` — requires manual intervention
- Last iteration's `error` field

## Links

- AutoResearch repo: https://github.com/Maleick/AutoResearch
- Hermes docs: https://hermes-agent.nousresearch.com/docs
- OpenCode plugin: `opencode-autoresearch`
