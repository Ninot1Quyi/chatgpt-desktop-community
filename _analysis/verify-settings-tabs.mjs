// Verify every Settings tab renders non-empty, placeholder-free content.
// Opens Settings via a synthetic Ctrl+, keydown, then clicks each nav item.
const targets = await fetch("http://localhost:9222/json").then((r) => r.json());
const page = targets.find((t) => t.type === "page" && t.url.endsWith("index.html")) || targets.find((t) => t.type === "page");
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
const evaluate = async (expression) => {
  const r = await call("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.text + " " + (r.exceptionDetails.exception?.description || ""));
  return r.result?.value;
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Open settings (bubble-phase keydown like a real Ctrl+, press).
await evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: ",", ctrlKey: true, bubbles: true })), "sent"`);
await sleep(700);

const open = await evaluate(`!!document.querySelector("h1")`);
if (!open) { console.log("FAIL: settings did not open"); process.exit(1); }

const tabs = ["General","Profile","Appearance","Voice","Configuration","Personalization","Pets","Keyboard shortcuts","Usage & billing","Appshots","Plugins","Browser","Computer use","Hooks","Connections","Git","Environments","Worktrees","Archived chats"];
let failures = 0;
for (const tab of tabs) {
  const res = await evaluate(`(() => {
    const btns = [...document.querySelectorAll("nav button")];
    const btn = btns.find((b) => b.textContent.trim() === ${JSON.stringify(tab)});
    if (!btn) return { error: "nav item not found" };
    btn.click();
    return { ok: true };
  })()`);
  if (res.error) { console.log(`FAIL ${tab}: ${res.error}`); failures++; continue; }
  // Poll until the content text stabilizes (async rpc-backed sections).
  let check = null;
  let prevLen = -1;
  for (let i = 0; i < 24; i++) {
    await sleep(500);
    check = await evaluate(`(() => {
      const h1 = document.querySelector("h1");
      const content = h1?.parentElement;
      const text = content?.innerText || "";
      return {
        title: h1?.textContent || "",
        len: text.length,
        hasPlaceholder: text.includes("Not available in this build"),
        snippet: text.slice(0, 90).replace(/\\n/g, " | "),
      };
    })()`);
    if (check.len > 7 && check.len === prevLen) break;
    prevLen = check.len;
  }
  const bad = !check.len || check.hasPlaceholder || check.title !== tab;
  if (bad) failures++;
  console.log(`${bad ? "FAIL" : "ok  "} ${tab} (len=${check.len}) :: ${check.snippet}`);
}
// Close settings.
await evaluate(`window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })), "sent"`);
console.log(failures === 0 ? "ALL TABS OK" : `${failures} TAB(S) FAILED`);
ws.close();
process.exit(failures === 0 ? 0 : 1);
