const fs = require("node:fs");
const path = require("node:path");

const BUNDLED_TARGETS = {
  "darwin-arm64": "darwin-arm64",
  "darwin-x64": "darwin-x64",
  "win32-x64": "win32-x64",
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

  if (platform === "win32") {
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
  } else {
    candidates.push(paths.join(homePath, ".local", "bin", executable));
  }

  if (platform === "darwin") {
    candidates.push("/Applications/ChatGPT.app/Contents/Resources/codex");
    candidates.push(paths.join(
      homePath,
      "Applications",
      "ChatGPT.app",
      "Contents",
      "Resources",
      "codex",
    ));
  }

  const binary = candidates.find((candidate) => existsSync(candidate)) || "codex";
  return { binary, candidates: [...candidates, "PATH: codex"] };
}

module.exports = { resolveCodexBinary };
