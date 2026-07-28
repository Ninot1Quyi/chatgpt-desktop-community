// Capture DOM structure + computed styles + screenshot from the original app (port 9223).
// Usage: node cdp-capture.mjs "<js expression>" [label]
// The expression runs in the original app's page; keep it returning JSON-able data.
const expr = process.argv[2];
const label = process.argv[3] || "out";
const targets = await fetch("http://127.0.0.1:9223/json").then((r) => r.json());
const pages = targets.filter((t) => t.type === "page");
console.error("pages:", pages.map((p) => `${p.title} :: ${p.url}`).join(" | "));
const page = pages.find((t) => t.url === "app://-/index.html") || pages.find((t) => t.url.includes("index.html")) || pages[0];
if (!page) { console.error("no page"); process.exit(1); }
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
const r = await call("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true });
if (r.exceptionDetails) {
  console.log("EXC:", r.exceptionDetails.text, (r.exceptionDetails.exception?.description || "").slice(0, 500));
} else {
  console.log(JSON.stringify(r.result?.value, null, 1)?.slice(0, 12000));
}
ws.close();
process.exit(0);
