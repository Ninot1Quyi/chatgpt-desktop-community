export function createProjectsNavigationState(set, get) {
  return {
    threads: [],
    threadsCursor: null,
    threadsLoading: false,
    archivedView: false,
    searchTerm: "",
    navBack: [],
    navFwd: [],
    _navigating: false,
    gs: {},

    goBack() {
      const { navBack, activeThreadId } = get();
      if (!navBack.length) return;
      const previous = navBack.at(-1);
      set({
        navBack: navBack.slice(0, -1),
        navFwd: activeThreadId
          ? [...get().navFwd, activeThreadId]
          : get().navFwd,
        _navigating: true,
      });
      get().setUi({ navView: "chats" });
      get().openThread(previous);
      set({ _navigating: false });
    },

    goForward() {
      const { navFwd, activeThreadId } = get();
      if (!navFwd.length) return;
      const next = navFwd.at(-1);
      set({
        navFwd: navFwd.slice(0, -1),
        navBack: activeThreadId
          ? [...get().navBack, activeThreadId]
          : get().navBack,
        _navigating: true,
      });
      get().setUi({ navView: "chats" });
      get().openThread(next);
      set({ _navigating: false });
    },
  };
}

function unique(list) {
  return [...new Set((list || []).filter(Boolean))];
}

function moveBefore(list, sourceId, targetId) {
  const source = String(sourceId || "");
  const target = targetId == null ? null : String(targetId);
  const rest = unique(list).filter((id) => id !== source);
  if (!source) return rest;
  const index = target == null ? rest.length : rest.indexOf(target);
  const at = index < 0 ? rest.length : index;
  return [...rest.slice(0, at), source, ...rest.slice(at)];
}

export function createProjectOrderPatch(gs, sourceProjectId, targetProjectId = null) {
  const localIds = Object.keys(gs?.["local-projects"] || {});
  const remoteIds = (gs?.["remote-projects"] || []).map((project) => project?.id).filter(Boolean);
  const known = unique([...localIds, ...remoteIds]);
  const order = unique([...(gs?.["project-order"] || []), ...known]);
  return { "project-order": moveBefore(order, sourceProjectId, targetProjectId) };
}

export function createReorderedIdsPatch(key, ids, sourceId, targetId = null) {
  return { [key]: moveBefore(ids, sourceId, targetId) };
}

export function createPinnedPatch(key, ids, id, pinned) {
  const current = unique(ids);
  const next = pinned
    ? unique([...current, id])
    : current.filter((candidate) => candidate !== id);
  return { [key]: next };
}

export function createThreadProjectAssignmentPatch(gs, threadId, projectId) {
  const current = { ...(gs?.["thread-project-assignments"] || {}) };
  if (!threadId) return { "thread-project-assignments": current };
  if (projectId) current[threadId] = { projectId };
  else delete current[threadId];
  return { "thread-project-assignments": current };
}
