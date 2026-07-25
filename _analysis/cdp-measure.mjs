// Dump resolved custom properties from :root (getComputedStyle) + DOM skeletons of key regions.
// Usage: node cdp-measure.mjs <what>  → vars | skel:<selector>:<depth> | find:<text>
const what = process.argv[2] || "vars";
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

let expr;
if (what === "vars") {
  expr = `
  (() => {
    const cs = getComputedStyle(document.documentElement);
    const out = {};
    for (let i = 0; i < cs.length; i++) {
      const p = cs[i];
      if (p.startsWith('--')) out[p] = cs.getPropertyValue(p).trim();
    }
    return out;
  })()`;
} else if (what.startsWith("skel:")) {
  const [, sel, depth] = what.split(":");
  expr = `
  (() => {
    const el = document.querySelector(${JSON.stringify(sel)});
    if (!el) return 'NO_EL ' + ${JSON.stringify(sel)};
    function skel(el, depth, maxDepth) {
      if (!el || depth > maxDepth) return null;
      const r = el.getBoundingClientRect();
      if ((r.width === 0 && r.height === 0) || r.bottom < 0 || r.top > innerHeight) return null;
      const kids = [...el.children].map((c) => skel(c, depth + 1, maxDepth)).filter(Boolean);
      const node = { t: el.tagName.toLowerCase() };
      const cls = String(el.className && el.className.baseVal !== undefined ? el.className.baseVal : el.className || '');
      if (cls) node.c = cls.slice(0, 140);
      node.r = [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)];
      const txt = el.childElementCount === 0 ? (el.innerText || '').trim().slice(0, 36) : '';
      if (txt) node.x = txt;
      if (el.tagName === 'SVG' || el.tagName === 'svg') node.svg = 1;
      if (kids.length) node.k = kids;
      return node;
    }
    return skel(el, 0, ${Number(depth) || 8});
  })()`;
} else if (what.startsWith("find:")) {
  const txt = what.slice(5);
  expr = `
  (() => {
    const els = [...document.querySelectorAll('*')].filter((el) => el.childElementCount === 0 && (el.innerText || '').includes(${JSON.stringify(txt)}));
    return els.slice(0, 5).map((el) => {
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return { t: el.tagName, c: String(el.className).slice(0, 100), r: [r.x|0, r.y|0, r.width|0, r.height|0],
        font: cs.font, color: cs.color, bg: cs.backgroundColor, radius: cs.borderRadius, pad: cs.padding };
    });
  })()`;
}
const r = await call("Runtime.evaluate", { expression: expr, returnByValue: true });
if (r.exceptionDetails) console.log("EXC:", r.exceptionDetails.text, (r.exceptionDetails.exception?.description || "").slice(0, 300));
else console.log(JSON.stringify(r.result?.value, null, 1)?.slice(0, 30000));
ws.close();
process.exit(0);
