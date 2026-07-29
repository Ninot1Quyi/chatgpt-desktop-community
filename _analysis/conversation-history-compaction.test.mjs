import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../modules/conversations/renderer/Conversation.jsx", import.meta.url),
  "utf8",
);
const composerSource = fs.readFileSync(
  new URL("../modules/conversations/renderer/Composer.jsx", import.meta.url),
  "utf8",
);
const itemsSource = fs.readFileSync(
  new URL("../modules/conversations/renderer/items.jsx", import.meta.url),
  "utf8",
);

test("completed historical turns keep their final answer and semantic dividers", () => {
  assert.match(source, /compactHistorical = !streaming && !latest && turn\.status === "completed"/);
  assert.match(source, /item\.type === "agentMessage" && index !== lastAgent/);
  assert.match(source, /if \(WORK_ITEM_TYPES\.has\(item\.type\)\) return;/);
});

test("generic tools remain inspectable instead of becoming opaque tool counts", () => {
  assert.doesNotMatch(source, /called \$\{tools\}/);
  assert.match(
    source,
    /return <ItemView item=\{item\} streaming=\{live\} turnId=\{undefined\} \/>;/,
  );
  assert.match(source, /parts\.push\(toolItems\.length && sources\.size === 1 \? toolActivityLabel\(toolItems\[0\]\) : "Used tools"\)/);
});

test("manual context compaction uses the current protocol and reports its lifecycle", () => {
  assert.match(composerSource, /api\.rpc\("thread\/compact\/start", \{ threadId: activeThreadId \}\)/);
  assert.doesNotMatch(composerSource, /api\.rpc\("thread\/compact",/);
  assert.match(composerSource, /disabledMessage: "Wait for the current turn to finish"/);
  assert.match(itemsSource, /<ContextCompaction item=\{item\} streaming=\{streaming\} \/>/);
  assert.match(itemsSource, /<Divider label="Context compacted" \/>/);
  assert.match(itemsSource, /<span>Compacting context…<\/span>/);
});
