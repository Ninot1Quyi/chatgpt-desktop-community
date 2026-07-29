import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const SHARED_RENDERER_MODULES = Object.freeze({
  "@app": "renderer/src",
  "@modules/conversations/state": "modules/conversations/renderer/state.js",
  "@modules/conversations": "modules/conversations/renderer/index.js",
  "@modules/projects-navigation/plugin-views":
    "modules/projects-navigation/renderer/NavViews.jsx",
  "@modules/projects-navigation/state":
    "modules/projects-navigation/renderer/state.js",
  "@modules/projects-navigation": "modules/projects-navigation/renderer/index.js",
  "@modules/settings": "modules/settings/renderer/index.js",
  "@modules/workspace-panels/state":
    "modules/workspace-panels/renderer/state.js",
  "@modules/workspace-panels": "modules/workspace-panels/renderer/index.js",
  "@modules/agent-runtimes/state": "modules/agent-runtimes/renderer/state.js",
  "@modules/agent-runtimes": "modules/agent-runtimes/renderer/index.js",
  "@modules/preferences/state": "modules/preferences/renderer/state.js",
});

const SHARED_MAIN_MODULES = Object.freeze({
  "@modules/agent-runtimes":
    "modules/agent-runtimes/main/register-ipc.cjs",
  "@modules/preferences": "modules/preferences/main/index.cjs",
  "@modules/projects-navigation":
    "modules/projects-navigation/main/global-state.cjs",
  "@modules/updater": "modules/updater/main/index.cjs",
});

export const PRODUCT = Object.freeze({
  packageName: "chatgpt-desktop-community",
  productName: "ChatGPT Desktop Community",
  appId: "com.ninot1quyi.chatgpt-desktop-community",
});

const IMPLEMENTATIONS = Object.freeze({
  "desktop-shell": {
    "windows-frameless": {
      renderer: "modules/desktop-shell/implementations/windows-frameless/renderer.jsx",
      main: "modules/desktop-shell/implementations/windows-frameless/main.cjs",
    },
    "macos-native": {
      renderer: "modules/desktop-shell/implementations/macos-native/renderer.jsx",
      main: "modules/desktop-shell/implementations/macos-native/main.cjs",
    },
  },
  shortcuts: {
    "control-key": {
      renderer: "modules/shortcuts/implementations/control-key/index.mjs",
    },
    "command-key": {
      renderer: "modules/shortcuts/implementations/command-key/index.mjs",
    },
  },
  terminal: {
    powershell: {
      renderer: "modules/terminal/implementations/powershell/index.mjs",
    },
    "posix-login-shell": {
      renderer: "modules/terminal/implementations/posix-login-shell/index.mjs",
    },
  },
  "host-copy": {
    "file-explorer": {
      renderer: "modules/host-copy/implementations/file-explorer/index.mjs",
    },
    finder: {
      renderer: "modules/host-copy/implementations/finder/index.mjs",
    },
  },
  "runtime-locator": {
    "win32-executable": {
      main: "modules/runtime-locator/implementations/win32-executable/index.cjs",
    },
    "posix-executable": {
      main: "modules/runtime-locator/implementations/posix-executable/index.cjs",
    },
  },
  "agent-runtimes": {
    "win32-cli": {
      main: "modules/agent-runtimes/implementations/win32-cli/host.cjs",
    },
    "posix-cli": {
      main: "modules/agent-runtimes/implementations/posix-cli/host.cjs",
    },
  },
  distribution: {
    "nsis-x64": {
      build: "modules/distribution/implementations/nsis-x64/index.mjs",
    },
    "dmg-zip": {
      build: "modules/distribution/implementations/dmg-zip/index.mjs",
    },
  },
});

const WINDOWS_MODULES = Object.freeze({
  "desktop-shell": "windows-frameless",
  shortcuts: "control-key",
  terminal: "powershell",
  "host-copy": "file-explorer",
  "runtime-locator": "win32-executable",
  "agent-runtimes": "win32-cli",
  distribution: "nsis-x64",
});

const MACOS_MODULES = Object.freeze({
  "desktop-shell": "macos-native",
  shortcuts: "command-key",
  terminal: "posix-login-shell",
  "host-copy": "finder",
  "runtime-locator": "posix-executable",
  "agent-runtimes": "posix-cli",
  distribution: "dmg-zip",
});

export const TARGETS = Object.freeze({
  "win32-x64": {
    id: "win32-x64",
    electronPlatform: "win32",
    arch: "x64",
    runtimeTarget: "win32-x64",
    modules: WINDOWS_MODULES,
  },
  "darwin-arm64": {
    id: "darwin-arm64",
    electronPlatform: "darwin",
    arch: "arm64",
    runtimeTarget: "darwin-arm64",
    modules: MACOS_MODULES,
  },
  "darwin-x64": {
    id: "darwin-x64",
    electronPlatform: "darwin",
    arch: "x64",
    runtimeTarget: "darwin-x64",
    modules: MACOS_MODULES,
  },
  "darwin-universal": {
    id: "darwin-universal",
    electronPlatform: "darwin",
    arch: "universal",
    runtimeTarget: "darwin-universal",
    modules: MACOS_MODULES,
  },
});

export function targetIds() {
  return Object.keys(TARGETS);
}

export function resolveTarget(id) {
  if (!id || !TARGETS[id]) {
    throw new Error(
      `Missing or invalid --target. Expected one of: ${targetIds().join(", ")}`,
    );
  }
  return TARGETS[id];
}

export function readTargetArg(args) {
  const equalsArg = args.find((arg) => arg.startsWith("--target="));
  if (equalsArg) return equalsArg.slice("--target=".length);
  const index = args.indexOf("--target");
  return index >= 0 ? args[index + 1] : null;
}

function implementationFor(target, moduleName, surface) {
  const implementationName = target.modules[moduleName];
  const implementation = IMPLEMENTATIONS[moduleName]?.[implementationName];
  const relativePath = implementation?.[surface];
  if (!relativePath) {
    throw new Error(
      `Target ${target.id} does not provide ${surface} implementation for ${moduleName}`,
    );
  }
  const absolutePath = path.join(repoRoot, relativePath);
  if (!fs.existsSync(absolutePath)) {
    throw new Error(
      `Target ${target.id} selects missing ${moduleName} implementation: ${relativePath}`,
    );
  }
  return absolutePath;
}

export function rendererAliases(target) {
  const aliases = {
    "@modules/desktop-shell": implementationFor(target, "desktop-shell", "renderer"),
    "@modules/shortcuts": implementationFor(target, "shortcuts", "renderer"),
    "@modules/terminal": implementationFor(target, "terminal", "renderer"),
    "@modules/host-copy": implementationFor(target, "host-copy", "renderer"),
  };
  for (const [alias, relativePath] of Object.entries(SHARED_RENDERER_MODULES)) {
    const absolutePath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Missing shared renderer module entry: ${relativePath}`);
    }
    aliases[alias] = absolutePath;
  }
  return aliases;
}

export function mainAliases(target) {
  const aliases = {
    "@modules/desktop-shell": implementationFor(target, "desktop-shell", "main"),
    "@modules/runtime-locator": implementationFor(target, "runtime-locator", "main"),
    "@modules/agent-runtime-host": implementationFor(target, "agent-runtimes", "main"),
  };
  for (const [alias, relativePath] of Object.entries(SHARED_MAIN_MODULES)) {
    const absolutePath = path.join(repoRoot, relativePath);
    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Missing shared main module entry: ${relativePath}`);
    }
    aliases[alias] = absolutePath;
  }
  return aliases;
}

export function buildImplementation(target, moduleName) {
  return implementationFor(target, moduleName, "build");
}

export function selectedImplementationPaths(target) {
  const selected = [];
  for (const [moduleName, implementationName] of Object.entries(target.modules)) {
    const implementation = IMPLEMENTATIONS[moduleName]?.[implementationName];
    if (!implementation) continue;
    for (const relativePath of Object.values(implementation)) {
      selected.push(path.join(repoRoot, relativePath));
    }
  }
  return selected;
}
