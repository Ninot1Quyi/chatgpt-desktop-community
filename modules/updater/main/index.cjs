// Auto-update via electron-updater against GitHub Releases. Packaged builds
// only — dev runs get a no-op stub so the settings UI stays quiet. Status is
// pushed to all renderer windows as "update:status" broadcasts; the last
// status is cached so late-opening windows can query it.
const { app, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

function resolveUpdaterMode({
  isPackaged,
  resourcesPath,
  existsSync = fs.existsSync,
}) {
  if (!isPackaged) return "dev";
  const updateConfig = path.join(resourcesPath, "app-update.yml");
  return existsSync(updateConfig) ? "enabled" : "disabled";
}

function initUpdater({ broadcast }) {
  const mode = resolveUpdaterMode({
    isPackaged: app.isPackaged,
    resourcesPath: process.resourcesPath,
  });
  const enabled = mode === "enabled";
  let last = { status: enabled ? "idle" : mode };
  const send = (payload) => {
    last = { ...last, ...payload };
    broadcast("update:status", last);
  };

  ipcMain.handle("update:status-get", () => last);

  if (!enabled) {
    ipcMain.handle("update:check", () => true);
    ipcMain.handle("update:install", () => false);
    return;
  }

  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false; // explicit "restart to update" button instead
  autoUpdater.on("checking-for-update", () => send({ status: "checking", message: null }));
  autoUpdater.on("update-available", (info) => send({ status: "available", version: info.version }));
  autoUpdater.on("update-not-available", () => send({ status: "none" }));
  autoUpdater.on("download-progress", (p) => send({ status: "downloading", percent: Math.round(p.percent || 0) }));
  autoUpdater.on("update-downloaded", (info) => send({ status: "downloaded", version: info.version }));
  autoUpdater.on("error", (err) => send({ status: "error", message: String((err && err.message) || err) }));

  ipcMain.handle("update:check", async () => {
    try {
      await autoUpdater.checkForUpdates();
      return true;
    } catch (err) {
      return String((err && err.message) || err);
    }
  });
  ipcMain.handle("update:install", () => {
    autoUpdater.quitAndInstall();
    return true;
  });

  // Silent check shortly after launch, then periodically.
  setTimeout(() => autoUpdater.checkForUpdates().catch(() => {}), 5000);
  setInterval(() => autoUpdater.checkForUpdates().catch(() => {}), 6 * 60 * 60 * 1000);
}

module.exports = { initUpdater, resolveUpdaterMode };
