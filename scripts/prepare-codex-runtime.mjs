import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const RELEASE_TAG = "rust-v0.145.0";
const CODEX_VERSION = "0.145.0";
const PACKAGE_TARGET = "win32-x64";
const RUNTIME = {
  asset: "codex-package-x86_64-pc-windows-msvc.tar.gz",
  sha256: "8d0d281346aedf63c4cc3922997df822fbb8881f7ffb2b57416f48e8c52a734e",
  target: "x86_64-pc-windows-msvc",
  entrypoint: "bin/codex.exe",
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

async function extractRuntime() {
  const archivePath = await ensureArchive(RUNTIME);
  const destination = path.join(resourceDir, PACKAGE_TARGET);
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
    manifest.target !== RUNTIME.target ||
    manifest.entrypoint !== RUNTIME.entrypoint
  ) {
    throw new Error(`Unexpected runtime manifest for ${PACKAGE_TARGET}`);
  }

  const required = [
    RUNTIME.entrypoint,
    RUNTIME.entrypoint.replace(/codex\.exe$/, "codex-code-mode-host.exe"),
    "codex-path/rg.exe",
  ];
  for (const relativePath of required) {
    await stat(path.join(destination, relativePath));
  }

  return {
    key: PACKAGE_TARGET,
    asset: RUNTIME.asset,
    sha256: RUNTIME.sha256,
    target: RUNTIME.target,
  };
}

const packageTarget = process.argv[2];
if (packageTarget !== PACKAGE_TARGET) {
  throw new Error(`Usage: node scripts/prepare-codex-runtime.mjs ${PACKAGE_TARGET}`);
}

await rm(stageRoot, { recursive: true, force: true });
await mkdir(resourceDir, { recursive: true });
const runtimes = [await extractRuntime()];
await writeFile(
  path.join(resourceDir, "runtime-manifest.json"),
  `${JSON.stringify({ releaseTag: RELEASE_TAG, version: CODEX_VERSION, runtimes }, null, 2)}\n`,
);
console.log(`Prepared Codex ${CODEX_VERSION} for ${packageTarget}: ${resourceDir}`);
