// Compare reference and replica SVGs by geometry and by same-browser pixels.
// Usage:
//   node _analysis/icon-parity.mjs <manifest.json> [actualPort] [referencePort]
//   node _analysis/icon-parity.mjs --source-fragments|--lucide-catalog|--custom-catalog|--call-site-catalog [actualPort]

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

const manifestPath = process.argv[2];
const actualPort = Number(process.argv[3] || 9222);
const referencePort = process.argv[4] ? Number(process.argv[4]) : null;
if (!manifestPath) throw new Error("Expected: <manifest.json> [actualPort] [referencePort]");

if (manifestPath === "--source-fragments") {
  const originalBundle = readFileSync(
    process.env.ORIGINAL_CHATGPT_ASAR || "/Applications/ChatGPT.app/Contents/Resources/app.asar",
  );
  const files = [];
  const walk = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith(".jsx")) files.push(file);
    }
  };
  walk("renderer/src/components");
  const results = files.flatMap((file) => {
    const source = readFileSync(file, "utf8");
    return [...source.matchAll(/\b(?:d|points)="([^"]+)"/g)]
      .filter((match) => !match[1].includes("${"))
      .map((match) => {
        const fragment = match[1].trim();
        return {
          file,
          line: source.slice(0, match.index).split("\n").length,
          sourceFragmentPresent: originalBundle.includes(Buffer.from(fragment)),
        };
      });
  });
  console.log(JSON.stringify(results, null, 2));
  if (results.some((result) => !result.sourceFragmentPresent)) process.exitCode = 1;
  process.exit();
}

let manifest;
if (["--lucide-catalog", "--custom-catalog", "--call-site-catalog"].includes(manifestPath)) {
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { createServer } = await import("vite");
  const source = readFileSync("renderer/src/components/icons.jsx", "utf8");
  const mappings = [...source.matchAll(/export const (Icon\w+) = lucide\("([^"]+)"\);/g)]
    .map((match) => ({ exportName: match[1], referenceName: match[2] }));
  const server = await createServer({
    root: process.cwd(),
    server: { middlewareMode: true },
    appType: "custom",
    logLevel: "silent",
  });
  try {
    const icons = await server.ssrLoadModule("/renderer/src/components/icons.jsx");
    const { LucideIcon } = await server.ssrLoadModule("/renderer/src/components/lucide/index.jsx");
    if (manifestPath === "--lucide-catalog") {
      manifest = {
        icons: mappings.map(({ exportName, referenceName }) => ({
          name: `${exportName}:${referenceName}`,
          actualSvg: renderToStaticMarkup(React.createElement(icons[exportName], { size: 64 })),
          referenceSvg: renderToStaticMarkup(React.createElement(LucideIcon, { name: referenceName, size: 64 })),
        })),
      };
    } else if (manifestPath === "--custom-catalog") {
      const originalBundle = readFileSync(
        process.env.ORIGINAL_CHATGPT_ASAR || "/Applications/ChatGPT.app/Contents/Resources/app.asar",
      );
      const lucideExports = new Set(mappings.map(({ exportName }) => exportName));
      manifest = {
        icons: Object.keys(icons)
          .filter((name) => name.startsWith("Icon") && name !== "LucideIcon" && !lucideExports.has(name))
          .sort()
          .map((name) => {
            const actualSvg = renderToStaticMarkup(React.createElement(icons[name], { size: 64 }));
            const sourceFragments = [...actualSvg.matchAll(/(?:d|points)="([^"]+)"/g)]
              .map((match) => match[1].trim());
            return {
              name,
              actualSvg,
              referenceSvg: actualSvg,
              sourceFragmentsCount: sourceFragments.length,
              sourceFragmentsPresent: sourceFragments.length > 0
                && sourceFragments.every((fragment) => originalBundle.includes(Buffer.from(fragment))),
            };
          }),
      };
    } else {
      const originalBundle = readFileSync(
        process.env.ORIGINAL_CHATGPT_ASAR || "/Applications/ChatGPT.app/Contents/Resources/app.asar",
      );
      const references = new Map(mappings.map(({ exportName, referenceName }) => [exportName, referenceName]));
      const exportedIcons = new Set(Object.keys(icons).filter((name) => name.startsWith("Icon")));
      const files = [];
      const walk = (directory) => {
        for (const entry of readdirSync(directory, { withFileTypes: true })) {
          const file = path.join(directory, entry.name);
          if (entry.isDirectory()) walk(file);
          else if (entry.name.endsWith(".jsx") && entry.name !== "icons.jsx") files.push(file);
        }
      };
      walk("renderer/src/components");
      const callSites = files.flatMap((file) => {
        const source = readFileSync(file, "utf8");
        return [...source.matchAll(/<(Icon\w+)\b([^>]*)/g)]
          .filter((match) => exportedIcons.has(match[1]))
          .map((match) => {
            const sizeAttribute = match[2].match(/\bsize\s*=\s*(?:\{\s*([^}]+)\s*\}|"([^"]+)")/);
            const rawSize = sizeAttribute?.[1]?.trim() || sizeAttribute?.[2];
            const size = rawSize && /^\d+(?:\.\d+)?$/.test(rawSize) ? Number(rawSize) : 16;
            return {
              file,
              line: source.slice(0, match.index).split("\n").length,
              exportName: match[1],
              size,
              dynamicSize: Boolean(rawSize && !/^\d+(?:\.\d+)?$/.test(rawSize)),
            };
          });
      });
      manifest = {
        icons: callSites.map(({ file, line, exportName, size, dynamicSize }) => {
          const actualSvg = renderToStaticMarkup(React.createElement(icons[exportName], { size }));
          const sourceFragments = [...actualSvg.matchAll(/(?:d|points)="([^"]+)"/g)]
            .map((match) => match[1].trim());
          const referenceName = references.get(exportName);
          const referenceSvg = referenceName
            ? renderToStaticMarkup(React.createElement(LucideIcon, { name: referenceName, size }))
            : actualSvg;
          return {
            name: `${file}:${line}:${exportName}@${dynamicSize ? "dynamic" : size}`,
            actualSvg,
            referenceSvg,
            dynamicSize,
            sourceFragmentsCount: sourceFragments.length,
            sourceFragmentsPresent: Boolean(referenceName) || (
              sourceFragments.length > 0
              && sourceFragments.every((fragment) => originalBundle.includes(Buffer.from(fragment)))
            ),
          };
        }),
      };
    }
  } finally {
    await server.close();
  }
} else {
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
}

const renderLucideSvg = async ({ name, size = 16, strokeWidth = 2 }) => {
  const { ICON_NODES } = await import("../renderer/src/components/lucide/nodes.js");
  const escape = (value) => String(value).replaceAll("&", "&amp;").replaceAll("\"", "&quot;");
  const children = ICON_NODES[name].map(([tag, attributes]) => {
    const attrs = Object.entries(attributes)
      .filter(([key]) => key !== "key")
      .map(([key, value]) => `${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)}="${escape(value)}"`)
      .join(" ");
    return `<${tag} ${attrs}></${tag}>`;
  }).join("");
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round">${children}</svg>`;
};

let iconServer;
let iconExports;
const renderExportedIcon = async ({ name, size = 16 }) => {
  if (!iconServer) {
    const { createServer } = await import("vite");
    iconServer = await createServer({
      root: process.cwd(),
      server: { middlewareMode: true },
      appType: "custom",
      logLevel: "silent",
    });
    iconExports = await iconServer.ssrLoadModule("/renderer/src/components/icons.jsx");
  }
  const React = (await import("react")).default;
  const { renderToStaticMarkup } = await import("react-dom/server");
  return renderToStaticMarkup(React.createElement(iconExports[name], { size }));
};

async function connect(port) {
  const targets = await fetch(`http://127.0.0.1:${port}/json`).then((response) => response.json());
  const page = targets.find((target) => target.type === "page" && target.url.endsWith("index.html"))
    || targets.find((target) => target.type === "page");
  if (!page) throw new Error(`No page target on ${port}`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });
  let id = 0;
  const pending = new Map();
  const rejectPending = (error) => {
    for (const { reject, timer } of pending.values()) {
      clearTimeout(timer);
      reject(error);
    }
    pending.clear();
  };
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject, timer } = pending.get(message.id);
    pending.delete(message.id);
    clearTimeout(timer);
    message.error ? reject(new Error(JSON.stringify(message.error))) : resolve(message.result);
  };
  ws.onclose = () => rejectPending(new Error(`CDP connection closed on port ${port}`));
  ws.onerror = () => rejectPending(new Error(`CDP connection failed on port ${port}`));
  const call = (method, params) => new Promise((resolve, reject) => {
    const callId = ++id;
    const timer = setTimeout(() => {
      pending.delete(callId);
      reject(new Error(`CDP command timed out: ${method}`));
    }, 5000);
    pending.set(callId, { resolve, reject, timer });
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
  const notify = (method, params) => {
    ws.send(JSON.stringify({ id: ++id, method, params }));
  };
  return {
    close: () => ws.close(),
    mouseMove: (x, y) => notify("Input.dispatchMouseEvent", {
      type: "mouseMoved",
      x,
      y,
      buttons: 0,
    }),
    evaluate: (expression) => call("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    }).then((result) => {
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      return result.result?.value;
    }),
  };
}

const actual = await connect(actualPort);
const reference = referencePort ? await connect(referencePort) : null;

const compareExpression = (items) => `(async () => {
  const items = ${JSON.stringify(items)};
  const attrs = [
    "viewBox", "fill", "fill-rule", "clip-rule", "stroke", "stroke-width",
    "stroke-linecap", "stroke-linejoin", "d", "points", "x", "y", "x1", "y1",
    "x2", "y2", "cx", "cy", "r", "rx", "ry", "width", "height",
  ];
  const signature = (svg) => {
    const walk = (node) => ({
      tag: node.tagName,
      attrs: Object.fromEntries(attrs.flatMap((name) => {
        const value = node.getAttribute(name);
        return value == null ? [] : [[name, value]];
      })),
      children: [...node.children].map(walk),
    });
    return walk(svg);
  };
  const raster = (markup, size, renderState = {}) => new Promise((resolve, reject) => {
    const doc = new DOMParser().parseFromString(markup, "image/svg+xml");
    const svg = doc.documentElement;
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("width", String(size));
    svg.setAttribute("height", String(size));
    svg.setAttribute("style", [
      "color:#000",
      "transform:" + (renderState.transform || "none"),
      "scale:" + (renderState.scale || "none"),
      "rotate:" + (renderState.rotate || "none"),
      "translate:" + (renderState.translate || "none"),
      "transform-origin:" + (renderState.transformOrigin || "50% 50%"),
      "transform-box:" + (renderState.transformBox || "view-box"),
    ].join(";"));
    svg.removeAttribute("class");
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.clearRect(0, 0, size, size);
      context.drawImage(image, 0, 0, size, size);
      URL.revokeObjectURL(image.src);
      resolve([...context.getImageData(0, 0, size, size).data]);
    };
    image.onerror = reject;
    image.src = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml" }));
  });
  const parse = (markup) => new DOMParser().parseFromString(markup, "image/svg+xml").documentElement;
  const byText = (text, selector = "*") => {
    const leaf = [...document.querySelectorAll(selector)]
      .find((element) => element.textContent.trim() === text);
    let node = leaf;
    for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
      const svg = node.matches?.("svg") ? node : node.querySelector?.("svg");
      if (svg) return svg;
    }
    return null;
  };
  const results = [];
  for (const item of items) {
    const actualSvg = item.actualSvg
      ? parse(item.actualSvg)
      : item.actualSelector
        ? document.querySelector(item.actualSelector)
        : byText(item.actualText, item.actualTextSelector);
    if (!actualSvg) {
      results.push({ name: item.name, missing: "actual", optional: Boolean(item.optional) });
      continue;
    }
    const referenceMarkup = item.referenceSvg;
    if (!referenceMarkup) {
      results.push({ name: item.name, missing: "reference" });
      continue;
    }
    const actualMarkup = actualSvg.outerHTML;
    const actualStyle = item.actualSvg ? null : getComputedStyle(actualSvg);
    const actualRenderState = item.actualSvg
      ? {
        transform: item.actualTransform || "none",
        scale: item.actualScale || "none",
        rotate: item.actualRotate || "none",
        translate: item.actualTranslate || "none",
        transformOrigin: item.actualTransformOrigin || "50% 50%",
        transformBox: item.actualTransformBox || "view-box",
      }
      : {
        transform: actualStyle.transform,
        scale: actualStyle.scale,
        rotate: actualStyle.rotate,
        translate: actualStyle.translate,
        transformOrigin: actualStyle.transformOrigin,
        transformBox: actualStyle.transformBox,
      };
    const referenceRenderState = {
      transform: item.referenceTransform || "none",
      scale: item.referenceScale || "none",
      rotate: item.referenceRotate || "none",
      translate: item.referenceTranslate || "none",
      transformOrigin: item.referenceTransformOrigin || actualRenderState.transformOrigin,
      transformBox: item.referenceTransformBox || actualRenderState.transformBox,
    };
    const actualSignature = signature(parse(actualMarkup));
    const referenceSignature = signature(parse(referenceMarkup));
    const [actualPixels, referencePixels] = await Promise.all([
      raster(actualMarkup, item.rasterSize || 64, actualRenderState),
      raster(referenceMarkup, item.rasterSize || 64, referenceRenderState),
    ]);
    let differentPixels = 0;
    let totalDelta = 0;
    let maxChannelDelta = 0;
    for (let offset = 0; offset < actualPixels.length; offset += 4) {
      let pixelDifferent = false;
      for (let channel = 0; channel < 4; channel += 1) {
        const delta = Math.abs(actualPixels[offset + channel] - referencePixels[offset + channel]);
        totalDelta += delta;
        maxChannelDelta = Math.max(maxChannelDelta, delta);
        pixelDifferent ||= delta !== 0;
      }
      differentPixels += Number(pixelDifferent);
    }
    results.push({
      name: item.name,
      sourceFragmentsCount: item.sourceFragmentsCount,
      sourceFragmentsPresent: item.sourceFragmentsPresent,
      geometryEqual: JSON.stringify(actualSignature) === JSON.stringify(referenceSignature),
      renderStateEqual: ["transform", "scale", "rotate", "translate", "transformOrigin", "transformBox"]
        .every((key) => actualRenderState[key] === referenceRenderState[key]),
      actualRenderState,
      referenceRenderState,
      differentPixels,
      maxChannelDelta,
      meanChannelDelta: totalDelta / actualPixels.length,
    });
  }
  return results;
})()`;

const items = [];
const manifestByName = new Map(manifest.icons.map((item) => [item.name, item]));
for (const item of manifest.icons) {
  let referenceSvg = item.referenceSvg
    || (item.referenceLucide ? await renderLucideSvg(item.referenceLucide) : null)
    || (item.referenceIcon ? await renderExportedIcon(item.referenceIcon) : null);
  if (!referenceSvg && item.referenceFrom) {
    referenceSvg = manifestByName.get(item.referenceFrom)?.referenceSvg || null;
    if (referenceSvg && item.referenceSize) {
      referenceSvg = referenceSvg
        .replace(/width="[^"]+"/, `width="${item.referenceSize}"`)
        .replace(/height="[^"]+"/, `height="${item.referenceSize}"`);
    }
  }
  if (reference && item.referenceSelector) {
    referenceSvg = await reference.evaluate(`document.querySelector(${JSON.stringify(item.referenceSelector)})?.outerHTML || null`);
  } else if (reference && item.referenceText) {
    referenceSvg = await reference.evaluate(`(() => {
      const leaf = [...document.querySelectorAll(${JSON.stringify(item.referenceTextSelector || "*")})]
        .find((element) => element.textContent.trim() === ${JSON.stringify(item.referenceText)});
      let node = leaf;
      for (let depth = 0; node && depth < 8; depth += 1, node = node.parentElement) {
        const svg = node.matches?.("svg") ? node : node.querySelector?.("svg");
        if (svg) return svg.outerHTML;
      }
      return null;
    })()`);
  }
  items.push({
    ...item,
    actualSetup: item.actualSetup && (manifest.setups?.[item.actualSetup] || item.actualSetup),
    referenceSvg,
  });
}
if (iconServer) await iconServer.close();

const results = [];
for (const item of items) {
  if (process.env.DEBUG_ICON_PARITY) console.error(`checking ${item.name}`);
  if (item.actualSetup) {
    await actual.evaluate(item.actualSetup);
    await new Promise((resolve) => setTimeout(resolve, item.setupWaitMs || 50));
  }
  if (item.actualHoverText) {
    const rect = await actual.evaluate(`(() => {
      const element = ${JSON.stringify(item.actualHoverSelector || "")}
        ? document.querySelector(${JSON.stringify(item.actualHoverSelector || "")})
        : [...document.querySelectorAll(${JSON.stringify(item.actualHoverTextSelector || "button")})]
          .find((node) => node.offsetParent && node.textContent.trim() === ${JSON.stringify(item.actualHoverText)});
      if (!element) return null;
      const rect = element.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    })()`);
    if (process.env.DEBUG_ICON_PARITY) console.error(`hover ${item.actualHoverText}: ${JSON.stringify(rect)}`);
    if (rect) {
      await actual.mouseMove(0, 0);
      await new Promise((resolve) => setTimeout(resolve, item.hoverResetWaitMs || 50));
      await actual.mouseMove(rect.x + rect.width / 2, rect.y + rect.height / 2);
      await actual.mouseMove(rect.x + rect.width / 2 + 0.1, rect.y + rect.height / 2);
      await new Promise((resolve) => setTimeout(resolve, item.hoverWaitMs || 100));
      if (process.env.DEBUG_ICON_PARITY) {
        const visibleButtons = await actual.evaluate("[...document.querySelectorAll('button')].filter((e) => e.offsetParent).map((e) => e.textContent.trim()).filter(Boolean)");
        console.error(`visible buttons: ${JSON.stringify(visibleButtons)}`);
      }
    }
  }
  results.push(...await actual.evaluate(compareExpression([item])));
}
for (let attempt = 0; attempt < 6; attempt += 1) {
  await actual.evaluate("document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true }))");
  await new Promise((resolve) => setTimeout(resolve, 25));
}
actual.mouseMove(0, 0);
actual.close();
reference?.close();
console.log(JSON.stringify(results, null, 2));
const failures = results.filter((result) => result.missing
  ? !result.optional
  : result.sourceFragmentsPresent === false || !result.geometryEqual
    || !result.renderStateEqual || result.differentPixels !== 0);
console.error(JSON.stringify({
  checked: results.length,
  zeroPixelDiff: results.filter((result) => result.differentPixels === 0).length,
  optionalMissing: results.filter((result) => result.missing && result.optional).map((result) => result.name),
  failures: failures.map((result) => result.name),
}));
if (failures.length) {
  process.exitCode = 1;
}
