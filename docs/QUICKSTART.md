# Quick Start Guide

## Installation

### OpenCode

```bash
npm install -g opencode-autoresearch
autoresearch doctor
```

### Hermes Agent

```bash
# 1. Install the skill
git clone https://github.com/Maleick/AutoResearch.git
cd AutoResearch
npm install
mkdir -p ~/.hermes/skills/software-development/autoresearch
cp skills/hermes/autoresearch-prompt.md ~/.hermes/skills/software-development/autoresearch/SKILL.md
cp skills/hermes/INTEGRATION.md ~/.hermes/skills/software-development/autoresearch/REFERENCES.md

# 2. Create a cronjob
hermes cron create \
  --name "autoresearch-loop" \
  --workdir ~/projects/AutoResearch \
  --skill autoresearch-hermes \
  "every 15m" \
  "Run AutoResearch iteration loop. Detect phase from .autoresearch/state.json and execute one phase."
```

## Basic Usage

### 1. Initialize a run

```bash
autoresearch init \
  --goal "Improve response time" \
  --metric "response_time_ms" \
  --direction "lower" \
  --verify "npm test"
```

### 2. Check status

```bash
autoresearch status
```

### 3. Record an iteration

```bash
autoresearch record \
  --decision keep \
  --metric-value "120" \
  --verify-status pass \
  --change-summary "Optimized database queries" \
  --labels "perf,database"
```

### 4. View history

```bash
autoresearch history
```

### 5. Complete the run

```bash
autoresearch complete
```

## Background Runs

For overnight or long-running improvements:

```bash
autoresearch init \
  --goal "Refactor codebase" \
  --metric "complexity" \
  --direction "lower" \
  --verify "npm test" \
  --mode background \
  --iterations 20

autoresearch launch
# ... work on other things ...
autoresearch status
```

### Hermes Background Runs

```bash
# Create config
cat > autoresearch-config.json <<'EOF'
{
  "goal": "Improve test coverage",
  "metric": "coverage_pct",
  "direction": "higher",
  "verify": "npm run test:coverage",
  "guard": "npm run typecheck",
  "max_iterations": 20,
  "mode": "background"
}
EOF

# Start cron
hermes cron resume autoresearch-loop

# Check progress
cat .autoresearch/state.json | jq .
```

## Self-Improvement

Run AutoResearch on itself:

```bash
autoresearch init \
  --goal "Improve test coverage" \
  --metric "test_count" \
  --direction "higher" \
  --verify "npm test" \
  --mode background
```

## Shell Completion

```bash
# Bash
autoresearch completion --shell bash >> ~/.bashrc

# Zsh
autoresearch completion --shell zsh >> ~/.zshrc

# Fish
autoresearch completion --shell fish >> ~/.config/fish/completions/autoresearch.fish
```

## Exporting Results

```bash
# JSON export
autoresearch export --format json > results.json

# Markdown report
autoresearch report > report.md
```
