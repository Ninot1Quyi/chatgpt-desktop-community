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
  profileProvider = null,
} = {}) {
  const usagePromise = Promise.resolve()
    .then(async () => {
      const authSession = await createKimiAuthSession({
        clientVersion,
        configDir,
        env,
        fetchImpl,
        forceRefresh,
        now,
      });
      const fallbackProfile = parseKimiOAuthProfile(authSession.getAccessToken());
      try {
        const usage = await fetchKimiUsage({
          authSession,
          env,
          fetchImpl,
        });
        return {
          fallbackProfile,
          usage,
          error: null,
        };
      } catch (error) {
        return {
          fallbackProfile,
          usage: null,
          error: String(error?.message || error),
        };
      }
    })
    .catch((error) => ({
      fallbackProfile: null,
      usage: null,
      error: String(error?.message || error),
    }));
  const profilePromise = profileProvider?.getProfile
    ? Promise.resolve()
      .then(() => profileProvider.getProfile())
      .catch((error) => ({
        status: "unavailable",
        profile: null,
        error: String(error?.message || error),
      }))
    : Promise.resolve({
      status: "not_connected",
      profile: null,
      error: null,
    });
  const [usageResult, profileResult] = await Promise.all([
    usagePromise,
    profilePromise,
  ]);
  const serviceProfile = profileResult?.status === "connected"
    ? profileResult.profile
    : null;

  return {
    profile: serviceProfile || usageResult.fallbackProfile,
    profileStatus: profileResult?.status || "unavailable",
    usage: usageResult.usage,
    errors: {
      profile: profileResult?.error || null,
      usage: usageResult.error,
    },
    fetchedAt: now(),
  };
}

module.exports = {
  fetchKimiAccount,
};
