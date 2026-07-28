const fs = require("node:fs");
const path = require("node:path");

function extractCommand(value) {
  if (!value) return "";
  try {
    const parsed = JSON.parse(value);
    if (parsed?.cmd) return parsed.cmd;
  } catch {}
  const match = String(value).match(/(?:["']cmd["']|cmd)\s*:\s*(["'`])((?:\\.|(?!\1)[\s\S])*)\1/);
  if (!match) return "";
  if (match[1] !== "\"") {
    return match[2].replace(new RegExp(`\\\\${match[1]}`, "g"), match[1]).replace(/\\\\/g, "\\");
  }
  try {
    return JSON.parse(`"${match[2]}"`);
  } catch {
    return "";
  }
}

function parseRolloutActivity(text) {
  const pending = new Map();
  for (const line of text.split("\n")) {
    if (!line) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event.type !== "response_item") continue;
    const item = event.payload || {};
    if (item.type === "custom_tool_call" || item.type === "function_call") {
      pending.set(item.call_id, item);
    } else if (item.type === "custom_tool_call_output" || item.type === "function_call_output") {
      pending.delete(item.call_id);
    }
  }

  const item = [...pending.values()].at(-1);
  if (!item) return null;
  const command = extractCommand(item.input || item.arguments);
  if (command) {
    return {
      id: `rollout-${item.call_id}`,
      type: "commandExecution",
      command,
      status: "inProgress",
    };
  }
  return {
    id: `rollout-${item.call_id}`,
    type: "dynamicToolCall",
    tool: item.name || "tool",
    status: "inProgress",
  };
}

function readRolloutActivity(file, sessionsRoot) {
  const root = path.resolve(sessionsRoot);
  const resolved = path.resolve(file || "");
  if (!resolved.startsWith(`${root}${path.sep}`) || path.extname(resolved) !== ".jsonl") {
    throw new Error("forbidden rollout path");
  }

  const stat = fs.statSync(resolved);
  const size = Math.min(stat.size, 1024 * 1024);
  const start = stat.size - size;
  const fd = fs.openSync(resolved, "r");
  try {
    const buffer = Buffer.alloc(size);
    fs.readSync(fd, buffer, 0, size, start);
    let text = buffer.toString("utf8");
    if (start > 0) text = text.slice(text.indexOf("\n") + 1);
    return parseRolloutActivity(text);
  } finally {
    fs.closeSync(fd);
  }
}

module.exports = { extractCommand, parseRolloutActivity, readRolloutActivity };
