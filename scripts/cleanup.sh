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

  case "$path" in
    "$REPO_ROOT"/*) ;;
    *)
      echo "refusing to remove path outside repository: $path" >&2
      return 1
      ;;
  esac

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
  while IFS= read -r -d '' dir; do
    remove_path "$dir" "old experiment"
  done < <(find "$REPO_ROOT/experiments" -mindepth 1 -maxdepth 2 -type d -mtime +7 -print0 2>/dev/null)
fi

# Clean temporary research artifacts
if [[ -d "$REPO_ROOT/tmp" ]]; then
  while IFS= read -r -d '' f; do
    remove_path "$f" "old temp"
  done < <(find "$REPO_ROOT/tmp" -maxdepth 1 -type f -mtime +3 -print0 2>/dev/null)
fi

# Clean node_modules/.cache if present
if [[ -d "$REPO_ROOT/node_modules/.cache" ]]; then
  remove_path "$REPO_ROOT/node_modules/.cache" "node_modules cache"
fi

# Report disk usage after cleanup
du -sh "$REPO_ROOT" 2>/dev/null || true
echo "AutoResearch cleanup done"
