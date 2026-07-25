// Reference 9223: Plugins nav → expand "See ... more" row → dump expanded Featured cards.
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
const clickAt = async (x, y) => {
  for (const [type, button, clickCount] of [["mousePressed", "left", 1], ["mouseReleased", "left", 1]]) {
    await call("Input.dispatchMouseEvent", { type, x, y, button, clickCount });
  }
};
// close quick-chat overlay if open, then nav to Plugins
await clickAt(1683, 362); await sleep(500);
await clickAt(165, 224); await sleep(2200);
// find and click the See-row
const r1 = await call("Runtime.evaluate", {
  expression: `(() => {
    const el = [...document.querySelectorAll("button, div, span, a")].filter((e) => e.getBoundingClientRect().width > 0)
      .find((e) => /^See .+ and \\d+ more$/.test(e.textContent.trim()));
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return JSON.stringify({ x: r.left + r.width / 2, y: r.top + r.height / 2, text: el.textContent.trim() });
  })()`,
  returnByValue: true,
});
const see = r1.result?.value ? JSON.parse(r1.result.value) : null;
if (!see) { console.log("no-see-row"); process.exit(0); }
console.log("see-row:", see.text);
await clickAt(see.x, see.y);
await sleep(1800);
const r2 = await call("Runtime.evaluate", {
  expression: `(() => {
    const heads = [...document.querySelectorAll("h1,h2,h3,div,span")].filter((e) => e.getBoundingClientRect().width > 0);
    const feat = heads.find((e) => e.textContent.trim() === "Featured");
    if (!feat) return "no-featured";
    let sec = feat.parentElement;
    while (sec && !(sec.nextElementSibling && /^(Productivity|Finance|Developer|Design|Sales|Marketing|Engineering)/.test(sec.nextElementSibling.textContent.trim()))) sec = sec.parentElement;
    return JSON.stringify({ featured: (sec || feat.parentElement).innerText.slice(0, 1200) });
  })()`,
  returnByValue: true,
});
console.log(r2.result?.value);
ws.close();
process.exit(0);
