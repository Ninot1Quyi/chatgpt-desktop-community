// Reload the page and capture console + exception output for N ms.
const waitMs = Number(process.argv[2] || 6000);
const port = Number(process.argv[3] || 9222);
const targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json());
const page = targets.find((target) =>
  target.type === "page" && !target.url.includes("window="),
) || targets.find((target) => target.type === "page");
const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });

let seq = 0;
const pending = new Map();
const call = (method, params) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id).resolve(m.result); pending.delete(m.id); return; }
  if (m.method === "Runtime.consoleAPICalled") {
    const args = m.params.args.map((a) => a.value ?? a.description ?? JSON.stringify(a.preview?.properties?.slice(0,5) ?? {})).join(" ");
    console.log(`[console.${m.params.type}]`, args.slice(0, 800));
  }
  if (m.method === "Runtime.exceptionThrown") {
    const d = m.params.exceptionDetails;
    console.log("[exception]", d.text, d.exception?.description?.slice(0, 800) || "");
  }
  if (m.method === "Log.entryAdded") {
    const e = m.params.entry;
    if (e.level === "error" || e.level === "warning") console.log(`[log.${e.level}]`, e.text.slice(0, 500), e.url || "");
  }
};
await call("Runtime.enable");
await call("Log.enable");
await call("Page.enable");
await call("Page.reload", { ignoreCache: true });
await new Promise((r) => setTimeout(r, waitMs));
const r = await call("Runtime.evaluate", { expression: "document.getElementById('root').childElementCount", returnByValue: true });
console.log("root children:", r.result?.value);
const t = await call("Runtime.evaluate", { expression: "document.body.innerText.slice(0,400)", returnByValue: true });
console.log("body text:", JSON.stringify(t.result?.value));
process.exit(0);
