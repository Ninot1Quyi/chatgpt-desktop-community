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
