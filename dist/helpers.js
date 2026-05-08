import { writeFileSync, mkdirSync, readFileSync, renameSync, unlinkSync, existsSync } from "fs";
import { resolve, dirname, join } from "path";
import { execSync } from "child_process";
import { PACKAGE_NAME } from "./constants.js";
export { PACKAGE_NAME };
export class AutoresearchError extends Error {
    constructor(message) {
        super(message);
        this.name = "AutoresearchError";
    }
}
export function printJson(payload) {
    console.log(JSON.stringify(payload, null, 2));
}
export function sanitizeForTerminal(value) {
    return String(value).replace(/[\x00-\x1f\x7f-\x9f]/g, (char) => {
        switch (char) {
            case "\n": return "\\n";
            case "\r": return "\\r";
            case "\t": return "\\t";
            default: return `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`;
        }
    });
}
export function utcNow() {
    return new Date().toISOString().replace("Z", "+00:00").split("+")[0] + "Z";
}
export function resolveRepo(repo) {
    return repo ?? process.cwd();
}
export function ensureParent(filePath) {
    mkdirSync(dirname(filePath), { recursive: true });
}
function atomicWriteText(filePath, content) {
    ensureParent(filePath);
    const tmp = filePath + ".tmp." + Date.now();
    writeFileSync(tmp, content, "utf-8");
    try {
        renameSync(tmp, filePath);
    }
    catch {
        try {
            unlinkSync(tmp);
        }
        catch { /* ignore */ }
        throw new AutoresearchError("Failed to write " + filePath);
    }
}
export function atomicWriteJson(filePath, payload) {
    atomicWriteText(filePath, JSON.stringify(payload, null, 2) + "\n");
}
export function readJsonFile(filePath) {
    if (!existsSync(filePath)) {
        throw new AutoresearchError("Missing file: " + filePath);
    }
    try {
        return JSON.parse(readFileSync(filePath, "utf-8"));
    }
    catch (err) {
        throw new AutoresearchError("Invalid JSON in " + filePath + ": " + err.message);
    }
}
export function resolvePath(repo, value, defaultName) {
    if (value) {
        return value.startsWith("/") ? value : resolve(repo ?? ".", value);
    }
    return resolve(repo ?? ".", defaultName);
}
export function normalizeDirection(value) {
    if (!value)
        return "lower";
    const normalized = value.trim().toLowerCase();
    if (normalized !== "lower" && normalized !== "higher") {
        throw new AutoresearchError("Unsupported direction: " + value);
    }
    return normalized;
}
export function normalizeMode(value) {
    if (!value)
        return "foreground";
    const normalized = value.trim().toLowerCase();
    if (normalized !== "foreground" && normalized !== "background") {
        throw new AutoresearchError("Unsupported mode: " + value);
    }
    return normalized;
}
export function normalizeResultStatus(value, fieldName) {
    if (!value)
        throw new AutoresearchError("Missing " + fieldName);
    const normalized = value.trim().toLowerCase();
    if (!["pass", "fail", "skip"].includes(normalized)) {
        throw new AutoresearchError("Unsupported " + fieldName + ": " + value);
    }
    return normalized;
}
export function parsePositiveInt(value, fieldName) {
    if (!value)
        return undefined;
    const n = parseInt(value, 10);
    if (isNaN(n) || n <= 0) {
        throw new AutoresearchError(`Invalid ${fieldName}: ${value} (must be a positive integer)`);
    }
    return n;
}
export function parseDurationSeconds(value) {
    if (!value)
        return null;
    const normalized = value.trim().toLowerCase();
    if (!normalized)
        return null;
    if (/^\d+$/.test(normalized)) {
        const n = parseInt(normalized);
        if (n <= 0)
            throw new AutoresearchError("Invalid duration: " + value);
        return n;
    }
    const tokens = [...normalized.matchAll(/(\d+)([smhd])/g)];
    let total = 0;
    let pos = 0;
    for (const match of tokens) {
        if (match.index !== pos) {
            throw new AutoresearchError("Invalid duration: " + value);
        }
        const amount = parseInt(match[1]);
        const unit = match[2];
        const multiplier = { s: 1, m: 60, h: 3600, d: 86400 };
        total += amount * multiplier[unit];
        pos += match[0].length;
    }
    if (pos !== normalized.length || total <= 0) {
        throw new AutoresearchError("Invalid duration: " + value);
    }
    return total;
}
export function inferVerifyCommand(repo) {
    const base = repo ?? ".";
    const hasPkg = existsSync(resolve(base, "package.json"));
    if (hasPkg) {
        const pkg = JSON.parse(readFileSync(resolve(base, "package.json"), "utf-8"));
        if (pkg.scripts?.test)
            return "npm test";
    }
    const makeFile = resolve(base, "Makefile");
    if (existsSync(makeFile))
        return "make test";
    if (existsSync(resolve(base, "go.mod")))
        return "go test ./...";
    if (existsSync(resolve(base, "Cargo.toml")))
        return "cargo test";
    if (existsSync(resolve(base, "pytest.ini")) || existsSync(resolve(base, "tests")))
        return "pytest";
    return "<set verify command>";
}
export function normalizeLabels(values) {
    if (values == null)
        return [];
    if (typeof values === "string") {
        return [...new Set(values.split(",").map((s) => s.trim()).filter(Boolean))];
    }
    if (!Array.isArray(values)) {
        const str = String(values).trim();
        return str ? [str] : [];
    }
    const flatten = (arr) => arr.flatMap((v) => {
        if (v == null)
            return [];
        if (typeof v === "string") {
            const trimmed = v.trim();
            return trimmed ? [trimmed] : [];
        }
        if (Array.isArray(v))
            return flatten(v);
        const str = String(v).trim();
        return str ? [str] : [];
    });
    return [...new Set(flatten(values).filter(Boolean))];
}
export function missingRequiredLabels(labels, required) {
    const labelSet = new Set(labels);
    return required.filter((l) => !labelSet.has(l));
}
export function parseTsvFile(content) {
    const lines = content.trim().split("\n");
    if (lines.length <= 1)
        return [];
    const headers = lines[0].split("\t");
    return lines.slice(1).filter(Boolean).map((r) => {
        const cols = r.split("\t");
        const obj = {};
        headers.forEach((h, i) => { obj[h] = cols[i] ?? ""; });
        return obj;
    });
}
export function countTsvDataRows(content) {
    const lines = content.trim().split("\n");
    return lines.length > 1 ? lines.slice(1).filter((l) => l.trim()).length : 0;
}
export function parseRunState(value) {
    if (typeof value !== "object" || value === null) {
        throw new AutoresearchError("Invalid state: expected object");
    }
    const obj = value;
    const required = ["schema_version", "run_id", "created_at", "updated_at", "status", "mode", "goal", "scope", "metric", "verify", "label_requirements", "artifact_paths", "stats", "flags"];
    for (const key of required) {
        if (!(key in obj)) {
            throw new AutoresearchError(`Invalid state: missing required field "${key}"`);
        }
    }
    if (typeof obj.metric !== "object" || obj.metric === null) {
        throw new AutoresearchError("Invalid state: metric must be an object");
    }
    const metric = obj.metric;
    if (typeof metric.name !== "string" || typeof metric.direction !== "string") {
        throw new AutoresearchError("Invalid state: metric must have name and direction");
    }
    if (typeof obj.stats !== "object" || obj.stats === null) {
        throw new AutoresearchError("Invalid state: stats must be an object");
    }
    const stats = obj.stats;
    if (typeof stats.total_iterations !== "number" || typeof stats.kept !== "number" || typeof stats.discarded !== "number" || typeof stats.needs_human !== "number") {
        throw new AutoresearchError("Invalid state: stats must have total_iterations, kept, discarded, needs_human");
    }
    if (typeof obj.flags !== "object" || obj.flags === null) {
        throw new AutoresearchError("Invalid state: flags must be an object");
    }
    const flags = obj.flags;
    if (typeof flags.stop_requested !== "boolean" || typeof flags.needs_human !== "boolean" || typeof flags.background_active !== "boolean" || typeof flags.stop_ready !== "boolean") {
        throw new AutoresearchError("Invalid state: flags must have stop_requested, needs_human, background_active, stop_ready");
    }
    return obj;
}
export function getUpdateCachePath() {
    const home = process.env.HOME || process.env.USERPROFILE || "";
    return join(home, ".cache", "opencode-autoresearch", "update-check.json");
}
export function readUpdateCache() {
    const cachePath = getUpdateCachePath();
    if (!existsSync(cachePath)) {
        return null;
    }
    try {
        const content = readFileSync(cachePath, "utf-8");
        return JSON.parse(content);
    }
    catch {
        return null;
    }
}
export function getGlobalNpmPrefix() {
    try {
        return execSync("npm prefix -g", { encoding: "utf-8", timeout: 5000 }).trim();
    }
    catch {
        return null;
    }
}
export function getInstalledPackagePath(packageName) {
    try {
        const prefix = getGlobalNpmPrefix();
        if (!prefix)
            return null;
        const pkgJsonPath = join(prefix, "lib", "node_modules", packageName, "package.json");
        if (existsSync(pkgJsonPath)) {
            return join(prefix, "lib", "node_modules", packageName);
        }
        return null;
    }
    catch {
        return null;
    }
}
export function getInstalledPackageInfo(packageName) {
    try {
        const prefix = getGlobalNpmPrefix();
        if (!prefix)
            return null;
        const pkgJsonPath = join(prefix, "lib", "node_modules", packageName, "package.json");
        if (!existsSync(pkgJsonPath))
            return null;
        const content = readFileSync(pkgJsonPath, "utf-8");
        const pkg = JSON.parse(content);
        return {
            version: pkg.version,
            description: pkg.description,
            repository: pkg.repository?.url || pkg.repository,
        };
    }
    catch {
        return null;
    }
}
//# sourceMappingURL=helpers.js.map