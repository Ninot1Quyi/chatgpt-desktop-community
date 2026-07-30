import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

import {
  pluginInstallDescriptor,
  pluginRequestParams,
} from "./plugin-rpc.mjs";

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

test("provider install descriptors expose only required package metadata", () => {
  assert.deepEqual(pluginInstallDescriptor({
    id: "demo@personal",
    name: "demo",
    installed: true,
    _marketplace: "personal",
    source: {
      type: "git",
      url: "https://github.com/example/demo",
      refName: "main",
      ignored: "value",
    },
  }), {
    id: "demo@personal",
    name: "demo",
    installed: true,
    source: {
      type: "git",
      url: "https://github.com/example/demo",
      refName: "main",
    },
    installPath: null,
    root: null,
    path: null,
  });
});

test("Codex installs only happen inside the plugin detail view", () => {
  const source = fs.readFileSync(
    new URL("./NavViews.jsx", import.meta.url),
    "utf8",
  );
  const detailStart = source.indexOf("export function PluginDetailView");
  const installCalls = source.match(/api\.rpc\("plugin\/install"/g) || [];
  const firstInstall = source.indexOf('api.rpc("plugin/install"');

  assert.equal(installCalls.length, 2);
  assert.ok(detailStart >= 0);
  assert.ok(firstInstall > detailStart);
  assert.doesNotMatch(
    source,
    /api\.rpc\("plugin\/install",\s*\{\s*pluginId/,
  );
  assert.doesNotMatch(
    source.slice(0, detailStart),
    />\s*Install\s*</,
  );
});
