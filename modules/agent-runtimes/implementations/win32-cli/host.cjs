const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

function firstExisting(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function resolveClaudeBinary(homePath, env = process.env) {
  return firstExisting([
    env.CLAUDE_CLI_PATH,
    path.join(
      env.APPDATA || path.join(homePath, "AppData", "Roaming"),
      "npm",
      "node_modules",
      "@anthropic-ai",
      "claude-code",
      "bin",
      "claude.exe",
    ),
    path.join(homePath, ".local", "bin", "claude.exe"),
  ]);
}

function resolveKimiBinary(homePath, env = process.env) {
  return firstExisting([
    env.KIMI_CLI_PATH,
    path.join(homePath, ".kimi-code", "bin", "kimi.exe"),
  ]);
}

function startLogin({ args, binary, runtime }) {
  const launcher = path.join(
    os.tmpdir(),
    `chatgpt-desktop-community-${runtime}-login.bat`,
  );
  fs.writeFileSync(
    launcher,
    `@echo off\r\n"${binary}" ${args.join(" ")}\r\necho.\r\npause\r\n`,
  );
  const child = spawn(
    "cmd.exe",
    ["/c", `start "ChatGPT Desktop Community - ${runtime} sign-in" "${launcher}"`],
    {
      detached: true,
      stdio: "ignore",
      windowsHide: true,
      windowsVerbatimArguments: true,
    },
  );
  child.unref();
  return { started: true };
}

module.exports = {
  resolveClaudeBinary,
  resolveKimiBinary,
  startLogin,
};
