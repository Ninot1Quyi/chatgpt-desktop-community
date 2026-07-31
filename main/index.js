// Electron main process: window management + codex app-server stdio bridge.
// Clean-room reimplementation. The app-server (codex CLI) owns all auth —
// it reads %USERPROFILE%\.codex\auth.json itself; we never touch credentials here.
const {
  app,
  BrowserWindow,
  ipcMain,
  protocol,
  net,
  dialog,
  session,
  shell,
  nativeTheme,
} = require("electron");
const { spawn, execFile } = require("node:child_process");
const path = require("node:path");
const fs = require("node:fs");
const crypto = require("node:crypto");
const os = require("node:os");
const { pathToFileURL } = require("node:url");
const { resolveCodexBinary } = require("@modules/runtime-locator");
const agentRuntimeHost = require("@modules/agent-runtime-host");
const {
  configureApplicationStorage,
  hotkeyWindowOptions,
  installApplicationLifecycle,
  installMainWindowBehavior,
  mainWindowOptions,
  normalizeProtocolPath,
  quickChatWindowOptions,
  registerDesktopShellHandlers,
  registerGlobalShortcuts,
  setHotkeyAlwaysOnTop,
} = require("@modules/desktop-shell");
const {
  createBundledPluginMarketplaceRegistrar,
  ensureBundledPluginMarketplace,
  registerAgentRuntimeHandlers,
} = require("@modules/agent-runtimes");
const { readRolloutActivity } = require("./rollout-activity");
const { initUpdater } = require("@modules/updater");
const { registerPreferenceHandlers } = require("@modules/preferences");
const {
  registerGlobalStateHandlers,
} = require("@modules/projects-navigation");
const { createDiagnostics } = require("@modules/diagnostics");

const isDev = !!process.env.ELECTRON_RENDERER_URL;
const communityIconPath = path.join(__dirname, "..", "assets", "community-icon.png");
const preloadPath = path.join(__dirname, "preload.cjs");
const { legacyPreferencePaths } = configureApplicationStorage({
  app,
  env: process.env,
  fs,
  isDev,
});
const diagnostics = createDiagnostics({ app, ipcMain, shell });
diagnostics.captureConsole();
diagnostics.log("info", "main", "app_start", {
  appVersion: app.getVersion(),
  buildTarget: __BUILD_TARGET__,
  isDev,
  isPackaged: app.isPackaged,
  versions: {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
  },
  userDataPath: app.getPath("userData"),
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

// When the app is launched detached (or its parent terminal closes), stdout/stderr
// point at a broken pipe and console.* throws EPIPE synchronously on Windows,
// crashing the main process with an "Uncaught Exception" dialog. Swallow it.
for (const method of ["log", "info", "warn", "error"]) {
  const orig = console[method].bind(console);
  console[method] = (...args) => {
    try {
      orig(...args);
    } catch (err) {
      if (!err || err.code !== "EPIPE") throw err;
    }
  };
}
for (const stream of [process.stdout, process.stderr]) {
  stream.on("error", (err) => {
    if (!err || err.code !== "EPIPE") throw err;
  });
}

// ---------------------------------------------------------------------------
// Local file protocol (codex-file://local/<encodeURIComponent(abspath)>)
// Serves image/video attachments from disk to the renderer.
// ---------------------------------------------------------------------------
const LOCAL_FILE_EXTS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico", ".avif",
  ".mp4", ".webm", ".mov", ".m4v", ".mp3", ".wav", ".ogg", ".pdf",
  ".html", ".htm", ".js", ".css", ".json", ".txt", ".md", ".wasm",
]);

protocol.registerSchemesAsPrivileged([
  { scheme: "codex-file", privileges: { secure: true, supportFetchAPI: true, stream: true } },
]);

// ---------------------------------------------------------------------------
// AppServerBridge — spawns `codex app-server`, speaks newline-delimited JSON.
// ---------------------------------------------------------------------------
class AppServerBridge {
  constructor() {
    this.proc = null;
    this.status = "stopped"; // stopped | starting | ready | crashed
    this.pending = new Map(); // id -> {resolve, reject, method}
    this.serverRequests = new Map(); // id -> method (requests initiated by server)
    this.lineBuf = "";
    this.listeners = new Set(); // webContents to broadcast to
    this.codexHome = null;
    this.userAgent = null;
    this.binary = null;
    this.binaryCandidates = [];
    this.lastError = null;
  }

  resolveBinary() {
    const resolution = resolveCodexBinary({
      homePath: app.getPath("home"),
    });
    this.binaryCandidates = resolution.candidates;
    return resolution.binary;
  }

  start() {
    if (this.proc) return;
    this.status = "starting";
    this.lastError = null;
    this.broadcastStatus();
    const bin = this.resolveBinary();
    this.binary = bin;
    const args = [
      "-c",
      "features.code_mode_host=true",
      "-c",
      "features.realtime_conversation=true",
      "-c",
      "features.respect_system_proxy=true",
      "app-server",
      "--analytics-default-enabled",
    ];
    console.log(`[bridge] spawning ${bin} ${args.join(" ")}`);
    this.proc = spawn(bin, args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, LOG_FORMAT: "json", RUST_LOG: process.env.RUST_LOG || "warn" },
    });
    this.proc.stdout.on("data", (d) => this.onStdout(d));
    this.proc.stderr.on("data", (d) => {
      const line = d.toString("utf8").trim();
      if (!line) return;
      const message = `[app-server] ${line.slice(0, 500)}`;
      if (/"level"\s*:\s*"ERROR"/i.test(line)) console.error(message);
      else if (/"level"\s*:\s*"WARN"/i.test(line)) console.warn(message);
      else console.log(message);
    });
    this.proc.on("error", (err) => {
      console.error("[bridge] spawn error:", err.message);
      this.status = "crashed";
      this.lastError = err.message;
      this.proc = null;
      this.failAll(new Error(`Failed to spawn codex app-server: ${err.message}`));
      this.broadcastStatus();
    });
    this.proc.on("exit", (code, signal) => {
      console.log(`[bridge] app-server exited code=${code} signal=${signal}`);
      const wasReady = this.status === "ready";
      this.proc = null;
      this.status = "crashed";
      this.lastError = `app-server exited (code ${code})`;
      this.failAll(new Error(`app-server exited (code ${code})`));
      this.broadcastStatus();
      if (wasReady) this.restartSoon();
    });
    this.handshake();
  }

  restartSoon() {
    setTimeout(() => {
      if (!this.proc && this.status === "crashed") this.start();
    }, 800);
  }

  handshake() {
    const id = "__codex_initialize__";
    this.sendRaw({
      id,
      method: "initialize",
      params: {
        clientInfo: {
          name: "chatgpt_desktop_community",
          title: "ChatGPT Desktop Community",
          version: app.getVersion(),
        },
        capabilities: { experimentalApi: true },
      },
    });
    const timer = setTimeout(() => {
      if (this.status === "starting") {
        console.error("[bridge] initialize handshake timed out");
        this.killProcess();
      }
    }, 90000);
    this.pending.set(id, {
      method: "initialize",
      resolve: (result) => {
        clearTimeout(timer);
        this.codexHome = result?.codexHome || null;
        this.userAgent = result?.userAgent || null;
        this.status = "ready";
        this.lastError = null;
        console.log(`[bridge] ready. codexHome=${this.codexHome}`);
        this.broadcastStatus();
      },
      reject: (err) => {
        clearTimeout(timer);
        console.error("[bridge] initialize failed:", err.message);
        this.status = "crashed";
        this.lastError = err.message;
        this.broadcastStatus();
      },
    });
  }

  killProcess() {
    if (this.proc) {
      try { this.proc.kill("SIGTERM"); } catch {}
    }
  }

  failAll(err) {
    for (const [, p] of this.pending) p.reject(err);
    this.pending.clear();
  }

  sendRaw(obj) {
    if (!this.proc || !this.proc.stdin.writable) return false;
    this.proc.stdin.write(JSON.stringify(obj) + "\n");
    return true;
  }

  // Renderer-originated request.
  request(method, params) {
    if (this.status !== "ready") return Promise.reject(new Error("app-server not ready"));
    const id = `${method}:${crypto.randomUUID()}`;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject, method });
      if (!this.sendRaw(requestPayload(id, method, params, arguments.length >= 2))) {
        this.pending.delete(id);
        reject(new Error("app-server stdin not writable"));
      }
    });
  }

  // Renderer answering a server-initiated request (approvals etc).
  respond(id, result, error) {
    if (error) this.sendRaw({ id, error: { code: -32000, message: String(error) } });
    else this.sendRaw(responsePayload(id, result, arguments.length >= 2));
  }

  onStdout(chunk) {
    this.lineBuf += chunk.toString("utf8");
    let idx;
    while ((idx = this.lineBuf.indexOf("\n")) >= 0) {
      const line = this.lineBuf.slice(0, idx);
      this.lineBuf = this.lineBuf.slice(idx + 1);
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      this.dispatch(msg);
    }
  }

  dispatch(msg) {
    const hasId = msg.id !== undefined && msg.id !== null;
    if (hasId && (msg.result !== undefined || msg.error !== undefined)) {
      // Response to one of our requests (or a server request we answered —
      // those never come back to us, so this is always a pending client request).
      const p = this.pending.get(msg.id);
      if (p) {
        this.pending.delete(msg.id);
        msg.error ? p.reject(new Error(msg.error.message || JSON.stringify(msg.error))) : p.resolve(msg.result);
      }
      return;
    }
    if (hasId && msg.method) {
      // Server-initiated request → forward to renderer(s); first answer wins.
      this.serverRequests.set(msg.id, msg.method);
      this.broadcast("rpc:server-request", notificationPayload({ id: msg.id, method: msg.method }, msg));
      return;
    }
    if (msg.method) {
      if (msg.method === "account/rateLimits/updated" || msg.method === "account/updated") {
        invalidateCodexRateLimits();
      }
      this.broadcast("rpc:notification", notificationPayload({ method: msg.method }, msg));
    }
  }

  broadcast(channel, payload) {
    for (const wc of this.listeners) {
      if (!wc.isDestroyed()) wc.send(channel, payload);
    }
  }

  broadcastStatus() {
    this.broadcast("appserver:status", {
      status: this.status,
      codexHome: this.codexHome,
      userAgent: this.userAgent,
      binary: this.proc ? this.proc.spawnfile : this.binary || this.resolveBinary(),
      binaryCandidates: this.binaryCandidates,
      error: this.lastError,
    });
  }

  addListener(wc) {
    this.listeners.add(wc);
    wc.on("destroyed", () => this.listeners.delete(wc));
    if (!wc.isDestroyed()) {
      wc.send("appserver:status", {
        status: this.status,
        codexHome: this.codexHome,
        userAgent: this.userAgent,
        binary: this.proc ? this.proc.spawnfile : this.binary || this.resolveBinary(),
        binaryCandidates: this.binaryCandidates,
        error: this.lastError,
      });
    }
  }
}

function requestPayload(id, method, params, hasParams) {
  const payload = { id, method };
  if (hasParams) payload.params = params;
  return payload;
}

function responsePayload(id, result, hasResult) {
  const payload = { id };
  if (hasResult) payload.result = result;
  return payload;
}

function notificationPayload(base, msg) {
  if (Object.prototype.hasOwnProperty.call(msg, "params")) return { ...base, params: msg.params };
  return base;
}

const bridge = new AppServerBridge();
// The upstream read may take several seconds behind a proxy. Rate-limit and
// account notifications invalidate this cache immediately, so a longer window
// keeps Provider/Settings responsive without hiding server-pushed changes.
const CODEX_RATE_LIMITS_CACHE_MS = 5 * 60 * 1000;
let codexRateLimitsCache = null;
let codexRateLimitsCachedAt = 0;
let codexRateLimitsInFlight = null;
let codexRateLimitsGeneration = 0;

function invalidateCodexRateLimits() {
  codexRateLimitsGeneration += 1;
  codexRateLimitsCache = null;
  codexRateLimitsCachedAt = 0;
  codexRateLimitsInFlight = null;
}

function readCodexRateLimits() {
  if (codexRateLimitsCache && Date.now() - codexRateLimitsCachedAt < CODEX_RATE_LIMITS_CACHE_MS) {
    return Promise.resolve(codexRateLimitsCache);
  }
  if (codexRateLimitsInFlight) return codexRateLimitsInFlight;

  const generation = codexRateLimitsGeneration;
  const request = bridge
    .request("account/rateLimits/read", null)
    .then((result) => {
      if (generation === codexRateLimitsGeneration) {
        codexRateLimitsCache = result;
        codexRateLimitsCachedAt = Date.now();
      }
      return result;
    })
    .finally(() => {
      if (codexRateLimitsInFlight === request) codexRateLimitsInFlight = null;
    });
  codexRateLimitsInFlight = request;
  return request;
}

// ---------------------------------------------------------------------------
// Hotkey popout window (quick new thread / quick view), Ctrl+Shift+Space.
// ---------------------------------------------------------------------------
let hotkeyWindow = null;

function createHotkeyWindow() {
  const shellOptions = hotkeyWindowOptions({ preloadPath });
  hotkeyWindow = new BrowserWindow({
    width: 576,
    height: 652,
    frame: false,
    transparent: true,
    resizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    fullscreenable: false,
    show: false,
    ...shellOptions,
    webPreferences: {
      ...shellOptions.webPreferences,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  diagnostics.attachWindow(hotkeyWindow, "hotkey");
  setHotkeyAlwaysOnTop(hotkeyWindow, true);
  bridge.addListener(hotkeyWindow.webContents);
  const url = isDev
    ? `${process.env.ELECTRON_RENDERER_URL}?window=hotkey`
    : path.join(__dirname, "..", "dist-renderer", "index.html");
  if (isDev) hotkeyWindow.loadURL(url);
  else hotkeyWindow.loadFile(url, { query: { window: "hotkey" } });
  hotkeyWindow.on("blur", () => {
    // Pinned (always-on-top) window stays visible on blur, like the reference.
    if (!hotkeyWindow?.isAlwaysOnTop()) hotkeyWindow?.hide();
  });
}

function toggleHotkeyWindow() {
  if (!hotkeyWindow) return;
  if (hotkeyWindow.isVisible()) {
    hotkeyWindow.hide();
    return;
  }
  const { screen } = require("electron");
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width, height, x, y } = display.workArea;
  // Reference pops the card at the bottom-right corner of the display.
  hotkeyWindow.setPosition(Math.round(x + width - 576 - 12), Math.round(y + height - 652 - 12));
  hotkeyWindow.show();
  hotkeyWindow.focus();
  hotkeyWindow.webContents.send("hotkey:shown");
}

ipcMain.handle("hotkey:hide", () => { hotkeyWindow?.hide(); return true; });
ipcMain.handle("hotkey:toggle", () => { toggleHotkeyWindow(); return true; });
ipcMain.handle("hotkey:toggle-pin", () => {
  if (!hotkeyWindow) return false;
  const on = !hotkeyWindow.isAlwaysOnTop();
  setHotkeyAlwaysOnTop(hotkeyWindow, on);
  return on;
});
ipcMain.handle("app:show-main", () => {
  if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
  else { mainWindow.show(); mainWindow.focus(); }
  return true;
});

// ---------------------------------------------------------------------------
// Quick chat window (Ctrl+Alt+N): a compact conversation window.
// ---------------------------------------------------------------------------
let quickChatWindow = null;

function createQuickChatWindow() {
  const shellOptions = quickChatWindowOptions({
    iconPath: communityIconPath,
    preloadPath,
  });
  quickChatWindow = new BrowserWindow({
    width: 560,
    height: 700,
    minWidth: 400,
    minHeight: 400,
    ...shellOptions,
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#181818" : "#ffffff",
    show: false,
    title: "ChatGPT Desktop Community",
    webPreferences: {
      ...shellOptions.webPreferences,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  diagnostics.attachWindow(quickChatWindow, "quickchat");
  quickChatWindow.on("page-title-updated", (e) => e.preventDefault());
  bridge.addListener(quickChatWindow.webContents);
  if (isDev) quickChatWindow.loadURL(`${process.env.ELECTRON_RENDERER_URL}?window=quickchat`);
  else quickChatWindow.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"), { query: { window: "quickchat" } });
  quickChatWindow.on("close", (e) => {
    // Hide instead of closing so the chat state survives.
    if (!app.isQuitting) {
      e.preventDefault();
      quickChatWindow.hide();
    }
  });
}

function toggleQuickChatWindow() {
  if (!quickChatWindow) return;
  if (quickChatWindow.isVisible()) {
    quickChatWindow.hide();
    return;
  }
  const { screen } = require("electron");
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { width, height, x, y } = display.workArea;
  quickChatWindow.setPosition(Math.round(x + width - 560 - 40), Math.round(y + (height - 700) / 2));
  quickChatWindow.show();
  quickChatWindow.focus();
}

ipcMain.handle("quickchat:hide", () => { quickChatWindow?.hide(); return true; });
ipcMain.handle("quickchat:toggle", () => { toggleQuickChatWindow(); return true; });

// Prevent the system from sleeping while a task runs (Settings → General).
let sleepBlockerId = null;
ipcMain.handle("power:prevent-sleep", (_e, on) => {
  const { powerSaveBlocker } = require("electron");
  if (on && sleepBlockerId == null) sleepBlockerId = powerSaveBlocker.start("prevent-app-suspension");
  if (!on && sleepBlockerId != null) { powerSaveBlocker.stop(sleepBlockerId); sleepBlockerId = null; }
  return true;
});

registerDesktopShellHandlers({ BrowserWindow, ipcMain });

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------
let mainWindow = null;
// Additional thread windows (Chat actions → Open in new window). The app
// quits only when every main-style window is gone.
const threadWindows = new Set();

if (hasSingleInstanceLock) {
  app.on("second-instance", () => {
    const win = mainWindow || [...threadWindows][0];
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
  });
}

function createMainWindow(query) {
  const dark = nativeTheme.shouldUseDarkColors;
  const shellOptions = mainWindowOptions({
    dark,
    iconPath: communityIconPath,
    preloadPath,
  });
  const win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 720,
    minHeight: 600,
    ...shellOptions,
    show: false,
    webPreferences: {
      ...shellOptions.webPreferences,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: true,
      webviewTag: true,
    },
  });
  diagnostics.attachWindow(win, query?.threadId ? "thread" : "main");
  if (query?.threadId) threadWindows.add(win);
  else mainWindow = win;

  win.once("ready-to-show", () => win.show());
  installMainWindowBehavior(win);
  win.on("page-title-updated", (e) => e.preventDefault());
  win.on("closed", () => {
    if (win === mainWindow) mainWindow = null;
    threadWindows.delete(win);
    // Quit only when every main-style window has closed.
    if (!app.isQuitting && !mainWindow && threadWindows.size === 0) app.quit();
  });

  // External links → system browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("http://") || url.startsWith("https://")) {
      shell.openExternal(url);
      return { action: "deny" };
    }
    return { action: "deny" };
  });

  bridge.addListener(win.webContents);

  if (isDev) {
    const u = new URL(process.env.ELECTRON_RENDERER_URL);
    if (query?.threadId) u.searchParams.set("thread", query.threadId);
    win.loadURL(u.toString());
    if (!query?.threadId) win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadFile(path.join(__dirname, "..", "dist-renderer", "index.html"), {
      query: query?.threadId ? { thread: query.threadId } : undefined,
    });
  }
  return win;
}

ipcMain.handle("window:open-thread", (_e, { threadId }) => {
  if (!threadId) return false;
  createMainWindow({ threadId });
  return true;
});

registerPreferenceHandlers({
  fs,
  ipcMain,
  legacyPreferencePaths,
  userDataPath: app.getPath("userData"),
});

registerGlobalStateHandlers({
  broadcast: (channel, payload) => bridge.broadcast(channel, payload),
  fs,
  homePath: app.getPath("home"),
  ipcMain,
});

// ---------------------------------------------------------------------------
// IPC
// ---------------------------------------------------------------------------
// Errors are returned as values ({ ok:false }) instead of rejecting: a rejected
// ipcMain.handle makes Electron log "Error occurred in handler" on every failed
// RPC (e.g. rate-limit polls when chatgpt.com is unreachable), spamming the console.
let codexModelIds = new Set();
const registerBundledPluginMarketplace =
  createBundledPluginMarketplaceRegistrar(() =>
    ensureBundledPluginMarketplace({
      homePath: app.getPath("home"),
      host: agentRuntimeHost,
      request: (method, params) => bridge.request(method, params),
      resourcesPath: process.resourcesPath,
    }),
  );

async function recoverBundledPluginMarketplace() {
  try {
    return await registerBundledPluginMarketplace();
  } catch (error) {
    diagnostics.log("warn", "plugins", "bundled_marketplace_recovery_failed", {
      error,
    });
    return null;
  }
}

function rememberCodexModels(result) {
  if (Array.isArray(result?.data)) {
    codexModelIds = new Set(result.data.map((model) => model?.model).filter(Boolean));
  }
}

ipcMain.handle("rpc:request", async (_e, { method, params }) => {
  try {
    if (method === "plugin/list") {
      await recoverBundledPluginMarketplace();
    }
    if (method === "thread/start" || method === "turn/start") {
      if (!codexModelIds.size) {
        rememberCodexModels(await bridge.request("model/list", { limit: 100 }));
      }
      const requestedModels = [
        params?.model,
        params?.collaborationMode?.settings?.model,
      ].filter(Boolean);
      for (const model of requestedModels) {
        if (!codexModelIds.has(model)) {
          throw new Error(`Model "${model}" does not belong to the Codex runtime`);
        }
      }
    }
    const result = method === "account/rateLimits/read"
      ? await readCodexRateLimits()
      : await bridge.request(method, params);
    if (method === "account/rateLimitResetCredit/consume") invalidateCodexRateLimits();
    if (method === "model/list") rememberCodexModels(result);
    return { ok: true, result };
  } catch (err) {
    diagnostics.log("error", "app-server", "rpc_failed", {
      error: err,
      method,
    });
    return { ok: false, error: String((err && err.message) || err) };
  }
});
ipcMain.handle("rpc:respond", (_e, { id, result, error }) => {
  bridge.respond(id, result, error);
  return true;
});
ipcMain.handle("appserver:restart", () => {
  invalidateCodexRateLimits();
  bridge.killProcess();
  bridge.start();
  return true;
});
ipcMain.handle("appserver:get-status", () => ({
  status: bridge.status,
  codexHome: bridge.codexHome,
  userAgent: bridge.userAgent,
  binary: bridge.proc ? bridge.proc.spawnfile : bridge.binary || bridge.resolveBinary(),
  binaryCandidates: bridge.binaryCandidates,
  error: bridge.lastError,
}));
ipcMain.handle("dialog:pick-directory", async (e, { defaultPath } = {}) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const r = await dialog.showOpenDialog(win, {
    properties: ["openDirectory", "createDirectory"],
    defaultPath: defaultPath || app.getPath("home"),
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("shell:show-item", (_e, p) => { shell.showItemInFolder(p); return true; });
ipcMain.handle("shell:open-path", (_e, p) => shell.openPath(p));
ipcMain.handle("shell:open-external", (_e, url) => {
  if (/^https?:\/\//.test(url)) shell.openExternal(url);
  return true;
});
ipcMain.handle("app:info", () => ({
  version: app.getVersion(),
  buildTarget: __BUILD_TARGET__,
  home: app.getPath("home"),
  temp: app.getPath("temp"),
  username: process.env.USERNAME || os.userInfo().username,
  hostname: os.hostname().split(".")[0],
  theme: nativeTheme.shouldUseDarkColors ? "dark" : "light",
}));
registerAgentRuntimeHandlers({
  app,
  BrowserWindow,
  host: agentRuntimeHost,
  ipcMain,
  session,
});
ipcMain.handle("rollout:activity", (_e, { file }) => {
  try {
    return readRolloutActivity(file, path.join(app.getPath("home"), ".codex", "sessions"));
  } catch {
    return null;
  }
});

// Capture a <webview> guest page (for the browser annotate mode).
ipcMain.handle("webview:capture", async (_e, { webContentsId }) => {
  const { webContents } = require("electron");
  const wc = webContents.fromId(webContentsId);
  if (!wc) throw new Error("webContents not found");
  const img = await wc.capturePage();
  return img.toDataURL();
});

// ---------------------------------------------------------------------------
// ChatGPT profile (display name + avatar). Fetched through Electron's net
// stack (Chromium TLS fingerprint — passes Cloudflare where plain node fails).
// The access token is read from %USERPROFILE%\.codex\auth.json and never leaves main.
// ---------------------------------------------------------------------------
let profileCache = null;
let profileCacheAt = 0;

// Sign out: back up auth.json (recoverable), then relaunch into the
// connect screen — the same end state as the reference's Log out.
ipcMain.handle("account:logout", () => {
  try {
    const authPath = path.join(app.getPath("home"), ".codex", "auth.json");
    if (fs.existsSync(authPath)) {
      const stamp = new Date().toISOString().replace(/[:.]/g, "-");
      fs.renameSync(authPath, `${authPath}.bak-logout-${stamp}`);
    }
  } catch {}
  app.relaunch();
  app.exit(0);
});

ipcMain.handle("profile:read", async (_e, { refresh } = {}) => {  if (profileCache && !refresh && Date.now() - profileCacheAt < 10 * 60 * 1000) return profileCache;
  try {
    const auth = JSON.parse(fs.readFileSync(path.join(app.getPath("home"), ".codex", "auth.json"), "utf8"));
    const token = auth?.tokens?.access_token;
    if (!token) return null;
    const headers = { authorization: `Bearer ${token}`, accept: "application/json" };
    if (auth?.tokens?.account_id) headers["chatgpt-account-id"] = auth.tokens.account_id;
    const me = await net.fetch("https://chatgpt.com/backend-api/wham/profiles/me", { headers });
    if (!me.ok) return null;
    const body = await me.json();
    const p = body?.profile || {};
    let photo = null;
    if (p.profile_picture_url) {
      try {
        const img = await net.fetch(p.profile_picture_url, { headers: { accept: "image/*,*/*" } });
        if (img.ok) {
          const buf = Buffer.from(await img.arrayBuffer());
          if (buf.length < 2_000_000) {
            photo = `data:${img.headers.get("content-type") || "image/jpeg"};base64,${buf.toString("base64")}`;
          }
        }
      } catch {}
    }
    profileCache = {
      name: p.display_name || p.username || null,
      username: p.username || null,
      photo,
    };
    profileCacheAt = Date.now();
    return profileCache;
  } catch (err) {
    console.error("[profile] read failed:", err.message);
    return null;
  }
});

// ---------------------------------------------------------------------------
// Plugin icon proxy: renderer <img> can't load files.openai.com (CSP), and
// plain node fetch is Cloudflare-blocked — but Electron's net stack passes.
// Cache logo images in memory and hand them to the renderer as data URLs.
// ---------------------------------------------------------------------------
const iconCache = new Map(); // url -> Promise<dataUrl|null>

ipcMain.handle("icon:fetch", (_e, { url }) => {
  if (!url || !/^https:\/\//.test(url)) return null;
  if (!iconCache.has(url)) {
    iconCache.set(
      url,
      (async () => {
        try {
          const r = await net.fetch(url);
          if (!r.ok) return null;
          const buf = Buffer.from(await r.arrayBuffer());
          if (buf.length > 2_000_000) return null;
          return `data:${r.headers.get("content-type") || "image/png"};base64,${buf.toString("base64")}`;
        } catch {
          return null;
        }
      })()
    );
  }
  return iconCache.get(url);
});

// Persist a data URL to a temp file (attachments must be real paths).
ipcMain.handle("save-temp-file", (_e, { dataUrl, prefix = "codex-annotate", ext = ".png" }) => {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl || "");
  if (!m) throw new Error("bad data url");
  const os = require("node:os");
  const file = path.join(os.tmpdir(), `${prefix}-${Date.now()}${ext}`);
  fs.writeFileSync(file, Buffer.from(m[2], "base64"));
  return file;
});

// ---------------------------------------------------------------------------
// App lifecycle
// ---------------------------------------------------------------------------
app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  diagnostics.log("info", "main", "app_ready", {
    gpuFeatureStatus: app.getGPUFeatureStatus(),
  });
  protocol.handle("codex-file", (request) => {
    try {
      const url = new URL(request.url);
      let filePath = decodeURIComponent(url.pathname);
      filePath = normalizeProtocolPath(filePath);
      const ext = path.extname(filePath).toLowerCase();
      if (!LOCAL_FILE_EXTS.has(ext) || !path.isAbsolute(filePath)) {
        return new Response("forbidden", { status: 403 });
      }
      // net.fetch(file://) doesn't guarantee a charset; force one for text types.
      if ([".html", ".htm", ".js", ".css", ".json", ".txt", ".md"].includes(ext)) {
        const mime = { ".html": "text/html", ".htm": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json", ".txt": "text/plain", ".md": "text/plain" }[ext];
        return new Response(fs.readFileSync(filePath), { headers: { "Content-Type": `${mime}; charset=utf-8` } });
      }
      return net.fetch(pathToFileURL(filePath).toString());
    } catch {
      return new Response("bad request", { status: 400 });
    }
  });

  nativeTheme.on("updated", () => {
    bridge.broadcast("theme:updated", nativeTheme.shouldUseDarkColors ? "dark" : "light");
  });

  diagnostics.log("info", "app-server", "starting");
  bridge.start();
  initUpdater({ broadcast: (channel, payload) => bridge.broadcast(channel, payload) });
  createMainWindow();
  createHotkeyWindow();
  createQuickChatWindow();
  const { globalShortcut } = require("electron");
  registerGlobalShortcuts(globalShortcut, {
    toggleHotkeyWindow,
    toggleQuickChatWindow,
  });
  installApplicationLifecycle({
    app,
    createMainWindow: () => {
      if (!mainWindow || mainWindow.isDestroyed()) createMainWindow();
      else {
        mainWindow.show();
        mainWindow.focus();
      }
    },
    iconPath: communityIconPath,
    isDev,
  });
});

app.on("window-all-closed", () => {
  bridge.killProcess();
  app.quit();
});

app.on("before-quit", () => {
  app.isQuitting = true;
  bridge.killProcess();
});
