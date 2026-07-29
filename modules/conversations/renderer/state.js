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
    queue: [],
    approvals: [],
  };
}
