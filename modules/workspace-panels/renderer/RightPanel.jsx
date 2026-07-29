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
  IconPlus, IconFolder, IconTerminal, IconChat, IconGlobe,
  IconFile, IconX, LucideIcon,
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

// ---------------------------------------------------------------------------
// Tab model
// ---------------------------------------------------------------------------
// kinds: review | terminal | browser | files | sidechat
//   files    — multi-instance; carries filePath (undefined → "Open file")
//   terminal — multi-instance
//   review / browser / sidechat — singletons (opening focuses the existing one)
export const TAB_KINDS = {
  review: { title: "Review", icon: IconReview, component: ReviewTab, commandId: "openReviewTab" },
  terminal: { title: "Terminal", icon: IconTerminal, component: TerminalTab },
  browser: { title: "Browser", icon: IconGlobe, component: BrowserTab, commandId: "openBrowserTab" },
  files: { title: "Files", icon: IconFolder, component: FilesTab, commandId: "openFilesTab" },
  sidechat: { title: "Side chat", icon: IconChat, component: SideChatTab, commandId: "openSideChatTab" },
};
// order shown in the empty state (matches the reference app)
const MENU_ORDER = ["review", "terminal", "browser", "files", "sidechat"];
// order shown in the "+" dropdown (reference uses a different fixed order)
const PLUS_MENU_ORDER = ["review", "files", "sidechat", "browser", "terminal"];

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

  const suggested = useSuggestedFiles();
  const menuItems = [
    ...PLUS_MENU_ORDER.map((k) => ({
      id: k,
      label: TAB_KINDS[k].title,
      hint: shortcutHint(TAB_KINDS[k]),
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
    <div className="app-drag flex h-full min-w-0 items-center">
      {/* tab strip: scrollable, "+" pinned at its end (like the reference) */}
      <div
        className="app-no-drag hide-scrollbar flex h-full min-w-0 flex-1 items-center gap-1.5 overflow-x-auto pl-1"
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
      <IconButton
        icon={expanded ? <IconCompress /> : <IconExpand />}
        title={expanded ? "Collapse panel" : "Expand panel"}
        onClick={() => setUi({ rightExpanded: !expanded })}
      />
      <div className="app-drag h-full min-w-4 flex-1" data-testid="right-panel-header-drag-region" />
      <Menu open={menuOpen} anchor={() => plusRef.current?.getBoundingClientRect()} items={menuItems} onClose={() => setMenuOpen(false)} width={248} align="start" />
    </div>
  );
}

// module-level drag state for tab reordering (dataTransfer is unreadable
// during dragover, so the dragged id is tracked here)
let draggedTabId = null;

function PanelTab({ tab, active, showSep, onActivate, onClose }) {
  const Icon = tabIcon(tab);
  const shellTitle = useShellTitle();
  const title = tab.kind === "terminal" && shellTitle ? shellTitle : tabTitle(tab);
  return (
    <div
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
          "app-no-drag relative z-10 flex h-full min-w-0 flex-1 items-center gap-2 pr-1 pl-2.5 text-[13px]",
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
          "app-no-drag relative z-10 mr-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-(--fg-tertiary) hover:bg-(--surface-active) hover:text-(--fg)",
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

// expand / compress panel icons (four corners, Lucide).
function IconExpand({ size = 15 }) {
  return <LucideIcon name="Maximize2" size={size} />;
}
function IconCompress({ size = 15 }) {
  return <LucideIcon name="Minimize2" size={size} />;
}

function IconReview({ size = 15, className }) {
  return <LucideIcon name="ListChecks" size={size} className={className} />;
}

function shortcutHint(definition) {
  return definition.commandId ? bindingFor(definition.commandId) : undefined;
}

// ---------------------------------------------------------------------------
// Panel body: active tab content (all tabs stay mounted to preserve terminal
// sessions / tree state), or the empty state when no tabs exist.
// ---------------------------------------------------------------------------
export default function RightPanel() {
  const tabs = usePanelStore((s) => s.tabs);
  const activeId = usePanelStore((s) => s.activeId);
  return (
    <div className="right-panel-root flex h-full w-full flex-col">
      {!tabs.length ? (
        <PanelEmptyState />
      ) : (
        <div className="min-h-0 flex-1">
          {tabs.map((t) => {
            const C = TAB_KINDS[t.kind].component;
            return (
              <div key={t.id} className={cx("h-full", t.id !== activeId && "hidden")}>
                {t.kind === "files" ? <C tab={t} /> : <C />}
              </div>
            );
          })}
        </div>
      )}
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
// Empty state: the reference app's tab-type menu (side chat / browser /
// terminal) in a centered max-w-xl column.
// ---------------------------------------------------------------------------
function PanelEmptyState() {
  return (
    <div className="flex h-full w-full flex-col bg-(--surface)">
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
        <div className="m-auto flex w-full max-w-xl flex-col gap-1 px-4 py-6">
          {MENU_ORDER.map((k) => {
            const def = TAB_KINDS[k];
            const Icon = def.icon;
            const hint = shortcutHint(def);
            return (
              <button
                key={k}
                className="flex min-h-10 w-full items-center gap-2 rounded-md bg-(--surface-hover) px-2.5 py-2 text-left transition-colors hover:bg-(--surface-active)"
                onClick={() => usePanelStore.getState().open(k)}
              >
                <Icon size={16} className="shrink-0 text-(--fg-tertiary)" />
                <span className="min-w-0 flex-1 truncate text-[13px] text-(--fg)">{def.title}</span>
                {hint && (
                  <kbd className="shrink-0 rounded-md bg-(--surface-active) px-1.5 py-0.5 text-xs text-(--fg-secondary)">{hint}</kbd>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
