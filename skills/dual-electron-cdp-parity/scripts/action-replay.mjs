#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const script = resolve(here, "../../../_analysis/dual-cdp-action-replay.mjs");
const result = spawnSync(process.execPath, [script, ...process.argv.slice(2)], { stdio: "inherit" });
process.exit(result.status ?? 1);
