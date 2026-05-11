import { constants as fsConstants, lstatSync, openSync, fstatSync, readFileSync, closeSync, readSync } from "fs";
import { sanitizeForTerminal } from "./helpers.js";
import type { BranchSelectionPolicy } from "./types.js";

export const VERSION_FLAGS = ["--version", "-v"];
export const HELP_FLAGS = ["--help", "-h", "help"];
export const BRANCH_POLICIES = ["best", "roulette", "diverse"] as const;

export type BranchPolicyType = typeof BRANCH_POLICIES[number];
export type SkipReason = "version_flag" | "help_flag" | "env_opt_out" | "ci_environment" | null;

export const tsvField = (headers: string[], cols: string[], field: string, legacyIndex: number): string => {
  const fieldIndex = headers.indexOf(field);
  if (fieldIndex >= 0) return cols[fieldIndex] ?? "";
  return cols[legacyIndex] ?? "";
};

const markdownInlineEscapes: Record<string, string> = {
  "\\": "\\\\", "`": "\\`", "*": "\\*", "_": "\\_", "{": "\\{", "}": "\\}",
  "[": "\\[", "]": "\\]", "(": "\\(", ")": "\\)", "#": "\\#", "+": "\\+",
  "-": "\\-", ".": "\\.", "!": "\\!", "|": "\\|",
};

const markdownHtmlEscapes: Record<string, string> = {
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;",
};

export const escapeMarkdownInline = (value: unknown): string => {
  return sanitizeForTerminal(value ?? "")
    .replace(/[&<>"]/g, (char) => markdownHtmlEscapes[char]!)
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .replace(/[\\`*_{}\[\]()#+\-.!|]/g, (char) => markdownInlineEscapes[char]!);
};

export const escapeMarkdownTableCell = (value: unknown): string => {
  const escaped = escapeMarkdownInline(value);
  return escaped.length > 0 ? escaped : "\u2014";
};

export const formatDisplayValue = (val: unknown): string => {
  if (val === undefined || val === null) return "\u2014";
  return sanitizeForTerminal(val);
};

export const parseMemoryPatternHeading = (heading: string): string => {
  const raw = heading.replace(/^### Pattern: /, "");
  const trimmed = raw.trimEnd();
  if (trimmed.startsWith('"')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "string") return parsed;
    } catch {
      // Fall through
    }
  }
  return trimmed;
};

export const formatMetricValue = formatDisplayValue;

export const formatTimestamp = (ts: string): string => {
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return ts;
  }
};

export const MAX_SCORE_HISTORY_BYTES = 10 * 1024 * 1024;

export const assertRegularBoundedFile = (filePath: string): void => {
  const linkStats = lstatSync(filePath);
  if (linkStats.isSymbolicLink()) {
    throw new Error(`Refusing to read score history symlink: ${filePath}`);
  }
  if (!linkStats.isFile()) {
    throw new Error(`Refusing to read non-regular score history file: ${filePath}`);
  }
  if (linkStats.size > MAX_SCORE_HISTORY_BYTES) {
    throw new Error(`Score history is too large to read safely (${linkStats.size} bytes; max ${MAX_SCORE_HISTORY_BYTES} bytes): ${filePath}`);
  }
};

export const readScoreHistoryFile = (filePath: string): string => {
  assertRegularBoundedFile(filePath);
  if (typeof fsConstants.O_NOFOLLOW !== "number") {
    throw new Error("Platform does not support O_NOFOLLOW");
  }
  const fd = openSync(filePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const fileStats = fstatSync(fd);
    if (!fileStats.isFile()) {
      throw new Error("Refusing to read non-regular score history: " + filePath);
    }
    if (fileStats.size > MAX_SCORE_HISTORY_BYTES) {
      throw new Error(`Score history too large: ${fileStats.size} bytes`);
    }
    return readFileSync(fd, "utf-8");
  } finally {
    closeSync(fd);
  }
};

export const readTailLines = (filePath: string, limit: number): string[] => {
  if (limit <= 0) return [];
  const fd = openSync(filePath, "r");
  try {
    const size = fstatSync(fd).size;
    if (size === 0) return [];
    const chunkSize = 64 * 1024;
    const lines: string[] = [];
    let position = size;
    let remainder = Buffer.alloc(0);
    while (position > 0 && lines.length < limit) {
      const bytesToRead = Math.min(chunkSize, position);
      position -= bytesToRead;
      const chunk = Buffer.alloc(bytesToRead);
      const bytesRead = readSync(fd, chunk, 0, bytesToRead, position);
      const data = Buffer.concat([chunk.subarray(0, bytesRead), remainder]);
      let end = data.length;
      for (let i = data.length - 1; i >= 0 && lines.length < limit; i -= 1) {
        if (data[i] === 0x0a) {
          const line = data.subarray(i + 1, end).toString("utf-8").trim();
          if (line.length > 0) lines.push(line);
          end = i;
        }
      }
      remainder = data.subarray(0, end);
    }
    if (lines.length < limit) {
      const line = remainder.toString("utf-8").trim();
      if (line.length > 0) lines.push(line);
    }
    return lines.reverse();
  } finally {
    closeSync(fd);
  }
};

export const markdownEscapePattern = /([\\`*_{}[\]()#+\-.!|>])/g;
export const terminalControlPattern = /\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~]|\][^\x07]*(?:\x07|\x1B\\))/g;
export const controlCharacterPattern = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F]/g;

export const sanitizeMarkdownText = (value: unknown): string => {
  if (value === undefined || value === null) return "\u2014";
  return String(value)
    .replace(terminalControlPattern, "")
    .replace(controlCharacterPattern, "")
    .replace(/\r?\n|\r/g, " ")
    .replace(/\t/g, " ");
};

export const formatMarkdownField = (value: unknown): string => {
  return sanitizeMarkdownText(value).replace(markdownEscapePattern, "\\$1");
};

export const normalizeBranchPolicy = (value: string | undefined): BranchSelectionPolicy => {
  if (value == null || value === "") return "best";
  if ((BRANCH_POLICIES as readonly string[]).includes(value)) return value as BranchSelectionPolicy;
  throw new Error(`Invalid branch policy: ${value}. Expected one of: ${BRANCH_POLICIES.join(", ")}`);
};

export const PROTO_POISON_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export const normalizeOverrideBranchPolicy = (branchId: string, value: string): BranchSelectionPolicy => {
  const trimmed = value.trim();
  if (trimmed === "") {
    throw new Error(`Invalid branch policy override for ${branchId}: value must not be empty`);
  }
  if ((BRANCH_POLICIES as readonly string[]).includes(trimmed)) return trimmed as BranchSelectionPolicy;
  throw new Error(`Invalid branch policy override for ${branchId}: "${trimmed}" is not one of: ${BRANCH_POLICIES.join(", ")}`);
};

export const parseBranchPolicyOverrides = (value: string | undefined): Record<string, BranchSelectionPolicy> | undefined => {
  if (value == null || value === "") return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Invalid branch policy overrides: expected a JSON object");
  }
  if (parsed == null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Invalid branch policy overrides: expected a JSON object");
  }
  const overrides = Object.create(null) as Record<string, BranchSelectionPolicy>;
  for (const [branchId, branchPolicy] of Object.entries(parsed)) {
    if (PROTO_POISON_KEYS.has(branchId)) {
      throw new Error(`Invalid branch policy override key: "${branchId}" is not a valid draft ID`);
    }
    if (typeof branchPolicy !== "string") {
      throw new Error(`Invalid branch policy override for ${branchId}: expected a string`);
    }
    overrides[branchId] = normalizeOverrideBranchPolicy(branchId, branchPolicy);
  }
  return overrides;
};

export const parseArgs = (args: string[]): Record<string, string> => {
  const result: Record<string, string> = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      const longArg = args[i];
      const equalsIndex = longArg.indexOf("=");
      if (equalsIndex > 2) {
        result[longArg.slice(2, equalsIndex)] = longArg.slice(equalsIndex + 1);
        continue;
      }
      const key = longArg.slice(2);
      if (i + 1 < args.length && !args[i + 1].startsWith("--") && !args[i + 1].startsWith("-")) {
        result[key] = args[++i];
      } else {
        result[key] = "true";
      }
    } else if (args[i].startsWith("-") && args[i].length === 2 && args[i] !== "--") {
      const shortToLong: Record<string, string> = {
        r: "repo", g: "goal", m: "metric", d: "direction",
        v: "verify", n: "guard", o: "mode", s: "scope",
        i: "iterations", t: "duration",
        f: "num-drafts", b: "branch-policy",
        p: "max-no-progress",
      };
      const key = shortToLong[args[i][1]] ?? args[i].slice(1);
      if (i + 1 < args.length && !args[i + 1].startsWith("-")) {
        result[key] = args[++i];
      } else {
        result[key] = "true";
      }
    }
  }
  return result;
};

export const shouldSkipUpdateCheck = (args: string[]): { skip: boolean; reason: SkipReason } => {
  if (args.length > 0 && VERSION_FLAGS.includes(args[0])) {
    return { skip: true, reason: "version_flag" };
  }
  if (args.length > 0 && HELP_FLAGS.includes(args[0])) {
    return { skip: true, reason: "help_flag" };
  }
  if (process.env.AUTORESEARCH_NO_UPDATE === "1") {
    return { skip: true, reason: "env_opt_out" };
  }
  if (process.env.CI === "true" || process.env.CI === "1") {
    return { skip: true, reason: "ci_environment" };
  }
  return { skip: false, reason: null };
};
