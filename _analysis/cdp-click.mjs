// Click an element by visible text in the original app, wait, screenshot.
// Usage: node cdp-click.mjs "<text>" <outfile.png> [waitMs] [which=first|last]
const text = process.argv[2];
const out = process.argv[3] || "/tmp/orig-click.png";
const waitMs = Number(process.argv[4] || 3000);
const which = process.argv[5] || "first";

const targets = await fetch("http://127.0.0.1:9223/json").then((r) => r.json());
const pages = targets.filter((t) => t.type === "page");
const page = pages.find((t) => t.url === "app://-/index.html") || pages[0];
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

const clickExpr = `
(() => {
  const wanted = ${JSON.stringify(text)};
  const els = [...document.querySelectorAll('button, a, [role="button"], [role="link"], div, span')]
    .filter((el) => el.childElementCount <= 4 && (el.innerText || '').trim() === wanted);
  const el = ${which === "last" ? "els[els.length-1]" : "els[0]"};
  if (!el) return 'NOT_FOUND';
  const t = el.closest('button, a, [role="button"]') || el;
  const r = t.getBoundingClientRect();
  const opts = {bubbles: true, cancelable: true, view: window, button: 0, buttons: 1,
    clientX: r.left + r.width / 2, clientY: r.top + r.height / 2};
  for (const type of ['pointerover', 'pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
    const Evt = type.startsWith('pointer') ? PointerEvent : MouseEvent;
    t.dispatchEvent(new Evt(type, opts));
  }
  return 'clicked: ' + t.tagName + ' ' + String(t.className).slice(0, 60);
})()`;
const r = await call("Runtime.evaluate", { expression: clickExpr, returnByValue: true });
console.error(r.result?.value ?? r.exceptionDetails?.text);

await new Promise((res) => setTimeout(res, waitMs));
const shot = await call("Page.captureScreenshot", { format: "png" });
const { writeFileSync } = await import("node:fs");
writeFileSync(out, Buffer.from(shot.data, "base64"));
console.log("saved", out);
ws.close();
process.exit(0);
