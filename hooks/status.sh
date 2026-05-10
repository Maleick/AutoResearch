#!/bin/sh
# Status hook for Auto Research
# Prints current run status from the state file.

set -e

# ── Auto-sync: pull latest plugin code before status check ──
if [ -z "${AUTORESEARCH_NO_SYNC:-}" ]; then
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$repo_root" ]; then
    cd "$repo_root" || exit 1
    sync_gap=$(git log --oneline HEAD..origin/main 2>/dev/null | wc -l | tr -d ' ')
    if [ "$sync_gap" -gt 0 ] 2>/dev/null; then
      echo "[autoresearch-sync] $sync_gap commit(s) behind origin/main — pulling..."
      git pull origin main >/dev/null 2>&1 || echo "[autoresearch-sync] WARN: git pull failed, continuing with local code"
    fi
  fi
fi

STATUS_FILE="${AUTORESEARCH_STATE:-.autoresearch/state.json}"

if [ -f "$STATUS_FILE" ]; then
  AUTORESEARCH_STATUS_FILE="$STATUS_FILE" node --input-type=module -e '
    import { readFileSync } from "fs";
    const statusFile = process.env.AUTORESEARCH_STATUS_FILE;
    if (!statusFile) throw new Error("Missing AUTORESEARCH_STATUS_FILE");
    const s = JSON.parse(readFileSync(statusFile, "utf8"));
    console.log("Auto Research run: " + s.run_id);
    console.log("Status: " + s.status);
    console.log("Mode: " + s.mode);
    console.log("Goal: " + s.goal);
    console.log("Iterations: " + s.stats.total_iterations);
    console.log("Kept: " + s.stats.kept + " | Discarded: " + s.stats.discarded);
    if (s.flags.needs_human) console.log("NEEDS HUMAN");
    if (s.flags.stop_requested) console.log("STOP REQUESTED");
  ' 2>/dev/null || echo "No active run."
else
  echo "No active run."
fi
