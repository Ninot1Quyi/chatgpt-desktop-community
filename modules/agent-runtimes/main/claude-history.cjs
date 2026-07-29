const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");

const CLAUDE_THREAD_PREFIX = "claude:";
const SESSION_ID_PATTERN = /^[a-zA-Z0-9_-]{8,128}$/;
const SUMMARY_CONCURRENCY = 6;

function getClaudeConfigDir(homePath, env = process.env) {
  const configured = env.CLAUDE_CONFIG_DIR?.trim();
  if (!configured) return path.join(homePath, ".claude");
  if (configured === "~") return homePath;
  if (configured.startsWith(`~${path.sep}`) || configured.startsWith("~/") || configured.startsWith("~\\")) {
    return path.resolve(homePath, configured.slice(2));
  }
  return path.resolve(configured);
}

function normalizeSessionId(value) {
  const raw = String(value || "");
  const sessionId = raw.startsWith(CLAUDE_THREAD_PREFIX)
    ? raw.slice(CLAUDE_THREAD_PREFIX.length)
    : raw;
  if (!SESSION_ID_PATTERN.test(sessionId)) {
    throw new Error("Invalid Claude Code session ID");
  }
  return sessionId;
}

async function collectClaudeFiles(projectsDir) {
  const transcripts = [];
  const indexes = [];

  async function visit(dir) {
    let entries;
    try {
      entries = await fs.promises.readdir(dir, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name.toLowerCase() !== "subagents") await visit(fullPath);
        continue;
      }
      if (!entry.isFile()) continue;
      if (entry.name === "sessions-index.json") {
        indexes.push(fullPath);
      } else if (entry.name.toLowerCase().endsWith(".jsonl")
        && !entry.name.toLowerCase().startsWith("agent-")) {
        transcripts.push(fullPath);
      }
    }
  }

  await visit(projectsDir);
  return { transcripts, indexes };
}

function pathKey(value) {
  return path.resolve(value).replaceAll("\\", "/").toLowerCase();
}

async function loadSessionIndexes(indexFiles) {
  const byPath = new Map();
  const byId = new Map();
  const projectDefaults = new Map();

  await Promise.all(indexFiles.map(async (indexPath) => {
    try {
      const parsed = JSON.parse(await fs.promises.readFile(indexPath, "utf8"));
      const projectDir = path.dirname(indexPath);
      if (parsed?.originalPath) projectDefaults.set(pathKey(projectDir), parsed.originalPath);
      for (const entry of parsed?.entries || []) {
        if (!entry || typeof entry !== "object") continue;
        const enriched = {
          ...entry,
          projectPath: entry.projectPath || parsed.originalPath || null,
        };
        if (entry.fullPath) byPath.set(pathKey(entry.fullPath), enriched);
        if (entry.sessionId) byId.set(String(entry.sessionId), enriched);
      }
    } catch {
      // Claude Code can update an index while it is being read. The JSONL
      // transcript remains authoritative, so a malformed/stale index is safe
      // to ignore.
    }
  }));

  return { byPath, byId, projectDefaults };
}

function parseTimestamp(value) {
  if (!value) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 10_000_000_000 ? value * 1000 : value;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function contentText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => block && (block.type === "text" || typeof block === "string"))
    .map((block) => typeof block === "string" ? block : block.text || "")
    .filter(Boolean)
    .join("\n");
}

function resultText(content) {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    return content.map((block) => {
      if (typeof block === "string") return block;
      if (block?.type === "text") return block.text || "";
      try {
        return JSON.stringify(block, null, 2);
      } catch {
        return String(block);
      }
    }).filter(Boolean).join("\n");
  }
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

function firstLine(value) {
  return String(value || "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || "";
}

function compact(value, max = 160) {
  const text = firstLine(value);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function imageContent(block) {
  const source = block?.source;
  if (!source || source.type !== "base64" || !source.data) return null;
  const mediaType = source.media_type || source.mediaType || "image/png";
  return { type: "image", url: `data:${mediaType};base64,${source.data}` };
}

function makeToolItem(block, itemId) {
  const tool = block.name || "Tool";
  const args = block.input && typeof block.input === "object" ? block.input : {};
  if (tool === "Bash") {
    return {
      id: itemId,
      type: "commandExecution",
      command: args.command || "Bash",
      aggregatedOutput: "",
      status: "inProgress",
    };
  }
  if (tool === "WebSearch") {
    return {
      id: itemId,
      type: "webSearch",
      query: args.query || "",
      status: "inProgress",
    };
  }
  return {
    id: itemId,
    type: "dynamicToolCall",
    tool,
    arguments: args,
    status: "inProgress",
  };
}

function applyToolResult(item, block) {
  const failed = !!block.is_error;
  item.status = failed ? "failed" : "completed";
  const output = resultText(block.content);
  if (item.type === "commandExecution") {
    item.aggregatedOutput = output;
  } else if (item.type === "dynamicToolCall") {
    if (failed) item.error = { message: output || "Tool call failed" };
    else item.result = { content: output };
  }
}

function createTranscriptParser(sessionId) {
  const turns = [];
  const toolItems = new Map();
  let currentTurn = null;
  let turnNumber = 0;
  let itemNumber = 0;

  const ensureTurn = (event) => {
    if (currentTurn) return currentTurn;
    const startedAt = parseTimestamp(event?.timestamp);
    currentTurn = {
      id: `claude-turn:${event?.uuid || ++turnNumber}`,
      threadId: `${CLAUDE_THREAD_PREFIX}${sessionId}`,
      status: "completed",
      startedAt: startedAt ? startedAt / 1000 : undefined,
      items: [],
    };
    turns.push(currentTurn);
    return currentTurn;
  };

  const beginUserTurn = (event, text, images) => {
    currentTurn = null;
    const turn = ensureTurn(event);
    const content = [];
    if (text) content.push({ type: "text", text });
    content.push(...images);
    turn.items.push({
      id: `claude-item:${event.uuid || ++itemNumber}`,
      type: "userMessage",
      content,
    });
  };

  const consume = (event) => {
    if (!event || event.isSidechain === true) return;
    const message = event.message;
    if (event.type === "user" && message?.role === "user") {
      const blocks = Array.isArray(message.content) ? message.content : [];
      const text = contentText(message.content);
      const images = blocks.map(imageContent).filter(Boolean);
      if (text || images.length) beginUserTurn(event, text, images);
      for (const block of blocks) {
        if (block?.type !== "tool_result" || !block.tool_use_id) continue;
        const item = toolItems.get(block.tool_use_id);
        if (item) applyToolResult(item, block);
      }
      return;
    }

    if (event.type !== "assistant" || message?.role !== "assistant") return;
    const turn = ensureTurn(event);
    const blocks = Array.isArray(message.content) ? message.content : [];
    blocks.forEach((block, index) => {
      if (!block || typeof block !== "object") return;
      const itemId = `claude-item:${event.uuid || message.id || ++itemNumber}:${index}`;
      if (block.type === "thinking" && block.thinking) {
        turn.items.push({
          id: itemId,
          type: "reasoning",
          summary: [],
          content: [block.thinking],
        });
      } else if (block.type === "text" && block.text) {
        turn.items.push({
          id: itemId,
          type: "agentMessage",
          text: block.text,
        });
      } else if (block.type === "tool_use") {
        const item = makeToolItem(block, itemId);
        turn.items.push(item);
        if (block.id) toolItems.set(block.id, item);
      }
    });
  };

  return {
    consume,
    finish() {
      for (const item of toolItems.values()) {
        if (item.status === "inProgress") item.status = "completed";
      }
      return turns.filter((turn) => turn.items.length > 0);
    },
  };
}

async function inspectTranscript(filePath, indexEntry, projectPath, { includeTurns = false } = {}) {
  const stat = await fs.promises.stat(filePath);
  const fallbackId = path.basename(filePath, path.extname(filePath));
  let sessionId = indexEntry?.sessionId || fallbackId;
  let customTitle = "";
  let agentName = "";
  let firstPrompt = indexEntry?.firstPrompt || "";
  let cwd = indexEntry?.projectPath || projectPath || "";
  let gitBranch = indexEntry?.gitBranch || "";
  let createdMs = parseTimestamp(indexEntry?.created);
  let updatedMs = parseTimestamp(indexEntry?.modified) || stat.mtimeMs;
  let messageCount = 0;
  let sidechain = indexEntry?.isSidechain === true;
  const parser = includeTurns ? createTranscriptParser(sessionId) : null;

  const input = fs.createReadStream(filePath, { encoding: "utf8" });
  const lines = readline.createInterface({ input, crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.sessionId) sessionId = String(event.sessionId);
    if (event.type === "custom-title" && event.customTitle) customTitle = event.customTitle;
    if (event.type === "agent-name" && event.agentName) agentName = event.agentName;
    if (!cwd && event.cwd) cwd = event.cwd;
    if (!gitBranch && event.gitBranch) gitBranch = event.gitBranch;
    if (event.isSidechain === true) sidechain = true;
    const timestamp = parseTimestamp(event.timestamp);
    if (timestamp) {
      if (!createdMs || timestamp < createdMs) createdMs = timestamp;
      if (!updatedMs || timestamp > updatedMs) updatedMs = timestamp;
    }
    if (event.type === "user" || event.type === "assistant") messageCount += 1;
    if (!firstPrompt && event.type === "user" && event.message?.role === "user") {
      firstPrompt = contentText(event.message.content);
    }
    parser?.consume(event);
  }

  const indexedSummary = indexEntry?.summary || "";
  const title = compact(customTitle)
    || compact(agentName)
    || compact(indexedSummary)
    || compact(firstPrompt)
    || `Claude session ${sessionId.slice(0, 8)}`;
  const preview = compact(indexedSummary || firstPrompt);
  const thread = {
    id: `${CLAUDE_THREAD_PREFIX}${sessionId}`,
    sessionId,
    source: "claude",
    provider: "claude-code",
    readOnly: true,
    name: title,
    preview,
    cwd: cwd || "",
    projectPath: cwd || "",
    path: filePath,
    createdAt: (createdMs || stat.birthtimeMs || stat.mtimeMs) / 1000,
    updatedAt: (updatedMs || stat.mtimeMs) / 1000,
    messageCount: Number.isFinite(indexEntry?.messageCount) ? indexEntry.messageCount : messageCount,
    gitInfo: gitBranch ? { branch: gitBranch } : null,
    isSidechain: sidechain,
  };
  return {
    thread,
    turns: parser?.finish() || [],
  };
}

async function mapLimit(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      results[index] = await mapper(items[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}

async function listClaudeSessions({ configDir } = {}) {
  if (!configDir) throw new Error("Claude Code config directory is required");
  const projectsDir = path.join(configDir, "projects");
  const files = await collectClaudeFiles(projectsDir);
  const indexes = await loadSessionIndexes(files.indexes);
  const inspected = await mapLimit(files.transcripts, SUMMARY_CONCURRENCY, async (filePath) => {
    try {
      const projectDir = path.dirname(filePath);
      const fallbackId = path.basename(filePath, path.extname(filePath));
      const indexEntry = indexes.byPath.get(pathKey(filePath)) || indexes.byId.get(fallbackId);
      const projectPath = indexes.projectDefaults.get(pathKey(projectDir));
      return await inspectTranscript(filePath, indexEntry, projectPath);
    } catch {
      return null;
    }
  });
  const sessions = inspected
    .filter((result) => result?.thread && !result.thread.isSidechain)
    .map((result) => result.thread)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return {
    configDir,
    projectsDir,
    sessions,
  };
}

async function readClaudeSession({ configDir, sessionId: value } = {}) {
  if (!configDir) throw new Error("Claude Code config directory is required");
  const sessionId = normalizeSessionId(value);
  const projectsDir = path.join(configDir, "projects");
  const files = await collectClaudeFiles(projectsDir);
  const indexes = await loadSessionIndexes(files.indexes);
  const indexedPath = indexes.byId.get(sessionId)?.fullPath;
  const candidates = new Map(files.transcripts.map((filePath) => [pathKey(filePath), filePath]));
  const filePath = files.transcripts.find(
    (candidate) => path.basename(candidate, path.extname(candidate)) === sessionId,
  ) || (indexedPath ? candidates.get(pathKey(indexedPath)) : null);
  if (!filePath) throw new Error("Claude Code session not found");

  const projectDir = path.dirname(filePath);
  const indexEntry = indexes.byPath.get(pathKey(filePath)) || indexes.byId.get(sessionId);
  const projectPath = indexes.projectDefaults.get(pathKey(projectDir));
  const result = await inspectTranscript(filePath, indexEntry, projectPath, { includeTurns: true });
  if (result.thread.isSidechain) throw new Error("Claude Code subagent sessions are not exposed");
  return result;
}

module.exports = {
  CLAUDE_THREAD_PREFIX,
  getClaudeConfigDir,
  listClaudeSessions,
  normalizeSessionId,
  readClaudeSession,
};
