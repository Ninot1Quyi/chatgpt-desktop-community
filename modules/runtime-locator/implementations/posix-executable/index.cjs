const fs = require("node:fs");
const path = require("node:path");

function resolveCodexBinary({
  arch = process.arch,
  resourcesPath = process.resourcesPath,
  env = process.env,
  homePath,
  existsSync = fs.existsSync,
}) {
  const codexHome = env.CODEX_HOME || path.posix.join(homePath, ".codex");
  const candidates = [];

  if (env.CODEX_CLI_PATH) candidates.push(env.CODEX_CLI_PATH);
  if ((arch === "arm64" || arch === "x64") && resourcesPath) {
    candidates.push(path.posix.join(
      resourcesPath,
      "codex-runtime",
      `darwin-${arch}`,
      "bin",
      "codex",
    ));
  }
  candidates.push(path.posix.join(
    codexHome,
    "packages",
    "standalone",
    "current",
    "bin",
    "codex",
  ));
  candidates.push(path.posix.join(homePath, ".local", "bin", "codex"));
  candidates.push("/Applications/ChatGPT.app/Contents/Resources/codex");
  candidates.push(path.posix.join(
    homePath,
    "Applications",
    "ChatGPT.app",
    "Contents",
    "Resources",
    "codex",
  ));

  const binary = candidates.find((candidate) => existsSync(candidate)) || "codex";
  return { binary, candidates: [...candidates, "PATH: codex"] };
}

module.exports = { resolveCodexBinary };
