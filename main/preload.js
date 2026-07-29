// Preload: exposes a minimal, safe bridge to the renderer (contextIsolation on).
const { contextBridge, ipcRenderer, webUtils } = require("electron");

function subscribe(channel) {
  return (cb) => {
    const handler = (_e, payload) => cb(payload);
    ipcRenderer.on(channel, handler);
    return () => ipcRenderer.removeListener(channel, handler);
  };
}

contextBridge.exposeInMainWorld("codexBridge", {
  // JSON-RPC to app-server
  request: async (method, params) => {
    const r = await ipcRenderer.invoke("rpc:request", { method, params });
    if (r && r.ok === false) throw new Error(r.error);
    return r && r.result;
  },
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
  claudeHistoryList: async () => {
    const r = await ipcRenderer.invoke("claude-history:list");
    if (r && r.ok === false) throw new Error(r.error);
    return r?.result;
  },
  claudeHistoryRead: async (sessionId) => {
    const r = await ipcRenderer.invoke("claude-history:read", { sessionId });
    if (r && r.ok === false) throw new Error(r.error);
    return r?.result;
  },
  kimiHistoryList: async () => {
    const r = await ipcRenderer.invoke("kimi-history:list");
    if (r && r.ok === false) throw new Error(r.error);
    return r?.result;
  },
  kimiHistoryRead: async (sessionId) => {
    const r = await ipcRenderer.invoke("kimi-history:read", { sessionId });
    if (r && r.ok === false) throw new Error(r.error);
    return r?.result;
  },
  agentRuntimeCatalog: async () => {
    const r = await ipcRenderer.invoke("agent-runtime:catalog");
    if (r && r.ok === false) throw new Error(r.error);
    return r?.result;
  },
  agentRuntimeSend: async (request) => {
    const r = await ipcRenderer.invoke("agent-runtime:send", request);
    if (r && r.ok === false) throw new Error(r.error);
    return r?.result;
  },
  agentRuntimeCancel: (runId) => ipcRenderer.invoke("agent-runtime:cancel", { runId }),
  agentRuntimeAuthStatus: async () => {
    const r = await ipcRenderer.invoke("agent-runtime:auth-status");
    if (r && r.ok === false) throw new Error(r.error);
    return r?.result;
  },
  agentRuntimeLogin: async (runtime) => {
    const r = await ipcRenderer.invoke("agent-runtime:login", { runtime });
    if (r && r.ok === false) throw new Error(r.error);
    return r?.result;
  },
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

  // Renderer prefs backup (localStorage mirror, survives hard kills)
  prefsRead: () => ipcRenderer.invoke("prefs:read"),
  prefsWrite: (key, value) => ipcRenderer.invoke("prefs:write", { key, value }),

  // ChatGPT profile (display name + avatar data url)
  profileRead: (refresh) => ipcRenderer.invoke("profile:read", { refresh }),

  // Open a thread in a new window (Chat actions → Open in new window)
  openThreadWindow: (threadId) => ipcRenderer.invoke("window:open-thread", { threadId }),

  // Fetch a remote image via the main process (CSP/Cloudflare-safe) → data URL
  iconFetch: (url) => ipcRenderer.invoke("icon:fetch", { url }),

  // Auto-update (packaged builds only)
  onUpdateStatus: subscribe("update:status"),
  getUpdateStatus: () => ipcRenderer.invoke("update:status-get"),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  installUpdate: () => ipcRenderer.invoke("update:install"),

  // Absolute path of a File from <input type=file> / drag-drop / paste
  // (File.path was removed in Electron 32; webUtils is the replacement).
  getFilePath: (file) => webUtils.getPathForFile(file),

  // Sign out (backs up auth.json then restarts into the connect screen)
  logout: () => ipcRenderer.invoke("account:logout"),

  // Windows in-window menu bar actions
  editRole: (role) => ipcRenderer.invoke("edit:role", role),
  viewZoom: (direction) => ipcRenderer.invoke("view:zoom", direction),
  viewReload: () => ipcRenderer.invoke("view:reload"),
  viewToggleDevtools: () => ipcRenderer.invoke("view:toggle-devtools"),
  windowClose: () => ipcRenderer.invoke("window:close"),

  // Custom Windows caption buttons
  windowMinimize: () => ipcRenderer.invoke("window:minimize"),
  windowToggleMaximize: () => ipcRenderer.invoke("window:toggle-maximize"),
  windowIsMaximized: () => ipcRenderer.invoke("window:is-maximized"),
  windowGetBounds: () => ipcRenderer.invoke("window:get-bounds"),
  onMaximizeChanged: subscribe("window:maximize-changed"),
});
