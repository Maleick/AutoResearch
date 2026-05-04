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

python3 -c "
import json, sys
try:
    config = json.load(open('$CONFIG'))
    routing = config.get('routing', {}).get('$TASK_TYPE', {})
    tiers = routing.get('tiers', {})
    
    if '$COMPLEXITY' in ['complex', 'hard', 'critical']:
        tier_order = ['paid', 'free', 'fallback']
    else:
        tier_order = ['free', 'paid', 'fallback']
    
    for tier_name in tier_order:
        tier = tiers.get(tier_name, [])
        if tier:
            print(tier[0])
            sys.exit(0)
    
    print('kimi-k2.6')
except Exception as e:
    print('kimi-k2.6')
" 2>/dev/null || echo "kimi-k2.6"
