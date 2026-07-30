import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const conversationSource = fs.readFileSync(
  new URL("../modules/conversations/renderer/Conversation.jsx", import.meta.url),
  "utf8",
);

test("worklog labels prefer semantic tool names over generic tool counts", () => {
  assert.match(
    conversationSource,
    /sources\.size === 1 \? toolActivityLabel\(toolItems\[0\]\) : "Used tools"/,
  );
  assert.doesNotMatch(conversationSource, /called \$\{tools\} tool/);
});

test("completed historical turns compact transient work without losing the final answer", () => {
  assert.match(
    conversationSource,
    /compactHistorical = !streaming && !latest && turn\.status === "completed"/,
  );
  assert.match(
    conversationSource,
    /item\.type === "agentMessage" && index !== lastAgent/,
  );
});

test("internal dynamic tools do not render as visible command activity", () => {
  assert.match(
    conversationSource,
    /function isCommandAction\(it\) \{\s*return it\.type === "commandExecution";\s*\}/,
  );
});

test("collapsed worklog activity headers use the same foreground as the official client", () => {
  assert.match(
    conversationSource,
    /data-activity-icon=\{activityKind\}[\s\S]*?"text-\(--fg\)",[\s\S]*?onClick=\{\(\) => setOpen\(!open\)\}/,
  );
});
