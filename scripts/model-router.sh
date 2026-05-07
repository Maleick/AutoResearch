#!/usr/bin/env bash
# Autoresearch model router — same pattern as AutoShip
set -euo pipefail

CONFIG="${1:-config/model-routing.json}"
TASK_TYPE="${2:-research}"
COMPLEXITY="${3:-simple}"

if [[ ! -f "$CONFIG" ]]; then
  echo "opencode-zen/big-pickle"
  exit 0
fi

python3 - "$CONFIG" "$TASK_TYPE" "$COMPLEXITY" <<'PY' 2>/dev/null || echo "kimi-k2.6"
import json
import sys

try:
    config_path, task_type, complexity = sys.argv[1:4]
    with open(config_path, encoding="utf-8") as config_file:
        config = json.load(config_file)
    routing = config.get("routing", {}).get(task_type, {})
    tiers = routing.get("tiers", {})

    if complexity in ["complex", "hard", "critical"]:
        tier_order = ["paid", "free", "fallback"]
    else:
        tier_order = ["free", "paid", "fallback"]

    for tier_name in tier_order:
        tier = tiers.get(tier_name, [])
        if tier:
            print(tier[0])
            sys.exit(0)

    print("kimi-k2.6")
except Exception:
    print("kimi-k2.6")
PY
