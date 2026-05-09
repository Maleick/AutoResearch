#!/usr/bin/env bash
# cleanup.sh — AutoResearch artifact cleanup
# Removes stale temporary files, old experiment outputs, and oversized caches.

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APPLY=false

if [[ "${1:-}" == "--apply" ]]; then
  APPLY=true
elif [[ $# -gt 0 ]]; then
  echo "Usage: scripts/cleanup.sh [--apply]" >&2
  exit 2
fi

remove_path() {
  local path="$1"
  local label="$2"
  if [[ "$APPLY" == true ]]; then
    rm -rf -- "$path"
    echo "removed $label: $(basename "$path")"
  else
    echo "would remove $label: $(basename "$path")"
  fi
}

if [[ "$APPLY" == true ]]; then
  echo "AutoResearch cleanup starting..."
else
  echo "AutoResearch cleanup dry run. Pass --apply to delete files."
fi

# Clean old experiment outputs (>7 days)
if [[ -d "$REPO_ROOT/experiments" ]]; then
  find "$REPO_ROOT/experiments" -mindepth 1 -maxdepth 2 -type d -mtime +7 2>/dev/null | while read -r dir; do
    remove_path "$dir" "old experiment"
  done
fi

# Clean temporary research artifacts
if [[ -d "$REPO_ROOT/tmp" ]]; then
  find "$REPO_ROOT/tmp" -maxdepth 1 -type f -mtime +3 2>/dev/null | while read -r f; do
    remove_path "$f" "old temp"
  done
fi

# Clean node_modules/.cache if present
if [[ -d "$REPO_ROOT/node_modules/.cache" ]]; then
  remove_path "$REPO_ROOT/node_modules/.cache" "node_modules cache"
fi

# Report disk usage after cleanup
du -sh "$REPO_ROOT" 2>/dev/null || true
echo "AutoResearch cleanup done"
