// Dump CSS custom properties + depth-limited DOM skeletons (tag + tailwind class + short text)
// from the original app. Measurement data for visual replication.
const targets = await fetch("http://127.0.0.1:9223/json").then((r) => r.json());
const page = targets.filter((t) => t.type === "page").find((t) => t.url === "app://-/index.html");
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

const expr = `
(() => {
  const out = {};
  // 1. CSS custom properties from all stylesheets (root-level)
  const vars = {};
  for (const sheet of document.styleSheets) {
    let rules; try { rules = sheet.cssRules; } catch { continue; }
    for (const rule of rules) {
      if (rule.selectorText && /^:root|\\.electron-dark|\\.dark|^html/.test(rule.selectorText) && rule.style) {
        for (let i = 0; i < rule.style.length; i++) {
          const prop = rule.style[i];
          if (prop.startsWith('--')) {
            const key = rule.selectorText + ' :: ' + prop;
            if (!(key in vars)) vars[key] = rule.style.getPropertyValue(prop).trim();
          }
        }
      }
      // tailwind v4 @theme blocks show up as :root rules too
    }
  }
  out.vars = vars;

  // 2. DOM skeleton helper
  window.__skel = function skel(el, depth, maxDepth) {
    if (!el || depth > maxDepth) return null;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return null;
    const kids = [...el.children].map((c) => skel(c, depth + 1, maxDepth)).filter(Boolean);
    const node = {
      t: el.tagName.toLowerCase(),
      c: String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className).slice(0, 150),
    };
    if (r.width) node.r = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
    const txt = el.childElementCount === 0 ? (el.innerText || el.value || '').trim().slice(0, 40) : '';
    if (txt) node.x = txt;
    if (el.tagName === 'svg') node.svg = true;
    if (kids.length) node.k = kids;
    return node;
  };
  return out;
})()`;
let r = await call("Runtime.evaluate", { expression: expr, returnByValue: true });
const vars = r.result?.value?.vars || {};
console.log("=== CSS VARS ===");
for (const [k, v] of Object.entries(vars)) console.log(`${k} = ${v}`);
console.log("=== SKELETON READY ===");
ws.close();
process.exit(0);
