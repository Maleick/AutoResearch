#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
RUNNER_PATH="${OPENCODE_RUNNER:-$SCRIPT_DIR/runner.sh}"

bash "$RUNNER_PATH"
