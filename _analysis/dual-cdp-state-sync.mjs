#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const HELP = `Usage:
  node _analysis/dual-cdp-state-sync.mjs --source 9223 --out state.json
  node _analysis/dual-cdp-state-sync.mjs --target 9222 --input state.json --apply
  node _analysis/dual-cdp-state-sync.mjs --source 9223 --target 9222 --apply

Options:
  --source <port>       Capture route and sanitized storage from this CDP port.
  --target <port>       Apply captured state to this CDP port.
  --input <file>        Read a snapshot JSON file.
  --out <file>          Write the captured snapshot JSON.
  --apply               Apply the snapshot to --target.
  --route <url>         Override the route before applying. By default, apply path/search/hash to the target origin.
  --preferred-url <url> Prefer a specific page target.
  --timeout <ms>        Connection timeout. Default: 5000.
  --help                Show this help.
`;

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

if (flag("help")) {
  console.log(HELP);
  process.exit(0);
}

const sourcePort = Number(arg("source", 0));
const targetPort = Number(arg("target", 0));
const inputPath = arg("input");
const outputPath = arg("out");
const preferredUrl = arg("preferred-url", "app://-/index.html");
const timeoutMs = Number(arg("timeout", 5000));
const apply = flag("apply");
const routeOverride = arg("route");

const SENSITIVE_KEY = /(?:auth|token|secret|password|credential|session|cookie|jwt|bearer|api[-_]?key)/i;
const SENSITIVE_VALUE = /(?:sk-[a-z0-9_-]{16,}|eyJ[a-zA-Z0-9_-]{20,}|bearer\s+[a-z0-9._-]{12,}|[a-f0-9]{32,})/i;

function sanitizeValue(key, value) {
  if (SENSITIVE_KEY.test(key)) return { skipped: true, reason: "sensitive-key" };
  if (typeof value === "string" && SENSITIVE_VALUE.test(value)) {
    return { value: "[REDACTED]", redacted: true };
  }
  return { value };
}

function sanitizeRoute(rawRoute) {
  const url = new URL(rawRoute);
  for (const key of [...url.searchParams.keys()]) {
    if (SENSITIVE_KEY.test(key)) url.searchParams.set(key, "[REDACTED]");
  }
  return url.href;
}

async function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function openChannel(url) {
  const socket = new WebSocket(url);
  await withTimeout(new Promise((resolveOpen, rejectOpen) => {
    socket.onopen = resolveOpen;
    socket.onerror = rejectOpen;
  }), `WebSocket open ${url}`);

  let sequence = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const operation = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) operation.reject(new Error(JSON.stringify(message.error)));
    else operation.resolve(message.result);
  };

  const call = (method, params = {}) => withTimeout(new Promise((resolveCall, rejectCall) => {
    const id = ++sequence;
    pending.set(id, { resolve: resolveCall, reject: rejectCall });
    socket.send(JSON.stringify({ id, method, params }));
  }), method);

  return { socket, call };
}

async function connect(port) {
  if (!port) throw new Error("CDP port is required");
  const targets = await withTimeout(
    fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json()),
    `Fetch targets for ${port}`,
  );
  const pages = targets.filter((target) => target.type === "page");
  const page = pages.find((target) => target.url === preferredUrl)
    || pages.find((target) => !target.url.includes("window="))
    || pages[0];
  if (!page) throw new Error(`No page target found on CDP port ${port}`);
  const channel = await openChannel(page.webSocketDebuggerUrl);
  return { ...channel, page };
}

async function evaluate(client, expression) {
  const result = await client.call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

function sanitizeStorage(storage) {
  const clean = {};
  for (const [area, entries] of Object.entries(storage)) {
    clean[area] = {};
    for (const [key, value] of Object.entries(entries || {})) {
      const sanitized = sanitizeValue(key, value);
      if (!sanitized.skipped) clean[area][key] = sanitized.value;
    }
  }
  return clean;
}

async function snapshot(client, port) {
  const raw = await evaluate(client, `(() => ({
    href: location.href,
    origin: location.origin,
    pathname: location.pathname,
    search: location.search,
    hash: location.hash,
    storage: {
      localStorage: Object.fromEntries(Object.entries(localStorage)),
      sessionStorage: Object.fromEntries(Object.entries(sessionStorage)),
    },
  }))()`);
  return {
    capturedAt: new Date().toISOString(),
    sourcePort: port,
    route: sanitizeRoute(raw.href),
    location: {
      origin: raw.origin,
      pathname: raw.pathname,
      search: new URL(sanitizeRoute(raw.href)).search,
      hash: raw.hash,
    },
    storage: sanitizeStorage(raw.storage),
  };
}

async function applySnapshot(client, snapshotData) {
  const route = routeOverride || await evaluate(client, `(() => {
    const current = new URL(location.href);
    current.pathname = ${JSON.stringify(snapshotData.location?.pathname || "/")};
    current.search = ${JSON.stringify(snapshotData.location?.search || "")};
    current.hash = ${JSON.stringify(snapshotData.location?.hash || "")};
    return current.href;
  })()`);
  await evaluate(client, `(() => {
    const applyArea = (area, values) => {
      for (const [key, value] of Object.entries(values || {})) {
        if (value === "[REDACTED]") continue;
        window[area].setItem(key, String(value));
      }
    };
    applyArea("localStorage", ${JSON.stringify(snapshotData.storage?.localStorage || {})});
    applyArea("sessionStorage", ${JSON.stringify(snapshotData.storage?.sessionStorage || {})});
    return true;
  })()`);
  if (route) await client.call("Page.navigate", { url: route });
}

let sourceClient;
let targetClient;
try {
  let data = inputPath ? JSON.parse(readFileSync(inputPath, "utf8")) : null;
  if (sourcePort) {
    sourceClient = await connect(sourcePort);
    data = await snapshot(sourceClient, sourcePort);
    if (outputPath) {
      mkdirSync(dirname(resolve(outputPath)), { recursive: true });
      writeFileSync(outputPath, `${JSON.stringify(data, null, 2)}\n`);
    }
  }
  if (apply) {
    if (!data) throw new Error("Provide --source or --input before --apply");
    targetClient = await connect(targetPort);
    await applySnapshot(targetClient, data);
  }
  console.log(JSON.stringify({
    captured: Boolean(sourcePort),
    applied: apply,
    sourcePort: sourcePort || undefined,
    targetPort: apply ? targetPort : undefined,
    capturedRoute: data?.route,
    appliedRoute: apply ? routeOverride || "target-origin + captured path/search/hash" : undefined,
    localStorageKeys: Object.keys(data?.storage?.localStorage || {}).length,
    sessionStorageKeys: Object.keys(data?.storage?.sessionStorage || {}).length,
    output: outputPath || undefined,
  }, null, 2));
} finally {
  sourceClient?.socket.close();
  targetClient?.socket.close();
}
