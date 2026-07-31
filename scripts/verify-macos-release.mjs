import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const runtimeBinaries = [
  "darwin-arm64/bin/codex",
  "darwin-arm64/bin/codex-code-mode-host",
  "darwin-arm64/codex-path/rg",
  "darwin-arm64/codex-resources/zsh/bin/zsh",
  "darwin-x64/bin/codex",
  "darwin-x64/bin/codex-code-mode-host",
  "darwin-x64/codex-path/rg",
  "darwin-x64/codex-resources/zsh/bin/zsh",
];

function targetFromArguments(arguments_) {
  const value = arguments_.find((argument) => argument.startsWith("--target="));
  const target = value?.slice("--target=".length);
  if (!target?.startsWith("darwin-")) {
    throw new Error(
      "Usage: node scripts/verify-macos-release.mjs --target=darwin-universal",
    );
  }
  return target;
}

function run(command, arguments_) {
  const result = spawnSync(command, arguments_, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = `${result.stdout || ""}${result.stderr || ""}`.trim();
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(" ")} failed with status ${result.status}`
      + (output ? `:\n${output}` : ""),
    );
  }
  return output;
}

function exactlyOne(directory, predicate, description) {
  const matches = fs.readdirSync(directory)
    .filter(predicate)
    .map((entry) => path.join(directory, entry));
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one ${description} in ${directory}, found ${matches.length}`,
    );
  }
  return matches[0];
}

function verifySignedBinary(binaryPath) {
  if (!fs.existsSync(binaryPath)) {
    throw new Error(`Missing packaged runtime binary: ${binaryPath}`);
  }
  run("codesign", ["--verify", "--strict", "--verbose=2", binaryPath]);
}

function verifyMacosRelease() {
  if (process.platform !== "darwin") {
    throw new Error("macOS release verification must run on macOS");
  }

  const target = targetFromArguments(process.argv.slice(2));
  const outputDirectory = path.join(repoRoot, "release", target);
  const appDirectory = path.join(outputDirectory, "mac-universal");
  const appPath = exactlyOne(
    appDirectory,
    (entry) => entry.endsWith(".app"),
    "packaged application",
  );

  run("codesign", ["--verify", "--deep", "--strict", "--verbose=2", appPath]);
  const signature = run("codesign", ["-dv", "--verbose=4", appPath]);
  if (!/^Authority=Developer ID Application:/m.test(signature)) {
    throw new Error("Application is not signed with Developer ID Application");
  }
  if (!/^TeamIdentifier=[A-Z0-9]+$/m.test(signature)) {
    throw new Error("Application signature has no Apple TeamIdentifier");
  }
  if (!/^CodeDirectory .*flags=.*runtime/m.test(signature)) {
    throw new Error("Application signature does not enable hardened runtime");
  }

  run("spctl", ["--assess", "--type", "execute", "--verbose=4", appPath]);
  run("xcrun", ["stapler", "validate", appPath]);

  for (const binary of runtimeBinaries) {
    verifySignedBinary(
      path.join(appPath, "Contents", "Resources", "codex-runtime", binary),
    );
  }

  exactlyOne(
    outputDirectory,
    (entry) => entry.endsWith(".dmg"),
    "DMG installer",
  );
  exactlyOne(
    outputDirectory,
    (entry) => entry.endsWith(".zip"),
    "ZIP update artifact",
  );
  exactlyOne(
    outputDirectory,
    (entry) => entry === "latest-mac.yml",
    "macOS update metadata",
  );

  console.log(
    "Verified Developer ID signature, hardened runtime, notarization ticket, "
    + "runtime binary signatures, and macOS update artifacts.",
  );
}

verifyMacosRelease();
