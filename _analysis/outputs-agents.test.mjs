import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  agentStatusLabel,
  summarizeAgentsFromConversation,
} from "../modules/workspace-panels/renderer/outputs-agents.mjs";

test("outputs subagents prefer protocol agentsStates and dedupe repeated history events", () => {
  const summary = summarizeAgentsFromConversation({
    activeTurnId: "turn-active",
    turns: [
      {
        id: "turn-old",
        items: [
          { type: "subAgentActivity", id: "a1-start", agentThreadId: "agent-a", agentPath: "/root/agent_a", kind: "started" },
          { type: "subAgentActivity", id: "a1-ping", agentThreadId: "agent-a", agentPath: "/root/agent_a", kind: "interacted" },
          {
            type: "collabAgentToolCall",
            id: "spawn-a",
            tool: "spawnAgent",
            status: "completed",
            senderThreadId: "root",
            receiverThreadIds: ["agent-a"],
            agentsStates: {
              "agent-a": { status: "completed", message: "done now" },
            },
          },
        ],
      },
      {
        id: "turn-active",
        items: [
          {
            type: "collabAgentToolCall",
            id: "spawn-b",
            tool: "spawnAgent",
            status: "inProgress",
            senderThreadId: "root",
            receiverThreadIds: ["agent-b"],
            agentsStates: {
              "agent-b": { status: "running", message: "working now" },
            },
          },
          { type: "subAgentActivity", id: "a2-start", agentThreadId: "agent-b", agentPath: "/root/agent_b", kind: "interacted" },
        ],
      },
    ],
  });

  assert.equal(summary.total, 2);
  assert.equal(summary.working, 1);
  assert.equal(summary.done, 1);
  assert.deepEqual(
    summary.list.map((agent) => [agent.agentThreadId, agent.status, agent.source, agent.message]),
    [
      ["agent-a", "completed", "protocol", "done now"],
      ["agent-b", "running", "protocol", "working now"],
    ],
  );
});

test("outputs subagents keep legacy activity as one agent per thread", () => {
  const summary = summarizeAgentsFromConversation({
    activeTurnId: "turn-active",
    turns: [
      {
        id: "turn-active",
        items: [
          { type: "subAgentActivity", id: "start", agentThreadId: "same-agent", agentPath: "/root/monitor_123", kind: "started" },
          { type: "subAgentActivity", id: "ping-1", agentThreadId: "same-agent", agentPath: "/root/monitor_123", kind: "interacted" },
          { type: "subAgentActivity", id: "ping-2", agentThreadId: "same-agent", agentPath: "/root/monitor_123", kind: "interacted" },
        ],
      },
    ],
  });

  assert.equal(summary.total, 1);
  assert.equal(summary.working, 1);
  assert.equal(summary.done, 0);
  assert.equal(summary.list[0].name, "monitor 123");
});

test("outputs subagents expose clickable expandable details in the panel", () => {
  const source = readFileSync(
    new URL("../modules/workspace-panels/renderer/OutputsPanel.jsx", import.meta.url),
    "utf8",
  );

  assert.match(source, /const \[agentsOpen, setAgentsOpen\] = useState\(false\);/);
  assert.match(source, /onClick=\{\(\) => setAgentsOpen\(\(open\) => !open\)\}/);
  assert.match(source, /ariaExpanded=\{agentsOpen\}/);
  assert.match(source, /\{agentsOpen && <SubagentsDetails agents=\{agents\.list\} \/>\}/);
});

test("outputs subagent status labels stay user-facing", () => {
  assert.equal(agentStatusLabel("running"), "working");
  assert.equal(agentStatusLabel("pendingInit"), "working");
  assert.equal(agentStatusLabel("completed"), "done");
  assert.equal(agentStatusLabel("errored"), "failed");
});
