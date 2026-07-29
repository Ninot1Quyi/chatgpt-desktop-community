export function createAgentRuntimeState() {
  return {
    runtimeCatalog: {},
    modelsByRuntime: { codex: [], claude: [], kimi: [] },
    models: [],
    claudeThreads: [],
    claudeThreadsLoading: false,
    claudeThreadsError: null,
    claudeConfigDir: null,
    kimiThreads: [],
    kimiThreadsLoading: false,
    kimiThreadsError: null,
    kimiConfigDir: null,
    externalAuth: {},
    externalAuthChecked: false,
  };
}
