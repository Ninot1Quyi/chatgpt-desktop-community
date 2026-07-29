const assert = require("node:assert/strict");
const test = require("node:test");
const { resolveCodexBinary } = require("./index.cjs");

test("posix locator prefers an explicit override", () => {
  const result = resolveCodexBinary({
    arch: "arm64",
    resourcesPath: "/App/Contents/Resources",
    env: { CODEX_CLI_PATH: "/custom/codex" },
    homePath: "/Users/test",
    existsSync: (candidate) => candidate === "/custom/codex",
  });

  assert.equal(result.binary, "/custom/codex");
});

test("posix locator selects the bundled runtime matching the process architecture", () => {
  const bundled = "/App/Contents/Resources/codex-runtime/darwin-x64/bin/codex";
  const result = resolveCodexBinary({
    arch: "x64",
    resourcesPath: "/App/Contents/Resources",
    env: {},
    homePath: "/Users/test",
    existsSync: (candidate) => candidate === bundled,
  });

  assert.equal(result.binary, bundled);
});

test("posix locator preserves local and ChatGPT application fallbacks", () => {
  const result = resolveCodexBinary({
    arch: "arm64",
    resourcesPath: "/Missing/Resources",
    env: {},
    homePath: "/Users/test",
    existsSync: () => false,
  });

  assert.equal(result.binary, "codex");
  assert.ok(result.candidates.includes("/Users/test/.local/bin/codex"));
  assert.ok(result.candidates.includes("/Applications/ChatGPT.app/Contents/Resources/codex"));
  assert.equal(result.candidates.at(-1), "PATH: codex");
});
