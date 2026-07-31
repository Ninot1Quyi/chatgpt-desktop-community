function pointerPosition(payload) {
  const screenX = Number(payload?.screenX);
  const screenY = Number(payload?.screenY);
  if (!Number.isFinite(screenX) || !Number.isFinite(screenY)) return null;
  return { screenX, screenY };
}

function registerMacWindowDragHandlers({ BrowserWindow, ipcMain }) {
  const sessions = new WeakMap();

  ipcMain.on("window:drag-begin", (event, payload) => {
    const pointer = pointerPosition(payload);
    const window = BrowserWindow.fromWebContents(event.sender);
    if (!pointer || !window || window.isDestroyed() || !window.isMovable()) return;
    const [windowX, windowY] = window.getPosition();
    sessions.set(event.sender, {
      ...pointer,
      window,
      windowX,
      windowY,
    });
  });

  ipcMain.on("window:drag-move", (event, payload) => {
    const pointer = pointerPosition(payload);
    const session = sessions.get(event.sender);
    if (!pointer || !session || session.window.isDestroyed()) return;
    session.window.setPosition(
      Math.round(session.windowX + pointer.screenX - session.screenX),
      Math.round(session.windowY + pointer.screenY - session.screenY),
      false,
    );
  });

  ipcMain.on("window:drag-end", (event) => {
    sessions.delete(event.sender);
  });
}

module.exports = { registerMacWindowDragHandlers };
