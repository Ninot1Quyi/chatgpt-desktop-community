// Screenshot the original app's main window via CDP (Page.captureScreenshot).
// Usage: node cdp-shot.mjs <outfile.png> [evalExprBeforeShot] [port] [clipJson]
import { tmpdir } from "node:os";
import path from "node:path";

const out = process.argv[2] || path.join(tmpdir(), "orig-shot.png");
const preEval = process.argv[3];
const port = Number(process.argv[4] || 9223);
const clip = process.argv[5] ? JSON.parse(process.argv[5]) : undefined;
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json());
const pages = targets.filter((t) => t.type === "page");
const page = pages.find((t) => t.url === "app://-/index.html")
  || pages.find((t) => !t.url.includes("window="))
  || pages[0];
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
if (process.env.CDP_COLOR_SCHEME) {
  await call("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: process.env.CDP_COLOR_SCHEME }],
  });
}
await call("Page.bringToFront", {});
if (preEval) {
  const r = await call("Runtime.evaluate", { expression: preEval, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) console.error("preEval EXC:", r.exceptionDetails.text);
  else console.error("preEval:", JSON.stringify(r.result?.value)?.slice(0, 300));
}
const shot = await call("Page.captureScreenshot", { format: "png", clip });
const { writeFileSync } = await import("node:fs");
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log("saved", out);
ws.close();
process.exit(0);
