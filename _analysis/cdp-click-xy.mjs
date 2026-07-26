// Trusted click at absolute coordinates in the original app.
// Usage: node cdp-click-xy.mjs <x> <y> <out.png|-> [waitMs] [move] [port]
const x = Number(process.argv[2]);
const y = Number(process.argv[3]);
const out = process.argv[4] || "-";
const waitMs = Number(process.argv[5] || 1200);
const moveOnly = process.argv[6] === "move";
const port = Number(process.argv[7] || 9223);
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json());
const page = targets.filter((t) => t.type === "page").find((t) => t.url === "app://-/index.html")
  || targets.find((t) => t.type === "page" && t.url.endsWith("/index.html"))
  || targets.find((t) => t.type === "page" && !t.url.includes("window="));
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
await call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
if (!moveOnly) {
  await call("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
  await call("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
}
await new Promise((res) => setTimeout(res, waitMs));
if (out !== "-") {
  const shot = await call("Page.captureScreenshot", { format: "png" });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log("saved", out);
}
ws.close();
process.exit(0);
