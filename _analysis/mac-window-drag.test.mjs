import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(import.meta.url);
const {
  registerMacWindowDragHandlers,
} = require("../modules/desktop-shell/implementations/macos-native/window-drag.cjs");

test("mac drag bridge moves only the originating window by the pointer delta", () => {
  const handlers = new Map();
  const moves = [];
  const sender = {};
  const window = {
    getPosition: () => [224, 93],
    isDestroyed: () => false,
    isMovable: () => true,
    setPosition: (...args) => moves.push(args),
  };
  registerMacWindowDragHandlers({
    BrowserWindow: { fromWebContents: (value) => value === sender ? window : null },
    ipcMain: { on: (channel, handler) => handlers.set(channel, handler) },
  });

  handlers.get("window:drag-begin")({ sender }, { screenX: 1324, screenY: 117 });
  handlers.get("window:drag-move")({ sender }, { screenX: 1364, screenY: 137 });
  assert.deepEqual(moves, [[264, 113, false]]);

  handlers.get("window:drag-end")({ sender });
  handlers.get("window:drag-move")({ sender }, { screenX: 1400, screenY: 160 });
  assert.equal(moves.length, 1);
});

test("mac header uses manual dragging while interactive controls stay clickable", () => {
  const renderer = readFileSync(
    new URL("../modules/desktop-shell/implementations/macos-native/renderer.jsx", import.meta.url),
    "utf8",
  );
  const styles = readFileSync(
    new URL("../modules/desktop-shell/implementations/macos-native/styles.css", import.meta.url),
    "utf8",
  );
  const preload = readFileSync(new URL("../main/preload.js", import.meta.url), "utf8");

  assert.match(renderer, /className="mac-window-drag-surface app-no-drag /);
  assert.match(renderer, /event\.target\.closest\?\.\([\s\S]*?"button, a, input/);
  assert.match(renderer, /api\.windowDragBegin\(event\.screenX, event\.screenY\)/);
  assert.match(renderer, /api\.windowDragMove\(event\.screenX, event\.screenY\)/);
  assert.match(styles, /\.mac-window-drag-surface \.app-drag[\s\S]*?app-region:\s*no-drag;/);
  assert.match(preload, /windowDragBegin:[\s\S]*?ipcRenderer\.send\("window:drag-begin"/);
});
