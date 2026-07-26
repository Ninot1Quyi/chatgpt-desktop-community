// Preload: exposes a minimal, safe bridge to the renderer (contextIsolation on).
const { contextBridge, ipcRenderer } = require("electron");

function subscribe(channel) {
  return (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld("codexBridge", {
  // JSON-RPC to app-server
  request: (method, params) => ipcRenderer.invoke("rpc:request", { method, params }),
  respond: (id, result, error) => ipcRenderer.invoke("rpc:respond", { id, result, error }),
  onNotification: subscribe("rpc:notification"),
  onServerRequest: subscribe("rpc:server-request"),
  onStatus: subscribe("appserver:status"),
  getStatus: () => ipcRenderer.invoke("appserver:get-status"),
  restartAppServer: () => ipcRenderer.invoke("appserver:restart"),

  // Shell / dialogs
  pickDirectory: (defaultPath) => ipcRenderer.invoke("dialog:pick-directory", { defaultPath }),
  showItemInFolder: (p) => ipcRenderer.invoke("shell:show-item", p),
  openPath: (p) => ipcRenderer.invoke("shell:open-path", p),
  openExternal: (url) => ipcRenderer.invoke("shell:open-external", url),
  getAppInfo: () => ipcRenderer.invoke("app:info"),
  rolloutActivity: (file) => ipcRenderer.invoke("rollout:activity", { file }),
  captureWebview: (webContentsId) => ipcRenderer.invoke("webview:capture", { webContentsId }),
  saveTempFile: (dataUrl, prefix, ext) => ipcRenderer.invoke("save-temp-file", { dataUrl, prefix, ext }),

  onThemeUpdated: subscribe("theme:updated"),
  onHotkeyShown: subscribe("hotkey:shown"),
  hideHotkey: () => ipcRenderer.invoke("hotkey:hide"),
  toggleHotkey: () => ipcRenderer.invoke("hotkey:toggle"),
  toggleHotkeyPin: () => ipcRenderer.invoke("hotkey:toggle-pin"),
  showMainWindow: () => ipcRenderer.invoke("app:show-main"),
  toggleQuickChat: () => ipcRenderer.invoke("quickchat:toggle"),
  togglePreventSleep: (on) => ipcRenderer.invoke("power:prevent-sleep", on),

  // Shared codex global state (sidebar projects / pins)
  gsRead: () => ipcRenderer.invoke("gs:read"),
  gsPatch: (patch) => ipcRenderer.invoke("gs:patch", patch),
  onGsChanged: subscribe("gs:changed"),

  // ChatGPT profile (display name + avatar data url)
  profileRead: (refresh) => ipcRenderer.invoke("profile:read", { refresh }),

  // Open a thread in a new window (Chat actions → Open in new window)
  openThreadWindow: (threadId) => ipcRenderer.invoke("window:open-thread", { threadId }),

  // Fetch a remote image via the main process (CSP/Cloudflare-safe) → data URL
  iconFetch: (url) => ipcRenderer.invoke("icon:fetch", { url }),

  // Sign out (backs up auth.json then restarts into the connect screen)
  logout: () => ipcRenderer.invoke("account:logout"),
});
