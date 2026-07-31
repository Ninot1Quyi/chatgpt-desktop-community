import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../modules/conversations/renderer/Conversation.jsx", import.meta.url),
  "utf8",
);

test("subagent activity is rendered as interactive agent chips", () => {
  assert.match(source, /data-testid="subagent-activity-inline-group"/);
  assert.match(source, /onClick=\{\(\) => item\.agentThreadId && openThread\(item\.agentThreadId\)\}/);
  assert.match(source, /agents\.slice\(0, 3\)/);
});

test("subagent state changes split activity groups instead of becoming generic tool counts", () => {
  assert.match(source, /if \(buf\.length && subAgentKind !== bufferedSubAgentKind\) flush\(\);/);
  assert.match(source, /items\.every\(\(item\) => item\.type === "subAgentActivity"\)/);
});
