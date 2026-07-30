const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_KIMI_OAUTH_HOST = "https://auth.kimi.com";
const KIMI_CODE_CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098";
const refreshes = new Map();

function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function firstString(record, keys) {
  if (!isRecord(record)) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

function toNumber(value) {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : null;
}

function credentialFile(configDir) {
  const directory = path.join(configDir, "credentials");
  const preferred = path.join(directory, "kimi-code.json");
  if (fs.existsSync(preferred)) return preferred;
  let files = [];
  try {
    files = fs.readdirSync(directory)
      .filter((file) => file.endsWith(".json"))
      .map((file) => path.join(directory, file));
  } catch {
    return null;
  }
  return files.find((file) => {
    const credential = readCredential(file);
    return !!(credential?.access_token || credential?.refresh_token);
  }) || null;
}

function readCredential(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8"));
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function writeCredential(file, credential) {
  const temp = `${file}.tmp.${process.pid}.${crypto.randomBytes(4).toString("hex")}`;
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(temp, `${JSON.stringify(credential, null, 2)}\n`, {
    encoding: "utf8",
    mode: 0o600,
  });
  try {
    fs.renameSync(temp, file);
  } catch (error) {
    try { fs.unlinkSync(temp); } catch {}
    throw error;
  }
}

function deviceHeaders(configDir, clientVersion) {
  let deviceId = "";
  const deviceFile = path.join(configDir, "device_id");
  try { deviceId = fs.readFileSync(deviceFile, "utf8").trim(); } catch {}
  const envModel = `${os.type()} ${os.release()} ${os.arch()}`
    .replaceAll(/[^\u0020-\u007e]/g, "")
    .trim();
  return {
    "User-Agent": `kimi-code-cli/${clientVersion}`,
    "X-Msh-Platform": "kimi_code_cli",
    "X-Msh-Version": clientVersion,
    "X-Msh-Device-Name": os.hostname().replaceAll(/[^\u0020-\u007e]/g, "").trim() || "unknown",
    "X-Msh-Device-Model": envModel || "unknown",
    "X-Msh-Os-Version": os.release(),
    ...(deviceId ? { "X-Msh-Device-Id": deviceId } : {}),
  };
}

function tokenFresh(credential, nowSeconds) {
  const accessToken = firstString(credential, ["access_token"]);
  if (!accessToken) return false;
  const expiresAt = toNumber(credential.expires_at);
  if (expiresAt === 0 || expiresAt == null) return true;
  const expiresIn = toNumber(credential.expires_in) ?? 0;
  const threshold = Math.max(300, expiresIn * 0.5);
  return expiresAt - nowSeconds >= threshold;
}

async function responseError(response, fallback) {
  try {
    const payload = await response.json();
    const message = payload?.error?.message
      || payload?.error_description
      || payload?.message
      || payload?.detail;
    if (typeof message === "string" && message.trim()) return message.trim();
  } catch {}
  return fallback;
}

async function refreshCredential({
  clientVersion,
  configDir,
  env,
  fetchImpl,
  file,
  force,
  now,
}) {
  const key = path.resolve(file);
  const current = refreshes.get(key);
  if (current) {
    if (!force || current.force) return current.promise;
    return current.promise
      .catch(() => undefined)
      .then(() => refreshCredential({
        clientVersion,
        configDir,
        env,
        fetchImpl,
        file,
        force: true,
        now,
      }));
  }

  const promise = (async () => {
    const credential = readCredential(file);
    if (!credential) throw new Error("Kimi OAuth credentials could not be read");
    if (!force && tokenFresh(credential, Math.floor(now() / 1000))) {
      return firstString(credential, ["access_token"]);
    }

    const refreshToken = firstString(credential, ["refresh_token"]);
    if (!refreshToken) {
      throw new Error("Kimi OAuth credentials have no refresh token; sign in again");
    }
    const oauthHost = (
      env.KIMI_CODE_OAUTH_HOST
      || env.KIMI_OAUTH_HOST
      || DEFAULT_KIMI_OAUTH_HOST
    ).replace(/\/+$/, "");
    const body = new URLSearchParams({
      client_id: KIMI_CODE_CLIENT_ID,
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    });
    const response = await fetchImpl(`${oauthHost}/api/oauth/token`, {
      method: "POST",
      headers: {
        ...deviceHeaders(configDir, clientVersion),
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        const latest = readCredential(file);
        const latestRefreshToken = firstString(latest, ["refresh_token"]);
        const latestAccessToken = firstString(latest, ["access_token"]);
        if (
          latestAccessToken
          && latestRefreshToken
          && latestRefreshToken !== refreshToken
        ) {
          return latestAccessToken;
        }
      }
      const message = await responseError(
        response,
        `Kimi OAuth refresh failed with HTTP ${response.status}`,
      );
      throw new Error(response.status === 401 || response.status === 403
        ? `${message}; sign in to Kimi Code again`
        : message);
    }

    const refreshed = await response.json();
    const accessToken = firstString(refreshed, ["access_token"]);
    const rotatedRefreshToken = firstString(refreshed, ["refresh_token"]);
    const expiresIn = toNumber(refreshed.expires_in);
    if (!accessToken || !rotatedRefreshToken || expiresIn == null || expiresIn <= 0) {
      throw new Error("Kimi OAuth refresh returned incomplete credentials");
    }

    const latest = readCredential(file);
    const latestRefreshToken = firstString(latest, ["refresh_token"]);
    if (latestRefreshToken && latestRefreshToken !== refreshToken) {
      const peerAccessToken = firstString(latest, ["access_token"]);
      if (peerAccessToken) return peerAccessToken;
    }
    const next = {
      ...(latest || credential),
      access_token: accessToken,
      refresh_token: rotatedRefreshToken,
      expires_at: Math.floor(now() / 1000) + expiresIn,
      expires_in: expiresIn,
      scope: typeof refreshed.scope === "string" ? refreshed.scope : credential.scope || "",
      token_type: typeof refreshed.token_type === "string"
        ? refreshed.token_type
        : credential.token_type || "Bearer",
    };
    writeCredential(file, next);
    return accessToken;
  })().finally(() => {
    if (refreshes.get(key)?.promise === promise) refreshes.delete(key);
  });
  refreshes.set(key, { force: !!force, promise });
  return promise;
}

async function createKimiAuthSession({
  clientVersion = "unknown",
  configDir,
  env = process.env,
  fetchImpl = globalThis.fetch,
  forceRefresh = false,
  now = Date.now,
} = {}) {
  if (!configDir) throw new Error("Kimi Code config directory is required");
  const file = credentialFile(configDir);
  if (!file) throw new Error("No saved Kimi OAuth credentials");

  let accessToken = await refreshCredential({
    clientVersion,
    configDir,
    env,
    fetchImpl,
    file,
    force: forceRefresh,
    now,
  });

  return {
    getAccessToken() {
      return accessToken;
    },
    requestHeaders() {
      return {
        ...deviceHeaders(configDir, clientVersion),
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`,
      };
    },
    async refresh() {
      accessToken = await refreshCredential({
        clientVersion,
        configDir,
        env,
        fetchImpl,
        file,
        force: true,
        now,
      });
      return accessToken;
    },
  };
}

module.exports = {
  createKimiAuthSession,
};
