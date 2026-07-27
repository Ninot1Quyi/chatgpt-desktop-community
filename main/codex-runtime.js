const fs = require("node:fs");
const path = require("node:path");

const BUNDLED_TARGETS = {
  "darwin-arm64": "darwin-arm64",
  "darwin-x64": "darwin-x64",
  "win32-x64": "win32-x64",
};

// --- Windows-only install locations ---------------------------------------
// Everything Windows-specific lives in this block so the shared resolution
// flow (and the macOS behavior) stays untouched.
function windowsInstallCandidates({ arch, env, executable, paths }) {
  const candidates = [];
  if (env.CODEX_INSTALL_DIR) {
    candidates.push(paths.join(env.CODEX_INSTALL_DIR, executable));
  }
  if (env.LOCALAPPDATA) {
    candidates.push(paths.join(
      env.LOCALAPPDATA,
      "Programs",
      "OpenAI",
      "Codex",
      "bin",
      executable,
    ));
  }
  if (arch === "x64" && env.APPDATA) {
    // npm global install: `npm i -g @openai/codex` puts the native binary
    // inside the platform package under the global node_modules tree.
    candidates.push(paths.join(
      env.APPDATA,
      "npm",
      "node_modules",
      "@openai",
      "codex",
      "node_modules",
      "@openai",
      "codex-win32-x64",
      "vendor",
      "x86_64-pc-windows-msvc",
      "bin",
      executable,
    ));
  }
  return candidates;
}

// --- macOS-only install locations -----------------------------------------
function darwinInstallCandidates({ homePath, executable, paths }) {
  return [
    "/Applications/ChatGPT.app/Contents/Resources/codex",
    paths.join(
      homePath,
      "Applications",
      "ChatGPT.app",
      "Contents",
      "Resources",
      "codex",
    ),
  ];
}

// POSIX fallback shared by every non-Windows platform.
function posixInstallCandidates({ homePath, executable, paths }) {
  return [paths.join(homePath, ".local", "bin", executable)];
}

// Platform-specific install locations; each platform owns its entry, and
// unknown platforms fall back to the POSIX default. Adding support for a new
// platform means adding one entry here, never touching the resolver below.
const INSTALL_CANDIDATES = {
  win32: windowsInstallCandidates,
  darwin: (ctx) => [...posixInstallCandidates(ctx), ...darwinInstallCandidates(ctx)],
};

function resolveCodexBinary({
  platform = process.platform,
  arch = process.arch,
  resourcesPath = process.resourcesPath,
  env = process.env,
  homePath,
  existsSync = fs.existsSync,
}) {
  const paths = platform === "win32" ? path.win32 : path.posix;
  const executable = platform === "win32" ? "codex.exe" : "codex";
  const codexHome = env.CODEX_HOME || paths.join(homePath, ".codex");
  const candidates = [];

  if (env.CODEX_CLI_PATH) candidates.push(env.CODEX_CLI_PATH);

  const bundledTarget = BUNDLED_TARGETS[`${platform}-${arch}`];
  if (bundledTarget && resourcesPath) {
    candidates.push(paths.join(
      resourcesPath,
      "codex-runtime",
      bundledTarget,
      "bin",
      executable,
    ));
  }

  candidates.push(paths.join(
    codexHome,
    "packages",
    "standalone",
    "current",
    "bin",
    executable,
  ));

  const installCandidates = INSTALL_CANDIDATES[platform] || posixInstallCandidates;
  candidates.push(...installCandidates({ arch, env, homePath, executable, paths }));

  const binary = candidates.find((candidate) => existsSync(candidate)) || "codex";
  return { binary, candidates: [...candidates, "PATH: codex"] };
}

module.exports = { resolveCodexBinary };
