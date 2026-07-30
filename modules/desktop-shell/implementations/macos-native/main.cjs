const path = require("node:path");
const {
  registerSharedDesktopShellHandlers,
} = require("../../shared/main-handlers.cjs");
const {
  registerMacWindowDragHandlers,
} = require("./window-drag.cjs");

const PRODUCT_NAME = "ChatGPT Desktop Community";

function configureApplicationStorage({ app, isDev, fs }) {
  const appData = app.getPath("appData");
  const profile = isDev ? `${PRODUCT_NAME} Dev` : PRODUCT_NAME;
  const userData = path.join(appData, profile);
  const sessionData = path.join(userData, "Session Data");
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

function mainWindowOptions({ preloadPath }) {
  return {
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    transparent: true,
    backgroundColor: "#00000000",
    vibrancy: "menu",
    webPreferences: { preload: preloadPath },
  };
}

function quickChatWindowOptions({ preloadPath }) {
  return {
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 16, y: 16 },
    vibrancy: "menu",
    webPreferences: { preload: preloadPath },
  };
}

function hotkeyWindowOptions({ preloadPath }) {
  return { webPreferences: { preload: preloadPath } };
}

function setHotkeyAlwaysOnTop(window, enabled) {
  window.setAlwaysOnTop(enabled, "floating");
}

function installMainWindowBehavior() {}

function normalizeProtocolPath(filePath) {
  return filePath;
}

function registerGlobalShortcuts(globalShortcut, actions) {
  globalShortcut.register("CommandOrControl+Shift+Space", actions.toggleHotkeyWindow);
  globalShortcut.register("CommandOrControl+Alt+N", actions.toggleQuickChatWindow);
}

function registerDesktopShellHandlers({ BrowserWindow, ipcMain }) {
  registerSharedDesktopShellHandlers({ BrowserWindow, ipcMain });
  registerMacWindowDragHandlers({ BrowserWindow, ipcMain });
}

function installApplicationLifecycle({ app, iconPath, isDev, createMainWindow }) {
  if (isDev) app.dock.setIcon(iconPath);
  app.on("activate", () => createMainWindow());
}

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
