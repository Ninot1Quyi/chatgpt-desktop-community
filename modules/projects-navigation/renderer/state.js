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

    currentNavLocation() {
      const { activeThreadId, ui } = get();
      if (ui.navView === "chats" && activeThreadId) {
        return { type: "thread", threadId: activeThreadId };
      }
      return { type: "view", navView: ui.navView || "chats" };
    },

    pushNavLocation(nextLocation) {
      if (get()._navigating) return;
      const current = get().currentNavLocation();
      if (sameNavLocation(current, nextLocation)) return;
      set((s) => ({ navBack: [...s.navBack, current], navFwd: [] }));
    },

    openNavLocation(location) {
      if (!location) return;
      if (location.type === "thread" && location.threadId) {
        get().setUi({ navView: "chats" });
        get().openThread(location.threadId);
        return;
      }
      const navView = location.navView || "chats";
      set((s) => ({
        activeThreadId: navView === "chats" ? null : s.activeThreadId,
        ui: { ...s.ui, navView },
      }));
    },

    goBack() {
      const { navBack } = get();
      if (!navBack.length) return;
      const previous = navBack.at(-1);
      const current = get().currentNavLocation();
      set({
        navBack: navBack.slice(0, -1),
        navFwd: sameNavLocation(current, previous)
          ? get().navFwd
          : [...get().navFwd, current],
        _navigating: true,
      });
      get().openNavLocation(previous);
      set({ _navigating: false });
    },

    goForward() {
      const { navFwd } = get();
      if (!navFwd.length) return;
      const next = navFwd.at(-1);
      const current = get().currentNavLocation();
      set({
        navFwd: navFwd.slice(0, -1),
        navBack: sameNavLocation(current, next)
          ? get().navBack
          : [...get().navBack, current],
        _navigating: true,
      });
      get().openNavLocation(next);
      set({ _navigating: false });
    },
  };
}

export function sameNavLocation(a, b) {
  if (!a || !b || a.type !== b.type) return false;
  if (a.type === "thread") return a.threadId === b.threadId;
  return (a.navView || "chats") === (b.navView || "chats");
}

export function mostRecentThreadId(navBack, activeThreadId) {
  const locations = Array.isArray(navBack) ? navBack : [];
  return locations
    .findLast((location) =>
      location?.type === "thread"
      && location.threadId
      && location.threadId !== activeThreadId)
    ?.threadId || null;
}

export function togglePinnedId(ids, id) {
  if (!id) return ids || [];
  const current = Array.isArray(ids) ? ids : [];
  return current.includes(id)
    ? current.filter((candidate) => candidate !== id)
    : [...current, id];
}

export function createPinnedPatch(gs, key, id) {
  return { [key]: togglePinnedId(gs?.[key], id) };
}

export function createReorderedIdsPatch(gs, key, draggedId, targetId) {
  if (!draggedId || !targetId || draggedId === targetId) return null;
  const ids = Array.isArray(gs?.[key]) ? gs[key] : [];
  if (!ids.includes(draggedId) || !ids.includes(targetId)) return null;
  return { [key]: moveBefore(ids, draggedId, targetId) };
}

export function createProjectOrderPatch(gs, draggedProjectId, targetProjectId) {
  if (!draggedProjectId || !targetProjectId || draggedProjectId === targetProjectId) {
    return null;
  }
  const projectIds = [
    ...Object.keys(gs?.["local-projects"] || {}),
    ...(gs?.["remote-projects"] || []).map((project) => project?.id).filter(Boolean),
  ];
  const order = unique([...(gs?.["project-order"] || []), ...projectIds]);
  if (!order.includes(draggedProjectId) || !order.includes(targetProjectId)) {
    return null;
  }
  const withoutDragged = order.filter((id) => id !== draggedProjectId);
  const targetIndex = withoutDragged.indexOf(targetProjectId);
  if (targetIndex < 0) return null;
  withoutDragged.splice(targetIndex, 0, draggedProjectId);
  return { "project-order": withoutDragged };
}

export function createThreadProjectAssignmentPatch(gs, threadId, projectId) {
  if (!threadId) return null;
  const assignments = { ...(gs?.["thread-project-assignments"] || {}) };
  if (projectId) {
    assignments[threadId] = { ...(assignments[threadId] || {}), projectId };
  } else {
    delete assignments[threadId];
  }
  return { "thread-project-assignments": assignments };
}

function unique(list) {
  return [...new Set(list.filter(Boolean))];
}

function moveBefore(ids, draggedId, targetId) {
  const withoutDragged = ids.filter((id) => id !== draggedId);
  const targetIndex = withoutDragged.indexOf(targetId);
  if (targetIndex < 0) return ids;
  withoutDragged.splice(targetIndex, 0, draggedId);
  return withoutDragged;
}
