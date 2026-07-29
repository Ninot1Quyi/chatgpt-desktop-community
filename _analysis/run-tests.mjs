import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const roots = [
  path.join(repoRoot, "main"),
  path.join(repoRoot, "modules"),
  path.join(repoRoot, "_analysis"),
];

function collect(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return collect(target);
    return /\.test\.(?:c?js|mjs)$/.test(entry.name) ? [target] : [];
  });
}

const testFiles = roots.flatMap(collect).sort();
if (!testFiles.length) throw new Error("No tests found");
const result = spawnSync(process.execPath, ["--test", ...testFiles], {
  cwd: repoRoot,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exit(result.status ?? 1);
