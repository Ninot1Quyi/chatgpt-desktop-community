const path = require("node:path");
const {
  registerSharedDesktopShellHandlers,
} = require("../../shared/main-handlers.cjs");

const PRODUCT_NAME = "ChatGPT Desktop Community";

function configureApplicationStorage({ app, env, isDev, fs }) {
  const appData = app.getPath("appData");
  const profile = isDev ? `${PRODUCT_NAME} Dev` : PRODUCT_NAME;
  const userData = path.join(appData, profile);
  const localAppData = env.LOCALAPPDATA || appData;
  const sessionData = path.join(localAppData, profile, "Session Data");
  fs.mkdirSync(userData, { recursive: true });
  fs.mkdirSync(sessionData, { recursive: true });
  app.setName(PRODUCT_NAME);
  app.setPath("userData", userData);
  app.setPath("sessionData", sessionData);
  return {
    legacyPreferencePaths: [
      path.join(appData, "Noma", "renderer-prefs.json"),
      path.join(appData, "codex-desktop-rebuilt", "renderer-prefs.json"),
    ],
  };
}

function mainWindowOptions({ dark, iconPath, preloadPath }) {
  return {
    titleBarStyle: "hidden",
    autoHideMenuBar: true,
    icon: iconPath,
    backgroundColor: dark ? "#1a1c22" : "#edf1f7",
    webPreferences: { preload: preloadPath },
  };
}

function quickChatWindowOptions({ iconPath, preloadPath }) {
  return {
    frame: false,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: { preload: preloadPath },
  };
}

function hotkeyWindowOptions({ preloadPath }) {
  return { webPreferences: { preload: preloadPath } };
}

function setHotkeyAlwaysOnTop(window, enabled) {
  window.setAlwaysOnTop(enabled);
}

function installMainWindowBehavior(window) {
  window.on("maximize", () => window.webContents.send("window:maximize-changed", true));
  window.on("unmaximize", () => window.webContents.send("window:maximize-changed", false));
}

function normalizeProtocolPath(filePath) {
  return /^\/[A-Za-z]:[/\\]/.test(filePath) ? filePath.slice(1) : filePath;
}

function registerGlobalShortcuts(globalShortcut, actions) {
  globalShortcut.register("Control+Shift+Space", actions.toggleHotkeyWindow);
  globalShortcut.register("Control+Alt+N", actions.toggleQuickChatWindow);
}

function registerDesktopShellHandlers({ BrowserWindow, ipcMain }) {
  registerSharedDesktopShellHandlers({ BrowserWindow, ipcMain });
  ipcMain.handle("window:minimize", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.minimize();
    return true;
  });
  ipcMain.handle("window:toggle-maximize", (event) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!window) return false;
    window.isMaximized() ? window.unmaximize() : window.maximize();
    return true;
  });
  ipcMain.handle(
    "window:is-maximized",
    (event) => !!BrowserWindow.fromWebContents(event.sender)?.isMaximized(),
  );
}

function installApplicationLifecycle() {}

module.exports = {
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
};
