export function createConversationState(readPreference) {
  return {
    activeThreadId: null,
    conversations: {},
    pendingNewThread: false,
    cwd: readPreference("composer.cwd", null),
    runtime: readPreference("composer.runtime", "codex"),
    modelSelections: readPreference("composer.models", {
      codex: readPreference("composer.model", null),
    }),
    model: readPreference("composer.model", null),
    effort: readPreference("composer.effort", null),
    serviceTier: readPreference("composer.serviceTier", null),
    permission: readPreference("composer.permission", "ask"),
    mode: readPreference("composer.mode", "codex"),
    planMode: readPreference("composer.planMode", false),
    externalRunContexts: {},
    queue: [],
    approvals: [],
  };
}

export function enqueueConversationMessage(queue, message, id) {
  return [
    ...(Array.isArray(queue) ? queue : []),
    {
      id,
      ...message,
    },
  ];
}

export function removeConversationQueueItem(queue, threadId, id) {
  return (Array.isArray(queue) ? queue : []).filter(
    (item) => item.threadId !== threadId || item.id !== id,
  );
}

export function allocateExternalTextSegment(context, kind) {
  if (!context?.runId) throw new Error("External run context requires a runId");
  if (kind !== "message" && kind !== "reasoning") {
    throw new Error(`Unsupported external stream segment: ${kind}`);
  }
  if (context.activeTextKind === kind && context.activeTextItemId) {
    return { context, itemId: context.activeTextItemId };
  }

  const streamSegmentIndex = Number(context.streamSegmentIndex || 0) + 1;
  const itemId = `${kind === "message" ? "external-message" : "external-reasoning"}:${context.runId}:${streamSegmentIndex}`;
  return {
    context: {
      ...context,
      streamSegmentIndex,
      activeTextKind: kind,
      activeTextItemId: itemId,
    },
    itemId,
  };
}

export function markExternalToolSegment(context, toolCallId) {
  if (!context || !toolCallId) return context;
  const seenToolCallIds = Array.isArray(context.seenToolCallIds)
    ? context.seenToolCallIds
    : [];
  if (seenToolCallIds.includes(toolCallId)) return context;
  return {
    ...context,
    activeTextKind: null,
    activeTextItemId: null,
    seenToolCallIds: [...seenToolCallIds, toolCallId],
  };
}

export function reconcileExternalTurns(parsedTurns, localTurns, localTurnId) {
  const local = Array.isArray(localTurns) ? localTurns : [];
  const streamedTurn = local.find((turn) => turn.id === localTurnId);
  const completedLocal = local.map((turn) =>
    turn.id === localTurnId ? { ...turn, status: "completed" } : turn
  );

  if (!Array.isArray(parsedTurns) || parsedTurns.length === 0) {
    return completedLocal;
  }
  if (!streamedTurn) return parsedTurns;

  const streamedOutput = (streamedTurn.items || []).filter((item) => item.type !== "userMessage");
  const result = [...parsedTurns];
  const currentIndex = result.length - 1;
  const current = result[currentIndex];
  const parsedItems = Array.isArray(current.items) ? current.items : [];
  const parsedOutput = parsedItems.filter((item) => item.type !== "userMessage");
  const parsedUserItems = parsedItems.filter((item) => item.type === "userMessage");
  const streamedUserItems = (streamedTurn.items || []).filter((item) => item.type === "userMessage");
  const compatibleParsedOutput = parsedOutput.length === streamedOutput.length
    && parsedOutput.every((item, index) => item.type === streamedOutput[index]?.type);
  const reconciledOutput = streamedOutput.length === 0
    ? parsedOutput
    : compatibleParsedOutput
    ? parsedOutput.map((item, index) => ({
        ...item,
        id: streamedOutput[index].id,
      }))
    : streamedOutput;
  result[currentIndex] = {
    ...current,
    id: streamedTurn.id,
    status: "completed",
    items: [
      ...(streamedUserItems.length ? streamedUserItems : parsedUserItems),
      ...reconciledOutput,
    ],
  };
  return result;
}
