// Exercise one visible CDP target with a real mouse event and report its
// geometry/styles before and after the interaction.
//
// Examples:
//   node _analysis/cdp-interact.mjs --port 9222 --click-label "Close Review tab"
//   node _analysis/cdp-interact.mjs --port 9223 --hover-text "Edited files"
//   node _analysis/cdp-interact.mjs --port 9223 --selector ".markdown code" --action hover
//   node _analysis/cdp-interact.mjs --port 9222 --drag-selector ".cursor-col-resize" --dx -8

function option(name, fallback = "") {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const port = Number(option("port", 9222));
const clickText = option("click-text");
const clickLabel = option("click-label");
const hoverText = option("hover-text");
const selector = option("selector");
const dragSelector = option("drag-selector");
const selectorAction = option("action", "hover");
const targetIndex = Math.max(0, Number(option("index", 0)) || 0);
const dragX = Number(option("dx", 0));
const dragY = Number(option("dy", 0));
const waitMs = Number(option("wait", 350));

if (![clickText, clickLabel, hoverText, selector, dragSelector].filter(Boolean).length) {
  throw new Error("Provide --click-text, --click-label, --hover-text, --selector, or --drag-selector");
}

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

async function evaluate(expression) {
  const result = await call("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result?.value;
}

function locatorExpression(kind, value) {
  const literal = JSON.stringify(value);
  if (kind === "selector") {
    return `[...document.querySelectorAll(${literal})]`;
  }
  if (kind === "label") {
    return `[...document.querySelectorAll("[aria-label]")].filter((element) =>
      element.getAttribute("aria-label") === ${literal})`;
  }
  return `[...document.querySelectorAll("*")].filter((element) =>
    (element.innerText || "").trim() === ${literal})`;
}

async function locate(kind, value) {
  return evaluate(`(() => {
    const visible = ${locatorExpression(kind, value)}
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
    const leaf = visible[${targetIndex}];
    if (!leaf) return null;
    const target = leaf.closest("button, a, [role=button], [role=link]") || leaf;
    const rect = target.getBoundingClientRect();
    const style = getComputedStyle(target);
    const ancestors = [];
    for (let element = target.parentElement; element && ancestors.length < 5; element = element.parentElement) {
      const parentRect = element.getBoundingClientRect();
      const parentStyle = getComputedStyle(element);
      ancestors.push({
        tag: element.tagName,
        className: element.className || "",
        rect: {
          x: parentRect.x,
          y: parentRect.y,
          width: parentRect.width,
          height: parentRect.height,
        },
        style: {
          display: parentStyle.display,
          gap: parentStyle.gap,
          padding: parentStyle.padding,
          maxWidth: parentStyle.maxWidth,
          fontSize: parentStyle.fontSize,
          lineHeight: parentStyle.lineHeight,
        },
      });
    }
    return {
      tag: target.tagName,
      text: (target.innerText || target.getAttribute("aria-label") || "").trim().slice(0, 160),
      rect: { x: rect.x, y: rect.y, width: rect.width, height: rect.height },
      style: {
        color: style.color,
        background: style.backgroundColor,
        border: style.border,
        borderRadius: style.borderRadius,
        boxShadow: style.boxShadow,
        fontFamily: style.fontFamily,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        lineHeight: style.lineHeight,
        letterSpacing: style.letterSpacing,
        padding: style.padding,
        cursor: style.cursor,
        appRegion: style.webkitAppRegion,
        transition: style.transition,
        animation: style.animation,
      },
      ancestors,
    };
  })()`);
}

const kind = (dragSelector || selector) ? "selector" : clickLabel ? "label" : "text";
const value = dragSelector || selector || clickLabel || clickText || hoverText;
const action = dragSelector ? "drag" : selector ? selectorAction : hoverText ? "hover" : "click";
const before = await locate(kind, value);
if (!before) throw new Error(`Could not find visible ${kind}: ${value}`);

const x = before.rect.x + before.rect.width / 2;
const y = before.rect.y + before.rect.height / 2;
await call("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
if (action === "click") {
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
} else if (action === "drag") {
  await call("Input.dispatchMouseEvent", {
    type: "mousePressed",
    x,
    y,
    button: "left",
    clickCount: 1,
  });
  const steps = 6;
  for (let step = 1; step <= steps; step++) {
    await call("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x: x + dragX * step / steps,
      y: y + dragY * step / steps,
      button: "left",
      buttons: 1,
    });
  }
  await call("Input.dispatchMouseEvent", {
    type: "mouseReleased",
    x: x + dragX,
    y: y + dragY,
    button: "left",
    clickCount: 1,
  });
}
await new Promise((resolveWait) => setTimeout(resolveWait, waitMs));

const after = await locate(kind, value);
const animations = await evaluate(`document.getAnimations().map((animation) => {
  const effect = animation.effect;
  const target = effect?.target;
  return {
    playState: animation.playState,
    currentTime: animation.currentTime,
    duration: effect?.getTiming?.().duration,
    easing: effect?.getTiming?.().easing,
    target: target ? {
      tag: target.tagName,
      className: target.className || "",
      text: (target.innerText || "").trim().slice(0, 80),
    } : null,
  };
}).slice(0, 40)`);
console.log(JSON.stringify({
  port,
  action,
  locator: { kind, value },
  before,
  after,
  animations,
}, null, 2));
await new Promise((resolveClose) => {
  const timeout = setTimeout(resolveClose, 250);
  socket.addEventListener("close", () => {
    clearTimeout(timeout);
    resolveClose();
  }, { once: true });
  socket.close();
});
