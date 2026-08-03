// Review tab: git working-tree state of the thread cwd — Staged / Unstaged /
// Untracked sections with expandable per-file unified diffs, plus a fallback
// "Changes this chat" section built from the thread's fileChange items.
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@app/store.js";
import * as api from "@app/api.js";
import { cx } from "@app/lib/cx.js";
import { parseUnifiedDiff, diffFileName, countDiff } from "@app/lib/diff.js";
import { Menu, Spinner } from "@app/components/ui.jsx";
import {
  IconBranch,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconFile,
  IconFolder,
  IconRefresh,
  LucideIcon,
} from "@app/components/icons.jsx";
import { openFileInPanel, usePanelStore } from "../state.js";
import { EmptyState } from "./common.jsx";

const out = (r) => r?.stdout ?? r?.output ?? "";
const isAbsolutePath = (p) => /^(?:\/|[A-Za-z]:[\\/]|\\\\)/.test(String(p || ""));
const joinWorkspacePath = (root, child) => {
  if (!child || isAbsolutePath(child)) return child;
  const separator = String(root || "").includes("\\") ? "\\" : "/";
  return `${String(root || "").replace(/[\\/]+$/, "")}${separator}${child}`;
};

export default function ReviewTab() {
  const activeThreadId = useStore((s) => s.activeThreadId);
  const conv = useStore((s) => (s.activeThreadId ? s.conversations[s.activeThreadId] : null));
  const globalCwd = useStore((s) => s.cwd);
  const home = useStore((s) => s.appInfo?.home);
  const cwd = conv?.thread?.cwd || globalCwd;
  const gitBranch = conv?.thread?.gitInfo?.branch;
  const [state, setState] = useState({ status: "loading", branch: "", staged: [], unstaged: [], untracked: [] });
  const [confirmRevertAll, setConfirmRevertAll] = useState(false);
  const [collapseSignal, setCollapseSignal] = useState(0);
  const [split, setSplit] = useState(false);
  const [menu, setMenu] = useState(null);
  const branchButtonRef = useRef(null);
  const optionsButtonRef = useRef(null);
  const commitButtonRef = useRef(null);
  const moreButtonRef = useRef(null);
  const scrollRef = useRef(null);

  const refresh = useCallback(async () => {
    if (!cwd) return;
    setState((s) => ({ ...s, status: "loading" }));
    const [statusRes, unstagedRes, stagedRes, branchRes] = await Promise.all([
      api.rpc("command/exec", { command: ["git", "status", "--porcelain"], cwd, timeoutMs: 15000 }).catch(() => null),
      api.rpc("command/exec", { command: ["git", "diff"], cwd, timeoutMs: 20000 }).catch(() => null),
      api.rpc("command/exec", { command: ["git", "diff", "--cached"], cwd, timeoutMs: 20000 }).catch(() => null),
      api.rpc("command/exec", { command: ["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd, timeoutMs: 10000 }).catch(() => null),
    ]);
    // Exec failure (or a failing status with no output) → not a git repo.
    if (!statusRes || ((statusRes.exitCode ?? 0) !== 0 && !out(statusRes).trim())) {
      setState({ status: "nogit", branch: "", staged: [], unstaged: [], untracked: [] });
      return;
    }
    const untracked = out(statusRes)
      .split("\n")
      .filter((l) => l.startsWith("??"))
      .map((l) => l.slice(3).trim())
      .filter(Boolean);
    setState({
      status: "ready",
      branch: gitBranch || out(branchRes).trim(),
      staged: parseUnifiedDiff(out(stagedRes)),
      unstaged: parseUnifiedDiff(out(unstagedRes)),
      untracked,
    });
  }, [cwd, gitBranch]);

  useEffect(() => {
    refresh();
  }, [refresh, activeThreadId]);

  // Thread file changes from conversation items (fallback when git shows nothing).
  const threadChanges = useMemo(() => {
    const map = new Map();
    for (const turn of conv?.turns || []) {
      for (const item of turn.items || []) {
        if (item.type === "fileChange") {
          for (const c of item.changes || []) map.set(c.path, c);
        }
      }
    }
    return [...map.values()];
  }, [conv?.turns]);

  // "Last Turn" section: the diff of the most recent turn (turn/diff/updated).
  const lastTurnFiles = useMemo(() => parseUnifiedDiff(conv?.diff || ""), [conv?.diff]);
  const { status, branch, staged, unstaged, untracked } = state;
  const gitEmpty = status === "ready" && staged.length === 0 && unstaged.length === 0 && untracked.length === 0;
  const showThreadFallback = gitEmpty && threadChanges.length > 0 && lastTurnFiles.length === 0;
  const nothing = gitEmpty && threadChanges.length === 0 && lastTurnFiles.length === 0;
  const tracked = [...staged, ...unstaged];
  const totals = tracked.reduce(
    (sum, file) => ({ added: sum.added + (file.added || 0), deleted: sum.deleted + (file.deleted || 0) }),
    { added: 0, deleted: 0 },
  );
  const skipUntracked = untracked.length > 250;

  const initRepo = async () => {
    try {
      await api.rpc("command/exec", { command: ["git", "init"], cwd, timeoutMs: 10000 });
      refresh();
    } catch (e) {
      useStore.getState().toast(`git init failed: ${e.message}`, "error");
    }
  };

  // ---- git actions (stage / unstage / revert) ----
  const git = useCallback(async (args) => {
    await api.rpc("command/exec", { command: ["git", ...args], cwd, timeoutMs: 20000 });
    refresh();
  }, [cwd, refresh]);

  const stageAll = () => git(["add", "-A"]).catch(err);
  const unstageAll = () => git(["restore", "--staged", "--", "."]).catch(err);
  const stageFile = (p) => git(["add", "--", p]).catch(err);
  const unstageFile = (p) => git(["restore", "--staged", "--", p]).catch(err);
  const revertFile = (p) => git(["restore", "--", p]).catch(err);
  const revertAll = async () => {
    setConfirmRevertAll(false);
    try {
      await git(["restore", "--", "."]);
    } catch (e) { err(e); }
  };
  const err = (e) => useStore.getState().toast(`git failed: ${e.message}`, "error");
  const copyText = async (text, message) => {
    try {
      await navigator.clipboard.writeText(text);
      useStore.getState().toast(message);
    } catch (e) {
      useStore.getState().toast(`Copy failed: ${e.message}`, "error");
    }
  };
  const openFile = (name) => {
    const target = joinWorkspacePath(cwd, name);
    if (target) openFileInPanel(target);
  };
  const askForReview = () => {
    useStore.getState().sendMessage(
      "Review the current workspace changes. Focus on correctness, regressions, and user-visible issues. Do not expose hidden reasoning; summarize only actionable findings.",
      [],
      [],
      { steer: !!activeThreadId && useStore.getState().isTurnActive(activeThreadId) },
    );
  };

  // Revert a single hunk by reverse-applying it via `git apply -R`.
  const revertHunk = async (file, hunk) => {
    const name = diffFileName(file);
    const oldN = hunk.lines.filter((l) => l.type !== "add").length;
    const newN = hunk.lines.filter((l) => l.type !== "del").length;
    const header = `--- a/${name}\n+++ b/${name}\n@@ -${hunk.oldStart},${oldN} +${hunk.newStart},${newN} @@\n`;
    const body = hunk.lines
      .map((l) => (l.type === "add" ? "+" : l.type === "del" ? "-" : l.type === "meta" ? "\\" : " ") + l.text)
      .join("\n");
    const tmp = `/tmp/codex-hunk-${Date.now()}.patch`;
    try {
      await api.rpc("fs/writeFile", { path: tmp, content: header + body + "\n" });
      const r = await api.rpc("command/exec", { command: ["git", "apply", "-R", tmp], cwd, timeoutMs: 15000 });
      if ((r?.exitCode ?? 1) !== 0) throw new Error((r?.stderr || r?.stdout || "git apply failed").slice(0, 200));
      refresh();
    } catch (e) {
      err(e);
    } finally {
      api.rpc("fs/remove", { path: tmp }).catch(() => {});
    }
  };

  if (!cwd) return <EmptyState text="Open a chat to review its changes" />;

  const menuConfig = {
    branch: {
      ref: branchButtonRef,
      width: 230,
      items: [
        { header: "Current branch" },
        { id: "current", label: branch || "HEAD", icon: <IconBranch size={14} />, disabled: true },
        { sep: true },
        { id: "copy", label: "Copy branch name", icon: <IconCopy size={14} />, onSelect: () => copyText(branch || "HEAD", "Branch name copied") },
      ],
    },
    options: {
      ref: optionsButtonRef,
      width: 220,
      items: [
        { id: "refresh", label: "Refresh changes", icon: <IconRefresh size={14} />, onSelect: refresh },
        { id: "stage", label: "Stage all changes", onSelect: stageAll, disabled: gitEmpty },
        { id: "unstage", label: "Unstage all changes", onSelect: unstageAll, disabled: staged.length === 0 },
      ],
    },
    commit: {
      ref: commitButtonRef,
      width: 220,
      items: [
        { id: "terminal", label: "Open Terminal to commit", onSelect: () => usePanelStore.getState().open("terminal") },
        { id: "copy-status", label: "Copy git status command", icon: <IconCopy size={14} />, onSelect: () => copyText("git status --short", "Command copied") },
      ],
    },
    more: {
      ref: moreButtonRef,
      width: 220,
      items: [
        { id: "refresh", label: "Refresh", icon: <IconRefresh size={14} />, onSelect: refresh },
        { id: "terminal", label: "Open Git terminal", onSelect: () => usePanelStore.getState().open("terminal") },
        { sep: true },
        { id: "revert", label: "Revert all unstaged changes", danger: true, disabled: unstaged.length === 0, onSelect: () => setConfirmRevertAll(true) },
      ],
    },
  };
  const openMenu = (name) => setMenu((current) => (current === name ? null : name));
  const activeMenu = menu ? menuConfig[menu] : null;
  const jumpToFirstFile = () => {
    scrollRef.current?.querySelector("[data-review-file]")?.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  return (
    <div className="relative flex h-full flex-col">
      <div className="border-b border-(--border-light)">
        <div className="flex h-9 items-center px-2">
          <button
            ref={branchButtonRef}
            className="flex h-7 w-[5.4375rem] shrink-0 items-center gap-1 rounded-lg px-1.5 text-[0.875rem] hover:bg-(--surface-hover)"
            onClick={() => openMenu("branch")}
            title={branch || "Branch"}
          >
            <span>Branch</span>
            <IconChevronDown size={13} className="shrink-0 text-(--fg-tertiary)" />
          </button>
          <span className="ml-1 shrink-0 font-mono text-[0.875rem] text-(--diff-add-fg)">+{totals.added}</span>
          <span className="ml-1 shrink-0 font-mono text-[0.875rem] text-(--diff-del-fg)">−{totals.deleted}</span>
          <div className="min-w-1 flex-1" />
          <div className="flex items-center gap-1.5">
            <span ref={optionsButtonRef}>
              <ReviewToolButton icon="Ellipsis" title="Review options" onClick={() => openMenu("options")} />
            </span>
            <ReviewToolButton icon="ListCollapse" title="Collapse all diffs" onClick={() => setCollapseSignal((value) => value + 1)} />
            <ReviewToolButton icon="FileSearch" title="Jump to file" onClick={jumpToFirstFile} />
            <ReviewToolButton icon="Columns2" title="Switch to split diff" active={split} onClick={() => setSplit((value) => !value)} />
            <ReviewToolButton icon="FolderOpen" title="Show files" onClick={() => usePanelStore.getState().open("files")} />
            <ReviewToolButton icon="Sparkles" title="Review changes" onClick={askForReview} />
            <div className="flex h-7 w-[3.1875rem] items-center overflow-hidden rounded-[0.625rem] ring-1 ring-inset ring-(--border)">
              <span ref={commitButtonRef}>
                <ReviewToolButton icon="GitCommitHorizontal" title="Commit or push" onClick={() => openMenu("commit")} />
              </span>
              <button
                ref={moreButtonRef}
                className="flex h-7 w-[1.4375rem] items-center justify-center text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
                title="More Git actions"
                aria-label="More Git actions"
                onClick={() => openMenu("more")}
              >
                <IconChevronDown size={13} />
              </button>
            </div>
          </div>
        </div>
        <button
          className="flex h-8 w-full items-center gap-2 px-4 text-left font-mono text-[0.875rem] text-(--fg-tertiary) hover:bg-(--surface-hover)"
          onClick={() => openMenu("branch")}
          title={cwd}
        >
          <span className="truncate">{branch || "HEAD"}</span>
          <span>→</span>
          <span className="truncate">origin/{branch || "HEAD"}</span>
          <IconChevronDown size={13} />
        </button>
      </div>

      {activeMenu && (
        <Menu
          open
          anchor={() => activeMenu.ref.current?.getBoundingClientRect()}
          items={activeMenu.items}
          width={activeMenu.width}
          align={menu === "more" || menu === "commit" ? "end" : "start"}
          onClose={() => setMenu(null)}
        />
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
        {status === "loading" && staged.length + unstaged.length + untracked.length === 0 && (
          <div className="flex justify-center py-6 text-(--fg-tertiary)"><Spinner /></div>
        )}

        {status === "nogit" && (
          <EmptyState text="Create a Git repository" sub="Track, review, and undo changes in this project">
            <button
              className="mt-2 rounded-lg border border-(--border) px-3 py-1.5 text-xs text-(--fg-secondary) hover:bg-(--surface-hover)"
              onClick={initRepo}
            >
              Run git init
            </button>
          </EmptyState>
        )}

        {nothing && (
          <EmptyState text="No file changes yet" sub="Track, review, and undo changes in this project" />
        )}

        {skipUntracked && (
          <div className="mx-2 mt-2 overflow-hidden rounded-2xl border border-[color-mix(in_srgb,var(--warning)_28%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_5%,var(--surface))]">
            <div className="flex gap-3 px-3 pt-3 pb-2">
              <LucideIcon name="CircleAlert" size={15} className="mt-0.5 shrink-0 text-(--warning)" />
              <div className="min-w-0">
                <div className="text-[0.8125rem] font-semibold leading-[1.125rem]">Showing tracked changes only</div>
                <div className="mt-1 text-[0.8125rem] leading-[1.3125rem] text-(--fg-tertiary)">
                  Review skipped {untracked.length} untracked files to stay responsive. If these files are generated, clean them up and refresh.
                </div>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 border-t border-(--border-light) px-3 py-2">
              <button
                className="h-6 rounded-full border border-(--border) bg-(--panel-action-bg) px-2.5 text-[0.8125rem] hover:bg-(--panel-action-hover-bg)"
                onClick={() => copyText("git clean -nd", "Cleanup preview command copied")}
              >
                Copy cleanup command
              </button>
              <button className="h-6 rounded-lg px-2.5 text-[0.8125rem] text-(--fg-tertiary) hover:bg-(--surface-hover)" onClick={refresh}>
                Refresh
              </button>
            </div>
          </div>
        )}

        {lastTurnFiles.length > 0 && (
          <Section title="Last Turn">
            {lastTurnFiles.map((f, i) => (
              <DiffFile key={`lt${i}`} file={f} defaultOpen={lastTurnFiles.length <= 3} collapseSignal={collapseSignal} split={split} />
            ))}
          </Section>
        )}

        {unstaged.length > 0 && (
          <Section
            title="Unstaged"
            actions={
              <>
                <SectionAction label="Stage all" onClick={stageAll} />
                <SectionAction label="Revert all" danger onClick={() => setConfirmRevertAll(true)} />
              </>
            }
          >
            {unstaged.map((f, i) => (
              <DiffFile
                key={`u${i}`}
                file={f}
                defaultOpen={unstaged.length <= 3}
                onRevertHunk={revertHunk}
                collapseSignal={collapseSignal}
                split={split}
                onOpenFile={openFile}
                actions={
                  <>
                    <FileAction label="Open" onClick={(e) => { e.stopPropagation(); openFile(diffFileName(f)); }} />
                    <FileAction label="Stage" onClick={(e) => { e.stopPropagation(); stageFile(diffFileName(f)); }} />
                    <FileAction label="Revert" danger onClick={(e) => { e.stopPropagation(); revertFile(diffFileName(f)); }} />
                  </>
                }
              />
            ))}
          </Section>
        )}

        {staged.length > 0 && (
          <Section
            title="Staged"
            actions={<SectionAction label="Unstage all" onClick={unstageAll} />}
          >
            {staged.map((f, i) => (
              <DiffFile
                key={`s${i}`}
                file={f}
                defaultOpen={staged.length <= 3}
                collapseSignal={collapseSignal}
                split={split}
                onOpenFile={openFile}
                actions={
                  <>
                    <FileAction label="Open" onClick={(e) => { e.stopPropagation(); openFile(diffFileName(f)); }} />
                    <FileAction label="Unstage" onClick={(e) => { e.stopPropagation(); unstageFile(diffFileName(f)); }} />
                  </>
                }
              />
            ))}
          </Section>
        )}

        {untracked.length > 0 && !skipUntracked && (
          <Section title="Untracked" actions={<SectionAction label="Stage all" onClick={stageAll} />}>
            {untracked.map((p, i) => (
              <div key={i} data-review-file className="group flex min-h-9 items-center gap-2 px-4 py-1.5 text-[0.8125rem] text-(--fg-secondary) hover:bg-(--surface-hover)">
                <FileKindIcon name={p} />
                <span className="min-w-0 flex-1 truncate font-mono" title={p}>{p}</span>
                <FileAction label="Open" onClick={() => openFile(p)} />
                <FileAction label="Stage" onClick={() => stageFile(p)} />
              </div>
            ))}
          </Section>
        )}

        {showThreadFallback && (
          <Section title={`Changes this chat (${threadChanges.length})`}>
            {threadChanges.map((c, i) => (
              <DiffFile
                key={`t${i}`}
                file={{
                  newPath: c.path,
                  oldPath: c.kind?.type === "update" ? c.kind?.move_path || c.path : c.path,
                  hunks: parseUnifiedDiff(fakeHeader(c))[0]?.hunks || [],
                  isNew: c.kind?.type === "add",
                  isDeleted: c.kind?.type === "delete",
                  added: countDiff(c.diff).add,
                  deleted: countDiff(c.diff).del,
                }}
                defaultOpen={threadChanges.length <= 3}
                collapseSignal={collapseSignal}
                split={split}
                onOpenFile={openFile}
                actions={<FileAction label="Open" onClick={(e) => { e.stopPropagation(); openFile(c.path); }} />}
              />
            ))}
          </Section>
        )}
      </div>

      {confirmRevertAll && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmRevertAll(false); }}>
          <div className="fade-in w-[20rem] rounded-2xl border border-(--border) bg-(--surface-raised) p-4" style={{ boxShadow: "var(--shadow-menu)" }}>
            <div className="text-[0.8125rem] font-medium">Revert all changes?</div>
            <div className="mt-1 text-xs text-(--fg-tertiary)">This action removes all unstaged changes in this project.</div>
            <div className="mt-3 flex justify-end gap-2">
              <button className="rounded-lg px-3 py-1.5 text-xs text-(--fg-secondary) hover:bg-(--surface-hover)" onClick={() => setConfirmRevertAll(false)}>Cancel</button>
              <button className="rounded-lg bg-(--danger) px-3 py-1.5 text-xs font-medium text-white" onClick={revertAll}>Revert all</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// fileChange diffs lack "diff --git" headers; add one so the parser is happy.
function fakeHeader(c) {
  const p = c.path;
  if ((c.diff || "").startsWith("diff --git")) return c.diff;
  return `diff --git a/${p} b/${p}\n${c.diff || ""}`;
}

function Section({ title, children, actions }) {
  return (
    <div className="border-b border-(--border-light) py-2">
      <div className="flex items-center justify-between px-4 py-1.5">
        <div className="text-xs font-medium text-(--fg-tertiary)">{title}</div>
        {actions && <div className="flex items-center gap-1">{actions}</div>}
      </div>
      {children}
    </div>
  );
}

function SectionAction({ label, onClick, danger }) {
  return (
    <button
      className={cx(
        "rounded px-1.5 py-0.5 text-[0.6875rem]",
        danger ? "text-(--danger) hover:bg-(--danger-soft)" : "text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function FileAction({ label, onClick, danger }) {
  return (
    <button
      className={cx(
        "hidden rounded px-1.5 py-0.5 text-[0.6875rem] group-hover:block",
        danger ? "text-(--danger) hover:bg-(--danger-soft)" : "text-(--fg-tertiary) hover:bg-(--surface-active) hover:text-(--fg)"
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function ReviewToolButton({ icon, title, onClick, active }) {
  return (
    <button
      className={cx(
        "flex size-7 items-center justify-center rounded-lg text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)",
        active && "bg-(--surface-active) text-(--fg)",
      )}
      title={title}
      aria-label={title}
      onClick={onClick}
    >
      <LucideIcon name={icon} size={15} />
    </button>
  );
}

function FileKindIcon({ name }) {
  const lower = name.toLowerCase();
  if (lower.endsWith("/")) {
    return <IconFolder size={14} className="shrink-0 text-(--fg-tertiary)" />;
  }
  const extension = lower.match(/\.([a-z0-9]+)$/)?.[1] || "";
  const labels = {
    cjs: ["JS", "#d6ae3b"],
    css: ["#", "#b06dff"],
    js: ["JS", "#d6ae3b"],
    json: ["{}", "#d6ae3b"],
    jsx: ["JS", "#d6ae3b"],
    md: ["M", "#8b949e"],
    mjs: ["JS", "#d6ae3b"],
    ts: ["TS", "#3b82f6"],
    tsx: ["TS", "#3b82f6"],
  };
  const badge = labels[extension];
  if (!badge) return <IconFile size={14} className="shrink-0 text-(--fg-tertiary)" />;
  return (
    <span
      className="flex size-[0.875rem] shrink-0 items-center justify-center rounded-[0.25rem] text-[0.4375rem] leading-none font-bold text-black/75"
      style={{ backgroundColor: badge[1] }}
      aria-hidden="true"
    >
      {badge[0]}
    </span>
  );
}

function DiffFile({ file, defaultOpen = false, actions, onRevertHunk, collapseSignal = 0, split = false, onOpenFile }) {
  const [open, setOpen] = useState(defaultOpen);
  const name = diffFileName(file);
  useEffect(() => {
    if (collapseSignal > 0) setOpen(false);
  }, [collapseSignal]);
  return (
    <div data-review-file className="group border-b border-(--border-light)">
      <div
        role="button"
        tabIndex={0}
        className="flex min-h-11 w-full items-center gap-2 px-4 py-2 text-left hover:bg-(--surface-hover)"
        onClick={() => setOpen(!open)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen(!open);
          }
        }}
        onDoubleClick={() => onOpenFile?.(name)}
      >
        <IconChevronRight size={12} className={cx("shrink-0 text-(--fg-tertiary) transition-transform", open && "rotate-90")} />
        <FileKindIcon name={name} />
        <span className="min-w-0 flex-1 truncate font-mono text-[0.8125rem]" title={name}>{formatFileName(name)}</span>
        {actions}
        {file.isNew && <span className="shrink-0 rounded bg-(--diff-add-bg) px-1 text-[0.625rem] text-(--diff-add-fg)">new</span>}
        {file.isDeleted && <span className="shrink-0 rounded bg-(--diff-del-bg) px-1 text-[0.625rem] text-(--diff-del-fg)">deleted</span>}
        <span className="shrink-0 font-mono text-[0.8125rem]">
          {file.added > 0 && <span className="text-(--diff-add-fg)">+{file.added} </span>}
          {file.deleted > 0 && <span className="text-(--diff-del-fg)">−{file.deleted}</span>}
        </span>
      </div>
      {open && (
        <div className="overflow-x-auto border-t border-(--border-light) py-1">
          {file.hunks.map((h, hi) => (
            <div key={hi} className="group/hunk relative">
              <div className="diff-line hunk px-2">
                @@ -{h.oldStart} +{h.newStart} @@ {h.context}
                {onRevertHunk && (
                  <button
                    className="absolute right-2 hidden rounded px-1 text-[0.625rem] font-normal text-(--danger) hover:bg-(--danger-soft) group-hover/hunk:inline"
                    onClick={() => onRevertHunk(file, h)}
                  >
                    Revert hunk
                  </button>
                )}
              </div>
              {split ? (
                <div className="grid grid-cols-2">
                  {splitRows(h.lines).map((row, index) => (
                    <React.Fragment key={index}>
                      <DiffCell line={row.old} />
                      <DiffCell line={row.next} />
                    </React.Fragment>
                  ))}
                </div>
              ) : h.lines.map((l, li) => (
                <div key={li} className={cx("diff-line", l.type === "add" && "add", l.type === "del" && "del")}>
                  <span className="content px-2">{l.text || " "}</span>
                </div>
              ))}
            </div>
          ))}
          {file.hunks.length === 0 && (
            <div className="px-3 py-1 text-xs text-(--fg-faint)">Binary or empty diff</div>
          )}
        </div>
      )}
    </div>
  );
}

function formatFileName(name) {
  const slash = name.lastIndexOf("/");
  if (slash < 0) return name;
  return (
    <>
      <span className="text-(--fg-tertiary)">{name.slice(0, slash + 1)}</span>
      <span>{name.slice(slash + 1)}</span>
    </>
  );
}

function splitRows(lines) {
  const rows = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.type === "del") {
      const next = lines[index + 1];
      if (next?.type === "add") {
        rows.push({ old: line, next });
        index += 1;
      } else {
        rows.push({ old: line, next: null });
      }
    } else if (line.type === "add") {
      rows.push({ old: null, next: line });
    } else {
      rows.push({ old: line, next: line });
    }
  }
  return rows;
}

function DiffCell({ line }) {
  return (
    <div
      className={cx(
        "diff-line min-w-0 border-r border-(--border-light)",
        line?.type === "add" && "add",
        line?.type === "del" && "del",
      )}
    >
      <span className="content block truncate px-2">{line?.text || " "}</span>
    </div>
  );
}
