import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const storeSource = fs.readFileSync(new URL("../renderer/src/store.js", import.meta.url), "utf8");
const itemsSource = fs.readFileSync(new URL("../modules/conversations/renderer/items.jsx", import.meta.url), "utf8");
const conversationSource = fs.readFileSync(
  new URL("../modules/conversations/renderer/Conversation.jsx", import.meta.url),
  "utf8",
);

test("dynamic tool requests fail explicitly with the app-server response shape", () => {
  assert.match(storeSource, /case "item\/tool\/call": \{/);
  assert.match(storeSource, /const contentItems = \[\{ type: "inputText", text: message \}\];/);
  assert.match(storeSource, /type: "dynamicToolCall",[\s\S]*?namespace: params\.namespace \?\? null,[\s\S]*?success: false,[\s\S]*?contentItems,/);
  assert.match(storeSource, /api\.respond\(id, \{ success: false, contentItems \}\);/);
  assert.doesNotMatch(storeSource, /api\.respond\(id, null, "Dynamic tool calls are not supported by this client"\)/);
});

test("MCP progress notifications update the existing live tool item", () => {
  assert.match(storeSource, /case "item\/mcpToolCall\/progress":/);
  assert.match(storeSource, /progressMessage: params\.message,/);
  assert.match(storeSource, /status: it\.status \|\| "inProgress",/);
});

test("dynamic tool rows expose protocol input and output fields", () => {
  assert.match(itemsSource, /Namespace: \{item\.namespace\}/);
  assert.match(itemsSource, /item\.progressMessage/);
  assert.match(itemsSource, /Array\.isArray\(item\.contentItems\)/);
  assert.match(itemsSource, /contentItem\?\.type === "inputText"/);
  assert.match(itemsSource, /item\.status === "failed" \|\| item\.success === false/);
});

test("reasoning remains opt-in while Kimi can stream thought text when expanded", () => {
  assert.match(itemsSource, /if \(item\.type === "reasoning" && !showReasoning\) return null;/);
  assert.match(conversationSource, /const text = itemText\(item, showReasoning\);/);
  assert.match(
    conversationSource,
    /case "reasoning":[\s\S]*?return showReasoning[\s\S]*?: "";/,
  );
  assert.match(itemsSource, /case "reasoning": return <Reasoning item=\{item\} streaming=\{streaming\} \/>/);
  assert.match(itemsSource, /<AgentMessage item=\{item\} streaming=\{streaming\} showThinking=\{showReasoning\} \/>/);
  assert.match(itemsSource, /aria-expanded=\{open\}/);
  assert.match(itemsSource, /onClick=\{\(\) => setOpen\(!open\)\}/);
  assert.match(itemsSource, /\{open && text && \(/);
  assert.doesNotMatch(itemsSource, /onClick=\{\(\) => !streaming && setOpen/);
  assert.doesNotMatch(itemsSource, /\{open && !streaming && text && \(/);
  assert.match(storeSource, /content\[0\] = \(content\[0\] \|\| ""\) \+ delta;/);
});

test("hook prompts render as right-aligned user-style feedback bubbles", () => {
  assert.match(itemsSource, /case "hookPrompt": return <HookPrompt item=\{item\} \/>/);
  assert.match(itemsSource, /function HookPrompt\(\{ item \}\) \{/);
  assert.match(itemsSource, /max-w-\[77%\] rounded-\[20px\] bg-\(--bubble-user\)/);
  assert.match(itemsSource, />Hook feedback<\/div>/);
  assert.match(itemsSource, /function hookPromptText\(item\) \{/);
});
