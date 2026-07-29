const {
  getClaudeConfigDir,
  getExternalAuthStatus,
  getKimiAccount,
  getKimiConfigDir,
  getRuntimeCatalog,
  listClaudeSessions,
  listKimiSessions,
  readClaudeSession,
  readKimiSession,
  runExternalAgent,
  startExternalLogin,
} = require("./index.cjs");

function resultOrError(operation) {
  return Promise.resolve()
    .then(operation)
    .then((result) => ({ ok: true, result }))
    .catch((error) => ({
      ok: false,
      error: String(error?.message || error),
    }));
}

function registerAgentRuntimeHandlers({
  app,
  host,
  ipcMain,
}) {
  ipcMain.handle("claude-history:list", () => resultOrError(async () => {
    const configDir = getClaudeConfigDir(app.getPath("home"));
    return listClaudeSessions({ configDir });
  }));
  ipcMain.handle("claude-history:read", (_event, { sessionId } = {}) =>
    resultOrError(async () => {
      const configDir = getClaudeConfigDir(app.getPath("home"));
      return readClaudeSession({ configDir, sessionId });
    }));
  ipcMain.handle("kimi-history:list", () => resultOrError(async () => {
    const configDir = getKimiConfigDir(app.getPath("home"));
    return listKimiSessions({ configDir });
  }));
  ipcMain.handle("kimi-history:read", (_event, { sessionId } = {}) =>
    resultOrError(async () => {
      const configDir = getKimiConfigDir(app.getPath("home"));
      return readKimiSession({ configDir, sessionId });
    }));
  ipcMain.handle("agent-runtime:catalog", () => resultOrError(() =>
    getRuntimeCatalog({
      homePath: app.getPath("home"),
      host,
    })));
  ipcMain.handle("agent-runtime:auth-status", () => resultOrError(() =>
    getExternalAuthStatus({
      homePath: app.getPath("home"),
      host,
    })));
  ipcMain.handle("agent-runtime:account", (_event, { runtime, refresh } = {}) =>
    resultOrError(() => {
      if (runtime !== "kimi") throw new Error(`Account details are not available for "${runtime || "unknown"}"`);
      return getKimiAccount({
        homePath: app.getPath("home"),
        forceRefresh: refresh === true,
        host,
      });
    }));
  ipcMain.handle("agent-runtime:login", (_event, { runtime } = {}) =>
    resultOrError(() => startExternalLogin(String(runtime || ""), {
      homePath: app.getPath("home"),
      host,
    })));

  const externalRuns = new Map();
  ipcMain.handle("agent-runtime:send", (_event, request = {}) =>
    resultOrError(async () => {
      const runId = String(request.runId || "");
      try {
        if (!/^[0-9a-f-]{36}$/i.test(runId)) {
          throw new Error("Invalid runtime request ID");
        }
        if (
          typeof request.prompt !== "string" ||
          request.prompt.length > 1024 * 1024
        ) {
          throw new Error("Invalid runtime prompt");
        }
        const homePath = app.getPath("home");
        const result = await runExternalAgent(request, {
          homePath,
          host,
          kimiConfigDir: getKimiConfigDir(homePath),
          onSpawn: (child) => externalRuns.set(runId, child),
        });
        return result.runtime === "claude"
          ? readClaudeSession({
            configDir: getClaudeConfigDir(homePath),
            sessionId: result.sessionId,
          })
          : readKimiSession({
            configDir: getKimiConfigDir(homePath),
            sessionId: result.sessionId,
          });
      } finally {
        externalRuns.delete(runId);
      }
    }));
  ipcMain.handle("agent-runtime:cancel", (_event, { runId } = {}) => {
    const id = String(runId || "");
    const child = externalRuns.get(id);
    if (!child) return false;
    child.kill();
    externalRuns.delete(id);
    return true;
  });
}

module.exports = { registerAgentRuntimeHandlers };
