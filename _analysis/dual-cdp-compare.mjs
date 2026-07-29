// Keep the official app and the replica at the same CSS viewport, then capture
// comparable screenshots and a compact computed-style manifest.
//
// Usage:
//   node _analysis/dual-cdp-compare.mjs
//   node _analysis/dual-cdp-compare.mjs --width 1280 --height 820 --out /tmp/ui-parity

import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { execFileSync } from "node:child_process";

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const width = Number(option("width", 1280));
const height = Number(option("height", 820));
const originalPort = Number(option("original", 9223));
const replicaPort = Number(option("replica", 9222));
const outputDir = resolve(option("out", "_analysis/dual-cdp-latest"));
const clickText = option("click-text", "");
const settleMs = Number(option("settle", 500));

mkdirSync(outputDir, { recursive: true });

function processIdForPort(port) {
  const lines = execFileSync("ps", ["-axo", "pid=,command="], { encoding: "utf8" }).split("\n");
  const candidates = lines.filter((line) =>
    line.includes(`--remote-debugging-port=${port}`)
    && !line.includes(" Helper ")
    && !line.includes(" --type="));
  const native = candidates.find((line) => line.includes(".app/Contents/MacOS/"));
  const match = native || candidates[0];
  const pid = Number(match?.trim().match(/^(\d+)/)?.[1]);
  if (!pid) throw new Error(`Could not find the app process for CDP port ${port}`);
  return pid;
}

function resizeWithAccessibility(pid, targetWidth, targetHeight) {
  const source = [
    'tell application "System Events"',
    `tell (first process whose unix id is ${pid})`,
    `set size of first window to {${targetWidth}, ${targetHeight}}`,
    "end tell",
    "end tell",
  ].join("\n");
  execFileSync("osascript", ["-e", source], { stdio: "pipe" });
}

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

async function connect(port, preferredUrl) {
  const [targets, version] = await Promise.all([
    fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json()),
    fetch(`http://127.0.0.1:${port}/json/version`).then((response) => response.json()),
  ]);
  const pages = targets.filter((target) => target.type === "page");
  const page = pages.find((target) => target.url === preferredUrl)
    || pages.find((target) => !target.url.includes("window="))
    || pages[0];
  if (!page) throw new Error(`No page target found on CDP port ${port}`);

  const pageChannel = await openChannel(page.webSocketDebuggerUrl);
  const browserChannel = await openChannel(version.webSocketDebuggerUrl);
  return {
    page,
    socket: pageChannel.socket,
    call: pageChannel.call,
    browserSocket: browserChannel.socket,
    browserCall: browserChannel.call,
  };
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

async function viewport(client) {
  return evaluate(client, `({
    innerWidth,
    innerHeight,
    outerWidth,
    outerHeight,
    devicePixelRatio,
  })`);
}

async function clickExactText(client, text) {
  if (!text) return null;
  const literal = JSON.stringify(text);
  return evaluate(client, `(() => {
    const candidates = [...document.querySelectorAll("*")]
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return (element.innerText || "").trim() === ${literal}
          && rect.width > 0
          && rect.height > 0
          && rect.bottom >= 0
          && rect.right >= 0
          && rect.top <= innerHeight
          && rect.left <= innerWidth;
      })
      .sort((a, b) => {
        const ar = a.getBoundingClientRect();
        const br = b.getBoundingClientRect();
        return ar.width * ar.height - br.width * br.height;
      });
    const leaf = candidates[0];
    if (!leaf) return null;
    const target = leaf.closest("button, a, [role=button], [role=link]") || leaf;
    const rect = target.getBoundingClientRect();
    target.click();
    return {
      tag: target.tagName,
      text: (target.innerText || "").trim().slice(0, 160),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
    };
  })()`);
}

async function equalize(client, targetWidth, targetHeight, pid) {
  let windowInfo;
  try {
    windowInfo = await client.browserCall("Browser.getWindowForTarget", {
      targetId: client.page.id,
    });
  } catch (error) {
    if (
      !error.message.includes("Browser window not found")
      && !error.message.includes("wasn't found")
    ) throw error;
    const current = await viewport(client);
    if (
      current.innerWidth === targetWidth
      && current.innerHeight === targetHeight
    ) return current;
    resizeWithAccessibility(pid, targetWidth, targetHeight);
    await new Promise((resolveWait) => setTimeout(resolveWait, 180));
    return viewport(client);
  }

  const { windowId, bounds } = windowInfo;
  if (bounds.windowState !== "normal") {
    await client.browserCall("Browser.setWindowBounds", {
      windowId,
      bounds: { windowState: "normal" },
    });
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const current = await viewport(client);
    const nextWidth = Math.max(320, Math.round((bounds.width || current.outerWidth) + targetWidth - current.innerWidth));
    const nextHeight = Math.max(240, Math.round((bounds.height || current.outerHeight) + targetHeight - current.innerHeight));
    await client.browserCall("Browser.setWindowBounds", {
      windowId,
      bounds: {
        width: nextWidth,
        height: nextHeight,
      },
    });
    await new Promise((resolveWait) => setTimeout(resolveWait, 180));
    const measured = await viewport(client);
    if (measured.innerWidth === targetWidth && measured.innerHeight === targetHeight) return measured;
    bounds.width = nextWidth;
    bounds.height = nextHeight;
  }

  return viewport(client);
}

async function manifest(client) {
  return evaluate(client, `(() => {
    const describe = (element) => {
      const rect = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      return {
        tag: element.tagName,
        text: (element.innerText || element.getAttribute("aria-label") || "").trim().slice(0, 120),
        rect: {
          x: Math.round(rect.x * 100) / 100,
          y: Math.round(rect.y * 100) / 100,
          width: Math.round(rect.width * 100) / 100,
          height: Math.round(rect.height * 100) / 100,
        },
        color: style.color,
        background: style.backgroundColor,
        border: style.border,
        radius: style.borderRadius,
        font: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        appRegion: style.webkitAppRegion,
        transition: style.transition,
        animation: style.animation,
      };
    };

    const visible = [...document.querySelectorAll(
      "header, button, input, textarea, [role=button], [role=tab], .app-drag, .app-no-drag",
    )].filter((element) => {
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0
        && rect.bottom >= 0 && rect.right >= 0
        && rect.top <= innerHeight && rect.left <= innerWidth;
    });

    return {
      viewport: {
        innerWidth,
        innerHeight,
        outerWidth,
        outerHeight,
        devicePixelRatio,
      },
      root: describe(document.documentElement),
      body: describe(document.body),
      controls: visible.slice(0, 300).map(describe),
      animations: document.getAnimations().map((animation) => {
        const timing = animation.effect?.getComputedTiming?.() || {};
        return {
          playState: animation.playState,
          currentTime: animation.currentTime,
          duration: timing.duration,
          delay: timing.delay,
          easing: timing.easing,
          progress: timing.progress,
          target: animation.effect?.target ? describe(animation.effect.target) : null,
        };
      }),
    };
  })()`);
}

async function capture(client, name) {
  await client.call("Page.bringToFront");
  const image = await client.call("Page.captureScreenshot", {
    format: "png",
    captureBeyondViewport: false,
  });
  writeFileSync(resolve(outputDir, `${name}.png`), Buffer.from(image.data, "base64"));
  writeFileSync(
    resolve(outputDir, `${name}.json`),
    `${JSON.stringify(await manifest(client), null, 2)}\n`,
  );
}

const original = await connect(originalPort, "app://-/index.html");
const replica = await connect(replicaPort, "http://localhost:5175/index.html");
const originalPid = Number(option("original-pid", 0)) || processIdForPort(originalPort);
const replicaPid = Number(option("replica-pid", 0)) || processIdForPort(replicaPort);

try {
  const originalViewport = await equalize(original, width, height, originalPid);
  const replicaViewport = await equalize(replica, width, height, replicaPid);
  const clicked = clickText
    ? {
        official: await clickExactText(original, clickText),
        replica: await clickExactText(replica, clickText),
      }
    : null;
  if (clickText) await new Promise((resolveWait) => setTimeout(resolveWait, settleMs));
  await capture(original, "official");
  await capture(replica, "replica");

  const summary = {
    requested: { width, height },
    official: originalViewport,
    replica: replicaViewport,
    clicked,
    exactMatch:
      originalViewport.innerWidth === replicaViewport.innerWidth
      && originalViewport.innerHeight === replicaViewport.innerHeight
      && originalViewport.innerWidth === width
      && originalViewport.innerHeight === height,
  };
  writeFileSync(resolve(outputDir, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  console.log(JSON.stringify(summary, null, 2));
  if (!summary.exactMatch) process.exitCode = 2;
} finally {
  original.socket.close();
  original.browserSocket.close();
  replica.socket.close();
  replica.browserSocket.close();
}
