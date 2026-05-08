import { readFileSync } from "fs";
import { dirname, join, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";
import {
  VERSION,
  SKILL_NAME,
} from "./constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const id = SKILL_NAME;
export const repoRoot = resolve(__dirname, "..");
export const version = VERSION;

type OpenCodeConfig = {
  command?: Record<string, { template: string }>;
  skills?: { paths?: string[] };
};

function commandNameForPath(filePath: string) {
  const relativePath = relative(join(repoRoot, "commands"), filePath);
  return relativePath.replace(/\.md$/, "").split(sep).join(":");
}

function pathForTemplate(filePath: string) {
  return filePath.split(sep).join("/");
}

function anchorTrustedSkillReferences(template: string) {
  const trustedSkillBundlePath = pathForTemplate(join(repoRoot, "skills", SKILL_NAME));
  return template.replaceAll(`skills/${SKILL_NAME}/`, `${trustedSkillBundlePath}/`);
}

const commandFiles = [
  "commands/autoresearch.md",
  "commands/autoresearch/plan.md",
  "commands/autoresearch/debug.md",
  "commands/autoresearch/fix.md",
  "commands/autoresearch/learn.md",
  "commands/autoresearch/predict.md",
  "commands/autoresearch/scenario.md",
  "commands/autoresearch/security.md",
  "commands/autoresearch/ship.md",
];

export async function server() {
  return {
    config(config: OpenCodeConfig) {
      config.command = config.command || {};
      config.skills = config.skills || {};
      config.skills.paths = config.skills.paths || [];

      if (!config.skills.paths.includes(repoRoot)) {
        config.skills.paths.push(repoRoot);
      }

      for (const commandFile of commandFiles) {
        const filePath = join(repoRoot, commandFile);
        config.command[commandNameForPath(filePath)] ??= {
          template: anchorTrustedSkillReferences(readFileSync(filePath, "utf8").trim()),
        };
      }
    },

    event() {
      return undefined;
    },
  };
}

export default { id, server };

export {
  VERSION,
  PACKAGE_NAME,
  PRODUCT_BRAND,
  SKILL_NAME,
} from "./constants.js";

export {
  createTaskContext,
  validateTaskContext,
} from "./task-schema.js";

export {
  taskContextFromRunConfig,
  runConfigFromTaskContext,
} from "./translators/cli.js";

export {
  taskContextFromHermesPayload,
  hermesPayloadFromTaskContext,
  taskContextFromRunState,
} from "./translators/hermes.js";

export type {
  TaskSource,
  TaskContext,
  TaskMetric,
  TaskConstraints,
  TaskIterationPolicy,
  TaskResult,
} from "./task-schema.js";

export type {
  HermesTaskPayload,
} from "./translators/hermes.js";

export type {
  RunConfig,
  WizardConfig,
  Metric,
  RunStats,
  RunFlags,
  LastIteration,
  RunState,
  SupervisorSnapshot,
  LabelRequirements,
  ArtifactPaths,
  MemoryProvenance,
  MemoryItem,
  PendingMemoryItem,
  MemoryConsolidationState,
  MemoryAuditLogEntry,
} from "./types.js";

export {
  parseScoreOutput,
} from "./score-parser.js";

export type {
  ScoreOutput,
} from "./score-parser.js";
