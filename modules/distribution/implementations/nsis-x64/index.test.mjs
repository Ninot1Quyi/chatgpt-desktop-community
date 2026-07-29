import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import test from "node:test";

import { createDistribution } from "./index.mjs";

test("portable archive omits updater metadata", {
  skip: process.platform !== "win32",
}, async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "community-portable-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const outputDir = path.join(root, "release", "win32-x64");
  const unpacked = path.join(outputDir, "win-unpacked");
  await fs.mkdir(path.join(unpacked, "resources"), { recursive: true });
  await fs.writeFile(path.join(unpacked, "ChatGPT Desktop Community.exe"), "app");
  await fs.writeFile(path.join(unpacked, "resources", "app.asar"), "asar");
  await fs.writeFile(path.join(unpacked, "resources", "app-update.yml"), "provider: github");

  const distribution = createDistribution({
    product: { productName: "ChatGPT Desktop Community" },
    target: { id: "win32-x64" },
    version: "9.8.7",
  });
  const [archive] = await distribution.finalizeArtifacts({ outputDir });
  const tar = path.join(process.env.SystemRoot, "System32", "tar.exe");
  const entries = execFileSync(tar, ["-tf", archive], { encoding: "utf8" })
    .replaceAll("\\", "/")
    .split(/\r?\n/)
    .filter(Boolean);

  assert.ok(entries.includes("ChatGPT Desktop Community/"));
  assert.ok(entries.includes("ChatGPT Desktop Community/resources/app.asar"));
  assert.ok(!entries.some((entry) => entry.endsWith("/app-update.yml")));
});
