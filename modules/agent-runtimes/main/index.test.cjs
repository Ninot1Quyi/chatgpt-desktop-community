const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  getKimiAuth,
  normalizeKimiWebProfile,
  parseKimiOAuthProfile,
  parseKimiUsagePayload,
  validateRun,
} = require("./index.cjs");
const { fetchKimiAccount } = require("./kimi-account.cjs");
const {
  fetchAvatarDataUrl,
  isAllowedAvatarUrl,
} = require("./kimi-web-profile.cjs");

const catalog = {
  claude: {
    label: "Claude Code",
    available: true,
    models: [{ model: "sonnet" }],
  },
  kimi: {
    label: "Kimi Code",
    available: true,
    models: [{ model: "kimi-code/k3" }],
  },
};

test("runtime validation accepts only a model owned by that runtime", () => {
  assert.doesNotThrow(() => validateRun({ runtime: "claude", model: "sonnet" }, catalog));
  assert.doesNotThrow(() => validateRun({ runtime: "kimi", model: "kimi-code/k3" }, catalog));
  assert.throws(
    () => validateRun({ runtime: "claude", model: "kimi-code/k3" }, catalog),
    /does not belong to Claude Code/,
  );
  assert.throws(
    () => validateRun({ runtime: "kimi", model: "sonnet" }, catalog),
    /does not belong to Kimi Code/,
  );
});

test("runtime validation rejects unavailable and unknown runtimes", () => {
  assert.throws(
    () => validateRun({ runtime: "kimi", model: "kimi-code/k3" }, {
      ...catalog,
      kimi: { ...catalog.kimi, available: false, error: "not signed in" },
    }),
    /not signed in/,
  );
  assert.throws(() => validateRun({ runtime: "codex", model: "gpt" }, catalog), /Unsupported/);
});

test("runtime validation rejects malformed sessions and unsupported effort values", () => {
  const effortCatalog = {
    ...catalog,
    claude: {
      ...catalog.claude,
      models: [{
        model: "sonnet",
        supportedReasoningEfforts: [{ reasoningEffort: "high" }],
      }],
    },
  };
  assert.throws(
    () => validateRun({ runtime: "claude", model: "sonnet", sessionId: "--resume" }, effortCatalog),
    /Invalid Claude Code session ID/,
  );
  assert.throws(
    () => validateRun({ runtime: "claude", model: "sonnet", effort: "ultra" }, effortCatalog),
    /is not available/,
  );
});

test("Kimi auth requires a saved OAuth token rather than any JSON file", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "community-kimi-auth-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const configDir = path.join(root, "kimi-home");
  const credentialsDir = path.join(configDir, "credentials");
  const env = { KIMI_CODE_HOME: configDir };

  assert.deepEqual(getKimiAuth(root, env), {
    loggedIn: false,
    detail: "No saved Kimi credentials",
  });

  fs.mkdirSync(credentialsDir, { recursive: true });
  fs.writeFileSync(path.join(credentialsDir, "broken.json"), "{", "utf8");
  fs.writeFileSync(path.join(credentialsDir, "empty.json"), JSON.stringify({
    access_token: "",
    refresh_token: "",
  }), "utf8");
  assert.equal(getKimiAuth(root, env).loggedIn, false);

  fs.writeFileSync(path.join(credentialsDir, "kimi-code.json"), JSON.stringify({
    access_token: "",
    refresh_token: "refresh-token",
    expires_at: 0,
  }), "utf8");
  assert.deepEqual(getKimiAuth(root, env), {
    loggedIn: true,
    detail: "oauth_credentials",
  });
});

const kimiUsageFixture = {
  user: {
    userId: "user_123456789",
    nickname: "Must not be treated as profile data",
    avatar: "https://example.invalid/avatar.png",
    region: "REGION_CN",
    membership: { level: "LEVEL_ADVANCED" },
  },
  usage: {
    limit: "100",
    used: "93",
    remaining: "7",
    resetTime: "2026-08-01T10:32:45.952887Z",
  },
  limits: [{
    window: { duration: 300, timeUnit: "TIME_UNIT_MINUTE" },
    detail: {
      limit: "100",
      remaining: "80",
      resetTime: "2026-07-29T11:32:45.952887Z",
    },
  }],
  parallel: { limit: "30", used: "4", remaining: "26" },
  totalQuota: {
    monthly: { limit: "1000", remaining: "640" },
    accessToken: "must-not-cross-ipc",
  },
  boosterWallet: {
    status: "STATUS_ACTIVE",
    allowTopup: true,
    balance: {
      type: "BOOSTER",
      amount: "25000000",
      amountLeft: "12500000",
      currency: "CNY",
    },
    topupLimit: { currency: "CNY", priceInCents: "300000" },
    autoRefillCharge: { currency: "CNY", priceInCents: "5000" },
    autoRefillThreshold: { currency: "CNY", priceInCents: "2000" },
    monthlyChargeLimit: { currency: "CNY", priceInCents: "10000" },
    monthlyUsed: { currency: "CNY", priceInCents: "3500" },
  },
  authentication: { method: "METHOD_ACCESS_TOKEN", scope: "FEATURE_CODING" },
  subType: "TYPE_PURCHASE",
  domain: "DOMAIN_NEXUS",
};

function testJwt(payload) {
  return [
    Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url"),
    Buffer.from(JSON.stringify(payload)).toString("base64url"),
    "test-signature",
  ].join(".");
}

test("Kimi OAuth profile uses identity claims without inventing service profile fields", () => {
  const profile = parseKimiOAuthProfile(testJwt({
    user_id: "user_123456789",
    nickname: "Must not be exposed",
    avatar: "https://example.invalid/avatar.png",
  }));
  assert.deepEqual(profile, {
    id: "user_123456789",
    username: "Kimi Code account",
    usernameSource: "account_id",
    avatar: null,
    avatarSource: "unavailable",
    region: null,
    membershipLevel: null,
    businessId: null,
    availability: "oauth_identity_only",
  });
});

test("Kimi Web profile normalizes only display identity fields", () => {
  const normalized = normalizeKimiWebProfile({
    id: "user_123456789",
    nickname: "Kimi User",
    avatarUrl: "https://statics.moonshot.cn/avatar.png",
    region: "REGION_CN",
    accessToken: "must-not-cross-ipc",
    refreshToken: "must-not-cross-ipc",
  });
  assert.deepEqual(normalized, {
    avatarUrl: "https://statics.moonshot.cn/avatar.png",
    profile: {
      id: "user_123456789",
      username: "Kimi User",
      usernameSource: "service",
      avatar: null,
      avatarSource: "unavailable",
      region: "REGION_CN",
      membershipLevel: null,
      businessId: null,
      availability: "service",
    },
  });
  assert.equal(JSON.stringify(normalized).includes("must-not-cross-ipc"), false);
  assert.equal(normalizeKimiWebProfile({
    id: "anonymous",
    nickname: "Anonymous",
    isAnonymous: true,
  }), null);
});

test("Kimi Web profile accepts only HTTPS Kimi and Moonshot avatar origins", () => {
  assert.equal(isAllowedAvatarUrl("https://www.kimi.com/avatar.png"), true);
  assert.equal(isAllowedAvatarUrl("https://statics.moonshot.cn/avatar.png"), true);
  assert.equal(isAllowedAvatarUrl("https://cdn.moonshot.ai/avatar.png"), true);
  assert.equal(isAllowedAvatarUrl("http://www.kimi.com/avatar.png"), false);
  assert.equal(isAllowedAvatarUrl("https://kimi.com.example.invalid/avatar.png"), false);
  assert.equal(isAllowedAvatarUrl("https://example.invalid/avatar.png"), false);
});

test("Kimi Web avatar conversion permits bounded raster images only", async () => {
  const png = await fetchAvatarDataUrl(
    "https://statics.moonshot.cn/avatar.png",
    {
      fetch: async () => new Response(Uint8Array.from([0x89, 0x50, 0x4e, 0x47]), {
        headers: { "content-type": "image/png; charset=binary" },
      }),
    },
  );
  assert.equal(png, "data:image/png;base64,iVBORw==");

  const svg = await fetchAvatarDataUrl(
    "https://statics.moonshot.cn/avatar.svg",
    {
      fetch: async () => new Response("<svg />", {
        headers: { "content-type": "image/svg+xml" },
      }),
    },
  );
  assert.equal(svg, null);

  const oversized = await fetchAvatarDataUrl(
    "https://statics.moonshot.cn/avatar.png",
    {
      fetch: async () => new Response("not-read", {
        headers: {
          "content-length": String(2 * 1024 * 1024 + 1),
          "content-type": "image/png",
        },
      }),
    },
  );
  assert.equal(oversized, null);
});

test("Kimi usage parser preserves every reported quota dimension without producing profile data", () => {
  const usage = parseKimiUsagePayload(kimiUsageFixture);
  assert.equal(Object.hasOwn(usage, "profile"), false);
  assert.deepEqual(usage.summary, {
    label: "Weekly limit",
    used: 93,
    limit: 100,
    remaining: 7,
    resetAt: "2026-08-01T10:32:45.952887Z",
    resetInSeconds: null,
    window: null,
  });
  assert.equal(usage.limits[0].label, "5 hour limit");
  assert.equal(usage.limits[0].used, 20);
  assert.deepEqual(usage.parallel, { limit: 30, used: 4, remaining: 26 });
  assert.deepEqual(usage.totalQuota, {
    monthly: { limit: "1000", remaining: "640" },
  });
  assert.deepEqual(usage.boosterWallet, {
    status: "STATUS_ACTIVE",
    allowTopup: true,
    balance: {
      type: "BOOSTER",
      totalCents: 25,
      remainingCents: 13,
      currency: "CNY",
    },
    topupLimit: { cents: 300000, currency: "CNY" },
    autoRefillCharge: { cents: 5000, currency: "CNY" },
    autoRefillThreshold: { cents: 2000, currency: "CNY" },
    monthlyChargeLimitEnabled: true,
    monthlyChargeLimit: { cents: 10000, currency: "CNY" },
    monthlyUsed: { cents: 3500, currency: "CNY" },
  });
});

test("Kimi account fetch refreshes expired CLI credentials without exposing tokens", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "community-kimi-account-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const credentialsDir = path.join(root, "credentials");
  fs.mkdirSync(credentialsDir, { recursive: true });
  const credentialFile = path.join(credentialsDir, "kimi-code.json");
  fs.writeFileSync(credentialFile, JSON.stringify({
    access_token: "expired-access",
    refresh_token: "refresh-one",
    expires_at: 1,
    expires_in: 3600,
    scope: "kimi-code",
    token_type: "Bearer",
  }), "utf8");

  const calls = [];
  const freshAccess = testJwt({ user_id: "user_123456789" });
  const fetchImpl = async (url, options = {}) => {
    calls.push(String(url));
    if (String(url).endsWith("/api/oauth/token")) {
      assert.equal(String(options.body).includes("refresh-one"), true);
      return new Response(JSON.stringify({
        access_token: freshAccess,
        refresh_token: "refresh-two",
        expires_in: 3600,
        scope: "kimi-code",
        token_type: "Bearer",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    assert.equal(options.headers.Authorization, `Bearer ${freshAccess}`);
    return new Response(JSON.stringify(kimiUsageFixture), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  const account = await fetchKimiAccount({
    clientVersion: "0.29.0",
    configDir: root,
    fetchImpl,
    now: () => 2_000_000,
  });
  assert.deepEqual(calls, [
    "https://auth.kimi.com/api/oauth/token",
    "https://api.kimi.com/coding/v1/usages",
  ]);
  assert.equal(account.profile.id, "user_123456789");
  assert.equal(account.profile.avatar, null);
  assert.equal(account.profile.avatarSource, "unavailable");
  assert.equal(account.profileStatus, "not_connected");
  assert.equal(account.usage.summary.remaining, 7);
  assert.equal(account.errors.profile, null);
  assert.equal(account.errors.usage, null);
  assert.equal(JSON.stringify(account).includes(freshAccess), false);
  assert.equal(JSON.stringify(account).includes("refresh-two"), false);
  const saved = JSON.parse(fs.readFileSync(credentialFile, "utf8"));
  assert.equal(saved.access_token, freshAccess);
  assert.equal(saved.refresh_token, "refresh-two");
});

test("Kimi usage failure preserves the independently derived OAuth identity", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "community-kimi-profile-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const credentialsDir = path.join(root, "credentials");
  fs.mkdirSync(credentialsDir, { recursive: true });
  const accessToken = testJwt({ user_id: "user_profile_survives" });
  fs.writeFileSync(path.join(credentialsDir, "kimi-code.json"), JSON.stringify({
    access_token: accessToken,
    refresh_token: "unused-refresh",
    expires_at: 0,
    expires_in: 3600,
  }), "utf8");

  const account = await fetchKimiAccount({
    configDir: root,
    fetchImpl: async (url) => {
      assert.equal(String(url), "https://api.kimi.com/coding/v1/usages");
      return new Response(JSON.stringify({ message: "Usage temporarily unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    },
  });

  assert.equal(account.profile.id, "user_profile_survives");
  assert.equal(account.usage, null);
  assert.equal(account.errors.usage, "Usage temporarily unavailable");
});

test("Kimi Web profile overrides OAuth fallback without affecting quota data", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "community-kimi-web-profile-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const credentialsDir = path.join(root, "credentials");
  fs.mkdirSync(credentialsDir, { recursive: true });
  const accessToken = testJwt({ user_id: "oauth_fallback" });
  fs.writeFileSync(path.join(credentialsDir, "kimi-code.json"), JSON.stringify({
    access_token: accessToken,
    refresh_token: "unused-refresh",
    expires_at: 0,
    expires_in: 3600,
  }), "utf8");
  const serviceProfile = {
    id: "kimi_web_user",
    username: "Kimi Web User",
    usernameSource: "service",
    avatar: "data:image/png;base64,AA==",
    avatarSource: "service",
    region: "REGION_CN",
    membershipLevel: null,
    businessId: null,
    availability: "service",
  };

  const account = await fetchKimiAccount({
    configDir: root,
    fetchImpl: async (url) => {
      assert.equal(String(url), "https://api.kimi.com/coding/v1/usages");
      return new Response(JSON.stringify(kimiUsageFixture), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
    profileProvider: {
      async getProfile() {
        return {
          status: "connected",
          profile: serviceProfile,
          error: null,
        };
      },
    },
  });

  assert.deepEqual(account.profile, serviceProfile);
  assert.equal(account.profileStatus, "connected");
  assert.equal(account.errors.profile, null);
  assert.equal(account.usage.summary.remaining, 7);
});

test("Kimi Web profile remains available when Kimi Code credentials fail", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "community-kimi-independent-profile-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const serviceProfile = {
    id: "kimi_web_only",
    username: "Web Profile",
    usernameSource: "service",
    avatar: null,
    avatarSource: "unavailable",
    region: null,
    membershipLevel: null,
    businessId: null,
    availability: "service",
  };

  const account = await fetchKimiAccount({
    configDir: root,
    fetchImpl: async () => {
      throw new Error("Kimi Code usage must not be requested without credentials");
    },
    profileProvider: {
      async getProfile() {
        return {
          status: "connected",
          profile: serviceProfile,
          error: null,
        };
      },
    },
  });

  assert.deepEqual(account.profile, serviceProfile);
  assert.equal(account.profileStatus, "connected");
  assert.equal(account.usage, null);
  assert.equal(account.errors.usage, "No saved Kimi OAuth credentials");
});
