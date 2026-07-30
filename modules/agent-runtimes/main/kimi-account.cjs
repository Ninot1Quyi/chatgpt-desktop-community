const { createKimiAuthSession } = require("./kimi-auth.cjs");
const { parseKimiOAuthProfile } = require("./kimi-profile.cjs");
const { fetchKimiUsage } = require("./kimi-usage.cjs");

async function fetchKimiAccount({
  clientVersion = "unknown",
  configDir,
  env = process.env,
  fetchImpl = globalThis.fetch,
  forceRefresh = false,
  now = Date.now,
} = {}) {
  const authSession = await createKimiAuthSession({
    clientVersion,
    configDir,
    env,
    fetchImpl,
    forceRefresh,
    now,
  });

  let usage = null;
  let usageError = null;
  try {
    usage = await fetchKimiUsage({
      authSession,
      env,
      fetchImpl,
    });
  } catch (error) {
    usageError = String(error?.message || error);
  }

  return {
    profile: parseKimiOAuthProfile(authSession.getAccessToken()),
    usage,
    errors: {
      usage: usageError,
    },
    fetchedAt: now(),
  };
}

module.exports = {
  fetchKimiAccount,
};
