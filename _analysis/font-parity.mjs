// Compare typography from the live original app (9223) and replica (9222).
//
// Usage:
//   node _analysis/font-parity.mjs [replicaPort] [originalPort]

const replicaPort = Number(process.argv[2] || 9222);
const originalPort = Number(process.argv[3] || 9223);
const samples = [
  { name: "wordmark", text: "Codex", region: "sidebar" },
  { name: "nav-new-chat", text: "New chat", region: "sidebar" },
  { name: "nav-pull-requests", text: "Pull requests", region: "sidebar" },
  { name: "nav-sites", text: "Sites", region: "sidebar" },
  { name: "nav-scheduled", text: "Scheduled", region: "sidebar" },
  { name: "nav-plugins", text: "Plugins", region: "sidebar" },
  { name: "section-pinned", text: "Pinned", region: "sidebar" },
  { name: "section-projects", text: "Projects", region: "sidebar" },
  { name: "thread-zh", text: "检查项目代码提交状态", region: "sidebar" },
  { name: "goal", text: "Pursuing goal", region: "main", optional: true },
];

async function connect(port) {
  const targets = await fetch(`http://localhost:${port}/json`).then((response) => response.json());
  const page = targets.find((target) => target.type === "page" && target.url.endsWith("index.html"))
    || targets.find((target) => target.type === "page");
  if (!page) throw new Error(`No CDP page found on port ${port}`);

  const socket = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.onopen = resolve;
    socket.onerror = reject;
  });

  let sequence = 0;
  const pending = new Map();
  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const request = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) request.reject(new Error(JSON.stringify(message.error)));
    else request.resolve(message.result);
  };

  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });

  let cssReady = false;
  return {
    async evaluate(expression) {
      const result = await call("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (result.exceptionDetails) {
        throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
      }
      return result.result.value;
    },
    async platformFonts({ text, region }) {
      if (!cssReady) {
        await call("DOM.enable");
        await call("CSS.enable");
        await call("DOM.getDocument", { depth: 0 });
        cssReady = true;
      }
      const expression = `[...document.querySelectorAll("*")]`
        + `.filter(e=>e.textContent.trim()===${JSON.stringify(text)})`
        + `.filter(e=>${JSON.stringify(region)}==="sidebar"?e.getBoundingClientRect().left<240:e.getBoundingClientRect().left>=240)`
        + `.filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.height&&r.bottom>0&&r.top<innerHeight})`
        + `.sort((a,b)=>a.children.length-b.children.length||a.getBoundingClientRect().width-b.getBoundingClientRect().width)[0]`;
      const evaluated = await call("Runtime.evaluate", { expression });
      if (!evaluated.result.objectId) return [];
      const requested = await call("DOM.requestNode", { objectId: evaluated.result.objectId });
      const result = await call("CSS.getPlatformFontsForNode", { nodeId: requested.nodeId });
      return result.fonts.map(({ familyName, postScriptName, isCustomFont, glyphCount }) => ({
        familyName,
        postScriptName,
        isCustomFont,
        glyphCount,
      }));
    },
    close: () => socket.close(),
  };
}

const expression = String.raw`
(async () => {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const text = document.body?.innerText || "";
    if (text.includes("New chat") && text.includes("Codex")) break;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  await document.fonts.ready;
  const samples = ${JSON.stringify(samples)};

  const visible = (element) => {
    const rect = element.getBoundingClientRect();
    return rect.width && rect.height && rect.bottom > 0 && rect.top < innerHeight;
  };

  const find = ({ text, region }) => [...document.querySelectorAll("*")]
    .filter((element) => element.textContent.trim() === text && visible(element))
    .filter((element) => region === "sidebar"
      ? element.getBoundingClientRect().left < 240
      : element.getBoundingClientRect().left >= 240)
    .sort((left, right) => left.children.length - right.children.length
      || left.getBoundingClientRect().width - right.getBoundingClientRect().width)[0];

  const alphaBase64 = (data) => {
    let binary = "";
    for (let offset = 3; offset < data.length; offset += 4) {
      binary += String.fromCharCode(data[offset]);
    }
    return btoa(binary);
  };

  const inspect = (sample) => {
    const element = find(sample);
    if (!element) return { ...sample, missing: true };
    const style = getComputedStyle(element);
    const range = document.createRange();
    range.selectNodeContents(element);
    const textRect = range.getBoundingClientRect();

    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 64;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.scale(2, 2);
    context.clearRect(0, 0, 256, 32);
    context.fillStyle = "#000";
    context.textBaseline = "alphabetic";
    context.fontKerning = style.fontKerning;
    context.font = style.fontStyle + " " + style.fontWeight + " " + style.fontSize + " " + style.fontFamily;
    if ("letterSpacing" in context) context.letterSpacing = style.letterSpacing;
    context.fillText(sample.text, 4, 22);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;

    return {
      ...sample,
      tag: element.tagName,
      className: String(element.className),
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      fontKerning: style.fontKerning,
      fontFeatureSettings: style.fontFeatureSettings,
      fontVariationSettings: style.fontVariationSettings,
      webkitFontSmoothing: style.webkitFontSmoothing,
      textRendering: style.textRendering,
      textRect: {
        x: textRect.x,
        y: textRect.y,
        width: textRect.width,
        height: textRect.height,
      },
      alpha: alphaBase64(pixels),
    };
  };

  return {
    dpr: devicePixelRatio,
    fonts: [...document.fonts]
      .filter((font) => /OpenAI Sans/.test(font.family))
      .map((font) => ({ family: font.family, weight: font.weight, status: font.status })),
    samples: samples.map(inspect),
  };
})()
`;

const [original, replica] = await Promise.all([connect(originalPort), connect(replicaPort)]);
const [originalResult, replicaResult] = await Promise.all([
  original.evaluate(expression),
  replica.evaluate(expression),
]);

const originalPlatformFonts = [];
const replicaPlatformFonts = [];
for (const sample of samples) {
  originalPlatformFonts.push(await original.platformFonts(sample));
  replicaPlatformFonts.push(await replica.platformFonts(sample));
}
original.close();
replica.close();

const styleKeys = [
  "fontWeight",
  "fontSize",
  "lineHeight",
  "letterSpacing",
  "fontKerning",
  "fontFeatureSettings",
  "fontVariationSettings",
  "webkitFontSmoothing",
  "textRendering",
];

const comparisons = samples.map((sample, index) => {
  const left = originalResult.samples[index];
  const right = replicaResult.samples[index];
  if (left.missing || right.missing) {
    return {
      ...sample,
      pass: !!sample.optional,
      skipped: !!sample.optional,
      originalMissing: !!left.missing,
      replicaMissing: !!right.missing,
    };
  }

  const leftAlpha = Buffer.from(left.alpha, "base64");
  const rightAlpha = Buffer.from(right.alpha, "base64");
  let differentPixels = 0;
  let absoluteAlphaDelta = 0;
  for (let pixel = 0; pixel < leftAlpha.length; pixel += 1) {
    const delta = Math.abs(leftAlpha[pixel] - rightAlpha[pixel]);
    if (delta) differentPixels += 1;
    absoluteAlphaDelta += delta;
  }

  const styleDifferences = styleKeys.filter((key) => left[key] !== right[key]);
  const platformFontsEqual = JSON.stringify(originalPlatformFonts[index]) === JSON.stringify(replicaPlatformFonts[index]);
  const widthDelta = Number((right.textRect.width - left.textRect.width).toFixed(6));
  const heightDelta = Number((right.textRect.height - left.textRect.height).toFixed(6));
  return {
    ...sample,
    pass: !styleDifferences.length && platformFontsEqual && !differentPixels && !widthDelta && !heightDelta,
    styleDifferences,
    platformFontsEqual,
    originalPlatformFonts: originalPlatformFonts[index],
    replicaPlatformFonts: replicaPlatformFonts[index],
    differentPixels,
    absoluteAlphaDelta,
    widthDelta,
    heightDelta,
    original: { ...left, alpha: undefined },
    replica: { ...right, alpha: undefined },
  };
});

const output = {
  originalPort,
  replicaPort,
  originalFonts: originalResult.fonts,
  replicaFonts: replicaResult.fonts,
  comparisons,
  pass: comparisons.every((comparison) => comparison.pass),
};

console.log(JSON.stringify(output, null, 2));
if (!output.pass) process.exitCode = 1;
