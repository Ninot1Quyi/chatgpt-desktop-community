const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  resolveBundledPluginMarketplace,
} = require("./host.cjs");

test("macOS agent host finds the app-owned bundled plugin marketplace first", () => {
  const resourcesPath = "/Community.app/Contents/Resources";
  const ownMarketplace = path.join(
    resourcesPath,
    "plugins",
    "openai-bundled",
  );
  const manifest = path.join(
    ownMarketplace,
    ".agents",
    "plugins",
    "marketplace.json",
  );

  assert.equal(resolveBundledPluginMarketplace({
    env: {},
    existsSync: (candidate) => candidate === manifest,
    homePath: "/Users/tester",
    resourcesPath,
    systemApplicationsPath: "/Applications",
  }), ownMarketplace);
});

test("macOS agent host recovers plugins from an installed OpenAI desktop app", () => {
  const marketplace =
    "/Applications/ChatGPT.app/Contents/Resources/plugins/openai-bundled";
  const manifest = path.join(
    marketplace,
    ".agents",
    "plugins",
    "marketplace.json",
  );

  assert.equal(resolveBundledPluginMarketplace({
    env: {},
    existsSync: (candidate) => candidate === manifest,
    homePath: "/Users/tester",
    resourcesPath: "/Community.app/Contents/Resources",
    systemApplicationsPath: "/Applications",
  }), marketplace);
});
