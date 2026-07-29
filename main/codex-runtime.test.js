const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveCodexBinary } = require("./codex-runtime");

test("prefers an explicit override", () => {
  const override = String.raw`D:\tools\codex.exe`;
  const result = resolveCodexBinary({
    resourcesPath: String.raw`C:\App\resources`,
    env: { CODEX_CLI_PATH: override },
    homePath: String.raw`C:\Users\Test`,
    existsSync: (candidate) => candidate === override,
  });

  assert.equal(result.binary, override);
});

test("uses the bundled runtime before installed copies", () => {
  const bundled = String.raw`C:\App\resources\codex-runtime\win32-x64\bin\codex.exe`;
  const result = resolveCodexBinary({
    resourcesPath: String.raw`C:\App\resources`,
    env: {
      LOCALAPPDATA: String.raw`C:\Users\Test\AppData\Local`,
    },
    homePath: String.raw`C:\Users\Test`,
    existsSync: (candidate) => candidate === bundled,
  });

  assert.equal(result.binary, bundled);
});

test("finds the documented standalone install location", () => {
  const installed = String.raw`C:\Users\Test\AppData\Local\Programs\OpenAI\Codex\bin\codex.exe`;
  const result = resolveCodexBinary({
    resourcesPath: String.raw`C:\Missing\resources`,
    env: {
      LOCALAPPDATA: String.raw`C:\Users\Test\AppData\Local`,
    },
    homePath: String.raw`C:\Users\Test`,
    existsSync: (candidate) => candidate === installed,
  });

  assert.equal(result.binary, installed);
});

test("finds the npm global install location", () => {
  const npmGlobal = String.raw`C:\Users\Test\AppData\Roaming\npm\node_modules\@openai\codex\node_modules\@openai\codex-win32-x64\vendor\x86_64-pc-windows-msvc\bin\codex.exe`;
  const result = resolveCodexBinary({
    resourcesPath: String.raw`C:\Missing\resources`,
    env: {
      APPDATA: String.raw`C:\Users\Test\AppData\Roaming`,
    },
    homePath: String.raw`C:\Users\Test`,
    existsSync: (candidate) => candidate === npmGlobal,
  });

  assert.equal(result.binary, npmGlobal);
});

test("falls back to PATH only after checking install locations", () => {
  const result = resolveCodexBinary({
    resourcesPath: String.raw`C:\Missing\resources`,
    env: {},
    homePath: String.raw`C:\Users\Test`,
    existsSync: () => false,
  });

  assert.equal(result.binary, "codex");
  assert.equal(result.candidates.at(-1), "PATH: codex");
});
