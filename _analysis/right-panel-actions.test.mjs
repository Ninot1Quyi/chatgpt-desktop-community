import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  emptyPanelActionOrder,
  PANEL_ACTION_COMMANDS,
  PANEL_ACTION_ORDER,
  panelActionAvailable,
} from "../modules/workspace-panels/renderer/panel-actions.mjs";
import {
  bindingFor as macBindingFor,
  matchAccel as macMatchAccel,
} from "../modules/shortcuts/implementations/command-key/index.mjs";
import {
  bindingFor as winBindingFor,
  matchAccel as winMatchAccel,
} from "../modules/shortcuts/implementations/control-key/index.mjs";

const read = (relativePath) => readFileSync(
  new URL(`../${relativePath}`, import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");

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

test("right-panel empty actions follow product and thread context", () => {
  assert.deepEqual(
    emptyPanelActionOrder({ mode: "codex", hasGit: true }),
    ["review", "terminal", "browser", "files"],
  );
  assert.deepEqual(
    emptyPanelActionOrder({ mode: "codex", hasGit: true, hasActiveThread: true }),
    ["review", "terminal", "browser", "files", "sidechat"],
  );
  assert.deepEqual(
    emptyPanelActionOrder({ mode: "codex", hasActiveThread: true }),
    ["terminal", "browser", "files", "sidechat"],
  );
  assert.deepEqual(
    emptyPanelActionOrder({ mode: "codex", runtime: "kimi", hasActiveThread: true }),
    ["review", "terminal", "browser", "files", "sidechat"],
  );
  assert.equal(panelActionAvailable("review", { runtime: "kimi" }), true);
  assert.equal(panelActionAvailable("review", { runtime: "claude" }), false);
  assert.equal(panelActionAvailable("review", { runtime: "claude", hasGit: true }), true);
  assert.deepEqual(
    emptyPanelActionOrder({ mode: "chatgpt", hasGit: true, hasActiveThread: true }),
    ["sidechat", "browser", "terminal"],
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

test("right panel header keeps a draggable blank region outside controls and tabs", () => {
  const source = read("modules/workspace-panels/renderer/RightPanel.jsx");
  assert.match(source, /className="app-drag pointer-events-auto flex h-full min-w-0 items-center"/);
  assert.match(source, /className="app-no-drag hide-scrollbar[^\"]*\bshrink\b/);
  assert.doesNotMatch(source, /className="app-no-drag hide-scrollbar flex h-full min-w-0 flex-1/);
  assert.match(source, /data-testid="right-panel-header-drag-region"/);
  assert.match(source, /className="app-drag h-full min-w-4 flex-1"/);
  assert.ok(
    source.indexOf('data-testid="right-panel-header-drag-region"')
      < source.indexOf("icon={expanded ? <IconCompress /> : <IconExpand />}"),
  );
});

test("right panel keeps dragging while storing only a responsive width ratio", () => {
  const styles = read("modules/desktop-shell/shared/styles.css");
  const parts = read("modules/desktop-shell/shared/parts.jsx");
  const store = read("renderer/src/store.js");
  assert.match(styles, /width: clamp\(20rem, var\(--right-panel-size, 28vw\), 48rem\)/);
  assert.match(styles, /width: clamp\(28rem, 52vw, 48rem\)/);
  assert.match(styles, /flex: 0 1 auto/);
  assert.match(parts, /export function RightPanelDragHandle/);
  assert.match(parts, /window\.requestAnimationFrame\(flush\)/);
  assert.match(parts, /getBoundingClientRect\(\)\.width \/ Math\.max\(1, window\.innerWidth\)/);
  assert.match(parts, /"--right-panel-size": `\$\{normalizedRightPanelRatio\(ratio\) \* 100\}vw`/);
  assert.match(store, /rightPanelRatio: stored\("ui\.rightPanelRatio", 0\.28\)/);
  assert.doesNotMatch(store, /rightWidth/);

  for (const shell of [
    "modules/desktop-shell/implementations/windows-frameless/renderer.jsx",
    "modules/desktop-shell/implementations/macos-native/renderer.jsx",
  ]) {
    const source = read(shell);
    assert.match(source, /className="right-panel-frame/);
    assert.match(source, /data-expanded=\{ui\.rightExpanded \? "true" : "false"\}/);
    assert.match(source, /RightPanelDragHandle/);
    assert.match(source, /rightPanelResponsiveStyle\(ui\.rightPanelRatio\)/);
     assert.doesNotMatch(source, /ui\.rightExpanded && "min-w-0 flex-1"/);
   }
});

test("mac right-panel header keeps blank title-bar space draggable", () => {
  const panel = readFileSync(
    new URL("../modules/workspace-panels/renderer/RightPanel.jsx", import.meta.url),
    "utf8",
  );
  const sharedParts = readFileSync(
    new URL("../modules/desktop-shell/shared/parts.jsx", import.meta.url),
    "utf8",
  );
  const sharedStyles = readFileSync(
    new URL("../modules/desktop-shell/shared/styles.css", import.meta.url),
    "utf8",
  );
  const macShell = readFileSync(
    new URL("../modules/desktop-shell/implementations/macos-native/renderer.jsx", import.meta.url),
    "utf8",
  );
  const conversation = readFileSync(
    new URL("../modules/conversations/renderer/Conversation.jsx", import.meta.url),
    "utf8",
  );
  assert.match(panel, /className="app-drag pointer-events-auto flex h-full min-w-0 items-center"/);
  assert.match(panel, /className="app-drag h-full min-w-4 flex-1"/);
  assert.match(panel, /className="right-panel-root pointer-events-none h-full w-full pt-\[2\.875rem\]"/);
  assert.match(panel, /\{tabs\.length > 0 && \(/);
  assert.match(panel, /tabRef\.current\?\.scrollIntoView\(\{ block: "nearest", inline: "nearest" \}\);/);
  assert.match(panel, /ref=\{plusRef\}[\s\S]*?className="app-no-drag /);
  assert.match(panel, /className="app-no-drag group\/tab /);
  assert.match(panel, /title=\{expanded \? "Restore panel width" : "Expand panel"\}[\s\S]*?className="mr-1"/);
  assert.match(panel, /viewBox="0 0 20 20"[\s\S]*?M4\.33496 11C4\.33496/);
  assert.match(panel, /viewBox="0 0 16 16"[\s\S]*?M6\.1664 8\.80845C6\.7325/);
  assert.match(sharedParts, /import "\.\/styles\.css";/);
  assert.match(sharedStyles, /\.app-drag\s*\{\s*-webkit-app-region:\s*drag;/);
  assert.match(sharedStyles, /\.app-no-drag\s*\{\s*-webkit-app-region:\s*no-drag;/);
  assert.match(
    macShell,
    /right-panel-frame pointer-events-none slide-in-right/,
  );
  assert.match(macShell, /items-center gap-1 pr-3 pl-\[5\.5rem\]/);
  assert.match(conversation, /className="app-no-drag flex h-7 w-\[3\.25rem\]/);
  assert.match(
    conversation,
    /IconHeaderSidebar style=\{\{ transform: "rotate\(180deg\)" \}\}/,
  );
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

  assert.match(files, /useState\(0\.46\)/);
  assert.match(files, /<IconListFiles size=\{18\}/);
  assert.doesNotMatch(files, /filter\(\(e\) => !e\.fileName\.startsWith\("\."\)\)/);
});
