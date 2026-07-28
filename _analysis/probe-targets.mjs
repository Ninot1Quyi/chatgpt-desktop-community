// List app:// targets on 9223 with their viewport sizes to identify the main window.
const targets = await fetch("http://127.0.0.1:9223/json").then((r) => r.json());
for (const t of targets.filter((t) => t.type === "page" && t.url.startsWith("app://"))) {
  const ws = new WebSocket(t.webSocketDebuggerUrl);
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
  const r = await call("Runtime.evaluate", {
    expression: `JSON.stringify({w: window.innerWidth, h: window.innerHeight, route: location.href, title: document.title})`,
    returnByValue: true,
  });
  console.log(t.url, "=>", r.result?.value);
  ws.close();
}
process.exit(0);
