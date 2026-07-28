// Review tab: git working-tree state of the thread cwd — Staged / Unstaged /
// Untracked sections with expandable per-file unified diffs, plus a fallback
// "Changes this chat" section built from the thread's fileChange items.
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useStore } from "../../store.js";
import * as api from "../../api.js";
import { cx } from "../../lib/cx.js";
import { parseUnifiedDiff, diffFileName, countDiff } from "../../lib/diff.js";
import { shortenPath } from "../../lib/time.js";
import { IconButton, Spinner } from "../ui.jsx";
import { IconBranch, IconRefresh, IconFile, IconChevronRight } from "../icons.jsx";
import { EmptyState } from "./common.jsx";

const out = (r) => r?.stdout ?? r?.output ?? "";

export default function ReviewTab() {
  const activeThreadId = useStore((s) => s.activeThreadId);
  const conv = useStore((s) => (s.activeThreadId ? s.conversations[s.activeThreadId] : null));
  const globalCwd = useStore((s) => s.cwd);
  const home = useStore((s) => s.appInfo?.home);
  const temp = useStore((s) => s.appInfo?.temp);
  const cwd = conv?.thread?.cwd || globalCwd;
  const gitBranch = conv?.thread?.gitInfo?.branch;
  const [state, setState] = useState({ status: "loading", branch: "", staged: [], unstaged: [], untracked: [] });

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

  if (!cwd) return <EmptyState text="Open a chat to review its changes" />;

  const { status, branch, staged, unstaged, untracked } = state;
  const gitEmpty = status === "ready" && staged.length === 0 && unstaged.length === 0 && untracked.length === 0;
  const showThreadFallback = gitEmpty && threadChanges.length > 0 && lastTurnFiles.length === 0;
  const nothing = gitEmpty && threadChanges.length === 0 && lastTurnFiles.length === 0;

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
  const [confirmRevertAll, setConfirmRevertAll] = useState(false);

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

  // Revert a single hunk by reverse-applying it via `git apply -R`.
  const revertHunk = async (file, hunk) => {
    const name = diffFileName(file);
    const oldN = hunk.lines.filter((l) => l.type !== "add").length;
    const newN = hunk.lines.filter((l) => l.type !== "del").length;
    const header = `--- a/${name}\n+++ b/${name}\n@@ -${hunk.oldStart},${oldN} +${hunk.newStart},${newN} @@\n`;
    const body = hunk.lines
      .map((l) => (l.type === "add" ? "+" : l.type === "del" ? "-" : l.type === "meta" ? "\\" : " ") + l.text)
      .join("\n");
    const tmp = `${String(temp || home || cwd).replace(/[\\/]+$/, "")}\\codex-hunk-${Date.now()}.patch`;
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

  return (
    <div className="relative flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-(--border-light) px-3 py-2">
        {branch && status !== "nogit" && (
          <span className="flex shrink-0 items-center gap-1 rounded-md bg-(--surface-hover) px-1.5 py-0.5 text-xs text-(--fg-secondary)">
            <IconBranch size={11} />
            <span className="max-w-[140px] truncate">{branch}</span>
          </span>
        )}
        <span className="min-w-0 flex-1 truncate text-xs text-(--fg-tertiary)" title={cwd}>
          {shortenPath(cwd, home)}
        </span>
        <IconButton icon={<IconRefresh />} title="Refresh" onClick={refresh} size={13} disabled={status === "loading"} />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
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

        {lastTurnFiles.length > 0 && (
          <Section title="Last Turn">
            {lastTurnFiles.map((f, i) => (
              <DiffFile key={`lt${i}`} file={f} defaultOpen={lastTurnFiles.length <= 3} />
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
                actions={
                  <>
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
                actions={<FileAction label="Unstage" onClick={(e) => { e.stopPropagation(); unstageFile(diffFileName(f)); }} />}
              />
            ))}
          </Section>
        )}

        {untracked.length > 0 && (
          <Section title="Untracked" actions={<SectionAction label="Stage all" onClick={stageAll} />}>
            {untracked.map((p, i) => (
              <div key={i} className="group flex items-center gap-2 px-3 py-1 text-xs text-(--fg-secondary) hover:bg-(--surface-hover)">
                <IconFile size={12} className="shrink-0 text-(--fg-tertiary)" />
                <span className="min-w-0 flex-1 truncate font-mono" title={p}>{p}</span>
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
              />
            ))}
          </Section>
        )}
      </div>

      {confirmRevertAll && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/40" onMouseDown={(e) => { if (e.target === e.currentTarget) setConfirmRevertAll(false); }}>
          <div className="fade-in w-[320px] rounded-2xl border border-(--border) bg-(--surface-raised) p-4" style={{ boxShadow: "var(--shadow-menu)" }}>
            <div className="text-[13px] font-medium">Revert all changes?</div>
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
    <div className="border-b border-(--border-light) pb-2">
      <div className="flex items-center justify-between px-3 pt-2.5 pb-1">
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
        "rounded px-1.5 py-0.5 text-[11px]",
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
        "hidden rounded px-1.5 py-0.5 text-[11px] group-hover:block",
        danger ? "text-(--danger) hover:bg-(--danger-soft)" : "text-(--fg-tertiary) hover:bg-(--surface-active) hover:text-(--fg)"
      )}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

function DiffFile({ file, defaultOpen = false, actions, onRevertHunk }) {
  const [open, setOpen] = useState(defaultOpen);
  const name = diffFileName(file);
  return (
    <div className="group mx-2 mb-1 overflow-hidden rounded-lg border border-(--border-light) bg-(--surface)">
      <button
        className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-(--surface-hover)"
        onClick={() => setOpen(!open)}
      >
        <IconChevronRight size={12} className={cx("shrink-0 text-(--fg-tertiary) transition-transform", open && "rotate-90")} />
        <IconFile size={12} className="shrink-0 text-(--fg-tertiary)" />
        <span className="min-w-0 flex-1 truncate font-mono text-xs" title={name}>{name}</span>
        {actions}
        {file.isNew && <span className="shrink-0 rounded bg-(--diff-add-bg) px-1 text-[10px] text-(--diff-add-fg)">new</span>}
        {file.isDeleted && <span className="shrink-0 rounded bg-(--diff-del-bg) px-1 text-[10px] text-(--diff-del-fg)">deleted</span>}
        <span className="shrink-0 font-mono text-[11px]">
          {file.added > 0 && <span className="text-(--diff-add-fg)">+{file.added} </span>}
          {file.deleted > 0 && <span className="text-(--diff-del-fg)">-{file.deleted}</span>}
        </span>
      </button>
      {open && (
        <div className="overflow-x-auto border-t border-(--border-light) py-1">
          {file.hunks.map((h, hi) => (
            <div key={hi} className="group/hunk relative">
              <div className="diff-line hunk px-2">
                @@ -{h.oldStart} +{h.newStart} @@ {h.context}
                {onRevertHunk && (
                  <button
                    className="absolute right-2 hidden rounded px-1 text-[10px] font-normal text-(--danger) hover:bg-(--danger-soft) group-hover/hunk:inline"
                    onClick={() => onRevertHunk(file, h)}
                  >
                    Revert hunk
                  </button>
                )}
              </div>
              {h.lines.map((l, li) => (
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
