#!/bin/sh
# Stop hook for Auto Research
# Marks the background run as stopping if one is active.

set -e

# ── Auto-sync: pull latest plugin code before stop ──
if [ -z "${AUTORESEARCH_NO_SYNC:-}" ]; then
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [ -n "$repo_root" ]; then
    cd "$repo_root" || exit 1
    # Only sync if we have a valid git remote (skip temp/policy-test repos)
    if git rev-parse --verify HEAD >/dev/null 2>&1 && git remote get-url origin >/dev/null 2>&1; then
      sync_gap=$(git log --oneline HEAD..origin/main 2>/dev/null | wc -l | tr -d ' ')
      if [ "$sync_gap" -gt 0 ] 2>/dev/null; then
        echo "[autoresearch-sync] $sync_gap commit(s) behind origin/main — pulling..."
        git pull origin main >/dev/null 2>&1 || echo "[autoresearch-sync] WARN: git pull failed, continuing with local code"
      fi
    fi
  fi
fi

STATUS_FILE="${AUTORESEARCH_STATE:-.autoresearch/state.json}"
WORKSPACE_ROOT="$(pwd -P)"

case "$STATUS_FILE" in
  /*) STATUS_FILE_ABS="$STATUS_FILE" ;;
  *) STATUS_FILE_ABS="$WORKSPACE_ROOT/$STATUS_FILE" ;;
esac

if [ -L "$STATUS_FILE_ABS" ]; then
  echo "Refusing symlinked state file."
  exit 0
fi

STATUS_DIR="${STATUS_FILE_ABS%/*}"
STATUS_NAME="${STATUS_FILE_ABS##*/}"
STATUS_DIR_REAL="$(cd "$STATUS_DIR" 2>/dev/null && pwd -P)" || {
  echo "No active run."
  exit 0
}
STATUS_FILE_REAL="$STATUS_DIR_REAL/$STATUS_NAME"
WORKSPACE_STATE_DIR="$WORKSPACE_ROOT/.autoresearch"

case "$STATUS_FILE_REAL" in
  "$WORKSPACE_STATE_DIR"/*) ;;
  *)
    echo "Refusing state file outside workspace."
    exit 0
    ;;
esac

if [ -f "$STATUS_FILE_ABS" ]; then
  mode=$(AUTORESEARCH_STATUS_FILE="$STATUS_FILE_ABS" node --input-type=module -e '
    import { readFileSync } from "fs";
    const statusFile = process.env.AUTORESEARCH_STATUS_FILE;
    if (!statusFile) throw new Error("Missing AUTORESEARCH_STATUS_FILE");
    const s = JSON.parse(readFileSync(statusFile, "utf8"));
    console.log(s.mode || "");
  ' 2>/dev/null || true)
  if [ "$mode" = "background" ]; then
    AUTORESEARCH_STATUS_FILE="$STATUS_FILE_ABS" node --input-type=module -e '
      import { readFileSync, renameSync, writeFileSync } from "fs";
      const statusFile = process.env.AUTORESEARCH_STATUS_FILE;
      if (!statusFile) throw new Error("Missing AUTORESEARCH_STATUS_FILE");
      const s = JSON.parse(readFileSync(statusFile, "utf8"));
      s.updated_at = new Date().toISOString();
      s.flags.stop_requested = true;
      s.flags.background_active = false;
      s.status = "stopping";
      const tmp = `${statusFile}.tmp.${process.pid}`;
      writeFileSync(tmp, JSON.stringify(s, null, 2) + "\n", { mode: 0o600 });
      renameSync(tmp, statusFile);
      console.log("Stop requested for run: " + s.run_id);
    ' 2>/dev/null || echo "Could not update state."
  else
    echo "Only background runs can be stopped."
  fi
else
  echo "No active run."
fi
