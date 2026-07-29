import { create } from "zustand";
import * as api from "./api.js";
import { panelHook } from "./lib/panelHook.js";
import { applyAppearance } from "./lib/appearance.js";
import { externalProjectId, isProjectPathInside, normalizeProjectPath } from "./lib/runtimeProject.js";
import { RUNTIME_IDS } from "./lib/runtimes.jsx";

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

// Whether a vendor is signed in and usable. Codex sign-in is the app-server
// account; claude/kimi come from `externalAuth` (CLI credential checks).
export function runtimeConnected(s, runtime) {
  if (runtime === "codex") return !s.requiresOpenaiAuth || !!s.account;
  return !!s.externalAuth?.[runtime]?.loggedIn;
}

// Human-readable plan names for the raw account.planType ids.
const PLAN_LABELS = {
  free: "Free", go: "Go", plus: "Plus", pro: "Pro", prolite: "Pro Lite",
  team: "Team", business: "Business", enterprise: "Enterprise", edu: "Edu",
};
export function planLabel(planType) {
  if (!planType) return null;
  const key = String(planType).toLowerCase();
  return PLAN_LABELS[key] || key[0].toUpperCase() + key.slice(1);
}

const stored = (k, fallback) => {
  try {
    const v = localStorage.getItem(k);
    return v == null ? fallback : JSON.parse(v);
  } catch {
    return fallback;
  }
};
const hasStored = (k) => {
  try { return localStorage.getItem(k) != null; } catch { return false; }
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
  runtimeCatalog: {},
  modelsByRuntime: { codex: [], claude: [], kimi: [] },
  models: [],

  // ---- thread list ----
  threads: [],
  threadsCursor: null,
  threadsLoading: false,
  archivedView: false,
  searchTerm: "",
  claudeThreads: [],
  claudeThreadsLoading: false,
  claudeThreadsError: null,
  claudeConfigDir: null,
  kimiThreads: [],
  kimiThreadsLoading: false,
  kimiThreadsError: null,
  kimiConfigDir: null,
  // external vendor sign-in state: { claude: {loggedIn, detail}, kimi: {...} }
  // (codex sign-in is the `account` object; see runtimeConnected)
  externalAuth: {},
  externalAuthChecked: false,

  // ---- conversations ----
  activeThreadId: null,
  conversations: {}, // threadId -> Conversation
  pendingNewThread: false,

  // ---- composer prefs ----
  cwd: stored("composer.cwd", null),
  runtime: stored("composer.runtime", "codex"),
  modelSelections: stored("composer.models", { codex: stored("composer.model", null) }),
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
    navView: "chats", // chats | pull-requests | scheduled | plugins
    pinnedProjects: stored("ui.pinnedProjects", []), // cwd strings
    keybindings: stored("ui.keybindings", {}), // command id -> accelerator string
  },
  toasts: [],
  navBack: [], // recently-viewed threadId stack (Ctrl+Tab cycling)
  gs: {}, // shared Codex project/assignment metadata (Noma pins are separate)
  runtimeOrder: stored("noma.runtimeOrder", RUNTIME_IDS), // sidebar vendor section order
  pinnedThreadIds: stored("noma.pinnedThreadIds", []),
  pinnedProjectIds: stored("noma.pinnedProjectIds", []),
  pinnedProjectPaths: stored("noma.pinnedProjectPaths", []),
  _nomaPinsInitialized: hasStored("noma.pinnedThreadIds")
    || hasStored("noma.pinnedProjectIds")
    || hasStored("noma.pinnedProjectPaths"),
  profile: null, // { name, username, photo(dataUrl) } from /wham/profiles/me
    renameRequest: 0, // bump to open the thread rename dialog (Ctrl+R)
  draftAt: 0, // when the current new-chat draft was opened (seconds)
  composerPrefill: null, // { text, nonce } — Composer consumes and clears

  setKeybinding(commandId, accel) {
    const next = { ...get().ui.keybindings, [commandId]: accel };
    if (!accel) delete next[commandId];
    get().setUi({ keybindings: next });
    persist("ui.keybindings", next);
  },

  togglePinnedProject(cwd, requestedRuntime = null) {
    if (!cwd) return;
    const gs = get().gs || {};
    const local = gs["local-projects"] || {};
    let hit = null;
    let hitRootLength = -1;
    for (const entry of Object.entries(local)) {
      for (const rootPath of entry[1].rootPaths || []) {
        if (isProjectPathInside(cwd, rootPath) && normalizeProjectPath(rootPath).length > hitRootLength) {
          hit = entry;
          hitRootLength = normalizeProjectPath(rootPath).length;
        }
      }
    }
    const activeThreadId = get().activeThreadId;
    const runtime = requestedRuntime
      || (activeThreadId
        ? runtimeForThread(get().activeConversation?.()?.thread, activeThreadId)
        : get().runtime);
    if (runtime === "claude" || runtime === "kimi") {
      return get().togglePinnedProjectId(externalProjectId(runtime, cwd, hit?.[0] || null));
    }
    if (hit) return get().togglePinnedProjectId(hit[0]);
    const cur = get().pinnedProjectPaths;
    const next = cur.some((candidate) => samePath(candidate, cwd))
      ? cur.filter((candidate) => !samePath(candidate, cwd))
      : [...cur, cwd];
    set({ pinnedProjectPaths: next });
    persist("noma.pinnedProjectPaths", next);
  },

  togglePinnedProjectId(projectId) {
    if (!projectId) return;
    const cur = get().pinnedProjectIds;
    const next = cur.includes(projectId) ? cur.filter((id) => id !== projectId) : [...cur, projectId];
    set({ pinnedProjectIds: next });
    persist("noma.pinnedProjectIds", next);
  },

  togglePinnedThread(threadId) {
    if (!threadId) return;
    const cur = get().pinnedThreadIds;
    const next = cur.includes(threadId) ? cur.filter((id) => id !== threadId) : [...cur, threadId];
    set({ pinnedThreadIds: next });
    persist("noma.pinnedThreadIds", next);
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
          runtime: "composer.runtime" in prefs ? prefs["composer.runtime"] : s.runtime,
          modelSelections: "composer.models" in prefs ? prefs["composer.models"] : s.modelSelections,
          model: "composer.model" in prefs ? prefs["composer.model"] : s.model,
          effort: "composer.effort" in prefs ? prefs["composer.effort"] : s.effort,
          serviceTier: "composer.serviceTier" in prefs ? prefs["composer.serviceTier"] : s.serviceTier,
          permission: "composer.permission" in prefs ? prefs["composer.permission"] : s.permission,
          pinnedThreadIds: "noma.pinnedThreadIds" in prefs ? prefs["noma.pinnedThreadIds"] : s.pinnedThreadIds,
          pinnedProjectIds: "noma.pinnedProjectIds" in prefs ? prefs["noma.pinnedProjectIds"] : s.pinnedProjectIds,
          pinnedProjectPaths: "noma.pinnedProjectPaths" in prefs ? prefs["noma.pinnedProjectPaths"] : s.pinnedProjectPaths,
          runtimeOrder: "noma.runtimeOrder" in prefs ? prefs["noma.runtimeOrder"] : s.runtimeOrder,
          _nomaPinsInitialized: s._nomaPinsInitialized
            || "noma.pinnedThreadIds" in prefs
            || "noma.pinnedProjectIds" in prefs
            || "noma.pinnedProjectPaths" in prefs,
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
    // Shared Codex state is read only for project metadata and assignments.
    // Pins are migrated once, then owned exclusively by Noma's prefs file.
    const applyGlobalState = (value) => {
      const gs = value || {};
      if (!get()._nomaPinsInitialized) {
        const pinnedThreadIds = [...new Set(gs["pinned-thread-ids"] || [])];
        const pinnedProjectIds = [...new Set(gs["pinned-project-ids"] || [])];
        const pinnedProjectPaths = [...new Set(get().ui.pinnedProjects || [])];
        set({
          gs,
          pinnedThreadIds,
          pinnedProjectIds,
          pinnedProjectPaths,
          _nomaPinsInitialized: true,
        });
        persist("noma.pinnedThreadIds", pinnedThreadIds);
        persist("noma.pinnedProjectIds", pinnedProjectIds);
        persist("noma.pinnedProjectPaths", pinnedProjectPaths);
        return;
      }
      set({ gs });
    };
    api.gsRead().then(applyGlobalState).catch(() => {});
    api.onGsChanged(() => api.gsRead().then(applyGlobalState).catch(() => {}));
    const appInfo = await api.getAppInfo();
    set({ appInfo, cwd: get().cwd || appInfo.home });
    get().loadClaudeThreads();
    get().loadKimiThreads();
    get().refreshExternalAuth();
    get().refreshRuntimeCatalog();
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
      const account = await get().refreshAccountAndModels(true);
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
      const visible = models.data
        .filter((m) => !m.hidden)
        .map((m) => ({ ...m, runtime: "codex", provider: "codex" }));
      set((s) => ({
        modelsByRuntime: { ...s.modelsByRuntime, codex: visible },
        runtimeCatalog: {
          ...s.runtimeCatalog,
          codex: { id: "codex", label: "Codex", available: true, models: visible },
        },
        ...(s.runtime === "codex" ? { models: visible } : {}),
      }));
      const selected = get().modelSelections.codex || (get().runtime === "codex" ? get().model : null);
      if (!selected || !visible.some((m) => m.model === selected)) {
        const def = visible.find((m) => m.isDefault) || visible[0];
        if (def) get().setModel(def.model, "codex");
      } else if (get().runtime === "codex") {
        set({ model: selected });
      }
    }
    return account;
  },

  async refreshRuntimeCatalog() {
    try {
      const catalog = await api.agentRuntimeCatalog();
      const external = {
        claude: catalog?.claude?.models || [],
        kimi: catalog?.kimi?.models || [],
      };
      set((s) => ({
        runtimeCatalog: { ...s.runtimeCatalog, ...(catalog || {}) },
        modelsByRuntime: {
          ...s.modelsByRuntime,
          claude: external.claude,
          kimi: external.kimi,
        },
        ...(s.runtime !== "codex" ? { models: external[s.runtime] || [] } : {}),
      }));
      const runtime = get().runtime;
      if (runtime !== "codex") get().setRuntime(runtime, { quiet: true });
    } catch (error) {
      get().toast(`Could not load local model providers: ${error.message}`, "error");
    }
  },

  async startExternalLogin(runtime) {
    try {
      await api.agentRuntimeLogin(runtime);
      get().toast(`Complete the ${runtimeLabel(runtime)} sign-in in the window that just opened`, "info");
    } catch (error) {
      get().toast(error.message, "error");
    }
  },

  async refreshExternalAuth() {
    const status = await api.agentRuntimeAuthStatus().catch(() => null);
    set({
      externalAuth: {
        claude: status?.claude || null,
        kimi: status?.kimi || null,
      },
      externalAuthChecked: true,
    });
  },

  async startChatgptLogin() {
    if (get().loginStatus === "starting") return;
    set({ loginStatus: "starting", loginError: null, loginId: null });
    try {
      const result = await api.rpc("account/login/start", { type: "chatgpt" });
      if (result?.type !== "chatgpt" || !result.authUrl || !result.loginId) {
        throw new Error("The Noma backend returned an invalid login response.");
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

  async loadClaudeThreads() {
    set({ claudeThreadsLoading: true, claudeThreadsError: null });
    try {
      const result = await api.claudeHistoryList();
      set({
        claudeThreads: result?.sessions || [],
        claudeConfigDir: result?.configDir || null,
        claudeThreadsLoading: false,
      });
    } catch (error) {
      set({
        claudeThreadsLoading: false,
        claudeThreadsError: error.message,
      });
    }
  },

  async loadKimiThreads() {
    set({ kimiThreadsLoading: true, kimiThreadsError: null });
    try {
      const result = await api.kimiHistoryList();
      set({
        kimiThreads: result?.sessions || [],
        kimiConfigDir: result?.configDir || null,
        kimiThreadsLoading: false,
      });
    } catch (error) {
      set({ kimiThreadsLoading: false, kimiThreadsError: error.message });
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
    if (cur && cur !== threadId) {
      set((s) => ({ navBack: [...s.navBack, cur] }));
    }
    // opening a thread always lands on the chat view (reference behavior)
    get().setUi({ navView: "chats" });
    if (isClaudeThreadId(threadId)) {
      return get()._openClaudeThread(threadId);
    }
    if (isKimiThreadId(threadId)) {
      return get()._openKimiThread(threadId);
    }
    get().setRuntime("codex", { quiet: true, force: true });
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

  async _openClaudeThread(threadId) {
    get().setRuntime("claude", { quiet: true, force: true });
    set({ activeThreadId: threadId });
    const existing = get().conversations[threadId];
    if (existing?.loaded) return;
    const summary = get().claudeThreads.find((thread) => thread.id === threadId) || {
      id: threadId,
      sessionId: threadId.slice("claude:".length),
      source: "claude",
      runtime: "claude",
      readOnly: false,
      name: "Claude Code session",
    };
    set((s) => ({
      conversations: {
        ...s.conversations,
        [threadId]: {
          thread: summary,
          turns: [],
          activeTurnId: null,
          plan: null,
          tokenUsage: null,
          diff: null,
          source: "claude",
          runtime: "claude",
          readOnly: false,
          loaded: false,
          loading: true,
          error: null,
        },
      },
    }));
    try {
      const result = await api.claudeHistoryRead(threadId);
      const thread = { ...summary, ...(result?.thread || {}), source: "claude", runtime: "claude", readOnly: false };
      set((s) => ({
        claudeThreads: [
          thread,
          ...s.claudeThreads.filter((candidate) => candidate.id !== threadId),
        ].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
        conversations: {
          ...s.conversations,
          [threadId]: {
            ...(s.conversations[threadId] || {}),
            thread,
            turns: normalizeTurns(result?.turns),
            activeTurnId: null,
            source: "claude",
            runtime: "claude",
            readOnly: false,
            loaded: true,
            loading: false,
            error: null,
          },
        },
      }));
    } catch (error) {
      set((s) => ({
        conversations: {
          ...s.conversations,
          [threadId]: {
            ...(s.conversations[threadId] || {}),
            loading: false,
            error: error.message,
          },
        },
      }));
    }
  },

  async _openKimiThread(threadId) {
    get().setRuntime("kimi", { quiet: true, force: true });
    set({ activeThreadId: threadId });
    const existing = get().conversations[threadId];
    if (existing?.loaded) return;
    const summary = get().kimiThreads.find((thread) => thread.id === threadId) || {
      id: threadId,
      sessionId: threadId.slice("kimi:".length),
      source: "kimi",
      runtime: "kimi",
      readOnly: false,
      name: "Kimi Code session",
    };
    set((s) => ({
      conversations: {
        ...s.conversations,
        [threadId]: {
          thread: summary,
          turns: [],
          activeTurnId: null,
          plan: null,
          tokenUsage: null,
          diff: null,
          source: "kimi",
          runtime: "kimi",
          readOnly: false,
          loaded: false,
          loading: true,
          error: null,
        },
      },
    }));
    try {
      const result = await api.kimiHistoryRead(threadId);
      const thread = { ...summary, ...(result?.thread || {}), source: "kimi", runtime: "kimi", readOnly: false };
      if (thread.model && get().modelsByRuntime.kimi.some((m) => m.model === thread.model)) {
        get().setModel(thread.model, "kimi");
      }
      set((s) => ({
        kimiThreads: [
          thread,
          ...s.kimiThreads.filter((candidate) => candidate.id !== threadId),
        ].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
        conversations: {
          ...s.conversations,
          [threadId]: {
            ...(s.conversations[threadId] || {}),
            thread,
            turns: normalizeTurns(result?.turns),
            activeTurnId: null,
            source: "kimi",
            runtime: "kimi",
            readOnly: false,
            loaded: true,
            loading: false,
            error: null,
          },
        },
      }));
    } catch (error) {
      set((s) => ({
        conversations: {
          ...s.conversations,
          [threadId]: {
            ...(s.conversations[threadId] || {}),
            loading: false,
            error: error.message,
          },
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
    if (activeThreadId && get().conversations[activeThreadId]?.readOnly) {
      get().toast("This conversation is read-only", "info");
      return;
    }

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
    const runtime = activeThreadId
      ? runtimeForThread(get().conversations[activeThreadId]?.thread, activeThreadId)
      : get().runtime;
    const model = get().model;
    const effort = get().effort;
    const allowedModels = get().modelsByRuntime[runtime] || [];
    if (!allowedModels.some((candidate) => candidate.model === model)) {
      get().toast(`The selected model does not belong to ${runtimeLabel(runtime)}`, "error");
      return;
    }

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
        thread: threadId ? null : { cwd: s.cwd, source: runtime, runtime },
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
      if (runtime !== "codex") {
        const runId = crypto.randomUUID();
        const sessionId = threadId ? threadId.slice(`${runtime}:`.length) : null;
        const promptParts = [text];
        if (mentions.length) {
          promptParts.push(`Referenced paths:\n${mentions.map((mention) => mention.path || mention.name).filter(Boolean).join("\n")}`);
        }
        if (images.length) promptParts.push(`Attached local images:\n${images.join("\n")}`);
        set({ pendingNewThread: !threadId, externalRunId: runId });
        const result = await api.agentRuntimeSend({
          runId,
          runtime,
          sessionId,
          prompt: promptParts.filter(Boolean).join("\n\n"),
          cwd: get().conversations[threadId]?.thread?.cwd || get().cwd || undefined,
          model,
          effort: effort || undefined,
          permission: normalizePermission(get().permission),
          planMode: !!get().planMode,
        });
        const thread = {
          ...(result?.thread || {}),
          source: runtime,
          runtime,
          readOnly: false,
        };
        const realThreadId = thread.id;
        if (!realThreadId || !realThreadId.startsWith(`${runtime}:`)) {
          throw new Error(`${runtimeLabel(runtime)} returned an invalid session`);
        }
        set((s) => {
          const conv = s.conversations[shownId] || {};
          const conversations = { ...s.conversations };
          if (shownId !== realThreadId) delete conversations[shownId];
          conversations[realThreadId] = {
            ...conv,
            thread,
            turns: normalizeTurns(result?.turns),
            activeTurnId: null,
            source: runtime,
            runtime,
            readOnly: false,
            loaded: true,
            loading: false,
            error: null,
          };
          return {
            activeThreadId: realThreadId,
            conversations,
            pendingNewThread: false,
            externalRunId: null,
            queue: s.queue.map((queued) => queued.threadId === shownId ? { ...queued, threadId: realThreadId } : queued),
            ...(runtime === "claude"
              ? {
                  claudeThreads: [thread, ...s.claudeThreads.filter((candidate) => candidate.id !== realThreadId)]
                    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
                }
              : {
                  kimiThreads: [thread, ...s.kimiThreads.filter((candidate) => candidate.id !== realThreadId)]
                    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)),
                }),
          };
        });
        get()._saveThreadPrefs();
        get().flushQueue(realThreadId);
        return;
      }

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
      set({ pendingNewThread: false, externalRunId: null });
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
    if (conv?.readOnly) return;
    if (!conv?.activeTurnId || !threadId) return;
    try {
      const runtime = runtimeForThread(conv.thread, threadId);
      if (runtime === "codex") {
        await api.rpc("turn/interrupt", { threadId, turnId: conv.activeTurnId });
      } else if (get().externalRunId) {
        await api.agentRuntimeCancel(get().externalRunId);
      }
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
    if (isExternalThreadId(threadId)) {
      get().toast("This runtime manages its own session metadata", "info");
      return;
    }
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
    if (isExternalThreadId(threadId)) {
      get().toast("This runtime manages its own session metadata", "info");
      return;
    }
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
    if (isExternalThreadId(threadId)) {
      get().toast("This runtime manages its own session metadata", "info");
      return;
    }
    try {
      await api.rpc("thread/unarchive", { threadId });
      get().loadThreads();
    } catch (e) {
      get().toast(`Unarchive failed: ${e.message}`, "error");
    }
  },

  async deleteThread(threadId) {
    if (isExternalThreadId(threadId)) {
      get().toast("This runtime manages its own session metadata", "info");
      return;
    }
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
  setRuntime(runtime, { quiet = false, force = false } = {}) {
    if (!["codex", "claude", "kimi"].includes(runtime)) return false;
    const activeId = get().activeThreadId;
    const lockedRuntime = activeId && !activeId.startsWith("local-thread:")
      ? runtimeForThread(get().conversations[activeId]?.thread, activeId)
      : null;
    if (!force && lockedRuntime && lockedRuntime !== runtime) {
      if (!quiet) get().toast(`This conversation is locked to ${runtimeLabel(lockedRuntime)}`, "info");
      return false;
    }
    const catalog = get().runtimeCatalog[runtime];
    if (catalog && catalog.available === false) {
      if (!quiet) get().toast(catalog.error || `${runtimeLabel(runtime)} is unavailable`, "error");
      return false;
    }
    if (!runtimeConnected(get(), runtime)) {
      if (!quiet) get().toast(`Sign in to ${runtimeLabel(runtime)} first (Settings → Account)`, "info");
      return false;
    }
    const models = get().modelsByRuntime[runtime] || [];
    if (!models.length) {
      if (!quiet) get().toast(`${runtimeLabel(runtime)} has no available models`, "error");
      return false;
    }
    const selections = { ...get().modelSelections };
    const selected = models.some((m) => m.model === selections[runtime])
      ? selections[runtime]
      : (models.find((m) => m.isDefault) || models[0]).model;
    selections[runtime] = selected;
    const selectedModel = models.find((m) => m.model === selected);
    const currentEffort = get().effort;
    const supportsEffort = selectedModel?.supportedReasoningEfforts?.some((entry) => entry.reasoningEffort === currentEffort);
    const effort = supportsEffort ? currentEffort : selectedModel?.defaultReasoningEffort || null;
    set({ runtime, models, model: selected, modelSelections: selections, effort });
    persist("composer.runtime", runtime);
    persist("composer.models", selections);
    persist("composer.model", selected);
    persist("composer.effort", effort);
    get()._saveThreadPrefs();
    return true;
  },
  setModel(model, requestedRuntime = null) {
    const runtime = requestedRuntime
      || Object.keys(get().modelsByRuntime).find((key) => get().modelsByRuntime[key].some((entry) => entry.model === model))
      || get().runtime;
    if (runtime !== get().runtime && !get().setRuntime(runtime)) return false;
    const models = get().modelsByRuntime[runtime] || [];
    const m = models.find((x) => x.model === model);
    if (!m) {
      get().toast(`Model "${model}" does not belong to ${runtimeLabel(runtime)}`, "error");
      return false;
    }
    const selections = { ...get().modelSelections, [runtime]: model };
    set({ model, modelSelections: selections, models });
    persist("composer.runtime", runtime);
    persist("composer.models", selections);
    persist("composer.model", model);
    if (m && !m.supportedReasoningEfforts?.some((e) => e.reasoningEffort === get().effort)) {
      get().setEffort(m.defaultReasoningEffort || null);
    }
    get()._saveThreadPrefs();
    return true;
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
    if (!id || get().conversations[id]?.readOnly) return;
    persist(`thread.prefs.${id}`, {
      runtime: get().runtime,
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
  setRuntimeOrder(order) {
    const known = RUNTIME_IDS;
    // keep only known runtimes, then append any missing ones at the end
    const next = [...new Set([...(order || []).filter((r) => known.includes(r)), ...known])];
    set({ runtimeOrder: next });
    persist("noma.runtimeOrder", next);
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
function isClaudeThreadId(threadId) {
  return typeof threadId === "string" && threadId.startsWith("claude:");
}

function isKimiThreadId(threadId) {
  return typeof threadId === "string" && threadId.startsWith("kimi:");
}

function isExternalThreadId(threadId) {
  return isClaudeThreadId(threadId) || isKimiThreadId(threadId);
}

function runtimeForThread(thread, threadId) {
  if (thread?.runtime) return thread.runtime;
  if (thread?.source === "claude" || isClaudeThreadId(threadId)) return "claude";
  if (thread?.source === "kimi" || isKimiThreadId(threadId)) return "kimi";
  return "codex";
}

function runtimeLabel(runtime) {
  return runtime === "claude" ? "Claude Code" : runtime === "kimi" ? "Kimi Code" : "Codex";
}

function samePath(left, right) {
  return normalizeProjectPath(left).toLowerCase() === normalizeProjectPath(right).toLowerCase();
}

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
