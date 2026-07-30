import test from "node:test";
import assert from "node:assert/strict";

import {
  allocateExternalTextSegment,
  enqueueConversationMessage,
  markExternalToolSegment,
  reconcileExternalTurns,
  removeConversationQueueItem,
} from "./state.js";

const localTurn = {
  id: "local-turn",
  status: "inProgress",
  items: [
    { id: "local-user", type: "userMessage", content: "hello" },
    { id: "stream-message", type: "agentMessage", text: "streamed answer" },
    { id: "stream-tool", type: "dynamicToolCall", tool: "Shell", status: "completed" },
  ],
};

test("preserves streamed output when final external history is prompt-only", () => {
  const result = reconcileExternalTurns([
    {
      id: "parsed-turn",
      status: "completed",
      items: [{ id: "parsed-user", type: "userMessage", content: "hello" }],
    },
  ], [localTurn], localTurn.id);

  assert.deepEqual(result[0].items.map((item) => item.id), [
    "local-user",
    "stream-message",
    "stream-tool",
  ]);
  assert.equal(result[0].status, "completed");
  assert.equal(result[0].id, "local-turn");
});

test("adopts complete parsed output without replacing live item identities", () => {
  const parsed = [{
    id: "parsed-turn",
    status: "completed",
    items: [
      { id: "parsed-user", type: "userMessage", content: "hello" },
      { id: "parsed-message", type: "agentMessage", text: "saved answer" },
      { id: "parsed-tool", type: "dynamicToolCall", tool: "Shell", status: "completed" },
    ],
  }];

  const result = reconcileExternalTurns(parsed, [localTurn], localTurn.id);

  assert.equal(result[0].id, "local-turn");
  assert.deepEqual(result[0].items.map((item) => item.id), [
    "local-user",
    "stream-message",
    "stream-tool",
  ]);
  assert.equal(result[0].items[1].text, "saved answer");
});

test("completes the streamed local turn when final history is empty", () => {
  const result = reconcileExternalTurns([], [localTurn], localTurn.id);

  assert.equal(result[0].status, "completed");
  assert.equal(result[0].items[1].text, "streamed answer");
});

test("allocates a fresh reasoning item after a tool timeline boundary", () => {
  const initial = { runId: "run-1" };
  const firstThought = allocateExternalTextSegment(initial, "reasoning");
  const continuedThought = allocateExternalTextSegment(firstThought.context, "reasoning");
  const afterTool = markExternalToolSegment(continuedThought.context, "tool-1");
  const secondThought = allocateExternalTextSegment(afterTool, "reasoning");

  assert.equal(firstThought.itemId, "external-reasoning:run-1:1");
  assert.equal(continuedThought.itemId, firstThought.itemId);
  assert.equal(secondThought.itemId, "external-reasoning:run-1:2");
});

test("a repeated update for the same tool does not split the following text", () => {
  const afterTool = markExternalToolSegment({ runId: "run-1" }, "tool-1");
  const message = allocateExternalTextSegment(afterTool, "message");
  const repeatedToolUpdate = markExternalToolSegment(message.context, "tool-1");
  const continuedMessage = allocateExternalTextSegment(repeatedToolUpdate, "message");

  assert.equal(continuedMessage.itemId, message.itemId);
});

test("removes one queued message without clearing its thread or another thread", () => {
  const queue = enqueueConversationMessage([], {
    threadId: "thread-a",
    text: "first",
    images: [],
    mentions: [],
  }, "queue-1");
  const withSecond = enqueueConversationMessage(queue, {
    threadId: "thread-a",
    text: "second",
    images: [],
    mentions: [],
  }, "queue-2");
  const withOtherThread = enqueueConversationMessage(withSecond, {
    threadId: "thread-b",
    text: "third",
    images: [],
    mentions: [],
  }, "queue-3");

  assert.deepEqual(
    removeConversationQueueItem(withOtherThread, "thread-a", "queue-1")
      .map((item) => item.id),
    ["queue-2", "queue-3"],
  );
});
