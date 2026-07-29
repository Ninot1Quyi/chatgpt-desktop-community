const EDIT_ROLES = new Set([
  "undo",
  "redo",
  "cut",
  "copy",
  "paste",
  "pasteAndMatchStyle",
  "selectAll",
]);

function registerSharedDesktopShellHandlers({ BrowserWindow, ipcMain }) {
  ipcMain.handle("edit:role", (event, role) => {
    if (!EDIT_ROLES.has(role)) return false;
    event.sender[role]();
    return true;
  });
  ipcMain.handle("view:zoom", (event, direction) => {
    const webContents = event.sender;
    if (direction === "reset") {
      webContents.setZoomFactor(1);
    } else {
      const delta = direction === "in" ? 0.1 : -0.1;
      webContents.setZoomFactor(
        Math.min(3, Math.max(0.5, webContents.getZoomFactor() + delta)),
      );
    }
    return true;
  });
  ipcMain.handle("view:reload", (event) => {
    event.sender.reload();
    return true;
  });
  ipcMain.handle("view:toggle-devtools", (event) => {
    event.sender.toggleDevTools();
    return true;
  });
  ipcMain.handle("window:close", (event) => {
    BrowserWindow.fromWebContents(event.sender)?.close();
    return true;
  });
}

module.exports = { registerSharedDesktopShellHandlers };
