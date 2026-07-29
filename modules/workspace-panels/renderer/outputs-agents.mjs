const RUNNING_AGENT_STATUSES = new Set(["pendingInit", "running"]);
const DONE_AGENT_STATUSES = new Set(["completed", "interrupted", "errored", "shutdown", "notFound"]);

function displayNameFromPath(path) {
  const base = String(path || "").replace(/\/+$/, "").split("/").filter(Boolean).pop();
  return base ? base.replace(/[_-]+/g, " ") : "";
}

function ensureAgent(map, id, values = {}) {
  const key = String(id || values.agentThreadId || values.agentPath || "").trim();
  if (!key) return null;
  const previous = map.get(key) || {
    id: key,
    agentThreadId: values.agentThreadId || key,
    agentPath: values.agentPath || "",
    name: "",
    status: "completed",
    message: "",
    source: "history",
    sequence: -1,
  };
  const next = {
    ...previous,
    ...values,
    id: key,
    agentThreadId: values.agentThreadId || previous.agentThreadId || key,
    agentPath: values.agentPath || previous.agentPath || "",
    message: values.message ?? previous.message ?? "",
    source: values.source || previous.source,
    sequence: values.sequence ?? previous.sequence,
  };
  next.name = values.name || previous.name || displayNameFromPath(next.agentPath) || next.agentThreadId || key;
  map.set(key, next);
  return next;
}

function statusFromActivity(kind, turnActive) {
  if (kind === "interrupted" || kind === "finished" || kind === "completed") return "interrupted";
  if ((kind === "started" || kind === "interacted") && turnActive) return "running";
  return "completed";
}

export function summarizeAgentsFromConversation(conv) {
  const byAgent = new Map();
  const activeTurnId = conv?.activeTurnId || null;
  let sequence = 0;

  for (const turn of conv?.turns || []) {
    const turnActive = activeTurnId && turn.id === activeTurnId;
    for (const item of turn.items || []) {
      sequence += 1;
      if (item?.type === "collabAgentToolCall") {
        const receiverThreadIds = Array.isArray(item.receiverThreadIds) ? item.receiverThreadIds : [];
        const stateEntries = Object.entries(item.agentsStates || {});
        const stateIds = new Set(stateEntries.map(([agentId]) => String(agentId)));
        for (const [agentId, state] of stateEntries) {
          ensureAgent(byAgent, agentId, {
            agentThreadId: agentId,
            status: state?.status || (item.status === "inProgress" ? "running" : "completed"),
            message: state?.message || item.prompt || "",
            source: "protocol",
            sequence,
          });
        }
        for (const agentId of receiverThreadIds) {
          if (stateIds.has(String(agentId))) continue;
          ensureAgent(byAgent, agentId, {
            agentThreadId: agentId,
            status: item.status === "inProgress" ? "running" : "completed",
            message: item.prompt || "",
            source: "protocol",
            sequence,
          });
        }
      } else if (item?.type === "subAgentActivity") {
        const agentId = item.agentThreadId || item.agentPath;
        const previous = agentId ? byAgent.get(String(agentId)) : null;
        if (previous?.source === "protocol") {
          if (!previous.agentPath && item.agentPath) previous.agentPath = item.agentPath;
          if (!previous.name || previous.name === previous.agentThreadId) {
            previous.name = displayNameFromPath(item.agentPath) || previous.name;
          }
          continue;
        }
        ensureAgent(byAgent, agentId, {
          agentThreadId: item.agentThreadId || agentId,
          agentPath: item.agentPath || previous?.agentPath || "",
          status: statusFromActivity(item.kind, turnActive),
          source: "history",
          sequence,
        });
      }
    }
  }

  const list = [...byAgent.values()].sort((a, b) => a.sequence - b.sequence || a.id.localeCompare(b.id));
  const working = list.filter((agent) => RUNNING_AGENT_STATUSES.has(agent.status)).length;
  const done = list.filter((agent) => !RUNNING_AGENT_STATUSES.has(agent.status)).length;
  return { working, done, total: list.length, list };
}

export function agentStatusLabel(status) {
  if (RUNNING_AGENT_STATUSES.has(status)) return "working";
  if (status === "errored") return "failed";
  if (status === "notFound") return "not found";
  if (DONE_AGENT_STATUSES.has(status)) return "done";
  return String(status || "done");
}
