// Context tab: Outputs (files the thread produced) and Sources (input
// materials) sections, like the reference side panel's default view.
import React, { useMemo, useState } from "react";
import { useStore } from "../../store.js";
import { localFileUrl, showItemInFolder, openPath } from "../../api.js";
import { basename } from "../../lib/time.js";
import { cx } from "../../lib/cx.js";
import { IconFile, IconImage, IconFolder, IconChevronDown } from "../icons.jsx";
import { EmptyState } from "./common.jsx";

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|ico|bmp)$/i;
const COLLAPSED = 5;

export default function ContextTab() {
  const conv = useStore((s) => (s.activeThreadId ? s.conversations[s.activeThreadId] : null));

  const { outputs, sources } = useMemo(() => {
    const outs = new Map();
    const srcs = new Map();
    for (const turn of conv?.turns || []) {
      for (const item of turn.items || []) {
        if (item.type === "fileChange") {
          for (const c of item.changes || []) {
            const p = absolutize(c.path, conv?.thread?.cwd);
            if (!outs.has(p)) outs.set(p, { path: p, kind: "edited" });
          }
        } else if (item.type === "imageGeneration" && item.savedPath) {
          outs.set(item.savedPath, { path: item.savedPath, kind: "image" });
        } else if (item.type === "userMessage") {
          for (const c of item.content || []) {
            if (c.type === "localImage" && c.path) srcs.set(c.path, { path: c.path, kind: "image" });
            if ((c.type === "mention" || c.type === "skill") && c.path) srcs.set(c.path, { path: c.path, kind: "file" });
          }
        }
      }
    }
    return { outputs: [...outs.values()], sources: [...srcs.values()] };
  }, [conv?.turns, conv?.thread?.cwd]);

  if (!conv?.thread) return <EmptyState text="Open a chat to see its context" />;
  if (!outputs.length && !sources.length) {
    return <EmptyState text="No files yet" sub="Files created or used in this chat will appear here" />;
  }

  return (
    <div className="h-full overflow-y-auto">
      <FileSection title="Outputs" items={outputs} empty="Nothing produced yet" />
      <FileSection title="Sources" items={sources} empty="No sources attached" />
    </div>
  );
}

function FileSection({ title, items, empty }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? items : items.slice(0, COLLAPSED);
  return (
    <div className="border-b border-(--border-light) pb-1">
      <div className="px-3 pt-2.5 pb-1 text-xs font-medium text-(--fg-tertiary)">{title}</div>
      {items.length === 0 && <div className="px-3 pb-2 text-xs text-(--fg-faint)">{empty}</div>}
      {visible.map((it) => (
        <Row key={it.path} item={it} />
      ))}
      {items.length > COLLAPSED && (
        <button
          className="flex items-center gap-1 px-3 py-1 text-xs text-(--fg-tertiary) hover:text-(--fg)"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? "Show less" : `Show ${items.length - COLLAPSED} more`}
          <IconChevronDown size={11} className={cx("transition-transform", expanded && "rotate-180")} />
        </button>
      )}
    </div>
  );
}

function Row({ item }) {
  const isImage = item.kind === "image" || IMAGE_EXT.test(item.path);
  return (
    <div className="group flex items-center gap-2 px-3 py-1.5 hover:bg-(--surface-hover)">
      <span className="shrink-0 text-(--fg-tertiary)">
        {isImage ? <IconImage size={14} /> : <IconFile size={14} />}
      </span>
      <button
        className="min-w-0 flex-1 truncate text-left text-[13px] hover:underline"
        title={item.path}
        onClick={() => openPath(item.path)}
      >
        {isImage ? (
          <span className="flex items-center gap-2">
            <img src={localFileUrl(item.path)} className="h-6 w-6 rounded object-cover" alt="" />
            <span className="truncate">{basename(item.path)}</span>
          </span>
        ) : (
          basename(item.path)
        )}
      </button>
      <button
        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-(--fg-tertiary) hover:bg-(--surface-active) hover:text-(--fg) group-hover:flex"
        title="Reveal in Finder"
        onClick={() => showItemInFolder(item.path)}
      >
        <IconFolder size={12} />
      </button>
    </div>
  );
}

function absolutize(p, cwd) {
  if (!p) return p;
  if (p.startsWith("/")) return p;
  return cwd ? `${cwd.replace(/\/+$/, "")}/${p}` : p;
}
