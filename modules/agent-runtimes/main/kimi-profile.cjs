function isRecord(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function decodeJwtPayload(accessToken) {
  if (typeof accessToken !== "string") return null;
  const parts = accessToken.split(".");
  if (parts.length < 2 || !parts[1]) return null;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return isRecord(payload) ? payload : null;
  } catch {
    return null;
  }
}

function firstIdentity(payload, keys) {
  if (!payload) return "";
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function parseKimiOAuthProfile(accessToken) {
  const claims = decodeJwtPayload(accessToken);
  const userId = firstIdentity(claims, ["user_id", "sub"]);
  return {
    id: userId,
    username: "Kimi Code account",
    usernameSource: userId ? "account_id" : "fallback",
    avatar: null,
    avatarSource: "unavailable",
    region: null,
    membershipLevel: null,
    businessId: null,
    availability: "oauth_identity_only",
  };
}

module.exports = {
  parseKimiOAuthProfile,
};
