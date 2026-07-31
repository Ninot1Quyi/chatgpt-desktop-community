// Floating pinned-summary panel (top-right of the thread view), matching the
// reference app: Environment (changes/machine/branch/commit/compare) for git
// cwds, Outputs (files produced), Subagents (dot summary), Sources (inputs).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@app/store.js";
import * as api from "@app/api.js";
import { basename } from "@app/lib/time.js";
import { Menu } from "@app/components/ui.jsx";
import {
  IconPlus, IconBranch, IconGlobe, LucideIcon,
} from "@app/components/icons.jsx";
import { FileIcon } from "./panel/FileIcon.jsx";
import { TAB_KINDS } from "./RightPanel.jsx";
import { openFileInPanel, usePanelStore } from "./state.js";
import { agentStatusLabel, summarizeAgentsFromConversation } from "./outputs-agents.mjs";

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"];

export default function OutputsPanel() {
  const conv = useStore((s) => (s.activeThreadId ? s.conversations[s.activeThreadId] : null));
  const cwd = conv?.thread?.cwd || useStore.getState().cwd || "";
  const git = useGitInfo(cwd, conv);
  const procs = useBackgroundTerminals(conv?.thread?.id);
  const { outputs, sources, agents } = useConversationItems(conv);
  const [agentsOpen, setAgentsOpen] = useState(false);

  return (
    <div
      className="fade-in absolute top-2 right-3 bottom-2 z-30 flex w-[300px] flex-col overflow-hidden rounded-2xl border border-(--border) bg-(--surface-raised)"
      style={{ boxShadow: "var(--shadow-menu)" }}
    >
      <div className="min-h-0 flex-1 overflow-y-auto px-2 pt-2 pb-3">
        {/* Environment (git cwds only) */}
        {git.hasGit && (
          <>
            <SectionHeader title="Environment" />
            <div className="flex flex-col">
              <Row
                icon={<LucideIcon name="Layers" size={14} />}
                label="Changes"
                trailing={
                  <span className="flex items-center gap-1.5 text-[12px]">
                    <span className="text-(--success)">+{(git.adds ?? 0).toLocaleString()}</span>
                    <span className="text-(--danger)">−{(git.dels ?? 0).toLocaleString()}</span>
                    <LucideIcon name="ChevronDown" size={12} className="text-(--fg-tertiary)" />
                  </span>
                }
                onClick={() => usePanelStore.getState().open("review")}
              />
              <MachineRow />
              <BranchRow git={git} />
              <Row
                icon={<LucideIcon name="GitCommitHorizontal" size={14} />}
                label="Commit or push"
                onClick={() => usePanelStore.getState().open("review")}
              />
              <Row
                icon={<LucideIcon name="GitCompareArrows" size={14} />}
                label="Compare branch"
                trailing={<LucideIcon name="ArrowUpRight" size={12} className="text-(--fg-tertiary)" />}
                onClick={() =>
                  useStore.getState().sendMessage("Compare this branch against the base branch and summarize the differences")
                }
              />
            </div>
          </>
        )}

        {/* Outputs (files the thread produced) */}
        {outputs.length > 0 && (
          <>
            <SectionHeader title="Outputs" plus onPlus={() => usePanelStore.getState().open("files")} />
            <div className="flex flex-col">
              {outputs.map((f) => (
                <FileRow key={f.path} item={f} />
              ))}
            </div>
          </>
        )}

        {/* Subagents (dot summary) */}
        {agents.total > 0 && (
          <>
            <SectionHeader title="Subagents" />
            <Row
              icon={<LucideIcon name="Users" size={14} />}
              label={
                <span className="flex items-center gap-2">
                  <AgentDots count={agents.working > 0 ? agents.working : 1} />
                  {agents.working > 0 && <span>{agents.working} working</span>}
                  <span className="text-(--fg-tertiary)">{agents.done} done</span>
                </span>
              }
              trailing={
                <LucideIcon
                  name="ChevronDown"
                  size={12}
                  className={`text-(--fg-tertiary) transition-transform ${agentsOpen ? "rotate-180" : ""}`}
                />
              }
              title={agentsOpen ? "Hide subagent details" : "Show subagent details"}
              ariaExpanded={agentsOpen}
              onClick={() => setAgentsOpen((open) => !open)}
            />
            {agentsOpen && <SubagentsDetails agents={agents.list} />}
          </>
        )}

        {/* Background processes */}
        {procs.length > 0 && (
          <>
            <SectionHeader title="Background processes" />
            {procs.map((p, i) => (
              <Row key={i} icon={<LucideIcon name="SquareTerminal" size={14} />} label={p} title={p} />
            ))}
          </>
        )}

        {/* Sources */}
        <SectionHeader title="Sources" plus onPlus={() => usePanelStore.getState().open("files")} />
        <div className="flex flex-col">
          {sources.length === 0 && <div className="px-3 pb-1 text-xs text-(--fg-faint)">No sources attached</div>}
          {sources.slice(0, 3).map((f) => (
            <SourceRow key={f.full} item={f} />
          ))}
          {sources.length > 0 && (
            <Row
              icon={<LucideIcon name="Compass" size={14} />}
              label="View all"
              onClick={() => usePanelStore.getState().open("files")}
            />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function SectionHeader({ title, plus, onPlus }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const items = ["review", "files", "sidechat", "browser", "terminal"].map((k) => ({
    id: k,
    label: TAB_KINDS[k].title,
    hint: TAB_KINDS[k].hint || undefined,
    icon: React.createElement(TAB_KINDS[k].icon, { size: 14 }),
    onSelect: () => usePanelStore.getState().open(k),
  }));
  return (
    <div className="flex h-7 items-center justify-between pl-2 pr-1 pt-1">
      <span className="text-xs font-medium text-(--fg-tertiary)">{title}</span>
      {plus && (
        <>
          <button
            ref={ref}
            title="Open side panel tab"
            className="flex h-5 w-5 items-center justify-center rounded-md text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
            onClick={() => setOpen(true)}
          >
            <IconPlus size={12} />
          </button>
          <Menu open={open} anchor={() => ref.current?.getBoundingClientRect()} items={items} onClose={() => setOpen(false)} width={248} align="start" />
        </>
      )}
    </div>
  );
}

function Row({ icon, label, trailing, title, onClick, ariaExpanded }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      title={typeof label === "string" ? title || label : title}
      onClick={onClick}
      aria-expanded={ariaExpanded}
      className={`flex h-[30px] w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-(--fg) ${onClick ? "hover:bg-(--surface-hover)" : ""}`}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-(--fg-tertiary)">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </Tag>
  );
}

function SubagentsDetails({ agents }) {
  return (
    <div className="mb-1 ml-6 flex flex-col border-l border-(--border-light) pl-2">
      {agents.map((agent) => (
        <div
          key={agent.id}
          className="flex min-h-[28px] items-center gap-2 rounded-md px-2 text-[12px] text-(--fg-secondary)"
          title={[agent.agentThreadId, agent.message].filter(Boolean).join(" · ")}
        >
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full ${
              agentStatusLabel(agent.status) === "working"
                ? "bg-(--accent)"
                : agentStatusLabel(agent.status) === "failed"
                  ? "bg-(--danger)"
                  : "bg-(--fg-faint)"
            }`}
          />
          <span className="min-w-0 flex-1 truncate">{agent.name}</span>
          <span className="shrink-0 text-(--fg-tertiary)">{agentStatusLabel(agent.status)}</span>
        </div>
      ))}
    </div>
  );
}

function AgentDots({ count }) {
  const colors = ["#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#40c977"];
  const n = Math.min(5, Math.max(1, count));
  return (
    <span className="flex -space-x-1">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="h-2.5 w-2.5 rounded-full border border-(--surface-raised)" style={{ background: colors[i % colors.length] }} />
      ))}
    </span>
  );
}

function FileRow({ item }) {
  const isImage = item.kind === "image" || IMAGE_EXTS.some((e) => item.path.toLowerCase().endsWith(e));
  return (
    <button
      className="flex h-[30px] w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-(--fg) hover:bg-(--surface-hover)"
      title={item.path}
      onClick={() => openFileInPanel(item.path)}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">
        {isImage ? (
          <img src={api.localFileUrl(item.path)} className="h-4 w-4 rounded-sm object-cover" alt="" />
        ) : (
          <FileIcon name={basename(item.path)} size={14} />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{basename(item.path)}</span>
    </button>
  );
}

function SourceRow({ item }) {
  return (
    <button
      className="flex h-[30px] w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-(--fg) hover:bg-(--surface-hover)"
      title={item.full}
      onClick={() => (item.url ? api.openExternal(item.full) : item.icon ? null : openFileInPanel(item.full))}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-(--fg-tertiary)">
        {item.icon === "sparkle" ? (
          <LucideIcon name="Sparkles" size={13} />
        ) : item.icon === "globe" || item.url ? (
          <IconGlobe size={13} />
        ) : (
          <FileIcon name={item.name} size={14} />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
    </button>
  );
}

// Machine row: "Local" plus paired remote hosts (display only).
// Stable empty fallback: a fresh [] per getSnapshot call loops useSyncExternalStore.
const NO_REMOTES = [];

function MachineRow() {
  const remotes = useStore((s) => s.gs?.["codex-managed-remote-connections"] || NO_REMOTES);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const items = [
    { id: "local", label: "Local", icon: <LucideIcon name="Monitor" size={14} />, checked: true },
    ...remotes.map((r) => ({ id: r.hostId, label: r.displayName || r.hostId, icon: <IconGlobe size={14} />, disabled: true })),
  ];
  return (
    <>
      <RowWithRef
        refEl={ref}
        icon={<LucideIcon name="Monitor" size={14} />}
        label="Local"
        trailing={<LucideIcon name="ChevronDown" size={12} className="text-(--fg-tertiary)" />}
        onClick={() => setOpen(true)}
      />
      <Menu open={open} anchor={() => ref.current?.getBoundingClientRect()} items={items} onClose={() => setOpen(false)} width={248} align="start" />
    </>
  );
}

function BranchRow({ git }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const items = (git.branches || []).map((b) => ({
    id: b,
    label: b,
    icon: <IconBranch size={14} />,
    checked: b === git.branch,
  }));
  return (
    <>
      <RowWithRef
        refEl={ref}
        icon={<IconBranch size={14} />}
        label={git.branch || "Branch"}
        trailing={<LucideIcon name="ChevronDown" size={12} className="text-(--fg-tertiary)" />}
        onClick={() => items.length && setOpen(true)}
      />
      <Menu open={open} anchor={() => ref.current?.getBoundingClientRect()} items={items} onClose={() => setOpen(false)} width={248} align="start" />
    </>
  );
}

// Row with a forwarded anchor ref (for menus).
function RowWithRef({ refEl, icon, label, trailing, onClick }) {
  return (
    <button
      ref={refEl}
      title={typeof label === "string" ? label : undefined}
      onClick={onClick}
      className="flex h-[30px] w-full items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-(--fg) hover:bg-(--surface-hover)"
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-(--fg-tertiary)">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------
function useGitInfo(cwd, conv) {
  const [info, setInfo] = useState({ hasGit: false, branch: null, adds: null, dels: null, branches: [] });
  useEffect(() => {
    let live = true;
    if (!cwd) { setInfo({ hasGit: false, branch: null, adds: null, dels: null, branches: [] }); return undefined; }
    const run = async () => {
      const [inR, branchR, statR, branchesR] = await Promise.all([
        api.rpc("command/exec", { command: ["git", "rev-parse", "--is-inside-work-tree"], cwd, timeoutMs: 8000 }).catch(() => null),
        api.rpc("command/exec", { command: ["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd, timeoutMs: 8000 }).catch(() => null),
        api.rpc("command/exec", { command: ["git", "diff", "HEAD", "--shortstat"], cwd, timeoutMs: 15000 }).catch(() => null),
        api.rpc("command/exec", { command: ["git", "branch", "--list", "--format=%(refname:short)"], cwd, timeoutMs: 8000 }).catch(() => null),
      ]);
      if (!live) return;
      const out = (r) => String(r?.stdout ?? r?.output ?? "");
      const hasGit = out(inR).trim() === "true";
      const branch = out(branchR).split("\n")[0].trim() || conv?.thread?.gitInfo?.branch || null;
      let adds = null, dels = null;
      const mi = out(statR).match(/(\d+) insertion/);
      const md = out(statR).match(/(\d+) deletion/);
      if (mi) adds = Number(mi[1]);
      if (md) dels = Number(md[1]);
      const branches = out(branchesR).split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 30);
      setInfo({ hasGit, branch, adds: adds ?? 0, dels: dels ?? 0, branches });
    };
    run();
    const t = setInterval(run, 15000);
    return () => { live = false; clearInterval(t); };
  }, [cwd, conv?.thread?.gitInfo?.branch]);
  return info;
}

function useBackgroundTerminals(threadId) {
  const [procs, setProcs] = useState([]);
  useEffect(() => {
    let live = true;
    if (!threadId) { setProcs([]); return undefined; }
    const load = () =>
      api.rpc("thread/backgroundTerminals/list", { threadId })
        .then((r) => {
          if (!live) return;
          const list = r?.terminals || r?.data || r || [];
          const rows = (Array.isArray(list) ? list : [])
            .map((t) => t.command || t.cmd || t.title || "")
            .map((c) => (Array.isArray(c) ? c.join(" ") : String(c)).trim())
            .filter(Boolean);
          setProcs(rows.slice(0, 6));
        })
        .catch(() => live && setProcs([]));
    load();
    const t = setInterval(load, 10000);
    return () => { live = false; clearInterval(t); };
  }, [threadId]);
  return procs;
}

// Outputs (produced files), Sources (attached/read files + URLs), agent counts.
// working = agents started in the still-active turn; everything else is done.
function useConversationItems(conv) {
  return useMemo(() => {
    const outs = new Map();
    const srcs = new Map();
    const agents = summarizeAgentsFromConversation(conv);
    const pushFile = (map, p, kind) => {
      if (!p || typeof p !== "string") return;
      const full = p.startsWith("/") ? p : conv?.thread?.cwd ? `${conv.thread.cwd.replace(/\/+$/, "")}/${p}` : p;
      if (!full.startsWith("/") || map.has(full)) return;
      map.set(full, { path: full, kind });
    };
    const pushUrl = (u) => {
      if (!u || !/^https?:\/\//.test(u)) return;
      if (srcs.has(u)) return;
      let name = u;
      try { const x = new URL(u); name = x.hostname + (x.pathname !== "/" ? x.pathname : ""); } catch {}
      srcs.set(u, { name: name.slice(0, 60), full: u, url: true });
    };
    for (const turn of conv?.turns || []) {
      for (const item of turn.items || []) {
        if (item.type === "fileChange") {
          for (const c of item.changes || item.files || []) pushFile(outs, c.path || c.file || c.filename, "edited");
        } else if (item.type === "imageGeneration" && item.savedPath) {
          outs.set(item.savedPath, { path: item.savedPath, kind: "image" });
        } else if (item.type === "userMessage") {
          for (const c of item.content || []) {
            if (c.type === "localImage" && c.path) pushFile(srcs, c.path, "image");
            if ((c.type === "mention" || c.type === "skill") && c.path) pushFile(srcs, c.path, "file");
            if (c.type === "skill" && (c.name || c.skillName)) {
              const key = `skill:${c.name || c.skillName}`;
              if (!srcs.has(key)) srcs.set(key, { name: c.name || c.skillName, full: key, icon: "sparkle" });
            }
          }
        } else if (item.type === "webSearch") {
          if (item.action?.url) pushUrl(item.action.url);
          if (!srcs.has("web:search")) srcs.set("web:search", { name: "Web search", full: "web:search", icon: "globe" });
        }
        const cmd = item.command || item.input?.command;
        if (typeof cmd === "string") {
          for (const m of cmd.matchAll(/https?:\/\/[^\s"']+/g)) pushUrl(m[0]);
        }
      }
    }
    return {
      outputs: [...outs.values()],
      sources: [...srcs.values()],
      agents,
    };
  }, [conv?.turns, conv?.thread?.cwd, conv?.activeTurnId]);
}
