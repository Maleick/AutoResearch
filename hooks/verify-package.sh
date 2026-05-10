#!/usr/bin/env bash
set -euo pipefail

# ── Auto-sync: pull latest plugin code before verify ──
if [[ -z "${AUTORESEARCH_NO_SYNC:-}" ]]; then
  repo_root="$(git rev-parse --show-toplevel 2>/dev/null || true)"
  if [[ -n "$repo_root" ]]; then
    cd "$repo_root" || exit 1
    # Only sync if we have a valid git remote (skip temp/policy-test repos)
    if git rev-parse --verify HEAD >/dev/null 2>&1 && git remote get-url origin >/dev/null 2>&1; then
      sync_gap=$(git log --oneline HEAD..origin/main 2>/dev/null | wc -l | tr -d ' ')
      if [[ "$sync_gap" =~ ^[0-9]+$ && "$sync_gap" -gt 0 ]]; then
        echo "[autoresearch-sync] $sync_gap commit(s) behind origin/main — pulling..."
        git pull origin main >/dev/null 2>&1 || echo "[autoresearch-sync] WARN: git pull failed, continuing with local code"
      fi
    fi
  fi
fi

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

PACK_JSON="$TMP_DIR/npm-pack-dry-run.json"
npm pack --dry-run --json --ignore-scripts > "$PACK_JSON"

node --input-type=module - "$PACK_JSON" <<'NODE'
import fs from "fs";

const packJsonPath = process.argv[2];
const raw = fs.readFileSync(packJsonPath, "utf8");
const packResult = JSON.parse(raw);
const entries = Array.isArray(packResult) ? packResult : [packResult];
const files = entries.flatMap((entry) => Array.isArray(entry.files) ? entry.files : []);

const allowedRoots = new Set(["dist", "hooks", "commands", "skills", ".opencode-plugin", ".vscode"]);
const allowedFiles = new Set([
  "package.json",
  "README.md",
  "LICENSE",
  "AGENTS.md",
  "VERSION",
  "INSTALL.md",
  "CHANGELOG.md",
  ".editorconfig",
  ".gitattributes",
  ".opencode/INSTALL.md",
  "plugins/autoresearch.ts",
  "docs/ARCHITECTURE.md",
  "docs/autoresearch-loop.svg",
  "docs/CNAME",
  "docs/index.html",
  "docs/OPENCODE_INSTALL.md",
  "docs/QUICKSTART.md",
  "docs/RELEASE.md",
]);
const requiredFiles = [
  "INSTALL.md",
  ".opencode/INSTALL.md",
  ".opencode-plugin/plugin.json",
  "AGENTS.md",
  "dist/cli.js",
  "dist/index.js",
  "dist/index.d.ts",
  "hooks/init.sh",
  "skills/autoresearch/SKILL.md",
  "commands/autoresearch.md",
  "CHANGELOG.md",
];

const normalizePath = (filePath) => filePath.replace(/^package\//, "");
const forbiddenFiles = new Set([
  "autoresearch-results.tsv",
  "autoresearch-report.md",
  "autoresearch-memory.md",
  "autoresearch-hook-context.json",
]);
const isForbidden = (filePath) =>
  filePath === ".autoresearch" ||
  filePath.startsWith(".autoresearch/") ||
  filePath === ".autoresearch-test-tmp" ||
  filePath.startsWith(".autoresearch-test-tmp/") ||
  forbiddenFiles.has(filePath);
const isAllowed = (filePath) => {
  if (allowedFiles.has(filePath)) return true;
  const [root] = filePath.split("/");
  return allowedRoots.has(root);
};

const violations = [];
const packageJson = JSON.parse(fs.readFileSync("package.json", "utf8"));

if (packageJson.bin?.["opencode-autoresearch"] !== "dist/cli.js") {
  violations.push("package.json bin.opencode-autoresearch must be dist/cli.js for npm global installs");
}

if (packageJson.repository?.url !== "git+https://github.com/Maleick/AutoResearch.git") {
  violations.push("package.json repository.url must use the npm-normalized git+https URL");
}

for (const file of files) {
  const filePath = normalizePath(String(file.path || ""));
  if (!filePath) continue;

  if (isForbidden(filePath)) {
    violations.push(`${filePath} is runtime state and must not be published`);
  } else if (!isAllowed(filePath)) {
    violations.push(`${filePath} is not in the package allowlist`);
  }
}

if (files.length === 0) {
  violations.push("npm pack dry-run returned no package files");
}

const packagedPaths = new Set(files.map((file) => normalizePath(String(file.path || ""))).filter(Boolean));
for (const requiredFile of requiredFiles) {
  if (!packagedPaths.has(requiredFile)) {
    violations.push(`${requiredFile} is required in the package`);
  }
}

if (violations.length > 0) {
  console.error("FAIL: npm package contains unexpected files:");
  for (const violation of violations) {
    console.error(`- ${violation}`);
  }
  process.exit(1);
}

console.log(`Package dry-run verified ${files.length} files`);
NODE
