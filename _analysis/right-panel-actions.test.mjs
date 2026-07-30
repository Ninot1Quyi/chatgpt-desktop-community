import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs
  .readFileSync(path.join(repoRoot, relativePath), "utf8")
  .replace(/\r\n/g, "\n");
const moduleUrl = (relativePath) => pathToFileURL(path.join(repoRoot, relativePath)).href;

test("right panel empty state restores the reference action order", () => {
  const source = read("modules/workspace-panels/renderer/RightPanel.jsx");
  assert.match(source, /const MENU_ORDER = \["review", "terminal", "browser", "files", "sidechat"\]/);
  assert.doesNotMatch(source, /return hasGit \? <EnvironmentPanel/);
  assert.doesNotMatch(source, /if \(!tabs\.length\) \{\n\s+return <PanelEmptyState \/>;/);
  assert.match(source, /<div className="right-panel-root flex h-full w-full flex-col">/);
  assert.match(source, /function IconReview/);
  assert.match(source, /name="ListChecks"/);
});

test("right panel shortcut labels come from target-specific shortcut implementation", async () => {
  const source = read("modules/workspace-panels/renderer/RightPanel.jsx");
  assert.match(source, /import \{ bindingFor \} from "@modules\/shortcuts"/);
  assert.match(source, /commandId: "openSideChatTab"/);
  assert.match(source, /shortcutHint\(def\)/);
  assert.doesNotMatch(source, /hint: "Ctrl\+T"/);

  const command = await import(moduleUrl("modules/shortcuts/implementations/command-key/index.mjs"));
  const control = await import(moduleUrl("modules/shortcuts/implementations/control-key/index.mjs"));
  assert.equal(command.bindingFor("openSideChatTab"), "⌥⌘S");
  assert.equal(command.bindingFor("openBrowserTab"), "⌘T");
  assert.equal(command.bindingFor("openFilesTab"), "⌘P");
  assert.equal(control.bindingFor("openSideChatTab"), "Ctrl+Alt+S");
  assert.equal(control.bindingFor("openBrowserTab"), "Ctrl+T");
  assert.equal(control.bindingFor("openFilesTab"), "Ctrl+P");
});

test("right panel header keeps a draggable blank region outside controls and tabs", () => {
  const source = read("modules/workspace-panels/renderer/RightPanel.jsx");
  assert.match(source, /className="app-drag flex h-full min-w-0 items-center"/);
  assert.match(source, /className="app-no-drag hide-scrollbar flex h-full/);
  assert.match(source, /data-testid="right-panel-header-drag-region"/);
  assert.match(source, /className="app-drag h-full min-w-4 flex-1"/);
});

test("mac right panel uses the same main-surface black as the center pane", () => {
  const source = read("modules/desktop-shell/implementations/macos-native/styles.css");
  assert.match(source, /\.desktop-shell-macos \.right-panel-root \{\n  background: var\(--surface\);/);
  assert.doesNotMatch(source, /\.desktop-shell-macos \.right-panel-root \{\n  background: var\(--surface-under\);/);
});
