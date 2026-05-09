import { resolve } from "path";
import { readFileSync } from "fs";
import { fileURLToPath } from "url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

describe("Constants", () => {
  it("has correct version", async () => {
    const { VERSION } = await import(resolve(REPO_ROOT, "dist/constants.js"));
    const expected = readFileSync(resolve(REPO_ROOT, "VERSION"), "utf-8").trim();
    expect(VERSION).toBe(expected);
  });

  it("has correct package name", async () => {
    const { PACKAGE_NAME } = await import(resolve(REPO_ROOT, "dist/constants.js"));
    expect(PACKAGE_NAME).toBe("opencode-autoresearch");
  });

  it("has correct skill name", async () => {
    const { SKILL_NAME } = await import(resolve(REPO_ROOT, "dist/constants.js"));
    expect(SKILL_NAME).toBe("autoresearch");
  });

  it("has correct results default", async () => {
    const { RESULTS_DEFAULT } = await import(resolve(REPO_ROOT, "dist/constants.js"));
    expect(RESULTS_DEFAULT).toBe("autoresearch-results.tsv");
  });

  it("has correct state default", async () => {
    const { STATE_DEFAULT } = await import(resolve(REPO_ROOT, "dist/constants.js"));
    expect(STATE_DEFAULT).toBe(".autoresearch/state.json");
  });

  it("has correct score history default", async () => {
    const { SCORE_HISTORY_DEFAULT } = await import(resolve(REPO_ROOT, "dist/constants.js"));
    expect(SCORE_HISTORY_DEFAULT).toBe(".autoresearch/score-history.jsonl");
  });

  it("has correct launch default", async () => {
    const { LAUNCH_DEFAULT } = await import(resolve(REPO_ROOT, "dist/constants.js"));
    expect(LAUNCH_DEFAULT).toBe(".autoresearch/launch.json");
  });

  it("has correct memory default", async () => {
    const { MEMORY_DEFAULT } = await import(resolve(REPO_ROOT, "dist/constants.js"));
    expect(MEMORY_DEFAULT).toBe("autoresearch-memory.md");
  });

  it("has correct goal default", async () => {
    const { GOAL_DEFAULT } = await import(resolve(REPO_ROOT, "dist/constants.js"));
    expect(GOAL_DEFAULT).toBe(".autoresearch/goal.md");
  });

  it("has correct product brand", async () => {
    const { PRODUCT_BRAND } = await import(resolve(REPO_ROOT, "dist/constants.js"));
    expect(PRODUCT_BRAND).toBe("Auto Research");
  });

  it("exports all expected constants", async () => {
    const constants = await import(resolve(REPO_ROOT, "dist/constants.js"));
    expect(constants.VERSION).toBeDefined();
    expect(constants.PACKAGE_NAME).toBeDefined();
    expect(constants.SKILL_NAME).toBeDefined();
    expect(constants.PRODUCT_BRAND).toBeDefined();
    expect(constants.RESULTS_DEFAULT).toBeDefined();
    expect(constants.STATE_DEFAULT).toBeDefined();
    expect(constants.SCORE_HISTORY_DEFAULT).toBeDefined();
    expect(constants.LAUNCH_DEFAULT).toBeDefined();
    expect(constants.MEMORY_DEFAULT).toBeDefined();
    expect(constants.GOAL_DEFAULT).toBeDefined();
  });

  it("version matches package.json", async () => {
    const { VERSION } = await import(resolve(REPO_ROOT, "dist/constants.js"));
    const pkg = JSON.parse(await import("fs").then(fs => fs.readFileSync(resolve(REPO_ROOT, "package.json"), "utf-8")));
    expect(VERSION).toBe(pkg.version);
  });
});
