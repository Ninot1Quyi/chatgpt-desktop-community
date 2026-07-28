// CDP driver: run a JS expression in the page, print result.
const expr = process.argv[2];
const waitMs = Number(process.argv[3] || 0);
const targets = await fetch("http://localhost:9223/json").then((r) => r.json());
const page = targets.find((t) => t.type === "page" && t.url.endsWith("index.html"))
  || targets.find((t) => t.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id); pending.delete(m.id);
    m.error ? p.reject(new Error(JSON.stringify(m.error))) : p.resolve(m.result);
  }
};
const call = (method, params) => new Promise((resolve, reject) => {
  const id = ++seq; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
if (waitMs) await new Promise((r) => setTimeout(r, waitMs));
const r = await call("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
if (r.exceptionDetails) {
  console.log("EXC:", r.exceptionDetails.text, r.exceptionDetails.exception?.description?.slice(0, 600) || "");
} else {
  const v = r.result?.value;
  console.log(typeof v === "string" ? v : JSON.stringify(v, null, 1)?.slice(0, 4000));
}
ws.close();
process.exit(0);
