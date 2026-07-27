// Thin wrapper over the preload bridge (window.codexBridge).
const b = window.codexBridge;

export const rpc = (method, params) => b.request(method, params);
export const respond = (id, result, error) => b.respond(id, result, error);
export const onNotification = (cb) => b.onNotification(cb);
export const onServerRequest = (cb) => b.onServerRequest(cb);
export const onStatus = (cb) => b.onStatus(cb);
export const getStatus = () => b.getStatus();
export const onThemeUpdated = (cb) => b.onThemeUpdated(cb);
export const onHotkeyShown = (cb) => b.onHotkeyShown(cb);
export const hideHotkey = () => b.hideHotkey();
export const toggleHotkeyPin = () => b.toggleHotkeyPin();
export const showMainWindow = () => b.showMainWindow();
export const toggleQuickChat = () => b.toggleQuickChat();
export const togglePreventSleep = (on) => b.togglePreventSleep(on);
export const restartAppServer = () => b.restartAppServer();
export const pickDirectory = (defaultPath) => b.pickDirectory(defaultPath);
export const showItemInFolder = (p) => b.showItemInFolder(p);
export const openPath = (p) => b.openPath(p);
export const openExternal = (url) => b.openExternal(url);
export const getAppInfo = () => b.getAppInfo();
export const rolloutActivity = (file) => b.rolloutActivity(file);
export const captureWebview = (id) => b.captureWebview(id);
export const saveTempFile = (dataUrl, prefix, ext) => b.saveTempFile(dataUrl, prefix, ext);
export const gsRead = () => b.gsRead();
export const gsPatch = (patch) => b.gsPatch(patch);
export const onGsChanged = (cb) => b.onGsChanged(cb);
export const profileRead = (refresh) => b.profileRead(refresh);
export const openThreadWindow = (threadId) => b.openThreadWindow(threadId);
export const iconFetch = (url) => b.iconFetch(url);

// Local file URL for the codex-file:// protocol.
export const localFileUrl = (absPath) =>
  `codex-file://local/${encodeURIComponent(absPath)}`;
export const logout = () => b.logout();

// Windows in-window menu bar actions
export const editRole = (role) => b.editRole(role);
export const viewZoom = (direction) => b.viewZoom(direction);
export const viewReload = () => b.viewReload();
export const viewToggleDevtools = () => b.viewToggleDevtools();
export const windowClose = () => b.windowClose();
