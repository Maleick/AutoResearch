#!/usr/bin/env bash
set -euo pipefail

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

const allowedRoots = new Set(["dist", "hooks", "commands", "skills", "plugins", "docs", ".opencode-plugin"]);
const allowedFiles = new Set(["package.json", "README.md", "LICENSE", "AGENTS.md", "VERSION", ".opencode/INSTALL.md"]);
const requiredFiles = [
  ".opencode/INSTALL.md",
  ".opencode-plugin/plugin.json",
  "AGENTS.md",
  "hooks/init.sh",
  "skills/autoresearch/SKILL.md",
  "commands/autoresearch.md",
];

const normalizePath = (filePath) => filePath.replace(/^package\//, "");
const isForbidden = (filePath) => filePath === ".autoresearch" || filePath.startsWith(".autoresearch/");
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
