#!/bin/sh
# Stop hook for Auto Research
# Marks the background run as stopping if one is active.

set -e

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
