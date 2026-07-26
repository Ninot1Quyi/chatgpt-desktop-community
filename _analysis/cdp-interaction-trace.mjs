// Record a real CDP hover, click, drag, or scroll interaction as high-frequency style/layout samples
// plus key-frame screenshots.
// Usage:
//   node _analysis/cdp-interaction-trace.mjs <port> <selector> <hover|click|drag|scroll> <out.json> [settleMs] [distance] [first|last]

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, extname, basename, join } from "node:path";

const port = Number(process.argv[2] || 9223);
const selector = process.argv[3];
const action = process.argv[4] || "hover";
const out = process.argv[5] || `_analysis/interaction-${port}-${action}.json`;
const settleMs = Number(process.argv[6] || 400);
const distance = Number(process.argv[7] || (action === "scroll" ? 240 : 96));
const match = process.argv[8] === "last" ? "last" : "first";
const targetExpression = match === "last"
  ? `[...document.querySelectorAll(${JSON.stringify(selector)})].at(-1)`
  : `document.querySelector(${JSON.stringify(selector)})`;

if (!selector || !["hover", "click", "drag", "scroll"].includes(action)) {
  throw new Error("Expected: <port> <selector> <hover|click|drag|scroll> <out.json> [settleMs] [distance]");
}

const targets = await fetch(`http://127.0.0.1:${port}/json`).then((r) => r.json());
const page = targets.find((t) => t.type === "page" && t.url === "app://-/index.html")
  || targets.find((t) => t.type === "page" && t.url.endsWith("/index.html"))
  || targets.find((t) => t.type === "page" && !t.url.includes("window="));
if (!page) throw new Error(`No page target on ${port}`);

const ws = new WebSocket(page.webSocketDebuggerUrl);
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});

let seq = 0;
const pending = new Map();
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (!message.id || !pending.has(message.id)) return;
  const { resolve, reject } = pending.get(message.id);
  pending.delete(message.id);
  message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
};
const call = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++seq;
  pending.set(id, { resolve, reject });
  ws.send(JSON.stringify({ id, method, params }));
});
const dispatchMouse = (params) => {
  ws.send(JSON.stringify({ id: ++seq, method: "Input.dispatchMouseEvent", params }));
};
const dispatchMouseAsync = dispatchMouse;
const evaluate = async (expression) => {
  const result = await call("Runtime.evaluate", {
    expression,
    returnByValue: true,
    awaitPromise: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result?.value;
};
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

mkdirSync(dirname(out), { recursive: true });
const stem = basename(out, extname(out));
const frameDir = join(dirname(out), `${stem}-frames`);
mkdirSync(frameDir, { recursive: true });
const screenshot = async (name) => {
  const shot = await call("Page.captureScreenshot", { format: "png" });
  const path = join(frameDir, `${name}.png`);
  writeFileSync(path, Buffer.from(shot.data, "base64"));
  return path;
};

await call("Page.bringToFront");
await evaluate(`(() => {
  const el = ${targetExpression};
  if (!el) return false;
  el.scrollIntoView({ block: "center", inline: "nearest" });
  return true;
})()`);
await wait(50);
const readTarget = () => evaluate(`(() => {
  const el = ${targetExpression};
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: r.x + r.width / 2, y: r.y + r.height / 2, rect: [r.x, r.y, r.width, r.height] };
})()`);
let target = await readTarget();
if (!target) throw new Error(`Selector not found: ${selector}`);

await evaluate(`(() => {
  window.__cdpInteractionTrace?.cleanup?.();
  const el = ${targetExpression};
  if (!el) return false;
  const events = [];
  const mutations = [];
  const eventTypes = [
    "pointerover", "pointerenter", "pointerdown", "pointerup", "pointerout", "pointerleave",
    "pointermove", "mouseover", "mouseenter", "mousedown", "mouseup", "mousemove", "click",
    "mouseout", "mouseleave", "wheel", "scroll",
  ];
  const onEvent = (event) => {
    const eventTarget = event.target instanceof Element ? event.target : null;
    events.push({
      type: event.type,
      at: performance.now(),
      button: event.button,
      buttons: event.buttons,
      detail: event.detail,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      inside: event.composedPath().includes(window.__cdpInteractionTrace?.el || el),
      target: eventTarget
        ? [eventTarget.tagName.toLowerCase(), eventTarget.getAttribute("role"), eventTarget.getAttribute("aria-label")]
        : ["text", null, null],
    });
  };
  eventTypes.forEach((type) => document.addEventListener(type, onEvent, true));
  const observer = new MutationObserver((records) => {
    const at = performance.now();
    for (const record of records) {
      mutations.push({
        at,
        type: record.type,
        attributeName: record.attributeName,
        target: record.target instanceof Element
          ? [record.target.tagName.toLowerCase(), record.target.getAttribute("role"), record.target.getAttribute("aria-label")]
          : ["text", null, null],
        added: [...record.addedNodes].slice(0, 4).map((node) =>
          node instanceof Element
            ? [node.tagName.toLowerCase(), node.getAttribute("role"), (node.textContent || "").trim().slice(0, 80)]
            : ["text", null, (node.textContent || "").trim().slice(0, 80)]
        ),
        removed: [...record.removedNodes].slice(0, 4).map((node) =>
          node instanceof Element
            ? [node.tagName.toLowerCase(), node.getAttribute("role"), (node.textContent || "").trim().slice(0, 80)]
            : ["text", null, (node.textContent || "").trim().slice(0, 80)]
        ),
      });
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["aria-expanded", "aria-pressed", "data-state", "class", "style"],
  });
  window.__cdpInteractionTrace = {
    el,
    events,
    mutations,
    cleanup() {
      clearInterval(window.__cdpInteractionTrace?.pin);
      eventTypes.forEach((type) => document.removeEventListener(type, onEvent, true));
      observer.disconnect();
    },
  };
  return true;
})()`);

const snapshotExpression = `(() => {
  const el = window.__cdpInteractionTrace?.el || ${targetExpression};
  if (!el) return { missing: true };
  const rect = (node) => {
    const r = node.getBoundingClientRect();
    return [r.x, r.y, r.width, r.height];
  };
  const cs = getComputedStyle(el);
  return {
    at: performance.now(),
    connected: el.isConnected,
    hover: el.matches(":hover"),
    active: el.matches(":active"),
    ariaExpanded: el.getAttribute("aria-expanded"),
    ariaPressed: el.getAttribute("aria-pressed"),
    rect: rect(el),
    scroll: {
      window: [window.scrollX, window.scrollY],
      target: [el.scrollLeft, el.scrollTop, el.scrollWidth, el.scrollHeight, el.clientWidth, el.clientHeight],
      ancestors: [...function* () {
        for (let node = el.parentElement; node; node = node.parentElement) {
          if (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth) yield node;
        }
      }()].slice(0, 8).map((node) => ({
        tag: node.tagName.toLowerCase(),
        rect: rect(node),
        scroll: [node.scrollLeft, node.scrollTop],
        size: [node.scrollWidth, node.scrollHeight, node.clientWidth, node.clientHeight],
      })),
    },
    style: {
      display: cs.display,
      visibility: cs.visibility,
      opacity: cs.opacity,
      color: cs.color,
      backgroundColor: cs.backgroundColor,
      borderColor: cs.borderColor,
      borderRadius: cs.borderRadius,
      boxShadow: cs.boxShadow,
      transform: cs.transform,
      transitionProperty: cs.transitionProperty,
      transitionDuration: cs.transitionDuration,
      transitionTimingFunction: cs.transitionTimingFunction,
      animationName: cs.animationName,
      animationDuration: cs.animationDuration,
      animationTimingFunction: cs.animationTimingFunction,
    },
    icons: [...el.querySelectorAll("svg")].map((svg) => {
      const scs = getComputedStyle(svg);
      return {
        display: scs.display,
        opacity: scs.opacity,
        transform: scs.transform,
        rotate: scs.rotate,
        scale: scs.scale,
        translate: scs.translate,
        transitionProperty: scs.transitionProperty,
        transitionDuration: scs.transitionDuration,
        transitionTimingFunction: scs.transitionTimingFunction,
        rect: rect(svg),
        viewBox: svg.getAttribute("viewBox"),
        paths: [...svg.querySelectorAll("path")].map((path) => path.getAttribute("d")),
      };
    }),
    siblings: [...(el.parentElement?.children || [])]
      .filter((node) => node !== el)
      .map((node) => {
        const style = getComputedStyle(node);
        return {
          rect: rect(node),
          opacity: style.opacity,
          overflow: style.overflow,
          pointerEvents: style.pointerEvents,
          transitionProperty: style.transitionProperty,
          transitionDuration: style.transitionDuration,
          transitionTimingFunction: style.transitionTimingFunction,
        };
      }),
    overlays: [...document.querySelectorAll('[role="menu"], [role="dialog"], [role="listbox"]')].map((node) => ({
      role: node.getAttribute("role"),
      rect: rect(node),
      text: node.innerText.slice(0, 160),
      items: [...node.querySelectorAll('[role="menuitem"], [role="option"]')].map((item) => {
        const style = getComputedStyle(item);
        return {
          rect: rect(item),
          text: item.innerText.slice(0, 160),
          style: {
            padding: style.padding,
            font: style.font,
            color: style.color,
            backgroundColor: style.backgroundColor,
            borderRadius: style.borderRadius,
          },
          icons: [...item.querySelectorAll("svg")].map((svg) => {
            const iconStyle = getComputedStyle(svg);
            return {
              rect: rect(svg),
              color: iconStyle.color,
              opacity: iconStyle.opacity,
              fill: iconStyle.fill,
              stroke: iconStyle.stroke,
              strokeWidth: iconStyle.strokeWidth,
              viewBox: svg.getAttribute("viewBox"),
              paths: [...svg.querySelectorAll("path")].map((path) => path.getAttribute("d")),
            };
          }),
        };
      }),
    })),
    stateNodes: [...document.querySelectorAll('[aria-expanded], [aria-pressed], [data-state]')]
      .filter((node) => {
        const style = getComputedStyle(node);
        return style.display !== "none" && style.visibility !== "hidden";
      })
      .slice(0, 40)
      .map((node) => ({
        tag: node.tagName.toLowerCase(),
        ariaLabel: node.getAttribute("aria-label"),
        ariaExpanded: node.getAttribute("aria-expanded"),
        ariaPressed: node.getAttribute("aria-pressed"),
        dataState: node.getAttribute("data-state"),
        rect: rect(node),
      })),
    trackedNodes: [...document.querySelectorAll(
      '[data-model-picker-power-slider], [data-model-picker-power-slider] *, [data-model-picker-view-toggle]'
    )].map((node) => {
      const style = getComputedStyle(node);
      return {
        tag: node.tagName.toLowerCase(),
        className: typeof node.className === "string" ? node.className.split(" ")[0] : "",
        rect: rect(node),
        opacity: style.opacity,
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        transform: style.transform,
        transitionProperty: style.transitionProperty,
        transitionDuration: style.transitionDuration,
        transitionTimingFunction: style.transitionTimingFunction,
      };
    }),
    dynamicLayers: [...document.querySelectorAll('*')]
      .filter((node) => {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const r = node.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && (
          style.position === "fixed"
          || ["menu", "dialog", "listbox", "tooltip"].includes(node.getAttribute("role"))
        );
      })
      .slice(-30)
      .map((node) => {
        const style = getComputedStyle(node);
        return {
          tag: node.tagName.toLowerCase(),
          role: node.getAttribute("role"),
          ariaLabel: node.getAttribute("aria-label"),
          rect: rect(node),
          text: (node.innerText || "").trim().slice(0, 160),
          style: {
            opacity: style.opacity,
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            borderRadius: style.borderRadius,
            boxShadow: style.boxShadow,
            transform: style.transform,
            transitionDuration: style.transitionDuration,
            transitionTimingFunction: style.transitionTimingFunction,
            animationName: style.animationName,
            animationDuration: style.animationDuration,
            animationTimingFunction: style.animationTimingFunction,
            zIndex: style.zIndex,
          },
        };
      }),
  };
})()`;
const samples = [];
const takeSample = async (phase) => {
  const snapshot = await evaluate(snapshotExpression);
  samples.push({
    phase,
    ...snapshot,
  });
};
const sampleFor = async (phase, durationMs) => {
  const until = performance.now() + durationMs;
  do {
    await takeSample(phase);
    const remaining = until - performance.now();
    if (remaining > 0) await wait(Math.min(8, remaining));
  } while (performance.now() < until);
  await takeSample(phase);
};

const eventCount = () => evaluate("window.__cdpInteractionTrace?.events.length || 0");
const waitForEvent = async (types, since, timeoutMs = 7000, insideOnly = false) => {
  const expected = Array.isArray(types) ? types : [types];
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    const event = await evaluate(`window.__cdpInteractionTrace?.events
      .slice(${since})
      .find((entry) => ${JSON.stringify(expected)}.includes(entry.type) && (${!insideOnly} || entry.inside)) || null`);
    if (event) return event;
    await wait(8);
  }
  return null;
};
const phases = [];
const markPhase = (phase, event) => {
  phases.push({
    phase,
    event: event?.type || null,
    at: event?.at ?? null,
    missing: !event,
  });
  return event;
};

await dispatchMouse({ type: "mouseMoved", x: 4, y: 4, buttons: 0 });
await wait(40);
const frames = { before: await screenshot("00-before") };
await sampleFor("before", 24);
await evaluate(`(() => {
  const el = ${targetExpression};
  if (!el || !window.__cdpInteractionTrace) return false;
  window.__cdpInteractionTrace.el = el;
  el.scrollIntoView({ block: "center", inline: "nearest" });
  return true;
})()`);
await wait(20);
target = await readTarget();
if (!target) throw new Error(`Selector disconnected before interaction: ${selector}`);
let since = await eventCount();
dispatchMouseAsync({
  type: "mouseMoved",
  x: target.x,
  y: target.y,
  buttons: 0,
});
const entered = markPhase("enter", await waitForEvent(["pointerover", "mouseover", "pointermove", "mousemove"], since, 7000, true));
if (!entered) throw new Error("Pointer never reached the target");

if (action === "click" || action === "drag") {
  await sampleFor("enter", 20);
  since = await eventCount();
  dispatchMouseAsync({
    type: "mousePressed",
    x: target.x,
    y: target.y,
    button: "left",
    buttons: 1,
    clickCount: 1,
    pointerType: "mouse",
  });
  markPhase("pressed", await waitForEvent(["pointerdown", "mousedown"], since, 7000, true));
  await sampleFor("pressed", 40);
  if (action === "drag") {
    const steps = 12;
    for (let step = 1; step <= steps; step += 1) {
      dispatchMouseAsync({
        type: "mouseMoved",
        x: target.x + distance * step / steps,
        y: target.y,
        button: "left",
        buttons: 1,
        pointerType: "mouse",
      });
      await sampleFor("dragging", 8);
    }
  }
  since = await eventCount();
  dispatchMouseAsync({
    type: "mouseReleased",
    x: target.x + (action === "drag" ? distance : 0),
    y: target.y,
    button: "left",
    buttons: 0,
    clickCount: 1,
    pointerType: "mouse",
  });
  markPhase("released", await waitForEvent(["pointerup", "mouseup"], since, 7000, true));
  if (action === "click") markPhase("click", await waitForEvent("click", since, 7000, true));
  await sampleFor("released", settleMs);
} else if (action === "scroll") {
  await sampleFor("enter", 20);
  since = await eventCount();
  dispatchMouseAsync({
    type: "mouseWheel",
    x: target.x,
    y: target.y,
    deltaX: 0,
    deltaY: distance,
    buttons: 0,
    pointerType: "mouse",
  });
  markPhase("wheel", await waitForEvent("wheel", since));
  await sampleFor("scroll", settleMs);
} else {
  await sampleFor("enter", settleMs);
  since = await eventCount();
  dispatchMouseAsync({ type: "mouseMoved", x: 4, y: 4, buttons: 0 });
  markPhase("leave", await waitForEvent(["pointerout", "mouseout"], since));
  await sampleFor("leave", settleMs);
}

// Capture key frames after the timing trace so Page.captureScreenshot cannot
// stall rendering and corrupt the measured duration.
if (action !== "hover") {
  frames.settled = await screenshot("01-settled");
} else {
  await dispatchMouse({ type: "mouseMoved", x: 4, y: 4, buttons: 0 });
  await wait(40);
  await evaluate(`(() => {
    const el = ${targetExpression};
    if (!el || !window.__cdpInteractionTrace) return false;
    window.__cdpInteractionTrace.el = el;
    el.scrollIntoView({ block: "center", inline: "nearest" });
    return true;
  })()`);
  await wait(20);
  target = await readTarget();
  if (!target) throw new Error(`Selector disconnected before key frames: ${selector}`);
  await evaluate(`(() => {
    clearInterval(window.__cdpInteractionTrace?.pin);
    window.__cdpInteractionTrace.pin = setInterval(() => {
      const el = ${targetExpression};
      if (el) el.scrollIntoView({ block: "center", inline: "nearest" });
    }, 16);
  })()`);
  await dispatchMouse({
    type: "mouseMoved",
    x: target.x,
    y: target.y,
    buttons: 0,
  });
  await wait(20);
  frames.enter = await screenshot("01-enter");
  await wait(settleMs);
  frames.hover = await screenshot("02-hover");
  await dispatchMouse({ type: "mouseMoved", x: 4, y: 4, buttons: 0 });
  await wait(settleMs);
  frames.leave = await screenshot("03-leave");
  await evaluate("clearInterval(window.__cdpInteractionTrace?.pin)");
}
const trace = await evaluate(`(() => ({
  events: window.__cdpInteractionTrace?.events || [],
  mutations: window.__cdpInteractionTrace?.mutations || [],
}))()`);
const originAt = entered.at;
for (const sample of samples) sample.t = sample.at - originAt;
for (const phase of phases) phase.t = phase.at == null ? null : phase.at - originAt;
for (const event of trace.events) event.t = event.at - originAt;
for (const mutation of trace.mutations) mutation.t = mutation.at - originAt;
await evaluate("window.__cdpInteractionTrace?.cleanup?.()");
const result = {
  port,
  url: page.url,
  selector,
  action,
  settleMs,
  distance,
  target: target.rect,
  frames,
  phases,
  events: trace.events,
  mutations: trace.mutations,
  samples,
};
writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({
  out,
  frames: Object.keys(frames),
  phases,
  samples: samples.length,
  durationMs: samples.at(-1)?.t ?? 0,
}));
ws.close();
