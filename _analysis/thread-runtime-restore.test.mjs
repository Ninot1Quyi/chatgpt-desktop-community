import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../renderer/src/store.js", import.meta.url),
  "utf8",
);

test("opening a persisted thread forces its runtime before async catalogs finish", () => {
  assert.match(
    source,
    /setRuntime\("codex", \{ quiet: true, force: true, saveThreadPrefs: false \}\)/,
  );
  assert.match(
    source,
    /setRuntime\("claude", \{ quiet: true, force: true, saveThreadPrefs: false \}\)/,
  );
  assert.match(
    source,
    /setRuntime\("kimi", \{ quiet: true, force: true, saveThreadPrefs: false \}\)/,
  );
  assert.match(source, /if \(!force && !runtimeConnected\(get\(\), runtime\)\)/);
  assert.match(source, /if \(!force && !models\.length\)/);
});

test("forced runtime restore never reuses another provider's selected model", () => {
  assert.match(
    source,
    /: selections\[runtime\] \|\| null;/,
  );
  assert.match(source, /if \(selected\) persist\("composer\.model", selected\)/);
});
