#!/bin/sh
# SessionStart hook for Auto Research
# Reads the current run state and emits a checklist if a managed run is active.

set -e

# ── Auto-sync: pull latest plugin code before init ──
if [ -z "${AUTORESEARCH_NO_SYNC:-}" ]; then
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$repo_root" ]; then
    cd "$repo_root" || exit 1
    # Only sync if we have a valid git remote (skip temp/policy-test repos)
    if git rev-parse --verify HEAD >/dev/null 2>&1 && git remote get-url origin >/dev/null 2>&1; then
      sync_gap="$(git log --oneline HEAD..origin/main 2>/dev/null | wc -l | tr -d ' ' || true)"
      if [ -n "$sync_gap" ] && [ "$sync_gap" -gt 0 ] 2>/dev/null; then
        echo "[autoresearch-sync] $sync_gap commit(s) behind origin/main — pulling..."
        git pull origin main >/dev/null 2>&1 || echo "[autoresearch-sync] WARN: git pull failed, continuing with local code"
      fi
    fi
  fi
fi

checklist() {
  echo "Auto Research checklist:"
  echo "- If this is a fresh managed run, baseline first, then initialize results/state artifacts."
  echo "- Record every completed experiment before starting the next one."
  echo "- Keep retain/stop label gates satisfied before marking an iteration as kept."
  echo "- Respect iteration and duration caps."
  echo "- After launch approval, continue by default unless the user stops the run."
}

if [ -f ".autoresearch/state.json" ]; then
  status=$(node --input-type=module -e "
    import { readFileSync } from 'fs';
    const s = JSON.parse(readFileSync('.autoresearch/state.json', 'utf8'));
    console.log(s.status || '');
  " 2>/dev/null || true)
  if [ "$status" = "running" ] || [ "$status" = "initialized" ]; then
    checklist
  fi
fi
