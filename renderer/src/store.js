import { create } from "zustand";
import * as api from "./api.js";
import { panelHook } from "./lib/panelHook.js";
import { applyAppearance } from "./lib/appearance.js";

// ---------------------------------------------------------------------------
// Permission presets → (approvalPolicy, approvalsReviewer, sandbox, sandboxPolicy)
// `custom` omits all overrides so the app-server's config.toml applies.
// ---------------------------------------------------------------------------
export const PERMISSIONS = {
  ask: {
    label: "Ask for approval",
    approvalPolicy: "on-request",
    sandbox: "workspace-write",
    sandboxPolicy: { type: "workspaceWrite" },
  },
  approve: {
    label: "Approve for me",
    approvalPolicy: "on-request",
    approvalsReviewer: "auto_review",
    sandbox: "workspace-write",
    sandboxPolicy: { type: "workspaceWrite" },
  },
  full: {
    label: "Full access",
    approvalPolicy: "never",
    sandbox: "danger-full-access",
    sandboxPolicy: { type: "dangerFullAccess" },
  },
  custom: {
    label: "Custom (config.toml)",
    // No overrides: the user's config.toml decides.
  },
};

// Migrate a legacy stored value ("readonly" → "ask").
export function normalizePermission(p) {
  return PERMISSIONS[p] ? p : "ask";
}

const stored = (k, fallback) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const persist = (k, v) => {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
  // mirror to a file backup; localStorage does not survive hard kills
  try { api.prefsWrite(k, v); } catch {}
};
const threadPlanKey = (threadId) => `thread.plan.${threadId}`;

let toastSeq = 0;

export const useStore = create((set, get) => ({
  // ---- connection ----
  status: "starting",
  codexHome: null,
  binary: null,
  binaryCandidates: [],
  backendError: null,
  appInfo: null,
  account: null,
  accountChecked: false,
  requiresOpenaiAuth: false,
  loginStatus: "idle",
  loginError: null,
  loginId: null,
  models: [],

  // ---- thread list ----
  threads: [],
  threadsCursor: null,
  threadsLoading: false,
  archivedView: false,
  searchTerm: "",

  // ---- conversations ----
  activeThreadId: null,
  conversations: {}, // threadId -> Conversation
  pendingNewThread: false,

  // ---- composer prefs ----
  cwd: stored("composer.cwd", null),
  model: stored("composer.model", null),
  effort: stored("composer.effort", null),
  serviceTier: stored("composer.serviceTier", null), // null = Standard; "priority" = Fast
  permission: stored("composer.permission", "ask"),
  mode: stored("composer.mode", "codex"), // codex | chatgpt (product switcher)
  planMode: stored("composer.planMode", false),
  queue: [], // messages queued while a turn runs

  // ---- approvals (server-initiated requests) ----
  approvals: [], // {reqId, kind, threadId, turnId, itemId, title, detail, raw}

  // ---- ui ----
  ui: {
    sidebarOpen: stored("ui.sidebarOpen", true),
    sidebarWidth: stored("ui.sidebarWidth", 240),
    rightOpen: stored("ui.rightOpen", false),
    rightTab: stored("ui.rightTab", "review"),
    rightWidth: stored("ui.rightWidth", Math.round((globalThis.innerWidth || 1440) * 0.52)),
    rightExpanded: stored("ui.rightExpanded", false),
    terminalLocation: stored("ui.terminalLocation", "bottom"),
    suggestedPrompts: stored("ui.suggestedPrompts", true),
    theme: stored("ui.theme", "system"),
    commandMenuOpen: false,
    settingsOpen: false,
    settingsSection: null, // deep-link target section consumed on open
    pluginsTab: "plugins", // plugins | skills (header-band tabs)
    navView: "chats", // chats | pull-requests | sites | scheduled | plugins
    pinnedProjects: stored("ui.pinnedProjects", []), // cwd strings
    keybindings: stored("ui.keybindings", {}), // command id -> accelerator string
  },
  toasts: [],
  navBack: [], // threadId stack for back navigation
  navFwd: [],
  gs: {}, // shared codex global state (projects/pins/assignments)
  profile: null, // { name, username, photo(dataUrl) } from /wham/profiles/me
  renameRequest: 0, // bump to open the thread rename dialog (⌃R)
  draftAt: 0, // when the current new-chat draft was opened (seconds)
  composerPrefill: null, // { text, nonce } — Composer consumes and clears

  setKeybinding(commandId, accel) {
    const next = { ...get().ui.keybindings, [commandId]: accel };
    if (!accel) delete next[commandId];
    get().setUi({ keybindings: next });
    persist("ui.keybindings", next);
  },

  goBack() {
    const { navBack, activeThreadId } = get();
    if (!navBack.length) return;
    const prev = navBack[navBack.length - 1];
    set({
      navBack: navBack.slice(0, -1),
      navFwd: activeThreadId ? [...get().navFwd, activeThreadId] : get().navFwd,
      _navigating: true,
    });
    get().setUi({ navView: "chats" });
    get().openThread(prev);
    set({ _navigating: false });
  },

  goForward() {
    const { navFwd, activeThreadId } = get();
    if (!navFwd.length) return;
    const next = navFwd[navFwd.length - 1];
    set({
      navFwd: navFwd.slice(0, -1),
      navBack: activeThreadId ? [...get().navBack, activeThreadId] : get().navBack,
      _navigating: true,
    });
    get().setUi({ navView: "chats" });
    get().openThread(next);
    set({ _navigating: false });
  },

  togglePinnedProject(cwd) {
    // Pin/unpin the project owning this cwd, via the shared global-state file
    // (same store the official desktop app reads).
    const gs = get().gs || {};
    const local = gs["local-projects"] || {};
    const hit = Object.values(local).find((p) => (p.rootPaths || []).includes(cwd));
    if (hit) return get().togglePinnedProjectId(hit.id);
    const cur = get().ui.pinnedProjects;
    const next = cur.includes(cwd) ? cur.filter((c) => c !== cwd) : [...cur, cwd];
    get().setUi({ pinnedProjects: next });
    persist("ui.pinnedProjects", next);
  },

  togglePinnedProjectId(projectId) {
    const cur = get().gs?.["pinned-project-ids"] || [];
    const next = cur.includes(projectId) ? cur.filter((id) => id !== projectId) : [...cur, projectId];
    set((s) => ({ gs: { ...s.gs, "pinned-project-ids": next } }));
    api.gsPatch({ "pinned-project-ids": next });
  },

  togglePinnedThread(threadId) {
    const cur = get().gs?.["pinned-thread-ids"] || [];
    const next = cur.includes(threadId) ? cur.filter((id) => id !== threadId) : [...cur, threadId];
    set((s) => ({ gs: { ...s.gs, "pinned-thread-ids": next } }));
    api.gsPatch({ "pinned-thread-ids": next });
  },

  // =======================================================================
  // boot
  // =======================================================================
  async init() {
    // Hydrate persisted prefs from the file backup first (localStorage may
    // have been wiped by a hard kill; the file mirror is authoritative).
    try {
      const prefs = await api.prefsRead();
      if (prefs && typeof prefs === "object") {
        for (const [k, v] of Object.entries(prefs)) {
          try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
        }
        const uiPatch = {};
        for (const k of ["sidebarOpen", "sidebarWidth", "rightOpen", "rightTab", "rightWidth", "rightExpanded", "terminalLocation", "suggestedPrompts", "theme"]) {
          if (`ui.${k}` in prefs) uiPatch[k] = prefs[`ui.${k}`];
        }
        set((s) => ({
          model: "composer.model" in prefs ? prefs["composer.model"] : s.model,
          effort: "composer.effort" in prefs ? prefs["composer.effort"] : s.effort,
          serviceTier: "composer.serviceTier" in prefs ? prefs["composer.serviceTier"] : s.serviceTier,
          permission: "composer.permission" in prefs ? prefs["composer.permission"] : s.permission,
          ui: { ...s.ui, ...uiPatch },
        }));
      }
    } catch {}
    api.onStatus(({ status, codexHome, binary, binaryCandidates, error }) => {
      set({
        status,
        codexHome,
        binary,
        binaryCandidates: binaryCandidates || [],
        backendError: error || null,
      });
      if (status === "ready") get().bootstrap();
    });
    api.onNotification(({ method, params }) => get().handleNotification(method, params));
    api.onServerRequest((req) => get().handleServerRequest(req));
    api.onThemeUpdated(() => get().applyTheme());
    // App updates: surface a toast when a new version is ready to install.
    api.onUpdateStatus?.((s) => {
      if (s?.status === "downloaded") {
        get().toast(`Version ${s.version || ""} downloaded — restart to update (Settings → Updates)`);
      }
    });
    // Shared sidebar state (projects/pins) — same file the official app uses.
    api.gsRead().then((gs) => set({ gs: gs || {} })).catch(() => {});
    api.onGsChanged(() => api.gsRead().then((gs) => set({ gs: gs || {} })).catch(() => {}));
    const appInfo = await api.getAppInfo();
    set({ appInfo, cwd: get().cwd || appInfo.home });
    get().applyTheme();
    applyAppearance();
    // Status may have become ready before we subscribed — pull it explicitly.
    const st = await api.getStatus().catch(() => null);
    if (st) {
      set({
        status: st.status,
        codexHome: st.codexHome,
        binary: st.binary,
        binaryCandidates: st.binaryCandidates || [],
        backendError: st.error || null,
      });
      if (st.status === "ready") get().bootstrap();
    }
  },

  applyTheme() {
    const { ui, appInfo } = get();
    const sysDark =
      window.matchMedia?.("(prefers-color-scheme: dark)").matches ??
      appInfo?.theme === "dark";
    const dark = ui.theme === "dark" || (ui.theme === "system" && sysDark);
    document.documentElement.classList.toggle("dark", dark);
  },

  async bootstrap() {
    if (get()._booted) return;
    set({ _booted: true });
    try {
      const account = await get().refreshAccountAndModels();
      if (account || !get().requiresOpenaiAuth) {
        api.profileRead().then((p) => p && set({ profile: p })).catch(() => {});
        await get().loadThreads();
      }
    } catch (e) {
      get().toast(`Initialization failed: ${e.message}`, "error");
    }
  },

  async refreshAccountAndModels(refreshToken = false) {
    const [acct, models] = await Promise.all([
      api.rpc("account/read", { refreshToken }).catch(() => null),
      api.rpc("model/list", { limit: 100 }).catch(() => null),
    ]);
    const account = acct?.account ?? null;
    set({
      account,
      accountChecked: true,
      requiresOpenaiAuth: acct?.requiresOpenaiAuth ?? false,
    });
    if (models?.data) {
      const visible = models.data.filter((m) => !m.hidden);
      set({ models: visible });
      const cur = get().model;
      if (!cur || !visible.some((m) => m.model === cur)) {
        const def = visible.find((m) => m.isDefault) || visible[0];
        if (def) get().setModel(def.model);
      }
    }
    return account;
  },

  async startChatgptLogin() {
    if (get().loginStatus === "starting") return;
    set({ loginStatus: "starting", loginError: null, loginId: null });
    try {
      const result = await api.rpc("account/login/start", { type: "chatgpt" });
      if (result?.type !== "chatgpt" || !result.authUrl || !result.loginId) {
        throw new Error("The Codex backend returned an invalid login response.");
      }
      set({ loginId: result.loginId, loginStatus: "waiting" });
      await api.openExternal(result.authUrl);
    } catch (error) {
      set({ loginStatus: "idle", loginError: error.message, loginId: null });
    }
  },

  async cancelChatgptLogin() {
    const loginId = get().loginId;
    set({ loginStatus: "idle", loginError: null, loginId: null });
    if (loginId) {
      await api.rpc("account/login/cancel", { loginId }).catch(() => {});
    }
  },

  // =======================================================================
  // thread list
  // =======================================================================
  async loadThreads({ append = false } = {}) {
    const { threadsCursor, archivedView, searchTerm } = get();
    set({ threadsLoading: true });
    try {
      const res = await api.rpc("thread/list", {
        archived: archivedView,
        limit: 60,
        sortKey: "updated_at",
        sortDirection: "desc",
        ...(append && threadsCursor ? { cursor: threadsCursor } : {}),
        ...(searchTerm ? { searchTerm } : {}),
      });
      const data = res?.data ?? [];
      set((s) => ({
        threads: append ? [...s.threads, ...data.filter((t) => !s.threads.some((x) => x.id === t.id))] : data,
        threadsCursor: res?.nextCursor ?? null,
        threadsLoading: false,
      }));
    } catch (e) {
      set({ threadsLoading: false });
      get().toast(`Failed to load chats: ${e.message}`, "error");
    }
  },

  setArchivedView(v) {
    set({ archivedView: v, activeThreadId: null });
    get().loadThreads();
  },

  setSearchTerm(term) {
    set({ searchTerm: term });
    clearTimeout(get()._searchTimer);
    set({
      _searchTimer: setTimeout(() => get().loadThreads(), 250),
    });
  },

  upsertThread(thread) {
    if (!thread?.id) return;
    set((s) => {
      const rest = s.threads.filter((t) => t.id !== thread.id);
      const existing = s.threads.find((t) => t.id === thread.id);
      const merged = existing ? { ...existing, ...thread } : thread;
      const next = [merged, ...rest].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
      return { threads: next };
    });
  },

  // =======================================================================
  // conversation open / create
  // =======================================================================
  async openThread(threadId) {
    const cur = get().activeThreadId;
    if (cur && cur !== threadId && !get()._navigating) {
      set((s) => ({ navBack: [...s.navBack, cur], navFwd: [] }));
    }
    // opening a thread always lands on the chat view (reference behavior)
    get().setUi({ navView: "chats" });
    set({ activeThreadId: threadId });
    // restore this thread's composer prefs (model/effort/tier/permission)
    const tp = stored(`thread.prefs.${threadId}`, null);
    if (tp) {
      set((s) => ({
        model: tp.model ?? s.model,
        effort: tp.effort ?? s.effort,
        serviceTier: tp.serviceTier ?? s.serviceTier,
        permission: tp.permission ?? s.permission,
      }));
    }
    const conv = get().conversations[threadId];
    if (conv?.loaded) return;
    set((s) => ({
      conversations: {
        ...s.conversations,
        [threadId]: {
          thread: s.threads.find((t) => t.id === threadId) || null,
          turns: [],
          activeTurnId: null,
          plan: stored(threadPlanKey(threadId), null),
          tokenUsage: null,
          diff: null,
          loaded: false,
          loading: true,
          error: null,
        },
      },
    }));
    try {
      const res = await api.rpc("thread/read", { threadId, includeTurns: true });
      const thread = res?.thread;
      const turns = normalizeTurns(thread?.turns);
      const resumedTurnId = [...turns].reverse().find((turn) => turn.status === "inProgress")?.id ?? null;
      // Existing goal, if any.
      api.rpc("thread/goal/get", { threadId })
        .then((g) => {
          const goal = g?.goal ?? (g?.objective ? g : null);
          if (goal) get()._mutateConv(threadId, (c) => ({ ...c, goal }));
        })
        .catch(() => {});
      set((s) => ({
        conversations: {
          ...s.conversations,
          [threadId]: {
            ...(s.conversations[threadId] || {}),
            thread: thread || s.conversations[threadId]?.thread,
            turns,
            activeTurnId: s.conversations[threadId]?.activeTurnId || resumedTurnId,
            loaded: true,
            loading: false,
          },
        },
      }));
      if (thread) get().upsertThread(thread);
    } catch (e) {
      set((s) => ({
        conversations: {
          ...s.conversations,
          [threadId]: { ...(s.conversations[threadId] || {}), loading: false, error: e.message },
        },
      }));
    }
  },

  newChat() {
    set({ activeThreadId: null, pendingNewThread: false, draftAt: Date.now() / 1000 });
  },

  // Open a fresh draft with the composer prefilled (e.g. skill "Try now").
  newChatWithPrefill(text, skills) {
    set({
      activeThreadId: null,
      pendingNewThread: false,
      draftAt: Date.now() / 1000,
      composerPrefill: { text, skills: skills || null, nonce: Date.now() },
    });
    get().setUi({ navView: "chats" });
  },

  closeThread(threadId) {
    set((s) => {
      const conversations = { ...s.conversations };
      delete conversations[threadId];
      return {
        conversations,
        activeThreadId: s.activeThreadId === threadId ? null : s.activeThreadId,
      };
    });
  },

  // =======================================================================
  // sending
  // =======================================================================
  activeConversation() {
    const { activeThreadId, conversations } = get();
    return activeThreadId ? conversations[activeThreadId] : null;
  },

  isTurnActive(threadId) {
    const conv = threadId ? get().conversations[threadId] : get().activeConversation();
    return !!conv?.activeTurnId;
  },

  async sendMessage(text, images = [], mentions = [], { steer = false } = {}) {
    text = text.trim();
    if (!text && images.length === 0 && mentions.length === 0) return;
    const { activeThreadId } = get();

    // Queue while a turn is running on this thread (unless steering).
    if (activeThreadId && get().isTurnActive(activeThreadId) && !steer) {
      set((s) => ({ queue: [...s.queue, { threadId: activeThreadId, text, images, mentions }] }));
      return;
    }

    const input = [];
    if (text) input.push({ type: "text", text, text_elements: [] });
    for (const m of mentions) input.push({ type: "mention", name: m.name, path: m.path });
    for (const img of images) input.push({ type: "localImage", path: img });

    const perm = PERMISSIONS[normalizePermission(get().permission)] || PERMISSIONS.ask;
    const model = get().model;
    const effort = get().effort;

    // Optimistic echo: render the user's message and the running state
    // instantly instead of waiting for the app-server's turn/started
    // notification. The local turn is replaced by the real one when
    // turn/started arrives (see handleNotification).
    const localTurnId = `local-turn:${crypto.randomUUID()}`;
    const optimisticTurn = {
      id: localTurnId,
      items: [{ id: `local-item:${crypto.randomUUID()}`, type: "userMessage", content: input }],
    };
    let threadId = activeThreadId;
    const tempThreadId = threadId ? null : `local-thread:${crypto.randomUUID()}`;
    const shownId = threadId || tempThreadId;
    set((s) => {
      const conv = s.conversations[shownId] || {
        thread: threadId ? null : { cwd: s.cwd },
        turns: [],
        activeTurnId: null,
        plan: null,
        tokenUsage: null,
        diff: null,
        loaded: true,
        loading: false,
        error: null,
      };
      return {
        activeThreadId: shownId,
        conversations: {
          ...s.conversations,
          [shownId]: { ...conv, activeTurnId: localTurnId, turns: upsertTurn(conv.turns, optimisticTurn) },
        },
      };
    });

    try {
      if (!threadId) {
        set({ pendingNewThread: true });
        const startParams = {
          model: model || undefined,
          cwd: get().cwd || undefined,
          serviceTier: get().serviceTier || undefined,
        };
        if (perm.approvalPolicy) startParams.approvalPolicy = perm.approvalPolicy;
        if (perm.approvalsReviewer) startParams.approvalsReviewer = perm.approvalsReviewer;
        if (perm.sandbox) startParams.sandbox = perm.sandbox;
        const res = await api.rpc("thread/start", startParams);
        threadId = res?.thread?.id;
        set({ pendingNewThread: false });
        if (!threadId) throw new Error("thread/start returned no thread");
        if (res.thread) get().upsertThread(res.thread);
        // move the optimistic conversation onto the real thread id
        set((s) => {
          const conv = s.conversations[tempThreadId];
          const conversations = { ...s.conversations };
          delete conversations[tempThreadId];
          conversations[threadId] = { ...(conv || {}), thread: res.thread || null };
          return { activeThreadId: threadId, conversations };
        });
        get()._saveThreadPrefs();
      }

      const turnParams = {
        threadId,
        input,
        cwd: get().conversations[threadId]?.thread?.cwd || get().cwd || undefined,
        model: model || undefined,
        effort: effort || undefined,
        serviceTier: get().serviceTier || undefined,
        clientUserMessageId: crypto.randomUUID(),
      };
      if (perm.approvalPolicy) turnParams.approvalPolicy = perm.approvalPolicy;
      if (perm.approvalsReviewer) turnParams.approvalsReviewer = perm.approvalsReviewer;
      if (perm.sandboxPolicy) turnParams.sandboxPolicy = perm.sandboxPolicy;
      if (get().planMode && model) {
        turnParams.collaborationMode = {
          mode: "plan",
          settings: { model, reasoning_effort: effort || null },
        };
      }
      try {
        await api.rpc("turn/start", turnParams);
      } catch (e) {
        // After an app-server restart, previously opened threads are gone from
        // its memory ("thread not found"). Resume from the rollout file and
        // retry the turn once.
        if (!/thread not found/i.test(e?.message || "")) throw e;
        await api.rpc("thread/resume", { threadId });
        await api.rpc("turn/start", turnParams);
      }
    } catch (e) {
      set({ pendingNewThread: false });
      // roll back the optimistic turn (and the temp draft conversation)
      set((s) => {
        const conversations = { ...s.conversations };
        const conv = conversations[shownId];
        if (conv) {
          conversations[shownId] = {
            ...conv,
            activeTurnId: conv.activeTurnId === localTurnId ? null : conv.activeTurnId,
            turns: conv.turns.filter((t) => t.id !== localTurnId),
          };
        }
        if (tempThreadId) delete conversations[tempThreadId];
        return { conversations, activeThreadId: tempThreadId ? null : s.activeThreadId };
      });
      get().toast(`Send failed: ${e.message}`, "error");
    }
  },

  async interrupt() {
    const conv = get().activeConversation();
    const threadId = get().activeThreadId;
    if (!conv?.activeTurnId || !threadId) return;
    try {
      await api.rpc("turn/interrupt", { threadId, turnId: conv.activeTurnId });
    } catch (e) {
      get().toast(`Stop failed: ${e.message}`, "error");
    }
  },

  flushQueue(threadId) {
    const { queue } = get();
    const next = queue.find((q) => q.threadId === threadId);
    if (!next) return;
    set({ queue: queue.filter((q) => q !== next) });
    // Defer so turn/completed state settles first.
    setTimeout(() => get().sendMessage(next.text, next.images, next.mentions), 60);
  },

  clearQueue(threadId) {
    set((s) => ({ queue: s.queue.filter((q) => q.threadId !== threadId) }));
  },

  // =======================================================================
  // thread actions
  // =======================================================================
  async renameThread(threadId, name) {
    try {
      await api.rpc("thread/name/set", { threadId, name });
      set((s) => ({
        threads: s.threads.map((t) => (t.id === threadId ? { ...t, name } : t)),
        conversations: {
          ...s.conversations,
          ...(s.conversations[threadId]
            ? { [threadId]: { ...s.conversations[threadId], thread: { ...s.conversations[threadId].thread, name } } }
            : {}),
        },
      }));
    } catch (e) {
      get().toast(`Rename failed: ${e.message}`, "error");
    }
  },

  async archiveThread(threadId) {
    try {
      await api.rpc("thread/archive", { threadId });
      set((s) => ({
        threads: s.threads.filter((t) => t.id !== threadId),
        activeThreadId: s.activeThreadId === threadId ? null : s.activeThreadId,
      }));
      get().toast("Chat archived", "info", {
        label: "Undo",
        onClick: () => get().unarchiveThread(threadId),
      });
    } catch (e) {
      get().toast(`Archive failed: ${e.message}`, "error");
    }
  },

  async unarchiveThread(threadId) {
    try {
      await api.rpc("thread/unarchive", { threadId });
      get().loadThreads();
    } catch (e) {
      get().toast(`Unarchive failed: ${e.message}`, "error");
    }
  },

  async deleteThread(threadId) {
    try {
      await api.rpc("thread/delete", { threadId });
      set((s) => ({
        threads: s.threads.filter((t) => t.id !== threadId),
        activeThreadId: s.activeThreadId === threadId ? null : s.activeThreadId,
      }));
    } catch (e) {
      get().toast(`Delete failed: ${e.message}`, "error");
    }
  },

  // =======================================================================
  // composer prefs
  // =======================================================================
  setModel(model) {
    set({ model });
    persist("composer.model", model);
    const m = get().models.find((x) => x.model === model);
    if (m && !m.supportedReasoningEfforts?.some((e) => e.reasoningEffort === get().effort)) {
      get().setEffort(m.defaultReasoningEffort || null);
    }
    get()._saveThreadPrefs();
  },
  setEffort(effort) {
    set({ effort });
    persist("composer.effort", effort);
    get()._saveThreadPrefs();
  },
  setServiceTier(tier) {
    set({ serviceTier: tier });
    persist("composer.serviceTier", tier);
    get()._saveThreadPrefs();
  },
  setPermission(p) {
    set({ permission: p });
    persist("composer.permission", p);
    get()._saveThreadPrefs();
  },
  // Per-thread composer prefs: the official client remembers model / effort /
  // tier / permission per conversation. Saved whenever they change while a
  // thread is active, restored on openThread.
  _saveThreadPrefs() {
    const id = get().activeThreadId;
    if (!id) return;
    persist(`thread.prefs.${id}`, {
      model: get().model,
      effort: get().effort,
      serviceTier: get().serviceTier,
      permission: get().permission,
    });
  },
  setMode(mode) {
    set({ mode });
    persist("composer.mode", mode);
  },
  setPlanMode(v) {
    set({ planMode: !!v });
    persist("composer.planMode", !!v);
  },
  setCwd(cwd) {
    set({ cwd });
    persist("composer.cwd", cwd);
  },
  // Register a folder as a local project in the shared global-state file,
  // like the official client does — otherwise no picker can match the cwd
  // and the chip keeps reading "Select project".
  addLocalProject(dir) {
    if (!dir) return;
    const norm = (p) => (p || "").replace(/\\/g, "/");
    const dirN = norm(dir);
    const local = { ...(get().gs?.["local-projects"] || {}) };
    const known = Object.values(local).some((p) =>
      (p.rootPaths || []).some((rp) => {
        const r = norm(rp);
        return r && (dirN === r || dirN.startsWith(r + "/"));
      })
    );
    if (known) return;
    const now = Date.now();
    const id = `local-${crypto.randomUUID().replaceAll("-", "")}`;
    local[id] = { id, name: dirN.split("/").pop() || dirN, rootPaths: [dir], createdAt: now, updatedAt: now };
    set((s) => ({ gs: { ...s.gs, "local-projects": local } }));
    api.gsPatch({ "local-projects": local });
  },
  async pickCwd() {
    const dir = await api.pickDirectory(get().cwd);
    if (!dir) return;
    get().addLocalProject(dir);
    get().setCwd(dir);
  },

  // =======================================================================
  // approvals
  // =======================================================================
  handleServerRequest({ id, method, params }) {
    const base = { reqId: id, method, raw: params, threadId: params.threadId, turnId: params.turnId, itemId: params.itemId };
    let approval = null;
    switch (method) {
      case "item/commandExecution/requestApproval":
      case "execCommandApproval": {
        const command = params.command ?? (Array.isArray(params.parsedCmd) ? params.parsedCmd.map((c) => c.command).join(" && ") : "");
        approval = {
          ...base,
          kind: "command",
          legacy: method === "execCommandApproval",
          title: "Allow this command?",
          command: Array.isArray(command) ? command.join(" ") : command,
          cwd: params.cwd,
          reason: params.reason,
        };
        break;
      }
      case "item/fileChange/requestApproval":
      case "applyPatchApproval": {
        approval = {
          ...base,
          kind: "fileChange",
          legacy: method === "applyPatchApproval",
          title: "Allow file changes?",
          reason: params.reason,
          files: params.fileChanges ? Object.keys(params.fileChanges) : null,
        };
        break;
      }
      case "item/permissions/requestApproval": {
        approval = { ...base, kind: "permissions", title: "Grant permissions?", reason: params.reason, permissions: params.permissions };
        break;
      }
      case "item/tool/requestUserInput": {
        approval = { ...base, kind: "userInput", title: "Input requested", questions: params.questions || [] };
        break;
      }
      case "mcpServer/elicitation/request": {
        approval = { ...base, kind: "elicitation", title: params.message || "Request", mode: params.mode };
        break;
      }
      case "item/tool/call": {
        // Dynamic tools are not supported by this client.
        api.respond(id, null, "Dynamic tool calls are not supported by this client");
        return;
      }
      default: {
        api.respond(id, null, `Unsupported server request: ${method}`);
        return;
      }
    }
    set((s) => ({ approvals: [...s.approvals, approval] }));
  },

  answerApproval(reqId, decision, extra) {
    const a = get().approvals.find((x) => x.reqId === reqId);
    if (!a) return;
    let result;
    if (a.kind === "userInput") {
      result = { answers: extra?.answers ?? {} };
    } else if (a.kind === "elicitation") {
      result = { action: decision }; // accept | decline | cancel
    } else if (a.kind === "permissions") {
      result = { permissions: a.raw?.permissions ?? {}, scope: decision === "acceptForSession" ? "session" : "turn" };
      if (decision === "decline" || decision === "cancel") result = { permissions: {}, scope: "turn" };
    } else {
      // command / fileChange
      let d = decision; // accept | acceptForSession | acceptWithAmendment | decline | cancel
      if (d === "acceptWithAmendment") {
        const amendment = a.raw?.proposedExecpolicyAmendment || [];
        result = a.legacy
          ? { decision: { approved_execpolicy_amendment: { proposed_execpolicy_amendment: amendment } } }
          : { decision: { acceptWithExecpolicyAmendment: { execpolicy_amendment: amendment } } };
      } else {
        if (a.legacy) {
          d = { accept: "approved", acceptForSession: "approved_for_session", decline: "denied", cancel: "abort" }[d] || "denied";
        }
        result = { decision: d };
      }
    }
    api.respond(reqId, result);
    set((s) => ({ approvals: s.approvals.filter((x) => x.reqId !== reqId) }));
  },

  // =======================================================================
  // notifications
  // =======================================================================
  handleNotification(method, params) {
    const s = get();
    switch (method) {
      case "thread/started":
        if (params.thread) s.upsertThread(params.thread);
        break;
      case "thread/name/updated": {
        const { threadId, threadName } = params;
        set((st) => ({
          threads: st.threads.map((t) => (t.id === threadId ? { ...t, name: threadName } : t)),
          conversations: st.conversations[threadId]
            ? { ...st.conversations, [threadId]: { ...st.conversations[threadId], thread: { ...st.conversations[threadId].thread, name: threadName } } }
            : st.conversations,
        }));
        break;
      }
      case "thread/status/changed": {
        set((st) => ({
          threads: st.threads.map((t) => (t.id === params.threadId ? { ...t, status: params.status } : t)),
        }));
        break;
      }
      case "thread/archived":
        set((st) => ({ threads: st.threads.filter((t) => t.id !== params.threadId) }));
        break;
      case "thread/unarchived":
      case "thread/deleted":
        s.loadThreads();
        break;
      case "turn/started":
        s._mutateConv(params.threadId, (c) => {
          const turn = { ...params.turn, items: normalizeItems(params.turn?.items) };
          return {
            ...c,
            activeTurnId: params.turn?.id,
            // the real turn replaces the optimistic local echo
            turns: upsertTurn(c.turns.filter((t) => !String(t.id).startsWith("local-turn:")), turn),
          };
        });
        break;
      case "turn/completed": {
        s._mutateConv(params.threadId, (c) => {
          const turn = { ...params.turn, items: normalizeItems(params.turn?.items) };
          return {
            ...c,
            activeTurnId: c.activeTurnId === params.turn?.id ? null : c.activeTurnId,
            turns: upsertTurn(c.turns, turn),
          };
        });
        set((st) => ({
          threads: st.threads.map((t) =>
            t.id === params.threadId ? { ...t, updatedAt: Math.floor(Date.now() / 1000) } : t
          ),
        }));
        s.flushQueue(params.threadId);
        break;
      }
      case "turn/plan/updated": {
        const plan = { steps: params.plan || [], explanation: params.explanation };
        persist(threadPlanKey(params.threadId), plan);
        s._mutateConv(params.threadId, (c) => ({ ...c, plan }));
        break;
      }
      case "turn/diff/updated":
        s._mutateConv(params.threadId, (c) => ({ ...c, diff: params.diff }));
        break;
      case "thread/tokenUsage/updated":
        s._mutateConv(params.threadId, (c) => ({ ...c, tokenUsage: params.tokenUsage }));
        break;
      case "thread/goal/updated":
        s._mutateConv(params.threadId, (c) => ({ ...c, goal: params.goal ?? { objective: params.objective, status: params.status, tokenBudget: params.tokenBudget } }));
        break;
      case "thread/goal/cleared":
        persist(threadPlanKey(params.threadId), null);
        s._mutateConv(params.threadId, (c) => ({ ...c, goal: null, plan: null }));
        break;
      case "item/started":
        s._upsertItem(params.threadId, params.turnId, params.item);
        break;
      case "item/completed":
        s._upsertItem(params.threadId, params.turnId, params.item, true);
        break;
      case "item/agentMessage/delta":
        s._appendToItem(params.threadId, params.turnId, params.itemId, "agentMessage", (it) => ({
          ...it,
          text: (it.text || "") + params.delta,
        }));
        break;
      case "item/plan/delta":
        s._appendToItem(params.threadId, params.turnId, params.itemId, "plan", (it) => ({
          ...it,
          text: (it.text || "") + params.delta,
        }));
        break;
      case "item/reasoning/summaryTextDelta":
        s._appendToItem(params.threadId, params.turnId, params.itemId, "reasoning", (it) => {
          const summary = [...(it.summary || [])];
          summary[params.summaryIndex] = (summary[params.summaryIndex] || "") + params.delta;
          return { ...it, summary };
        });
        break;
      case "item/reasoning/textDelta":
        s._appendToItem(params.threadId, params.turnId, params.itemId, "reasoning", (it) => {
          const content = [...(it.content || [])];
          content[params.contentIndex] = (content[params.contentIndex] || "") + params.delta;
          return { ...it, content };
        });
        break;
      case "item/commandExecution/outputDelta":
        s._appendToItem(params.threadId, params.turnId, params.itemId, "commandExecution", (it) => ({
          ...it,
          aggregatedOutput: (it.aggregatedOutput || "") + params.delta,
        }));
        break;
      case "item/fileChange/outputDelta":
        s._appendToItem(params.threadId, params.turnId, params.itemId, "fileChange", (it) => ({
          ...it,
          output: (it.output || "") + params.delta,
        }));
        break;
      case "item/fileChange/patchUpdated":
        s._appendToItem(params.threadId, params.turnId, params.itemId, "fileChange", (it) => ({
          ...it,
          changes: params.changes,
        }));
        break;
      case "error":
        s.toast(params.error?.message || "Unknown error", "error");
        s._mutateConv(params.threadId, (c) => ({ ...c, activeTurnId: params.willRetry ? c.activeTurnId : null }));
        break;
      case "warning":
        // the app-server nags about experimental feature flags on every boot;
        // the reference client doesn't surface that one.
        if (!/under-development features/i.test(params.message || "")) {
          s.toast(params.message || "Warning", "warn");
        }
        break;
      case "account/login/completed":
        if (!params.success) {
          set({
            loginStatus: "idle",
            loginError: params.error || "ChatGPT sign-in failed.",
            loginId: null,
          });
          break;
        }
        set({ loginStatus: "completing", loginError: null });
        s.refreshAccountAndModels(true)
          .then((account) => {
            if (!account) throw new Error("Sign-in completed, but no local account was returned.");
            set({ loginStatus: "idle", loginId: null });
            s.setMode("chatgpt");
            api.showMainWindow();
            api.profileRead(true).then((p) => p && set({ profile: p })).catch(() => {});
            s.loadThreads();
          })
          .catch((error) => set({ loginStatus: "idle", loginError: error.message, loginId: null }));
        break;
      case "account/updated":
        s.refreshAccountAndModels(false);
        break;
      default:
        break;
    }
  },

  _mutateConv(threadId, fn) {
    if (!threadId) return;
    set((s) => {
      const cur = s.conversations[threadId] || {
        thread: s.threads.find((t) => t.id === threadId) || null,
        turns: [],
        activeTurnId: null,
        plan: null,
        tokenUsage: null,
        diff: null,
        loaded: false,
        loading: false,
        error: null,
      };
      return { conversations: { ...s.conversations, [threadId]: fn(cur) } };
    });
  },

  _upsertItem(threadId, turnId, item, completed = false) {
    if (!item?.id) return;
    get()._mutateConv(threadId, (c) => {
      const turns = [...c.turns];
      let ti = turns.findIndex((t) => t.id === turnId);
      if (ti < 0) {
        turns.push({ id: turnId, status: "inProgress", items: [] });
        ti = turns.length - 1;
      }
      const turn = { ...turns[ti] };
      const items = [...(turn.items || [])];
      const ii = items.findIndex((i) => i.id === item.id);
      items[ii < 0 ? items.length : ii] = ii < 0 ? item : { ...items[ii], ...item };
      turn.items = items;
      turns[ti] = turn;
      return { ...c, turns, activeTurnId: completed ? c.activeTurnId : turnId };
    });
  },

  _appendToItem(threadId, turnId, itemId, type, fn) {
    get()._mutateConv(threadId, (c) => {
      const turns = [...c.turns];
      let ti = turns.findIndex((t) => t.id === turnId);
      if (ti < 0) {
        turns.push({ id: turnId, status: "inProgress", items: [] });
        ti = turns.length - 1;
      }
      const turn = { ...turns[ti] };
      const items = [...(turn.items || [])];
      let ii = items.findIndex((i) => i.id === itemId);
      if (ii < 0) {
        items.push({ id: itemId, type });
        ii = items.length - 1;
      }
      items[ii] = fn(items[ii]);
      turn.items = items;
      turns[ti] = turn;
      return { ...c, turns, activeTurnId: turnId };
    });
  },

  // =======================================================================
  // ui
  // =======================================================================
  setUi(patch) {
    // rightTab is a legacy alias: route through the side panel tab store.
    if (patch.rightTab) {
      try { panelHook.open?.(patch.rightTab); } catch {}
      const { rightTab, ...rest } = patch;
      patch = { ...rest, rightOpen: true };
    }
    set((s) => {
      const ui = { ...s.ui, ...patch };
      for (const k of ["sidebarOpen", "sidebarWidth", "rightOpen", "rightTab", "rightWidth", "rightExpanded", "terminalLocation", "suggestedPrompts", "theme"]) {
        if (k in patch) persist(`ui.${k}`, ui[k]);
      }
      return { ui };
    });
    if ("theme" in patch) get().applyTheme();
  },

  toast(message, kind = "info", action = null) {
    const id = ++toastSeq;
    set((s) => ({ toasts: [...s.toasts, { id, message, kind, action }] }));
    setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 4500);
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },
}));

// ---------------------------------------------------------------------------
function normalizeTurns(turns) {
  if (!Array.isArray(turns)) return [];
  return turns.map((t) => ({ ...t, items: normalizeItems(t.items) }));
}
function normalizeItems(items) {
  return Array.isArray(items) ? items : [];
}
function upsertTurn(turns, turn) {
  if (!turn?.id) return turns;
  const i = turns.findIndex((t) => t.id === turn.id);
  if (i < 0) return [...turns, turn];
  // Merge: keep streamed items if the completed turn ships none.
  const merged = { ...turns[i], ...turn };
  if (!turn.items || turn.items.length === 0) merged.items = turns[i].items;
  const next = [...turns];
  next[i] = merged;
  return next;
}
