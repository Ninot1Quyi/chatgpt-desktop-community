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
export const reportDiagnostic = (event, context = {}, level = "info") =>
  b.diagnosticsReport({ event, context, level });
export const getDiagnosticsInfo = () => b.diagnosticsInfo();
export const openDiagnosticsLogs = () => b.diagnosticsOpenLogs();
export const claudeHistoryList = () => b.claudeHistoryList();
export const claudeHistoryRead = (sessionId) => b.claudeHistoryRead(sessionId);
export const kimiHistoryList = () => b.kimiHistoryList();
export const kimiHistoryRead = (sessionId) => b.kimiHistoryRead(sessionId);
export const agentRuntimeCatalog = () => b.agentRuntimeCatalog();
export const agentRuntimeSend = (request) => b.agentRuntimeSend(request);
export const onAgentRuntimeEvent = (cb) => b.onAgentRuntimeEvent(cb);
export const agentRuntimeCancel = (runId) => b.agentRuntimeCancel(runId);
export const agentRuntimePermissionResponse = (permissionId, optionId) =>
  b.agentRuntimePermissionResponse(permissionId, optionId);
export const agentRuntimeAuthStatus = () => b.agentRuntimeAuthStatus();
export const agentRuntimeAccount = (runtime, refresh = false) => b.agentRuntimeAccount(runtime, refresh);
export const agentRuntimeLogin = (runtime) => b.agentRuntimeLogin(runtime);
export const rolloutActivity = (file) => b.rolloutActivity(file);
export const captureWebview = (id) => b.captureWebview(id);
export const saveTempFile = (dataUrl, prefix, ext) => b.saveTempFile(dataUrl, prefix, ext);
// Absolute path of a File from <input type=file> / drag-drop / paste
// (File.path was removed in Electron 32; webUtils is the replacement).
export const getFilePath = (file) => b.getFilePath(file);
export const gsRead = () => b.gsRead();
export const gsPatch = (patch) => b.gsPatch(patch);
export const onGsChanged = (cb) => b.onGsChanged(cb);
export const prefsRead = () => b.prefsRead();
export const prefsWrite = (key, value) => b.prefsWrite(key, value);
export const profileRead = (refresh) => b.profileRead(refresh);
export const openThreadWindow = (threadId) => b.openThreadWindow(threadId);
export const iconFetch = (url) => b.iconFetch(url);
export const onUpdateStatus = (cb) => b.onUpdateStatus(cb);
export const getUpdateStatus = () => b.getUpdateStatus();
export const checkForUpdates = () => b.checkForUpdates();
export const installUpdate = () => b.installUpdate();

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

// Custom Windows caption buttons
export const windowMinimize = () => b.windowMinimize();
export const windowToggleMaximize = () => b.windowToggleMaximize();
export const windowIsMaximized = () => b.windowIsMaximized();
export const onMaximizeChanged = (cb) => b.onMaximizeChanged(cb);
