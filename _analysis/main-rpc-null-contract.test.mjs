import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mainIndex = fs.readFileSync(path.join(repoRoot, "main", "index.js"), "utf8");

test("main app-server bridge preserves explicit null params and omitted params", () => {
  assert.match(mainIndex, /function requestPayload\(id, method, params, hasParams\)/);
  assert.doesNotMatch(mainIndex, /params: params \?\? \{\}/);
  assert.doesNotMatch(mainIndex, /params: msg\.params \?\? \{\}/);
  assert.match(mainIndex, /\.request\("account\/rateLimits\/read", null\)/);
});
