import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  iconColorFor,
  iconTokenFor,
} from "../modules/workspace-panels/renderer/panel/fileIconMap.js";

const filesSource = readFileSync(
  new URL("../modules/workspace-panels/renderer/panel/FilesTab.jsx", import.meta.url),
  "utf8",
);
const reviewSource = readFileSync(
  new URL("../modules/workspace-panels/renderer/panel/ReviewTab.jsx", import.meta.url),
  "utf8",
);
const sideChatSource = readFileSync(
  new URL("../modules/workspace-panels/renderer/panel/SideChatTab.jsx", import.meta.url),
  "utf8",
);

test("Files panel keeps real file IO, Unicode-safe save, and cross-platform save hint", () => {
  assert.match(filesSource, /api\.rpc\("fs\/readDirectory", \{ path \}\)/);
  assert.match(filesSource, /api\.rpc\("fs\/readFile", \{ path \}\)/);
  assert.match(filesSource, /api\.rpc\("fs\/writeFile", \{\s*path: file\.path,\s*content: text,\s*dataBase64: encodeTextBase64\(text\),/);
  assert.match(filesSource, /function encodeTextBase64\(value\) \{/);
  assert.match(filesSource, /new TextEncoder\(\)\.encode\(value\)/);
  assert.match(filesSource, /function decodeTextBase64\(value\) \{/);
  assert.match(filesSource, /function directoryEntriesFromRpcResult\(result\) \{/);
  assert.match(filesSource, /const SAVE_HINT = "Ctrl\/⌘S";/);
  assert.match(filesSource, /IconFolder size=\{13\}/);
  assert.match(filesSource, /FileIcon name=\{name\} size=\{13\}/);
});

test("FileIcon maps reference filename and extension icons with stable colors", () => {
  assert.equal(iconTokenFor(".gitignore"), "git");
  assert.equal(iconTokenFor("Dockerfile"), "docker");
  assert.equal(iconTokenFor("App.tsx"), "react");
  assert.equal(iconTokenFor("README.md"), "markdown");
  assert.match(iconColorFor("react", "dark"), /^#[0-9a-f]{6}$/i);
  assert.match(iconColorFor("react", "light"), /^#[0-9a-f]{6}$/i);
});

test("Review panel closes diff workflows: select files, review changes, and undo", () => {
  assert.match(reviewSource, /import \{ openFileInPanel, usePanelStore \} from "\.\.\/state\.js";/);
  assert.match(reviewSource, /const joinWorkspacePath = \(root, child\) => \{/);
  assert.match(reviewSource, /const openFile = \(name\) => \{/);
  assert.match(reviewSource, /openFileInPanel\(target\)/);
  assert.match(reviewSource, /title="Review changes"/);
  assert.match(reviewSource, /Review the current workspace changes/);
  assert.match(reviewSource, /Do not expose hidden reasoning/);
  assert.match(reviewSource, /git\(\["restore", "--", p\]\)/);
  assert.match(reviewSource, /git\(\["restore", "--staged", "--", p\]\)/);
  assert.match(reviewSource, /git\(\["restore", "--", "\."\]\)/);
  assert.match(reviewSource, /"git", "apply", "-R", tmp/);
  assert.match(reviewSource, /onDoubleClick=\{\(\) => onOpenFile\?\.\(name\)\}/);
});

test("Side chat sends into active thread without exposing hidden reasoning", () => {
  assert.match(sideChatSource, /function threadContextSummary\(conv, cwd\) \{/);
  assert.match(sideChatSource, /store\.sendMessage\(t, \[\], \[\], \{/);
  assert.match(sideChatSource, /steer: !!activeThreadId && store\.isTurnActive\(activeThreadId\)/);
  assert.match(sideChatSource, /Ask in the active thread without leaving this view/);
  assert.match(sideChatSource, />Enter<\/kbd>/);
  assert.doesNotMatch(sideChatSource, /\.turns/);
  assert.doesNotMatch(sideChatSource, /reasoning|thought|thinking/i);
});
