import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  PANEL_ACTION_COMMANDS,
  PANEL_ACTION_ORDER,
} from "../modules/workspace-panels/renderer/panel-actions.mjs";
import {
  bindingFor as macBindingFor,
  matchAccel as macMatchAccel,
} from "../modules/shortcuts/implementations/command-key/index.mjs";
import {
  bindingFor as winBindingFor,
  matchAccel as winMatchAccel,
} from "../modules/shortcuts/implementations/control-key/index.mjs";

test("right-panel actions keep the reference order and platform labels", () => {
  assert.deepEqual(PANEL_ACTION_ORDER, [
    "review",
    "terminal",
    "browser",
    "files",
    "sidechat",
  ]);
  assert.deepEqual(
    PANEL_ACTION_ORDER.map((kind) => {
      const command = PANEL_ACTION_COMMANDS[kind];
      return command ? macBindingFor(command) : null;
    }),
    ["⌃⇧G", null, "⌘T", "⌘P", "⌥⌘S"],
  );
  assert.deepEqual(
    PANEL_ACTION_ORDER.map((kind) => {
      const command = PANEL_ACTION_COMMANDS[kind];
      return command ? winBindingFor(command) : null;
    }),
    ["Ctrl+Shift+G", null, "Ctrl+T", "Ctrl+P", "Ctrl+Alt+S"],
  );
});

test("dark center and right-panel surfaces keep the measured reference colors", () => {
  const theme = readFileSync(new URL("../renderer/src/theme.css", import.meta.url), "utf8");
  assert.match(theme, /\.dark\s*\{[\s\S]*?--surface:\s*#111111;/);
  assert.match(theme, /\.dark\s*\{[\s\S]*?--surface-under:\s*#0e0e0e;/);
  assert.match(theme, /\.dark\s*\{[\s\S]*?--panel-action-bg:\s*rgb\(252 252 252 \/ 0\.03\);/);
  assert.match(theme, /\.dark\s*\{[\s\S]*?--panel-action-hover-bg:\s*rgb\(252 252 252 \/ 0\.08\);/);
  assert.match(theme, /\.dark\s*\{[\s\S]*?--keybinding-bg:\s*rgb\(252 252 252 \/ 0\.065\);/);
});

test("mac right-panel header keeps blank title-bar space draggable", () => {
  const panel = readFileSync(
    new URL("../modules/workspace-panels/renderer/RightPanel.jsx", import.meta.url),
    "utf8",
  );
  assert.match(panel, /className="app-drag flex h-full min-w-0 items-center"/);
  assert.match(panel, /className="app-drag h-full min-w-4 flex-1"/);
  assert.match(panel, /ref=\{plusRef\}[\s\S]*?className="app-no-drag /);
  assert.match(panel, /className="app-no-drag group\/tab /);
});

test("right-panel shortcuts match native modifiers on both platforms", () => {
  assert.equal(macMatchAccel({ key: "t", code: "KeyT", metaKey: true }, "⌘T"), true);
  assert.equal(macMatchAccel({ key: "p", code: "KeyP", metaKey: true }, "⌘P"), true);
  assert.equal(
    macMatchAccel({ key: "s", code: "KeyS", metaKey: true, altKey: true }, "⌥⌘S"),
    true,
  );
  assert.equal(
    macMatchAccel({ key: "g", code: "KeyG", ctrlKey: true, shiftKey: true }, "⌃⇧G"),
    true,
  );

  assert.equal(winMatchAccel({ key: "t", code: "KeyT", ctrlKey: true }, "Ctrl+T"), true);
  assert.equal(winMatchAccel({ key: "p", code: "KeyP", ctrlKey: true }, "Ctrl+P"), true);
  assert.equal(
    winMatchAccel({ key: "s", code: "KeyS", ctrlKey: true, altKey: true }, "Ctrl+Alt+S"),
    true,
  );
  assert.equal(
    winMatchAccel({ key: "g", code: "KeyG", ctrlKey: true, shiftKey: true }, "Ctrl+Shift+G"),
    true,
  );
});

test("functional right panels retain the measured reference structure", () => {
  const review = readFileSync(
    new URL("../modules/workspace-panels/renderer/panel/ReviewTab.jsx", import.meta.url),
    "utf8",
  );
  const browser = readFileSync(
    new URL("../modules/workspace-panels/renderer/panel/BrowserTab.jsx", import.meta.url),
    "utf8",
  );
  const files = readFileSync(
    new URL("../modules/workspace-panels/renderer/panel/FilesTab.jsx", import.meta.url),
    "utf8",
  );

  for (const label of [
    "Review options",
    "Collapse all diffs",
    "Jump to file",
    "Switch to split diff",
    "Show files",
    "Commit or push",
    "More Git actions",
  ]) {
    assert.match(review, new RegExp(label));
  }
  assert.match(review, /Showing tracked changes only/);
  assert.match(review, /git clean -nd/);

  assert.match(browser, /id="browser-address-input"/);
  assert.match(browser, /title="Browser options"/);
  assert.match(browser, /label: "Zoom out"/);
  assert.doesNotMatch(browser, /<ZoomControl/);

  assert.match(files, /useState\(243\)/);
  assert.match(files, /<IconListFiles size=\{18\}/);
  assert.doesNotMatch(files, /filter\(\(e\) => !e\.fileName\.startsWith\("\."\)\)/);
});
