import assert from "node:assert/strict";
import test from "node:test";
import {
  PANEL_ACTION_COMMANDS,
  PANEL_ACTION_ORDER,
} from "../modules/workspace-panels/renderer/panel-actions.mjs";
import { bindingFor as macBindingFor } from "../modules/shortcuts/implementations/command-key/index.mjs";
import { bindingFor as winBindingFor } from "../modules/shortcuts/implementations/control-key/index.mjs";

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
