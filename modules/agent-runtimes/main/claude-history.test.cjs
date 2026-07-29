const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  getClaudeConfigDir,
  listClaudeSessions,
  normalizeSessionId,
  readClaudeSession,
} = require("./claude-history.cjs");

const SESSION_ID = "11111111-2222-4333-8444-555555555555";
const FALLBACK_ID = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

async function writeJsonl(filePath, rows) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8");
}

async function makeFixture() {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), "community-claude-history-"));
  const configDir = path.join(root, ".claude");
  const projectDir = path.join(configDir, "projects", "fixture-project");
  const transcriptPath = path.join(projectDir, `${SESSION_ID}.jsonl`);
  const fallbackPath = path.join(projectDir, `${FALLBACK_ID}.jsonl`);
  const subagentPath = path.join(projectDir, "subagents", "agent-hidden.jsonl");

  await writeJsonl(transcriptPath, [
    {
      type: "custom-title",
      customTitle: "Fixture conversation",
      sessionId: SESSION_ID,
    },
    {
      type: "user",
      uuid: "user-1",
      sessionId: SESSION_ID,
      timestamp: "2026-07-28T01:00:00.000Z",
      cwd: String.raw`D:\project\fixture`,
      gitBranch: "feature/history",
      isSidechain: false,
      message: { role: "user", content: "Inspect the fixture" },
    },
    {
      type: "assistant",
      uuid: "assistant-thinking",
      sessionId: SESSION_ID,
      timestamp: "2026-07-28T01:00:01.000Z",
      isSidechain: false,
      message: {
        id: "message-1",
        role: "assistant",
        content: [{ type: "thinking", thinking: "I should inspect it." }],
      },
    },
    {
      type: "assistant",
      uuid: "assistant-bash",
      sessionId: SESSION_ID,
      timestamp: "2026-07-28T01:00:02.000Z",
      isSidechain: false,
      message: {
        id: "message-1",
        role: "assistant",
        content: [{ type: "tool_use", id: "tool-bash", name: "Bash", input: { command: "dir" } }],
      },
    },
    {
      type: "user",
      uuid: "tool-result-bash",
      sessionId: SESSION_ID,
      timestamp: "2026-07-28T01:00:03.000Z",
      isSidechain: false,
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tool-bash", content: "fixture.txt" }],
      },
    },
    {
      type: "assistant",
      uuid: "assistant-read",
      sessionId: SESSION_ID,
      timestamp: "2026-07-28T01:00:04.000Z",
      isSidechain: false,
      message: {
        id: "message-2",
        role: "assistant",
        content: [{ type: "tool_use", id: "tool-read", name: "Read", input: { file_path: "fixture.txt" } }],
      },
    },
    {
      type: "user",
      uuid: "tool-result-read",
      sessionId: SESSION_ID,
      timestamp: "2026-07-28T01:00:05.000Z",
      isSidechain: false,
      message: {
        role: "user",
        content: [{ type: "tool_result", tool_use_id: "tool-read", content: "hello" }],
      },
    },
    {
      type: "assistant",
      uuid: "assistant-text",
      sessionId: SESSION_ID,
      timestamp: "2026-07-28T01:00:06.000Z",
      isSidechain: false,
      message: {
        id: "message-3",
        role: "assistant",
        content: [{ type: "text", text: "The fixture is valid." }],
      },
    },
  ]);
  await writeJsonl(fallbackPath, [
    {
      type: "user",
      uuid: "fallback-user",
      sessionId: FALLBACK_ID,
      timestamp: "2026-07-27T01:00:00.000Z",
      cwd: String.raw`D:\project\fallback`,
      isSidechain: false,
      message: { role: "user", content: "Fallback title from prompt" },
    },
  ]);
  await writeJsonl(subagentPath, [
    {
      type: "user",
      uuid: "hidden-user",
      sessionId: "99999999-8888-4777-8666-555555555555",
      timestamp: "2026-07-28T01:00:00.000Z",
      isSidechain: true,
      message: { role: "user", content: "Do not list me" },
    },
  ]);
  await fs.promises.writeFile(path.join(projectDir, "sessions-index.json"), JSON.stringify({
    version: 1,
    originalPath: String.raw`D:\project\fixture`,
    entries: [{
      sessionId: SESSION_ID,
      fullPath: transcriptPath,
      firstPrompt: "Index prompt",
      summary: "Index summary",
      messageCount: 7,
      created: "2026-07-28T01:00:00.000Z",
      modified: "2026-07-28T01:00:06.000Z",
      gitBranch: "feature/history",
      projectPath: String.raw`D:\project\fixture`,
      isSidechain: false,
    }],
  }), "utf8");

  return { root, configDir, transcriptPath };
}

test("resolves the default and overridden Claude config directories", () => {
  const homePath = path.resolve("fixture-home");
  assert.equal(getClaudeConfigDir(homePath, {}), path.join(homePath, ".claude"));
  assert.equal(getClaudeConfigDir(homePath, { CLAUDE_CONFIG_DIR: "~/custom-claude" }), path.join(homePath, "custom-claude"));
});

test("lists primary Claude sessions and reads a transcript into community-client turns", async (t) => {
  const fixture = await makeFixture();
  t.after(() => fs.promises.rm(fixture.root, { recursive: true, force: true }));

  const listed = await listClaudeSessions({ configDir: fixture.configDir });
  assert.equal(listed.sessions.length, 2);
  const indexed = listed.sessions.find((session) => session.sessionId === SESSION_ID);
  const fallback = listed.sessions.find((session) => session.sessionId === FALLBACK_ID);
  assert.equal(indexed.id, `claude:${SESSION_ID}`);
  assert.equal(indexed.name, "Fixture conversation");
  assert.equal(indexed.readOnly, true);
  assert.equal(indexed.messageCount, 7);
  assert.equal(indexed.gitInfo.branch, "feature/history");
  assert.equal(fallback.name, "Fallback title from prompt");

  const result = await readClaudeSession({
    configDir: fixture.configDir,
    sessionId: `claude:${SESSION_ID}`,
  });
  assert.equal(result.thread.path, fixture.transcriptPath);
  assert.equal(result.turns.length, 1);
  assert.deepEqual(result.turns[0].items.map((item) => item.type), [
    "userMessage",
    "reasoning",
    "commandExecution",
    "dynamicToolCall",
    "agentMessage",
  ]);
  assert.equal(result.turns[0].items[2].aggregatedOutput, "fixture.txt");
  assert.equal(result.turns[0].items[2].status, "completed");
  assert.deepEqual(result.turns[0].items[3].result, { content: "hello" });
});

test("accepts only a session ID, never an arbitrary path", async (t) => {
  const fixture = await makeFixture();
  t.after(() => fs.promises.rm(fixture.root, { recursive: true, force: true }));

  assert.equal(normalizeSessionId(`claude:${SESSION_ID}`), SESSION_ID);
  assert.throws(() => normalizeSessionId("../../auth.json"), /Invalid Claude Code session ID/);
  await assert.rejects(
    readClaudeSession({ configDir: fixture.configDir, sessionId: "12345678-not-found" }),
    /session not found/,
  );
});
