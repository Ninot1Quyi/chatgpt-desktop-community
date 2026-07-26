import assert from "node:assert/strict";
import { commandActivity, displayCommand } from "../renderer/src/lib/commandActivity.mjs";

assert.equal(displayCommand(`/bin/zsh -lc "node _analysis/cdp-shot.mjs"`), "node _analysis/cdp-shot.mjs");
assert.deepEqual(
  commandActivity({ status: "completed", commandActions: [{ type: "read", path: "/tmp/icon-parity.mjs", name: "icon-parity.mjs", command: "sed" }] }),
  { kind: "read-files", category: "exploration", label: "Read icon-parity.mjs" },
);
assert.equal(
  commandActivity({ status: "completed", commandActions: [{ type: "search", query: "BookOpen", path: null, command: "rg" }] }).label,
  "Searched for BookOpen",
);
assert.deepEqual(
  commandActivity({ status: "completed", command: "sed -n '1,80p' renderer/src/components/Conversation.jsx" }),
  { kind: "read-files", category: "exploration", label: "Read Conversation.jsx" },
);
assert.deepEqual(
  commandActivity({ status: "completed", command: "rg -n 'function WorklogGroup' renderer/src/components/Conversation.jsx" }),
  { kind: "code-searching", category: "exploration", label: "Searched for function WorklogGroup" },
);
assert.deepEqual(
  commandActivity({ status: "completed", command: "find renderer/src/components -maxdepth 1 -type f" }),
  { kind: "list-files", category: "exploration", label: "Listed files in components folder" },
);
assert.equal(commandActivity({ status: "completed", command: "git diff --check" }).kind, "run-command");
