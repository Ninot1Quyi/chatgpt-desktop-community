import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import { pluginRequestParams } from "./plugin-rpc.mjs";

test("Codex remote plugin requests use pluginName and remote marketplace", () => {
  assert.deepEqual(pluginRequestParams({
    id: "gmail@openai-curated-remote",
    name: "gmail",
    remotePluginId: "plugin_connector_gmail",
    _marketplace: "openai-curated-remote",
    _marketplacePath: null,
  }), {
    pluginName: "plugin_connector_gmail",
    remoteMarketplaceName: "openai-curated-remote",
  });
});

test("local marketplace plugin requests use the marketplace path", () => {
  assert.deepEqual(pluginRequestParams({
    id: "guidance-map@personal",
    name: "guidance-map",
    _marketplace: "personal",
    _marketplacePath: String.raw`D:\plugins\marketplace.json`,
  }), {
    pluginName: "guidance-map",
    marketplacePath: String.raw`D:\plugins\marketplace.json`,
  });
});

test("plugin requests prefer the protocol name and support legacy ids", () => {
  assert.deepEqual(pluginRequestParams({
    id: "old-slug@personal",
    name: "protocol-name",
  }), {
    pluginName: "protocol-name",
  });
  assert.deepEqual(pluginRequestParams({
    id: "legacy-plugin@personal",
    _marketplace: "personal",
  }), {
    pluginName: "legacy-plugin",
    remoteMarketplaceName: "personal",
  });
});

test("remote plugins fall back to the catalog name when no remote id exists", () => {
  assert.deepEqual(pluginRequestParams({
    id: "legacy-remote@catalog",
    name: "legacy-remote",
    _marketplace: "catalog",
    _marketplacePath: null,
  }), {
    pluginName: "legacy-remote",
    remoteMarketplaceName: "catalog",
  });
});

test("plugin requests reject metadata without a protocol name", () => {
  assert.throws(
    () => pluginRequestParams({}),
    /does not include a plugin name/,
  );
});

test("every plugin install entry point uses the Codex protocol params", () => {
  const source = fs.readFileSync(
    new URL("./NavViews.jsx", import.meta.url),
    "utf8",
  );
  const installCalls = source.match(/api\.rpc\("plugin\/install"/g) || [];
  const contractCalls = source.match(
    /api\.rpc\("plugin\/install", pluginRequestParams\(plugin\)\)/g,
  ) || [];

  assert.equal(installCalls.length, 3);
  assert.equal(contractCalls.length, installCalls.length);
  assert.doesNotMatch(
    source,
    /api\.rpc\("plugin\/install",\s*\{\s*pluginId/,
  );
});
