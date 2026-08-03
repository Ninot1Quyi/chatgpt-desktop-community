import assert from "node:assert/strict";
import { createRequire } from "node:module";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { build } from "esbuild";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

async function loadComponent() {
  const result = await build({
    absWorkingDir: repoRoot,
    alias: {
      "@app": path.join(repoRoot, "renderer", "src"),
    },
    bundle: true,
    entryPoints: [path.join(repoRoot, "modules", "agent-runtimes", "renderer", "KimiAccountPanel.jsx")],
    external: ["react", "react/jsx-runtime"],
    format: "cjs",
    loader: {
      ".svg": "dataurl",
    },
    platform: "node",
    write: false,
  });
  const module = { exports: {} };
  const evaluate = new Function("require", "module", "exports", result.outputFiles[0].text);
  evaluate(require, module, module.exports);
  return module.exports.KimiAccountPanel;
}

test("renders a Kimi account with usage metadata", async () => {
  const KimiAccountPanel = await loadComponent();
  const markup = renderToStaticMarkup(React.createElement(KimiAccountPanel, {
    account: {
      profile: {
        username: "Kimi test account",
      },
      usage: {
        metadata: {
          authenticationMethod: "METHOD_OAUTH",
          authenticationScope: "SCOPE_CODING",
          domain: "DOMAIN_CODING",
          subType: "TYPE_PERSONAL",
        },
      },
    },
    fallbackIcon: React.createElement("span", null, "K"),
    loading: false,
    onProfileConnect() {},
    onProfileDisconnect() {},
    onRefresh() {},
    profileLoading: false,
  }));

  assert.match(markup, /Kimi test account/);
  assert.match(markup, /Personal/);
  assert.match(markup, /Coding/);
  assert.match(markup, /OAuth/);
});
