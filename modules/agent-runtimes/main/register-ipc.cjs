const crypto = require("node:crypto");

const {
  createKimiWebProfileService,
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
const {
  getPluginInstallTargets,
  installPluginForRuntime,
} = require("./plugin-targets.cjs");

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
  BrowserWindow,
  host,
  ipcMain,
  session,
}) {
  const kimiWebProfile = createKimiWebProfileService({
    BrowserWindow,
    session,
    log: (level, event) => {
      const method = level === "error" ? "error" : level === "warn" ? "warn" : "log";
      console[method](`[kimi-profile] ${event}`);
    },
  });
  app.once("before-quit", () => kimiWebProfile.dispose());

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
        profileProvider: kimiWebProfile,
      });
    }));
  ipcMain.handle("agent-runtime:profile-login", (event, { runtime } = {}) =>
    resultOrError(() => {
      if (runtime !== "kimi") {
        throw new Error(`Profile sign-in is not available for "${runtime || "unknown"}"`);
      }
      const parent = BrowserWindow.fromWebContents(event.sender);
      return kimiWebProfile.login({ parent });
    }));
  ipcMain.handle("agent-runtime:profile-logout", (_event, { runtime } = {}) =>
    resultOrError(() => {
      if (runtime !== "kimi") {
        throw new Error(`Profile sign-out is not available for "${runtime || "unknown"}"`);
      }
      return kimiWebProfile.logout();
    }));
  ipcMain.handle("agent-runtime:login", (_event, { runtime } = {}) =>
    resultOrError(() => startExternalLogin(String(runtime || ""), {
      homePath: app.getPath("home"),
      host,
    })));
  ipcMain.handle("agent-runtime:plugin-targets", (_event, { plugin } = {}) =>
    resultOrError(() => getPluginInstallTargets({
      homePath: app.getPath("home"),
      host,
      plugin,
    })));
  ipcMain.handle(
    "agent-runtime:plugin-install",
    (_event, { plugin, runtime } = {}) =>
      resultOrError(() => installPluginForRuntime({
        homePath: app.getPath("home"),
        host,
        plugin,
        runtime: String(runtime || ""),
        userDataPath: app.getPath("userData"),
      })),
  );

  const externalRuns = new Map();
  const externalPermissions = new Map();
  const settlePermission = (permissionId, result) => {
    const pending = externalPermissions.get(permissionId);
    if (!pending) return false;
    externalPermissions.delete(permissionId);
    pending.sender.removeListener?.("destroyed", pending.onDestroyed);
    pending.resolve(result);
    return true;
  };
  const cancelPermissionsForRun = (runId) => {
    for (const [permissionId, pending] of externalPermissions) {
      if (pending.runId !== runId) continue;
      settlePermission(permissionId, { outcome: { outcome: "cancelled" } });
    }
  };
  ipcMain.handle("agent-runtime:send", (event, request = {}) =>
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
          onSpawn: (child, controller) => {
            externalRuns.set(runId, { child, controller });
          },
          onUpdate: (payload) => {
            if (event.sender.isDestroyed?.()) return;
            event.sender.send("agent-runtime:event", {
              runId,
              runtime: request.runtime,
              ...payload,
            });
          },
          onPermissionRequest: (params) => new Promise((resolve) => {
            if (event.sender.isDestroyed?.()) {
              resolve({ outcome: { outcome: "cancelled" } });
              return;
            }
            const permissionId = crypto.randomUUID();
            const onDestroyed = () => {
              settlePermission(permissionId, { outcome: { outcome: "cancelled" } });
            };
            externalPermissions.set(permissionId, {
              runId,
              sender: event.sender,
              senderId: event.sender.id,
              options: Array.isArray(params.options) ? params.options : [],
              onDestroyed,
              resolve,
            });
            event.sender.once?.("destroyed", onDestroyed);
            try {
              event.sender.send("agent-runtime:event", {
                runId,
                runtime: request.runtime,
                permissionRequest: {
                  id: permissionId,
                  options: Array.isArray(params.options) ? params.options : [],
                  toolCall: params.toolCall || null,
                },
              });
            } catch {
              settlePermission(permissionId, { outcome: { outcome: "cancelled" } });
            }
          }),
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
        cancelPermissionsForRun(runId);
        externalRuns.delete(runId);
      }
    }));
  ipcMain.handle("agent-runtime:permission-response", (event, {
    permissionId,
    optionId,
  } = {}) => {
    const id = String(permissionId || "");
    const pending = externalPermissions.get(id);
    if (!pending || pending.senderId !== event.sender.id) return false;
    const selected = pending.options.find((option) => option.optionId === optionId);
    settlePermission(id, selected
      ? { outcome: { outcome: "selected", optionId: selected.optionId } }
      : { outcome: { outcome: "cancelled" } });
    return true;
  });
  ipcMain.handle("agent-runtime:cancel", async (_event, { runId } = {}) => {
    const id = String(runId || "");
    const active = externalRuns.get(id);
    if (!active) return false;
    cancelPermissionsForRun(id);
    if (typeof active.controller?.cancel === "function") {
      await active.controller.cancel();
      return true;
    }
    active.child.kill();
    return true;
  });
}

module.exports = { registerAgentRuntimeHandlers };
