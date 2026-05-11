#!/bin/sh
# Status hook for Auto Research
# Prints current run status from the state file.
#
# NOTE: This hook intentionally does NOT auto-sync. It must remain read-only
# with respect to git remotes so that `npm test` and status checks never
# mutate repository state.

set -e

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
