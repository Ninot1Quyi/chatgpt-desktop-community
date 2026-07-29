const { spawn } = require("node:child_process");
const { version: CLIENT_VERSION } = require("../../../package.json");

const DEFAULT_BINARY = "kimi";
const STDERR_LIMIT = 16 * 1024;
const EXIT_GRACE_MS = 500;

function truncateTail(value, limit = STDERR_LIMIT) {
  const text = String(value || "");
  return text.length > limit ? text.slice(-limit) : text;
}

function appendTruncated(current, chunk, limit = STDERR_LIMIT) {
  return truncateTail(`${current}${chunk}`, limit);
}

function acpErrorMessage(error) {
  if (!error) return "ACP request failed";
  if (typeof error === "string") return error;
  return error.message || error.data || `ACP error ${error.code}`;
}

function errorWithStderr(message, stderr) {
  const text = truncateTail(stderr).trim();
  const error = new Error(text ? `${message}\n${text}` : message);
  error.stderr = text;
  return error;
}

function parseJsonRpcLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed) return null;
  return JSON.parse(trimmed);
}

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key);
}

function permissionKind(option) {
  return String(option?.kind || option?.optionId || "").toLowerCase();
}

function choosePermissionOption(permission, options = []) {
  const allowKinds = permission === "full"
    ? ["allow_always", "always", "allow_once", "approve"]
    : permission === "approve"
      ? ["allow_once", "approve"]
      : [];
  for (const kind of allowKinds) {
    const option = options.find((entry) => permissionKind(entry) === kind);
    if (option) return option;
  }
  return options.find((entry) => ["reject_once", "reject_always", "deny", "reject"].includes(permissionKind(entry))) || null;
}

function kimiMode(permission, planMode) {
  if (planMode) return "plan";
  if (permission === "full") return "yolo";
  if (permission === "approve") return "auto";
  return "default";
}

function isThinkingConfigAvailable(configOptions = []) {
  return configOptions.some((option) => {
    const id = String(option?.id || "").toLowerCase();
    const category = String(option?.category || "").toLowerCase();
    return id === "thinking" || id === "reasoning" || id.includes("thinking") || category === "thought_level";
  });
}

function childExited(child) {
  return child.exitCode != null || child.signalCode != null || child.killed;
}

function waitForExit(child, timeoutMs = EXIT_GRACE_MS) {
  if (childExited(child)) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      if (!childExited(child)) child.kill();
      resolve();
    }, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

class KimiAcpClient {
  constructor({
    binary = DEFAULT_BINARY,
    cwd,
    env = process.env,
    spawnImpl = spawn,
    onUpdate,
    onPermissionRequest,
    permission = "ask",
  } = {}) {
    this.binary = binary;
    this.cwd = cwd;
    this.env = env;
    this.spawnImpl = spawnImpl;
    this.onUpdate = onUpdate;
    this.onPermissionRequest = onPermissionRequest;
    this.permission = permission;
    this.child = null;
    this.nextId = 1;
    this.pending = new Map();
    this.stdoutBuffer = "";
    this.stderr = "";
    this.sessionId = null;
    this.exitError = null;
  }

  start() {
    if (this.child) return this.child;
    this.child = this.spawnImpl(this.binary, ["acp"], {
      cwd: this.cwd,
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
      env: {
        ...process.env,
        NO_COLOR: "1",
        FORCE_COLOR: "0",
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
        ...this.env,
      },
    });
    this.child.stdout?.setEncoding?.("utf8");
    this.child.stderr?.setEncoding?.("utf8");
    this.child.stdout?.on("data", (chunk) => this.handleStdout(chunk));
    this.child.stderr?.on("data", (chunk) => {
      this.stderr = appendTruncated(this.stderr, chunk);
    });
    this.child.once("error", (error) => this.rejectAll(errorWithStderr(error.message, this.stderr)));
    this.child.once("exit", (code, signal) => {
      const label = signal ? `signal ${signal}` : `code ${code}`;
      this.exitError = errorWithStderr(`Kimi ACP exited before completing pending requests (${label})`, this.stderr);
      if (this.pending.size > 0) this.rejectAll(this.exitError);
    });
    return this.child;
  }

  request(method, params = {}) {
    if (!this.child) throw new Error("Kimi ACP client has not been started");
    if (childExited(this.child)) {
      return Promise.reject(this.exitError || errorWithStderr("Kimi ACP process is not running", this.stderr));
    }
    const id = this.nextId++;
    const message = { jsonrpc: "2.0", id, method, params };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { method, resolve, reject });
      this.write(message);
    });
  }

  notify(method, params = {}) {
    if (!this.child || !this.child.stdin?.writable) return;
    this.write({ jsonrpc: "2.0", method, params });
  }

  respond(id, result) {
    this.write({ jsonrpc: "2.0", id, result });
  }

  respondError(id, code, message) {
    this.write({ jsonrpc: "2.0", id, error: { code, message } });
  }

  write(message) {
    if (!this.child?.stdin?.writable) {
      throw errorWithStderr("Kimi ACP stdin is not writable", this.stderr);
    }
    this.child.stdin.write(`${JSON.stringify(message)}\n`, "utf8");
  }

  handleStdout(chunk) {
    this.stdoutBuffer += String(chunk);
    const lines = this.stdoutBuffer.split(/\r?\n/);
    this.stdoutBuffer = lines.pop() || "";
    for (const line of lines) {
      let message;
      try {
        message = parseJsonRpcLine(line);
      } catch (error) {
        this.rejectAll(errorWithStderr(`Invalid Kimi ACP JSON-RPC message: ${error.message}`, this.stderr));
        continue;
      }
      if (message) this.handleMessage(message);
    }
  }

  handleMessage(message) {
    if (hasOwn(message, "id") && !message.method) {
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(errorWithStderr(`${pending.method}: ${acpErrorMessage(message.error)}`, this.stderr));
      } else {
        pending.resolve(message.result || {});
      }
      return;
    }
    if (!message.method) return;
    if (message.method === "session/update") {
      this.onUpdate?.(message.params || {});
      return;
    }
    if (message.method === "session/request_permission") {
      void this.handlePermissionRequest(message).catch(() => {
        if (!this.child?.stdin?.writable) return;
        try {
          this.respond(message.id, { outcome: { outcome: "cancelled" } });
        } catch {}
      });
      return;
    }
    if (hasOwn(message, "id")) {
      this.respondError(message.id, -32601, `Unsupported client method: ${message.method}`);
    }
  }

  async handlePermissionRequest(message) {
    const params = message.params || {};
    if (
      typeof this.onPermissionRequest === "function" &&
      !["full", "approve"].includes(this.permission)
    ) {
      let result;
      try {
        result = await this.onPermissionRequest(params);
      } catch {
        result = null;
      }
      this.respond(message.id, result?.outcome
        ? result
        : { outcome: { outcome: "cancelled" } });
      return;
    }
    const option = choosePermissionOption(this.permission, params.options || []);
    const allowed = option && ["full", "approve"].includes(this.permission) && permissionKind(option).startsWith("allow");
    const rejected = option && !allowed;
    if (allowed) {
      this.respond(message.id, { outcome: { outcome: "selected", optionId: option.optionId } });
    } else if (rejected) {
      this.respond(message.id, { outcome: { outcome: "selected", optionId: option.optionId } });
    } else {
      this.respond(message.id, { outcome: { outcome: "cancelled" } });
    }
  }

  async initialize() {
    return this.request("initialize", {
      protocolVersion: 1,
      clientCapabilities: {
        fs: { readTextFile: false, writeTextFile: false },
        terminal: false,
      },
      clientInfo: {
        name: "chatgpt-desktop-community",
        title: "ChatGPT Desktop Community",
        version: CLIENT_VERSION,
      },
    });
  }

  async createSession({ cwd, mcpServers = [], additionalDirectories = [] } = {}) {
    const result = await this.request("session/new", {
      cwd,
      mcpServers,
      ...(additionalDirectories.length ? { additionalDirectories } : {}),
    });
    this.sessionId = result.sessionId;
    return result;
  }

  async resumeSession({ sessionId, cwd, mcpServers = [], additionalDirectories = [] } = {}) {
    const result = await this.request("session/resume", {
      sessionId,
      cwd,
      mcpServers,
      ...(additionalDirectories.length ? { additionalDirectories } : {}),
    });
    this.sessionId = sessionId;
    return result;
  }

  async setConfigOption(sessionId, configId, value) {
    return this.request("session/set_config_option", {
      sessionId,
      configId,
      value,
    });
  }

  async prompt(sessionId, prompt) {
    return this.request("session/prompt", {
      sessionId,
      prompt: [{ type: "text", text: String(prompt || "") }],
    });
  }

  cancel(sessionId = this.sessionId) {
    if (sessionId && this.child?.stdin?.writable) {
      this.notify("session/cancel", { sessionId });
    } else if (this.child && !childExited(this.child)) {
      this.child.kill();
    }
  }

  async close() {
    if (this.child?.stdin?.writable) this.child.stdin.end();
    await waitForExit(this.child);
  }

  rejectAll(error) {
    for (const { reject } of this.pending.values()) reject(error);
    this.pending.clear();
  }
}

async function runKimiAcp(request, {
  binary = DEFAULT_BINARY,
  cwd = request?.cwd || process.cwd(),
  env = process.env,
  spawnImpl = spawn,
  onSpawn,
  onUpdate,
  onPermissionRequest,
} = {}) {
  const client = new KimiAcpClient({
    binary,
    cwd,
    env,
    spawnImpl,
    onUpdate,
    onPermissionRequest,
    permission: request?.permission,
  });
  const child = client.start();
  onSpawn?.(child, { cancel: () => client.cancel() });

  try {
    await client.initialize();
    const session = request?.sessionId
      ? await client.resumeSession({ sessionId: request.sessionId, cwd })
      : await client.createSession({ cwd });
    const sessionId = request?.sessionId || session.sessionId;
    if (!sessionId) throw new Error("Kimi ACP did not return a session ID");

    const mode = kimiMode(request?.permission, request?.planMode);
    if (request?.model) await client.setConfigOption(sessionId, "model", request.model);
    await client.setConfigOption(sessionId, "mode", mode);

    const thinking = request?.thinking || request?.thinkingEffort || request?.effort || null;
    const configOptions = session.configOptions || [];
    if (thinking && isThinkingConfigAvailable(configOptions)) {
      await client.setConfigOption(sessionId, "thinking", "on");
    }

    const promptResult = await client.prompt(sessionId, request?.prompt);
    await client.close();
    return { sessionId, stopReason: promptResult.stopReason || null };
  } catch (error) {
    if (!childExited(child)) child.kill();
    throw errorWithStderr(error.message, client.stderr);
  }
}

module.exports = {
  KimiAcpClient,
  choosePermissionOption,
  isThinkingConfigAvailable,
  kimiMode,
  parseJsonRpcLine,
  runKimiAcp,
  truncateTail,
};
