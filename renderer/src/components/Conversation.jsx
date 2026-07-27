// Center column: thread header, scrollable message list, plan widget,
// approvals, composer. Also the new-chat home screen.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../store.js";
import { cx } from "../lib/cx.js";
import * as api from "../api.js";
import { basename, formatDuration } from "../lib/time.js";
import { commandActivity } from "../lib/commandActivity.mjs";
import vscodeIcon from "../assets/vscode.png";
import Composer from "./Composer.jsx";
import OutputsPanel from "./OutputsPanel.jsx";
import { ItemView, PlanWidget, ApprovalCard, TurnActionRow } from "./items.jsx";
import { ActivityDisclosure, Menu, Dialog, IconButton, Spinner } from "./ui.jsx";
import { IconBranch, IconFolder, IconMore, IconChevronRight, IconChevronDown, IconX, IconFile, IconTerminal, IconGlobe, IconSparkle, IconFolderFilled, IconDots21, IconHeaderOutputs, IconHeaderPanelBottom, IconHeaderPanelSide, IconHeaderChevronDown, IconCmdGoal, IconBookOpen, IconCodeSearching, IconEditFiles, IconGoalEdit, IconGoalPause, IconGoalResume, IconGoalTrash, IconGoalChevron, IconListFiles, IconMcpSource, IconRunCommand, IconWebSearch, LucideIcon } from "./icons.jsx";
import { panelHook } from "../lib/panelHook.js";
import { usePanelStore } from "./RightPanel.jsx";

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
  const gs = useStore((s) => s.gs);
  const hasTurns = (conv?.turns || []).length > 0;

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
      ) : !hasTurns ? (
        // Empty thread: home-like centered prompt with the composer below.
        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
          <div className="my-auto flex flex-col items-center px-4 py-6">
            <CodexMark size={56} className="text-(--fg) opacity-[0.24]" />
            <div className="mt-5 text-center text-[28px] leading-9 font-medium">
              What should we build in {matchProjectName(gs, threadCwdOf(conv)) || basename(threadCwdOf(conv)) || "this folder"}?
            </div>
          </div>
        </div>
      ) : (
        <MessageList key={activeThreadId} conv={conv} />
      )}
      {!hasTurns && <BottomArea conv={conv} />}
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
        <div className="flex min-w-0 items-center gap-0.5">
          <button
            className="app-no-drag flex h-7 w-7 shrink-0 items-center justify-center"
            aria-label={`Project: ${basename(thread?.cwd || conv?.thread?.cwd || "")}`}
          >
            <IconFolderFilled size={16} className="text-(--fg-secondary)" />
          </button>
          <div className="max-w-[320px] truncate text-[14px] font-medium">{thread?.name || "New chat"}</div>
        </div>
        <ThreadMenu thread={thread} />
      </div>
    </div>
  );
}

// Conversation-side header buttons (middle column, right edge): the editor
// shortcut and the Context toggle live here in the reference app — NOT in
// the side panel's tab strip.
export function HeaderContextButtons() {
  const activeThreadId = useStore((s) => s.activeThreadId);
  const ui = useStore((s) => s.ui);
  const setUi = useStore((s) => s.setUi);
  // New chat has no conversation context: only the panel toggles show then
  // (reference new-chat page).
  if (!activeThreadId) return null;
  return (
    <div className="flex shrink-0 translate-x-0.5 items-center gap-1.5">
      <OpenInEditorButton />
      <IconButton
        icon={<IconHeaderOutputs />}
        size={16}
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
    <div className="flex shrink-0 translate-x-1 items-center gap-1.5">
      <IconButton
        icon={<IconHeaderPanelBottom />}
        size={16}
        title="Toggle bottom panel"
        active={!!ui.bottomOpen}
        onClick={() => setUi({ bottomOpen: !ui.bottomOpen })}
      />
      <IconButton
        icon={<IconHeaderPanelSide />}
        size={16}
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
    <div className="flex h-7 w-[52px] items-stretch overflow-hidden rounded-[12.5px]">
      <button
        className="flex h-7 w-[29px] items-center rounded-l-[12.5px] border border-r-0 border-(--border) bg-black/[0.03] pl-2 pr-1 text-(--fg-secondary) hover:bg-(--surface-hover) hover:text-(--fg) dark:bg-white/[0.03]"
        title="Open in"
        onClick={openVSCode}
      >
        <img src={vscodeIcon} alt="VS Code" className="size-4" />
      </button>
      <button
        ref={chevRef}
        className="flex h-7 w-[23px] items-center rounded-r-[12.5px] border border-l-0 border-(--border) bg-black/[0.03] pl-0.5 pr-1.5 text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg) dark:bg-white/[0.03]"
        title="Open options"
        onClick={() => setMenuOpen(true)}
      >
        <IconHeaderChevronDown size={12} className="opacity-50" />
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
        aria-label="Chat actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        data-state={menuOpen ? "open" : "closed"}
        className="app-no-drag flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
        onClick={() => setMenuOpen((open) => !open)}
      >
        <IconDots21 size={18} />
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
            hint: "⌥⌘R",
            onSelect: () => {
              setName(thread?.name || "");
              setRenameOpen(true);
            },
          },
          { id: "archive", label: "Archive chat", hint: "⇧⌘A", onSelect: () => setArchiveOpen(true) },
          { sep: true },
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
          {
            id: "schedule",
            label: "Add scheduled task…",
            onSelect: () => useStore.getState().setUi({ navView: "scheduled" }),
          },
          { sep: true },
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
  const contentRef = useRef(null);
  const [stickBottom, setStickBottom] = useState(true);
  const [externalActivity, setExternalActivity] = useState(null);
  const turns = conv?.turns || [];
  const activeTurnId = conv?.activeTurnId;
  const activeItems = turns.find((turn) => turn.id === activeTurnId)?.items || [];
  const nativeLiveActivity = [...activeItems].reverse().find((item) => item.status === "inProgress");
  const showExternalActivity = externalActivity
    && !(nativeLiveActivity?.type === "commandExecution"
      && nativeLiveActivity.command === externalActivity.command);

  const itemCount = turns.reduce((n, t) => n + (t.items?.length || 0), 0) + (showExternalActivity ? 1 : 0);

  // The active TurnView renders its own "Working for Xs" header once the turn
  // has work items; until then the standalone WorkingRow fills in.
  const hasActiveWork = turns.some(
    (t) => t.id === activeTurnId && (t.items || []).some((it) => it.type !== "userMessage")
  );

  useEffect(() => {
    const file = conv?.thread?.path;
    if (!file) {
      setExternalActivity(null);
      return;
    }
    let live = true;
    const refresh = () => api.rolloutActivity(file)
      .then((item) => live && setExternalActivity(item))
      .catch(() => live && setExternalActivity(null));
    refresh();
    const timer = setInterval(refresh, 400);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [conv?.thread?.path]);

  useEffect(() => {
    if (stickBottom && ref.current) {
      ref.current.scrollTop = ref.current.scrollHeight;
    }
  }, [itemCount, turns, stickBottom]);

  useEffect(() => {
    if (!contentRef.current) return;
    const observer = new ResizeObserver(() => {
      if (stickBottom && ref.current) ref.current.scrollTop = ref.current.scrollHeight;
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [stickBottom]);

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
        <div ref={contentRef} className="flex min-h-full shrink-0 flex-col justify-start">
          <div className="mx-auto flex w-full max-w-(--thread-content-max-width) flex-col gap-(--conversation-item-gap) px-4 pt-4 pb-6">
            {conv?.thread?.forkedFromId && <ForkedFromCard forkedFromId={conv.thread.forkedFromId} />}
            {turns.map((turn) => (
              <TurnView key={turn.id} turn={turn} streaming={turn.id === activeTurnId} />
            ))}
            {activeTurnId && !hasActiveWork && <WorkingRow conv={conv} />}
            {showExternalActivity && <WorklogActionRow item={externalActivity} live />}
          </div>
          <BottomArea conv={conv} />
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

  // A localhost web-preview card follows the final message (reference renders
  // one when the reply points at a local preview server).
  const agentText = items.filter((it) => it.type === "agentMessage").map((it) => it.text || "").join("\n");
  const previewUrl = (agentText.match(/https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^\s)\]>"']*)?/) || [])[0];

  // Commentary remains visible. Only consecutive work items collapse into
  // the reference activity summary row.
  const segments = [];
  {
    let buf = [];
    let firstIndex = 0;
    const flush = () => {
      if (buf.length) segments.push({ kind: "work", items: buf, index: firstIndex });
      buf = [];
    };
    items.forEach((item, index) => {
      const emptyReasoning = item.type === "reasoning"
        && !(item.summary?.length || item.content?.length);
      if (emptyReasoning && !(streaming && index === items.length - 1)) return;
      if (WORK_ITEM_TYPES.has(item.type)) {
        if (buf.length === 0) firstIndex = index;
        buf.push(item);
      } else {
        flush();
        segments.push({ kind: "item", item, index });
      }
    });
    flush();
  }

  const renderItem = (item, index, streamLast) => {
    const body = (
      <React.Fragment key={item.id ?? `i${index}`}>
        <ItemView item={item} streaming={streamLast} turnId={turn.id} />
        {showActions && index === lastAgent && <TurnActionRow turn={turn} />}
      </React.Fragment>
    );
    return item.type === "userMessage"
      ? <div key={item.id ?? `i${index}`} id={`um-${item.id}`} className="scroll-mt-24">{body}</div>
      : body;
  };

  return (
    <div className="group/turn flex flex-col gap-(--conversation-item-gap)">
      {segments.map((seg, segmentIndex) =>
        seg.kind === "work" ? (
          <WorklogGroup
            key={`w${seg.index}`}
            items={seg.items}
            live={streaming && segmentIndex === segments.length - 1}
          />
        ) : (
          renderItem(seg.item, seg.index, streaming && segmentIndex === segments.length - 1)
        )
      )}
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
    const reply = [...(turn.items || [])]
      .reverse()
      .find((item) => item.type === "agentMessage" && item.text?.trim());
    for (const item of turn.items || []) {
      if (item.type === "userMessage") {
        const title = itemText(item).replace(/\s+/g, " ").trim();
        userMsgs.push({
          id: item.id,
          title,
          preview: (reply?.text || "").replace(/`/g, "").replace(/\s+/g, " ").trim(),
        });
      }
    }
  }
  const [hovered, setHovered] = useState(null);
  const [selected, setSelected] = useState(null);
  if (userMsgs.length < 2) return null;
  const current = selected;
  const scales = [1, 0.76924, 0.53848, 0.38464, 0.2308];
  return (
    <nav className="absolute top-1/2 left-4 z-20 -translate-y-1/2">
      <div className="flex max-h-[70vh] w-9 flex-col overflow-y-auto">
        {userMsgs.map((m, i) => (
          <button
            key={m.id ?? i}
            aria-current={i === current ? "true" : undefined}
            aria-label={`Jump to user message ${i + 1}`}
            className="group/navigation-row flex h-2.5 w-9 shrink-0 items-center"
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => {
              setSelected(i);
              const el = document.getElementById(`um-${m.id}`);
              el?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          >
            <span className="flex h-0.5 w-[30px] items-center">
              <span
                className={cx(
                  "h-0.5 w-[26px] origin-left transition-[transform,background-color,opacity]",
                  i === hovered
                    ? "bg-(--fg) opacity-100"
                    : i === current
                      ? "bg-(--fg) opacity-60"
                      : "bg-(--fg-tertiary) opacity-40",
                )}
                style={{
                  transform: `scaleX(${hovered == null
                    ? scales.at(-1)
                    : scales[Math.min(Math.abs(i - hovered), scales.length - 1)]})`,
                }}
              />
            </span>
          </button>
        ))}
      </div>
      {hovered != null && (
        <div
          className="pointer-events-none absolute left-9 w-80 -translate-y-1/2 select-none rounded-[15px] p-2 text-left backdrop-blur-[2px]"
          style={{
            top: hovered * 10 + 5,
            background: "color-mix(in srgb, var(--surface-raised) 95%, transparent)",
            boxShadow: "0 0 0 0.5px rgb(26 28 31 / 0.08), 0 8px 16px -4px rgb(0 0 0 / 0.12)",
          }}
        >
          <div className="h-5 truncate text-[13px] leading-5 font-medium">
            {userMsgs[hovered].title || "Message"}
          </div>
          <div
            className="mt-1 h-[60px] overflow-hidden text-[13px] leading-[21px] text-(--fg-tertiary)"
            style={{ display: "-webkit-box", WebkitBoxOrient: "vertical", WebkitLineClamp: 3 }}
          >
            {userMsgs[hovered].preview}
          </div>
        </div>
      )}
    </nav>
  );
}

// "Read files, ran commands" — collapsible group of consecutive work items;
// expands to one row per action (reference worklog rows). Live groups show
// their rows directly under the turn's "Working for Xs" header.
function WorklogGroup({ items, live }) {
  const [open, setOpen] = useState(false);
  const activityKind = worklogActivityKind(items);
  if (items.length === 1 && items[0].type !== "fileChange") {
    return <WorklogActionRow item={items[0]} live={live} />;
  }
  return (
    <div className={cx("flex flex-col", open && "gap-1")}>
      <button
        type="button"
        aria-expanded={open}
        data-activity-icon={activityKind}
        className={cx(
          "group/activity-header inline-flex min-w-0 max-w-full cursor-pointer self-start items-center gap-1 text-left text-[14px] leading-[21px] font-[445]",
          live ? "text-(--fg)" : "text-(--conversation-body)",
        )}
        onClick={() => setOpen(!open)}
      >
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
          <WorklogActivityIcon kind={activityKind} item={items[0]} live={live} />
          <span className="min-w-0 truncate">{worklogLabel(items)}</span>
          {live && <Spinner size={11} className="shrink-0" />}
        </span>
        <IconGoalChevron
          size={14}
          className={cx(
            "activity-chevron shrink-0 opacity-0 transition-transform duration-[300ms] group-hover/activity-header:opacity-100 group-focus-visible/activity-header:opacity-100",
            open && "rotate-90 opacity-100",
          )}
        />
      </button>
      <ActivityDisclosure open={open}>
        <div className="flex flex-col gap-1">
          {items.map((item, i) => (
            <WorklogActionRow key={item.id ?? i} item={item} live={false} />
          ))}
        </div>
      </ActivityDisclosure>
    </div>
  );
}

function worklogActivityKind(items) {
  if (items.some((item) => item.type === "mcpToolCall" || item.type === "dynamicToolCall")
    && !items.some(isCommandAction)
    && !items.some(isReadAction)) return "mcp-source";
  if (items.some((item) => item.type === "fileChange")) return "edit-files";
  const firstCommand = items.find((item) => item.type === "commandExecution");
  if (firstCommand) return commandActivity(firstCommand).kind;
  if (items.some(isReadAction)) return "read-files";
  if (items.some(isCommandAction) || items.some(isReadAction)) return "run-command";
  if (items.some((item) => item.type === "webSearch")) return "web-search";
  return "run-command";
}

function WorklogActivityIcon({ kind, item, live }) {
  const tone = live ? "text-(--fg)" : "text-(--conversation-body)";
  if (kind === "web-search") return <IconWebSearch size={16} className={cx("activity-web-search shrink-0", tone)} />;
  if (kind === "read-files") return <IconBookOpen size={16} className={cx("activity-read-files shrink-0", tone)} />;
  if (kind === "code-searching") return <IconCodeSearching size={16} className={cx("activity-code-searching shrink-0", tone)} />;
  if (kind === "list-files") return <IconListFiles size={16} className={cx("activity-list-files shrink-0", tone)} />;
  if (kind === "edit-files") return <IconEditFiles size={16} className={cx("activity-edit-files shrink-0", tone)} />;
  if (kind === "mcp-source") {
    const logo = item?.source?.logoUrl || item?.source?.logoUrlDark || item?.logoUrl || item?.toolIcons?.[0];
    return logo
      ? <img src={logo} alt="" className="size-4 shrink-0 rounded-[2px] object-contain" />
      : <IconMcpSource size={16} className={cx("activity-mcp-source shrink-0", tone)} />;
  }
  return <IconRunCommand size={16} className={cx("activity-run-command shrink-0", tone)} />;
}

// Aggregated group label, e.g. "Read files, ran commands".
function worklogLabel(items) {
  if (items.length === 1 && (items[0].type === "mcpToolCall" || items[0].type === "dynamicToolCall")) {
    return toolActivityLabel(items[0]);
  }
  let reads = 0, cmds = 0, edits = 0, webs = 0, tools = 0;
  for (const it of items) {
    if (isReadAction(it)) reads++;
    else if (it.type === "commandExecution" && commandActivity(it).category === "exploration") reads++;
    else if (isCommandAction(it)) cmds++;
    else if (it.type === "fileChange") edits++;
    else if (it.type === "webSearch") webs++;
    else tools++;
  }
  const parts = [];
  if (edits) parts.push(edits === 1 ? "Edited a file" : "Edited files");
  if (reads) parts.push("Read files");
  if (cmds) parts.push(cmds === 1 ? "Ran a command" : "Ran commands");
  if (webs) parts.push("searched the web");
  if (tools) parts.push(`called ${tools} tool${tools > 1 ? "s" : ""}`);
  return parts.map((part, index) => index === 0 ? part : part.charAt(0).toLowerCase() + part.slice(1)).join(", ") || "Worked";
}

function toolActivityLabel(item) {
  const raw = item.server || item.tool || "tool";
  const name = raw
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
  return `Used ${name}`;
}

// Tool calls that present as "Read <file>" rows.
function isReadAction(it) {
  if (it.type !== "mcpToolCall" && it.type !== "dynamicToolCall") return false;
  return /read/i.test(it.tool || it.name || "");
}

function isCommandAction(it) {
  return it.type === "commandExecution"
    || ((it.type === "mcpToolCall" || it.type === "dynamicToolCall")
      && /node.?repl/i.test(`${it.server || ""} ${it.tool || ""}`));
}

function readActionPath(it) {
  const args = it.arguments || it.input || {};
  const p = args.path || args.file_path || args.filePath || args.target || "";
  return p ? basename(String(p)) : null;
}

// One worklog action row: "Read SKILL.md" / "Ran <cmd> ›" / fallback item.
function WorklogActionRow({ item, live }) {
  const [open, setOpen] = useState(false);
  if (item.type === "fileChange") {
    return (
      <div data-activity-icon="edit-files" className={cx("inline-flex items-center gap-1.5 text-[13px] leading-[21px]", live ? "text-(--fg)" : "text-(--fg-tertiary)")}>
        <IconEditFiles size={16} className="activity-edit-files shrink-0" />
        <span>{worklogLabel([item])}</span>
        {live && <Spinner size={11} className="shrink-0" />}
      </div>
    );
  }
  if (isReadAction(item)) {
    const name = readActionPath(item) || item.title || "file";
    return (
      <div data-activity-icon="read-files" className={cx("flex items-center gap-1.5 text-[13px]", live ? "text-(--fg)" : "text-(--fg-tertiary)")}>
        <IconBookOpen size={16} className="activity-read-files shrink-0" />
        <span className="min-w-0 truncate">Read <span className="underline">{name}</span></span>
        {live && <Spinner size={11} className="shrink-0" />}
      </div>
    );
  }
  if (item.type === "commandExecution") {
    const running = item.status === "inProgress";
    const activity = commandActivity(item);
    return (
      <div className={cx("flex flex-col", open && "gap-1")}>
        <button
          type="button"
          aria-expanded={open}
          data-activity-icon={activity.kind}
          className={cx(
            "group/activity-header inline-flex min-w-0 max-w-full cursor-pointer self-start items-center gap-1 text-left text-[14px] leading-[21px] font-[445]",
            live ? "text-(--fg)" : "text-(--conversation-body)",
          )}
          onClick={() => setOpen(!open)}
        >
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
            <WorklogActivityIcon kind={activity.kind} item={item} live={live} />
            <span className="min-w-0 truncate">{activity.label}</span>
          </span>
          <IconGoalChevron
            size={14}
            className={cx(
              "activity-chevron shrink-0 opacity-0 transition-transform duration-[300ms] group-hover/activity-header:opacity-100 group-focus-visible/activity-header:opacity-100",
              open && "rotate-90 opacity-100",
            )}
          />
        </button>
        <ActivityDisclosure open={open}>
          <pre className="max-h-60 overflow-auto rounded-lg border border-(--border-light) bg-(--surface-under) px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap break-all text-(--fg-secondary)">
            {(item.aggregatedOutput || "").slice(-4000) || (running ? "Running…" : "No output")}
          </pre>
        </ActivityDisclosure>
      </div>
    );
  }
  if (item.type === "mcpToolCall" || item.type === "dynamicToolCall") {
    return (
      <div data-activity-icon="mcp-source" className={cx("inline-flex items-center gap-1.5 text-[14px] leading-[21px] font-[445]", live ? "text-(--fg)" : "text-(--conversation-body)")}>
        <WorklogActivityIcon kind="mcp-source" item={item} live={live} />
        <span>{toolActivityLabel(item)}</span>
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
  return (
    <div className="flex flex-col items-start gap-2 text-[14px] leading-[21px]">
      <span className="text-(--conversation-body)">Working{elapsed > 1500 ? ` for ${formatDuration(elapsed)}` : ""}</span>
      <div className="w-full border-t border-(--border)" />
    </div>
  );
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
    <div className="sticky bottom-0 z-10 mt-auto w-full shrink-0">
      <div className="pointer-events-none h-8" />
      <div className="mx-auto flex w-full max-w-(--thread-content-max-width) flex-col gap-2 px-4">
        {conv?.plan && <PlanWidget plan={conv.plan} />}
        {approvals.map((a) => (
          <ApprovalCard key={a.reqId} approval={a} />
        ))}
        {pendingNewThread && (
          <div className="flex items-center gap-2 text-[13px] text-(--fg-tertiary)">
            <Spinner size={13} /> Starting chat…
          </div>
        )}
        {conv?.goal?.objective && <GoalChip goal={conv.goal} />}
      </div>
      <div className="mx-auto w-full max-w-[768px]">
        <Composer />
      </div>
      <GoalDialog open={goalDialogOpen} goal={conv?.goal} />
    </div>
  );
}

// Active goal chip above the composer: objective + status, clear on ✕.
function GoalChip({ goal }) {
  const activeThreadId = useStore((s) => s.activeThreadId);
  const setUi = useStore((s) => s.setUi);
  const objectiveRef = useRef(null);
  const [expanded, setExpanded] = useState(false);
  const [truncated, setTruncated] = useState(false);
  React.useLayoutEffect(() => {
    const element = objectiveRef.current;
    if (!element || expanded) return undefined;
    const measure = () => setTruncated(element.scrollWidth > element.clientWidth);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [expanded, goal.objective]);
  const clear = async () => {
    try { await api.rpc("thread/goal/clear", { threadId: activeThreadId }); } catch {}
    useStore.getState()._mutateConv(activeThreadId, (c) => ({ ...c, goal: null }));
  };
  const togglePaused = async () => {
    const status = goal.status === "paused" ? "active" : "paused";
    try {
      const res = await api.rpc("thread/goal/set", { threadId: activeThreadId, status });
      const next = res?.goal ?? { ...goal, status };
      useStore.getState()._mutateConv(activeThreadId, (c) => ({ ...c, goal: next }));
    } catch {}
  };
  return (
    <div
      className="active-goal-bar mx-[13px] overflow-clip rounded-t-2xl border-x border-t bg-[rgb(255_255_255/0.67)] backdrop-blur-sm dark:bg-[rgb(38_38_38/0.672)]"
      style={{ borderColor: "color-mix(in srgb, var(--border) 80%, transparent)" }}
    >
      <div className="flex h-[34px] items-center gap-2 px-3 py-[5px] text-[14px] leading-4 font-[445]">
        <IconCmdGoal size={14} className="shrink-0 text-(--fg-tertiary) opacity-70" />
        <span className="shrink-0">Pursuing goal</span>
        <span ref={objectiveRef} className="-ml-1 min-w-0 flex-1 truncate text-(--fg-tertiary)">
          {expanded ? null : goal.objective}
        </span>
        {goal.timeUsedSeconds != null && (
          <span className="-ml-0.5 shrink-0 text-(--fg-tertiary)">{formatDuration(goal.timeUsedSeconds * 1000)}</span>
        )}
        <IconButton icon={<IconGoalEdit />} size={14} title="Edit goal" onClick={() => setUi({ goalDialogOpen: true })} />
        <IconButton
          icon={goal.status === "paused" ? <IconGoalResume /> : <IconGoalPause />}
          size={14}
          title={goal.status === "paused" ? "Resume goal" : "Pause goal"}
          onClick={togglePaused}
        />
        <IconButton icon={<IconGoalTrash />} size={14} title="Clear goal" onClick={clear} />
        {(truncated || expanded) && (
          <IconButton
            icon={<IconGoalChevron className={cx("transition-transform", expanded && "rotate-90")} />}
            size={14}
            title={expanded ? "Hide full goal" : "Show full goal"}
            aria-expanded={expanded}
            onClick={() => setExpanded((value) => !value)}
          />
        )}
      </div>
      {expanded && (
        <div className="max-h-[120px] overflow-y-auto px-3 pb-2 text-[14px] leading-5 break-words whitespace-pre-wrap text-(--fg-tertiary)">
          {goal.objective}
        </div>
      )}
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
// Match a cwd to a known project's display name (longest rootPath wins).
// Returns null outside every project — the reference home then drops the
// location from the heading entirely ("我们该构建什么？").
function matchProjectName(gs, cwd) {
  const norm = (p) => (p || "").replace(/\\/g, "/");
  const dir = norm(cwd);
  let best = null;
  for (const p of Object.values(gs?.["local-projects"] || {})) {
    for (const rp of p.rootPaths || []) {
      const r = norm(rp);
      if (r && (dir === r || dir.startsWith(r + "/")) && (!best || r.length > best.len)) {
        best = { name: p.name, len: r.length };
      }
    }
  }
  return best?.name || null;
}

function Home() {
  const cwd = useStore((s) => s.cwd);
  const gs = useStore((s) => s.gs);
  const project = matchProjectName(gs, cwd);
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
      <div className="w-full max-w-[768px] shrink-0 px-4 pb-4">
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
