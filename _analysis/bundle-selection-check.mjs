import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  readTargetArg,
  resolveTarget,
} from "../build/targets.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const target = resolveTarget(readTargetArg(process.argv.slice(2)));
const metadataPath = path.join(
  repoRoot,
  ".build-meta",
  target.id,
  "modules.json",
);
const metadata = JSON.parse(await fs.readFile(metadataPath, "utf8"));
const errors = [];
const inputs = [...metadata.main, ...metadata.renderer];

for (const input of inputs) {
  const normalized = input.replaceAll("\\", "/");
  const match = normalized.match(
    /modules\/([^/]+)\/implementations\/([^/]+)\//,
  );
  if (!match) continue;
  const [, moduleName, implementationName] = match;
  const selected = target.modules[moduleName];
  if (!selected) {
    errors.push(`${input}: implementation module is absent from ${target.id}`);
  } else if (selected !== implementationName) {
    errors.push(
      `${input}: ${implementationName} entered ${target.id}; expected ${selected}`,
    );
  }
}

for (const [moduleName, implementationName] of Object.entries(target.modules)) {
  if (moduleName === "distribution") continue;
  const needle = `/modules/${moduleName}/implementations/${implementationName}/`;
  if (!inputs.some((input) => `/${input.replaceAll("\\", "/")}`.includes(needle))) {
    errors.push(`${target.id}: selected ${moduleName}/${implementationName} was not bundled`);
  }
}

const rendererChunks = metadata.rendererChunks || [];
const rendererEntry = rendererChunks.find((chunk) => chunk.isEntry);
for (const [label, moduleSuffix] of [
  ["settings", "/modules/settings/renderer/Settings.jsx"],
  ["workspace panels", "/modules/workspace-panels/renderer/RightPanel.jsx"],
]) {
  const owner = rendererChunks.find((chunk) =>
    chunk.modules.some((moduleId) =>
      `/${moduleId}`.replaceAll("\\", "/").endsWith(moduleSuffix)));
  if (!owner) {
    errors.push(`${target.id}: ${label} chunk was not emitted`);
  } else if (owner.fileName === rendererEntry?.fileName || !owner.isDynamicEntry) {
    errors.push(`${target.id}: ${label} entered the renderer entry chunk`);
  }
}

if (errors.length) {
  throw new Error(`Bundle selection check failed:\n${errors.join("\n")}`);
}

console.log(`Bundle selection verified for ${target.id}`);
