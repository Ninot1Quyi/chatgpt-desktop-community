// Archive the throwaway verification thread (cwd=/tmp/codex-rebuilt-test).
import { spawn } from "node:child_process";
const BIN = "/Applications/ChatGPT.app/Contents/Resources/codex";
const proc = spawn(BIN, ["-c", "features.code_mode_host=true", "app-server", "--analytics-default-enabled"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: { ...process.env, LOG_FORMAT: "json", RUST_LOG: "warn" },
});
let buf = "";
const pending = new Map();
const send = (method, params, id) => {
  const msg = { id: id ?? `${method}:${crypto.randomUUID()}`, method, params };
  proc.stdin.write(JSON.stringify(msg) + "\n");
  return new Promise((resolve, reject) => {
    pending.set(msg.id, { resolve, reject });
    setTimeout(() => pending.has(msg.id) && (pending.delete(msg.id), reject(new Error("timeout"))), 20000);
  });
};
proc.stdout.on("data", (d) => {
  buf += d.toString("utf8");
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i); buf = buf.slice(i + 1);
    if (!line.trim()) continue;
    let m; try { m = JSON.parse(line); } catch { continue; }
    if (m.id !== undefined && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
    }
  }
});
await send("initialize", { clientInfo: { name: "cleanup", title: "cleanup", version: "0.0.1" }, capabilities: { experimentalApi: true } }, "__codex_initialize__");
const list = await send("thread/list", { archived: false, limit: 20, sortKey: "updated_at", sortDirection: "desc" });
const targets = (list?.data || []).filter((t) => t.cwd === "/tmp/codex-rebuilt-test");
for (const t of targets) {
  await send("thread/archive", { threadId: t.id }).catch((e) => console.log("archive fail", t.id, e.message));
  console.log("archived", t.id, JSON.stringify(t.preview || t.name || "").slice(0, 60));
}
console.log("done", targets.length);
proc.kill();
process.exit(0);
