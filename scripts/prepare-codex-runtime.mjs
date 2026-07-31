import crypto from "node:crypto";
import fs from "node:fs";
import { mkdir, readFile, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import {
  readCodexReleaseManifest,
  resolveLatestCodexRelease,
} from "./codex-release.mjs";
const PACKAGE_TARGETS = {
  "darwin-arm64": ["darwin-arm64"],
  "darwin-universal": ["darwin-arm64", "darwin-x64"],
  "darwin-x64": ["darwin-x64"],
  "win32-x64": ["win32-x64"],
};
const packageTarget = process.argv[2];
const runtimeKeys = PACKAGE_TARGETS[packageTarget];
if (!runtimeKeys) {
  throw new Error(`Usage: node scripts/prepare-codex-runtime.mjs <${Object.keys(PACKAGE_TARGETS).join("|")}>`);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const releaseManifestPath = process.env.CODEX_RELEASE_MANIFEST_PATH;
const release = releaseManifestPath
  ? await readCodexReleaseManifest(path.resolve(repoRoot, releaseManifestPath))
  : await resolveLatestCodexRelease();
const cacheDir = path.join(
  repoRoot,
  "release",
  "codex-runtime-cache",
  release.version,
);
const stageRoot = path.join(
  repoRoot,
  "release",
  "codex-runtime-stage",
  packageTarget,
);
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
  console.log(`Downloading ${runtime.downloadUrl}`);
  try {
    const curl = process.platform === "win32" ? "curl.exe" : "curl";
    execFileSync(
      curl,
      [
        "--silent",
        "--show-error",
        "--fail",
        "--location",
        "--retry",
        "8",
        "--retry-delay",
        "2",
        "--retry-all-errors",
        "--connect-timeout",
        "20",
        "--max-time",
        "900",
        "--output",
        partialPath,
        runtime.downloadUrl,
      ],
      { stdio: "inherit", windowsHide: true },
    );
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
  const runtime = release.runtimes[key];
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
    manifest.version !== release.version ||
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

await rm(stageRoot, { recursive: true, force: true });
await mkdir(resourceDir, { recursive: true });
console.log(
  `Preparing latest stable Codex CLI ${release.version} (${release.releaseTag}) for ${packageTarget}`,
);
const runtimes = [];
for (const key of runtimeKeys) runtimes.push(await extractRuntime(key));
await writeFile(
  path.join(resourceDir, "runtime-manifest.json"),
  `${JSON.stringify({
    releaseTag: release.releaseTag,
    version: release.version,
    publishedAt: release.publishedAt,
    resolvedAt: release.resolvedAt,
    source: release.source,
    runtimes,
  }, null, 2)}\n`,
);
console.log(`Prepared Codex ${release.version} for ${packageTarget}: ${resourceDir}`);
