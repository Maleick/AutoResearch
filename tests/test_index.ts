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

  it("exports the OpenCode plugin as the package default", async () => {
    const index = await import(resolve(REPO_ROOT, "dist/index.js"));
    expect(index.default).toEqual({ id: "autoresearch", server: index.server });
    const plugin = await index.default.server({});
    expect(typeof plugin.event).toBe("function");
    expect(plugin.event()).toBeUndefined();
  });

  it("exports the OpenCode plugin entry as the package default", async () => {
    const pluginEntry = await import(resolve(REPO_ROOT, "plugins/autoresearch.ts"));
    expect(pluginEntry.default).toEqual({ id: "autoresearch", server: pluginEntry.server });
    const plugin = await pluginEntry.default.server({});
    expect(typeof plugin.event).toBe("function");
    expect(plugin.event()).toBeUndefined();
  });

  it("registers packaged commands and skills through the config hook", async () => {
    const index = await import(resolve(REPO_ROOT, "dist/index.js"));
    const plugin = await index.server({});
    const config = {};

    plugin.config(config);

    expect(config).toMatchObject({
      command: {
        autoresearch: expect.objectContaining({
          template: expect.stringContaining("# /autoresearch"),
        }),
        "autoresearch:plan": expect.objectContaining({
          template: expect.stringContaining("# /autoresearch:plan"),
        }),
      },
      skills: {
        paths: expect.arrayContaining([REPO_ROOT]),
      },
    });

    const autoresearchTemplate = config.command.autoresearch.template;
    expect(autoresearchTemplate).toContain(
      `${REPO_ROOT}/skills/autoresearch/references/loop-workflow.md`,
    );
    for (const command of Object.values(config.command)) {
      expect(command.template).not.toContain("`skills/autoresearch/");
    }
  });

  it("does not duplicate repoRoot in skills.paths when already present", async () => {
    const index = await import(resolve(REPO_ROOT, "dist/index.js"));
    const plugin = await index.server({});
    const config = { skills: { paths: [REPO_ROOT] } };

    plugin.config(config);

    expect(config.skills.paths).toStrictEqual([REPO_ROOT]);
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
    expect(Object.keys(types).length).toBeLessThanOrEqual(2);
  });

  it("stage constants are exported from constants module", async () => {
    const constants = await import(resolve(REPO_ROOT, "dist/constants.js"));
    expect(constants.RUN_STAGES).toEqual(["draft", "debug", "improve", "verify", "complete"]);
    expect(constants.STAGE_TRANSITIONS).toBeDefined();
  });
});
