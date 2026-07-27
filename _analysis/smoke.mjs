// Read-only smoke test: spawn codex app-server, initialize, thread/list, thread/read (first thread, no turns).
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import codexRuntime from "../main/codex-runtime.js";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const { binary: BIN } = codexRuntime.resolveCodexBinary({
  resourcesPath: path.join(repoRoot, "release", "codex-runtime-stage"),
  homePath: os.homedir(),
});
const proc = spawn(BIN, ["-c", "features.code_mode_host=true", "app-server", "--analytics-default-enabled"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, LOG_FORMAT: "json", RUST_LOG: "warn" },
});

let buf = "";
const pending = new Map();
let idCounter = 0;
proc.on("error", (error) => {
  for (const { reject } of pending.values()) reject(error);
  pending.clear();
});

function send(method, params, id) {
  const msg = { id: id ?? `${method}:${crypto.randomUUID()}`, method, params };
  proc.stdin.write(JSON.stringify(msg) + "\n");
  return new Promise((resolve, reject) => {
    pending.set(msg.id, { resolve, reject });
    setTimeout(() => { if (pending.has(msg.id)) { pending.delete(msg.id); reject(new Error(`timeout ${method}`)); } }, 30000);
  });
}

proc.stdout.on("data", (d) => {
  buf += d.toString("utf8");
  let idx;
  while ((idx = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, idx); buf = buf.slice(idx + 1);
    if (!line.trim()) continue;
    let msg; try { msg = JSON.parse(line); } catch { continue; }
    if (msg.id !== undefined && pending.has(msg.id)) {
      const p = pending.get(msg.id); pending.delete(msg.id);
      msg.error ? p.reject(new Error(JSON.stringify(msg.error))) : p.resolve(msg.result);
    }
  }
});
proc.stderr.on("data", () => {});

const summarize = (v, depth = 0) => {
  if (v === null || typeof v !== "object") return typeof v;
  if (Array.isArray(v)) return v.length ? [`array(${v.length})`, summarize(v[0], depth + 1)] : ["array(0)"];
  if (depth > 2) return "object";
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, summarize(x, depth + 1)]));
};

let exitCode = 0;
try {
  const init = await send("initialize", {
    clientInfo: { name: "smoke_test", title: "Smoke", version: "0.0.1" },
    capabilities: { experimentalApi: true },
  }, "__codex_initialize__");
  console.log("INIT:", JSON.stringify(init));

  const list = await send("thread/list", { archived: false, limit: 5, sortKey: "updated_at", sortDirection: "desc" });
  console.log("THREAD_LIST keys:", JSON.stringify(summarize(list), null, 1).slice(0, 3000));
  const first = list?.data?.[0];
  if (first) {
    console.log("FIRST_THREAD:", JSON.stringify(first).slice(0, 1500));
    const read = await send("thread/read", { threadId: first.id, includeTurns: false });
    console.log("THREAD_READ keys:", JSON.stringify(summarize(read), null, 1).slice(0, 2000));
    const turns = await send("thread/turns/list", { threadId: first.id, limit: 2 });
    console.log("TURNS_LIST:", JSON.stringify(summarize(turns), null, 1).slice(0, 2500));
  }
  const models = await send("model/list", {}).catch((e) => ({ err: String(e) }));
  console.log("MODEL_LIST:", JSON.stringify(models).slice(0, 1200));
  const acct = await send("account/read", { refreshToken: false }).catch((e) => ({ err: String(e) }));
  console.log("ACCOUNT:", JSON.stringify(acct).slice(0, 800));
} catch (e) {
  exitCode = 1;
  console.error("FAIL:", e.message);
} finally {
  proc.kill();
  process.exit(exitCode);
}
