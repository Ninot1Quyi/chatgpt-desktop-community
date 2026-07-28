const fs = require("node:fs");
const path = require("node:path");

// Windows-only codex binary resolution. Candidate order:
// explicit override → bundled runtime → standalone install → documented
// install dir → npm global install → PATH.
function resolveCodexBinary({
  resourcesPath = process.resourcesPath,
  env = process.env,
  homePath,
  existsSync = fs.existsSync,
}) {
  const executable = "codex.exe";
  const codexHome = env.CODEX_HOME || path.join(homePath, ".codex");
  const candidates = [];

  if (env.CODEX_CLI_PATH) candidates.push(env.CODEX_CLI_PATH);

  if (resourcesPath) {
    candidates.push(path.join(
      resourcesPath,
      "codex-runtime",
      "win32-x64",
      "bin",
      executable,
    ));
  }

  candidates.push(path.join(
    codexHome,
    "packages",
    "standalone",
    "current",
    "bin",
    executable,
  ));

  if (env.CODEX_INSTALL_DIR) {
    candidates.push(path.join(env.CODEX_INSTALL_DIR, executable));
  }
  if (env.LOCALAPPDATA) {
    candidates.push(path.join(
      env.LOCALAPPDATA,
      "Programs",
      "OpenAI",
      "Codex",
      "bin",
      executable,
    ));
  }
  if (env.APPDATA) {
    // npm global install: `npm i -g @openai/codex` puts the native binary
    // inside the platform package under the global node_modules tree.
    candidates.push(path.join(
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
