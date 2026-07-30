const KIMI_WEB_ORIGIN = "https://www.kimi.com";
const KIMI_WEB_PROFILE_PARTITION = "persist:kimi-web-profile";
const MAX_AVATAR_BYTES = 2 * 1024 * 1024;
const LOGIN_TIMEOUT_MS = 10 * 60 * 1000;
const PROFILE_POLL_MS = 1200;
const ALLOWED_AVATAR_CONTENT_TYPES = new Set([
  "image/avif",
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const PROFILE_EVALUATION_SCRIPT = `(() => {
  const safeMessage = (value) => String(value || "").slice(0, 240);
  const parseClaims = (token) => {
    try {
      const part = String(token || "").split(".")[1];
      if (!part) return {};
      const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
      return JSON.parse(decodeURIComponent(Array.from(atob(padded))
        .map((char) => "%" + char.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("")));
    } catch {
      return {};
    }
  };
  const requestProfile = async (accessToken) => {
    const claims = parseClaims(accessToken);
    return fetch("/api/user", {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + accessToken,
        "x-msh-platform": "web",
        ...(claims.user_id ? { "X-Traffic-Id": String(claims.user_id) } : {}),
      },
    });
  };
  const refreshAccessToken = async () => {
    const refreshToken = localStorage.getItem("refresh_token");
    if (!refreshToken) return null;
    const response = await fetch("/api/auth/token/refresh", {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
        Authorization: "Bearer " + refreshToken,
        "x-msh-platform": "web",
      },
    });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        localStorage.removeItem("access_token");
        localStorage.removeItem("refresh_token");
        localStorage.removeItem("msh_user_id");
      }
      return null;
    }
    const payload = await response.json();
    if (typeof payload.access_token === "string" && payload.access_token) {
      localStorage.setItem("access_token", payload.access_token);
    }
    if (typeof payload.refresh_token === "string" && payload.refresh_token) {
      localStorage.setItem("refresh_token", payload.refresh_token);
    }
    return typeof payload.access_token === "string" ? payload.access_token : null;
  };

  return (async () => {
    try {
      if (location.origin !== "${KIMI_WEB_ORIGIN}") {
        return { status: "not_connected" };
      }
      let accessToken = localStorage.getItem("access_token");
      if (!accessToken) {
        return { status: "not_connected" };
      }
      let response = await requestProfile(accessToken);
      if (response.status === 401) {
        accessToken = await refreshAccessToken();
        if (!accessToken) {
          return { status: "not_connected" };
        }
        response = await requestProfile(accessToken);
      }
      if (!response.ok) {
        return {
          status: "unavailable",
          error: "Kimi profile request failed with HTTP " + response.status,
        };
      }
      const raw = await response.json();
      return {
        status: "connected",
        profile: {
          id: raw && raw.id,
          nickname: raw && (raw.nickname || raw.name),
          avatarUrl: raw && (raw.avatar || raw.avatar_url),
          region: raw && raw.region,
          isAnonymous: Boolean(raw && raw.is_anonymous),
        },
      };
    } catch (error) {
      return {
        status: "unavailable",
        error: safeMessage(error && error.message ? error.message : error),
      };
    }
  })();
})()`;

function stringValue(value, maxLength) {
  const text = typeof value === "string"
    ? value.trim()
    : typeof value === "number"
      ? String(value)
      : "";
  return text.slice(0, maxLength);
}

function normalizeKimiWebProfile(raw) {
  if (!raw || typeof raw !== "object" || raw.isAnonymous === true) return null;
  const id = stringValue(raw.id, 200);
  const nickname = stringValue(raw.nickname, 200);
  const avatarUrl = stringValue(raw.avatarUrl, 2048);
  const region = stringValue(raw.region, 100);
  if (!id && !nickname) return null;
  return {
    avatarUrl,
    profile: {
      id,
      username: nickname || id || "Kimi account",
      usernameSource: nickname ? "service" : id ? "account_id" : "fallback",
      avatar: null,
      avatarSource: "unavailable",
      region: region || null,
      membershipLevel: null,
      businessId: null,
      availability: "service",
    },
  };
}

function isAllowedAvatarUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  const host = url.hostname.toLowerCase();
  return host === "kimi.com"
    || host.endsWith(".kimi.com")
    || host === "moonshot.cn"
    || host.endsWith(".moonshot.cn")
    || host === "moonshot.ai"
    || host.endsWith(".moonshot.ai");
}

async function fetchAvatarDataUrl(value, session) {
  if (!isAllowedAvatarUrl(value) || typeof session?.fetch !== "function") return null;
  try {
    const response = await session.fetch(value, {
      headers: { Accept: "image/*" },
    });
    const contentType = (response.headers.get("content-type") || "")
      .split(";")[0]
      .trim()
      .toLowerCase();
    if (!response.ok || !ALLOWED_AVATAR_CONTENT_TYPES.has(contentType)) return null;
    const contentLength = Number(response.headers.get("content-length") || 0);
    if (contentLength > MAX_AVATAR_BYTES) return null;
    const reader = response.body?.getReader?.();
    if (!reader) return null;
    const chunks = [];
    let total = 0;
    while (true) {
      const { done, value: chunk } = await reader.read();
      if (done) break;
      total += chunk.byteLength;
      if (total > MAX_AVATAR_BYTES) {
        await reader.cancel().catch(() => {});
        return null;
      }
      chunks.push(Buffer.from(chunk));
    }
    if (!total) return null;
    const bytes = Buffer.concat(chunks, total);
    return `data:${contentType};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function secureWebPreferences() {
  return {
    partition: KIMI_WEB_PROFILE_PARTITION,
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    webSecurity: true,
    backgroundThrottling: false,
  };
}

function allowSecureNavigation(event, url) {
  try {
    if (new URL(url).protocol === "https:") return;
  } catch {}
  event.preventDefault();
}

function createKimiWebProfileService({
  BrowserWindow,
  session,
  log = () => {},
}) {
  if (typeof BrowserWindow !== "function") {
    throw new Error("Kimi Web profile requires Electron BrowserWindow");
  }
  if (typeof session?.fromPartition !== "function") {
    throw new Error("Kimi Web profile requires Electron session");
  }

  const windows = new Set();
  let probePromise = null;
  let loginPromise = null;
  let loginWindow = null;

  function createWindow({ parent = null, show = false } = {}) {
    const window = new BrowserWindow({
      width: 1080,
      height: 760,
      minWidth: 720,
      minHeight: 560,
      title: "Sign in to Kimi",
      autoHideMenuBar: true,
      backgroundColor: "#ffffff",
      show: false,
      ...(parent && !parent.isDestroyed?.() ? { parent } : {}),
      webPreferences: secureWebPreferences(),
    });
    windows.add(window);
    window.once("closed", () => {
      windows.delete(window);
      if (loginWindow === window) loginWindow = null;
    });
    window.webContents.on("will-navigate", allowSecureNavigation);
    window.webContents.on("will-attach-webview", (event) => event.preventDefault());
    window.webContents.setWindowOpenHandler(({ url }) => {
      try {
        if (new URL(url).protocol !== "https:") return { action: "deny" };
      } catch {
        return { action: "deny" };
      }
      return {
        action: "allow",
        overrideBrowserWindowOptions: {
          parent: window,
          autoHideMenuBar: true,
          webPreferences: secureWebPreferences(),
        },
      };
    });
    if (show) window.once("ready-to-show", () => window.show());
    return window;
  }

  async function profileFromWindow(window) {
    const result = await window.webContents.executeJavaScript(
      PROFILE_EVALUATION_SCRIPT,
      true,
    );
    if (result?.status !== "connected") {
      return {
        status: result?.status === "not_connected" ? "not_connected" : "unavailable",
        profile: null,
        error: result?.error ? String(result.error).slice(0, 240) : null,
      };
    }
    const normalized = normalizeKimiWebProfile(result.profile);
    if (!normalized) {
      return {
        status: "not_connected",
        profile: null,
        error: null,
      };
    }
    const avatar = await fetchAvatarDataUrl(
      normalized.avatarUrl,
      window.webContents.session,
    );
    normalized.profile.avatar = avatar;
    normalized.profile.avatarSource = avatar ? "service" : "unavailable";
    return {
      status: "connected",
      profile: normalized.profile,
      error: null,
    };
  }

  async function runProbe() {
    const window = createWindow();
    try {
      await window.loadURL(KIMI_WEB_ORIGIN);
      return await profileFromWindow(window);
    } catch (error) {
      return {
        status: "unavailable",
        profile: null,
        error: String(error?.message || error).slice(0, 240),
      };
    } finally {
      if (!window.isDestroyed()) window.destroy();
    }
  }

  async function getProfile() {
    if (probePromise) return probePromise;
    probePromise = runProbe().finally(() => {
      probePromise = null;
    });
    return probePromise;
  }

  async function runLogin(parent) {
    const existing = await getProfile();
    if (existing.status === "connected") return existing;

    const window = createWindow({ parent, show: true });
    loginWindow = window;
    let interval = null;
    let timeout = null;
    let settled = false;

    return new Promise((resolve) => {
      const finish = (result) => {
        if (settled) return;
        settled = true;
        if (interval) clearInterval(interval);
        if (timeout) clearTimeout(timeout);
        resolve(result);
        if (!window.isDestroyed()) window.close();
      };
      const check = async () => {
        if (settled || window.isDestroyed()) return;
        try {
          const result = await profileFromWindow(window);
          if (result.status === "connected") {
            log("info", "kimi_profile_login_completed");
            finish(result);
          }
        } catch {}
      };

      window.once("closed", () => {
        if (!settled) {
          settled = true;
          if (interval) clearInterval(interval);
          if (timeout) clearTimeout(timeout);
          resolve({
            status: "cancelled",
            profile: null,
            error: null,
          });
        }
      });
      window.loadURL(KIMI_WEB_ORIGIN)
        .then(() => {
          if (!window.isDestroyed()) window.show();
          check();
          interval = setInterval(check, PROFILE_POLL_MS);
          timeout = setTimeout(() => {
            finish({
              status: "unavailable",
              profile: null,
              error: "Kimi profile sign-in timed out",
            });
          }, LOGIN_TIMEOUT_MS);
        })
        .catch((error) => {
          finish({
            status: "unavailable",
            profile: null,
            error: String(error?.message || error).slice(0, 240),
          });
        });
    });
  }

  function login({ parent = null } = {}) {
    if (loginPromise) {
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.show();
        loginWindow.focus();
      }
      return loginPromise;
    }
    log("info", "kimi_profile_login_started");
    loginPromise = runLogin(parent).finally(() => {
      loginPromise = null;
    });
    return loginPromise;
  }

  async function logout() {
    if (loginWindow && !loginWindow.isDestroyed()) loginWindow.close();
    const profileSession = session.fromPartition(KIMI_WEB_PROFILE_PARTITION);
    await profileSession.clearStorageData({
      storages: [
        "cookies",
        "indexdb",
        "localstorage",
        "serviceworkers",
        "cachestorage",
      ],
    });
    log("info", "kimi_profile_logout_completed");
    return { status: "not_connected" };
  }

  function dispose() {
    for (const window of windows) {
      if (!window.isDestroyed()) window.destroy();
    }
    windows.clear();
    loginWindow = null;
  }

  return {
    dispose,
    getProfile,
    login,
    logout,
  };
}

module.exports = {
  KIMI_WEB_ORIGIN,
  KIMI_WEB_PROFILE_PARTITION,
  createKimiWebProfileService,
  fetchAvatarDataUrl,
  isAllowedAvatarUrl,
  normalizeKimiWebProfile,
};
