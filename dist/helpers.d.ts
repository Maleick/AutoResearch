import { PACKAGE_NAME } from "./constants.js";
export { PACKAGE_NAME };
export declare class AutoresearchError extends Error {
    constructor(message: string);
}
export declare function printJson(payload: unknown): void;
export declare function utcNow(): string;
export declare function resolveRepo(repo?: string): string;
export declare function ensureParent(filePath: string): void;
export declare function atomicWriteJson(filePath: string, payload: unknown): void;
export declare function readJsonFile(filePath: string): Record<string, unknown>;
export declare function resolvePath(repo: string | undefined, value: string | undefined, defaultName: string): string;
export declare function normalizeDirection(value: string | undefined | null): string;
export declare function normalizeMode(value: string | undefined | null): string;
export declare function normalizeResultStatus(value: string | undefined | null, fieldName: string): string;
export declare function parsePositiveInt(value: string | undefined | null, fieldName: string): number | undefined;
export declare function parseDurationSeconds(value: string | undefined | null): number | null;
export declare function inferVerifyCommand(repo?: string): string;
export declare function normalizeLabels(values?: unknown): string[];
export declare function missingRequiredLabels(labels: string[], required: string[]): string[];
export declare function parseTsvFile(content: string): Record<string, string>[];
export declare function countTsvDataRows(content: string): number;
import type { RunState } from "./types.js";
export declare function parseRunState(value: unknown): RunState;
export interface UpdateCacheData {
    last_check: string;
    current_version: string;
    latest_version: string;
    update_available: boolean;
}
export declare function getUpdateCachePath(): string;
export declare function readUpdateCache(): UpdateCacheData | null;
export declare function getGlobalNpmPrefix(): string | null;
export declare function getInstalledPackagePath(packageName: string): string | null;
export declare function getInstalledPackageInfo(packageName: string): {
    version?: string;
    description?: string;
    repository?: string;
} | null;
//# sourceMappingURL=helpers.d.ts.map