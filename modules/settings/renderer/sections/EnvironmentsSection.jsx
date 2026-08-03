// Environments: local projects with their git origin owner tags, like the
// reference page ("Local environments tell ChatGPT how to set up worktrees
// for a project", search + Add project + owner-tagged rows).
import React, { useEffect, useMemo, useState } from "react";
import * as api from "@app/api.js";
import { useStore } from "@app/store.js";
import { Card } from "./shared.jsx";
import { LucideIcon, IconFolder, IconSearch, IconPlus } from "@app/components/icons.jsx";

function listOf(v) {
  if (!v) return [];
  return Array.isArray(v) ? v : Object.values(v);
}

export default function EnvironmentsSection() {
  const gs = useStore((s) => s.gs);
  const local = listOf(gs?.["local-projects"]);
  const remote = listOf(gs?.["remote-projects"]);
  const [query, setQuery] = useState("");
  const [owners, setOwners] = useState({});

  // Resolve each project's origin owner once (cached per root path).
  useEffect(() => {
    let live = true;
    (async () => {
      const out = {};
      for (const p of local) {
        const root = p.rootPaths?.[0];
        if (!root) continue;
        try {
          const r = await api.rpc("command/exec", { command: ["git", "remote", "get-url", "origin"], cwd: root, timeoutMs: 4000 });
          const url = String(r?.stdout || "").trim();
          const m = url.match(/[:/]([^/:]+)\/[^/]+?(\.git)?$/) || url.match(/\/([^/]+)\/[^/]+$/);
          if (m) out[root] = m[1];
        } catch {}
      }
      if (live) setOwners(out);
    })();
    return () => { live = false; };
  }, [local.length]);

  const q = query.trim().toLowerCase();
  const projects = useMemo(
    () =>
      local.filter((p) => {
        if (!q) return true;
        const name = (p.name || p.rootPaths?.[0]?.split("/").pop() || "").toLowerCase();
        const owner = (owners[p.rootPaths?.[0]] || "").toLowerCase();
        return name.includes(q) || owner.includes(q);
      }),
    [local, owners, q]
  );

  return (
    <>
      <div className="-mt-3 mb-4 text-[0.8125rem] text-(--fg-tertiary)">
        Local environments tell ChatGPT how to set up worktrees for a project.{" "}
        <button className="text-(--accent) hover:underline" onClick={() => api.openExternal("https://developers.openai.com/codex/environments")}>
          Learn more
        </button>
      </div>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex h-8 flex-1 items-center gap-2 rounded-full border border-(--border-light) bg-(--input-bg) px-2.5">
          <IconSearch size={13} className="shrink-0 text-(--fg-faint)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Select a project"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-(--fg-faint)"
          />
        </div>
        <button
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-(--border) px-3 text-sm hover:bg-(--surface-hover)"
          onClick={async () => useStore.getState().addLocalProject(await api.pickDirectory())}
        >
          <IconPlus size={12} />
          Add project
        </button>
      </div>

      <Card title="Local projects">
        {projects.length === 0 && <div className="px-4 py-4 text-[0.75rem] text-(--fg-faint)">{local.length ? "No projects match your search" : "No local projects."}</div>}
        {projects.map((p, i) => {
          const root = p.rootPaths?.[0];
          return (
            <div key={p.id || root || i} className="flex items-center gap-3 px-4 py-2.5">
              <IconFolder size={15} className="shrink-0 text-(--fg-tertiary)" />
              <div className="min-w-0 flex-1 truncate text-[0.8125rem]">{p.name || root?.split("/").pop() || "Project"}</div>
              {owners[root] && <div className="shrink-0 truncate text-[0.75rem] text-(--fg-tertiary)">{owners[root]}</div>}
            </div>
          );
        })}
      </Card>
      {remote.length > 0 && (
        <Card title="Remote projects">
          {remote.map((p, i) => (
            <div key={p.id || i} className="flex items-center gap-3 px-4 py-2.5">
              <LucideIcon name="Server" size={15} className="shrink-0 text-(--fg-tertiary)" />
              <div className="min-w-0 flex-1 truncate text-[0.8125rem]">{p.name || p.hostId || "Remote project"}</div>
              {p.hostId && <div className="shrink-0 truncate text-[0.75rem] text-(--fg-tertiary)">{p.hostId}</div>}
            </div>
          ))}
        </Card>
      )}
    </>
  );
}
