import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  decodeBase64Secret,
  prepareMacosSigning,
} from "../scripts/prepare-macos-signing.mjs";
import { createDistribution } from
  "../modules/distribution/implementations/dmg-zip/index.mjs";

function fakeCertificate() {
  const certificate = Buffer.alloc(256);
  certificate[0] = 0x30;
  return certificate;
}

function fakeApiKey() {
  return Buffer.from(
    "-----BEGIN PRIVATE KEY-----\n"
    + "dGVzdC1hcHAtc3RvcmUtY29ubmVjdC1rZXk=\n"
    + "-----END PRIVATE KEY-----\n",
  );
}

test("macOS distribution requires Developer ID signing and notarization", () => {
  const distribution = createDistribution({
    target: { id: "darwin-universal" },
  });

  assert.equal(distribution.config.forceCodeSigning, true);
  assert.equal(distribution.config.mac.type, "distribution");
  assert.equal(distribution.config.mac.hardenedRuntime, true);
  assert.equal(distribution.config.mac.notarize, true);
  assert.equal(distribution.config.mac.strictVerify, true);
  assert.deepEqual(
    distribution.config.mac.binaries.map((entry) => entry.split("/").at(-1)),
    [
      "codex",
      "codex-code-mode-host",
      "rg",
      "zsh",
      "codex",
      "codex-code-mode-host",
      "rg",
      "zsh",
    ],
  );
});

test("macOS CI signing credentials are decoded into temporary files", async (t) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "community-macos-signing-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const githubEnvironmentFile = path.join(root, "github-env");
  const environment = {
    RUNNER_TEMP: root,
    GITHUB_ENV: githubEnvironmentFile,
    MACOS_CERTIFICATE_P12_BASE64: fakeCertificate().toString("base64"),
    MACOS_CERTIFICATE_PASSWORD: "certificate-password",
    APPLE_API_KEY_P8_BASE64: fakeApiKey().toString("base64"),
    APPLE_API_KEY_ID: "ABC123DEFG",
    APPLE_API_ISSUER: "00000000-1111-2222-3333-444444444444",
  };

  const result = await prepareMacosSigning({
    environment,
    logger: { log() {} },
  });
  const writtenCertificate = await fs.readFile(result.certificatePath);
  const writtenApiKey = await fs.readFile(result.apiKeyPath);
  const githubEnvironment = await fs.readFile(githubEnvironmentFile, "utf8");

  assert.deepEqual(writtenCertificate, fakeCertificate());
  assert.deepEqual(writtenApiKey, fakeApiKey());
  assert.match(githubEnvironment, /^CSC_LINK=.*DeveloperIDApplication\.p12$/m);
  assert.match(githubEnvironment, /^CSC_KEY_PASSWORD=certificate-password$/m);
  assert.match(githubEnvironment, /^APPLE_API_KEY=.*AuthKey_ABC123DEFG\.p8$/m);
  assert.match(githubEnvironment, /^APPLE_API_KEY_ID=ABC123DEFG$/m);
  assert.match(
    githubEnvironment,
    /^APPLE_API_ISSUER=00000000-1111-2222-3333-444444444444$/m,
  );
  assert.match(githubEnvironment, /^CSC_IDENTITY_AUTO_DISCOVERY=true$/m);
});

test("macOS signing setup rejects missing and malformed credentials", async () => {
  assert.throws(
    () => decodeBase64Secret("SECRET", "%%%not-base64%%%"),
    /not valid base64/,
  );
  await assert.rejects(
    prepareMacosSigning({
      environment: {},
      logger: { log() {} },
    }),
    /Missing required macOS signing secret/,
  );
});

test("release workflow signs, verifies, and cleans macOS credentials", async () => {
  const workflow = await fs.readFile(
    new URL("../.github/workflows/release.yml", import.meta.url),
    "utf8",
  );

  for (const secret of [
    "MACOS_CERTIFICATE_P12_BASE64",
    "MACOS_CERTIFICATE_PASSWORD",
    "APPLE_API_KEY_P8_BASE64",
    "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER",
  ]) {
    assert.match(workflow, new RegExp(`secrets\\.${secret}`));
  }
  assert.match(workflow, /node scripts\/prepare-macos-signing\.mjs/);
  assert.match(
    workflow,
    /node scripts\/verify-macos-release\.mjs --target=darwin-universal/,
  );
  assert.match(workflow, /Remove macOS signing material/);
  assert.doesNotMatch(
    workflow,
    /CSC_IDENTITY_AUTO_DISCOVERY:\s*["']?false/,
  );
});
