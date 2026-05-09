#!/usr/bin/env bash
# Living Doc Change Proposal Check
# Usage: ./scripts/check-doc-changes.sh [--dry-run] [base-ref]
#
# This script checks if documentation needs updating when behavior-changing
# code is modified. It prevents broad automated rewrites of unrelated docs.

set -euo pipefail

DRY_RUN=false
BASE_REF="${1:-HEAD~1}"

if [[ "${1:-}" == "--dry-run" ]]; then
  DRY_RUN=true
  BASE_REF="${2:-HEAD~1}"
fi

echo "Checking documentation changes against ${BASE_REF}..."
echo ""

# Get list of changed files
CHANGED_FILES=$(git diff --name-only "${BASE_REF}" HEAD || true)

if [[ -z "$CHANGED_FILES" ]]; then
  echo "No files changed."
  exit 0
fi

# Check for behavior changes in key files
BEHAVIOR_CHANGES=false
BEHAVIOR_FILES=()

for file in $CHANGED_FILES; do
  case "$file" in
    src/cli.ts|src/run-manager.ts|src/helpers.ts|src/types.ts|src/constants.ts)
      BEHAVIOR_CHANGES=true
      BEHAVIOR_FILES+=("$file")
      ;;
    src/*.ts)
      BEHAVIOR_CHANGES=true
      BEHAVIOR_FILES+=("$file")
      ;;
    commands/*.md|skills/*/*.md)
      BEHAVIOR_CHANGES=true
      BEHAVIOR_FILES+=("$file")
      ;;
  esac
done

if [[ "$BEHAVIOR_CHANGES" == "false" ]]; then
  echo "No behavior-changing files modified. Documentation checks not required."
  exit 0
fi

echo "Behavior-changing files modified:"
for file in "${BEHAVIOR_FILES[@]}"; do
  echo "  - ${file}"
done
echo ""

# Check if corresponding docs were updated
DOC_UPDATES=false
MISSING_DOCS=()

for file in "${BEHAVIOR_FILES[@]}"; do
  case "$file" in
    src/cli.ts)
      if echo "$CHANGED_FILES" | grep -q "docs/CLI_CONTRACT.md\|README.md\|INSTALL.md"; then
        DOC_UPDATES=true
      else
        MISSING_DOCS+=("docs/CLI_CONTRACT.md or README.md (for CLI changes)")
      fi
      ;;
    src/run-manager.ts)
      if echo "$CHANGED_FILES" | grep -q "docs/ARCHITECTURE.md\|skills/autoresearch/references/loop-workflow.md"; then
        DOC_UPDATES=true
      else
        MISSING_DOCS+=("docs/ARCHITECTURE.md or skills/autoresearch/references/loop-workflow.md (for run manager changes)")
      fi
      ;;
    src/helpers.ts)
      if echo "$CHANGED_FILES" | grep -q "docs/ARCHITECTURE.md\|README.md"; then
        DOC_UPDATES=true
      else
        MISSING_DOCS+=("docs/ARCHITECTURE.md or README.md (for helper changes)")
      fi
      ;;
    src/types.ts)
      if echo "$CHANGED_FILES" | grep -q "docs/ARCHITECTURE.md\|docs/CLI_CONTRACT.md"; then
        DOC_UPDATES=true
      else
        MISSING_DOCS+=("docs/ARCHITECTURE.md or docs/CLI_CONTRACT.md (for type changes)")
      fi
      ;;
    commands/*.md|skills/*/*.md)
      # Skill/command changes should update corresponding docs
      if echo "$CHANGED_FILES" | grep -q "README.md\|wiki/"; then
        DOC_UPDATES=true
      else
        MISSING_DOCS+=("README.md or wiki/ (for command/skill changes)")
      fi
      ;;
  esac
done

echo "Documentation status:"
if [[ ${#MISSING_DOCS[@]} -gt 0 ]]; then
  echo "  MISSING updates for:"
  for doc in "${MISSING_DOCS[@]}"; do
    echo "    - ${doc}"
  done
  echo ""
  if [[ "$DRY_RUN" == "true" ]]; then
    echo "[DRY-RUN] Would fail CI - documentation updates required"
    exit 0
  else
    echo "FAIL: Documentation updates required for behavior changes"
    exit 1
  fi
else
  echo "  All required documentation updates present."
  exit 0
fi
