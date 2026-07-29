const fs = require("node:fs");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const crypto = require("node:crypto");
const { getKimiConfigDir, readIndex } = require("./kimi-history.cjs");
const {
  fetchKimiAccount,
  generatedAvatar,
  parseKimiAccountPayload,
} = require("./kimi-account.cjs");

const CLAUDE_MODELS = [
  { model: "sonnet", displayName: "Claude Sonnet", description: "Balanced Claude Code model" },
  { model: "opus", displayName: "Claude Opus", description: "Most capable Claude Code model" },
  { model: "haiku", displayName: "Claude Haiku", description: "Fast Claude Code model" },
  { model: "best", displayName: "Claude Best", description: "Best model available to this account" },
  { model: "default", displayName: "Claude Default", description: "Claude Code account default" },
  { model: "opusplan", displayName: "Claude Opus Plan", description: "Opus for planning, Sonnet for execution" },
];
const CLAUDE_EFFORTS = ["low", "medium", "high", "xhigh", "max"];

function modelRecord(runtime, model, extra = {}) {
  const efforts = extra.efforts || [];
  return {
    model,
    runtime,
    provider: runtime,
    displayName: extra.displayName || model,
    description: extra.description || "",
    supportedReasoningEfforts: efforts.map((reasoningEffort) => ({ reasoningEffort })),
    defaultReasoningEffort: extra.defaultEffort || null,
    serviceTiers: [],
  };
}

function requireHost(host) {
  if (
    !host ||
    typeof host.resolveClaudeBinary !== "function" ||
    typeof host.resolveKimiBinary !== "function" ||
    typeof host.startLogin !== "function"
  ) {
    throw new Error("Agent runtime host implementation is required");
  }
  return host;
}

function execFileUtf8(binary, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(binary, args, {
      ...options,
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 4 * 1024 * 1024,
      env: {
        ...process.env,
        NO_COLOR: "1",
        FORCE_COLOR: "0",
        PYTHONUTF8: "1",
        PYTHONIOENCODING: "utf-8",
        ...(options.env || {}),
      },
    }, (error, stdout, stderr) => {
      if (error) {
        error.message = String(stderr || stdout || error.message).trim();
        reject(error);
      } else resolve({ stdout, stderr });
    });
  });
}

async function loadKimiModels(binary) {
  const { stdout } = await execFileUtf8(binary, ["provider", "list", "--json"]);
  const catalog = JSON.parse(stdout);
  const providers = catalog.providers || {};
  return Object.entries(catalog.models || {})
    .filter(([, value]) => providers[value.provider]?.type === "kimi")
    .map(([alias, value]) => modelRecord("kimi", alias, {
      displayName: value.displayName || alias,
      efforts: value.supportEfforts || [],
      defaultEffort: value.defaultEffort || null,
    }));
}

async function getRuntimeCatalog({
  homePath,
  env = process.env,
  host,
} = {}) {
  const implementation = requireHost(host);
  const claudeBinary = implementation.resolveClaudeBinary(homePath, env);
  const kimiBinary = implementation.resolveKimiBinary(homePath, env);
  let kimiModels = [];
  let kimiError = null;
  if (kimiBinary) {
    try { kimiModels = await loadKimiModels(kimiBinary); } catch (error) { kimiError = error.message; }
  }
  return {
    claude: {
      id: "claude",
      label: "Claude Code",
      available: !!claudeBinary,
      error: claudeBinary ? null : "Claude Code CLI was not found",
      models: CLAUDE_MODELS.map((entry) => modelRecord("claude", entry.model, {
        ...entry,
        efforts: CLAUDE_EFFORTS,
        defaultEffort: "high",
      })),
    },
    kimi: {
      id: "kimi",
      label: "Kimi Code",
      available: !!kimiBinary && kimiModels.length > 0,
      error: kimiError || (kimiBinary && kimiModels.length > 0
        ? null
        : kimiBinary ? "No Kimi models are configured" : "Kimi Code CLI was not found"),
      models: kimiModels,
    },
  };
}

function validateRun(request, catalog) {
  const runtime = request?.runtime;
  if (runtime !== "claude" && runtime !== "kimi") throw new Error("Unsupported external runtime");
  const entry = catalog[runtime];
  if (!entry?.available) throw new Error(entry?.error || `${runtime} runtime is unavailable`);
  const selected = entry.models.find((model) => model.model === request.model);
  if (!selected) {
    throw new Error(`Model "${request.model}" does not belong to ${entry.label}`);
  }
  if (request.effort) {
    const efforts = selected.supportedReasoningEfforts || [];
    if (efforts.length && !efforts.some((effort) => effort.reasoningEffort === request.effort)) {
      throw new Error(`Effort "${request.effort}" is not available for model "${request.model}"`);
    }
  }
  if (request.sessionId) {
    const valid = runtime === "claude"
      ? /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.sessionId)
      : /^session_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(request.sessionId);
    if (!valid) throw new Error(`Invalid ${entry.label} session ID`);
  }
}

function spawnUtf8(binary, args, options = {}) {
  const child = spawn(binary, args, {
    cwd: options.cwd || undefined,
    windowsHide: true,
    stdio: ["pipe", "pipe", "pipe"],
    env: {
      ...process.env,
      NO_COLOR: "1",
      FORCE_COLOR: "0",
      PYTHONUTF8: "1",
      PYTHONIOENCODING: "utf-8",
    },
  });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  return child;
}

function waitForChild(child, { stdin = null } = {}) {
  return new Promise((resolve, reject) => {
    let stdout = "";
    let stderr = "";
    const append = (current, chunk) => (current + chunk).slice(-4 * 1024 * 1024);
    child.stdout.on("data", (chunk) => { stdout = append(stdout, chunk); });
    child.stderr.on("data", (chunk) => { stderr = append(stderr, chunk); });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error((stderr || stdout || `Runtime exited with code ${code}${signal ? ` (${signal})` : ""}`).trim()));
    });
    if (stdin != null) child.stdin.end(stdin, "utf8");
    else child.stdin.end();
  });
}

function claudePermissionArgs(permission, planMode) {
  const mode = planMode ? "plan" : permission === "full" ? "bypassPermissions" : permission === "approve" ? "acceptEdits" : "default";
  return ["--permission-mode", mode];
}

function kimiPromptArgs(request, sessionId) {
  if (request.planMode) {
    throw new Error("Kimi Code prompt mode does not support plan mode");
  }
  // Kimi's non-interactive prompt mode rejects --auto, --yolo, and --plan.
  // It creates/resumes the session with auto permission internally.
  return [
    ...(sessionId ? ["-S", sessionId] : []),
    "-m", request.model,
    "-p", request.prompt,
    "--output-format", "stream-json",
  ];
}

async function runExternalAgent(request, {
  homePath,
  kimiConfigDir,
  env = process.env,
  host,
  onSpawn,
} = {}) {
  const implementation = requireHost(host);
  const catalog = await getRuntimeCatalog({ homePath, env, host: implementation });
  validateRun(request, catalog);
  const runtime = request.runtime;
  const cwd = request.cwd && fs.existsSync(request.cwd) ? request.cwd : homePath;
  let sessionId = request.sessionId || null;
  let child;

  if (runtime === "claude") {
    const binary = implementation.resolveClaudeBinary(homePath, env);
    if (!sessionId) sessionId = crypto.randomUUID();
    const args = [
      "-p",
      "--output-format", "stream-json",
      "--verbose",
      "--model", request.model,
      "--effort", request.effort || "high",
      ...claudePermissionArgs(request.permission, request.planMode),
    ];
    if (request.sessionId) args.push("--resume", sessionId);
    else args.push("--session-id", sessionId);
    child = spawnUtf8(binary, args, { cwd });
    onSpawn?.(child);
    await waitForChild(child, { stdin: request.prompt });
  } else {
    const binary = implementation.resolveKimiBinary(homePath, env);
    const before = new Set((await readIndex(kimiConfigDir)).map((entry) => entry.sessionId));
    const args = kimiPromptArgs(request, sessionId);
    child = spawnUtf8(binary, args, { cwd });
    onSpawn?.(child);
    await waitForChild(child);
    if (!sessionId) {
      const after = await readIndex(kimiConfigDir);
      const created = after.filter((entry) => !before.has(entry.sessionId));
      sessionId = (created.at(-1) || after.filter((entry) => path.resolve(entry.workDir || "") === path.resolve(cwd)).at(-1))?.sessionId;
    }
    if (!sessionId) throw new Error("Kimi Code completed but its session ID could not be identified");
  }
  return { runtime, sessionId };
}

// ---------------------------------------------------------------------------
// External vendor auth: status detection + login flow launch.
// Codex auth is owned by the app-server (account/read); these cover the two
// CLI-based vendors.
// ---------------------------------------------------------------------------

// Claude: `claude auth status` prints JSON ({ loggedIn, authMethod, ... }).
// Falls back to loggedIn:false when the CLI is missing or errors.
async function getClaudeAuth(homePath, env, host) {
  const binary = requireHost(host).resolveClaudeBinary(homePath, env);
  if (!binary) return { loggedIn: false, detail: "Claude Code CLI was not found" };
  try {
    const { stdout } = await execFileUtf8(binary, ["auth", "status"], { timeout: 15000 });
    const status = JSON.parse(stdout);
    return { loggedIn: !!status.loggedIn, detail: status.authMethod || null };
  } catch (error) {
    return { loggedIn: false, detail: error.message };
  }
}

// Kimi: the CLI stores OAuth credentials as JSON files under
// <config>/credentials (device-code login via `kimi login`).
function getKimiAuth(homePath, env) {
  try {
    const credDir = path.join(getKimiConfigDir(homePath, env), "credentials");
    const files = fs.readdirSync(credDir).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      try {
        const credential = JSON.parse(fs.readFileSync(path.join(credDir, file), "utf8"));
        const accessToken = typeof credential?.access_token === "string"
          ? credential.access_token.trim()
          : "";
        const refreshToken = typeof credential?.refresh_token === "string"
          ? credential.refresh_token.trim()
          : "";
        // An expired access token is still a usable login when a refresh token
        // is present: Kimi Code owns refresh/rotation when the runtime starts.
        if (accessToken || refreshToken) {
          return { loggedIn: true, detail: "oauth_credentials" };
        }
      } catch {}
    }
    return { loggedIn: false, detail: "No saved Kimi credentials" };
  } catch {
    return { loggedIn: false, detail: "No saved Kimi credentials" };
  }
}

const kimiVersionCache = new Map();
async function getKimiAccount({
  homePath,
  env = process.env,
  forceRefresh = false,
  host,
} = {}) {
  const binary = requireHost(host).resolveKimiBinary(homePath, env);
  if (!binary) throw new Error("Kimi Code CLI was not found");
  let clientVersion = kimiVersionCache.get(binary);
  if (!clientVersion) {
    const { stdout } = await execFileUtf8(binary, ["--version"], { timeout: 5000 });
    clientVersion = String(stdout || "").trim().split(/\s+/).at(-1) || "unknown";
    kimiVersionCache.set(binary, clientVersion);
  }
  return fetchKimiAccount({
    clientVersion,
    configDir: getKimiConfigDir(homePath, env),
    env,
    forceRefresh,
  });
}

async function getExternalAuthStatus({
  homePath,
  env = process.env,
  host,
} = {}) {
  const [claude, kimi] = await Promise.all([
    getClaudeAuth(homePath, env, host),
    Promise.resolve(getKimiAuth(homePath, env)),
  ]);
  return { claude, kimi };
}

// Login flows are interactive; the selected host module owns how a real
// terminal window is launched.
const LOGIN_ARGS = { claude: ["auth", "login"], kimi: ["login"] };
function startExternalLogin(runtime, {
  homePath,
  env = process.env,
  host,
} = {}) {
  const args = LOGIN_ARGS[runtime];
  if (!args) throw new Error(`Unsupported runtime "${runtime}"`);
  const implementation = requireHost(host);
  const binary = runtime === "claude"
    ? implementation.resolveClaudeBinary(homePath, env)
    : implementation.resolveKimiBinary(homePath, env);
  if (!binary) throw new Error(`${runtime === "claude" ? "Claude Code" : "Kimi Code"} CLI was not found`);
  return implementation.startLogin({ args, binary, runtime });
}

module.exports = {
  ...require("./claude-history.cjs"),
  ...require("./kimi-history.cjs"),
  CLAUDE_MODELS,
  getExternalAuthStatus,
  getKimiAccount,
  getKimiAuth,
  getRuntimeCatalog,
  generatedAvatar,
  kimiPromptArgs,
  loadKimiModels,
  parseKimiAccountPayload,
  runExternalAgent,
  startExternalLogin,
  validateRun,
};
