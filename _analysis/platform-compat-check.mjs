import assert from "node:assert/strict";
import fs from "node:fs";

const importSource = async (file, key) => {
  const source = fs.readFileSync(file, "utf8");
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}#${key}`);
};

const time = await importSource("renderer/src/lib/time.js", "time");
assert.equal(time.basename(String.raw`C:\Users\Test\repo\sub`), "sub");
assert.equal(time.basename("/Users/test/repo/sub"), "sub");
assert.equal(
  time.isPathInside(String.raw`C:\Users\Test\repo\sub`, String.raw`c:\users\test\repo`),
  true,
);
assert.equal(time.isPathInside("/Users/test/repository", "/Users/test/repo"), false);

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { platform: "Win32" },
});
const windowsKeys = await importSource("renderer/src/lib/keys.js", "windows");
const windowsCtrlB = { ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, key: "b" };
const windowsArrow = { ctrlKey: true, altKey: true, shiftKey: false, metaKey: false, key: "ArrowRight" };
assert.equal(windowsKeys.matchAccel(windowsCtrlB, "Ctrl+B"), true);
assert.equal(windowsKeys.matchAccel(windowsCtrlB, "⌘B"), true);
assert.equal(windowsKeys.matchAccel(windowsArrow, "Ctrl+Alt+ArrowRight"), true);
assert.equal(windowsKeys.matchAccel(windowsArrow, "⌥⌘Right"), true);

Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: { platform: "MacIntel" },
});
const macKeys = await importSource("renderer/src/lib/keys.js", "mac");
const macCommandB = { ctrlKey: false, altKey: false, shiftKey: false, metaKey: true, key: "b" };
const macControlR = { ctrlKey: true, altKey: false, shiftKey: false, metaKey: false, key: "r" };
assert.equal(macKeys.matchAccel(macCommandB, "⌘B"), true);
assert.equal(macKeys.matchAccel(macControlR, "⌘B"), false);
assert.equal(macKeys.matchAccel(macControlR, "⌃R"), true);

const appShell = fs.readFileSync("renderer/src/App.jsx", "utf8");
assert.match(appShell, /isWin \? \(/);
assert.match(appShell, /Windows keeps a second toolbar row below its custom title bar/);
assert.match(appShell, /bg-\(--surface\) pt-\[46px\]/);

const rightPanel = fs.readFileSync("renderer/src/components/RightPanel.jsx", "utf8");
assert.match(rightPanel, /isWin \? "bg-\(--surface\)" : "bg-\(--surface-under\) pt-\[46px\]"/);
