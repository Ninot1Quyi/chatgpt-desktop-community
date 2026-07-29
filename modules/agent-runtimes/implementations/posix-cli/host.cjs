const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

function firstExisting(candidates) {
  return candidates.find((candidate) => candidate && fs.existsSync(candidate)) || null;
}

function executableCandidates(homePath, envPath, executable) {
  return [
    envPath,
    path.join(homePath, ".local", "bin", executable),
    path.join("/opt", "homebrew", "bin", executable),
    path.join("/usr", "local", "bin", executable),
  ];
}

function resolveClaudeBinary(homePath, env = process.env) {
  return firstExisting(executableCandidates(
    homePath,
    env.CLAUDE_CLI_PATH,
    "claude",
  ));
}

function resolveKimiBinary(homePath, env = process.env) {
  return firstExisting([
    env.KIMI_CLI_PATH,
    path.join(homePath, ".kimi-code", "bin", "kimi"),
    ...executableCandidates(homePath, null, "kimi"),
  ]);
}

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

function startLogin({ args, binary, runtime }) {
  const launcher = path.join(
    os.tmpdir(),
    `chatgpt-desktop-community-${runtime}-login.command`,
  );
  const command = [binary, ...args].map(shellQuote).join(" ");
  fs.writeFileSync(
    launcher,
    [
      "#!/bin/zsh",
      command,
      "status=$?",
      "echo",
      "read -k 1 \"?Press any key to close...\"",
      "exit $status",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  fs.chmodSync(launcher, 0o755);
  const child = spawn("open", [launcher], {
    detached: true,
    stdio: "ignore",
  });
  child.unref();
  return { started: true };
}

module.exports = {
  resolveClaudeBinary,
  resolveKimiBinary,
  startLogin,
};
