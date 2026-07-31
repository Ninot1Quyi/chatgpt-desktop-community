import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainSource = fs.readFileSync(path.join(repoRoot, "main", "index.js"), "utf8");

test("Codex app-server requests respect the host system proxy", () => {
  const proxyFlag = '"features.respect_system_proxy=true"';
  const appServerCommand = '"app-server"';

  assert.match(mainSource, /const args = \[[\s\S]*?features\.respect_system_proxy=true[\s\S]*?\];/);
  assert.ok(
    mainSource.indexOf(proxyFlag) < mainSource.indexOf(appServerCommand),
    "the proxy feature override must be applied before the app-server subcommand",
  );
});
