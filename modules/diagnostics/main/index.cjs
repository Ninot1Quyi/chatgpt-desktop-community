const path = require("node:path");

const { createFileLogger } = require("./logger.cjs");

function safeUrl(value) {
  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}${url.pathname}`;
  } catch {
    return String(value || "").split(/[?#]/)[0];
  }
}

function createDiagnostics({
  app,
  ipcMain,
  shell,
}) {
  const logsDirectory = path.join(app.getPath("userData"), "logs");
  const fileLogger = createFileLogger({ logsDirectory });
  const attached = new WeakSet();

  const log = (level, source, event, details) =>
    fileLogger.write(level, source, event, details);

  function captureConsole(consoleObject = console) {
    for (const level of ["log", "info", "warn", "error"]) {
      const original = consoleObject[level].bind(consoleObject);
      consoleObject[level] = (...args) => {
        log(
          level === "log" ? "info" : level,
          "main-console",
          "console",
          { message: fileLogger.consoleMessage(args) },
        );
        original(...args);
      };
    }
  }

  function attachWindow(window, label) {
    if (!window || attached.has(window)) return;
    attached.add(window);
    const webContents = window.webContents;
    const base = () => ({
      label,
      webContentsId: webContents.id,
      url: safeUrl(webContents.getURL()),
    });
    log("info", "window", "created", base());
    window.once("ready-to-show", () => log("info", "window", "ready_to_show", base()));
    window.on("unresponsive", () => log("warn", "window", "unresponsive", base()));
    window.on("responsive", () => log("info", "window", "responsive", base()));
    webContents.on("dom-ready", () => log("info", "renderer", "dom_ready", base()));
    webContents.on("did-finish-load", () => log("info", "renderer", "did_finish_load", base()));
    webContents.on(
      "did-fail-load",
      (_event, errorCode, errorDescription, validatedUrl, isMainFrame) => {
        log("error", "renderer", "did_fail_load", {
          ...base(),
          errorCode,
          errorDescription,
          isMainFrame,
          validatedUrl: safeUrl(validatedUrl),
        });
      },
    );
    webContents.on("preload-error", (_event, preloadPath, error) => {
      log("error", "renderer", "preload_error", {
        ...base(),
        preloadPath,
        error,
      });
    });
    webContents.on("render-process-gone", (_event, details) => {
      log("error", "renderer", "render_process_gone", {
        ...base(),
        reason: details.reason,
        exitCode: details.exitCode,
      });
    });
    webContents.on("console-message", (details) => {
      const severity = details.level || "info";
      if (!["warning", "warn", "error"].includes(severity)) return;
      log(severity === "error" ? "error" : "warn", "renderer-console", "console", {
        ...base(),
        message: details.message,
        lineNumber: details.lineNumber,
        sourceId: safeUrl(details.sourceId),
      });
    });
  }

  process.on("uncaughtExceptionMonitor", (error, origin) => {
    log("error", "main-process", "uncaught_exception", { error, origin });
  });
  process.on("unhandledRejection", (reason) => {
    log("error", "main-process", "unhandled_rejection", { reason });
  });
  app.on("child-process-gone", (_event, details) => {
    log("error", "electron", "child_process_gone", {
      type: details.type,
      reason: details.reason,
      exitCode: details.exitCode,
      serviceName: details.serviceName,
      name: details.name,
    });
  });
  app.on("before-quit", () => log("info", "main", "before_quit"));

  ipcMain.on("diagnostics:renderer-log", (event, payload = {}) => {
    const level = ["debug", "info", "warn", "error"].includes(payload.level)
      ? payload.level
      : "info";
    log(level, "renderer", payload.event || "renderer_event", {
      message: payload.message,
      stack: payload.stack,
      context: payload.context,
      senderUrl: safeUrl(event.sender.getURL()),
      webContentsId: event.sender.id,
    });
  });
  ipcMain.handle("diagnostics:info", () => ({
    logFile: fileLogger.logFile,
    logsDirectory: fileLogger.logsDirectory,
    sessionId: fileLogger.sessionId,
  }));
  ipcMain.handle("diagnostics:open-logs", async () => {
    const error = await shell.openPath(fileLogger.logsDirectory);
    log(error ? "error" : "info", "diagnostics", "open_logs", { error: error || null });
    return error || null;
  });

  log("info", "diagnostics", "session_started", {
    logFile: fileLogger.logFile,
  });

  return {
    attachWindow,
    captureConsole,
    log,
    logFile: fileLogger.logFile,
    logsDirectory: fileLogger.logsDirectory,
    sessionId: fileLogger.sessionId,
  };
}

module.exports = { createDiagnostics, safeUrl };
