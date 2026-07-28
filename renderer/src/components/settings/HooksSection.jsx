// Hooks: lifecycle hooks from `hooks/list` across every project cwd, grouped
// exactly like the reference settings page:
//   From Config   → the shared user-level hooks (deduped)
//   From Plugins  → hooks shipped by plugins, grouped by plugin
//   From Projects → project-local hooks, grouped by project root
import React, { useEffect, useState } from "react";
import * as api from "../../api.js";
import { useStore } from "../../store.js";
import { cx } from "../../lib/cx.js";
import { basename } from "../../lib/time.js";
import { Card } from "./shared.jsx";
import { IconChevronDown, IconChevronRight } from "../icons.jsx";
import { Spinner } from "../ui.jsx";

const base = (p) => basename(p);

function groupHooks(data) {
  const user = new Map(); // key -> hook (deduped across cwd groups)
  const plugins = new Map(); // pluginLabel -> Map(key -> hook)
  const projects = new Map(); // projectLabel -> Map(key -> hook)
  for (const g of data || []) {
    for (const h of g.hooks || []) {
      if (h.pluginId) {
        const label = String(h.pluginId).split("@")[0];
        if (!plugins.has(label)) plugins.set(label, new Map());
        plugins.get(label).set(h.key, h);
      } else if (h.source === "user") {
        user.set(h.key, h);
      } else {
        const label = base(g.cwd);
        if (!projects.has(label)) projects.set(label, new Map());
        projects.get(label).set(h.key, h);
      }
    }
  }
  const toList = (m) => [...m.values()].sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0));
  return {
    user: toList(user),
    plugins: [...plugins.entries()].map(([label, m]) => ({ label, hooks: toList(m) })),
    projects: [...projects.entries()].map(([label, m]) => ({ label, hooks: toList(m) })),
  };
}

function HookGroup({ label, count, hooks, open, onToggle }) {
  return (
    <div>
      <button
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-(--surface-hover)"
        onClick={onToggle}
      >
        <span className="min-w-0 truncate text-[13px]">{label}</span>
        <span className="flex shrink-0 items-center gap-1.5 text-[12px] text-(--fg-tertiary)">
          {count} hook{count === 1 ? "" : "s"}
          {open ? <IconChevronDown size={12} /> : <IconChevronRight size={12} />}
        </span>
      </button>
      {open && (
        <div className="border-t border-(--border-light) bg-(--surface) px-4 py-2">
          {hooks.map((h) => (
            <div key={h.key} className="flex items-baseline justify-between gap-3 py-1">
              <span className="font-mono text-[12px] text-(--fg-secondary)">{h.eventName}</span>
              <span className="truncate font-mono text-[11px] text-(--fg-faint)" title={h.command}>
                {h.command?.replace(/^"|"$/g, "")}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function HooksSection() {
  const gs = useStore((s) => s.gs);
  const [groups, setGroups] = useState(null);
  const [error, setError] = useState(null);
  const [open, setOpen] = useState({});

  useEffect(() => {
    let live = true;
    const local = gs["local-projects"] || {};
    const cwds = [...new Set(Object.values(local).flatMap((p) => p.rootPaths || []))];
    api
      .rpc("hooks/list", cwds.length ? { cwds } : {})
      .then((r) => live && setGroups(groupHooks(r?.data)))
      .catch((e) => live && setError(e.message));
    return () => {
      live = false;
    };
  }, [gs]);

  if (error) return <div className="text-[13px] text-(--fg-tertiary)">Hooks are not available: {error}</div>;
  if (!groups)
    return (
      <div className="flex justify-center py-6 text-(--fg-tertiary)">
        <Spinner />
      </div>
    );

  const toggle = (k) => setOpen((o) => ({ ...o, [k]: !o[k] }));
  let idx = 0;
  return (
    <>
      <div className="-mt-3 mb-4 text-[13px] text-(--fg-tertiary)">
        Manage lifecycle hooks from config and enabled plugins.{" "}
        <button className="text-(--accent) hover:underline" onClick={() => api.openExternal("https://developers.openai.com/codex/hooks")}>
          Learn more
        </button>
      </div>
      {groups.user.length > 0 && (
        <Card title="From Config">
          <HookGroup label="User config" count={groups.user.length} hooks={groups.user} open={!!open[idx]} onToggle={() => toggle(idx++)} />
        </Card>
      )}
      {groups.plugins.length > 0 && (
        <Card title="From Plugins">
          {groups.plugins.map((p) => (
            <HookGroup key={p.label} label={p.label} count={p.hooks.length} hooks={p.hooks} open={!!open[idx]} onToggle={() => toggle(idx++)} />
          ))}
        </Card>
      )}
      {groups.projects.length > 0 && (
        <Card title="From Projects">
          {groups.projects.map((p) => (
            <HookGroup key={p.label} label={p.label} count={p.hooks.length} hooks={p.hooks} open={!!open[idx]} onToggle={() => toggle(idx++)} />
          ))}
        </Card>
      )}
      {groups.user.length === 0 && groups.plugins.length === 0 && groups.projects.length === 0 && (
        <div className="px-1 text-[13px] text-(--fg-tertiary)">No hooks configured.</div>
      )}
    </>
  );
}
