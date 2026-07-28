import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const RELEASE_TAG = "rust-v0.145.0";
const CODEX_VERSION = "0.145.0";
const RUNTIMES = {
  "darwin-arm64": {
    asset: "codex-package-aarch64-apple-darwin.tar.gz",
    sha256: "ece937169d4c9e910d60826a6ea4ae7848a16c089403d122e70e7da4ac41ba34",
    target: "aarch64-apple-darwin",
    entrypoint: "bin/codex",
  },
  "darwin-x64": {
    asset: "codex-package-x86_64-apple-darwin.tar.gz",
    sha256: "9d402c9ca814655fddc07b548d7086491c0afcebe1f746cdeba1045fd6f62646",
    target: "x86_64-apple-darwin",
    entrypoint: "bin/codex",
  },
  "win32-x64": {
    asset: "codex-package-x86_64-pc-windows-msvc.tar.gz",
    sha256: "8d0d281346aedf63c4cc3922997df822fbb8881f7ffb2b57416f48e8c52a734e",
    target: "x86_64-pc-windows-msvc",
    entrypoint: "bin/codex.exe",
  },
};
const PACKAGE_TARGETS = {
  "darwin-arm64": ["darwin-arm64"],
  "darwin-universal": ["darwin-arm64", "darwin-x64"],
  "darwin-x64": ["darwin-x64"],
  "win32-x64": ["win32-x64"],
};

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const cacheDir = path.join(repoRoot, "release", "codex-runtime-cache");
const stageRoot = path.join(repoRoot, "release", "codex-runtime-stage");
const resourceDir = path.join(stageRoot, "codex-runtime");

function sha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    const input = fs.createReadStream(filePath);
    input.on("error", reject);
    input.on("data", (chunk) => hash.update(chunk));
    input.on("end", () => resolve(hash.digest("hex")));
  });
}

async function ensureArchive(runtime) {
  await mkdir(cacheDir, { recursive: true });
  const archivePath = path.join(cacheDir, runtime.asset);

  try {
    if (await sha256(archivePath) === runtime.sha256) return archivePath;
  } catch {}

  const partialPath = `${archivePath}.download-${process.pid}`;
  const url = `https://github.com/openai/codex/releases/download/${RELEASE_TAG}/${runtime.asset}`;
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok || !response.body) {
    throw new Error(`Download failed (${response.status}): ${url}`);
  }

  try {
    await pipeline(response.body, fs.createWriteStream(partialPath));
    const digest = await sha256(partialPath);
    if (digest !== runtime.sha256) {
      throw new Error(`SHA-256 mismatch for ${runtime.asset}: ${digest}`);
    }
    await rm(archivePath, { force: true });
    await rename(partialPath, archivePath);
  } catch (error) {
    await rm(partialPath, { force: true });
    throw error;
  }

  return archivePath;
}

async function extractRuntime(key) {
  const runtime = RUNTIMES[key];
  const archivePath = await ensureArchive(runtime);
  const destination = path.join(resourceDir, key);
  await mkdir(destination, { recursive: true });
  // Use repo-relative paths: GNU tar (Git Bash) mistakes "D:\..." for a
  // remote host ("Cannot connect to D:"), while bsdtar handles both.
  execFileSync(
    "tar",
    ["-xzf", path.relative(repoRoot, archivePath), "-C", path.relative(repoRoot, destination)],
    { stdio: "inherit", cwd: repoRoot },
  );

  const manifest = JSON.parse(await readFile(
    path.join(destination, "codex-package.json"),
    "utf8",
  ));
  if (
    manifest.version !== CODEX_VERSION ||
    manifest.target !== runtime.target ||
    manifest.entrypoint !== runtime.entrypoint
  ) {
    throw new Error(`Unexpected runtime manifest for ${key}`);
  }

  const required = [
    runtime.entrypoint,
    runtime.entrypoint.replace(/codex(\.exe)?$/, "codex-code-mode-host$1"),
    `codex-path/rg${key.startsWith("win32") ? ".exe" : ""}`,
  ];
  for (const relativePath of required) {
    await stat(path.join(destination, relativePath));
  }

  return {
    key,
    asset: runtime.asset,
    sha256: runtime.sha256,
    target: runtime.target,
  };
}

const packageTarget = process.argv[2];
const runtimeKeys = PACKAGE_TARGETS[packageTarget];
if (!runtimeKeys) {
  throw new Error(`Usage: node scripts/prepare-codex-runtime.mjs <${Object.keys(PACKAGE_TARGETS).join("|")}>`);
}

await rm(stageRoot, { recursive: true, force: true });
await mkdir(resourceDir, { recursive: true });
const runtimes = [];
for (const key of runtimeKeys) runtimes.push(await extractRuntime(key));
await writeFile(
  path.join(resourceDir, "runtime-manifest.json"),
  `${JSON.stringify({ releaseTag: RELEASE_TAG, version: CODEX_VERSION, runtimes }, null, 2)}\n`,
);
console.log(`Prepared Codex ${CODEX_VERSION} for ${packageTarget}: ${resourceDir}`);
