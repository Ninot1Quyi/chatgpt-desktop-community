#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const HELP = `Usage:
  node _analysis/dual-cdp-action-replay.mjs --steps steps.json --official 9223 --replica 9222 --out /tmp/replay

Step JSON:
  [
    { "action": "click", "text": "Settings" },
    { "action": "hover", "selector": ".composer" },
    { "action": "type", "selector": "textarea", "input": "hello" },
    { "action": "key", "key": "Enter" },
    { "action": "drag", "selector": ".resize", "dx": 80, "dy": 0 },
    { "action": "wait", "ms": 500 }
  ]

Options:
  --steps <file>        JSON action array.
  --official <port>    Official app CDP port. Default: 9223.
  --replica <port>     Replica app CDP port. Default: 9222.
  --out <dir>          Output directory for report and screenshots.
  --preferred-url <url> Prefer a specific page target.
  --settle <ms>        Wait after each action. Default: 250.
  --screenshot         Capture final screenshots.
  --help               Show this help.
`;

function arg(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function flag(name) {
  return process.argv.includes(`--${name}`);
}

if (flag("help")) {
  console.log(HELP);
  process.exit(0);
}

const stepsPath = arg("steps");
if (!stepsPath) throw new Error("Provide --steps");
const officialPort = Number(arg("official", 9223));
const replicaPort = Number(arg("replica", 9222));
const outDir = arg("out", "_analysis/dual-cdp-replay-latest");
const preferredUrl = arg("preferred-url", "app://-/index.html");
const settleMs = Number(arg("settle", 250));
const captureScreenshot = flag("screenshot");
const steps = JSON.parse(readFileSync(stepsPath, "utf8"));
if (!Array.isArray(steps)) throw new Error("--steps must be a JSON array");
mkdirSync(outDir, { recursive: true });

async function openChannel(url) {
  const socket = new WebSocket(url);
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
  return { socket, call };
}

async function connect(port) {
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
  const pages = targets.filter((target) => target.type === "page");
  const page = pages.find((target) => target.url === preferredUrl)
    || pages.find((target) => !target.url.includes("window="))
    || pages[0];
  if (!page) throw new Error(`No page target found on CDP port ${port}`);
  return { ...(await openChannel(page.webSocketDebuggerUrl)), page, port };
}

async function evaluate(client, expression) {
  const result = await client.call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

function locatorExpression(step) {
  if (step.selector) return `[...document.querySelectorAll(${JSON.stringify(step.selector)})]`;
  if (step.label) {
    return `[...document.querySelectorAll("[aria-label]")].filter((element) =>
      element.getAttribute("aria-label") === ${JSON.stringify(step.label)})`;
  }
  if (step.text) {
    return `[...document.querySelectorAll("*")].filter((element) =>
      (element.innerText || "").trim() === ${JSON.stringify(step.text)})`;
  }
  throw new Error(`Step needs selector, label, or text: ${JSON.stringify(step)}`);
}

async function locate(client, step) {
  const index = Math.max(0, Number(step.index || 0));
  return evaluate(client, `(() => {
    const visible = ${locatorExpression(step)}
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0
          && rect.bottom >= 0 && rect.right >= 0
          && rect.top <= innerHeight && rect.left <= innerWidth;
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return ar.width * ar.height - br.width * br.height;
      });
    const leaf = visible[${index}];
    if (!leaf) return null;
    const target = leaf.closest("button, a, input, textarea, [contenteditable=true], [role=button], [role=textbox]") || leaf;
    target.scrollIntoView({ block: "center", inline: "center" });
    const rect = target.getBoundingClientRect();
    return {
      tag: target.tagName,
      text: (target.innerText || target.value || target.getAttribute("aria-label") || "").trim().slice(0, 160),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  })()`);
}

async function mouse(client, type, x, y, extra = {}) {
  await client.call("Input.dispatchMouseEvent", { type, x, y, ...extra });
}

async function key(client, key, text = "") {
  await client.call("Input.dispatchKeyEvent", { type: "keyDown", key, text });
  await client.call("Input.dispatchKeyEvent", { type: "keyUp", key });
}

async function runStep(client, step) {
  if (step.action === "wait") {
    await new Promise((resolveWait) => setTimeout(resolveWait, Number(step.ms || settleMs)));
    return { action: "wait", ms: Number(step.ms || settleMs) };
  }
  if (step.action === "key") {
    await key(client, step.key || "Enter", step.text || "");
    return { action: "key", key: step.key || "Enter" };
  }

  const target = await locate(client, step);
  if (!target) throw new Error(`Could not locate target for ${JSON.stringify(step)}`);
  const x = target.rect.x + target.rect.width / 2;
  const y = target.rect.y + target.rect.height / 2;
  await mouse(client, "mouseMoved", x, y);

  if (step.action === "hover") {
    return { action: "hover", target };
  }
  if (step.action === "drag") {
    await mouse(client, "mousePressed", x, y, { button: "left", clickCount: 1 });
    const dx = Number(step.dx || 0);
    const dy = Number(step.dy || 0);
    const stepsCount = Math.max(2, Number(step.steps || 6));
    for (let index = 1; index <= stepsCount; index += 1) {
      await mouse(client, "mouseMoved", x + dx * index / stepsCount, y + dy * index / stepsCount, {
        button: "left",
        buttons: 1,
      });
    }
    await mouse(client, "mouseReleased", x + dx, y + dy, { button: "left", clickCount: 1 });
    return { action: "drag", target, dx, dy };
  }
  if (step.action === "type") {
    await mouse(client, "mousePressed", x, y, { button: "left", clickCount: 1 });
    await mouse(client, "mouseReleased", x, y, { button: "left", clickCount: 1 });
    await client.call("Input.insertText", { text: String(step.input ?? step.value ?? "") });
    return { action: "type", target, chars: String(step.input ?? step.value ?? "").length };
  }
  if (!step.action || step.action === "click") {
    await mouse(client, "mousePressed", x, y, { button: "left", clickCount: 1 });
    await mouse(client, "mouseReleased", x, y, { button: "left", clickCount: 1 });
    return { action: "click", target };
  }
  throw new Error(`Unsupported action: ${step.action}`);
}

async function replay(client, name) {
  const results = [];
  for (const [index, step] of steps.entries()) {
    const result = await runStep(client, step);
    results.push({ index, ...result });
    await new Promise((resolveWait) => setTimeout(resolveWait, Number(step.settle ?? settleMs)));
  }
  if (captureScreenshot) {
    const image = await client.call("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    writeFileSync(resolve(outDir, `${name}.png`), Buffer.from(image.data, "base64"));
  }
  return results;
}

const official = await connect(officialPort);
const replica = await connect(replicaPort);
try {
  await official.call("Page.bringToFront");
  const officialResults = await replay(official, "official");
  await replica.call("Page.bringToFront");
  const replicaResults = await replay(replica, "replica");
  const report = {
    officialPort,
    replicaPort,
    steps: steps.length,
    official: officialResults,
    replica: replicaResults,
  };
  writeFileSync(resolve(outDir, "replay.json"), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  official.socket.close();
  replica.socket.close();
}
