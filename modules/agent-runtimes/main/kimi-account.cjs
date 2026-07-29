const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_KIMI_CODE_BASE_URL = "https://api.kimi.com/coding/v1";
const DEFAULT_KIMI_OAUTH_HOST = "https://auth.kimi.com";
const KIMI_CODE_CLIENT_ID = "17e5f671-d194-4dfb-9706-5516cb48c098";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const FIXED_POINT_CENTS = 1_000_000;
const SENSITIVE_QUOTA_KEYS = new Set([
  "accesstoken",
  "authorization",
  "credential",
  "password",
  "refreshtoken",
  "secret",
]);
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

function toInteger(value) {
  const number = toNumber(value);
  return number == null ? null : Math.trunc(number);
}

function quotaReset(raw) {
  const resetAt = firstString(raw, ["reset_at", "resetAt", "reset_time", "resetTime"]);
  let resetInSeconds = null;
  for (const key of ["reset_in", "resetIn", "ttl"]) {
    const value = toInteger(raw?.[key]);
    if (value != null) {
      resetInSeconds = value;
      break;
    }
  }
  return { resetAt, resetInSeconds };
}

function windowLabel(window, index) {
  const duration = toInteger(window?.duration);
  const unit = firstString(window, ["timeUnit", "time_unit"]) || "";
  if (duration == null) return `Limit ${index + 1}`;
  if (unit.includes("MINUTE")) {
    return duration >= 60 && duration % 60 === 0
      ? `${duration / 60} hour limit`
      : `${duration} minute limit`;
  }
  if (unit.includes("HOUR")) return `${duration} hour limit`;
  if (unit.includes("DAY")) return `${duration} day limit`;
  return `${duration} second limit`;
}

function parseQuotaRow(raw, defaultLabel, window = null) {
  if (!isRecord(raw)) return null;
  const limit = toNumber(raw.limit);
  let used = toNumber(raw.used);
  let remaining = toNumber(raw.remaining);
  if (used == null && limit != null && remaining != null) used = limit - remaining;
  if (remaining == null && limit != null && used != null) remaining = limit - used;
  if (limit == null && used == null && remaining == null) return null;
  const { resetAt, resetInSeconds } = quotaReset(raw);
  return {
    label: firstString(raw, ["name", "title", "scope"]) || defaultLabel,
    used: used ?? 0,
    limit: limit ?? 0,
    remaining: remaining ?? Math.max(0, (limit ?? 0) - (used ?? 0)),
    resetAt,
    resetInSeconds,
    window: isRecord(window)
      ? {
        duration: toNumber(window.duration),
        timeUnit: firstString(window, ["timeUnit", "time_unit"]),
      }
      : null,
  };
}

function parseMoney(raw) {
  if (!isRecord(raw)) return null;
  const directCents = toNumber(raw.priceInCents ?? raw.price_in_cents);
  const fixedAmount = toNumber(raw.amount);
  const value = directCents ?? fixedAmount;
  if (value == null) return null;
  return {
    cents: Math.trunc(value),
    currency: firstString(raw, ["currency"]) || "",
  };
}

function parseBalance(raw) {
  if (!isRecord(raw)) return null;
  const total = toNumber(raw.amount);
  const remaining = toNumber(raw.amountLeft ?? raw.amount_left);
  return {
    type: firstString(raw, ["type"]),
    totalCents: total == null ? null : Math.round(total / FIXED_POINT_CENTS),
    remainingCents: remaining == null ? null : Math.round(remaining / FIXED_POINT_CENTS),
    currency: firstString(raw, ["currency"]),
  };
}

function parseWallet(raw) {
  if (!isRecord(raw)) return null;
  const monthlyChargeLimit = parseMoney(raw.monthlyChargeLimit ?? raw.monthly_charge_limit);
  return {
    status: firstString(raw, ["status"]),
    allowTopup: typeof raw.allowTopup === "boolean"
      ? raw.allowTopup
      : typeof raw.allow_topup === "boolean"
        ? raw.allow_topup
        : null,
    balance: parseBalance(raw.balance),
    topupLimit: parseMoney(raw.topupLimit ?? raw.topup_limit),
    autoRefillCharge: parseMoney(raw.autoRefillCharge ?? raw.auto_refill_charge),
    autoRefillThreshold: parseMoney(raw.autoRefillThreshold ?? raw.auto_refill_threshold),
    monthlyChargeLimitEnabled: typeof raw.monthlyChargeLimitEnabled === "boolean"
      ? raw.monthlyChargeLimitEnabled
      : typeof raw.monthly_charge_limit_enabled === "boolean"
        ? raw.monthly_charge_limit_enabled
        : (monthlyChargeLimit?.cents ?? 0) > 0,
    monthlyChargeLimit,
    monthlyUsed: parseMoney(raw.monthlyUsed ?? raw.monthly_used),
  };
}

function copyQuotaValue(value, depth = 0) {
  if (depth > 5) return null;
  if (value == null || typeof value === "string" || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => copyQuotaValue(item, depth + 1));
  if (!isRecord(value)) return null;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !SENSITIVE_QUOTA_KEYS.has(
        key.replaceAll(/[^a-z0-9]/gi, "").toLowerCase(),
      ))
      .slice(0, 100)
      .map(([key, item]) => [key, copyQuotaValue(item, depth + 1)]),
  );
}

function generatedAvatar(userId) {
  const digest = crypto.createHash("sha256").update(userId || "kimi").digest();
  const hue = digest.readUInt16BE(0) % 360;
  const accent = (hue + 38) % 360;
  const svg = [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96">',
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop stop-color="hsl(${hue} 82% 55%)"/><stop offset="1" stop-color="hsl(${accent} 78% 42%)"/></linearGradient></defs>`,
    '<rect width="96" height="96" rx="48" fill="url(#g)"/>',
    '<path fill="#fff" d="M27 24h12v19l18-19h15L50 46l24 26H58L39 51v21H27z"/>',
    "</svg>",
  ].join("");
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function parseKimiAccountPayload(payload) {
  const record = isRecord(payload) ? payload : {};
  const user = isRecord(record.user) ? record.user : {};
  const membership = isRecord(user.membership) ? user.membership : {};
  const userId = firstString(user, ["userId", "user_id", "id"]) || "";
  const serverName = firstString(user, ["nickname", "userName", "username", "name"]);
  const avatarUrl = firstString(user, ["avatarUrl", "avatar_url", "avatar"]);
  const limits = [];
  if (Array.isArray(record.limits)) {
    record.limits.forEach((item, index) => {
      if (!isRecord(item)) return;
      const detail = isRecord(item.detail) ? item.detail : item;
      const window = isRecord(item.window) ? item.window : null;
      const row = parseQuotaRow(
        detail,
        firstString(item, ["name", "title", "scope"]) || windowLabel(window, index),
        window,
      );
      if (row) limits.push(row);
    });
  }
  const parallel = isRecord(record.parallel)
    ? {
      limit: toNumber(record.parallel.limit),
      used: toNumber(record.parallel.used),
      remaining: toNumber(record.parallel.remaining),
    }
    : null;
  return {
    profile: {
      id: userId,
      username: serverName || userId || "Kimi Code account",
      usernameSource: serverName ? "service" : userId ? "account_id" : "fallback",
      avatar: avatarUrl,
      avatarSource: avatarUrl ? "service" : "generated",
      region: firstString(user, ["region"]),
      membershipLevel: firstString(membership, ["level"]) || firstString(user, ["membershipLevel"]),
      businessId: firstString(user, ["businessId", "business_id"]),
    },
    usage: {
      summary: parseQuotaRow(record.usage, "Weekly limit"),
      limits,
      parallel,
      totalQuota: copyQuotaValue(record.totalQuota ?? record.total_quota ?? null),
      boosterWallet: parseWallet(record.boosterWallet ?? record.booster_wallet),
      metadata: {
        subType: firstString(record, ["subType", "sub_type"]),
        domain: firstString(record, ["domain"]),
        authenticationMethod: firstString(record.authentication, ["method"]),
        authenticationScope: firstString(record.authentication, ["scope"]),
      },
    },
  };
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
  const envModel = `${os.type()} ${os.release()} ${os.arch()}`.replaceAll(/[^\u0020-\u007e]/g, "").trim();
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
  if (expiresAt === 0) return true;
  if (expiresAt == null) return true;
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
    if (!refreshToken) throw new Error("Kimi OAuth credentials have no refresh token; sign in again");
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

async function fetchAvatarDataUrl(url, fetchImpl) {
  if (!url) return null;
  let parsed;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== "https:") return null;
  const allowed = parsed.hostname === "avatar.moonshot.cn"
    || parsed.hostname.endsWith(".moonshot.cn")
    || parsed.hostname === "kimi.com"
    || parsed.hostname.endsWith(".kimi.com");
  if (!allowed) return null;
  try {
    const response = await fetchImpl(parsed, {
      headers: { Accept: "image/*" },
      signal: AbortSignal.timeout(8000),
    });
    const contentType = response.headers.get("content-type") || "";
    if (!response.ok || !contentType.startsWith("image/")) return null;
    const contentLength = toNumber(response.headers.get("content-length"));
    if (contentLength != null && (contentLength <= 0 || contentLength > MAX_AVATAR_BYTES)) {
      return null;
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > MAX_AVATAR_BYTES) return null;
    return `data:${contentType.split(";")[0]};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

async function fetchKimiAccount({
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
  const baseUrl = (env.KIMI_CODE_BASE_URL || DEFAULT_KIMI_CODE_BASE_URL).replace(/\/+$/, "");
  const load = () => fetchImpl(`${baseUrl}/usages`, {
    headers: {
      ...deviceHeaders(configDir, clientVersion),
      Accept: "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(10000),
  });
  let response = await load();
  if (response.status === 401 && !forceRefresh) {
    accessToken = await refreshCredential({
      clientVersion,
      configDir,
      env,
      fetchImpl,
      file,
      force: true,
      now,
    });
    response = await load();
  }
  if (!response.ok) {
    const message = await responseError(
      response,
      `Kimi usage request failed with HTTP ${response.status}`,
    );
    throw new Error(response.status === 401
      ? `${message}; sign in to Kimi Code again`
      : message);
  }
  const account = parseKimiAccountPayload(await response.json());
  const fetchedAvatar = await fetchAvatarDataUrl(account.profile.avatar, fetchImpl);
  account.profile.avatar = fetchedAvatar || generatedAvatar(account.profile.id);
  account.profile.avatarSource = fetchedAvatar ? "service" : "generated";
  return {
    ...account,
    fetchedAt: now(),
  };
}

module.exports = {
  fetchKimiAccount,
  generatedAvatar,
  parseKimiAccountPayload,
};
