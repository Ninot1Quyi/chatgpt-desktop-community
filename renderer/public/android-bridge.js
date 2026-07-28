(() => {
  if (!window.CodexNative) return;
  document.documentElement.classList.add("android");
  if (!localStorage.getItem("android.mobile-layout")) {
    localStorage.setItem("android.mobile-layout", "1");
    localStorage.setItem("ui.sidebarOpen", "false");
    localStorage.setItem("ui.rightOpen", "false");
    localStorage.setItem("ui.sidebarWidth", JSON.stringify(Math.min(window.innerWidth, 360)));
  }

  const pending = new Map();
  const listeners = new Map();
  let nextId = 1;

  const call = (action, payload = {}) =>
    new Promise((resolve, reject) => {
      const id = `android:${nextId++}`;
      pending.set(id, { resolve, reject });
      window.CodexNative.postMessage(JSON.stringify({ id, action, ...payload }));
    });

  const subscribe = (event, callback) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(callback);
    return () => listeners.get(event)?.delete(callback);
  };

  window.__codexAndroidReceive = (raw) => {
    const message = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (message.type === "response") {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error));
      else waiter.resolve(message.result);
      return;
    }
    if (message.type === "event") {
      for (const callback of listeners.get(message.event) || []) {
        callback(message.payload);
      }
    }
  };

  window.codexBridge = {
    request: (method, params) => call("request", { method, params }),
    respond: (id, result, error) => call("respond", { requestId: id, result, error }),
    onNotification: (callback) => subscribe("notification", callback),
    onServerRequest: (callback) => subscribe("serverRequest", callback),
    onStatus: (callback) => subscribe("status", callback),
    getStatus: () => call("getStatus"),
    restartAppServer: () => call("restart"),
    pickDirectory: () => call("pickDirectory"),
    showItemInFolder: (path) => call("openPath", { path }),
    openPath: (path) => call("openPath", { path }),
    openExternal: (url) => call("openExternal", { url }),
    getAppInfo: () => call("getAppInfo"),
    rolloutActivity: () => Promise.resolve(null),
    captureWebview: () => Promise.reject(new Error("Browser capture is unavailable on Android")),
    saveTempFile: (dataUrl, prefix, ext) => call("saveTempFile", { dataUrl, prefix, ext }),
    onThemeUpdated: (callback) => subscribe("themeUpdated", callback),
    onHotkeyShown: () => () => {},
    hideHotkey: () => Promise.resolve(true),
    toggleHotkeyPin: () => Promise.resolve(false),
    showMainWindow: () => Promise.resolve(true),
    toggleQuickChat: () => Promise.resolve(true),
    togglePreventSleep: (on) => call("keepAwake", { on }),
    gsRead: () => call("gsRead"),
    gsPatch: (patch) => call("gsPatch", { patch }),
    onGsChanged: (callback) => subscribe("gsChanged", callback),
    profileRead: () => Promise.resolve(null),
    openThreadWindow: () => Promise.resolve(false),
    iconFetch: () => Promise.resolve(null),
    logout: () => call("logout"),
  };

  const mountHelperButton = async () => {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "⚡";
    button.setAttribute("aria-label", "打开 Codex 权限助手");
    Object.assign(button.style, {
      position: "fixed",
      right: "14px",
      bottom: "18px",
      zIndex: "2147483647",
      width: "44px",
      height: "44px",
      border: "1px solid rgba(127,127,127,.35)",
      borderRadius: "22px",
      background: "rgba(30,30,30,.92)",
      color: "white",
      fontSize: "20px",
      boxShadow: "0 4px 16px rgba(0,0,0,.28)",
    });
    button.onclick = () => call("openHelper");
    button.hidden = true;
    document.body.appendChild(button);
    const refresh = async () => {
      try {
        const status = await call("helperStatus");
        button.hidden = Boolean(status?.running);
        button.title = status?.running ? "权限服务已运行" : "点此配置权限服务";
      } catch {
        button.hidden = false;
        button.title = "点此配置权限服务";
      }
    };
    await refresh();
    setTimeout(refresh, 1500);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) refresh();
    });
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountHelperButton, { once: true });
  } else {
    mountHelperButton();
  }
})();
