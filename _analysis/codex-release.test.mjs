import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  CODEX_RELEASE_API,
  CODEX_RUNTIME_SPECS,
  codexReleaseManifestFromPayload,
  readCodexReleaseManifest,
  resolveLatestCodexRelease,
  validateCodexReleaseManifest,
  writeCodexReleaseManifest,
} from "../scripts/codex-release.mjs";

function releasePayload(overrides = {}) {
  const tag = overrides.tag_name || "rust-v0.146.0";
  const assets = Object.values(CODEX_RUNTIME_SPECS).map((runtime, index) => ({
    name: runtime.asset,
    digest: `sha256:${String(index + 1).repeat(64)}`,
    browser_download_url:
      `https://github.com/openai/codex/releases/download/${tag}/${runtime.asset}`,
  }));
  return {
    tag_name: tag,
    draft: false,
    prerelease: false,
    published_at: "2026-07-29T01:42:51Z",
    assets,
    ...overrides,
  };
}

test("latest Codex resolver selects stable official runtime assets", async () => {
  let request = null;
  const release = await resolveLatestCodexRelease({
    env: { GITHUB_TOKEN: "test-token" },
    fetchImpl: async (url, options) => {
      request = { url, options };
      return new Response(JSON.stringify(releasePayload()), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(request.url, CODEX_RELEASE_API);
  assert.equal(request.options.headers.Authorization, "Bearer test-token");
  assert.equal(release.releaseTag, "rust-v0.146.0");
  assert.equal(release.version, "0.146.0");
  assert.equal(
    release.runtimes["win32-x64"].downloadUrl,
    "https://github.com/openai/codex/releases/download/rust-v0.146.0/codex-package-x86_64-pc-windows-msvc.tar.gz",
  );
  assert.equal(release.runtimes["darwin-arm64"].sha256, "1".repeat(64));
});

test("latest Codex resolver retries transient GitHub failures", async () => {
  let requests = 0;
  const delays = [];
  const release = await resolveLatestCodexRelease({
    fetchImpl: async () => {
      requests += 1;
      if (requests === 1) return new Response("temporary", { status: 502 });
      return new Response(JSON.stringify(releasePayload()), { status: 200 });
    },
    retries: 2,
    sleepImpl: async (milliseconds) => delays.push(milliseconds),
  });

  assert.equal(release.version, "0.146.0");
  assert.equal(requests, 2);
  assert.deepEqual(delays, [500]);
});

test("latest Codex resolver does not retry permanent API failures", async () => {
  let requests = 0;
  await assert.rejects(
    resolveLatestCodexRelease({
      fetchImpl: async () => {
        requests += 1;
        return new Response("not found", { status: 404 });
      },
      retries: 3,
      sleepImpl: async () => {},
    }),
    /HTTP 404/,
  );
  assert.equal(requests, 1);
});

test("Codex release manifests reject prereleases and unverified assets", () => {
  assert.throws(
    () => codexReleaseManifestFromPayload(releasePayload({
      tag_name: "rust-v0.147.0-alpha.2",
      prerelease: true,
    })),
    /must not be a draft or prerelease/,
  );

  const missingDigest = releasePayload();
  missingDigest.assets[0] = { ...missingDigest.assets[0], digest: null };
  assert.throws(
    () => codexReleaseManifestFromPayload(missingDigest),
    /has no valid SHA-256 digest/,
  );

  const manifest = codexReleaseManifestFromPayload(releasePayload());
  manifest.runtimes["win32-x64"].downloadUrl = "https://example.invalid/codex.tar.gz";
  assert.throws(
    () => validateCodexReleaseManifest(manifest),
    /invalid win32-x64 download URL/,
  );
});

test("Codex release manifests round-trip through the CI artifact", async (t) => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codex-release-manifest-"));
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  const destination = path.join(directory, "codex-release-manifest.json");
  const manifest = codexReleaseManifestFromPayload(releasePayload(), {
    resolvedAt: "2026-07-30T00:00:00.000Z",
  });

  await writeCodexReleaseManifest(destination, manifest);
  const restored = await readCodexReleaseManifest(destination);
  assert.deepEqual(restored, manifest);
});

test("packaging resolves one latest stable CLI before platform builds", () => {
  const workflow = fs.readFileSync(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );
  assert.match(workflow, /Resolve latest stable Codex CLI/);
  assert.match(workflow, /name: codex-release-manifest/);
  assert.match(
    workflow,
    /CODEX_RELEASE_MANIFEST_PATH: release\/codex-release-manifest\.json/,
  );

  const targetScript = fs.readFileSync(
    new URL("../scripts/target.mjs", import.meta.url),
    "utf8",
  );
  const packageBody = targetScript.match(
    /async function packageApplication\(\) \{([\s\S]*?)\n\}/,
  )?.[1] || "";
  assert.ok(packageBody.indexOf("await prepareRuntime()") >= 0);
  assert.ok(
    packageBody.indexOf("await prepareRuntime()")
      < packageBody.indexOf("await buildApplication()"),
  );

  const prepareScript = fs.readFileSync(
    new URL("../scripts/prepare-codex-runtime.mjs", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(prepareScript, /rust-v0\.145\.0|CODEX_VERSION/);
  assert.match(prepareScript, /resolveLatestCodexRelease/);
});
