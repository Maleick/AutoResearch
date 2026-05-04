import { resolve } from "path";
import { fileURLToPath } from "url";

const REPO_ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");

describe("Index Exports", () => {
  it("exports all public APIs", async () => {
    const index = await import(resolve(REPO_ROOT, "dist/index.js"));
    expect(index.VERSION).toBeDefined();
    expect(index.PACKAGE_NAME).toBeDefined();
    expect(index.SKILL_NAME).toBeDefined();
    expect(index.PRODUCT_BRAND).toBeDefined();
  });

  it("exports an OpenCode plugin server from the package root", async () => {
    const index = await import(resolve(REPO_ROOT, "dist/index.js"));
    expect(typeof index.server).toBe("function");
    const plugin = await index.server({});
    expect(typeof plugin.event).toBe("function");
    expect(plugin.event()).toBeUndefined();
  });

  it("exports correct version string", async () => {
    const index = await import(resolve(REPO_ROOT, "dist/index.js"));
    expect(typeof index.VERSION).toBe("string");
    expect(index.VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("exports correct package name", async () => {
    const index = await import(resolve(REPO_ROOT, "dist/index.js"));
    expect(index.PACKAGE_NAME).toBe("opencode-autoresearch");
  });

  it("exports correct skill name", async () => {
    const index = await import(resolve(REPO_ROOT, "dist/index.js"));
    expect(index.SKILL_NAME).toBe("autoresearch");
  });

  it("exports correct product brand", async () => {
    const index = await import(resolve(REPO_ROOT, "dist/index.js"));
    expect(index.PRODUCT_BRAND).toBe("Auto Research");
  });

  it("exports type definitions", async () => {
    const types = await import(resolve(REPO_ROOT, "dist/types.js"));
    expect(types).toBeDefined();
  });

  it("type module exports are empty object at runtime", async () => {
    const types = await import(resolve(REPO_ROOT, "dist/types.js"));
    expect(Object.keys(types).length).toBe(0);
  });
});
