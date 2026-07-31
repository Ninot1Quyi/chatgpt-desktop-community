// Evaluate a JavaScript expression in the main renderer target.
//
// Examples:
//   node _analysis/cdp-eval.mjs --port 9222 --expression "innerWidth"
//   node _analysis/cdp-eval.mjs --port 9222 \
//     --expression "localStorage.setItem('ui.sidebarWidth', '320'); location.reload(); true"

function option(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const port = Number(option("port", 9222));
const expression = option("expression");
if (!expression) throw new Error("Provide --expression");

const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
const pages = targets.filter((target) => target.type === "page");
const page = pages.find((target) => target.url === "app://-/index.html")
  || pages.find((target) => !target.url.includes("window="))
  || pages[0];
if (!page) throw new Error(`No page target found on CDP port ${port}`);

const socket = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolveOpen, rejectOpen) => {
  socket.onopen = resolveOpen;
  socket.onerror = rejectOpen;
});

let sequence = 0;
const pending = new Map();
socket.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const operation = pending.get(message.id);
  pending.delete(message.id);
  if (message.error) operation.reject(new Error(JSON.stringify(message.error)));
  else operation.resolve(message.result);
};

const call = (method, params = {}) => new Promise((resolveCall, rejectCall) => {
  const id = ++sequence;
  pending.set(id, { resolve: resolveCall, reject: rejectCall });
  socket.send(JSON.stringify({ id, method, params }));
});

const evaluated = await call("Runtime.evaluate", {
  expression,
  awaitPromise: true,
  returnByValue: true,
});
if (evaluated.exceptionDetails) {
  throw new Error(evaluated.exceptionDetails.exception?.description || evaluated.exceptionDetails.text);
}
console.log(JSON.stringify(evaluated.result?.value, null, 2));
socket.close();
