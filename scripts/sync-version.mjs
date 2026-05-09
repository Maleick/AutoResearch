#!/usr/bin/env node
import { readFile, writeFile } from "node:fs/promises";

const readText = (path) => readFile(new URL(path, import.meta.url), "utf8");
const writeText = (path, content) => writeFile(new URL(path, import.meta.url), content, "utf8");

const packageJson = JSON.parse(await readText("../package.json"));
const version = packageJson.version;

if (typeof version !== "string" || version.length === 0) {
  throw new Error("package.json version is missing");
}

await writeText("../VERSION", `${version}\n`);

const constantsPath = "../src/constants.ts";
const constants = await readText(constantsPath);
await writeText(
  constantsPath,
  constants.replace(/export const VERSION = "[^"]+";/, `export const VERSION = "${version}";`),
);

const pluginPath = "../.opencode-plugin/plugin.json";
const plugin = JSON.parse(await readText(pluginPath));
plugin.version = version;
await writeText(pluginPath, `${JSON.stringify(plugin, null, 2)}\n`);

const syncInstallTag = (content) =>
  content
    .replace(/`v\d+\.\d+\.\d+`/g, `\`v${version}\``)
    .replace(/refs\/tags\/v\d+\.\d+\.\d+\/INSTALL\.md/g, `refs/tags/v${version}/INSTALL.md`);

const readmePath = "../README.md";
const readme = await readText(readmePath);
await writeText(
  readmePath,
  readme
    .replace(/version-v\d+\.\d+\.\d+-/g, `version-v${version}-`)
    .replace(/alt="v\d+\.\d+\.\d+"/g, `alt="v${version}"`)
    .replace(/refs\/tags\/v\d+\.\d+\.\d+\/INSTALL\.md/g, `refs/tags/v${version}/INSTALL.md`)
    .replace(/`v\d+\.\d+\.\d+`/g, `\`v${version}\``),
);

const installPath = "../INSTALL.md";
const install = await readText(installPath);
await writeText(
  installPath,
  install
    .replace(/refs\/tags\/v\d+\.\d+\.\d+\/INSTALL\.md/g, `refs/tags/v${version}/INSTALL.md`)
    .replace(/`v\d+\.\d+\.\d+`/g, `\`v${version}\``),
);

const installPath = "../INSTALL.md";
const install = await readText(installPath);
await writeText(installPath, syncInstallTag(install));
