import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import {
  VERSION,
  PACKAGE_NAME,
  PRODUCT_BRAND,
  SKILL_NAME,
} from "./constants.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export const id = SKILL_NAME;
export const repoRoot = resolve(__dirname, "..");
export const version = VERSION;

export async function server() {
  return {
    event() {
      return undefined;
    },
  };
}

export { VERSION, PACKAGE_NAME, PRODUCT_BRAND, SKILL_NAME };
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
} from "./types.js";
