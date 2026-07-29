export function listOfClients(response) {
  const list = response?.data || response?.clients || response?.devices || (Array.isArray(response) ? response : []);
  return Array.isArray(list) ? list : [];
}

export function clientIdOf(client) {
  return client?.clientId || client?.id || client?.deviceId || null;
}

export function environmentIdOf(status, pairing) {
  return status?.environmentId || pairing?.environmentId || null;
}

export function isRemoteControlEnabled(status) {
  return status?.status === "connecting" || status?.status === "connected";
}

export function formatRemoteStatus(status) {
  if (!status) return "Remote control status unavailable";
  const state = status.status ? String(status.status).replaceAll("_", " ") : "unknown";
  const server = status.serverName ? `${status.serverName} · ` : "";
  return `Status: ${server}${state}`;
}

export function formatClientTitle(client) {
  return client?.displayName || client?.deviceModel || clientIdOf(client) || "Unknown device";
}

export function formatClientDescription(client) {
  return [client?.deviceType, client?.deviceModel, client?.osVersion || client?.platform]
    .filter(Boolean)
    .join(" · ") || undefined;
}

export function formatPairingExpiry(expiresAt) {
  if (!expiresAt) return null;
  const date = new Date(expiresAt > 1e12 ? expiresAt : expiresAt * 1000);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}
