// Environment panel — the right panel's default (no-tabs) content for a
// project context, replicating the reference app: Changes / machine / repo /
// commit rows, then Background processes and Sources sections.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "../../store.js";
import * as api from "../../api.js";
import { basename } from "../../lib/time.js";
import { Menu } from "../ui.jsx";
import { IconPlus, IconBranch, IconGlobe } from "../icons.jsx";
import { LucideIcon } from "../lucide/index.jsx";
import { FileIcon } from "./FileIcon.jsx";
import { openFileInPanel, usePanelStore, TAB_KINDS } from "../RightPanel.jsx";

// ---------------------------------------------------------------------------
// Row icons (Lucide, same as the reference app).
// ---------------------------------------------------------------------------
const IconLayers = (p) => <LucideIcon name="Layers" size={15} {...p} />;
const IconComputer = (p) => <LucideIcon name="Monitor" size={15} {...p} />;
const IconCommit = (p) => <LucideIcon name="GitCommitHorizontal" size={15} {...p} />;
const IconGithub = (p) => <LucideIcon name="Github" size={15} {...p} />;
const IconProcess = (p) => <LucideIcon name="SquareTerminal" size={15} {...p} />;
const IconChevronDownS = (p) => <LucideIcon name="ChevronDown" size={13} {...p} />;
const IconCompass = (p) => <LucideIcon name="Compass" size={15} {...p} />;
const IconAgents = (p) => <LucideIcon name="Users" size={15} {...p} />;

// ---------------------------------------------------------------------------
export default function EnvironmentPanel({ cwd, hasGit }) {
  const conv = useStore((s) => (s.activeThreadId ? s.conversations[s.activeThreadId] : null));
  const git = useGitInfo(cwd, hasGit);
  const procs = useBackgroundTerminals(conv?.thread?.id);
  const gh = useGhStatus(cwd);
  const sources = useSources(conv);
  const agents = useSubagentCounts(conv);

  return (
    <div className="flex h-full w-full flex-col bg-(--surface)">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-6 pb-4">
        {/* header */}
        <div className="flex h-7 items-center justify-between pl-3 pr-1">
          <span className="text-[13px] font-medium text-(--fg-tertiary)">Environment</span>
          <EnvPlusMenu />
        </div>

        {/* environment rows */}
        <div className="mt-1 flex flex-col">
          {hasGit && (
            <Row
              icon={<IconLayers size={15} />}
              label="Changes"
              trailing={
                <span className="flex items-center gap-2 text-[12px]">
                  {git.adds != null && <span className="text-(--success)">+{git.adds.toLocaleString()}</span>}
                  {git.dels != null && <span className="text-(--danger)">−{git.dels.toLocaleString()}</span>}
                  <IconChevronDownS size={13} className="text-(--fg-tertiary)" />
                </span>
              }
              onClick={() => usePanelStore.getState().open("review")}
            />
          )}
          <MachineRow />
          {hasGit && <RepoRow git={git} />}
          {hasGit && (
            <Row
              icon={<IconCommit size={15} />}
              label="Commit or push"
              onClick={() => usePanelStore.getState().open("review")}
            />
          )}
          {gh === false && (
            <Row icon={<IconGithub size={15} />} label="GitHub CLI not authenticated" dimmed />
          )}
        </div>

        {/* subagents */}
        {agents.total > 0 && (
          <>
            <SectionLabel>Subagents</SectionLabel>
            <Row
              icon={<IconAgents size={15} />}
              label={
                <span className="flex items-center gap-2">
                  <Dots working={agents.working} done={agents.done} />
                  <span>{agents.working} working</span>
                  <span className="text-(--fg-tertiary)">{agents.done} done</span>
                </span>
              }
              trailing={<IconChevronDownS size={13} className="text-(--fg-tertiary)" />}
            />
          </>
        )}

        {/* background processes */}
        {procs.length > 0 && (
          <>
            <SectionLabel>Background processes</SectionLabel>
            <div className="flex flex-col">
              {procs.map((p, i) => (
                <Row key={i} icon={<IconProcess size={15} />} label={p} title={p} dimmed={false} />
              ))}
            </div>
          </>
        )}

        {/* sources */}
        {sources.length > 0 && (
          <>
            <div className="flex h-7 items-center justify-between pl-3 pr-1 pt-6">
              <span className="text-[13px] font-medium text-(--fg-tertiary)">Sources</span>
              <button
                title="Add source"
                className="flex h-6 w-6 items-center justify-center rounded-md text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
                onClick={() => usePanelStore.getState().open("files")}
              >
                <IconPlus size={14} />
              </button>
            </div>
            <div className="flex flex-col">
              {sources.slice(0, 3).map((f) => (
                <Row
                  key={f.full}
                  icon={f.url ? <IconGlobe size={14} /> : <FileIcon name={f.name} size={14} />}
                  label={f.name}
                  title={f.full}
                  onClick={() => (f.url ? api.openExternal(f.full) : openFileInPanel(f.full))}
                />
              ))}
              {sources.length > 3 && (
                <Row
                  icon={<IconCompass size={15} />}
                  label="View all"
                  onClick={() => usePanelStore.getState().open("files")}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
function SectionLabel({ children }) {
  return <div className="pl-3 pt-6 pb-1 text-[13px] font-medium text-(--fg-tertiary)">{children}</div>;
}

function Row({ icon, label, trailing, dimmed, title, onClick, btnRef }) {
  const Tag = onClick ? "button" : "div";
  return (
    <Tag
      ref={btnRef}
      title={typeof label === "string" ? title || label : title}
      onClick={onClick}
      className={`flex h-[30px] w-full items-center gap-2.5 rounded-md pl-3 pr-2 text-left text-[13px] ${
        dimmed ? "text-(--fg-faint)" : "text-(--fg)"
      } ${onClick ? "hover:bg-(--surface-hover)" : ""}`}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center text-(--fg-tertiary)">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {trailing}
    </Tag>
  );
}

// Colored subagent dots (up to a few), like the reference cluster.
function Dots({ working, done }) {
  const colors = ["#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6"];
  const n = Math.min(4, working > 0 ? Math.min(working, 4) : 0);
  if (n === 0) return <span className="h-2 w-2 rounded-full bg-(--success)" />;
  return (
    <span className="flex -space-x-1">
      {Array.from({ length: n }, (_, i) => (
        <span key={i} className="h-2.5 w-2.5 rounded-full border border-(--surface-under)" style={{ background: colors[i % colors.length] }} />
      ))}
    </span>
  );
}

// ---------------------------------------------------------------------------
// "+" in the Environment header: the tab-type menu (same as the tab strip's).
// ---------------------------------------------------------------------------
function EnvPlusMenu() {
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
    <>
      <button
        ref={ref}
        title="Open side panel tab"
        className="flex h-6 w-6 items-center justify-center rounded-md text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
        onClick={() => setOpen(true)}
      >
        <IconPlus size={14} />
      </button>
      <Menu open={open} anchor={() => ref.current?.getBoundingClientRect()} items={items} onClose={() => setOpen(false)} width={248} align="start" />
    </>
  );
}

// Machine row: "Local" plus any paired remote hosts (display only).
// Stable empty fallback: a fresh [] per getSnapshot call loops useSyncExternalStore.
const NO_REMOTES = [];

function MachineRow() {
  const remotes = useStore((s) => s.gs?.["codex-managed-remote-connections"] || NO_REMOTES);
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const items = [
    { id: "local", label: "Local", icon: <IconComputer size={14} />, checked: true },
    ...remotes.map((r) => ({ id: r.hostId, label: r.displayName || r.hostId, icon: <IconGlobe size={14} />, disabled: true })),
  ];
  return (
    <>
      <Row
        btnRef={ref}
        icon={<IconComputer size={15} />}
        label="Local"
        trailing={<IconChevronDownS size={13} className="text-(--fg-tertiary)" />}
        onClick={() => setOpen(true)}
      />
      <Menu open={open} anchor={() => ref.current?.getBoundingClientRect()} items={items} onClose={() => setOpen(false)} width={248} align="start" />
    </>
  );
}

// Repo row: repository name from the thread/origin, branch list menu.
function RepoRow({ git }) {
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
      <Row
        btnRef={ref}
        icon={<IconBranch size={15} />}
        label={git.repo || git.branch || "Repository"}
        trailing={<IconChevronDownS size={13} className="text-(--fg-tertiary)" />}
        onClick={() => items.length && setOpen(true)}
      />
      <Menu open={open} anchor={() => ref.current?.getBoundingClientRect()} items={items} onClose={() => setOpen(false)} width={248} align="start" />
    </>
  );
}

// ---------------------------------------------------------------------------
// Data hooks
// ---------------------------------------------------------------------------
function useGitInfo(cwd, hasGit) {
  const conv = useStore((s) => (s.activeThreadId ? s.conversations[s.activeThreadId] : null));
  const [info, setInfo] = useState({ branch: null, repo: null, adds: null, dels: null, branches: [] });
  useEffect(() => {
    let live = true;
    if (!cwd || !hasGit) { setInfo({ branch: null, repo: null, adds: null, dels: null, branches: [] }); return undefined; }
    const run = async () => {
      const [branchR, statR, branchesR] = await Promise.all([
        api.rpc("command/exec", { command: ["git", "rev-parse", "--abbrev-ref", "HEAD"], cwd, timeoutMs: 8000 }).catch(() => null),
        api.rpc("command/exec", { command: ["git", "diff", "HEAD", "--shortstat"], cwd, timeoutMs: 15000 }).catch(() => null),
        api.rpc("command/exec", { command: ["git", "branch", "--list", "--format=%(refname:short)"], cwd, timeoutMs: 8000 }).catch(() => null),
      ]);
      if (!live) return;
      const out = (r) => String(r?.stdout ?? r?.output ?? "");
      const branch = out(branchR).split("\n")[0].trim() || conv?.thread?.gitInfo?.branch || null;
      // repo name: origin url basename, else the branch context
      let repo = null;
      const origin = conv?.thread?.gitInfo?.originUrl || "";
      if (origin) repo = basename(origin.replace(/\.git$/, ""));
      // shortstat: " 3 files changed, 10 insertions(+), 2 deletions(-)"
      let adds = null, dels = null;
      const mi = out(statR).match(/(\d+) insertion/);
      const md = out(statR).match(/(\d+) deletion/);
      if (mi) adds = Number(mi[1]);
      if (md) dels = Number(md[1]);
      if (adds != null || dels != null) { adds = adds ?? 0; dels = dels ?? 0; }
      const branches = out(branchesR).split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 30);
      setInfo({ branch, repo, adds, dels, branches });
    };
    run();
    const t = setInterval(run, 15000);
    return () => { live = false; clearInterval(t); };
  }, [cwd, hasGit, conv?.thread?.gitInfo?.originUrl, conv?.thread?.gitInfo?.branch]);
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

let ghCache = null;
function useGhStatus(cwd) {
  const [ok, setOk] = useState(ghCache);
  useEffect(() => {
    let live = true;
    if (!cwd) return undefined;
    api.rpc("command/exec", { command: ["gh", "auth", "status"], cwd, timeoutMs: 8000 })
      .then((r) => {
        const text = `${r?.stdout ?? ""}\n${r?.stderr ?? ""}`;
        const code = r?.exitCode ?? r?.exit_code ?? (r?.status === "completed" ? 0 : 1);
        const authed = code === 0 && /Logged in/i.test(text);
        ghCache = authed;
        if (live) setOk(authed);
      })
      .catch(() => { ghCache = false; live && setOk(false); });
    return () => { live = false; };
  }, [cwd]);
  return ok;
}

// Files and links the thread touched: attachments + fileChange paths + tool
// file reads + URLs, deduped, most-recent first.
function useSources(conv) {
  return useMemo(() => {
    const out = [];
    const seen = new Set();
    const pushFile = (p) => {
      if (!p || typeof p !== "string" || seen.has(p)) return;
      if (!p.startsWith("/")) return;
      seen.add(p);
      out.push({ name: basename(p), full: p, url: false });
    };
    const pushUrl = (u) => {
      if (!u || typeof u !== "string" || seen.has(u)) return;
      if (!/^https?:\/\//.test(u)) return;
      seen.add(u);
      let host = u;
      try { const x = new URL(u); host = x.hostname + (x.pathname !== "/" ? x.pathname : ""); } catch {}
      out.push({ name: host.slice(0, 60), full: u, url: true });
    };
    for (const turn of conv?.turns || []) {
      for (const item of turn.items || []) {
        if (item.type === "fileChange") {
          for (const c of item.changes || item.files || []) pushFile(c.path || c.file || c.filename);
        }
        if (item.type === "attachment" || item.type === "localImage") pushFile(item.path || item.filePath);
        if (item.type === "webSearch") {
          if (item.action?.url) pushUrl(item.action.url);
        }
        const cmd = item.command || item.input?.command;
        if (typeof cmd === "string") {
          for (const m of cmd.matchAll(/(?:^|\s)(\/[^\s"']+\.[a-zA-Z0-9]{1,8})/g)) pushFile(m[1]);
          for (const m of cmd.matchAll(/https?:\/\/[^\s"']+/g)) pushUrl(m[0]);
        }
      }
    }
    return out;
  }, [conv?.turns]);
}

function useSubagentCounts(conv) {
  return useMemo(() => {
    let working = 0, done = 0;
    for (const turn of conv?.turns || []) {
      for (const item of turn.items || []) {
        if (item.type !== "subAgentActivity") continue;
        if (item.kind === "started" || item.kind === "interacted") working += 1;
        else if (item.kind === "interrupted" || item.kind === "finished") done += 1;
      }
    }
    return { working, done, total: working + done };
  }, [conv?.turns]);
}
