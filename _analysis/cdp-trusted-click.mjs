// Trusted-input click via CDP Input domain: click center of element matching text.
// Usage: node cdp-trusted-click.mjs "<text>" <outfile.png|-> [waitMs] [match=exact|contains] [index]
const text = process.argv[2];
const out = process.argv[3] || "-";
const waitMs = Number(process.argv[4] || 3000);
const matchMode = process.argv[5] || "exact";
const pickIdx = Number(process.argv[6] || 0);

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

const findExpr = `
(() => {
  const wanted = ${JSON.stringify(text)};
  const mode = ${JSON.stringify(matchMode)};
  const els = [...document.querySelectorAll('button, a, [role="button"], [role="link"], span, div')]
    .filter((el) => {
      const t = (el.innerText || '').trim();
      if (!t) return false;
      return mode === 'exact' ? t === wanted : t.includes(wanted);
    });
  // prefer deepest (most specific) element
  els.sort((a, b) => depth(b) - depth(a));
  function depth(el) { let d = 0; while (el.parentElement) { el = el.parentElement; d++; } return d; }
  const el = els[${pickIdx}];
  if (!el) return null;
  const t = el.closest('button, a, [role="button"]') || el;
  const r = t.getBoundingClientRect();
  return {x: r.left + r.width / 2, y: r.top + r.height / 2, tag: t.tagName, cls: String(t.className).slice(0, 60)};
})()`;
const r = await call("Runtime.evaluate", { expression: findExpr, returnByValue: true });
const pos = r.result?.value;
if (!pos) { console.error("NOT_FOUND"); process.exit(1); }
console.error("click at", JSON.stringify(pos));

await call("Input.dispatchMouseEvent", { type: "mouseMoved", x: pos.x, y: pos.y });
await call("Input.dispatchMouseEvent", { type: "mousePressed", x: pos.x, y: pos.y, button: "left", clickCount: 1 });
await call("Input.dispatchMouseEvent", { type: "mouseReleased", x: pos.x, y: pos.y, button: "left", clickCount: 1 });

await new Promise((res) => setTimeout(res, waitMs));
if (out !== "-") {
  const shot = await call("Page.captureScreenshot", { format: "png" });
  const { writeFileSync } = await import("node:fs");
  writeFileSync(out, Buffer.from(shot.data, "base64"));
  console.log("saved", out);
}
ws.close();
process.exit(0);
