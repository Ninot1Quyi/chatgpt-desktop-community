// App shell: sidebar / conversation / right panel layout, drag-resize,
// global shortcuts, command menu, settings window, connection gate.
import React, { useEffect, useRef, useState } from "react";
import { useStore } from "./store.js";
import { cx } from "./lib/cx.js";
import { COMMANDS, matchAccel, bindingFor, bindingsFor } from "./lib/keys.js";
import * as api from "./api.js";
import { panelHook } from "./lib/panelHook.js";
import Sidebar from "./components/Sidebar.jsx";
import Conversation, { ConversationHeaderContent, HeaderPanelButtons, HeaderContextButtons } from "./components/Conversation.jsx";import NavViews from "./components/NavViews.jsx";
import RightPanel, { RightPanelHeader } from "./components/RightPanel.jsx";
import TerminalTab from "./components/panel/TerminalTab.jsx";
import Settings from "./components/Settings.jsx";
import { Toasts, Spinner, IconButton, Menu } from "./components/ui.jsx";
import { IconSearch, IconChat, IconHeaderSidebar, IconHeaderArrow, IconX, IconGear, IconPlus, IconChevronDown, LucideIcon } from "./components/icons.jsx";

export default function App() {
  const init = useStore((s) => s.init);
  const status = useStore((s) => s.status);
  const account = useStore((s) => s.account);
  const accountChecked = useStore((s) => s.accountChecked);
  const requiresOpenaiAuth = useStore((s) => s.requiresOpenaiAuth);
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);

  useEffect(() => { init(); }, []);
  // deep-link: ?thread=<id> (Open in new window) — open it once ready.
  useEffect(() => {
    if (status !== "ready") return;
    const tid = new URLSearchParams(window.location.search).get("thread");
    if (tid) useStore.getState().openThread(tid);
  }, [status]);

  // global shortcuts (user-remappable, see Settings → Shortcuts)
  useEffect(() => {
    const onKey = (e) => {
      const s = useStore.getState();
      const overrides = s.ui.keybindings;
      const hit = (cmd) => {
        return bindingsFor(cmd, overrides).some((accel) => matchAccel(e, accel));
      };
      const run = (cmd) => {
        switch (cmd) {
          case "newChat": s.setUi({ navView: "chats" }); s.newChat(); break;
          case "newStandaloneChat": { s.setCwd(null); s.setUi({ navView: "chats" }); s.newChat(); break; }
          case "quickChat": api.toggleQuickChat(); break;
          case "archiveChat": { if (s.activeThreadId) s.archiveThread(s.activeThreadId); break; }
          case "openInNewWindow": { if (s.activeThreadId) api.openThreadWindow(s.activeThreadId); break; }
          case "nextRecentChat": {
            const ordered = [...(s.navBack || [])].reverse();
            if (ordered.length) s.openThread(ordered[0]);
            break;
          }
          case "nextTab": {
            const tabs = useStore.getState().ui;
            const order = ["chats", "pull-requests", "sites", "scheduled", "plugins"];
            const i = order.indexOf(tabs.navView);
            s.setUi({ navView: order[(i + 1) % order.length] });
            break;
          }
          case "renameChat": { if (s.activeThreadId) set({ renameRequest: Date.now() }); break; }
          case "togglePin": {
            const cwd = s.activeConversation?.()?.thread?.cwd || s.cwd;
            if (cwd) s.togglePinnedProject(cwd);
            break;
          }
          case "focusBrowserAddress": { panelHook.open?.("browser"); setTimeout(() => document.getElementById("browser-address-input")?.focus(), 150); break; }
          case "commandMenu": setUi({ commandMenuOpen: !s.ui.commandMenuOpen }); break;
          case "toggleSidebar": setUi({ sidebarOpen: !s.ui.sidebarOpen }); break;
          case "toggleSidePanel": setUi({ rightOpen: !s.ui.rightOpen }); break;
          case "toggleBottomPanel":
            if (s.ui.terminalLocation === "right") panelHook.open?.("terminal");
            else setUi({ bottomOpen: !s.ui.bottomOpen });
            break;
          case "findInThread": setUi({ findOpen: !s.ui.findOpen }); break;
          case "openFilesTab": panelHook.open?.("files"); break;
          case "openBrowserTab": panelHook.open?.("browser"); break;
          case "openSideChatTab": panelHook.open?.("sidechat"); break;
          case "openReviewTab": panelHook.open?.("review"); break;
          case "back": s.goBack(); break;
          case "forward": s.goForward(); break;
          case "closeWindow": window.close(); break;
          case "settings": setUi({ settingsOpen: true }); break;
        }
      };
      for (const [cmd] of COMMANDS) {
        if (hit(cmd)) { e.preventDefault(); run(cmd); return; }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (status !== "ready") {
    return <BootScreen status={status} />;
  }
  if (!accountChecked) {
    return <BootScreen status="checking-account" />;
  }
  if (requiresOpenaiAuth && !account) {
    return <AuthScreen />;
  }

  return (
    <div className="app-shell-root relative h-full w-full overflow-hidden">
      <>
      {/* full-height regions; the 46px header floats transparently on top,
          so vertical separators run from y=0 exactly like the reference app */}
      <div className="flex h-full w-full">
        {ui.sidebarOpen && (
          <>
            <div className="slide-in-left shrink-0" style={{ width: ui.sidebarWidth }}>
              <Sidebar />
            </div>
            <DragHandle
              onDrag={(dx) => {
                // dragging past the snap point collapses the sidebar entirely
                const w = ui.sidebarWidth + dx;
                if (w < 170) setUi({ sidebarOpen: false });
                else setUi({ sidebarWidth: clamp(w, 220, 520) });
              }}
            />
          </>
        )}
        <div className={cx("flex min-w-0 flex-1 flex-col bg-(--surface) pt-[46px]", ui.rightOpen && ui.rightExpanded && "hidden")}>
          {ui.navView === "chats" ? <Conversation /> : <NavViews />}
          {ui.bottomOpen && (
            <div className="slide-in-up h-[280px] shrink-0 border-t border-(--border-light)">
              <BottomPanel />
            </div>
          )}
        </div>
        {ui.rightOpen && (
          <>
            {!ui.rightExpanded && (
              <DragHandle
                onDrag={(dx) => setUi({ rightWidth: clamp(ui.rightWidth - dx, 320, Math.max(340, window.innerWidth - 420)) })}
              />
            )}
            <div
              className={cx("slide-in-right shrink-0 border-l border-(--border-light)", ui.rightExpanded && "min-w-0 flex-1")}
              style={ui.rightExpanded ? undefined : { width: ui.rightWidth }}
            >
              <RightPanel />
            </div>
          </>
        )}
      </div>
      <GlobalHeader />
      {/* collapsed sidebar: hover the left edge to slide it in (reference
          behavior); it hides again when the pointer leaves. Rendered after the
          header so it covers the header's tabs, with its own copy of the
          toggle/back/forward buttons on top (reference peek shows them). */}
      {!ui.sidebarOpen && (
        <>
          <div
            className="absolute inset-y-0 left-0 z-40 w-2.5"
            onMouseEnter={() => setUi({ sidebarPeek: true })}
          />
          <div
            className={cx(
              "absolute inset-y-0 left-0 z-40 transition-transform duration-200 ease-[cubic-bezier(0.2,0,0.13,1)]",
              ui.sidebarPeek ? "translate-x-0" : "-translate-x-full"
            )}
            style={{ width: ui.sidebarWidth }}
            onMouseLeave={() => setUi({ sidebarPeek: false })}
          >
            <div className="relative h-full border-r border-(--border-light) bg-(--surface)" style={{ boxShadow: "var(--shadow-menu)" }}>
              <Sidebar />
              <PeekHeader />
            </div>
          </div>
        </>
      )}
      <CommandMenu />
      <Settings />
      <Toasts />
      </>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Global 46px header spanning the full window: traffic-light inset, sidebar
// toggle + back/forward at left, view header content, then the side panel's
// tab strip inside the right region (aligned above the panel).
// ---------------------------------------------------------------------------
function GlobalHeader() {
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  const navBack = useStore((s) => s.navBack);
  const navFwd = useStore((s) => s.navFwd);
  const { goBack, goForward } = useStore();
  return (
    <div className="app-drag absolute inset-x-0 top-0 z-40 flex h-[46px] items-center gap-1 pl-[88px]">
      <IconButton
        icon={<IconHeaderSidebar />}
        size={16}
        title="Toggle sidebar (⌘B)"
        onClick={() => setUi({ sidebarOpen: !ui.sidebarOpen })}
      />
      <IconButton
        icon={<IconHeaderArrow />}
        size={16}
        title="Back"
        disabled={!navBack.length}
        onClick={goBack}
      />
      <IconButton
        icon={<IconHeaderArrow className="-scale-x-100" />}
        size={16}
        title="Forward"
        disabled={!navFwd.length}
        onClick={goForward}
      />
      {/* collapsed sidebar exposes a quick new-chat button (reference header) */}
      {!ui.sidebarOpen && (
        <IconButton
          icon={<LucideIcon name="SquarePen" size={16} />}
          title="New chat"
          onClick={() => {
            const s = useStore.getState();
            s.setUi({ navView: "chats" });
            s.newChat();
          }}
        />
      )}
      {/* the title area starts at the sidebar's right edge (reference layout) */}
      {ui.sidebarOpen && <div className="shrink-0" style={{ width: Math.max(0, ui.sidebarWidth - 180) }} />}
      {ui.navView === "chats" ? (
        <>
          <div className={cx("min-w-0", ui.rightOpen && ui.rightExpanded ? "w-0" : "flex-1")}>
            {!(ui.rightOpen && ui.rightExpanded) && <ConversationHeaderContent />}
          </div>
          {ui.rightOpen ? (
            <>
              {/* conversation-side buttons sit at the middle column's right edge,
                  before the panel's tab strip (reference layout) */}
              {!ui.rightExpanded && <HeaderContextButtons />}
              <div className="w-2 shrink-0" />
              <div
                className={cx("flex h-full shrink-0 items-center", ui.rightExpanded && "min-w-0 flex-1")}
                style={ui.rightExpanded ? undefined : { width: ui.rightWidth }}
              >
                <div className="h-full min-w-0 flex-1">
                  <RightPanelHeader />
                </div>
                <HeaderPanelButtons />
              </div>
            </>
          ) : (
            <>
              <HeaderContextButtons />
              <HeaderPanelButtons />
              <div className="w-2 shrink-0" />
            </>
          )}
        </>
      ) : (
        // Secondary pages (Scheduled/Sites/Plugins/Pull requests): the header
        // band carries only the window controls and the page's own actions —
        // no global header icons, no title (reference layout).
        <>
          {ui.navView === "plugins" && <PluginsHeaderTabs />}
          <div className="flex-1" />
          <NavHeaderActions view={ui.navView} />
          <div className="w-2 shrink-0" />
        </>
      )}
    </div>
  );
}

// The peek sidebar's own copy of the window-control buttons (toggle/back/
// forward), floating over its top edge like the reference peek shows.
function PeekHeader() {
  const setUi = useStore((s) => s.setUi);
  const navBack = useStore((s) => s.navBack);
  const navFwd = useStore((s) => s.navFwd);
  const { goBack, goForward } = useStore();
  return (
    <div className="app-drag absolute inset-x-0 top-0 z-10 flex h-[46px] items-center gap-1.5 pl-[84px]">
      <IconButton
        icon={<IconHeaderSidebar />}
        size={16}
        title="Show sidebar (⌘B)"
        onClick={() => setUi({ sidebarOpen: true, sidebarPeek: false })}
      />
      <IconButton
        icon={<IconHeaderArrow />}
        size={16}
        title="Back"
        disabled={!navBack.length}
        onClick={goBack}
      />
      <IconButton
        icon={<IconHeaderArrow className="-scale-x-100" />}
        size={16}
        title="Forward"
        disabled={!navFwd.length}
        onClick={goForward}
      />
    </div>
  );
}

// Plugins/Skills tab switcher rendered inside the header band (reference).
function PluginsHeaderTabs() {
  const tab = useStore((s) => s.ui.pluginsTab || "plugins");
  const setUi = useStore((s) => s.setUi);
  return (
    <div className="app-no-drag flex items-center gap-4">
      {[["plugins", "Plugins"], ["skills", "Skills"]].map(([id, label]) => (
        <button
          key={id}
          onClick={() => setUi({ pluginsTab: id })}
          className={cx(
            "border-b-2 pb-1 text-[13px]",
            tab === id
              ? "border-(--fg) font-medium text-(--fg)"
              : "border-transparent text-(--fg-tertiary) hover:text-(--fg)"
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// Per-page actions at the right edge of the header band (reference: Plugins
// has refresh + manage gear + Create; Scheduled/Sites just Create; PR none).
function NavHeaderActions({ view }) {
  const setUi = useStore((s) => s.setUi);
  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef(null);
  const toast = (m) => useStore.getState().toast(m);

  const pluginCreate = () => {
    const home = useStore.getState().appInfo?.home || "";
    // Skills tab creates a skill ($skill-creator); Plugins tab creates a
    // plugin ($plugin-creator) — same split as the reference.
    const skillsTab = useStore.getState().ui.pluginsTab === "skills";
    const name = skillsTab ? "skill-creator" : "plugin-creator";
    const displayName = skillsTab ? "Skill Creator" : "Plugin Creator";
    useStore.getState().newChatWithPrefill("", [
      {
        kind: "skill",
        name,
        displayName,
        path: `${home}/.codex/skills/.system/${name}/SKILL.md`,
        icon: `${home}/.codex/skills/.system/${name}/assets/${name}-small.svg`,
      },
    ]);
  };

  if (view === "plugins") {
    return (
      <div className="app-no-drag flex items-center gap-1.5">
        <IconButton
          icon={<LucideIcon name="RefreshCw" size={14} />}
          title="Refresh"
          onClick={() => window.dispatchEvent(new CustomEvent("plugins:reload"))}
        />
        <IconButton
          icon={<IconGear />}
          title="Manage plugins"
          onClick={() => setUi({ settingsOpen: true, settingsSection: "plugins" })}
        />
        <button
          className="ml-0.5 flex h-7 items-center gap-1.5 rounded-full border border-(--border) px-3 text-sm hover:bg-(--surface-hover)"
          onClick={pluginCreate}
        >
          <IconPlus size={12} />
          Create
          <IconChevronDown size={12} className="text-(--fg-tertiary)" />
        </button>
      </div>
    );
  }
  if (view === "scheduled") {
    return (
      <div className="app-no-drag flex items-center">
        <button
          ref={createRef}
          className="flex h-7 items-center gap-1.5 rounded-full border border-(--border) px-3 text-sm hover:bg-(--surface-hover)"
          onClick={() => setCreateOpen(true)}
        >
          <IconPlus size={12} />
          Create
          <IconChevronDown size={12} className="text-(--fg-tertiary)" />
        </button>
        <Menu
          open={createOpen}
          anchor={() => createRef.current?.getBoundingClientRect()}
          onClose={() => setCreateOpen(false)}
          align="end"
          width={220}
          items={[
            { id: "task", label: "Create scheduled task", onSelect: () => toast("Create scheduled tasks from a chat by asking Codex") },
          ]}
        />
      </div>
    );
  }
  if (view === "sites") {
    return (
      <div className="app-no-drag flex items-center gap-1.5">
        <IconButton
          icon={<LucideIcon name="RefreshCw" size={14} />}
          title="Refresh"
          onClick={() => window.dispatchEvent(new CustomEvent("sites:reload"))}
        />
        <button
          className="flex h-7 items-center gap-1.5 rounded-full border border-(--border) px-3 text-sm hover:bg-(--surface-hover)"
          onClick={() => toast("Ask Codex in a chat to set this up")}
        >
          <IconPlus size={12} />
          Create
        </button>
      </div>
    );
  }
  return null;
}

// Bottom panel: a terminal strip, same implementation as the side panel tab.
function BottomPanel() {
  const setUi = useStore((s) => s.setUi);
  return (
    <div className="flex h-full flex-col bg-(--surface-under)">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-(--border-light) px-2">
        <span className="px-1 text-xs text-(--fg-tertiary)">Terminal</span>
        <IconButton icon={<IconX />} title="Close" size={12} onClick={() => setUi({ bottomOpen: false })} />
      </div>
      <div className="min-h-0 flex-1">
        <TerminalTab />
      </div>
    </div>
  );
}

function FloatingSidebarToggle() {
  const setUi = useStore((s) => s.setUi);
  return (
    <button
      className="app-no-drag fixed top-[9px] left-[84px] z-30 flex h-7 items-center gap-1 rounded-lg border border-(--border-light) bg-(--surface-raised) px-2 text-xs text-(--fg-secondary) shadow-sm hover:bg-(--surface-hover)"
      onClick={() => setUi({ sidebarOpen: true })}
      title="Show sidebar (⌘B)"
    >
      ☰ Chats
    </button>
  );
}

function DragHandle({ onDrag }) {
  return (
    <div
      className="group relative z-20 w-0 shrink-0 cursor-col-resize bg-transparent"
      onMouseDown={(e) => {
        e.preventDefault();
        const startX = e.clientX;
        const move = (ev) => onDrag(ev.clientX - startX); // total delta from drag start
        const up = () => {
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", up);
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
      }}
    >
      {/* wide invisible hit area + the reference's gradient hairline that
          fades in on hover (transparent → fg/25 → transparent) */}
      <div className="absolute inset-y-0 -left-2 w-[17px]" />
      <div
        className="absolute inset-y-0 left-0 w-px opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        style={{ background: "linear-gradient(to bottom, transparent, color-mix(in oklab, var(--fg) 25%, transparent), transparent)" }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
function BootScreen({ status }) {
  const binary = useStore((s) => s.binary);
  const binaryCandidates = useStore((s) => s.binaryCandidates);
  const backendError = useStore((s) => s.backendError);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-(--surface)">
      {status === "crashed" ? (
        <>
          <div className="text-[15px] font-medium text-(--danger)">Codex backend failed to start</div>
          <div className="max-w-[420px] text-center text-[13px] text-(--fg-tertiary)">
            Tried to launch: <span className="font-mono">{binary || "codex"}</span>
            <br />
            {backendError || "The bundled Codex runtime could not be started."}
          </div>
          {binaryCandidates.length > 0 && (
            <details className="max-w-[560px] text-[12px] text-(--fg-tertiary)">
              <summary className="cursor-pointer text-center">Show searched locations</summary>
              <div className="mt-2 break-all rounded-lg bg-(--surface-secondary) px-3 py-2 font-mono">
                {binaryCandidates.join("\n")}
              </div>
            </details>
          )}
          <button
            className="mt-2 rounded-lg bg-(--accent) px-4 py-2 text-[13px] font-medium text-(--accent-fg)"
            onClick={() => api.restartAppServer()}
          >
            Retry
          </button>
        </>
      ) : (
        <>
          <Spinner size={22} className="text-(--fg-tertiary)" />
          <div className="text-[13px] text-(--fg-tertiary)">
            {status === "starting"
              ? "Starting Codex…"
              : status === "checking-account"
                ? "Checking account…"
                : "Connecting…"}
          </div>
        </>
      )}
    </div>
  );
}

function AuthScreen() {
  const loginStatus = useStore((s) => s.loginStatus);
  const loginError = useStore((s) => s.loginError);
  const startLogin = useStore((s) => s.startChatgptLogin);
  const cancelLogin = useStore((s) => s.cancelChatgptLogin);
  const waiting = loginStatus === "starting" || loginStatus === "waiting" || loginStatus === "completing";

  return (
    <div className="app-drag flex h-full w-full items-center justify-center bg-(--surface)">
      <div className="app-no-drag flex w-[380px] flex-col items-center text-center">
        <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-(--border) bg-(--surface-raised)">
          <IconChat size={24} />
        </div>
        <h1 className="text-[22px] font-semibold">ChatGPT Desktop Community</h1>
        <p className="mt-2 max-w-[340px] text-[13px] leading-5 text-(--fg-tertiary)">
          Sign in with ChatGPT to use your account and models in the local desktop app.
        </p>
        <button
          className="mt-6 flex h-10 w-full items-center justify-center rounded-xl bg-(--fg) text-[13px] font-medium text-(--surface) disabled:opacity-60"
          disabled={waiting}
          onClick={startLogin}
        >
          {loginStatus === "starting"
            ? "Starting sign-in…"
            : loginStatus === "waiting"
              ? "Finish signing in in your browser"
              : loginStatus === "completing"
                ? "Finishing sign-in…"
                : "Continue with ChatGPT"}
        </button>
        {loginStatus === "waiting" && (
          <button className="mt-3 text-xs text-(--fg-tertiary) hover:text-(--fg)" onClick={cancelLogin}>
            Cancel
          </button>
        )}
        {loginError && <div className="mt-4 text-[12px] leading-5 text-(--danger)">{loginError}</div>}
        <p className="mt-6 text-[11px] leading-4 text-(--fg-faint)">
          Authentication is handled and stored locally by the bundled Codex runtime.
        </p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function CommandMenu() {
  const open = useStore((s) => s.ui.commandMenuOpen);
  const setUi = useStore((s) => s.setUi);
  const threads = useStore((s) => s.threads);
  const { openThread, newChat } = useStore();
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);

  useEffect(() => { if (open) { setQ(""); setIdx(0); } }, [open]);
  if (!open) return null;

  const filtered = threads
    .filter((t) => {
      const hay = `${t.name || ""} ${t.preview || ""} ${t.cwd || ""}`.toLowerCase();
      return hay.includes(q.toLowerCase());
    })
    .slice(0, 12);

  const pick = (t) => {
    setUi({ commandMenuOpen: false });
    if (t) openThread(t.id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[18vh]"
      onMouseDown={(e) => { if (e.target === e.currentTarget) setUi({ commandMenuOpen: false }); }}
    >
      <div className="fade-in w-[520px] overflow-hidden rounded-2xl border border-(--border) bg-(--surface-raised)" style={{ boxShadow: "var(--shadow-menu)" }}>
        <div className="flex items-center gap-2 border-b border-(--border-light) px-4 py-3">
          <IconSearch size={14} className="text-(--fg-tertiary)" />
          <input
            autoFocus
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-(--fg-faint)"
            placeholder="Search chats…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setIdx(Math.min(idx + 1, filtered.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setIdx(Math.max(idx - 1, 0)); }
              else if (e.key === "Enter") { e.preventDefault(); pick(filtered[idx]); }
              else if (e.key === "Escape") setUi({ commandMenuOpen: false });
            }}
          />
          <span className="rounded border border-(--border-light) px-1.5 py-0.5 text-[10px] text-(--fg-faint)">esc</span>
        </div>
        <div className="max-h-[320px] overflow-y-auto py-1">
          <button
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] hover:bg-(--surface-hover)"
            onClick={() => { setUi({ commandMenuOpen: false }); newChat(); }}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-(--accent-soft) text-(--accent)">＋</span>
            New chat
          </button>
          {filtered.map((t, i) => (
            <button
              key={t.id}
              className={cx(
                "flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px]",
                i === idx ? "bg-(--surface-active)" : "hover:bg-(--surface-hover)"
              )}
              onMouseEnter={() => setIdx(i)}
              onClick={() => pick(t)}
            >
              <IconChat size={14} className="shrink-0 text-(--fg-tertiary)" />
              <span className="truncate">{t.name || (t.preview || "").split("\n")[0] || "New chat"}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px] text-(--fg-tertiary)">No matches</div>
          )}
        </div>
      </div>
    </div>
  );
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
