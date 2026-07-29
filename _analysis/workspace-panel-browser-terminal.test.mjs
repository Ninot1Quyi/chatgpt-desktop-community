import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  appendBoundedTerminalBuffer,
  browserStateFromWebview,
  normalizeBrowserUrl,
  terminalExecParams,
  terminalResizeParams,
  terminalWriteParams,
} from "../modules/workspace-panels/renderer/panel/bus.js";
import {
  bindingFor as macBindingFor,
} from "../modules/shortcuts/implementations/command-key/index.mjs";
import {
  bindingFor as winBindingFor,
} from "../modules/shortcuts/implementations/control-key/index.mjs";
import * as posixTerminal from "../modules/terminal/implementations/posix-login-shell/index.mjs";
import * as powershellTerminal from "../modules/terminal/implementations/powershell/index.mjs";

test("browser panel normalizes address-bar input before navigation", () => {
  assert.equal(normalizeBrowserUrl("https://example.com/a"), "https://example.com/a");
  assert.equal(normalizeBrowserUrl("http://localhost:5173"), "http://localhost:5173");
  assert.equal(normalizeBrowserUrl("example.com"), "https://example.com");
  assert.equal(normalizeBrowserUrl("file:///Users/example/secret.txt"), "");
  assert.equal(normalizeBrowserUrl("chrome://settings"), "");
  assert.equal(normalizeBrowserUrl("data:text/html,<h1>unsafe</h1>"), "");
  assert.equal(normalizeBrowserUrl("javascript:alert(1)"), "");
  assert.equal(normalizeBrowserUrl("about:blank"), "");
  assert.equal(
    normalizeBrowserUrl("codex desktop"),
    "https://www.google.com/search?q=codex%20desktop",
  );
  assert.equal(normalizeBrowserUrl("   "), "");
});

test("browser panel derives URL and history state from webview contract", () => {
  const state = browserStateFromWebview({
    getURL: () => "https://example.com",
    canGoBack: () => true,
    canGoForward: () => false,
  });
  assert.deepEqual(state, {
    url: "https://example.com",
    canBack: true,
    canForward: false,
  });
  assert.deepEqual(browserStateFromWebview(null), {
    url: "",
    canBack: false,
    canForward: false,
  });
});

test("browser panel listens for external open-url requests even on the empty page", () => {
  const source = readFileSync(
    new URL("../modules/workspace-panels/renderer/panel/BrowserTab.jsx", import.meta.url),
    "utf8",
  );
  assert.match(source, /window\.addEventListener\("codex:open-url", onOpenUrl\);/);
  assert.match(source, /const normalized = normalizeBrowserUrl\(stored\);/);
  assert.match(source, /localStorage\.removeItem\("browser\.url"\);/);
  assert.match(source, /if \(wv\) wv\.loadURL\(u\)\.catch\(\(\) => \{\}\);[\s\S]*?setUrl\(u\);/);
  assert.match(source, /wv\.addEventListener\("did-fail-load", onFail\);/);
  assert.match(source, /wv\.addEventListener\("will-navigate", onWillNavigate\);/);
  assert.match(source, /if \(!nextUrl \|\| nextUrl !== String\(e\.url \|\| ""\)\.trim\(\)\) e\.preventDefault\(\);/);
  assert.match(source, /\}, \[url\]\);/);
});

test("terminal panel sends the PTY command/exec streaming contract", () => {
  assert.deepEqual(terminalExecParams({
    command: ["zsh", "-il"],
    cwd: "",
    processId: "p1",
    size: { cols: 100, rows: 24 },
  }), {
    command: ["zsh", "-il"],
    cwd: undefined,
    env: { TERM: "xterm-256color" },
    tty: true,
    processId: "p1",
    streamStdin: true,
    streamStdoutStderr: true,
    disableTimeout: true,
    size: { cols: 100, rows: 24 },
  });
  assert.deepEqual(
    terminalResizeParams("p1", { cols: 88, rows: 20 }),
    { processId: "p1", size: { cols: 88, rows: 20 } },
  );
  assert.deepEqual(
    terminalWriteParams("p1", "YQ=="),
    { processId: "p1", deltaBase64: "YQ==" },
  );
});

test("terminal fallback buffer is bounded without losing newest output", () => {
  assert.equal(appendBoundedTerminalBuffer("abc", "def", 5), "bcdef");
  assert.equal(appendBoundedTerminalBuffer("abc", "", 5), "abc");
});

test("terminal and browser labels stay target-selected instead of renderer sniffed", () => {
  assert.deepEqual(posixTerminal.interactiveCommand, ["zsh", "-il"]);
  assert.equal(posixTerminal.shellLabel, "Shell");
  assert.deepEqual(powershellTerminal.interactiveCommand, [
    "powershell.exe",
    "-NoLogo",
    "-NoProfile",
    "-NoExit",
  ]);
  assert.equal(powershellTerminal.shellLabel, "PowerShell");
  assert.equal(macBindingFor("focusBrowserAddress"), "⌘L");
  assert.equal(winBindingFor("focusBrowserAddress"), "Ctrl+L");
  assert.equal(macBindingFor("openBrowserTab"), "⌘T");
  assert.equal(winBindingFor("openBrowserTab"), "Ctrl+T");
});
