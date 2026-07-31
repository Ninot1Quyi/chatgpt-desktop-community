const assert = require("node:assert/strict");
const test = require("node:test");

const {
  createBundledPluginMarketplaceRegistrar,
  ensureBundledPluginMarketplace,
} = require("./bundled-plugins.cjs");

test("bundled plugin recovery registers the platform marketplace", async () => {
  const calls = [];
  const result = await ensureBundledPluginMarketplace({
    homePath: "/home/tester",
    host: {
      resolveBundledPluginMarketplace: (options) => {
        assert.equal(options.homePath, "/home/tester");
        return "/Applications/ChatGPT.app/Contents/Resources/plugins/openai-bundled";
      },
    },
    request: async (method, params) => {
      calls.push([method, params]);
      return { alreadyAdded: false, marketplaceName: "openai-bundled" };
    },
    resourcesPath: "/Applications/Community.app/Contents/Resources",
  });

  assert.deepEqual(calls, [[
    "marketplace/add",
    {
      source:
        "/Applications/ChatGPT.app/Contents/Resources/plugins/openai-bundled",
    },
  ]]);
  assert.equal(result.marketplaceName, "openai-bundled");
});

test("bundled plugin recovery is a no-op when no trusted package exists", async () => {
  let requested = false;
  const result = await ensureBundledPluginMarketplace({
    host: { resolveBundledPluginMarketplace: () => null },
    request: async () => {
      requested = true;
    },
  });

  assert.equal(result, null);
  assert.equal(requested, false);
});

test("bundled plugin recovery retries after no trusted package is found", async () => {
  let calls = 0;
  const register = createBundledPluginMarketplaceRegistrar(async () => {
    calls += 1;
    return calls === 1 ? null : { marketplaceName: "openai-bundled" };
  });

  assert.equal(await register(), null);
  assert.deepEqual(await register(), {
    marketplaceName: "openai-bundled",
  });
  assert.equal(calls, 2);

  assert.deepEqual(await register(), {
    marketplaceName: "openai-bundled",
  });
  assert.equal(calls, 2);
});
