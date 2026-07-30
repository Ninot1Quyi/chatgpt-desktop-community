import React, { useEffect, useState } from "react";
import DesktopShell from "@modules/desktop-shell";
import { COMMANDS, bindingsFor, matchAccel } from "@modules/shortcuts";
import { mostRecentThreadId } from "@modules/projects-navigation/state";
import * as api from "./api.js";
import { useStore, runtimeConnected } from "./store.js";
import { cx } from "./lib/cx.js";
import { panelHook } from "./lib/panelHook.js";
import {
  EXTERNAL_RUNTIMES,
  RUNTIMES,
  RUNTIME_IDS,
  runtimeMeta,
} from "@modules/agent-runtimes";
import { Toasts, Spinner } from "./components/ui.jsx";
import { IconChat, IconSearch, LucideIcon } from "./components/icons.jsx";
import { reportDiagnostic } from "@modules/diagnostics";

const Settings = React.lazy(() => import("@modules/settings"));

export default function App() {
  const init = useStore((state) => state.init);
  const status = useStore((state) => state.status);
  const accountChecked = useStore((state) => state.accountChecked);
  const externalAuthChecked = useStore((state) => state.externalAuthChecked);
  const anyConnected = useStore((state) =>
    RUNTIME_IDS.some((id) => runtimeConnected(state, id)));
  const connectedRuntimes = useStore((state) =>
    RUNTIME_IDS.filter((id) => runtimeConnected(state, id)).join(","));
  const setUi = useStore((state) => state.setUi);
  const settingsOpen = useStore((state) => state.ui.settingsOpen);

  useEffect(() => {
    init();
  }, []);

  useEffect(() => {
    reportDiagnostic("app_state", {
      accountChecked,
      connectedRuntimes: connectedRuntimes ? connectedRuntimes.split(",") : [],
      externalAuthChecked,
      status,
    });
  }, [accountChecked, connectedRuntimes, externalAuthChecked, status]);

  useEffect(() => {
    if (status !== "ready") return;
    const threadId = new URLSearchParams(window.location.search).get("thread");
    if (threadId) useStore.getState().openThread(threadId);
  }, [status]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const state = useStore.getState();
      const overrides = state.ui.keybindings;
      const matches = (command) =>
        bindingsFor(command, overrides).some((binding) => matchAccel(event, binding));
      const run = (command) => {
        switch (command) {
          case "newChat":
            state.setUi({ navView: "chats" });
            state.newChat();
            break;
          case "newStandaloneChat":
            state.setCwd(null);
            state.setUi({ navView: "chats" });
            state.newChat();
            break;
          case "quickChat":
            api.toggleQuickChat();
            break;
          case "archiveChat":
            if (state.activeThreadId && !state.activeConversation?.()?.readOnly) {
              state.archiveThread(state.activeThreadId);
            }
            break;
          case "openInNewWindow":
            if (state.activeThreadId) api.openThreadWindow(state.activeThreadId);
            break;
          case "nextRecentChat": {
            const threadId = mostRecentThreadId(state.navBack, state.activeThreadId);
            if (threadId) state.openThread(threadId);
            break;
          }
          case "nextTab": {
            const order = ["chats", "pull-requests", "scheduled", "sites", "plugins"];
            const index = order.indexOf(state.ui.navView);
            state.setUi({ navView: order[(index + 1) % order.length] });
            break;
          }
          case "renameChat":
            if (state.activeThreadId && !state.activeConversation?.()?.readOnly) {
              useStore.setState({ renameRequest: Date.now() });
            }
            break;
          case "togglePin": {
            if (state.activeConversation?.()?.readOnly) break;
            const cwd = state.activeConversation?.()?.thread?.cwd || state.cwd;
            if (cwd) state.togglePinnedProject(cwd);
            break;
          }
          case "focusBrowserAddress":
            panelHook.open?.("browser");
            setTimeout(() =>
              document.getElementById("browser-address-input")?.focus(), 150);
            break;
          case "commandMenu":
            setUi({ commandMenuOpen: !state.ui.commandMenuOpen });
            break;
          case "toggleSidebar":
            setUi({ sidebarOpen: !state.ui.sidebarOpen });
            break;
          case "toggleSidePanel":
            setUi({ rightOpen: !state.ui.rightOpen });
            break;
          case "toggleBottomPanel":
            if (state.ui.terminalLocation === "right") panelHook.open?.("terminal");
            else setUi({ bottomOpen: !state.ui.bottomOpen });
            break;
          case "findInThread":
            setUi({ findOpen: !state.ui.findOpen });
            break;
          case "openFilesTab":
            panelHook.open?.("files");
            break;
          case "openBrowserTab":
            panelHook.open?.("browser");
            break;
          case "openSideChatTab":
            panelHook.open?.("sidechat");
            break;
          case "openReviewTab":
            panelHook.open?.("review");
            break;
          case "back":
            state.goBack();
            break;
          case "forward":
            state.goForward();
            break;
          case "closeWindow":
            window.close();
            break;
          case "settings":
            setUi({ settingsOpen: true });
            break;
        }
      };

      for (const [command] of COMMANDS) {
        if (!matches(command)) continue;
        event.preventDefault();
        run(command);
        return;
      }
    };
    const onMouseUp = (event) => {
      if (event.button !== 3 && event.button !== 4) return;
      event.preventDefault();
      const state = useStore.getState();
      if (event.button === 3) state.goBack();
      else state.goForward();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("mouseup", onMouseUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("mouseup", onMouseUp);
    };
  }, []);

  if (status !== "ready") return <BootScreen status={status} />;
  if (!accountChecked || !externalAuthChecked) {
    return <BootScreen status="checking-account" />;
  }
  if (!anyConnected) return <AuthScreen />;

  const overlays = (
    <>
      <CommandMenu />
      {settingsOpen && (
        <React.Suspense fallback={null}>
          <Settings />
        </React.Suspense>
      )}
      <Toasts />
    </>
  );
  return <DesktopShell overlays={overlays} />;
}

function BootScreen({ status }) {
  const binary = useStore((state) => state.binary);
  const binaryCandidates = useStore((state) => state.binaryCandidates);
  const backendError = useStore((state) => state.backendError);
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-(--surface)">
      {status === "crashed" ? (
        <>
          <div className="text-[15px] font-medium text-(--danger)">
            ChatGPT Desktop Community backend failed to start
          </div>
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
              ? "Starting ChatGPT Desktop Community…"
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
  const loginError = useStore((state) => state.loginError);

  useEffect(() => {
    useStore.getState().refreshExternalAuth();
    const timer = setInterval(() => useStore.getState().refreshExternalAuth(), 4000);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="app-drag flex h-full w-full items-center justify-center bg-(--surface)">
      <div className="app-no-drag flex w-[400px] flex-col items-center text-center">
        <div className="mb-5 flex size-12 items-center justify-center rounded-2xl border border-(--border) bg-(--surface-raised)">
          <IconChat size={24} />
        </div>
        <h1 className="text-[22px] font-semibold">ChatGPT Desktop Community</h1>
        <p className="mt-2 max-w-[340px] text-[13px] leading-5 text-(--fg-tertiary)">
          Sign in with any provider below to use its account and models.
        </p>
        <div className="mt-6 flex w-full flex-col gap-2">
          {RUNTIMES.map((runtime) => (
            <AuthVendorRow key={runtime.id} meta={runtime} />
          ))}
        </div>
        {loginError && (
          <div className="mt-4 text-[12px] leading-5 text-(--danger)">
            {loginError}
          </div>
        )}
        <p className="mt-6 text-[11px] leading-4 text-(--fg-faint)">
          Credentials are handled and stored locally by each provider&apos;s runtime.
        </p>
      </div>
    </div>
  );
}

function AuthVendorRow({ meta }) {
  const connected = useStore((state) => runtimeConnected(state, meta.id));
  const loginStatus = useStore((state) => state.loginStatus);
  const startLogin = useStore((state) => state.startChatgptLogin);
  const cancelLogin = useStore((state) => state.cancelChatgptLogin);
  const startExternalLogin = useStore((state) => state.startExternalLogin);
  const codex = meta.id === "codex";
  const waiting = codex && [
    "starting",
    "waiting",
    "completing",
  ].includes(loginStatus);
  const label = loginStatus === "starting"
    ? "Starting…"
    : loginStatus === "waiting"
      ? "In browser…"
      : loginStatus === "completing"
        ? "Finishing…"
        : "Connect";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-(--border-light) bg-(--surface-under) px-4 py-3 text-left">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center">
        {meta.icon(20)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium">{meta.label}</div>
        <div className="text-[11px] text-(--fg-tertiary)">
          {connected
            ? "Connected"
            : codex
              ? "Sign in with your ChatGPT account"
              : `Sign in via the ${meta.label} CLI (opens a window)`}
        </div>
      </div>
      {connected ? (
        <LucideIcon name="Check" size={16} className="shrink-0 text-(--success)" />
      ) : (
        <button
          className="flex h-7 shrink-0 items-center rounded-lg bg-(--fg) px-3 text-[12px] font-medium text-(--surface) disabled:opacity-60"
          disabled={waiting}
          onClick={() => (codex ? startLogin() : startExternalLogin(meta.id))}
        >
          {codex ? label : "Connect"}
        </button>
      )}
      {!connected && codex && loginStatus === "waiting" && (
        <button
          className="shrink-0 text-xs text-(--fg-tertiary) hover:text-(--fg)"
          onClick={cancelLogin}
        >
          Cancel
        </button>
      )}
    </div>
  );
}

function CommandMenu() {
  const open = useStore((state) => state.ui.commandMenuOpen);
  const setUi = useStore((state) => state.setUi);
  const threads = useStore((state) => state.threads);
  const externalThreads = EXTERNAL_RUNTIMES.map((runtime) =>
    useStore((state) => state[runtime.stateKeys.threads]));
  const openThread = useStore((state) => state.openThread);
  const newChat = useStore((state) => state.newChat);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
  }, [open]);
  if (!open) return null;

  const filtered = [...threads, ...externalThreads.flat()]
    .filter((thread) => {
      const text = `${thread.name || ""} ${thread.preview || ""} ${thread.cwd || ""}`;
      return text.toLowerCase().includes(query.toLowerCase());
    })
    .slice(0, 12);
  const pick = (thread) => {
    setUi({ commandMenuOpen: false });
    if (thread) openThread(thread.id);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-[18vh]"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setUi({ commandMenuOpen: false });
      }}
    >
      <div
        className="fade-in w-[520px] overflow-hidden rounded-2xl border border-(--border) bg-(--surface-raised)"
        style={{ boxShadow: "var(--shadow-menu)" }}
      >
        <div className="flex items-center gap-2 border-b border-(--border-light) px-4 py-3">
          <IconSearch size={14} className="text-(--fg-tertiary)" />
          <input
            autoFocus
            className="w-full bg-transparent text-[14px] outline-none placeholder:text-(--fg-faint)"
            placeholder="Search chats…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSelectedIndex(0);
            }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedIndex(Math.min(selectedIndex + 1, filtered.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedIndex(Math.max(selectedIndex - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                pick(filtered[selectedIndex]);
              } else if (event.key === "Escape") {
                setUi({ commandMenuOpen: false });
              }
            }}
          />
          <span className="rounded border border-(--border-light) px-1.5 py-0.5 text-[10px] text-(--fg-faint)">
            esc
          </span>
        </div>
        <div className="max-h-[320px] overflow-y-auto py-1">
          <button
            className="flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px] hover:bg-(--surface-hover)"
            onClick={() => {
              setUi({ commandMenuOpen: false });
              newChat();
            }}
          >
            <span className="flex h-6 w-6 items-center justify-center rounded-md bg-(--accent-soft) text-(--accent)">
              ＋
            </span>
            New chat
          </button>
          {filtered.map((thread, index) => {
            const meta = runtimeMeta(thread.source);
            return (
              <button
                key={thread.id}
                className={cx(
                  "flex w-full items-center gap-2.5 px-4 py-2 text-left text-[13px]",
                  index === selectedIndex
                    ? "bg-(--surface-active)"
                    : "hover:bg-(--surface-hover)",
                )}
                onMouseEnter={() => setSelectedIndex(index)}
                onClick={() => pick(thread)}
              >
                {meta
                  ? meta.icon(14, "shrink-0")
                  : <IconChat size={14} className="shrink-0 text-(--fg-tertiary)" />}
                <span className="truncate">
                  {thread.name || (thread.preview || "").split("\n")[0] || "New chat"}
                </span>
                {meta && (
                  <span className="ml-auto shrink-0 text-[10px] text-(--fg-faint)">
                    {meta.label}
                  </span>
                )}
              </button>
            );
          })}
          {filtered.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px] text-(--fg-tertiary)">
              No matches
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
