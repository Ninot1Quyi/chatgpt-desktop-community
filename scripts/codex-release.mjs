import { execFile } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export const CODEX_RELEASE_API =
  "https://api.github.com/repos/openai/codex/releases/latest";

export const CODEX_RUNTIME_SPECS = Object.freeze({
  "darwin-arm64": Object.freeze({
    asset: "codex-package-aarch64-apple-darwin.tar.gz",
    target: "aarch64-apple-darwin",
    entrypoint: "bin/codex",
  }),
  "darwin-x64": Object.freeze({
    asset: "codex-package-x86_64-apple-darwin.tar.gz",
    target: "x86_64-apple-darwin",
    entrypoint: "bin/codex",
  }),
  "win32-x64": Object.freeze({
    asset: "codex-package-x86_64-pc-windows-msvc.tar.gz",
    target: "x86_64-pc-windows-msvc",
    entrypoint: "bin/codex.exe",
  }),
});

function stableVersion(releaseTag) {
  const match = /^rust-v(\d+\.\d+\.\d+)$/.exec(releaseTag || "");
  if (!match) {
    throw new Error(
      `Latest Codex release tag must be stable rust-vX.Y.Z, received ${releaseTag || "<missing>"}`,
    );
  }
  return match[1];
}

function expectedDownloadUrl(releaseTag, asset) {
  return `https://github.com/openai/codex/releases/download/${releaseTag}/${asset}`;
}

function sha256FromDigest(digest, asset) {
  const match = /^sha256:([0-9a-f]{64})$/i.exec(digest || "");
  if (!match) {
    throw new Error(`Latest Codex release asset ${asset} has no valid SHA-256 digest`);
  }
  return match[1].toLowerCase();
}

function requestHeaders(env) {
  const token = typeof env.GITHUB_TOKEN === "string" ? env.GITHUB_TOKEN.trim() : "";
  return {
    Accept: "application/vnd.github+json",
    "User-Agent": "ChatGPT-Desktop-Community-runtime-packager",
    "X-GitHub-Api-Version": "2022-11-28",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function retryableStatus(status) {
  return status === 408 || status === 429 || status >= 500;
}

async function fetchReleasePayload({
  env,
  fetchImpl,
  retries,
  sleepImpl,
}) {
  let lastError = null;
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetchImpl(CODEX_RELEASE_API, {
        headers: requestHeaders(env),
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) {
        const body = (await response.text()).trim().slice(0, 300);
        const error = new Error(
          `Latest Codex release request failed with HTTP ${response.status}${body ? `: ${body}` : ""}`,
        );
        if (!retryableStatus(response.status)) {
          error.retryable = false;
          throw error;
        }
        lastError = error;
      } else {
        return await response.json();
      }
    } catch (error) {
      if (error?.retryable === false) throw error;
      lastError = error;
    }
    if (attempt + 1 < retries) {
      await sleepImpl(500 * (2 ** attempt));
    }
  }
  throw lastError || new Error("Latest Codex release request failed");
}

async function curlReleasePayload() {
  // The public fallback deliberately omits GITHUB_TOKEN so a curl failure
  // cannot expose the token through a process command line or error object.
  const headers = requestHeaders({});
  const args = [
    "--silent",
    "--show-error",
    "--fail",
    "--location",
    "--retry",
    "5",
    "--retry-delay",
    "2",
    "--retry-all-errors",
    "--connect-timeout",
    "20",
    "--max-time",
    "90",
  ];
  for (const [name, value] of Object.entries(headers)) {
    args.push("--header", `${name}: ${value}`);
  }
  args.push(CODEX_RELEASE_API);
  const executable = process.platform === "win32" ? "curl.exe" : "curl";
  const { stdout } = await execFileAsync(executable, args, {
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
  });
  return JSON.parse(stdout);
}

export function codexReleaseManifestFromPayload(
  payload,
  { resolvedAt = new Date().toISOString() } = {},
) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Latest Codex release response must be an object");
  }
  if (payload.draft || payload.prerelease) {
    throw new Error("Latest Codex release must not be a draft or prerelease");
  }
  const releaseTag = payload.tag_name;
  const version = stableVersion(releaseTag);
  const assets = new Map(
    (Array.isArray(payload.assets) ? payload.assets : [])
      .map((asset) => [asset?.name, asset]),
  );
  const runtimes = {};
  for (const [key, spec] of Object.entries(CODEX_RUNTIME_SPECS)) {
    const asset = assets.get(spec.asset);
    if (!asset) {
      throw new Error(`Latest Codex release is missing ${spec.asset}`);
    }
    const downloadUrl = expectedDownloadUrl(releaseTag, spec.asset);
    if (asset.browser_download_url !== downloadUrl) {
      throw new Error(`Unexpected download URL for ${spec.asset}`);
    }
    runtimes[key] = {
      ...spec,
      sha256: sha256FromDigest(asset.digest, spec.asset),
      downloadUrl,
    };
  }
  return validateCodexReleaseManifest({
    schemaVersion: 1,
    source: CODEX_RELEASE_API,
    releaseTag,
    version,
    publishedAt: payload.published_at || null,
    resolvedAt,
    runtimes,
  });
}

export function validateCodexReleaseManifest(manifest) {
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new Error("Codex release manifest must be an object");
  }
  if (manifest.schemaVersion !== 1 || manifest.source !== CODEX_RELEASE_API) {
    throw new Error("Unsupported Codex release manifest");
  }
  const version = stableVersion(manifest.releaseTag);
  if (manifest.version !== version) {
    throw new Error(
      `Codex release manifest version ${manifest.version || "<missing>"} does not match ${manifest.releaseTag}`,
    );
  }
  const runtimes = {};
  for (const [key, spec] of Object.entries(CODEX_RUNTIME_SPECS)) {
    const runtime = manifest.runtimes?.[key];
    if (
      !runtime
      || runtime.asset !== spec.asset
      || runtime.target !== spec.target
      || runtime.entrypoint !== spec.entrypoint
    ) {
      throw new Error(`Codex release manifest has invalid ${key} metadata`);
    }
    const downloadUrl = expectedDownloadUrl(manifest.releaseTag, spec.asset);
    if (runtime.downloadUrl !== downloadUrl) {
      throw new Error(`Codex release manifest has invalid ${key} download URL`);
    }
    runtimes[key] = {
      ...spec,
      sha256: sha256FromDigest(`sha256:${runtime.sha256 || ""}`, spec.asset),
      downloadUrl,
    };
  }
  return {
    schemaVersion: 1,
    source: CODEX_RELEASE_API,
    releaseTag: manifest.releaseTag,
    version,
    publishedAt: manifest.publishedAt || null,
    resolvedAt: manifest.resolvedAt || null,
    runtimes,
  };
}

export async function resolveLatestCodexRelease(options = {}) {
  const env = options.env || process.env;
  const fetchProvided = Object.hasOwn(options, "fetchImpl");
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  const retries = options.retries || 3;
  const sleepImpl = options.sleepImpl
    || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  let payload;
  try {
    payload = await fetchReleasePayload({
      env,
      fetchImpl,
      retries,
      sleepImpl,
    });
  } catch (fetchError) {
    if (fetchProvided) throw fetchError;
    try {
      payload = await curlReleasePayload();
    } catch (curlError) {
      throw new AggregateError(
        [fetchError, curlError],
        "Unable to resolve the latest stable Codex CLI release",
      );
    }
  }
  return codexReleaseManifestFromPayload(payload);
}

export async function readCodexReleaseManifest(filePath) {
  const manifest = JSON.parse(await readFile(filePath, "utf8"));
  return validateCodexReleaseManifest(manifest);
}

export async function writeCodexReleaseManifest(filePath, manifest) {
  const validated = validateCodexReleaseManifest(manifest);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(validated, null, 2)}\n`, "utf8");
}
