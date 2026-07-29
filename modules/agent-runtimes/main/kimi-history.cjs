const fs = require("node:fs");
const path = require("node:path");

const KIMI_THREAD_PREFIX = "kimi:";
const SESSION_ID_RE = /^session_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getKimiConfigDir(homePath, env = process.env) {
  return path.resolve(env.KIMI_CODE_HOME || path.join(homePath, ".kimi-code"));
}

function normalizeSessionId(value) {
  const raw = String(value || "");
  const id = raw.startsWith(KIMI_THREAD_PREFIX) ? raw.slice(KIMI_THREAD_PREFIX.length) : raw;
  if (!SESSION_ID_RE.test(id)) throw new Error("Invalid Kimi Code session ID");
  return id;
}

function isInside(child, parent) {
  const relative = path.relative(path.resolve(parent), path.resolve(child));
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

async function readJson(filePath) {
  return JSON.parse(await fs.promises.readFile(filePath, "utf8"));
}

async function readIndex(configDir) {
  const filePath = path.join(configDir, "session_index.jsonl");
  let content = "";
  try {
    content = await fs.promises.readFile(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  const sessionsRoot = path.join(configDir, "sessions");
  const byId = new Map();
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      const entry = JSON.parse(line);
      const sessionId = normalizeSessionId(entry.sessionId);
      const sessionDir = path.resolve(entry.sessionDir || "");
      if (!isInside(sessionDir, sessionsRoot)) continue;
      byId.set(sessionId, {
        sessionId,
        sessionDir,
        workDir: typeof entry.workDir === "string" ? entry.workDir : null,
      });
    } catch {}
  }
  return [...byId.values()];
}

function parseTime(value, fallback = 0) {
  const time = Date.parse(value || "");
  return Number.isFinite(time) ? time / 1000 : fallback;
}

function firstLine(value) {
  return String(value || "").split(/\r?\n/, 1)[0].trim();
}

async function summarizeSession(entry) {
  const statePath = path.join(entry.sessionDir, "state.json");
  const stat = await fs.promises.stat(entry.sessionDir);
  let state = {};
  try { state = await readJson(statePath); } catch {}
  const name = firstLine(state.title) || firstLine(state.lastPrompt) || "Kimi Code session";
  return {
    id: `${KIMI_THREAD_PREFIX}${entry.sessionId}`,
    sessionId: entry.sessionId,
    source: "kimi",
    runtime: "kimi",
    readOnly: false,
    name,
    preview: firstLine(state.lastPrompt),
    cwd: state.workDir || entry.workDir,
    path: entry.sessionDir,
    createdAt: parseTime(state.createdAt, stat.birthtimeMs / 1000),
    updatedAt: parseTime(state.updatedAt, stat.mtimeMs / 1000),
  };
}

function inputContent(input) {
  const content = [];
  for (const part of Array.isArray(input) ? input : []) {
    if (part?.type === "text" && part.text) content.push({ type: "text", text: part.text });
    if (part?.type === "image_url" && part.imageUrl) {
      const url = typeof part.imageUrl === "string" ? part.imageUrl : part.imageUrl.url;
      if (url) content.push({ type: "image", url });
    }
  }
  return content;
}

async function parseWire(entry) {
  const candidates = [
    path.join(entry.sessionDir, "agents", "main", "wire.jsonl"),
    path.join(entry.sessionDir, "wire.jsonl"),
  ];
  const wirePath = candidates.find((candidate) => fs.existsSync(candidate));
  if (!wirePath) return { turns: [], model: null, effort: null };
  const lines = (await fs.promises.readFile(wirePath, "utf8")).split(/\r?\n/);
  const turns = [];
  const tools = new Map();
  let current = null;
  let itemNumber = 0;
  let model = null;
  let effort = null;

  const ensureTurn = (time) => {
    if (current) return current;
    current = {
      id: `kimi-turn:${turns.length + 1}`,
      threadId: `${KIMI_THREAD_PREFIX}${entry.sessionId}`,
      status: "completed",
      startedAt: parseTime(time) || undefined,
      items: [],
    };
    turns.push(current);
    return current;
  };

  for (const line of lines) {
    if (!line.trim()) continue;
    let record;
    try { record = JSON.parse(line); } catch { continue; }
    if (record.type === "llm.request") {
      model = record.modelAlias || record.model || model;
      effort = record.thinkingEffort || effort;
      continue;
    }
    if (record.type === "turn.prompt" || record.type === "turn.steer") {
      current = null;
      const turn = ensureTurn(record.time);
      const content = inputContent(record.input);
      if (content.length) {
        turn.items.push({
          id: `kimi-item:${++itemNumber}`,
          type: "userMessage",
          content,
        });
      }
      continue;
    }
    if (record.type !== "context.append_loop_event" || !record.event) continue;
    const event = record.event;
    const turn = ensureTurn(record.time);
    if (event.type === "content.part") {
      if (event.part?.type === "text" && event.part.text) {
        turn.items.push({
          id: `kimi-item:${++itemNumber}`,
          type: "agentMessage",
          text: event.part.text,
        });
      } else if (event.part?.type === "think" && event.part.think) {
        turn.items.push({
          id: `kimi-item:${++itemNumber}`,
          type: "reasoning",
          summary: [],
          content: [event.part.think],
        });
      }
    } else if (event.type === "tool.call") {
      const item = {
        id: `kimi-item:${++itemNumber}`,
        type: "dynamicToolCall",
        tool: event.name || "tool",
        status: "inProgress",
        arguments: event.args || {},
      };
      turn.items.push(item);
      if (event.toolCallId) tools.set(event.toolCallId, item);
    } else if (event.type === "tool.result") {
      const item = tools.get(event.toolCallId);
      if (item) {
        item.status = "completed";
        const output = event.result?.output ?? event.result;
        item.result = { content: typeof output === "string" ? output : JSON.stringify(output ?? "") };
      }
    }
  }
  for (const item of tools.values()) {
    if (item.status === "inProgress") item.status = "completed";
  }
  return {
    turns: turns.filter((turn) => turn.items.length),
    model,
    effort,
    wirePath,
  };
}

async function listKimiSessions({ configDir } = {}) {
  if (!configDir) throw new Error("Kimi Code config directory is required");
  const entries = await readIndex(configDir);
  const sessions = (await Promise.all(entries.map(async (entry) => {
    try { return await summarizeSession(entry); } catch { return null; }
  }))).filter(Boolean).sort((a, b) => b.updatedAt - a.updatedAt);
  return { configDir, sessions };
}

async function readKimiSession({ configDir, sessionId: value } = {}) {
  if (!configDir) throw new Error("Kimi Code config directory is required");
  const sessionId = normalizeSessionId(value);
  const entry = (await readIndex(configDir)).find((candidate) => candidate.sessionId === sessionId);
  if (!entry) throw new Error("Kimi Code session not found");
  const [thread, wire] = await Promise.all([summarizeSession(entry), parseWire(entry)]);
  return {
    thread: { ...thread, model: wire.model, effort: wire.effort },
    turns: wire.turns,
  };
}

module.exports = {
  KIMI_THREAD_PREFIX,
  getKimiConfigDir,
  listKimiSessions,
  normalizeSessionId,
  readIndex,
  readKimiSession,
};
