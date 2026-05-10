import { writeFileSync, mkdirSync, readFileSync, renameSync, unlinkSync, existsSync, realpathSync, openSync, closeSync, constants as fsConstants } from "fs";
import { resolve, dirname, join, relative, basename, isAbsolute } from "path";
import { execFileSync } from "child_process";
import { PACKAGE_NAME } from "./constants.js";

export { PACKAGE_NAME };

export class AutoresearchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AutoresearchError";
  }
}

export interface JsonEnvelope {
  [key: string]: unknown;
  ok: boolean;
  command: string;
  timestamp: string;
  data?: unknown;
  error?: {
    kind: string;
    code: string;
    message: string;
  };
}

export function printJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

function legacyJsonFields(data: unknown): Record<string, unknown> {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return {};
  }
  const { error: _reservedError, ...fields } = data as Record<string, unknown>;
  return fields;
}

export function printJsonEnvelope(command: string, data: unknown, ok = true, error?: JsonEnvelope["error"]): void {
  const envelope: JsonEnvelope = {
    ...legacyJsonFields(data),
    ok,
    command,
    timestamp: new Date().toISOString(),
    ...(ok ? { data } : {}),
    ...(error ? { error } : {}),
  };
  console.log(JSON.stringify(envelope, null, 2));
}

export function sanitizeForTerminal(value: unknown): string {
  return String(value).replace(/[\x00-\x1f\x7f-\x9f]/g, (char) => {
    switch (char) {
      case "\n": return "\\n";
      case "\r": return "\\r";
      case "\t": return "\\t";
      default: return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
    }
  });
}

export function utcNow(): string {
  return new Date().toISOString().replace("Z", "+00:00").split("+")[0] + "Z";
}

export function resolveRepo(repo?: string): string {
  return repo ?? process.cwd();
}

export function ensureParent(filePath: string): void {
  mkdirSync(dirname(filePath), { recursive: true });
}

export function atomicWriteText(filePath: string, content: string): void {
  ensureParent(filePath);
  const tmp = filePath + ".tmp." + Date.now();
  writeFileSync(tmp, content, "utf-8");
  try {
    renameSync(tmp, filePath);
  } catch {
    try { unlinkSync(tmp); } catch { /* ignore */ }
    throw new AutoresearchError("Failed to write " + filePath);
  }
}

function isPathInside(parent: string, child: string): boolean {
  const rel = relative(parent, child);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

function nearestExistingAncestor(pathName: string): string {
  let current = pathName;
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) return current;
    current = parent;
  }
  return current;
}

export function atomicWriteTextInRepo(repo: string | undefined, filePath: string, content: string): void {
  const repoRoot = realpathSync(resolveRepo(repo));
  const targetPath = resolve(filePath);
  const targetParent = dirname(targetPath);
  const existingAncestor = nearestExistingAncestor(targetParent);
  const existingAncestorReal = realpathSync(existingAncestor);

  if (!isPathInside(repoRoot, existingAncestorReal)) {
    throw new AutoresearchError("Refusing to write outside repository: " + targetPath);
  }

  mkdirSync(targetParent, { recursive: true });
  const targetParentReal = realpathSync(targetParent);
  if (!isPathInside(repoRoot, targetParentReal)) {
    throw new AutoresearchError("Refusing to write outside repository: " + targetPath);
  }

  const tmp = join(targetParent, `.autoresearch-${basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
  let fd: number | undefined;
  try {
    fd = openSync(tmp, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL, 0o600);
    writeFileSync(fd, content, "utf-8");
    closeSync(fd);
    fd = undefined;
    renameSync(tmp, targetPath);
  } catch (err) {
    if (fd !== undefined) {
      try { closeSync(fd); } catch { /* ignore */ }
    }
    try { unlinkSync(tmp); } catch { /* ignore */ }
    if (err instanceof AutoresearchError) throw err;
    throw new AutoresearchError("Failed to write " + targetPath + ": " + (err as Error).message);
  }
}

export function atomicWriteJson(filePath: string, payload: unknown): void {
  atomicWriteText(filePath, JSON.stringify(payload, null, 2) + "\n");
}

export function readJsonFile(filePath: string): Record<string, unknown> {
  if (!existsSync(filePath)) {
    throw new AutoresearchError("Missing file: " + filePath);
  }
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
  } catch (err) {
    throw new AutoresearchError("Invalid JSON in " + filePath + ": " + (err as Error).message);
  }
}

export function resolvePath(repo: string | undefined, value: string | undefined, defaultName: string): string {
  if (value) {
    return value.startsWith("/") ? value : resolve(repo ?? ".", value);
  }
  return resolve(repo ?? ".", defaultName);
}

export function normalizeDirection(value: string | undefined | null): string {
  if (!value) return "lower";
  const normalized = value.trim().toLowerCase();
  if (normalized !== "lower" && normalized !== "higher") {
    throw new AutoresearchError("Unsupported direction: " + value);
  }
  return normalized;
}

export function normalizeMode(value: string | undefined | null): string {
  if (!value) return "foreground";
  const normalized = value.trim().toLowerCase();
  if (normalized !== "foreground" && normalized !== "background") {
    throw new AutoresearchError("Unsupported mode: " + value);
  }
  return normalized;
}

export function normalizeOperatingMode(value: string | undefined | null): OperatingMode {
  if (!value) return "continuous";
  const normalized = value.trim().toLowerCase();
  if (normalized !== "converge" && normalized !== "continuous" && normalized !== "supervised") {
    throw new AutoresearchError("Unsupported operating mode: " + value + ". Valid: converge, continuous, supervised");
  }
  return normalized as OperatingMode;
}

export function normalizeResultStatus(value: string | undefined | null, fieldName: string): string {
  if (!value) throw new AutoresearchError("Missing " + fieldName);
  const normalized = value.trim().toLowerCase();
  if (!["pass", "fail", "skip"].includes(normalized)) {
    throw new AutoresearchError("Unsupported " + fieldName + ": " + value);
  }
  return normalized;
}

export function normalizeScorerStatus(value: string | undefined | null): string {
  if (!value) return "ok";
  const normalized = value.trim().toLowerCase();
  if (!["ok", "ok-low-score", "scorer-broken"].includes(normalized)) {
    throw new AutoresearchError("Unsupported scorer_status: " + value);
  }
  return normalized;
}

export interface PositiveIntOptions {
  max?: number;
}

export function parsePositiveInt(value: string | undefined | null, fieldName: string, options: PositiveIntOptions = {}): number | undefined {
  if (!value) return undefined;
  const normalized = value.trim();
  const n = Number(normalized);
  if (!/^\d+$/.test(normalized) || !Number.isSafeInteger(n) || n <= 0) {
    throw new AutoresearchError(`Invalid ${fieldName}: ${value} (must be a positive integer)`);
  }
  if (options.max !== undefined && n > options.max) {
    throw new AutoresearchError(`Invalid ${fieldName}: ${value} (must be at most ${options.max})`);
  }
  return n;
}

export function parseDurationSeconds(value: string | undefined | null): number | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  if (/^\d+$/.test(normalized)) {
    const n = parseInt(normalized);
    if (n <= 0) throw new AutoresearchError("Invalid duration: " + value);
    return n;
  }
  const tokens = [...normalized.matchAll(/(\d+)([smhd])/g)];
  let total = 0;
  let pos = 0;
  for (const match of tokens) {
    if (match.index !== pos) {
      throw new AutoresearchError("Invalid duration: " + value);
    }
    const amount = parseInt(match[1] as string);
    const unit = match[2] as string;
    const multiplier: Record<string, number> = { s: 1, m: 60, h: 3600, d: 86400 };
    total += amount * multiplier[unit];
    pos += (match[0] as string).length;
  }
  if (pos !== normalized.length || total <= 0) {
    throw new AutoresearchError("Invalid duration: " + value);
  }
  return total;
}

export function inferVerifyCommand(repo?: string): string {
  const base = repo ?? ".";
  const hasPkg = existsSync(resolve(base, "package.json"));
  if (hasPkg) {
    const pkg = JSON.parse(readFileSync(resolve(base, "package.json"), "utf-8"));
    if (pkg.scripts?.test) return "npm test";
  }
  const makeFile = resolve(base, "Makefile");
  if (existsSync(makeFile)) return "make test";
  if (existsSync(resolve(base, "go.mod"))) return "go test ./...";
  if (existsSync(resolve(base, "Cargo.toml"))) return "cargo test";
  if (existsSync(resolve(base, "pytest.ini")) || existsSync(resolve(base, "tests"))) return "pytest";
  return "<set verify command>";
}

export function normalizeLabels(values?: unknown): string[] {
  if (values == null) return [];
  if (typeof values === "string") {
    return [...new Set(values.split(",").map((s) => s.trim()).filter(Boolean))];
  }
  if (!Array.isArray(values)) {
    const str = String(values).trim();
    return str ? [str] : [];
  }
  const flatten = (arr: unknown[]): string[] =>
    arr.flatMap((v) => {
      if (v == null) return [];
      if (typeof v === "string") {
        const trimmed = v.trim();
        return trimmed ? [trimmed] : [];
      }
      if (Array.isArray(v)) return flatten(v);
      const str = String(v).trim();
      return str ? [str] : [];
    });
  return [...new Set(flatten(values).filter(Boolean))];
}

export function missingRequiredLabels(labels: string[], required: string[]): string[] {
  const labelSet = new Set(labels);
  return required.filter((l) => !labelSet.has(l));
}

export function parseTsvFile(content: string): Record<string, string>[] {
  const lines = content.trim().split("\n");
  if (lines.length <= 1) return [];
  const headers = lines[0].split("\t");
  return lines.slice(1).filter(Boolean).map((r) => {
    const cols = r.split("\t");
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
    return obj;
  });
}

export function countTsvDataRows(content: string): number {
  const lines = content.trim().split("\n");
  return lines.length > 1 ? lines.slice(1).filter((l) => l.trim()).length : 0;
}

import type { GoalDoc, OperatingMode, RunState } from "./types.js";

export function parseRunState(value: unknown): RunState {
  if (typeof value !== "object" || value === null) {
    throw new AutoresearchError("Invalid state: expected object");
  }
  const obj = value as Record<string, unknown>;

  const required = ["schema_version", "run_id", "created_at", "updated_at", "status", "mode", "goal", "scope", "metric", "verify", "label_requirements", "artifact_paths", "stats", "flags"];
  for (const key of required) {
    if (!(key in obj)) {
      throw new AutoresearchError(`Invalid state: missing required field "${key}"`);
    }
  }

  const rawOperatingMode: unknown = "operating_mode" in obj ? obj.operating_mode : undefined;
  if (rawOperatingMode !== undefined && rawOperatingMode !== null && typeof rawOperatingMode !== "string") {
    throw new AutoresearchError("Invalid state: operating_mode must be a string");
  }
  const operating_mode = normalizeOperatingMode(rawOperatingMode);

  if (typeof obj.metric !== "object" || obj.metric === null) {
    throw new AutoresearchError("Invalid state: metric must be an object");
  }
  const metric = obj.metric as Record<string, unknown>;
  if (typeof metric.name !== "string" || typeof metric.direction !== "string") {
    throw new AutoresearchError("Invalid state: metric must have name and direction");
  }

  if (typeof obj.stats !== "object" || obj.stats === null) {
    throw new AutoresearchError("Invalid state: stats must be an object");
  }
  const stats = obj.stats as Record<string, unknown>;
  if (typeof stats.total_iterations !== "number" || typeof stats.kept !== "number" || typeof stats.discarded !== "number" || typeof stats.needs_human !== "number") {
    throw new AutoresearchError("Invalid state: stats must have total_iterations, kept, discarded, needs_human");
  }

  if (typeof obj.flags !== "object" || obj.flags === null) {
    throw new AutoresearchError("Invalid state: flags must be an object");
  }
  const flags = obj.flags as Record<string, unknown>;
  if (typeof flags.stop_requested !== "boolean" || typeof flags.needs_human !== "boolean" || typeof flags.background_active !== "boolean" || typeof flags.stop_ready !== "boolean") {
    throw new AutoresearchError("Invalid state: flags must have stop_requested, needs_human, background_active, stop_ready");
  }

  if (obj.draft_pool !== undefined && obj.draft_pool !== null) {
    if (typeof obj.draft_pool !== "object" || Array.isArray(obj.draft_pool)) {
      throw new AutoresearchError("Invalid state: draft_pool must be an object");
    }
    const draftPool = obj.draft_pool as Record<string, unknown>;
    if (!Array.isArray(draftPool.active_drafts)) {
      throw new AutoresearchError("Invalid state: draft_pool.active_drafts must be an array");
    }
    for (const draft of draftPool.active_drafts) {
      if (typeof draft !== "object" || draft === null || Array.isArray(draft)) {
        throw new AutoresearchError("Invalid state: draft_pool.active_drafts entries must be objects");
      }
    }
  }

  if (obj.last_iteration !== undefined && obj.last_iteration !== null) {
    if (typeof obj.last_iteration !== "object" || Array.isArray(obj.last_iteration)) {
      throw new AutoresearchError("Invalid state: last_iteration must be an object");
    }
    const lastIteration = obj.last_iteration as Record<string, unknown>;
    if (lastIteration.note !== undefined && typeof lastIteration.note !== "string") {
      throw new AutoresearchError("Invalid state: last_iteration.note must be a string");
    }
  }

  return {
    ...obj,
    operating_mode,
  } as RunState;
}

export interface UpdateCacheData {
  last_check: string;
  current_version: string;
  latest_version: string;
  update_available: boolean;
}

export function getUpdateCachePath(): string {
  const home = process.env.HOME || process.env.USERPROFILE || "";
  return join(home, ".cache", "opencode-autoresearch", "update-check.json");
}

export function readUpdateCache(): UpdateCacheData | null {
  const cachePath = getUpdateCachePath();
  if (!existsSync(cachePath)) {
    return null;
  }
  try {
    const content = readFileSync(cachePath, "utf-8");
    return JSON.parse(content) as UpdateCacheData;
  } catch {
    return null;
  }
}

function getBundledNpmCliPath(): string | null {
  const nodeDir = dirname(process.execPath);
  const candidates = [
    join(nodeDir, "node_modules", "npm", "bin", "npm-cli.js"),
    join(dirname(nodeDir), "lib", "node_modules", "npm", "bin", "npm-cli.js"),
  ];
  return candidates.find((candidate) => existsSync(candidate)) ?? null;
}

export function getGlobalNpmPrefix(): string | null {
  try {
    const npmCliPath = getBundledNpmCliPath();
    if (!npmCliPath) return null;
    return execFileSync(process.execPath, [npmCliPath, "prefix", "-g"], { encoding: "utf-8", timeout: 5000 }).trim();
  } catch {
    return null;
  }
}

export function getInstalledPackagePath(packageName: string): string | null {
  try {
    const prefix = getGlobalNpmPrefix();
    if (!prefix) return null;
    const pkgJsonPath = join(prefix, "lib", "node_modules", packageName, "package.json");
    if (existsSync(pkgJsonPath)) {
      return join(prefix, "lib", "node_modules", packageName);
    }
    return null;
  } catch {
    return null;
  }
}

export function getInstalledPackageInfo(packageName: string): { version?: string; description?: string; repository?: string } | null {
  try {
    const prefix = getGlobalNpmPrefix();
    if (!prefix) return null;
    const pkgJsonPath = join(prefix, "lib", "node_modules", packageName, "package.json");
    if (!existsSync(pkgJsonPath)) return null;
    const content = readFileSync(pkgJsonPath, "utf-8");
    const pkg = JSON.parse(content);
    return {
      version: pkg.version,
      description: pkg.description,
      repository: pkg.repository?.url || pkg.repository,
    };
  } catch {
    return null;
  }
}

export function formatGoalDoc(doc: GoalDoc): string {
  const field = (name: string, value: string | undefined): string =>
    `## ${name}\n${value ?? ""}\n`;
  return [
    "# AutoResearch Goal",
    "",
    "<!-- autoresearch goal.md -->",
    "",
    field("goal", doc.goal),
    field("metric", doc.metric),
    field("direction", doc.direction),
    field("verify", doc.verify),
    field("guard", doc.guard),
    field("constraints", doc.constraints),
    field("file_map", doc.file_map),
    field("stop_conditions", doc.stop_conditions),
  ].join("\n");
}

export function parseGoalDocContent(content: string): GoalDoc {
  const sections: Record<string, string> = {};
  const parts = content.split(/^## /m);
  for (const part of parts.slice(1)) {
    const newlineIndex = part.indexOf("\n");
    if (newlineIndex < 0) continue;
    const heading = part.slice(0, newlineIndex).trim().toLowerCase();
    const body = part.slice(newlineIndex + 1).trim();
    sections[heading] = body;
  }
  return {
    goal: sections["goal"] ?? "",
    metric: sections["metric"] ?? "",
    direction: sections["direction"] ?? "lower",
    verify: sections["verify"] ?? "",
    guard: sections["guard"] || undefined,
    constraints: sections["constraints"] || undefined,
    file_map: sections["file_map"] || undefined,
    stop_conditions: sections["stop_conditions"] || undefined,
  };
}

export function writeGoalDoc(filePath: string, doc: GoalDoc): void {
  atomicWriteText(filePath, formatGoalDoc(doc) + "\n");
}

export function readGoalDoc(filePath: string): GoalDoc {
  if (!existsSync(filePath)) {
    throw new AutoresearchError("Missing file: " + filePath);
  }
  const content = readFileSync(filePath, "utf-8");
  return parseGoalDocContent(content);
}
