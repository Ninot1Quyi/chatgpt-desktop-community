const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveCodexBinary } = require("./index.cjs");

test("win32 locator prefers an explicit override", () => {
  const override = String.raw`D:\tools\codex.exe`;
  const result = resolveCodexBinary({
    arch: "x64",
    resourcesPath: String.raw`C:\App\resources`,
    env: { CODEX_CLI_PATH: override },
    homePath: String.raw`C:\Users\Test`,
    existsSync: (candidate) => candidate === override,
  });

  assert.equal(result.binary, override);
});

test("win32 locator selects the bundled x64 runtime first", () => {
  const bundled = String.raw`C:\App\resources\codex-runtime\win32-x64\bin\codex.exe`;
  const result = resolveCodexBinary({
    arch: "x64",
    resourcesPath: String.raw`C:\App\resources`,
    env: {},
    homePath: String.raw`C:\Users\Test`,
    existsSync: (candidate) => candidate === bundled,
  });

  assert.equal(result.binary, bundled);
});

test("win32 locator checks standalone and npm installs before PATH", () => {
  const installed = String.raw`C:\Users\Test\AppData\Roaming\npm\node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe`;
  const result = resolveCodexBinary({
    arch: "x64",
    resourcesPath: String.raw`C:\Missing\resources`,
    env: { APPDATA: String.raw`C:\Users\Test\AppData\Roaming` },
    homePath: String.raw`C:\Users\Test`,
    existsSync: (candidate) => candidate === installed,
  });

  assert.equal(result.binary, installed);
  assert.equal(result.candidates.at(-1), "PATH: codex");
});
