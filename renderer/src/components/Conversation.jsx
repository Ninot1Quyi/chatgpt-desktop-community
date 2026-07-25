// Center column: thread header, scrollable message list, plan widget,
// approvals, composer. Also the new-chat home screen.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store.js";
import { cx } from "../lib/cx.js";
import * as api from "../api.js";
import { basename, formatDuration } from "../lib/time.js";
import Composer from "./Composer.jsx";
import OutputsPanel from "./OutputsPanel.jsx";
import { ItemView, PlanWidget, ApprovalCard, TurnActionRow } from "./items.jsx";
import { Menu, Dialog, IconButton, Spinner } from "./ui.jsx";
import { IconBranch, IconFolder, IconMore, IconPanelRight, IconChevronRight, IconChevronDown, IconX, IconFile, IconTerminal, IconGlobe, IconWrench, IconSparkle, IconFolderFilled, LucideIcon } from "./icons.jsx";
import { panelHook } from "../lib/panelHook.js";
import { usePanelStore } from "./RightPanel.jsx";

const IconOutputs = (p) => <LucideIcon name="SlidersHorizontal" size={p.size || 16} className={p.className} style={p.style} />;
const IconPanelBottom = (p) => <LucideIcon name="PanelBottom" size={p.size || 16} className={p.className} style={p.style} />;
const IconArrowDown = (p) => <LucideIcon name="ArrowDown" size={p.size || 16} className={p.className} style={p.style} />;

// Codex mark (home logo) — extracted verbatim from the reference app bundle.
export function CodexMark({ size = 56, className, style }) {
  return (
    <svg width={size} height={size} viewBox="149 149 418 418" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} style={style} aria-hidden="true">
      <mask id="codex-mark-mask" fill="white"><path fillRule="evenodd" clipRule="evenodd" d="M247.429 247.43C257.73 208.911 292.871 180.543 334.638 180.543C359.555 180.543 382.115 190.64 398.449 206.964C405.906 204.97 413.743 203.905 421.829 203.905C471.681 203.906 512.096 244.32 512.096 294.173C512.096 302.259 511.031 310.096 509.037 317.553C525.361 333.887 535.458 356.446 535.458 381.364C535.458 423.131 507.09 458.271 468.571 468.572C458.271 507.091 423.131 535.459 381.364 535.459C356.446 535.459 333.886 525.362 317.552 509.037C310.095 511.031 302.258 512.097 294.172 512.097C244.319 512.097 203.906 471.682 203.906 421.829C203.906 413.743 204.969 405.905 206.963 398.448C190.639 382.115 180.543 359.555 180.543 334.638C180.543 292.871 208.91 257.73 247.429 247.43Z"></path></mask><path d="M247.429 247.43L252.746 267.312L264.238 264.239L267.311 252.747L247.429 247.43ZM334.638 180.543L334.638 159.962L334.638 159.962L334.638 180.543ZM398.449 206.964L383.9 221.521L392.297 229.913L403.765 226.846L398.449 206.964ZM421.829 203.905L421.829 183.325L421.829 183.325L421.829 203.905ZM512.096 294.173L532.677 294.173L532.677 294.173L512.096 294.173ZM509.037 317.553L489.155 312.236L486.087 323.705L494.48 332.102L509.037 317.553ZM535.458 381.364L556.039 381.364L556.039 381.364L535.458 381.364ZM468.571 468.572L463.255 448.69L451.762 451.763L448.689 463.255L468.571 468.572ZM381.364 535.459L381.364 556.04L381.364 556.04L381.364 535.459ZM317.552 509.037L332.101 494.481L323.704 486.088L312.235 489.155L317.552 509.037ZM294.172 512.097L294.172 532.678L294.173 532.678L294.172 512.097ZM203.906 421.829L183.325 421.829L183.325 421.829L203.906 421.829ZM206.963 398.448L226.845 403.765L229.912 392.297L221.52 383.9L206.963 398.448ZM180.543 334.638L159.962 334.638L159.962 334.639L180.543 334.638ZM247.429 247.43L267.311 252.747C275.266 223.003 302.423 201.124 334.638 201.124L334.638 180.543L334.638 159.962C283.319 159.962 240.195 194.819 227.547 242.113L247.429 247.43ZM334.638 180.543L334.638 201.124C353.88 201.124 371.268 208.896 383.9 221.521L398.449 206.964L412.997 192.407C392.962 172.383 365.231 159.962 334.638 159.962L334.638 180.543ZM398.449 206.964L403.765 226.846C409.506 225.311 415.557 224.486 421.829 224.486L421.829 203.905L421.829 183.325C411.929 183.325 402.305 184.629 393.132 187.082L398.449 206.964ZM421.829 203.905L421.828 224.486C460.315 224.486 491.516 255.687 491.516 294.173L512.096 294.173L532.677 294.173C532.677 232.953 483.048 183.325 421.829 183.325L421.829 203.905ZM512.096 294.173L491.516 294.173C491.516 300.444 490.69 306.494 489.155 312.236L509.037 317.553L528.919 322.87C531.372 313.698 532.677 304.074 532.677 294.173L512.096 294.173ZM509.037 317.553L494.48 332.102C507.105 344.735 514.877 362.122 514.877 381.364L535.458 381.364L556.039 381.364C556.039 350.771 543.618 323.04 523.594 303.005L509.037 317.553ZM535.458 381.364L514.877 381.364C514.877 413.578 492.999 440.735 463.255 448.69L468.571 468.572L473.888 488.454C521.182 475.806 556.039 432.683 556.039 381.364L535.458 381.364ZM468.571 468.572L448.689 463.255C440.735 492.999 413.578 514.878 381.364 514.878L381.364 535.459L381.364 556.04C432.683 556.04 475.806 521.183 488.454 473.889L468.571 468.572ZM381.364 535.459L381.364 514.878C362.122 514.878 344.733 507.106 332.101 494.481L317.552 509.037L303.003 523.594C323.038 543.619 350.77 556.04 381.364 556.04L381.364 535.459ZM317.552 509.037L312.235 489.155C306.493 490.691 300.443 491.516 294.172 491.516L294.172 512.097L294.173 532.678C304.073 532.678 313.698 531.372 322.869 528.919L317.552 509.037ZM294.172 512.097L294.172 491.516C255.686 491.516 224.486 460.316 224.486 421.829L203.906 421.829L183.325 421.829C183.325 483.048 232.953 532.678 294.172 532.678L294.172 512.097ZM203.906 421.829L224.486 421.829C224.486 415.555 225.311 409.504 226.845 403.765L206.963 398.448L187.081 393.131C184.627 402.307 183.325 411.932 183.325 421.829L203.906 421.829ZM206.963 398.448L221.52 383.9C208.895 371.268 201.124 353.88 201.124 334.638L180.543 334.638L159.962 334.639C159.962 365.231 172.382 392.962 192.406 412.997L206.963 398.448ZM180.543 334.638L201.124 334.638C201.124 302.423 223.002 275.266 252.746 267.312L247.429 247.43L242.112 227.547C194.818 240.195 159.962 283.319 159.962 334.638L180.543 334.638Z" fill="currentColor" mask="url(#codex-mark-mask)"></path><path d="M436.706 408.738H370.021" stroke="currentColor" strokeWidth="24" strokeLinecap="round"></path><path d="M276.533 309.154L303.468 357.831C304.433 359.575 304.412 361.698 303.414 363.423L276.533 409.854" stroke="currentColor" strokeWidth="24" strokeLinecap="round"></path>
    </svg>
  );
}

// ---------------------------------------------------------------------------
export default function Conversation() {
  const activeThreadId = useStore((s) => s.activeThreadId);
  const conv = useStore((s) => (s.activeThreadId ? s.conversations[s.activeThreadId] : null));

  if (!activeThreadId) {
    return (
      <div className="flex h-full min-w-0 flex-1 flex-col">
        <Home />
      </div>
    );
  }

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      {conv?.loading ? (
        <div className="flex flex-1 items-center justify-center text-(--fg-tertiary)"><Spinner size={18} /></div>
      ) : conv?.error ? (
        <div className="flex flex-1 items-center justify-center px-8 text-center text-[13px] text-(--danger)">{conv.error}</div>
      ) : (conv?.turns || []).length === 0 ? (
        // Empty thread: home-like centered prompt with the composer below.
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="my-auto flex flex-col items-center px-4 py-6">
            <CodexMark size={56} className="text-(--fg) opacity-[0.24]" />
            <div className="mt-5 text-center text-[28px] leading-9 font-medium">
              What should we build in {basename(threadCwdOf(conv)) || "this folder"}?
            </div>
          </div>
        </div>
      ) : (
        <MessageList key={activeThreadId} conv={conv} />
      )}
      <BottomArea conv={conv} />
    </div>
  );
}

function threadCwdOf(conv) {
  return conv?.thread?.cwd || useStore.getState().cwd;
}

// ---------------------------------------------------------------------------
// Header content rendered inside the app's global header (see App.jsx).
// ---------------------------------------------------------------------------
export function ConversationHeaderContent() {
  const activeThreadId = useStore((s) => s.activeThreadId);
  if (!activeThreadId) return null;
  return <ThreadHeaderContent />;
}

function ThreadHeaderContent() {
  const conv = useStore((s) => (s.activeThreadId ? s.conversations[s.activeThreadId] : null));
  const thread = useStore((s) => {
    const id = s.activeThreadId;
    return id ? s.conversations[id]?.thread || s.threads.find((t) => t.id === id) : null;
  });

  return (
    <div className="flex items-center gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <IconFolderFilled size={15} className="app-no-drag shrink-0 text-(--fg-secondary)" />
        <div className="max-w-[320px] truncate text-[14px] font-medium">{thread?.name || "New chat"}</div>
        <ThreadMenu thread={thread} />
      </div>
    </div>
  );
}

// Conversation-side header buttons (middle column, right edge): the editor
// shortcut and the Context toggle live here in the reference app — NOT in
// the side panel's tab strip.
export function HeaderContextButtons() {
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <OpenInEditorButton />
      <IconButton
        icon={<IconOutputs />}
        title="Toggle pinned summary"
        active={!!ui.outputsOpen}
        onClick={() => setUi({ outputsOpen: !ui.outputsOpen })}
      />
    </div>
  );
}

// Window-level panel toggles (bottom panel, side panel).
export function HeaderPanelButtons() {
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <IconButton
        icon={<IconPanelBottom />}
        title="Toggle bottom panel"
        active={!!ui.bottomOpen}
        onClick={() => setUi({ bottomOpen: !ui.bottomOpen })}
      />
      <IconButton
        icon={<IconPanelRight />}
        title="Toggle side panel"
        active={!!ui.rightOpen}
        onClick={() => setUi({ rightOpen: !ui.rightOpen })}
      />
    </div>
  );
}

// "Open in VS Code" split button (main action + dropdown), as in the
// reference app's window header.
function OpenInEditorButton() {
  const cwd = useStore((s) => {
    const conv = s.activeThreadId ? s.conversations[s.activeThreadId] : null;
    return conv?.thread?.cwd || s.cwd || "";
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const chevRef = useRef(null);
  const openVSCode = () => {
    if (!cwd) return;
    api.openExternal(`vscode://file${cwd}`);
  };
  return (
    <div className="flex h-7 items-stretch overflow-hidden rounded-lg border border-(--border)">
      <button
        className="flex items-center gap-1.5 px-2 text-(--fg-secondary) hover:bg-(--surface-hover) hover:text-(--fg)"
        title="Open in"
        onClick={openVSCode}
      >
        <IconVSCode size={14} />
      </button>
      <button
        ref={chevRef}
        className="px-1 text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
        title="Open options"
        onClick={() => setMenuOpen(true)}
      >
        <IconChevronDown size={11} />
      </button>
      <Menu
        open={menuOpen}
        anchor={() => chevRef.current?.getBoundingClientRect()}
        onClose={() => setMenuOpen(false)}
        align="end"
        items={[
          { id: "vscode", label: "Open in VS Code", onSelect: openVSCode },
          { id: "finder", label: "Reveal in Finder", onSelect: () => cwd && api.showItemInFolder(cwd) },
          { id: "copy", label: "Copy path", onSelect: () => cwd && navigator.clipboard.writeText(cwd) },
        ]}
      />
    </div>
  );
}

function IconVSCode({ size = 14 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17 3.5 8.5 10 5 6.5 3.5 7.5v9L5 17.5l3.5-3.5 8.5 6.5 3-1.5v-14zM17 8v8l-5-4z" />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// "…" menu: rename / archive / copy working directory / copy session id.
// ---------------------------------------------------------------------------
function ThreadMenu({ thread }) {
  const activeThreadId = useStore((s) => s.activeThreadId);
  const pinned = useStore((s) => (s.gs?.["pinned-thread-ids"] || []).includes(s.activeThreadId));
  const renameThread = useStore((s) => s.renameThread);
  const archiveThread = useStore((s) => s.archiveThread);
  const toast = useStore((s) => s.toast);
  const renameRequest = useStore((s) => s.renameRequest);
  const btnRef = useRef(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [worktreeOpen, setWorktreeOpen] = useState(false);
  const [name, setName] = useState("");

  // ⌃R (Rename chat command) opens the same dialog.
  useEffect(() => {
    if (!renameRequest || !activeThreadId) return;
    setName(thread?.name || "");
    setRenameOpen(true);
  }, [renameRequest]);

  const copy = (text, label) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast(`${label} copied to clipboard`);
  };

  const copyMarkdown = () => {
    const conv = useStore.getState().activeConversation?.();
    const lines = [];
    for (const t of conv?.turns || []) {
      for (const it of t.items || []) {
        if (it.type === "userMessage") {
          lines.push("## User\n", (it.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n"));
        } else if (it.type === "agentMessage") {
          lines.push("## Codex\n", it.text || "");
        }
      }
    }
    if (lines.length) copy(lines.join("\n"), "Markdown");
    else toast("Nothing to copy yet", "warn");
  };

  return (
    <>
      <button
        ref={btnRef}
        title="Chat actions"
        className="app-no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
        onClick={() => setMenuOpen(true)}
      >
        <IconMore size={15} />
      </button>
      <Menu
        open={menuOpen}
        anchor={() => btnRef.current?.getBoundingClientRect()}
        onClose={() => setMenuOpen(false)}
        items={[
          {
            id: "pin",
            label: pinned ? "Unpin chat" : "Pin chat",
            hint: "⌥⌘P",
            onSelect: () => useStore.getState().togglePinnedThread(activeThreadId),
          },
          {
            id: "rename",
            label: "Rename chat",
            hint: "⌃R",
            onSelect: () => {
              setName(thread?.name || "");
              setRenameOpen(true);
            },
          },
          { id: "archive", label: "Archive chat", hint: "⇧⌘A", onSelect: () => setArchiveOpen(true) },
          {
            id: "sidechat",
            label: "Open side chat",
            hint: "⌥⌘S",
            onSelect: () => panelHook.open?.("sidechat"),
          },
          {
            id: "copy",
            label: "Copy",
            children: [
              { id: "copy-cwd", label: "Copy working directory", disabled: !thread?.cwd, onSelect: () => copy(thread?.cwd, "Working directory") },
              { id: "copy-id", label: "Copy session ID", disabled: !activeThreadId, onSelect: () => copy(activeThreadId, "Session ID") },
              { id: "copy-link", label: "Copy deeplink", disabled: !activeThreadId, onSelect: () => copy(`codex://local/${activeThreadId}`, "Deeplink") },
              { id: "copy-md", label: "Copy as Markdown", onSelect: copyMarkdown },
            ],
          },
          {
            id: "continue",
            label: "Continue in…",
            children: [
              {
                id: "fork",
                label: "New chat",
                disabled: !activeThreadId,
                onSelect: async () => {
                  try {
                    const r = await api.rpc("thread/fork", { threadId: activeThreadId });
                    if (r?.thread?.id) useStore.getState().openThread(r.thread.id);
                  } catch (e) {
                    toast(`Fork failed: ${e.message}`, "error");
                  }
                },
              },
              {
                id: "fork-worktree",
                label: "New worktree",
                disabled: !activeThreadId || (!thread?.gitInfo?.originUrl && !thread?.gitInfo?.branch),
                onSelect: () => setWorktreeOpen(true),
              },
            ],
          },
          { sep: true },
          {
            id: "schedule",
            label: "Add scheduled task…",
            onSelect: () => useStore.getState().setUi({ navView: "scheduled" }),
          },
          {
            id: "new-window",
            label: "Open in new window",
            disabled: !activeThreadId,
            onSelect: () => api.openThreadWindow(activeThreadId),
          },
        ]}
      />

      <Dialog open={renameOpen} title="Rename chat" onClose={() => setRenameOpen(false)}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const v = name.trim();
            if (v && activeThreadId) renameThread(activeThreadId, v);
            setRenameOpen(false);
          }}
        >
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-[14px] outline-none focus:border-(--accent)"
            placeholder="Chat name"
          />
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              className="rounded-lg border border-(--border) px-3 py-1.5 text-[13px] hover:bg-(--surface-hover)"
              onClick={() => setRenameOpen(false)}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!name.trim()}
              className="rounded-lg bg-(--fg) px-3 py-1.5 text-[13px] font-medium text-(--surface) hover:opacity-85 disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </form>
      </Dialog>

      <Dialog open={archiveOpen} title="Archive chat?" onClose={() => setArchiveOpen(false)}>
        <div className="text-[13px] text-(--fg-secondary)">You can find it later in your archived chats.</div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            className="rounded-lg border border-(--border) px-3 py-1.5 text-[13px] hover:bg-(--surface-hover)"
            onClick={() => setArchiveOpen(false)}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-(--fg) px-3 py-1.5 text-[13px] font-medium text-(--surface) hover:opacity-85"
            onClick={() => {
              setArchiveOpen(false);
              if (activeThreadId) archiveThread(activeThreadId);
            }}
          >
            Archive
          </button>
        </div>
      </Dialog>

      <WorktreeDialog
        open={worktreeOpen}
        thread={thread}
        activeThreadId={activeThreadId}
        onClose={() => setWorktreeOpen(false)}
      />
    </>
  );
}

// Fork the thread into a fresh git worktree (branch name prompt), like the
// reference client's "Continue in new worktree".
function WorktreeDialog({ open, thread, activeThreadId, onClose }) {
  const toast = useStore((s) => s.toast);
  const openThread = useStore((s) => s.openThread);
  const codexHome = useStore((s) => s.codexHome);
  const [branch, setBranch] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      const slug = (thread?.name || "worktree").toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30) || "worktree";
      setBranch(`codex/${slug}`);
    }
  }, [open]);

  const run = async () => {
    const cwd = thread?.cwd;
    const b = branch.trim();
    if (!cwd || !b) return;
    setBusy(true);
    try {
      const repo = (thread?.cwd || "").replace(/\/+$/, "").split("/").pop() || "repo";
      const wtDir = `${codexHome || ""}/worktrees/${repo}-${b.replace(/[^\w\u4e00-\u9fff-]+/g, "-")}`;
      const r = await api.rpc("command/exec", {
        command: ["git", "worktree", "add", wtDir, "-b", b],
        cwd,
        timeoutMs: 60000,
      });
      const code = r?.exitCode ?? 0;
      if (code !== 0) throw new Error((r?.stderr || r?.stdout || `git exited ${code}`).slice(0, 300));
      const fork = await api.rpc("thread/fork", { threadId: activeThreadId, cwd: wtDir });
      if (fork?.thread?.id) openThread(fork.thread.id);
      toast(`Worktree created at ${wtDir}`);
      onClose();
    } catch (e) {
      toast(`Worktree failed: ${e.message}`, "error");
    }
    setBusy(false);
  };

  return (
    <Dialog open={open} title="Continue in new worktree" onClose={onClose}>
      <div className="text-xs text-(--fg-tertiary)">
        Creates a git worktree and a fork of this chat inside it.
      </div>
      <input
        autoFocus
        className="mt-3 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 font-mono text-[13px] outline-none focus:border-(--accent)"
        placeholder="codex/my-branch"
        value={branch}
        onChange={(e) => setBranch(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && !busy) run(); }}
      />
      <div className="mt-4 flex justify-end gap-2">
        <button className="rounded-lg px-3 py-1.5 text-[13px] text-(--fg-secondary) hover:bg-(--surface-hover)" onClick={onClose}>Cancel</button>
        <button
          className="rounded-lg bg-(--fg) px-3 py-1.5 text-[13px] font-medium text-(--surface) hover:opacity-85 disabled:opacity-50"
          disabled={busy || !branch.trim()}
          onClick={run}
        >
          {busy ? "Creating…" : "Create worktree"}
        </button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Message list: centered column, stick-to-bottom autoscroll, floating
// scroll-to-bottom button, top fade gradient.
// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Find-in-thread bar (⌘F): query + match navigation with item highlighting.
// ---------------------------------------------------------------------------
function FindBar({ conv }) {
  const setUi = useStore((s) => s.setUi);
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);

  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const needle = q.trim().toLowerCase();
    const out = [];
    for (const turn of conv?.turns || []) {
      for (const item of turn.items || []) {
        const text = itemText(item);
        if (text && text.toLowerCase().includes(needle)) out.push(item.id);
      }
    }
    return out;
  }, [q, conv?.turns]);

  useEffect(() => { inputRef.current?.focus(); }, []);
  useEffect(() => { setIdx(0); }, [q]);
  useEffect(() => {
    // Highlight the current match.
    document.querySelectorAll("[data-item-id].ring-2").forEach((el) => el.classList.remove("ring-2", "ring-(--accent)", "rounded-[12.5px]"));
    if (matches.length && matches[Math.min(idx, matches.length - 1)]) {
      const el = document.querySelector(`[data-item-id="${matches[Math.min(idx, matches.length - 1)]}"]`);
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        el.classList.add("ring-2", "ring-(--accent)", "rounded-[12.5px]");
      }
    }
  }, [idx, matches]);

  const close = () => {
    document.querySelectorAll("[data-item-id].ring-2").forEach((el) => el.classList.remove("ring-2", "ring-(--accent)", "rounded-[12.5px]"));
    setUi({ findOpen: false });
  };
  const step = (d) => {
    if (!matches.length) return;
    setIdx((i) => (i + d + matches.length) % matches.length);
  };

  return (
    <div className="absolute top-2 right-4 z-30 flex items-center gap-1 rounded-xl border border-(--border) bg-(--surface-raised) px-2 py-1.5" style={{ boxShadow: "var(--shadow-menu)" }}>
      <input
        ref={inputRef}
        className="w-44 bg-transparent px-1 text-[13px] outline-none placeholder:text-(--fg-faint)"
        placeholder="Find in chat"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); step(e.shiftKey ? -1 : 1); }
          if (e.key === "Escape") close();
        }}
      />
      <span className="shrink-0 text-xs text-(--fg-tertiary)">
        {q ? `${matches.length ? Math.min(idx + 1, matches.length) : 0} / ${matches.length}` : ""}
      </span>
      <button className="flex h-5 w-5 items-center justify-center rounded text-(--fg-secondary) hover:bg-(--surface-hover)" onClick={() => step(-1)} title="Previous">↑</button>
      <button className="flex h-5 w-5 items-center justify-center rounded text-(--fg-secondary) hover:bg-(--surface-hover)" onClick={() => step(1)} title="Next">↓</button>
      <button className="flex h-5 w-5 items-center justify-center rounded text-(--fg-tertiary) hover:bg-(--surface-hover)" onClick={close} title="Close"><IconX size={11} /></button>
    </div>
  );
}

// Searchable text of a thread item.
function itemText(item) {
  switch (item.type) {
    case "userMessage": return (item.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");
    case "agentMessage":
    case "plan": return item.text;
    case "reasoning": return [...(item.summary || []), ...(item.content || [])].join("\n");
    case "commandExecution": return `${item.command}\n${item.aggregatedOutput || ""}`;
    case "fileChange": return (item.changes || []).map((c) => c.path).join("\n");
    case "mcpToolCall":
    case "dynamicToolCall": return `${item.server || ""} ${item.tool || ""}`;
    case "webSearch": return item.query;
    default: return "";
  }
}

function MessageList({ conv }) {
  const ref = useRef(null);
  const [stickBottom, setStickBottom] = useState(true);
  const turns = conv?.turns || [];
  const activeTurnId = conv?.activeTurnId;

  const itemCount = turns.reduce((n, t) => n + (t.items?.length || 0), 0);

  // The active TurnView renders its own "Working for Xs" header once the turn
  // has work items; until then the standalone WorkingRow fills in.
  const hasActiveWork = turns.some(
    (t) => t.id === activeTurnId && (t.items || []).some((it) => it.type !== "userMessage")
  );

  useEffect(() => {
    if (stickBottom && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [itemCount, turns, stickBottom]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    setStickBottom(el.scrollTop + el.clientHeight > el.scrollHeight - 80);
  };

  const scrollToBottom = () => {
    setStickBottom(true);
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  };

  return (
    <div className="relative min-h-0 flex-1">
      <div ref={ref} onScroll={onScroll} className="h-full overflow-x-hidden overflow-y-auto">
        <div className="mx-auto flex w-full max-w-(--thread-content-max-width) flex-col gap-(--conversation-item-gap) px-4 pt-4 pb-6">
          {conv?.thread?.forkedFromId && <ForkedFromCard forkedFromId={conv.thread.forkedFromId} />}
          {turns.map((turn) => (
            <TurnView key={turn.id} turn={turn} streaming={turn.id === activeTurnId} />
          ))}
          {activeTurnId && !hasActiveWork && <WorkingRow conv={conv} />}
        </div>
      </div>
      {useStore((s) => s.ui.findOpen) && <FindBar conv={conv} />}
      <MessageRail turns={turns} scrollRef={ref} />
      <div className="pointer-events-none absolute inset-x-0 top-0 h-4 bg-gradient-to-b from-(--surface) to-transparent" />
      {useStore((s) => s.ui.outputsOpen) && <OutputsPanel />}
      {!stickBottom && (
        <button
          title="Scroll to bottom"
          className="absolute bottom-4 left-1/2 z-20 flex h-8 w-8 -translate-x-1/2 items-center justify-center rounded-full border border-(--border) bg-(--surface-raised) text-(--fg-secondary) hover:bg-(--surface-hover) hover:text-(--fg)"
          style={{ boxShadow: "var(--shadow-menu)" }}
          onClick={scrollToBottom}
        >
          <IconArrowDown size={15} />
        </button>
      )}
    </div>
  );
}

function TurnView({ turn, streaming }) {
  const items = turn.items || [];
  const lastAgent = items.reduce((acc, it, i) => (it.type === "agentMessage" ? i : acc), -1);
  const showActions = !streaming && turn.status === "completed" && lastAgent >= 0;
  const [open, setOpen] = useState(false);

  // Reference layout: user message → "Worked for Xm XXs ›" row → only the
  // final agent message (+trailing cards). Everything in between (reasoning,
  // tool calls, earlier commentary messages) hides inside the Worked fold.
  let headEnd = 0;
  items.forEach((it, i) => { if (it.type === "userMessage") headEnd = i + 1; });
  const tailStart = lastAgent >= 0 ? lastAgent : items.length;
  const head = items.slice(0, headEnd);
  const fold = items.slice(headEnd, tailStart).filter((it) => it.type !== "reasoning");
  const tail = items.slice(tailStart);
  const hasFold = fold.length > 0;

  // A localhost web-preview card follows the final message (reference renders
  // one when the reply points at a local preview server).
  const tailText = tail.filter((it) => it.type === "agentMessage").map((it) => it.text || "").join("\n");
  const previewUrl = (tailText.match(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^\s)\]>"']*)?/) || [])[0];

  // Fold content: consecutive work items collapse into a WorklogGroup row.
  const foldSegments = [];
  {
    let buf = [];
    const flush = () => {
      if (buf.length >= 2) foldSegments.push({ kind: "work", items: buf });
      else foldSegments.push(...buf.map((item) => ({ kind: "item", item })));
      buf = [];
    };
    for (const item of fold) {
      if (WORK_ITEM_TYPES.has(item.type)) buf.push(item);
      else { flush(); foldSegments.push({ kind: "item", item }); }
    }
    flush();
  }

  const renderItem = (item, i, streamLast) => {
    const body = (
      <React.Fragment key={item.id ?? `i${i}`}>
        <ItemView item={item} streaming={streamLast} turnId={turn.id} />
        {showActions && item === tail[0] && item.type === "agentMessage" && <TurnActionRow turn={turn} />}
      </React.Fragment>
    );
    return item.type === "userMessage"
      ? <div key={item.id ?? `i${i}`} id={`um-${item.id}`} className="scroll-mt-24">{body}</div>
      : body;
  };

  return (
    <div className="group/turn flex flex-col gap-(--conversation-item-gap)">
      {head.map((it, i) => renderItem(it, i, false))}
      {hasFold && (
        streaming ? (
          <WorkedTimer turn={turn} />
        ) : (
          <button
            className="flex items-center gap-1 text-[14px] text-(--fg-secondary) hover:text-(--fg)"
            onClick={() => setOpen(!open)}
          >
            Worked{turn.durationMs ? ` for ${formatDuration(turn.durationMs)}` : ""}
            <IconChevronDown size={13} className={cx("text-(--fg-tertiary) transition-transform", !open && "-rotate-90")} />
          </button>
        )
      )}
      {(streaming || open) &&
        foldSegments.map((seg, si) =>
          seg.kind === "work" ? (
            <WorklogGroup key={`w${si}`} items={seg.items} live={streaming && si === foldSegments.length - 1} />
          ) : (
            <ItemView key={seg.item.id ?? `f${si}`} item={seg.item} streaming={false} turnId={turn.id} />
          )
        )}
      {tail.map((it, i) => renderItem(it, headEnd + tailStart + i, streaming && headEnd + tailStart + i === items.length - 1))}
      {!streaming && previewUrl && <WebPreviewCard url={previewUrl} />}
      {turn.status === "failed" && turn.error && (
        <div className="rounded-[12.5px] border border-(--danger) bg-(--danger-soft) px-3 py-2 text-[13px] text-(--danger)">
          {turn.error.message || String(turn.error)}
        </div>
      )}
      {turn.status === "interrupted" && (
        <div className="flex items-center gap-3 py-1">
          <div className="h-px flex-1 bg-(--border-light)" />
          <span className="text-xs text-(--fg-faint)">
            You stopped{turn.durationMs ? ` after ${formatDuration(turn.durationMs)}` : ""}
          </span>
          <div className="h-px flex-1 bg-(--border-light)" />
        </div>
      )}
    </div>
  );
}

// Live "Working for Xs" shimmer header for the active turn (reference keeps
// one such header while a turn runs).
function WorkedTimer({ turn }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const startedMs = turn?.startedAt ? turn.startedAt * 1000 : Date.now();
    const tick = () => setElapsed(Math.max(0, Date.now() - startedMs));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [turn?.startedAt]);
  return (
    <div className="shimmer-text text-[14px]">Working{elapsed > 1500 ? ` for ${formatDuration(elapsed)}` : ""}</div>
  );
}

// "Web preview / Website / Open in ⌄" card rendered after a reply that links
// to a local preview server (reference card).
function WebPreviewCard({ url }) {
  const [menu, setMenu] = useState(false);
  const openInApp = () => {
    setMenu(false);
    usePanelStore.getState().open("browser");
    setTimeout(() => window.dispatchEvent(new CustomEvent("codex:open-url", { detail: { url } })), 80);
  };
  return (
    <div className="relative flex items-center gap-3 rounded-[14px] border border-(--border-light) bg-(--surface-under) px-3.5 py-2.5">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-(--surface)">
        <IconGlobe size={17} className="text-(--fg-secondary)" />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[14px]">Web preview</div>
        <div className="text-xs text-(--fg-tertiary)">Website</div>
      </div>
      <button
        className="flex h-7 shrink-0 items-center gap-1 rounded-full border border-(--border) px-3 text-[13px] hover:bg-(--surface-hover)"
        onClick={() => setMenu(!menu)}
      >
        Open in <IconChevronDown size={12} className="text-(--fg-tertiary)" />
      </button>
      {menu && (
        <div
          className="absolute right-3 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-(--border) bg-(--dropdown-bg) py-1"
          style={{ boxShadow: "var(--shadow-menu)" }}
        >
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-(--surface-hover)"
            onClick={openInApp}
          >
            Browser
          </button>
          <button
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-(--surface-hover)"
            onClick={() => { api.openExternal(url); setMenu(false); }}
          >
            Default browser
          </button>
        </div>
      )}
    </div>
  );
}

const WORK_ITEM_TYPES = new Set([
  "commandExecution", "mcpToolCall", "dynamicToolCall",
  "webSearch", "sleep", "hookPrompt",
  "fileChange", "collabAgentToolCall", "subAgentActivity",
]);

// Left-edge navigation rail: one tick per user message; click to jump,
// hover to preview. Matches the reference client's thread rail.
function MessageRail({ turns, scrollRef }) {
  const userMsgs = [];
  for (const turn of turns || []) {
    for (const item of turn.items || []) {
      if (item.type === "userMessage") {
        const text = (item.content || []).filter((c) => c.type === "text").map((c) => c.text).join(" ");
        userMsgs.push({ id: item.id, preview: text.slice(0, 90) });
      }
    }
  }
  if (userMsgs.length < 2) return null;
  return (
    <nav className="absolute top-1/2 left-3 z-20 flex max-h-[70vh] -translate-y-1/2 flex-col items-start gap-1.5 overflow-y-auto py-2">
      {userMsgs.map((m, i) => (
        <button
          key={m.id ?? i}
          className="group flex items-center gap-2"
          onClick={() => {
            const el = document.getElementById(`um-${m.id}`);
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
          }}
        >
          <span className="block h-[3px] w-3.5 rounded-full bg-(--border-heavy) transition-all group-hover:w-5 group-hover:bg-(--accent)" />
          <span className="pointer-events-none hidden max-w-[220px] truncate rounded-md border border-(--border) bg-(--surface-raised) px-2 py-1 text-xs text-(--fg-secondary) group-hover:block" style={{ boxShadow: "var(--shadow-menu)" }}>
            {m.preview || "Message"}
          </span>
        </button>
      ))}
    </nav>
  );
}

// "Read files, ran commands" — collapsible group of consecutive work items;
// expands to one row per action (reference worklog rows). Live groups show
// their rows directly under the turn's "Working for Xs" header.
function WorklogGroup({ items, live }) {
  const [open, setOpen] = useState(false);
  if (live) {
    return (
      <div className="flex flex-col gap-1">
        {items.map((item, i) => (
          <WorklogActionRow key={item.id ?? i} item={item} live={i === items.length - 1} />
        ))}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-1">
      <button
        className="flex items-center gap-1.5 text-[13px] text-(--fg-tertiary) hover:text-(--fg)"
        onClick={() => setOpen(!open)}
      >
        <LucideIcon name="BookOpen" size={13} />
        {worklogLabel(items)}
        {open && <IconChevronDown size={12} />}
      </button>
      {open && (
        <div className="flex flex-col gap-1">
          {items.map((item, i) => (
            <WorklogActionRow key={item.id ?? i} item={item} live={false} />
          ))}
        </div>
      )}
    </div>
  );
}

// Aggregated group label, e.g. "Read files, ran commands".
function worklogLabel(items) {
  let reads = 0, cmds = 0, edits = 0, webs = 0, tools = 0;
  for (const it of items) {
    if (isReadAction(it)) reads++;
    else if (it.type === "commandExecution") cmds++;
    else if (it.type === "fileChange") edits++;
    else if (it.type === "webSearch") webs++;
    else tools++;
  }
  const parts = [];
  if (reads) parts.push("Read files");
  if (cmds) parts.push("ran commands");
  if (edits) parts.push(`edited ${edits} file${edits > 1 ? "s" : ""}`);
  if (webs) parts.push("searched the web");
  if (tools) parts.push(`called ${tools} tool${tools > 1 ? "s" : ""}`);
  const s = parts.join(", ") || "Worked";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Tool calls that present as "Read <file>" rows.
function isReadAction(it) {
  if (it.type !== "mcpToolCall" && it.type !== "dynamicToolCall") return false;
  return /read/i.test(it.tool || it.name || "");
}

function readActionPath(it) {
  const args = it.arguments || it.input || {};
  const p = args.path || args.file_path || args.filePath || args.target || "";
  return p ? basename(String(p)) : null;
}

// One worklog action row: "Read SKILL.md" / "Ran <cmd> ›" / fallback item.
function WorklogActionRow({ item, live }) {
  const [open, setOpen] = useState(false);
  if (isReadAction(item)) {
    const name = readActionPath(item) || item.title || "file";
    return (
      <div className="flex items-center gap-1.5 text-[13px] text-(--fg-tertiary)">
        <LucideIcon name="BookOpen" size={13} className="shrink-0" />
        <span className="min-w-0 truncate">Read <span className="underline">{name}</span></span>
        {live && <Spinner size={11} className="shrink-0" />}
      </div>
    );
  }
  if (item.type === "commandExecution") {
    const running = item.status === "inProgress";
    return (
      <div className="flex flex-col gap-1">
        <button
          className="flex min-w-0 items-center gap-1.5 text-left text-[13px] text-(--fg-tertiary) hover:text-(--fg)"
          onClick={() => setOpen(!open)}
        >
          <IconTerminal size={13} className="shrink-0" />
          <span className="min-w-0 truncate">Ran <span className="font-mono text-(--fg-secondary)">{item.command}</span></span>
          {running && <Spinner size={11} className="shrink-0" />}
          <IconChevronRight size={12} className={cx("ml-auto shrink-0 transition-transform", open && "rotate-90")} />
        </button>
        {open && (
          <pre className="max-h-60 overflow-auto rounded-lg border border-(--border-light) bg-(--surface-under) px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap break-all text-(--fg-secondary)">
            {(item.aggregatedOutput || "").slice(-4000) || (running ? "Running…" : "No output")}
          </pre>
        )}
      </div>
    );
  }
  return <ItemView item={item} streaming={live} turnId={undefined} />;
}

// "Continued from chat" card shown at the top of forked threads.
function ForkedFromCard({ forkedFromId }) {
  const [source, setSource] = useState(null);
  const openThread = useStore((s) => s.openThread);
  useEffect(() => {
    let live = true;
    api.rpc("thread/read", { threadId: forkedFromId, includeTurns: false })
      .then((r) => live && setSource(r?.thread || null))
      .catch(() => {});
    return () => { live = false; };
  }, [forkedFromId]);
  return (
    <button
      className="flex items-center gap-2 rounded-[12.5px] border border-(--border-light) bg-(--surface-under) px-3 py-2 text-left hover:bg-(--surface-hover)"
      onClick={() => openThread(forkedFromId)}
      title={source?.name || forkedFromId}
    >
      <IconBranch size={13} className="shrink-0 text-(--fg-tertiary)" />
      <span className="text-[13px] text-(--fg-tertiary)">Continued from chat</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-(--accent)">
        {source?.name || (source?.preview || "").split("\n")[0] || "source chat"}
      </span>
    </button>
  );
}

// Turn-level "Working for Xs" header for the whole running turn (the
// reference client keeps one such header for the active turn).
function WorkingRow({ conv }) {
  const turn = (conv.turns || []).find((t) => t.id === conv.activeTurnId);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const startedMs = turn?.startedAt ? turn.startedAt * 1000 : Date.now();
    const tick = () => setElapsed(Math.max(0, Date.now() - startedMs));
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [turn?.startedAt]);
  if (conv.plan) return null;
  return <div className="shimmer-text text-[14px]">Working{elapsed > 1500 ? ` for ${formatDuration(elapsed)}` : ""}</div>;
}

// ---------------------------------------------------------------------------
// Bottom area: gradient fade, plan widget, approvals, composer, footer line.
// ---------------------------------------------------------------------------
function BottomArea({ conv }) {
  const approvalsAll = useStore((s) => s.approvals);
  const activeThreadId = useStore((s) => s.activeThreadId);
  const pendingNewThread = useStore((s) => s.pendingNewThread);
  const goalDialogOpen = useStore((s) => s.ui.goalDialogOpen);
  const approvals = approvalsAll.filter((a) => !a.threadId || a.threadId === activeThreadId);
  return (
    <div className="shrink-0">
      <div className="pointer-events-none h-8 bg-gradient-to-t from-(--surface) via-(--surface)/60 to-transparent" />
      <div className="mx-auto flex w-full max-w-(--thread-content-max-width) flex-col gap-2 px-4">
        {conv?.goal?.objective && <GoalChip goal={conv.goal} />}
        {conv?.plan && <PlanWidget plan={conv.plan} />}
        {approvals.map((a) => (
          <ApprovalCard key={a.reqId} approval={a} />
        ))}
        {pendingNewThread && (
          <div className="flex items-center gap-2 text-[13px] text-(--fg-tertiary)">
            <Spinner size={13} /> Starting chat…
          </div>
        )}
      </div>
      <div className="mx-auto w-full max-w-(--thread-content-max-width)">
        <Composer />
      </div>
      <div className="pb-2 pt-1 text-center text-[11px] text-(--fg-faint)">
        Codex can make mistakes. Check important info.
      </div>
      <GoalDialog open={goalDialogOpen} goal={conv?.goal} />
    </div>
  );
}

// Active goal chip above the composer: objective + status, clear on ✕.
function GoalChip({ goal }) {
  const activeThreadId = useStore((s) => s.activeThreadId);
  const setUi = useStore((s) => s.setUi);
  const clear = async () => {
    try { await api.rpc("thread/goal/clear", { threadId: activeThreadId }); } catch {}
    useStore.getState()._mutateConv(activeThreadId, (c) => ({ ...c, goal: null }));
  };
  return (
    <div className="flex items-center gap-2 rounded-[12.5px] border border-(--accent)/40 bg-(--accent-soft) px-3 py-2">
      <span className="shrink-0 text-(--accent)">◎</span>
      <button
        className="min-w-0 flex-1 truncate text-left text-[13px] text-(--fg)"
        title={goal.objective}
        onClick={() => setUi({ goalDialogOpen: true })}
      >
        {goal.objective}
      </button>
      {goal.status && <span className="shrink-0 rounded-md bg-(--surface-active) px-1.5 py-0.5 text-[11px] capitalize text-(--fg-secondary)">{goal.status}</span>}
      <button className="shrink-0 text-(--fg-tertiary) hover:text-(--danger)" title="Clear goal" onClick={clear}>
        <IconX size={12} />
      </button>
    </div>
  );
}

// Goal dialog: set objective + optional token budget (thread/goal/set).
function GoalDialog({ open, goal }) {
  const activeThreadId = useStore((s) => s.activeThreadId);
  const setUi = useStore((s) => s.setUi);
  const toast = useStore((s) => s.toast);
  const [objective, setObjective] = useState("");
  const [budget, setBudget] = useState("");
  useEffect(() => {
    if (open) {
      setObjective(goal?.objective || "");
      setBudget(goal?.tokenBudget ? String(goal.tokenBudget) : "");
    }
  }, [open]);
  const close = () => setUi({ goalDialogOpen: false });
  const submit = async () => {
    const obj = objective.trim();
    if (!obj || !activeThreadId) return;
    try {
      const params = { threadId: activeThreadId, objective: obj };
      if (budget.trim() && !isNaN(Number(budget))) params.tokenBudget = Number(budget);
      await api.rpc("thread/goal/set", params);
      useStore.getState()._mutateConv(activeThreadId, (c) => ({ ...c, goal: { objective: obj, status: "active", tokenBudget: params.tokenBudget } }));
      close();
    } catch (e) {
      toast(`Goal failed: ${e.message}`, "error");
    }
  };
  return (
    <Dialog open={open} title="Set a goal" onClose={close}>
      <div className="mb-2 text-xs text-(--fg-tertiary)">Codex keeps pursuing the goal across turns until it's done or you clear it.</div>
      <textarea
        autoFocus
        rows={3}
        className="w-full resize-none rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-[13px] outline-none focus:border-(--accent)"
        placeholder="Describe your goal, define measurable outcomes for best results"
        value={objective}
        onChange={(e) => setObjective(e.target.value)}
      />
      <input
        className="mt-2 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-[13px] outline-none focus:border-(--accent)"
        placeholder="Token budget (optional)"
        value={budget}
        onChange={(e) => setBudget(e.target.value)}
      />
      <div className="mt-4 flex justify-end gap-2">
        <button className="rounded-lg px-3 py-1.5 text-[13px] text-(--fg-secondary) hover:bg-(--surface-hover)" onClick={close}>Cancel</button>
        <button
          className="rounded-lg bg-(--fg) px-3 py-1.5 text-[13px] font-medium text-(--surface) hover:opacity-85 disabled:opacity-50"
          disabled={!objective.trim()}
          onClick={submit}
        >
          Set goal
        </button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Home screen: dimmed Codex mark + prompt + suggestion cards centered in the
// middle area; the composer is anchored at the bottom (reference layout).
// ---------------------------------------------------------------------------
function Home() {
  const cwd = useStore((s) => s.cwd);
  const project = basename(cwd);
  const [hasGit, setHasGit] = useState(false);
  useEffect(() => {
    let live = true;
    setHasGit(false);
    if (!cwd) return undefined;
    api.rpc("command/exec", { command: ["git", "rev-parse", "--is-inside-work-tree"], cwd, timeoutMs: 8000 })
      .then((r) => { if (live) setHasGit(String(r?.stdout ?? "").trim() === "true"); })
      .catch(() => {});
    return () => { live = false; };
  }, [cwd]);
  // reference rules: build-in for git projects (name ≤ 15), work-on otherwise
  // (name too long drops the project name entirely)
  const title = !project
    ? "What should we build?"
    : project.length > 15
      ? "What should we work on?"
      : hasGit
        ? <>What should we build in <span className="underline decoration-dotted decoration-2 underline-offset-8">{project}</span>?</>
        : <>What should we work on in <span className="underline decoration-dotted decoration-2 underline-offset-8">{project}</span>?</>;
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center">
      <div className="flex min-h-0 w-full flex-1 flex-col overflow-y-auto">
        <div className="my-auto flex w-full flex-col items-center px-4 py-6">
          <CodexMark size={56} className="text-(--fg) opacity-[0.24]" />
          <div className="mt-5 mb-7 max-w-[720px] text-center text-[28px] leading-9 font-medium">
            {title}
          </div>
          <HomeSuggestions />
        </div>
      </div>
      <div className="w-full max-w-[736px] shrink-0 px-4 pb-4">
        <Composer centered />
      </div>
    </div>
  );
}

function HomeSuggestions() {
  const show = useStore((s) => s.ui.suggestedPrompts !== false);
  return show ? <SuggestionCards /> : null;
}

// Starter suggestions, like the reference home screen. Clicking one seeds
// the composer with a matching prompt.
function SuggestionCards() {
  const sendMessage = useStore((s) => s.sendMessage);
  const cards = [
    { icon: <IconTelescope />, color: "#339cff", text: "Explore and understand code", prompt: "Explore this repository and explain how it works: architecture, key modules, and entry points." },
    { icon: <IconHammer />, color: "#ad7bf9", text: "Build a new feature, app, or tool", prompt: "Help me build something new in this project. Ask what I want to make, then plan and implement it." },
    { icon: <IconReviewCheck />, color: "#40c977", text: "Review code and suggest changes", prompt: "Review the recent changes and the most important files in this project. Suggest concrete improvements." },
    { icon: <IconBug />, color: "#ff8549", text: "Fix issues and failures", prompt: "Find likely bugs in this project (failing tests, obvious defects, error-prone code) and propose minimal fixes." },
  ];
  return (
    <div className="grid w-full max-w-[708px] gap-3" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
      {cards.map((c) => (
        <button
          key={c.text}
          className="flex min-h-[104px] flex-col items-start gap-2 rounded-2xl border border-(--border-light) bg-(--surface-under) px-4 py-3 text-left transition-colors hover:border-(--border) hover:bg-(--surface-hover)"
          onClick={() => sendMessage(c.prompt)}
        >
          <span style={{ color: c.color }}>{c.icon}</span>
          <span className="text-[13px] leading-5 text-(--fg)">{c.text}</span>
        </button>
      ))}
    </div>
  );
}

const IconTelescope = () => <LucideIcon name="Telescope" size={18} />;
const IconHammer = () => <LucideIcon name="Hammer" size={18} />;
const IconReviewCheck = () => <LucideIcon name="ListChecks" size={18} />;
const IconBug = () => <LucideIcon name="Bug" size={18} />;
