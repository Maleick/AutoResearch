import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { resolveRepo, sanitizeForTerminal } from "./helpers.js";
import { VERSION } from "./constants.js";

export interface WhatsNew {
  version: string;
  title: string;
  date?: string;
  features: string[];
  fixes: string[];
  breaking: string[];
  body: string;
}

const CHANGELOG_PATH = "CHANGELOG.md";

function findChangelog(repo?: string): string | null {
  const candidates = [
    resolve(resolveRepo(repo), CHANGELOG_PATH),
    resolve(process.cwd(), CHANGELOG_PATH),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return null;
}

export function getWhatsNew(repo?: string): WhatsNew | null {
  const changelogPath = findChangelog(repo);
  if (!changelogPath) return null;

  const content = readFileSync(changelogPath, "utf-8");
  const lines = content.split("\n");

  // Find the latest version header
  let currentSection: "header" | "features" | "fixes" | "breaking" = "header";
  const result: WhatsNew = {
    version: VERSION,
    title: VERSION,
    features: [],
    fixes: [],
    breaking: [],
    body: "",
  };

  let sectionLines: string[] = [];
  let started = false;
  let ended = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (!started) {
      if (line.startsWith("# ")) {
        started = true;
      }
      continue;
    }

    if (started && !ended) {
      // Next version header ends the section
      if (line.startsWith("# ") && i > 0 && lines[i - 1]?.trim() === "") {
        ended = true;
        continue;
      }

      // Check if this is a sub-section header
      if (line.trim() === "### Features" || line.trim() === "### Bug Fixes" || line.trim() === "### Bug Fixs") {
        currentSection = "features";
        if (line.includes("Bug")) currentSection = "fixes";
        continue;
      }
      if (line.trim() === "### BREAKING CHANGES" || line.trim() === "### Breaking Changes") {
        currentSection = "breaking";
        continue;
      }

      // Collect items
      const trimmed = line.trim();
      if (trimmed.startsWith("* ")) {
        const cleaned = trimmed.slice(2).replace(/\\\`/g, "`");
        if (currentSection === "features") result.features.push(cleaned);
        else if (currentSection === "fixes") result.fixes.push(cleaned);
        else if (currentSection === "breaking") result.breaking.push(cleaned);
      }

      sectionLines.push(line);
    }
  }

  result.body = sectionLines.join("\n");
  return result;
}

export function formatWhatsNew(wn: WhatsNew): string {
  const lines: string[] = [];
  lines.push(`What's New in ${sanitizeForTerminal(wn.version)}`);
  lines.push("=".repeat(lines[0].length));
  lines.push("");

  if (wn.features.length > 0) {
    lines.push("Features:");
    for (const f of wn.features) {
      lines.push(`  + ${sanitizeForTerminal(f)}`);
    }
    lines.push("");
  }

  if (wn.fixes.length > 0) {
    lines.push("Fixes:");
    for (const f of wn.fixes) {
      lines.push(`  - ${sanitizeForTerminal(f)}`);
    }
    lines.push("");
  }

  if (wn.breaking.length > 0) {
    lines.push("BREAKING:");
    for (const b of wn.breaking) {
      lines.push(`  ! ${sanitizeForTerminal(b)}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}
