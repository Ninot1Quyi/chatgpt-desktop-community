// Screenshot helper for OUR rebuilt app on port 9222.
// Usage: node rebuilt-shot.mjs <out.png> [evalExprBefore]
const out = process.argv[2] || "/tmp/rebuilt-shot.png";
const preEval = process.argv[3];
const targets = await fetch("http://127.0.0.1:9222/json").then((r) => r.json());
const page = targets.find((t) => t.type === "page" && t.url.endsWith("index.html"))
  || targets.filter((t) => t.type === "page")[0];
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
let seq = 0;
const pending = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
};
const call = (method, params) => new Promise((resolve, reject) => {
  const id = ++seq; pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
if (preEval) {
  const r = await call("Runtime.evaluate", { expression: preEval, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) console.error("preEval EXC:", r.exceptionDetails.text, (r.exceptionDetails.exception?.description || "").slice(0, 400));
  else console.error("preEval:", JSON.stringify(r.result?.value)?.slice(0, 200));
}
const shot = await call("Page.captureScreenshot", { format: "png" });
const { writeFileSync } = await import("node:fs");
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log("saved", out);
ws.close();
process.exit(0);
