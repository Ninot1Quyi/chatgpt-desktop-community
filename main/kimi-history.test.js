const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  getKimiConfigDir,
  listKimiSessions,
  normalizeSessionId,
  readKimiSession,
} = require("./kimi-history");

const SESSION_ID = "session_12345678-1234-1234-1234-123456789abc";

async function fixture() {
  const configDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "noma-kimi-history-"));
  const sessionDir = path.join(configDir, "sessions", "wd-test", SESSION_ID);
  const agentDir = path.join(sessionDir, "agents", "main");
  await fs.promises.mkdir(agentDir, { recursive: true });
  await fs.promises.writeFile(path.join(configDir, "session_index.jsonl"), `${JSON.stringify({
    sessionId: SESSION_ID,
    sessionDir,
    workDir: "D:/work/test",
  })}\n`);
  await fs.promises.writeFile(path.join(sessionDir, "state.json"), JSON.stringify({
    createdAt: "2026-07-28T01:00:00.000Z",
    updatedAt: "2026-07-28T01:01:00.000Z",
    title: "Kimi fixture",
    lastPrompt: "Explain this",
    workDir: "D:/work/test",
  }));
  const records = [
    { type: "turn.prompt", input: [{ type: "text", text: "Explain this" }], time: "2026-07-28T01:00:00.000Z" },
    { type: "llm.request", model: "k3", modelAlias: "kimi-code/k3", thinkingEffort: "high" },
    { type: "context.append_loop_event", event: { type: "content.part", part: { type: "think", think: "Reasoning" } } },
    { type: "context.append_loop_event", event: { type: "content.part", part: { type: "text", text: "Answer" } } },
    { type: "context.append_loop_event", event: { type: "tool.call", toolCallId: "call-1", name: "ReadFile", args: { path: "a.txt" } } },
    { type: "context.append_loop_event", event: { type: "tool.result", toolCallId: "call-1", result: { output: "contents" } } },
  ];
  await fs.promises.writeFile(
    path.join(agentDir, "wire.jsonl"),
    `${records.map((record) => JSON.stringify(record)).join("\n")}\n`,
  );
  return configDir;
}

test("normalizes only safe Kimi session IDs", () => {
  assert.equal(normalizeSessionId(`kimi:${SESSION_ID}`), SESSION_ID);
  assert.throws(() => normalizeSessionId("../../state.json"), /Invalid/);
  assert.equal(getKimiConfigDir("C:/Users/test", { KIMI_CODE_HOME: "D:/kimi-home" }), path.resolve("D:/kimi-home"));
});

test("lists and parses indexed Kimi Code sessions", async (t) => {
  const configDir = await fixture();
  t.after(() => fs.rmSync(configDir, { recursive: true, force: true }));
  const listed = await listKimiSessions({ configDir });
  assert.equal(listed.sessions.length, 1);
  assert.equal(listed.sessions[0].id, `kimi:${SESSION_ID}`);
  assert.equal(listed.sessions[0].runtime, "kimi");

  const result = await readKimiSession({ configDir, sessionId: SESSION_ID });
  assert.equal(result.thread.model, "kimi-code/k3");
  assert.equal(result.thread.effort, "high");
  assert.equal(result.turns.length, 1);
  assert.deepEqual(
    result.turns[0].items.map((item) => item.type),
    ["userMessage", "reasoning", "agentMessage", "dynamicToolCall"],
  );
  assert.equal(result.turns[0].items.at(-1).result.content, "contents");
});

test("ignores session index entries that escape the sessions directory", async (t) => {
  const configDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "noma-kimi-escape-"));
  t.after(() => fs.rmSync(configDir, { recursive: true, force: true }));
  await fs.promises.writeFile(path.join(configDir, "session_index.jsonl"), `${JSON.stringify({
    sessionId: SESSION_ID,
    sessionDir: path.dirname(configDir),
    workDir: "D:/work/test",
  })}\n`);
  const listed = await listKimiSessions({ configDir });
  assert.equal(listed.sessions.length, 0);
});
