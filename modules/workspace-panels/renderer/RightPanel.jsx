// Right side panel: a browser-like tab container, replicating the reference
// app. The tab strip (RightPanelHeader) tops the panel itself; the panel body
// hosts tab contents, or the empty state (tab-type menu + suggested files)
// when no tabs are open. Closing the last tab hides the panel; the panel can
// expand to fill the whole window.
import React, { useEffect, useRef, useState } from "react";
import { useStore } from "@app/store.js";
import * as api from "@app/api.js";
import { cx } from "@app/lib/cx.js";
import { basename } from "@app/lib/time.js";
import { Menu, IconButton } from "@app/components/ui.jsx";
import {
  IconPlus, IconReview, IconPanelFiles, IconPanelTerminal, IconPanelBrowser,
  IconSideChat, IconFile, IconX,
} from "@app/components/icons.jsx";
import { bindingFor } from "@modules/shortcuts";
import ReviewTab from "./panel/ReviewTab.jsx";
import FilesTab from "./panel/FilesTab.jsx";
import TerminalTab from "./panel/TerminalTab.jsx";
import SideChatTab from "./panel/SideChatTab.jsx";
import BrowserTab from "./panel/BrowserTab.jsx";
import { FileIcon } from "./panel/FileIcon.jsx";
import { openFileInPanel, usePanelStore } from "./state.js";
import { shellTitleCommand } from "@modules/terminal";
import {
  emptyPanelActionOrder,
  PANEL_ACTION_COMMANDS,
  PANEL_ACTION_ORDER,
  panelActionAvailable,
} from "./panel-actions.mjs";

// ---------------------------------------------------------------------------
// Tab model
// ---------------------------------------------------------------------------
// kinds: review | terminal | browser | files | sidechat
//   files    — multi-instance; carries filePath (undefined → "Open file")
//   terminal — multi-instance
//   review / browser / sidechat — singletons (opening focuses the existing one)
export const TAB_KINDS = {
  review: { title: "Review", icon: IconReview, component: ReviewTab },
  terminal: { title: "Terminal", icon: IconPanelTerminal, component: TerminalTab },
  browser: { title: "Browser", icon: IconPanelBrowser, component: BrowserTab },
  files: { title: "Files", icon: IconPanelFiles, component: FilesTab },
  sidechat: { title: "Side chat", icon: IconSideChat, component: SideChatTab },
};
// order shown in the "+" dropdown (reference uses a different fixed order)
const PLUS_MENU_ORDER = ["review", "files", "sidechat", "browser", "terminal"];

function actionHint(kind, keybindings) {
  const command = PANEL_ACTION_COMMANDS[kind];
  return command ? bindingFor(command, keybindings) : null;
}

export function tabTitle(tab) {
  if (tab.kind === "files") return tab.filePath ? basename(tab.filePath) : "Open file";
  if (tab.kind === "browser") return tab.title || "New tab";
  return TAB_KINDS[tab.kind].title;
}
function tabIcon(tab) {
  if (tab.kind === "files" && tab.filePath) return IconFile;
  return TAB_KINDS[tab.kind].icon;
}
// per-file-type icon for file tabs
function FileTabGlyph({ path }) {
  return <FileIcon name={path} size={13} />;
}

// Terminal tabs take the shell-style title (user@host), like the reference.
let shellTitleCache = null;
function useShellTitle() {
  const [t, setT] = useState(shellTitleCache);
  useEffect(() => {
    if (shellTitleCache) return undefined;
    let live = true;
    api.rpc("command/exec", {
      command: shellTitleCommand,
      timeoutMs: 5000,
    })
      .then((r) => {
        const out = String(r?.stdout ?? r?.output ?? "").trim();
        if (live && out) { shellTitleCache = out; setT(out); }
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);
  return t;
}

// ---------------------------------------------------------------------------
// Tab strip rendered inside the global header (right region, above the panel).
// ---------------------------------------------------------------------------
export function RightPanelHeader() {
  const tabs = usePanelStore((s) => s.tabs);
  const activeId = usePanelStore((s) => s.activeId);
  const { activate, close } = usePanelStore.getState();
  const expanded = useStore((s) => !!s.ui.rightExpanded);
  const setUi = useStore((s) => s.setUi);
  const [menuOpen, setMenuOpen] = useState(false);
  const plusRef = useRef(null);
  const hasGit = useHasGit(usePanelCwd());
  const runtime = usePanelRuntime();
  const keybindings = useStore((s) => s.ui.keybindings);

  const suggested = useSuggestedFiles();
  const kinds = PLUS_MENU_ORDER.filter((k) =>
    panelActionAvailable(k, { runtime, hasGit, hasActiveThread: true }));
  const menuItems = [
    ...kinds.map((k) => ({
      id: k,
      label: TAB_KINDS[k].title,
      hint: actionHint(k, keybindings) || undefined,
      icon: React.createElement(TAB_KINDS[k].icon, { size: 14 }),
      onSelect: () => usePanelStore.getState().open(k),
    })),
    ...(suggested.length
      ? [
          { sep: true },
          { header: "Suggested" },
          ...suggested.map((f) => ({
            id: `file:${f.full}`,
            label: f.name,
            icon: <FileIcon name={f.name} size={14} />,
            onSelect: () => openFileInPanel(f.full),
          })),
        ]
      : []),
  ];

  return (
    <div className="app-drag pointer-events-auto flex h-full min-w-0 items-center">
      {/* tab strip: scrollable, "+" pinned at its end (like the reference) */}
      {tabs.length > 0 && (
        <div
          className="app-drag hide-scrollbar flex h-full min-w-0 max-w-[calc(100%-44px)] shrink items-center gap-1.5 overflow-x-auto pl-1"
          onDragOver={(e) => {
            if (draggedTabId == null) return;
            // dragging over strip background (not a tab) → move to the end
            if (e.target === e.currentTarget) {
              e.preventDefault();
              usePanelStore.getState().move(draggedTabId, null);
            }
          }}
        >
          {tabs.map((t, i) => (
            <PanelTab
              key={t.id}
              tab={t}
              active={t.id === activeId}
              showSep={i < tabs.length - 1 && tabs[i + 1].id !== activeId && t.id !== activeId}
              onActivate={() => activate(t.id)}
              onClose={() => close(t.id)}
            />
          ))}
          <button
            ref={plusRef}
            title="Open side panel tab"
            className="app-no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-(--fg-secondary) hover:bg-(--tab-active-bg) hover:text-(--fg)"
            onClick={() => setMenuOpen(true)}
          >
            <IconPlus size={14} />
          </button>
        </div>
      )}
      <div className="app-drag h-full min-w-4 flex-1" />
      <IconButton
        icon={expanded ? <IconCompress /> : <IconExpand />}
        title={expanded ? "Restore panel width" : "Expand panel"}
        className="mr-1"
        onClick={() => setUi({ rightExpanded: !expanded })}
      />
      <Menu open={menuOpen} anchor={() => plusRef.current?.getBoundingClientRect()} items={menuItems} onClose={() => setMenuOpen(false)} width={248} align="start" />
    </div>
  );
}

// module-level drag state for tab reordering (dataTransfer is unreadable
// during dragover, so the dragged id is tracked here)
let draggedTabId = null;

function PanelTab({ tab, active, showSep, onActivate, onClose }) {
  const tabRef = useRef(null);
  const Icon = tabIcon(tab);
  const shellTitle = useShellTitle();
  const title = tab.kind === "terminal" && shellTitle ? shellTitle : tabTitle(tab);
  useEffect(() => {
    if (!active) return;
    tabRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);
  return (
    <div
      ref={tabRef}
      className="app-no-drag group/tab relative flex h-7 max-w-39 shrink-0 items-center rounded-lg"
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", String(tab.id));
        e.dataTransfer.effectAllowed = "move";
        draggedTabId = tab.id;
      }}
      onDragEnd={() => { draggedTabId = null; }}
      onDragOver={(e) => {
        if (draggedTabId == null || draggedTabId === tab.id) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        const r = e.currentTarget.getBoundingClientRect();
        const before = e.clientX < r.left + r.width / 2;
        const st = usePanelStore.getState();
        const rest = st.tabs.filter((t) => t.id !== draggedTabId);
        const tIdx = rest.findIndex((t) => t.id === tab.id);
        st.move(draggedTabId, before || tIdx < 0 ? rest[tIdx]?.id ?? null : rest[tIdx + 1]?.id ?? null);
      }}
    >
      <div
        className={cx(
          "pointer-events-none absolute inset-0 rounded-md transition-colors",
          active ? "bg-(--tab-active-bg)" : "group-hover/tab:bg-(--tab-active-bg)"
        )}
      />
      <button
        className={cx(
          "relative z-10 flex h-full min-w-0 flex-1 items-center gap-2 pr-1 pl-2.5 text-[13px]",
          active ? "text-(--fg)" : "text-(--fg-secondary)"
        )}
        onClick={onActivate}
        title={title}
      >
        {tab.kind === "files" && tab.filePath ? (
          <FileTabGlyph path={basename(tab.filePath)} />
        ) : (
          <Icon size={13} className="shrink-0" />
        )}
        <span className="min-w-0 truncate">{title}</span>
      </button>
      <button
        aria-label={`Close ${title} tab`}
        className={cx(
          "relative z-10 mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-(--fg-tertiary) hover:bg-(--surface-active) hover:text-(--fg)",
          active ? "opacity-100" : "opacity-0 group-hover/tab:opacity-100"
        )}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      >
        <IconX size={11} />
      </button>
      {showSep && <div className="absolute -right-1 h-3 w-px bg-(--border)" />}
    </div>
  );
}

// Panel width glyphs extracted verbatim from the reference app.
function IconExpand({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M4.33496 11C4.33496 10.6327 4.63273 10.335 5 10.335C5.36727 10.335 5.66504 10.6327 5.66504 11V14.335H9L9.13379 14.3486C9.43692 14.4106 9.66504 14.6786 9.66504 15C9.66504 15.3214 9.43692 15.5894 9.13379 15.6514L9 15.665H5C4.63273 15.665 4.33496 15.3673 4.33496 15V11ZM14.335 9V5.66504H11C10.6327 5.66504 10.335 5.36727 10.335 5C10.335 4.63273 10.6327 4.33496 11 4.33496H15L15.1338 4.34863C15.4369 4.41057 15.665 4.67857 15.665 5V9C15.665 9.36727 15.3673 9.66504 15 9.66504C14.6327 9.66504 14.335 9.36727 14.335 9Z" fill="currentColor" />
    </svg>
  );
}
function IconCompress({ size = 16 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M6.1664 8.80845C6.7325 8.80845 7.1918 9.26774 7.1918 9.83384V13.3338C7.19155 13.6236 6.9562 13.8592 6.6664 13.8592C6.37672 13.8591 6.14126 13.6235 6.14101 13.3338V10.5936L2.70547 14.0379C2.50071 14.243 2.16753 14.2435 1.9623 14.0389C1.75709 13.8342 1.75665 13.501 1.96133 13.2957L5.39101 9.85923H2.6664C2.37672 9.85909 2.14126 9.6235 2.14101 9.33384C2.14101 9.04397 2.37657 8.80858 2.6664 8.80845H6.1664Z" fill="currentColor" />
      <path d="M13.2943 1.96274C13.4989 1.75743 13.8311 1.75731 14.0365 1.96177C14.2419 2.16637 14.243 2.49854 14.0385 2.70395L10.6127 6.14145H13.3334C13.6233 6.14145 13.8588 6.37689 13.8588 6.66684C13.8587 6.95674 13.6233 7.19223 13.3334 7.19223H9.8334C9.26734 7.19223 8.80807 6.73288 8.80801 6.16684V2.66684C8.80801 2.37689 9.04345 2.14145 9.3334 2.14145C9.62335 2.14145 9.85879 2.37689 9.85879 2.66684V5.41098L13.2943 1.96274Z" fill="currentColor" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Panel body: active tab content (all tabs stay mounted to preserve terminal
// sessions / tree state), or the empty state when no tabs exist.
// ---------------------------------------------------------------------------
export default function RightPanel() {
  const tabs = usePanelStore((s) => s.tabs);
  const activeId = usePanelStore((s) => s.activeId);
  if (!tabs.length) {
    return (
      <div className="right-panel-root pointer-events-none h-full w-full pt-[46px]">
        <div className="pointer-events-auto h-full">
          <PanelEmptyState />
        </div>
      </div>
    );
  }
  return (
    <div className="right-panel-root pointer-events-none flex h-full w-full flex-col pt-[46px]">
      <div className="pointer-events-auto min-h-0 flex-1">
        {tabs.map((t) => {
          const C = TAB_KINDS[t.kind].component;
          return (
            <div key={t.id} className={cx("h-full", t.id !== activeId && "hidden")}>
              {t.kind === "files" ? <C tab={t} /> : <C />}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Current working directory of the panel (thread cwd, else the global one).
function usePanelCwd() {
  return useStore((s) => {
    const conv = s.activeThreadId ? s.conversations[s.activeThreadId] : null;
    return conv?.thread?.cwd || s.cwd || "";
  });
}

function usePanelRuntime() {
  return useStore((s) => {
    const threadId = s.activeThreadId;
    const conv = threadId ? s.conversations[threadId] : null;
    const thread = conv?.thread;
    if (thread?.runtime) return thread.runtime;
    if (thread?.source === "claude" || threadId?.startsWith("claude:")) return "claude";
    if (thread?.source === "kimi" || threadId?.startsWith("kimi:")) return "kimi";
    return s.runtime || "codex";
  });
}

// Review tab only exists for git working directories (reference behavior).
// The probe re-runs on an interval so a boot-time app-server outage doesn't
// leave the panel stuck on the wrong empty state.
function useHasGit(cwd) {
  const threadBranch = useStore((s) => {
    const conv = s.activeThreadId ? s.conversations[s.activeThreadId] : null;
    return conv?.thread?.gitInfo?.branch || null;
  });
  const [probed, setProbed] = useState(false);
  useEffect(() => {
    let live = true;
    setProbed(false);
    if (!cwd) return undefined;
    const probe = () =>
      api.rpc("command/exec", { command: ["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd, timeoutMs: 8000 })
        .then((res) => {
          if (!live) return;
          const out = String(res?.stdout ?? res?.output ?? "").split("\n")[0].trim();
          setProbed(!!out && out !== "HEAD");
        })
        .catch(() => {});
    probe();
    const t = setInterval(probe, 10000);
    return () => { live = false; clearInterval(t); };
  }, [cwd]);
  return !!threadBranch || probed;
}

// Top-level files of the thread cwd, shared by the empty state and the "+"
// menu's Suggested section. Returns [{name, full}].
function useSuggestedFiles() {
  const cwd = usePanelCwd();
  const [files, setFiles] = useState([]);
  useEffect(() => {
    let live = true;
    if (!cwd) { setFiles([]); return; }
    api.rpc("fs/readDirectory", { path: cwd })
      .then((r) => {
        if (!live) return;
        const list = (r?.entries || [])
          .filter((e) => !e.isDirectory && !e.fileName.startsWith("."))
          .map((e) => ({ name: e.fileName, full: `${cwd.replace(/\/+$/, "")}/${e.fileName}` }))
          .slice(0, 12);
        setFiles(list);
      })
      .catch(() => live && setFiles([]));
    return () => { live = false; };
  }, [cwd]);
  return files;
}

// ---------------------------------------------------------------------------
// Empty state: the reference app's five tab-type actions in a centered
// max-w-xl column.
// ---------------------------------------------------------------------------
function PanelEmptyState() {
  const keybindings = useStore((s) => s.ui.keybindings);
  const mode = useStore((s) => s.mode);
  const hasActiveThread = useStore((s) => !!s.activeThreadId);
  const hasGit = useHasGit(usePanelCwd());
  const runtime = usePanelRuntime();
  const actions = emptyPanelActionOrder({ mode, runtime, hasActiveThread, hasGit });
  return (
    <div className="flex h-full w-full flex-col overflow-x-hidden overflow-y-auto bg-(--surface) p-2 select-none">
      <div className="flex min-h-0 flex-1 flex-col justify-center">
        <div className="mx-auto flex w-full max-w-xl flex-col gap-1 px-5">
          {actions.map((k) => {
            const def = TAB_KINDS[k];
            const Icon = def.icon;
            const hint = actionHint(k, keybindings);
            return (
              <button
                key={k}
                className="flex min-h-10 w-full items-center gap-2 rounded-[10px] bg-(--panel-action-bg) px-2.5 py-2 text-left hover:bg-(--panel-action-hover-bg)"
                onClick={() => usePanelStore.getState().open(k)}
              >
                <Icon size={16} className="shrink-0 text-(--fg-tertiary)" />
                <span className="min-w-0 flex-1 truncate text-[13px] leading-[18.5714px] text-(--fg)">{def.title}</span>
                {hint && (
                  <kbd className="shrink-0 rounded-[10px] bg-(--keybinding-bg) px-1.5 py-0.5 text-xs leading-3 font-[445] text-(--fg-secondary)">{hint}</kbd>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
