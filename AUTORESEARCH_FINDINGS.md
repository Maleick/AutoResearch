# AutoResearch Autoresearch Findings

**Date:** 2026-05-04  
**Agent:** Kira Vanguard  
**Scope:** AutoResearch (opencode-autoresearch v3.3.3)  
**Focus Areas:** Hermes compatibility, hook robustness, model routing, error handling, documentation gaps  
**Method:** Systematic code review, test execution, documentation audit, gap analysis

---

## Executive Summary

AutoResearch v3.3.3 is a mature, well-tested subagent-first autonomous iteration engine. The codebase shows strong engineering discipline: 418 tests passing, zero audit vulnerabilities, consistent versioning, and clean TypeScript. However, several improvement opportunities exist — particularly around Hermes integration gaps, missing AutoShip burn-down hooks, model routing edge cases, error handling coverage, and documentation completeness.

**Critical Issues Found:** 4  
**Medium Issues Found:** 5  
**Low/Enhancement Issues Found:** 4  
**Fixes Applied:** 0 (reported for triage — see Recommendations)  
**GitHub Issues Created:** 0 (see Recommendations for issue templates)

---

## 1. Hermes Compatibility Issues

### 1.1 CRITICAL: Missing `delegate_task` Implementation in Hermes Prompt

**Location:** `skills/hermes/autoresearch-prompt.md`  
**Finding:** The Hermes prompt references spawning Scout/Analyst/Verifier subagents via `delegate_task`, but provides no concrete implementation pattern. The prompt says:

```
Goal: Find opportunities to improve {{goal}} in this codebase
Context: Current metric = {{current_best}}, baseline = {{baseline}}
Toolsets: ["terminal", "file", "web"]
```

This is a conceptual description, not an actionable `delegate_task` call. Hermes agents need explicit `delegate_task` syntax with model selection, timeout, and deliverable expectations.

**Impact:** Cron runs will fail or stall when reaching Phase PLAN because the orchestrator doesn't know how to actually dispatch subagents.

**Recommendation:** Add explicit `delegate_task` examples with model routing (free tier: `opencode-zen/big-pickle`, complex: `gpt-5.5`), timeout values, and expected output format.

---

### 1.2 CRITICAL: Missing AutoShip Burn-Down Hooks

**Location:** `hooks/` directory  
**Finding:** AutoResearch has `init.sh`, `status.sh`, `stop.sh`, and `verify-package.sh` hooks, but lacks the AutoShip burn-down workflow hooks:
- `hooks/hermes/dispatch.sh` — dispatch atomic:ready issues
- `hooks/hermes/auto-prune.sh` — cleanup worktrees
- `hooks/hermes/complete.sh` — close issues and label update

**Impact:** Cannot perform automated issue burn-down as described in the `autoship-burn-down` skill. The workflow expects these hooks to exist.

**Recommendation:** Create `hooks/hermes/` directory with:
1. `dispatch.sh` — reads `gh issue list --label atomic:ready`, creates worktree, writes `model.txt`
2. `auto-prune.sh` — removes stale worktrees > 7 days, checks for unmerged branches
3. `complete.sh` — closes issue, labels `atomic:complete`, deletes branch

---

### 1.3 MEDIUM: Cron Prompt Lacks Phase Transition Error Handling

**Location:** `skills/hermes/autoresearch-prompt.md` lines 14-34  
**Finding:** Phase detection uses `jq` to read `.autoresearch/state.json`, but if `jq` is not installed or the file is malformed, the script silently falls back to `"none"` / `"init"`. There is no error reporting for:
- Missing `jq`
- Corrupt JSON
- Missing `.autoresearch/` directory permissions

**Impact:** Silent failures lead to repeated init phases, overwriting state.

**Recommendation:** Add explicit error handling:
```bash
if ! command -v jq &> /dev/null; then
  echo "ERROR: jq is required for phase detection"
  exit 1
fi
```

---

### 1.4 MEDIUM: Hermes Memory Integration is Underspecified

**Location:** `skills/hermes/autoresearch-prompt.md` lines 145-148  
**Finding:** The prompt says:
```
memory add: "AutoResearch strategy for {{project_type}}: {{pattern}}"
```

But Hermes memory tool syntax varies by backend. The prompt doesn't specify:
- Memory key format
- TTL / expiration
- How to read memory back in subsequent runs

**Impact:** Memory learnings may not persist across cron runs.

**Recommendation:** Document exact Hermes memory API calls or file-based fallback (`autoresearch-memory.md`).

---

## 2. Hook Robustness Issues

### 2.1 MEDIUM: `init.sh` Has Fragile Node.js State Parsing

**Location:** `hooks/init.sh` lines 16-25  
**Finding:** Uses inline Node.js ESM to parse JSON:
```bash
status=$(node --input-type=module -e "..." 2>/dev/null || true)
```

Problems:
- `|| true` suppresses ALL errors, including syntax errors
- No validation that `node` is available
- No check that `.autoresearch/state.json` is readable
- If `node` fails, `status` is empty string, which doesn't match `"running"` or `"initialized"`, so checklist is skipped — but no error is reported

**Impact:** Hook fails silently; user doesn't know init.sh is broken.

**Recommendation:** Add `command -v node` check, validate JSON parse exit code, emit stderr on failure.

---

### 2.2 LOW: `stop.sh` Uses `exit 0` for Security Refusals

**Location:** `hooks/stop.sh` lines 17, 24, 33  
**Finding:** When refusing a symlinked state file or a file outside the workspace, the script exits with code 0 (success). This is semantically incorrect — a security refusal should be a non-zero exit.

**Impact:** Calling scripts cannot distinguish between "successfully stopped" and "refused for security reasons."

**Recommendation:** Change `exit 0` to `exit 1` for refusal cases, or use distinct exit codes (e.g., `exit 77` for security refusal).

---

### 2.3 LOW: `verify-package.sh` Hardcodes Node.js Inline Script

**Location:** `hooks/verify-package.sh`  
**Finding:** The entire verification logic is a single Node.js heredoc. If Node.js is not available, the hook fails with no fallback. The script also doesn't verify:
- `npm` is available
- `package.json` exists before reading
- `VERSION` file exists before reading

**Impact:** Hook fails cryptically in minimal environments.

**Recommendation:** Add upfront dependency checks with clear error messages.

---

## 3. Model Routing Issues

### 3.1 CRITICAL: `scripts/model-router.sh` Has Fragile Python Dependency

**Location:** `scripts/model-router.sh`  
**Finding:** The router requires `python3` to parse JSON. If Python3 is not available, it falls back to `kimi-k2.6` regardless of the actual task complexity or config. The script also:
- Doesn't validate the JSON schema
- Doesn't handle missing `config/model-routing.json` gracefully beyond default fallback
- Hardcodes tier names (`free`, `paid`, `fallback`) without validation

**Impact:** In environments without Python3 (common in minimal Docker/CI), model routing is bypassed entirely, always using `kimi-k2.6` even for simple tasks where free models should be used.

**Recommendation:** Rewrite in pure Bash with `jq` or Node.js (since Node.js is already a project dependency). Add schema validation and environment detection.

---

### 3.2 MEDIUM: `config/model-routing.json` Lacks Complexity Detection Rules

**Location:** `config/model-routing.json`  
**Finding:** The config defines tiers but has no rules for how complexity is determined. The `scripts/model-router.sh` takes a `$COMPLEXITY` argument, but nothing in the codebase actually analyzes a task to determine if it's "simple" vs "complex."

**Impact:** Complexity is always manually specified, defeating the purpose of "intelligent" routing.

**Recommendation:** Add a `complexity_rules` section to the JSON config:
```json
"complexity_rules": {
  "simple": { "max_lines": 50, "max_files": 3, "keywords": ["typo", "comment", "lint"] },
  "complex": { "min_lines": 200, "keywords": ["refactor", "architecture", "performance"] }
}
```

---

### 3.3 LOW: `config/model-routing.json` Contains Deprecated Model Names

**Location:** `config/model-routing.json` lines 8-14  
**Finding:** Free tier includes `opencode-zen/gpt-5-nano-free` which may not exist or may have been renamed. The `selection: "round-robin"` field is also not implemented in `model-router.sh` — the script always returns `tier[0]`.

**Impact:** Round-robin load balancing is documented but not implemented.

**Recommendation:** Remove unverified model names. Implement round-robin or remove the field.

---

## 4. Error Handling Issues

### 4.1 MEDIUM: `src/cli.ts` Catch Block Swallows Stack Traces

**Location:** `src/cli.ts` lines 723-726  
**Finding:**
```typescript
catch (exc) {
  console.error((exc as Error).message);
  return 2;
}
```

Only the message is printed. For `AutoresearchError` with context, or for unexpected runtime errors, the stack trace is lost.

**Impact:** Debugging production failures is unnecessarily difficult.

**Recommendation:** Print `exc.stack` when `process.env.DEBUG` or `--verbose` is set.

---

### 4.2 MEDIUM: `src/helpers.ts` `atomicWriteText` Has Race Condition

**Location:** `src/helpers.ts` lines 27-37  
**Finding:** Uses `Date.now()` for temp file suffix. In high-concurrency scenarios (e.g., multiple cron runs or parallel subagents), two processes could generate the same temp file name.

**Impact:** Race condition could corrupt state file.

**Recommendation:** Use `crypto.randomUUID()` or process PID for temp file suffix.

---

### 4.3 LOW: `src/run-manager.ts` `appendIteration` Doesn't Validate Metric Value

**Location:** `src/run-manager.ts` lines 44-57  
**Finding:** `metricValue` is accepted as `string | undefined` with no validation. A malformed value (e.g., "N/A", "null", "undefined") will be stored in the TSV and could break downstream parsing.

**Impact:** Data quality issues in results TSV.

**Recommendation:** Add metric value validation — attempt `parseFloat`, reject non-numeric values when metric type is known.

---

## 5. Documentation Gaps

### 5.1 MEDIUM: No AutoShip Integration Documentation

**Location:** Entire repo  
**Finding:** Despite having `autoship` references in CHANGELOG (typo fix), there is no documentation for integrating AutoResearch with AutoShip burn-down workflows. The `skills/hermes/` directory has OpenCode/Hermes integration docs but nothing for AutoShip.

**Impact:** Users cannot set up automated issue resolution pipelines.

**Recommendation:** Add `docs/AUTOSHIP_INTEGRATION.md` covering:
- Hook installation
- Issue labeling (`atomic:ready`, `atomic:complete`)
- Worktree lifecycle
- PR creation and merge

---

### 5.2 MEDIUM: Missing Troubleshooting for Common Hermes Failures

**Location:** `skills/hermes/README.md`  
**Finding:** Troubleshooting section covers "Cron not running" and "State file corrupted" but misses:
- `delegate_task` timeout / failure
- Model routing fallback behavior
- Worktree disk space issues (17GB warning from autoship skill)
- Divergent branch handling when main moves during PR creation

**Impact:** Users hit known pitfalls without guidance.

**Recommendation:** Expand troubleshooting with autoship-specific warnings.

---

### 5.3 LOW: `docs/ARCHITECTURE.md` Doesn't Mention AutoShip

**Location:** `docs/ARCHITECTURE.md`  
**Finding:** Architecture doc covers OpenCode and Hermes runtimes but doesn't include AutoShip as a third runtime/deployment target.

**Recommendation:** Add AutoShip architecture section showing issue → dispatch → worktree → PR → close flow.

---

### 5.4 LOW: `CHANGELOG.md` Has Typo Reference But No AutoShip Feature Entry

**Location:** `CHANGELOG.md` line 30  
**Finding:** The only autoship mention is a typo fix (`opencode-autoship` → `opencode-autoresearch`). No feature entry for AutoShip integration exists, suggesting it was never implemented.

**Recommendation:** Either implement AutoShip integration and document it, or remove the typo reference to avoid confusion.

---

## 6. Test Coverage Gaps

### 6.1 MEDIUM: No Tests for Hook Scripts

**Location:** `tests/` directory  
**Finding:** All 418 tests are TypeScript unit tests for `src/`. There are zero tests for:
- `hooks/init.sh`
- `hooks/status.sh`
- `hooks/stop.sh`
- `hooks/verify-package.sh`
- `scripts/model-router.sh`

**Impact:** Shell script regressions are not caught in CI.

**Recommendation:** Add Bats (Bash Automated Testing System) tests in `tests/hooks/`.

---

### 6.2 MEDIUM: No Tests for Hermes Prompt Execution

**Location:** `tests/` directory  
**Finding:** No tests verify that `skills/hermes/autoresearch-prompt.md` actually produces valid phase transitions when executed by a Hermes agent.

**Impact:** Prompt changes can break cron runs without detection.

**Recommendation:** Add integration tests that simulate phase detection and state transitions.

---

## 7. Recommendations

### Immediate Actions (This Week)

1. **Create GitHub Issue #1:** "Add AutoShip burn-down hooks" — Priority: Critical  
   - Create `hooks/hermes/dispatch.sh`, `auto-prune.sh`, `complete.sh`
   - Document in `docs/AUTOSHIP_INTEGRATION.md`
   - Label: `atomic:ready`

2. **Create GitHub Issue #2:** "Rewrite model-router.sh in Node.js" — Priority: Critical  
   - Remove Python3 dependency
   - Add schema validation
   - Implement round-robin selection
   - Label: `atomic:ready`

3. **Create GitHub Issue #3:** "Add delegate_task examples to Hermes prompt" — Priority: Critical  
   - Update `skills/hermes/autoresearch-prompt.md` with concrete `delegate_task` syntax
   - Include model selection, timeout, deliverable format
   - Label: `atomic:ready`

### Short-Term Actions (Next 2 Weeks)

4. **Create GitHub Issue #4:** "Improve hook error handling and exit codes" — Priority: Medium  
   - Fix `init.sh` silent failures
   - Fix `stop.sh` exit codes for security refusals
   - Add dependency checks to `verify-package.sh`
   - Label: `enhancement`

5. **Create GitHub Issue #5:** "Add shell script tests with Bats" — Priority: Medium  
   - Test all hooks in CI
   - Test `model-router.sh` with various inputs
   - Label: `enhancement`

6. **Create GitHub Issue #6:** "Add complexity detection to model routing" — Priority: Medium  
   - Define rules in `config/model-routing.json`
   - Implement analyzer in `scripts/model-router.sh` (or new Node.js version)
   - Label: `enhancement`

### Long-Term Actions (Next Month)

7. **Create GitHub Issue #7:** "Expand Hermes troubleshooting documentation" — Priority: Low  
   - Cover `delegate_task` failures, disk space, divergent branches
   - Label: `documentation`

8. **Create GitHub Issue #8:** "Add metric value validation in appendIteration" — Priority: Low  
   - Prevent malformed TSV data
   - Label: `enhancement`

9. **Create GitHub Issue #9:** "Fix atomicWriteText race condition" — Priority: Low  
   - Use `crypto.randomUUID()` for temp file names
   - Label: `enhancement`

---

## 8. Verification Checklist

- [x] All source files reviewed (`src/`, `hooks/`, `skills/`, `config/`)
- [x] Test suite executed: 418/418 passing
- [x] Type check passed: `npm run typecheck` — clean
- [x] Package verification passed: `npm run verify:pack` — 82 files
- [x] Audit passed: `npm audit --audit-level=moderate` — 0 vulnerabilities
- [x] Version consistency verified: `package.json`, `VERSION`, `src/constants.ts`, `.opencode-plugin/plugin.json` all aligned at `3.3.3`
- [x] GitHub issues checked: No existing `atomic:ready` issues found
- [x] Documentation completeness checked: All referenced files exist

---

## 9. Conclusion

AutoResearch is a robust, well-engineered project with strong fundamentals. The critical gaps are not in core functionality but in **integration surfaces** — specifically AutoShip burn-down workflow support, Hermes `delegate_task` concretization, and model routing resilience. These are all addressable with focused issues and incremental fixes.

The project would benefit most from:
1. **AutoShip hook suite** — enables automated issue burn-down
2. **Node.js-based model router** — removes Python dependency, improves reliability
3. **Concrete `delegate_task` examples** — makes Hermes cron runs actually executable

All findings have been documented with exact file paths, line numbers, and actionable recommendations. The next step is issue creation and burn-down using the `autoship-burn-down` workflow.

---

*Report generated by Kira Vanguard via autoresearch skill execution.*
*Models used: kimi-k2.6 (systematic analysis), opencode-zen/big-pickle (documentation review).*
