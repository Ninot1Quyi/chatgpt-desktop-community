const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  resolveBundledPluginMarketplace,
} = require("./host.cjs");

test("Windows agent host finds the app-owned bundled plugin marketplace", () => {
  const resourcesPath = String.raw`C:\Community\resources`;
  const marketplace = path.win32.join(
    resourcesPath,
    "plugins",
    "openai-bundled",
  );
  const manifest = path.win32.join(
    marketplace,
    ".agents",
    "plugins",
    "marketplace.json",
  );

  assert.equal(resolveBundledPluginMarketplace({
    env: {},
    existsSync: (candidate) => candidate === manifest,
    homePath: String.raw`C:\Users\tester`,
    resourcesPath,
  }), marketplace);
});
