const DEFAULT_KIMI_CODE_BASE_URL = "https://api.kimi.com/coding/v1";
const FIXED_POINT_CENTS = 1_000_000;
const SENSITIVE_QUOTA_KEYS = new Set([
  "accesstoken",
  "authorization",
  "credential",
  "password",
  "refreshtoken",
  "secret",
]);

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
  if (Array.isArray(value)) {
    return value.slice(0, 100).map((item) => copyQuotaValue(item, depth + 1));
  }
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

function parseKimiUsagePayload(payload) {
  const record = isRecord(payload) ? payload : {};
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
  };
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

async function fetchKimiUsage({
  authSession,
  env = process.env,
  fetchImpl = globalThis.fetch,
} = {}) {
  if (!authSession) throw new Error("Kimi auth session is required");
  const baseUrl = (env.KIMI_CODE_BASE_URL || DEFAULT_KIMI_CODE_BASE_URL).replace(/\/+$/, "");
  const load = () => fetchImpl(`${baseUrl}/usages`, {
    headers: authSession.requestHeaders(),
    signal: AbortSignal.timeout(10000),
  });

  let response = await load();
  if (response.status === 401) {
    await authSession.refresh();
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
  return parseKimiUsagePayload(await response.json());
}

module.exports = {
  fetchKimiUsage,
  parseKimiUsagePayload,
};
