// Reference app 9223: bounce Archived section (General → Archived) and re-read counts.
const targets = await fetch("http://127.0.0.1:9223/json").then((r) => r.json());
const page = targets.find((t) => t.type === "page" && t.url === "app://-/index.html");
if (!page) { console.error("no main page"); process.exit(1); }
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clickText = async (text) => {
  const r = await call("Runtime.evaluate", {
    expression: `(() => {
      const els = [...document.querySelectorAll("button, [role=button], a, div, span")]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 4 && r.height > 4 && r.left < 500 && e.textContent.trim() === ${JSON.stringify(text)};
        })
        .sort((a, b) => a.getBoundingClientRect().width - b.getBoundingClientRect().width);
      if (!els.length) return null;
      const r = els[0].getBoundingClientRect();
      return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
    })()`,
    returnByValue: true,
  });
  const xy = r.result?.value ? JSON.parse(r.result.value) : null;
  if (!xy) return false;
  for (const [type, button, clickCount] of [["mousePressed", "left", 1], ["mouseReleased", "left", 1]]) {
    await call("Input.dispatchMouseEvent", { type, x: xy.x, y: xy.y, button, clickCount });
  }
  return true;
};
await clickText("General");
await sleep(1200);
await clickText("Archived chats");
await sleep(2500);
const r = await call("Runtime.evaluate", {
  expression: `(() => {
    const bt = document.body.innerText;
    return JSON.stringify({ chatCounts: [...bt.matchAll(/(\\d+) chats/g)].map((m) => m[1]) });
  })()`,
  returnByValue: true,
});
console.log(r.result?.value);
ws.close();
process.exit(0);
