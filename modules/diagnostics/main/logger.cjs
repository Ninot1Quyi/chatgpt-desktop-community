const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const util = require("node:util");

const MAX_STRING_LENGTH = 8_000;
const SENSITIVE_KEYS = new Set([
  "accesskey",
  "accesstoken",
  "apikey",
  "authorization",
  "clientsecret",
  "code",
  "cookie",
  "credential",
  "idtoken",
  "password",
  "refreshtoken",
  "secret",
  "sessiontoken",
  "state",
  "token",
]);

function normalizedKey(key) {
  return String(key).replaceAll(/[^a-z0-9]/gi, "").toLowerCase();
}

function redactString(value) {
  return String(value)
    .slice(0, MAX_STRING_LENGTH)
    .replace(/\b(Bearer)\s+[A-Za-z0-9._~+/=-]+/gi, "$1 [REDACTED]")
    .replace(
      /([?&](?:access_token|refresh_token|id_token|token|code|state|password|secret)=)[^&\s]+/gi,
      "$1[REDACTED]",
    )
    .replace(
      /(["']?(?:access[_-]?token|refresh[_-]?token|id[_-]?token|session[_-]?token|api[_-]?key|client[_-]?secret|authorization|cookie|credential|password|secret|token|code|state)["']?\s*[:=]\s*["']?)[^"',\s};]+/gi,
      "$1[REDACTED]",
    );
}

function safeValue(value, depth = 0, seen = new WeakSet()) {
  if (value == null || typeof value === "boolean" || typeof value === "number") {
    return value;
  }
  if (typeof value === "string") return redactString(value);
  if (typeof value === "bigint") return String(value);
  if (value instanceof Error) {
    return {
      name: redactString(value.name || "Error"),
      message: redactString(value.message || ""),
      stack: redactString(value.stack || ""),
    };
  }
  if (depth >= 5) return "[TRUNCATED]";
  if (typeof value !== "object") return redactString(String(value));
  if (seen.has(value)) return "[CIRCULAR]";
  seen.add(value);
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => safeValue(item, depth + 1, seen));
  }
  return Object.fromEntries(
    Object.entries(value)
      .slice(0, 80)
      .map(([key, item]) => [
        key,
        SENSITIVE_KEYS.has(normalizedKey(key))
          ? "[REDACTED]"
          : safeValue(item, depth + 1, seen),
      ]),
  );
}

function rotateLog(logFile, maxBytes, retainedFiles) {
  try {
    if (!fs.existsSync(logFile) || fs.statSync(logFile).size < maxBytes) return;
    const oldest = `${logFile}.${retainedFiles}`;
    if (fs.existsSync(oldest)) fs.rmSync(oldest);
    for (let index = retainedFiles - 1; index >= 1; index -= 1) {
      const source = `${logFile}.${index}`;
      if (fs.existsSync(source)) fs.renameSync(source, `${logFile}.${index + 1}`);
    }
    fs.renameSync(logFile, `${logFile}.1`);
  } catch {}
}

function createFileLogger({
  logsDirectory,
  maxBytes = 4 * 1024 * 1024,
  retainedFiles = 3,
}) {
  fs.mkdirSync(logsDirectory, { recursive: true });
  const logFile = path.join(logsDirectory, "main.log");
  rotateLog(logFile, maxBytes, retainedFiles);
  const sessionId = crypto.randomUUID();

  function write(level, source, event, details = {}) {
    const entry = {
      timestamp: new Date().toISOString(),
      level: ["debug", "info", "warn", "error"].includes(level) ? level : "info",
      source: redactString(source || "main"),
      event: redactString(event || "event"),
      sessionId,
      details: safeValue(details),
    };
    try {
      rotateLog(logFile, maxBytes, retainedFiles);
      fs.appendFileSync(logFile, `${JSON.stringify(entry)}\n`, "utf8");
      return true;
    } catch {
      return false;
    }
  }

  function consoleMessage(args) {
    return redactString(args.map((item) => (
      typeof item === "string"
        ? item
        : util.inspect(item, { depth: 4, maxArrayLength: 30, breakLength: 160 })
    )).join(" "));
  }

  return {
    consoleMessage,
    logFile,
    logsDirectory,
    sessionId,
    write,
  };
}

module.exports = {
  createFileLogger,
  redactString,
  safeValue,
};
