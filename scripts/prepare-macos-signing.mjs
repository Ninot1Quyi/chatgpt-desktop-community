import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export const MACOS_SIGNING_SECRET_NAMES = Object.freeze([
  "MACOS_CERTIFICATE_P12_BASE64",
  "MACOS_CERTIFICATE_PASSWORD",
  "APPLE_API_KEY_P8_BASE64",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER",
]);

function requiredEnvironmentValue(environment, name) {
  const value = environment[name];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Missing required macOS signing secret: ${name}`);
  }
  return value;
}

export function decodeBase64Secret(name, value) {
  const compact = String(value || "").replace(/\s/g, "");
  if (!compact || !/^[A-Za-z0-9+/]*={0,2}$/.test(compact)) {
    throw new Error(`${name} is not valid base64`);
  }
  const decoded = Buffer.from(compact, "base64");
  const canonicalInput = compact.replace(/=+$/, "");
  const canonicalDecoded = decoded.toString("base64").replace(/=+$/, "");
  if (!decoded.length || canonicalDecoded !== canonicalInput) {
    throw new Error(`${name} is not valid base64`);
  }
  return decoded;
}

function validateP12(certificate) {
  if (certificate.length < 128 || certificate[0] !== 0x30) {
    throw new Error(
      "MACOS_CERTIFICATE_P12_BASE64 does not contain a PKCS#12 certificate",
    );
  }
}

function validateApiKey(apiKey) {
  const text = apiKey.toString("utf8").trim();
  if (
    !text.startsWith("-----BEGIN PRIVATE KEY-----")
    || !text.endsWith("-----END PRIVATE KEY-----")
  ) {
    throw new Error(
      "APPLE_API_KEY_P8_BASE64 does not contain an App Store Connect private key",
    );
  }
}

function validateSingleLine(name, value) {
  if (/[\r\n]/.test(value)) {
    throw new Error(`${name} must be a single-line value`);
  }
  return value;
}

function validateIdentifier(name, value) {
  const identifier = validateSingleLine(name, value.trim());
  if (!/^[A-Za-z0-9-]+$/.test(identifier)) {
    throw new Error(`${name} contains unsupported characters`);
  }
  return identifier;
}

function githubEnvironmentLines(values) {
  return Object.entries(values)
    .map(([name, value]) => `${name}=${validateSingleLine(name, value)}`)
    .join("\n")
    .concat("\n");
}

export async function prepareMacosSigning({
  environment = process.env,
  logger = console,
} = {}) {
  for (const name of MACOS_SIGNING_SECRET_NAMES) {
    requiredEnvironmentValue(environment, name);
  }

  const runnerTemp = path.resolve(
    requiredEnvironmentValue(environment, "RUNNER_TEMP"),
  );
  const githubEnvironmentFile = path.resolve(
    requiredEnvironmentValue(environment, "GITHUB_ENV"),
  );
  const certificatePassword = validateSingleLine(
    "MACOS_CERTIFICATE_PASSWORD",
    environment.MACOS_CERTIFICATE_PASSWORD,
  );
  const apiKeyId = validateIdentifier(
    "APPLE_API_KEY_ID",
    environment.APPLE_API_KEY_ID,
  );
  const apiIssuer = validateIdentifier(
    "APPLE_API_ISSUER",
    environment.APPLE_API_ISSUER,
  );
  const certificate = decodeBase64Secret(
    "MACOS_CERTIFICATE_P12_BASE64",
    environment.MACOS_CERTIFICATE_P12_BASE64,
  );
  const apiKey = decodeBase64Secret(
    "APPLE_API_KEY_P8_BASE64",
    environment.APPLE_API_KEY_P8_BASE64,
  );
  validateP12(certificate);
  validateApiKey(apiKey);

  const signingDirectory = path.join(runnerTemp, "macos-signing");
  const certificatePath = path.join(
    signingDirectory,
    "DeveloperIDApplication.p12",
  );
  const apiKeyPath = path.join(signingDirectory, `AuthKey_${apiKeyId}.p8`);
  await fs.mkdir(signingDirectory, { recursive: true, mode: 0o700 });
  await fs.writeFile(certificatePath, certificate, { mode: 0o600 });
  await fs.writeFile(apiKeyPath, apiKey, { mode: 0o600 });
  await fs.appendFile(
    githubEnvironmentFile,
    githubEnvironmentLines({
      CSC_LINK: certificatePath,
      CSC_KEY_PASSWORD: certificatePassword,
      APPLE_API_KEY: apiKeyPath,
      APPLE_API_KEY_ID: apiKeyId,
      APPLE_API_ISSUER: apiIssuer,
      CSC_IDENTITY_AUTO_DISCOVERY: "true",
    }),
  );

  logger.log(
    "Prepared temporary Developer ID signing and Apple notarization credentials.",
  );
  return {
    signingDirectory,
    certificatePath,
    apiKeyPath,
  };
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  prepareMacosSigning().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
