// Worktrees: the reference settings rows (root dir, auto-delete toggle and
// limit) plus the managed-worktree list scanned from ~/.codex/worktrees.
import React, { useCallback, useEffect, useState } from "react";
import * as api from "@app/api.js";
import { useStore } from "@app/store.js";
import { Card, Btn, Row, Toggle, lsGet, lsSet } from "./shared.jsx";
import { Spinner } from "@app/components/ui.jsx";

async function readDir(path) {
  const res = await api.rpc("fs/readDirectory", { path });
  const entries = res?.entries || res?.files || (Array.isArray(res) ? res : []);
  return entries.map((e) =>
    typeof e === "string"
      ? { name: e, isDirectory: true }
      : { name: e.fileName ?? e.name, isDirectory: e.isDirectory ?? e.is_directory ?? e.type === "directory" ?? true }
  );
}

export default function WorktreesSection() {
  const appInfo = useStore((s) => s.appInfo);
  const toast = useStore((s) => s.toast);
  const [worktrees, setWorktrees] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(null);
  const [root, setRoot] = useState(lsGet("settings.worktreeRoot", ""));
  const [autoDelete, setAutoDelete] = useState(lsGet("settings.worktreeAutoDelete", true));
  const [limit, setLimit] = useState(lsGet("settings.worktreeAutoDeleteLimit", 20));

  const base = root || (appInfo?.home ? `${appInfo.home}/.codex/worktrees` : null);

  const load = useCallback(async () => {
    if (!base) return;
    setError(null);
    try {
      const top = await readDir(base);
      const out = [];
      for (const dir of top.filter((e) => e.isDirectory)) {
        try {
          const repos = await readDir(`${base}/${dir.name}`);
          for (const r of repos.filter((e) => e.isDirectory)) {
            out.push(`${base}/${dir.name}/${r.name}`);
          }
        } catch {}
      }
      out.sort();
      setWorktrees(out);
    } catch (e) {
      setError(e.message);
      setWorktrees([]);
    }
  }, [base]);

  useEffect(() => {
    load();
  }, [load]);

  const remove = async (path) => {
    if (!window.confirm(`Delete worktree?\n${path}`)) return;
    setBusy(path);
    try {
      await api.rpc("fs/remove", { path, recursive: true });
      await load();
    } catch (e) {
      toast(`Delete failed: ${e.message}`, "error");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <Card>
        <Row title="Worktree root" desc="Directory where ChatGPT creates managed worktrees; leave blank to use the default location">
          <input
            value={root}
            onChange={(e) => {
              setRoot(e.target.value);
              lsSet("settings.worktreeRoot", e.target.value);
            }}
            placeholder={appInfo?.home ? `${appInfo.home}/.codex/worktrees` : "~/.codex/worktrees"}
            spellCheck={false}
            className="h-7 w-[16.25rem] rounded-lg border border-(--border-light) bg-(--surface) px-2.5 font-mono text-[0.75rem] outline-none placeholder:text-(--fg-faint) focus:border-(--border-heavy)"
          />
        </Row>
        <Row title="Automatically delete old worktrees" desc="Recommended for most users. Turn this off only if you want to manage old worktrees and disk usage yourself.">
          <Toggle
            on={autoDelete}
            onChange={(v) => {
              setAutoDelete(v);
              lsSet("settings.worktreeAutoDelete", v);
            }}
          />
        </Row>
        <Row
          title="Auto-delete limit"
          desc="Number of managed worktrees to keep before older ones are pruned automatically. ChatGPT snapshots worktrees before deleting, so pruned worktrees should always be restorable."
        >
          <input
            type="number"
            min={1}
            value={limit}
            onChange={(e) => {
              const v = Math.max(1, Number(e.target.value) || 1);
              setLimit(v);
              lsSet("settings.worktreeAutoDeleteLimit", v);
            }}
            className="h-7 w-20 rounded-lg border border-(--border-light) bg-(--surface) px-2.5 text-[0.8125rem] outline-none focus:border-(--border-heavy)"
          />
        </Row>
      </Card>

      {worktrees == null && !error ? (
        <div className="flex justify-center py-6 text-(--fg-tertiary)">
          <Spinner />
        </div>
      ) : error ? (
        <div className="text-[0.8125rem] text-(--fg-tertiary)">Worktrees could not be listed: {error}</div>
      ) : worktrees.length === 0 ? (
        <div className="px-1 text-[0.8125rem] text-(--fg-tertiary)">No worktrees.</div>
      ) : (
        <Card>
          {worktrees.map((path) => (
            <div key={path} className="px-4 py-3.5">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="text-[0.75rem] font-medium text-(--fg-secondary)">Worktree</div>
                  <div className="mt-0.5 truncate font-mono text-[0.75rem] text-(--fg-tertiary)" title={path}>
                    {path}
                  </div>
                </div>
                <Btn danger disabled={busy === path} onClick={() => remove(path)}>
                  {busy === path ? "Deleting…" : "Delete"}
                </Btn>
              </div>
              <div className="mt-2.5 border-t border-(--border-light) pt-2.5">
                <div className="text-[0.75rem] font-medium text-(--fg-secondary)">Conversations</div>
                <div className="mt-0.5 text-[0.75rem] text-(--fg-faint)">No conversations linked to this worktree.</div>
              </div>
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
