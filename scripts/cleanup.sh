#!/usr/bin/env bash
# cleanup.sh — AutoResearch artifact cleanup
# Removes stale temporary files, old experiment outputs, and oversized caches.

set -euo pipefail
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"

echo "AutoResearch cleanup starting..."

# Clean old experiment outputs (>7 days)
if [[ -d "$REPO_ROOT/experiments" ]]; then
  find "$REPO_ROOT/experiments" -mindepth 1 -maxdepth 2 -type d -mtime +7 2>/dev/null | while read -r dir; do
    rm -rf "$dir"
    echo "removed old experiment: $(basename "$dir")"
  done
fi

# Clean temporary research artifacts
find "$REPO_ROOT/tmp" -maxdepth 1 -type f -mtime +3 2>/dev/null | while read -r f; do
  rm -f "$f"
  echo "removed old temp: $(basename "$f")"
done

# Clean node_modules/.cache if present
if [[ -d "$REPO_ROOT/node_modules/.cache" ]]; then
  rm -rf "$REPO_ROOT/node_modules/.cache"
  echo "removed node_modules/.cache"
fi

# Report disk usage after cleanup
du -sh "$REPO_ROOT" 2>/dev/null || true
echo "AutoResearch cleanup done"
