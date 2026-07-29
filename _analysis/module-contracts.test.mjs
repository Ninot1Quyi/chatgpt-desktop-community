import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  TARGETS,
  buildImplementation,
  mainAliases,
  rendererAliases,
  targetIds,
} from "../build/targets.mjs";

const require = createRequire(import.meta.url);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const moduleUrl = (relativePath) =>
  pathToFileURL(path.join(repoRoot, relativePath)).href;

function publicKeys(module) {
  return Object.keys(module).filter((key) => key !== "default").sort();
}

test("every supported target resolves every selected module", () => {
  assert.deepEqual(targetIds(), [
    "win32-x64",
    "darwin-arm64",
    "darwin-x64",
    "darwin-universal",
  ]);
  for (const target of Object.values(TARGETS)) {
    for (const entry of Object.values(rendererAliases(target))) {
      assert.ok(fs.existsSync(entry), `${target.id}: missing renderer entry ${entry}`);
    }
    for (const entry of Object.values(mainAliases(target))) {
      assert.ok(fs.existsSync(entry), `${target.id}: missing main entry ${entry}`);
    }
    assert.ok(fs.existsSync(buildImplementation(target, "distribution")));
  }
});

test("shortcut implementations expose the same contract and command set", async () => {
  const control = await import(moduleUrl(
    "modules/shortcuts/implementations/control-key/index.mjs",
  ));
  const command = await import(moduleUrl(
    "modules/shortcuts/implementations/command-key/index.mjs",
  ));
  assert.deepEqual(publicKeys(control), publicKeys(command));
  assert.deepEqual(
    control.COMMANDS.map(([id]) => id),
    command.COMMANDS.map(([id]) => id),
  );
  assert.equal(control.matchAccel(
    { ctrlKey: true, altKey: false, shiftKey: false, key: "n" },
    "Ctrl+N",
  ), true);
  assert.equal(command.matchAccel(
    { metaKey: true, ctrlKey: false, altKey: false, shiftKey: false, key: "n" },
    "⌘N",
  ), true);
});

test("terminal implementations expose the same command contract", async () => {
  const powershell = await import(moduleUrl(
    "modules/terminal/implementations/powershell/index.mjs",
  ));
  const posix = await import(moduleUrl(
    "modules/terminal/implementations/posix-login-shell/index.mjs",
  ));
  assert.deepEqual(publicKeys(powershell), publicKeys(posix));
  assert.ok(powershell.oneShotCommand("echo ok").includes("echo ok"));
  assert.ok(posix.oneShotCommand("echo ok").includes("echo ok"));
});

test("host copy implementations expose the same renderer contract", async () => {
  const explorer = await import(moduleUrl(
    "modules/host-copy/implementations/file-explorer/index.mjs",
  ));
  const finder = await import(moduleUrl(
    "modules/host-copy/implementations/finder/index.mjs",
  ));
  assert.deepEqual(publicKeys(explorer), publicKeys(finder));
  assert.equal(
    explorer.formatHomePath(
      String.raw`C:\Users\Test\.codex`,
      String.raw`C:\Users\Test`,
    ),
    String.raw`%USERPROFILE%\.codex`,
  );
  assert.equal(finder.formatHomePath("/Users/test/.codex", "/Users/test"), "~/.codex");
});

test("desktop shell main implementations expose the same lifecycle contract", () => {
  const windows = require(
    "../modules/desktop-shell/implementations/windows-frameless/main.cjs",
  );
  const macos = require(
    "../modules/desktop-shell/implementations/macos-native/main.cjs",
  );
  assert.deepEqual(publicKeys(windows), publicKeys(macos));
  assert.equal(windows.mainWindowOptions({ preloadPath: "preload" }).titleBarStyle, "hidden");
  assert.equal(macos.mainWindowOptions({ preloadPath: "preload" }).titleBarStyle, "hiddenInset");
});

test("both desktop shells isolate development and production product data", () => {
  for (const implementation of [
    require("../modules/desktop-shell/implementations/windows-frameless/main.cjs"),
    require("../modules/desktop-shell/implementations/macos-native/main.cjs"),
  ]) {
    for (const [isDev, expectedProfile] of [
      [false, "ChatGPT Desktop Community"],
      [true, "ChatGPT Desktop Community Dev"],
    ]) {
      const paths = {};
      const app = {
        getPath: () => path.join("root", "AppData"),
        setName: (name) => { paths.name = name; },
        setPath: (key, value) => { paths[key] = value; },
      };
      implementation.configureApplicationStorage({
        app,
        env: {},
        fs: { mkdirSync() {} },
        isDev,
      });
      assert.equal(paths.name, "ChatGPT Desktop Community");
      assert.ok(paths.userData.endsWith(expectedProfile));
      assert.notEqual(paths.userData, paths.sessionData);
    }
  }
});

test("runtime locator and agent host implementations have matching exports", () => {
  const winLocator = require(
    "../modules/runtime-locator/implementations/win32-executable/index.cjs",
  );
  const posixLocator = require(
    "../modules/runtime-locator/implementations/posix-executable/index.cjs",
  );
  const winAgentHost = require(
    "../modules/agent-runtimes/implementations/win32-cli/host.cjs",
  );
  const posixAgentHost = require(
    "../modules/agent-runtimes/implementations/posix-cli/host.cjs",
  );
  assert.deepEqual(publicKeys(winLocator), publicKeys(posixLocator));
  assert.deepEqual(publicKeys(winAgentHost), publicKeys(posixAgentHost));
});

test("distribution implementations expose one builder contract", async () => {
  const windows = await import(moduleUrl(
    "modules/distribution/implementations/nsis-x64/index.mjs",
  ));
  const macos = await import(moduleUrl(
    "modules/distribution/implementations/dmg-zip/index.mjs",
  ));
  assert.deepEqual(publicKeys(windows), publicKeys(macos));
  for (const [id, implementation] of [
    ["win32-x64", windows],
    ["darwin-universal", macos],
  ]) {
    const result = implementation.createDistribution({
      product: {
        productName: "ChatGPT Desktop Community",
      },
      target: TARGETS[id],
    });
    assert.ok(result.builderPlatform);
    assert.ok(result.builderTargets.length);
    assert.equal(typeof result.finalizeArtifacts, "function");
    assert.ok(result.config.artifactName.includes(id));
  }
});
