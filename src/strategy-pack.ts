import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, realpathSync } from "fs";
import { isAbsolute, join, relative } from "path";
import { utcNow, resolvePath, parseRunState, readJsonFile, readGoalDoc } from "./helpers.js";
import { STATE_DEFAULT, GOAL_DEFAULT } from "./constants.js";

export interface StrategyPack {
  name: string;
  exported_at: string;
  version: string;
  goal: string;
  metric: string;
  direction: string;
  verify: string;
  guard?: string;
  constraints?: string;
  evidence: {
    total_iterations: number;
    kept: number;
    discarded: number;
    best_metric?: string;
    success_rate: string;
  };
  summary: string;
}

const PACKS_DIR = ".autoresearch/packs";

export function resolvePacksDir(repo?: string): string {
  return resolvePath(repo, undefined, PACKS_DIR);
}

function generatePackName(goal: string): string {
  return goal.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").substring(0, 40) + "-" + Date.now() + ".md";
}

export function buildStrategyPack(
  repo: string | undefined,
  statePathValue?: string,
  goalPathValue?: string,
): StrategyPack | null {
  const statePath = resolvePath(repo, statePathValue, STATE_DEFAULT);
  if (!existsSync(statePath)) return null;

  const state = parseRunState(readJsonFile(statePath));
  const goalPath = resolvePath(repo, goalPathValue, GOAL_DEFAULT);
  const goalDoc = existsSync(goalPath) ? readGoalDoc(goalPath) : null;

  const total = state.stats?.total_iterations ?? 0;
  const kept = state.stats?.kept ?? 0;
  const discarded = state.stats?.discarded ?? 0;

  return {
    name: generatePackName(state.goal || "unnamed"),
    exported_at: utcNow(),
    version: "1.0.0",
    goal: state.goal || "(unnamed)",
    metric: goalDoc?.metric || state.metric?.name || "(none)",
    direction: goalDoc?.direction || state.metric?.direction || "lower",
    verify: goalDoc?.verify || state.verify || "(none)",
    guard: goalDoc?.guard || undefined,
    constraints: goalDoc?.constraints || undefined,
    evidence: {
      total_iterations: total,
      kept,
      discarded,
      best_metric: state.metric?.best ? String(state.metric.best) : undefined,
      success_rate: total > 0 ? ((kept / total) * 100).toFixed(1) + "%" : "N/A",
    },
    summary: `Goal: ${state.goal || "(none)"} | ${kept}/${total} iterations kept`,
  };
}

function formatStrategyPackMarkdown(pack: StrategyPack): string {
  return [
    `# Strategy Pack: ${pack.goal}`,
    `> Exported: ${pack.exported_at}`,
    ``,
    `## Configuration`,
    `- **Goal:** ${pack.goal}`,
    `- **Metric:** ${pack.metric} (${pack.direction})`,
    `- **Verify:** ${pack.verify}`,
    pack.guard ? `- **Guard:** ${pack.guard}` : null,
    pack.constraints ? `- **Constraints:** ${pack.constraints}` : null,
    ``,
    `## Evidence`,
    `- **Total:** ${pack.evidence.total_iterations} iterations`,
    `- **Kept:** ${pack.evidence.kept}`,
    `- **Discarded:** ${pack.evidence.discarded}`,
    `- **Success Rate:** ${pack.evidence.success_rate}`,
    ``,
    `## Summary`,
    pack.summary,
    ``,
  ].filter((l): l is string => l !== null).join("\n");
}

export function exportPack(repo: string | undefined, statePathValue?: string, goalPathValue?: string): { path: string; pack: StrategyPack } | null {
  const pack = buildStrategyPack(repo, statePathValue, goalPathValue);
  if (!pack) return null;

  const packsDir = resolvePacksDir(repo);
  mkdirSync(packsDir, { recursive: true });
  const packPath = join(packsDir, pack.name);
  writeFileSync(packPath, formatStrategyPackMarkdown(pack), "utf-8");

  return { path: packPath, pack };
}

export function listPacks(repo?: string): Array<{ name: string; path: string }> {
  const packsDir = resolvePacksDir(repo);
  if (!existsSync(packsDir)) return [];
  return readdirSync(packsDir, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md"))
    .map((e) => ({ name: e.name, path: join(packsDir, e.name) }))
    .sort((a, b) => b.name.localeCompare(a.name));
}

function isValidPackName(name: string): boolean {
  return name.endsWith(".md")
    && !name.includes("..")
    && !name.includes("/")
    && !name.includes("\\");
}

function isWithinDir(parent: string, child: string): boolean {
  const relativePath = relative(parent, child);
  return relativePath !== "" && !relativePath.startsWith("..") && !isAbsolute(relativePath);
}

export function readPack(repo: string | undefined, name: string): string | null {
  if (!isValidPackName(name)) return null;

  const packsDir = resolvePacksDir(repo);
  if (!existsSync(packsDir)) return null;

  const packPath = join(packsDir, name);
  if (!existsSync(packPath)) return null;

  const realPacksDir = realpathSync(packsDir);
  const realPackPath = realpathSync(packPath);
  if (!isWithinDir(realPacksDir, realPackPath)) return null;

  return readFileSync(realPackPath, "utf-8");
}
