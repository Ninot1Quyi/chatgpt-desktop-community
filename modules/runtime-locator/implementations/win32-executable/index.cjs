const fs = require("node:fs");
const path = require("node:path");

function resolveCodexBinary({
  arch = process.arch,
  resourcesPath = process.resourcesPath,
  env = process.env,
  homePath,
  existsSync = fs.existsSync,
}) {
  const executable = "codex.exe";
  const codexHome = env.CODEX_HOME || path.win32.join(homePath, ".codex");
  const candidates = [];

  if (env.CODEX_CLI_PATH) candidates.push(env.CODEX_CLI_PATH);
  if (arch === "x64" && resourcesPath) {
    candidates.push(path.win32.join(
      resourcesPath,
      "codex-runtime",
      "win32-x64",
      "bin",
      executable,
    ));
  }
  candidates.push(path.win32.join(
    codexHome,
    "packages",
    "standalone",
    "current",
    "bin",
    executable,
  ));
  if (env.CODEX_INSTALL_DIR) {
    candidates.push(path.win32.join(env.CODEX_INSTALL_DIR, executable));
  }
  if (env.LOCALAPPDATA) {
    candidates.push(path.win32.join(
      env.LOCALAPPDATA,
      "Programs",
      "OpenAI",
      "Codex",
      "bin",
      executable,
    ));
  }
  if (arch === "x64" && env.APPDATA) {
    candidates.push(path.win32.join(
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

  const binary = candidates.find((candidate) => existsSync(candidate)) || "codex";
  return { binary, candidates: [...candidates, "PATH: codex"] };
}

module.exports = { resolveCodexBinary };
