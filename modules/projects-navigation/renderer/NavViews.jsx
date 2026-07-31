// Secondary nav views: Pull requests / Scheduled / Plugins.
// These mirror the reference app's pages with honest, data-backed content.
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore } from "@app/store.js";
import * as api from "@app/api.js";
import { cx } from "@app/lib/cx.js";
import { basename } from "@app/lib/time.js";
import { useT } from "@app/i18n.jsx";
import { Spinner, Menu } from "@app/components/ui.jsx";
import { IconPlus, IconSearch, IconMore, IconChevronDown, IconNavSites, IconSkillCube, IconSkillCheck, IconDialogX, IconDots21, IconTryChat, IconPluginFallback } from "@app/components/icons.jsx";
import { LucideIcon } from "@app/components/lucide/index.jsx";
import { Markdown } from "@modules/conversations";
import { runtimeMeta } from "@modules/agent-runtimes";
import { openFileInPanel } from "@modules/workspace-panels/state";
import {
  pluginInstallDescriptor,
  pluginRequestParams,
} from "./plugin-rpc.mjs";

const toast = (message) => useStore.getState().toast(message);

export default function NavViews() {
  const navView = useStore((s) => s.ui.navView);
  switch (navView) {
    case "sites": return <SitesView />;
    case "scheduled": return <ScheduledView />;
    case "plugins": return <PluginsView />;
    case "pull-requests": return <PullRequestsView />;
    default: return null;
  }
}

function createSiteDraft() {
  useStore.getState().newChatWithPrefill(
    "Create a website that …",
    [{ kind: "site", name: "Sites", displayName: "Sites" }],
  );
}

function SitesView() {
  const t = useT();
  const [query, setQuery] = useState("");
  const [plugins, setPlugins] = useState(null);
  const [error, setError] = useState(null);
  const sitesPlugin = useMemo(
    () => (plugins || []).find((plugin) => pluginSlug(plugin) === "sites" || pluginName(plugin).toLowerCase() === "sites"),
    [plugins],
  );
  const visibleSitesPlugin = sitesPlugin
    && (!query.trim() || pluginName(sitesPlugin).toLowerCase().includes(query.trim().toLowerCase()));

  useEffect(() => {
    let live = true;
    const load = () =>
      api.rpc("plugin/list", {})
        .then((result) => {
          if (!live) return;
          setPlugins(flattenPluginList(result));
          setError(null);
        })
        .catch((err) => {
          if (!live) return;
          setPlugins([]);
          setError(err.message);
        });
    load();
    window.addEventListener("sites:reload", load);
    return () => {
      live = false;
      window.removeEventListener("sites:reload", load);
    };
  }, []);

  const openSitesPlugin = () => {
    if (!sitesPlugin) {
      createSiteDraft();
      return;
    }
    const iface = sitesPlugin.interface || {};
    if (iface.websiteUrl) {
      api.openExternal(iface.websiteUrl);
      return;
    }
    const prompts = Array.isArray(iface.defaultPrompt) ? iface.defaultPrompt : [iface.defaultPrompt];
    useStore.getState().newChatWithPrefill(
      (prompts.find(Boolean) || "Create a website that ") + " ",
      sitesPlugin.installed
        ? [{ kind: "skill", name: pluginSlug(sitesPlugin), displayName: pluginName(sitesPlugin), path: sitesPlugin.source?.path || "", icon: iface.composerIcon || iface.logo || null }]
        : [{ kind: "site", name: "Sites", displayName: "Sites" }],
    );
  };

  return (
    <PageShell title="Sites">
      <div className="flex min-h-full w-full flex-col">
        <div className="mx-auto w-full max-w-[768px] px-5 pt-5">
          <div className="flex items-start justify-between gap-4 px-2">
            <div className="flex min-w-0 flex-col gap-2">
              <h1 className="text-[28px] leading-[33.6px] font-normal text-(--fg)">{t("Sites")}</h1>
              <div className="text-[16px] leading-6 text-(--fg-secondary)">
                {t("Turn your ideas into live websites.")}
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-[768px] items-center gap-2 px-5 pt-5 pb-2">
          <label className="app-no-drag flex h-8 min-w-0 flex-1 items-center gap-2 rounded-full border border-(--border-heavy) bg-(--input-bg) px-2.5">
            <IconSearch size={16} className="shrink-0 text-(--fg-tertiary)" />
            <input
              id="appgen-site-search"
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("Search sites")}
              className="min-w-0 flex-1 bg-transparent text-[14px] leading-[18px] text-(--fg) outline-none placeholder:text-(--fg-faint)"
            />
          </label>
        </div>

        <div className="mx-auto flex min-h-0 w-full max-w-[768px] flex-1 flex-col px-5 pt-6 pb-5">
          <div className="mx-auto flex min-h-[420px] w-full max-w-[728px] flex-col items-center justify-center px-3 py-6">
            <div className="flex w-full max-w-xl flex-col items-center justify-center gap-3 text-center">
              <div className="pointer-events-none flex items-center justify-center text-(--fg-secondary)">
                <IconNavSites size={32} />
              </div>
              <div className="flex flex-col items-center gap-2">
                <div className="text-[16px] leading-6 font-medium text-(--fg)">{t("No sites yet")}</div>
              </div>
              <div className="flex w-full flex-wrap items-center justify-center gap-2">
                {visibleSitesPlugin && (
                  <button
                    type="button"
                    className="app-no-drag flex h-8 items-center gap-2 rounded-[12.5px] border border-(--border) bg-(--surface-under) px-3 text-[14px] leading-[18px] text-(--fg) hover:bg-(--surface-hover)"
                    onClick={openSitesPlugin}
                  >
                    <PluginIcon plugin={sitesPlugin} size={18} />
                    {t("Open Sites")}
                  </button>
                )}
                <button
                  type="button"
                  className="app-no-drag flex h-8 items-center rounded-[12.5px] border border-(--border) bg-(--surface-hover) px-4 text-[14px] leading-[18px] text-(--fg) hover:bg-(--surface-active)"
                  onClick={createSiteDraft}
                >
                  {t("Create new site")}
                </button>
              </div>
              {error && (
                <div className="max-w-md text-[12px] leading-5 text-(--fg-faint)">
                  {t("Sites plugin status unavailable: {error}", { error })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}

function flattenPluginList(result) {
  const flat = [];
  for (const marketplace of result?.marketplaces || []) {
    for (const plugin of marketplace.plugins || []) {
      flat.push({ ...plugin, _marketplace: marketplace.name, _marketplacePath: marketplace.path });
    }
  }
  return flat;
}

function PageShell({ title, children }) {
  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-(--border-light)">{children}</div>
    </div>
  );
}

function SimpleView({ title, desc }) {
  return (
    <PageShell title={title}>
      <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
        <div className="text-[14px] text-(--fg-tertiary)">{desc}</div>
      </div>
    </PageShell>
  );
}

// ---------------------------------------------------------------------------
// Pull requests: query PRs across the user's project repos via `gh`.
// Master-detail layout: filterable list on the left, detail pane on the right.
// ---------------------------------------------------------------------------

// GitHub login for the Reviewing/Authored filters; fetched once and cached.
let ghLoginPromise = null;
function getGhLogin() {
  ghLoginPromise ??= api
    .rpc("command/exec", { command: ["gh", "api", "user", "--jq", ".login"], timeoutMs: 15000 })
    .then((r) => (r?.stdout ?? r?.output ?? "").trim() || null)
    .catch(() => null);
  return ghLoginPromise;
}

// Resume (or reuse) a thread so connector tool calls have a live thread id.
async function connectorThreadId() {
  const active = useStore.getState().activeThreadId;
  if (active) return active;
  const tl = await api.rpc("thread/list", {
    cursor: null,
    limit: 1,
    useStateDbOnly: true,
  }).catch(() => null);
  const tid = tl?.data?.[0]?.id || tl?.threads?.[0]?.id;
  if (!tid) return null;
  await api.rpc("thread/resume", { threadId: tid }).catch(() => {});
  return tid;
}

// Normalize github.search_prs results into inbox rows.
function parsePrSearch(r) {
  let data = r?.structuredContent ?? null;
  if (!data) {
    const text = r?.content?.[0]?.text;
    if (typeof text === "string" && (text.startsWith("{") || text.startsWith("["))) {
      try { data = JSON.parse(text); } catch { data = null; }
    }
  }
  const list = data?.pullRequests || data?.prs || data?.items || data?.results || (Array.isArray(data) ? data : []);
  return (list || []).map((p) => ({
    number: p.number,
    title: p.title,
    url: p.url || p.html_url,
    state: p.merged || p.state === "merged" ? "MERGED" : (p.state || "open").toUpperCase(),
    headRefName: p.headRefName || p.head?.ref || p.headBranch,
    updatedAt: p.updatedAt || p.updated_at,
    isDraft: !!(p.isDraft ?? p.draft),
    author: { login: p.author?.login || p.user?.login, avatarUrl: p.author?.avatarUrl || p.author?.avatar_url || p.user?.avatar_url },
    repo: p.repository?.full_name || p.repositoryFullName || p.repo,
    additions: p.additions,
    deletions: p.deletions,
    reviewRequests: p.reviewRequests || [],
  })).filter((p) => p.url);
}

function PullRequestsView() {
  const t = useT();
  const threads = useStore((s) => s.threads);
  const [prs, setPrs] = useState(null);
  const [errors, setErrors] = useState(0);
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState("all"); // all | reviewing | authored
  const [query, setQuery] = useState("");
  const [stateFilter, setStateFilter] = useState("all"); // all | OPEN | MERGED | CLOSED
  const [filterOpen, setFilterOpen] = useState(false);
  const filterRef = useRef(null);
  const [selectedUrl, setSelectedUrl] = useState(null);

  // Distinct repo cwds from the thread list.
  const repos = useMemo(() => {
    const set = new Set();
    for (const t of threads) if (t.gitInfo?.originUrl || t.cwd) set.add(t.cwd);
    return [...set].filter(Boolean).slice(0, 8);
  }, [threads]);

  useEffect(() => {
    let live = true;
    getGhLogin().then((login) => live && setMe(login));
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    (async () => {
      // Primary source: the GitHub connector (same one the reference inbox
      // uses — works without a locally authenticated gh). It answers global
      // searches like author:@me and review-requested:@me.
      const tid = await connectorThreadId();
      if (tid) {
        try {
          const out = [];
          for (const q of ["author:@me", "review-requested:@me", "reviewed-by:@me"]) {
            const r = await api.rpc("mcpServer/tool/call", {
              server: "codex_apps",
              tool: "github.search_prs",
              arguments: { query: q },
              threadId: tid,
            });
            const list = parsePrSearch(r);
            for (const pr of list) out.push({ ...pr, _bucket: q });
          }
          if (out.length) {
            const seen = new Set();
            const dedup = out.filter((p) => (seen.has(p.url) ? false : (seen.add(p.url), true)));
            dedup.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
            if (live) {
              setPrs(dedup);
              setErrors(0);
            }
            return;
          }
        } catch {
          // fall through to the gh CLI path
        }
      }
      const out = [];
      let errs = 0;
      for (const cwd of repos) {
        try {
          const r = await api.rpc("command/exec", {
            command: [
              "gh", "pr", "list", "--state", "all", "--limit", "20",
              "--json", "number,title,state,headRefName,baseRefName,url,updatedAt,isDraft,body,author,reviewRequests",
            ],
            cwd,
            timeoutMs: 20000,
          });
          const stdout = r?.stdout ?? r?.output ?? "";
          const list = JSON.parse(stdout || "[]");
          for (const pr of list) out.push({ ...pr, repo: cwd });
        } catch {
          errs++;
        }
      }
      if (live) {
        out.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        setPrs(out);
        setErrors(errs);
      }
    })();
    return () => { live = false; };
  }, [repos.length]);

  const sections = useMemo(() => {
    const list = prs || [];
    const apply = (l) =>
      l.filter((pr) => {
        if (stateFilter !== "all" && (pr.state || "").toUpperCase() !== stateFilter) return false;
        const q = query.trim().toLowerCase();
        if (!q) return true;
        return (
          (pr.title || "").toLowerCase().includes(q) ||
          String(pr.number).includes(q) ||
          (pr.headRefName || "").toLowerCase().includes(q) ||
          (pr.repo || "").toLowerCase().includes(q)
        );
      });
    // gh-CLI fallback rows carry no bucket and the login may be unknown —
    // show them flat rather than dropping everything.
    if (!me && list.some((p) => !p._bucket)) return [["results", apply(list)]];
    const authored = list.filter((p) => p._bucket === "author:@me" || (me && p.author?.login === me));
    const reviewing = list.filter((p) => p._bucket === "review-requested:@me" || (me && (p.reviewRequests || []).some((rr) => rr?.login === me)));
    const reviewed = list.filter((p) => p._bucket === "reviewed-by:@me");
    if (tab === "reviewing") return [["results", apply(reviewing)]];
    if (tab === "authored") return [["results", apply(authored)]];
    return [
      ["review_requested", apply(reviewing)],
      ["reviewed", apply(reviewed)],
      ["authored", apply(authored)],
    ].filter(([, l]) => l.length > 0);
  }, [prs, tab, me, query, stateFilter]);

  const selected = (prs || []).find((pr) => pr.url === selectedUrl) || null;

  return (
    <div className="flex h-full min-w-0 flex-1 border-t border-(--border-light)">
      {/* Left column: filters + list */}
      <div className="flex w-[400px] shrink-0 flex-col border-r border-(--border-light)">
        <div className="shrink-0 px-3 pt-3">
          <div className="flex items-center gap-4 px-1">
            {[["all", "All"], ["reviewing", "Reviewing"], ["authored", "Authored"]].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cx(
                  "text-[13px]",
                  tab === id ? "font-medium text-(--fg)" : "text-(--fg-tertiary) hover:text-(--fg)"
                )}
              >
                {t(label)}
              </button>
            ))}
          </div>
          <div className="mt-2.5 flex items-center gap-1.5">
            <div className="relative flex-1">
              <LucideIcon name="Search" size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--fg-faint)" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={t("Search pull requests")}
                spellCheck={false}
                className="h-8 w-full rounded-full border border-(--border-light) bg-(--surface) pl-8 pr-3 text-xs outline-none placeholder:text-(--fg-faint) focus:border-(--border-heavy)"
              />
            </div>
            <button
              ref={filterRef}
              title={t("Filter by state")}
              className={cx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full hover:bg-(--surface-hover)",
                stateFilter !== "all" ? "text-(--accent)" : "text-(--fg-tertiary) hover:text-(--fg)"
              )}
              onClick={() => setFilterOpen(true)}
            >
              <LucideIcon name="ListFilter" size={14} />
            </button>
          </div>
        </div>

        <div className="min-h0 flex-1 overflow-y-auto p-1.5">
          {prs === null ? (
            <PrListSkeleton />
          ) : sections.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-1 px-4 text-center">
              <div className="text-[13px] text-(--fg-tertiary)">
                {prs.length === 0 ? t("No pull requests found") : t("No pull requests match your filters")}
              </div>
              {prs.length === 0 && (
                <div className="text-xs text-(--fg-faint)">
                  {errors > 0
                    ? t("{errors} of {count} folders are not GitHub repos", { errors, count: repos.length })
                    : t("PRs in your project repos will appear here")}
                </div>
              )}
            </div>
          ) : (
            sections.map(([kind, list]) => (
              <div key={kind}>
                {kind !== "results" && (
                  <div className="px-2 pt-3 pb-1 text-[11px] font-medium text-(--fg-tertiary)">
                    {t(kind === "review_requested" ? "Review requested" : kind === "reviewed" ? "Previously reviewed" : "Authored")}
                  </div>
                )}
                {list.map((pr) => (
                  <button
                    key={pr.url}
                    onClick={() => setSelectedUrl(pr.url)}
                    className={cx(
                      "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left",
                      selectedUrl === pr.url ? "bg-(--surface-active)" : "hover:bg-(--surface-hover)"
                    )}
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center">
                      <PrStateIcon state={pr.state} isDraft={pr.isDraft} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-2">
                        <span className="min-w-0 flex-1 truncate text-[13px]">{pr.title}</span>
                        <span className="shrink-0 text-xs text-(--fg-tertiary)">{shortAge(pr.updatedAt)}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-2 text-xs text-(--fg-tertiary)">
                        {pr.author?.avatarUrl && <img src={pr.author.avatarUrl} alt="" className="size-4 shrink-0 rounded-full bg-white" />}
                        <span className="max-w-[35%] shrink-0 truncate">{pr.repo || basename(pr.repo || "")}</span>
                        <span className="min-w-0 flex-1 truncate font-mono" title={pr.headRefName}>{pr.headRefName}</span>
                        {(pr.additions != null || pr.deletions != null) && (
                          <span className="ml-auto shrink-0 font-mono">
                            <span className="text-(--diff-add-fg)">+{(pr.additions || 0).toLocaleString()}</span>{" "}
                            <span className="text-(--diff-del-fg)">-{(pr.deletions || 0).toLocaleString()}</span>
                          </span>
                        )}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>

        <Menu
          open={filterOpen}
          anchor={() => filterRef.current?.getBoundingClientRect()}
          onClose={() => setFilterOpen(false)}
          align="end"
          width={160}
          items={[
            { id: "all", label: "All states", checked: stateFilter === "all", onSelect: () => setStateFilter("all") },
            { id: "OPEN", label: "Open", checked: stateFilter === "OPEN", onSelect: () => setStateFilter("OPEN") },
            { id: "MERGED", label: "Merged", checked: stateFilter === "MERGED", onSelect: () => setStateFilter("MERGED") },
            { id: "CLOSED", label: "Closed", checked: stateFilter === "CLOSED", onSelect: () => setStateFilter("CLOSED") },
          ]}
        />
      </div>

      {/* Right column: detail */}
      <div className="min-w-0 flex-1 overflow-y-auto">
        {selected ? (
          <PrDetail pr={selected} />
        ) : (
          <div className="flex h-full items-center justify-center text-[13px] text-(--fg-tertiary)">
            {t("Select pull request to view")}
          </div>
        )}
      </div>
    </div>
  );
}

// Loading placeholder rows (gray rounded bars).
function PrListSkeleton() {
  return (
    <div>
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center gap-2.5 px-2 py-2">
          <div className="h-4 w-4 shrink-0 animate-pulse rounded-full bg-(--surface-active)" />
          <div className="min-w-0 flex-1">
            <div className="h-3 w-3/4 animate-pulse rounded-md bg-(--surface-active)" />
            <div className="mt-1.5 h-2.5 w-1/2 animate-pulse rounded-md bg-(--surface-active)" />
          </div>
        </div>
      ))}
    </div>
  );
}

// Open = green GitPullRequest, Merged = purple GitMerge, Closed = red, Draft = gray.
function PrStateIcon({ state, isDraft, size = 15 }) {
  const s = (state || "").toUpperCase();
  if (isDraft || s === "DRAFT")
    return <LucideIcon name="GitPullRequestDraft" size={size} className="shrink-0 text-(--fg-tertiary)" />;
  if (s === "MERGED") return <LucideIcon name="GitMerge" size={size} className="shrink-0 text-(--purple)" />;
  if (s === "CLOSED") return <LucideIcon name="GitPullRequestClosed" size={size} className="shrink-0 text-(--danger)" />;
  return <LucideIcon name="GitPullRequest" size={size} className="shrink-0 text-(--success)" />;
}

function PrStatusChip({ state, isDraft }) {
  const s = (state || "").toUpperCase();
  const [label, cls] =
    (isDraft && s === "OPEN") || s === "DRAFT" ? ["Draft", "bg-(--surface-active) text-(--fg-secondary)"]
    : s === "OPEN" ? ["Open", "bg-(--diff-add-bg) text-(--diff-add-fg)"]
    : s === "MERGED" ? ["Merged", "bg-(--accent-soft) text-(--purple)"]
    : ["Closed", "bg-(--danger-soft) text-(--danger)"];
  return <span className={cx("shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium", cls)}>{label}</span>;
}

// Right-hand detail pane for the selected PR.
function PrDetail({ pr }) {
  const body = (pr.body || "").trim();
  const lines = body ? body.split("\n") : [];
  const preview = lines.slice(0, 8).join("\n");
  const truncated = lines.length > 8;

  const reviewChanges = () => {
    const s = useStore.getState();
    s.setUi({ navView: "chats" });
    s.sendMessage(`Review this pull request: ${pr.url}`);
  };

  return (
    <div className="mx-auto max-w-[46rem] px-6 py-5">
      <div className="text-[16px] font-semibold leading-snug">{pr.title}</div>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-(--fg-tertiary)">
        <PrStatusChip state={pr.state} isDraft={pr.isDraft} />
        <span className="font-mono">#{pr.number}</span>
      </div>

      <div className="mt-4 flex flex-col gap-1.5">
        <div className="flex items-center gap-2 text-[13px] text-(--fg-secondary)">
          <LucideIcon name="GitBranch" size={13} className="shrink-0 text-(--fg-tertiary)" />
          <span className="min-w-0 truncate font-mono text-xs" title={pr.headRefName}>{pr.headRefName}</span>
          <LucideIcon name="ArrowRight" size={12} className="shrink-0 text-(--fg-faint)" />
          <span className="min-w-0 truncate font-mono text-xs">{pr.baseRefName || "main"}</span>
        </div>
        <div className="flex items-center gap-2 text-[13px] text-(--fg-secondary)" title={pr.repo}>
          <LucideIcon name="Folder" size={13} className="shrink-0 text-(--fg-tertiary)" />
          <span className="min-w-0 truncate">{basename(pr.repo)}</span>
        </div>
        {pr.author?.login && (
          <div className="flex items-center gap-2 text-[13px] text-(--fg-secondary)">
            <LucideIcon name="User" size={13} className="shrink-0 text-(--fg-tertiary)" />
            <span className="min-w-0 truncate">{pr.author.login}</span>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          className="flex h-7 items-center gap-1.5 rounded-full border border-(--border) px-3 text-xs hover:bg-(--surface-hover)"
          onClick={() => api.openExternal(pr.url)}
        >
          <LucideIcon name="ExternalLink" size={12} />
          Open in browser
        </button>
        <button
          className="flex h-7 items-center gap-1.5 rounded-full bg-(--accent) px-3 text-xs font-medium text-(--accent-fg) hover:opacity-90"
          onClick={reviewChanges}
        >
          <LucideIcon name="Sparkles" size={12} />
          Review changes
        </button>
      </div>

      {body && (
        <div className="mt-5 border-t border-(--border-light) pt-4">
          <div className="text-[11px] font-medium text-(--fg-tertiary)">Description</div>
          <div className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-(--fg-secondary)">
            {preview}
            {truncated ? "\n…" : ""}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scheduled: automations from %USERPROFILE%\.codex\automations.
// ---------------------------------------------------------------------------
const SCHEDULED_SUGGESTIONS = [
  {
    icon: "CalendarDays",
    name: "Daily brief",
    schedule: "Weekdays at 8:00 AM",
    desc: "Start each weekday with a summary of your calendar, unread email, and priorities",
  },
  {
    icon: "CalendarCheck",
    name: "Weekly review",
    schedule: "Fridays at 4:00 PM",
    desc: "Turn your recent work into a concise status update every Friday",
  },
  {
    icon: "Inbox",
    name: "Follow-up monitor",
    schedule: "Weekdays at 9:00 AM",
    desc: "Review recent email and calendar activity and flag anything that needs your attention",
  },
];

function ScheduledView() {
  const t = useT();
  const codexHome = useStore((s) => s.codexHome);
  const [items, setItems] = useState(null);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("all"); // all | active | paused

  useEffect(() => {
    let live = true;
    if (!codexHome) return;
    (async () => {
      try {
        const root = await api.rpc("fs/readDirectory", { path: `${codexHome}/automations` }).catch(() => null);
        const dirs = (root?.entries || []).filter((e) => e.isDirectory);
        const out = [];
        for (const d of dirs) {
          const tomlPath = `${codexHome}/automations/${d.fileName}/automation.toml`;
          const r = await api.rpc("fs/readFile", { path: tomlPath }).catch(() => null);
          if (r == null) continue; // folders without automation.toml are not automations
          const a = parseAutomationToml(decodeFsRead(r));
          out.push({ ...a, id: a.id || d.fileName, name: a.name || d.fileName });
        }
        out.sort((a, b) => {
          if (a.status !== b.status) return a.status === "ACTIVE" ? -1 : 1;
          const byName = a.name.localeCompare(b.name);
          if (byName) return byName;
          // Same name: earlier time of day first (reference ordering).
          const hm = (x) => {
            const h = Number(/BYHOUR=(\d+)/i.exec(x.rrule || "")?.[1] ?? 99);
            const m = Number(/BYMINUTE=(\d+)/i.exec(x.rrule || "")?.[1] ?? 99);
            return h * 60 + m;
          };
          return hm(a) - hm(b);
        });
        if (live) setItems(out);
      } catch (e) {
        if (live) setError(e.message);
      }
    })();
    return () => { live = false; };
  }, [codexHome]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (items || []).filter(
      (a) =>
        (tab === "all" || a.status === (tab === "active" ? "ACTIVE" : "PAUSED")) &&
        (!q || a.name.toLowerCase().includes(q))
    );
  }, [items, query, tab]);

  return (
    <PageShell title="Scheduled">
      {/* Header */}
      <div className="px-6 pt-5">
        <div className="text-[28px] font-normal">{t("Scheduled tasks")}</div>
        <div className="mt-1 text-[16px] leading-6 text-(--fg-secondary)">
          {t("Ask ChatGPT to schedule tasks, set reminders, or monitor for updates")}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1">
            <LucideIcon name="Search" size={13} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-(--fg-faint)" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search scheduled tasks")}
              spellCheck={false}
              className="h-8 w-full rounded-full border border-(--border-light) bg-(--input-bg) pl-8 pr-3 text-sm outline-none placeholder:text-(--fg-faint)"
            />
          </div>
          {/* Plain text filter tabs (no chip borders; current item highlighted). */}
          <div className="flex items-center gap-4">
            {[["all", "All"], ["active", "Active"], ["paused", "Paused"]].map(([id, label]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={cx(
                  "text-[13px]",
                  tab === id ? "font-medium text-(--fg)" : "text-(--fg-tertiary) hover:text-(--fg)"
                )}
              >
                {t(label)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Task rows */}
      <div className="mt-3">
        {items === null && !error && (
          <div className="flex justify-center py-10 text-(--fg-tertiary)"><Spinner /></div>
        )}
        {error && <div className="px-6 py-10 text-center text-[13px] text-(--fg-tertiary)">{error}</div>}
        {items && filtered.length === 0 && (
          <div className="px-6 py-10 text-center text-[13px] text-(--fg-tertiary)">
            {items.length === 0 ? t("No scheduled tasks yet") : t("No tasks match your filters")}
          </div>
        )}
        {filtered.map((a) => (
          <div key={a.id} className="flex items-center gap-3 px-6 py-2.5 hover:bg-(--surface-hover)" title={a.cwd || undefined}>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--surface-active) text-(--fg-tertiary)">
              <LucideIcon name="Clock" size={14} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-medium">{a.name}</div>
              <div className="mt-0.5 truncate text-xs text-(--fg-tertiary)">{a.schedule || t("No schedule")}</div>
            </div>
            {/* The reference page shows a status chip only in the Paused filter. */}
            {tab === "paused" && (
              <span className="shrink-0 rounded-full bg-(--surface-active) px-2 py-0.5 text-[11px] font-medium text-(--fg-tertiary)">
                {t("Paused")}
              </span>
            )}
          </div>
        ))}
      </div>

      {/* Suggestions */}
      <div className="px-6 pt-4 text-[11px] font-medium text-(--fg-tertiary)">{t("Suggestions")}</div>
      <div className="mt-2 flex flex-col gap-2 px-6 pb-8">
        {SCHEDULED_SUGGESTIONS.map((s) => (
          <button
            key={s.name}
            className="flex items-start gap-3 rounded-xl border border-(--border-light) bg-(--surface-under) p-3 text-left hover:bg-(--surface-hover)"
            onClick={() => toast("Ask ChatGPT Desktop Community in a chat to set this up")}
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-(--accent-soft) text-(--accent)">
              <LucideIcon name={s.icon} size={14} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-[13px] font-medium">{t(s.name)}</span>
                <span className="text-xs text-(--fg-tertiary)">{t(s.schedule)}</span>
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-(--fg-tertiary)">{t(s.desc)}</span>
            </span>
          </button>
        ))}
      </div>
    </PageShell>
  );
}

// fs/readFile returns base64 payloads on this backend; decode them as UTF-8.
// (Plain atob() yields a Latin-1 binary string, which mangles CJK names into
// mojibake like "é è¯".)
function decodeFsRead(r) {
  if (!r) return "";
  if (typeof r === "string") return r;
  if (typeof r.dataBase64 === "string") {
    try {
      const bytes = Uint8Array.from(atob(r.dataBase64), (c) => c.charCodeAt(0));
      return new TextDecoder("utf-8").decode(bytes);
    } catch {
      return "";
    }
  }
  if (typeof r.content === "string") return r.content;
  if (typeof r.data === "string") return r.data;
  return "";
}

// Tiny field extractor for automation.toml (no full TOML parser needed).
function parseAutomationToml(text) {
  const str = (key) => {
    const m = text.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, "m"));
    return m ? m[1] : null;
  };
  const cwds = text.match(/^cwds\s*=\s*\[\s*"([^"]*)"/m);
  const rrule = str("rrule");
  return {
    id: str("id"),
    name: str("name"),
    status: (str("status") || "PAUSED").toUpperCase(),
    model: str("model"),
    effort: str("reasoning_effort"),
    cwd: cwds ? cwds[1] : null,
    schedule: humanizeRRule(rrule),
    rrule,
  };
}

// RRULE → short English label, e.g. "Every 5 minutes" / "Daily at 11:00 AM".
// A WEEKLY rule covering all seven days is presented as "Daily", like the
// reference; MO–FR becomes "Weekdays".
function humanizeRRule(rrule) {
  if (!rrule) return null;
  const body = rrule.replace(/^RRULE:/i, "");
  const freq = /FREQ=(\w+)/i.exec(body)?.[1]?.toUpperCase();
  const interval = Number(/INTERVAL=(\d+)/i.exec(body)?.[1] ?? 1) || 1;
  const hour = /BYHOUR=(\d+)/i.exec(body)?.[1];
  const minute = String(/BYMINUTE=(\d+)/i.exec(body)?.[1] ?? "0").padStart(2, "0");
  const byday = /BYDAY=([A-Z,]+)/i.exec(body)?.[1]?.toUpperCase() || "";
  const at12h = () => {
    const h = Number(hour);
    return `${h % 12 === 0 ? 12 : h % 12}:${minute} ${h < 12 ? "AM" : "PM"}`;
  };
  switch (freq) {
    case "MINUTELY": return interval === 1 ? "Every minute" : `Every ${interval} minutes`;
    case "HOURLY": return interval === 1 ? "Every hour" : `Every ${interval} hours`;
    case "DAILY":
      if (interval > 1) return `Every ${interval} days`;
      return hour != null ? `Daily at ${at12h()}` : "Daily";
    case "WEEKLY": {
      if (interval > 1) return `Every ${interval} weeks`;
      const days = byday.split(",").filter(Boolean);
      const all7 = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"].every((d) => days.includes(d));
      if (all7) return hour != null ? `Daily at ${at12h()}` : "Daily";
      const weekdays = ["MO", "TU", "WE", "TH", "FR"].every((d) => days.includes(d)) && days.length === 5;
      if (weekdays) return hour != null ? `Weekdays at ${at12h()}` : "Weekdays";
      return hour != null ? `Weekly at ${at12h()}` : "Weekly";
    }
    case "MONTHLY": return "Monthly";
    default: return null;
  }
}

function PluginsView() {
  const t = useT();
  const [plugins, setPlugins] = useState(null);
  const [error, setError] = useState(null);
  const tab = useStore((s) => s.ui.pluginsTab || "plugins"); // plugins | skills
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("public"); // public | personal
  const [overflow, setOverflow] = useState(null); // { rect, plugin }
  const [detail, setDetail] = useState(null); // plugin open in the detail page

  useEffect(() => {
    let live = true;
    const fetchAll = () =>
      api.rpc("plugin/list", {})
        .then((r) => {
          if (!live) return;
          const flat = [];
          for (const mp of r?.marketplaces || []) {
            for (const p of mp.plugins || []) flat.push({ ...p, _marketplace: mp.name, _marketplacePath: mp.path });
          }
          setPlugins(flat);
        })
        .catch((e) => live && setError(e.message));
    fetchAll();
    // The header-band refresh button re-fetches the catalog.
    const onReload = () => fetchAll();
    window.addEventListener("plugins:reload", onReload);
    return () => {
      live = false;
      window.removeEventListener("plugins:reload", onReload);
    };
  }, []);

  const q = query.trim().toLowerCase();
  const installed = useMemo(
    () => (plugins || []).filter((p) => p.installed && (!q || pluginName(p).toLowerCase().includes(q))),
    [plugins, q]
  );
  // Featured = non-catalog plugins (personal/bundled/primary) + the first few
  // curated entries, like the reference page (uninstalled highlighted first).
  const featured = useMemo(() => {
    const curated = [];
    const rest = [];
    for (const p of plugins || []) {
      if (p._marketplace === "openai-curated-remote") curated.push(p);
      else rest.push(p);
    }
    const all = [...rest, ...curated.slice(0, 2)];
    const list = all.filter((p) => {
      const personal = p._marketplace === "personal";
      if (scope === "public" ? personal : !personal) return false;
      if (q && !pluginName(p).toLowerCase().includes(q) && !(p.interface?.shortDescription || "").toLowerCase().includes(q)) return false;
      return true;
    });
    return [...list.filter((p) => !p.installed), ...list.filter((p) => p.installed)].slice(0, 6);
  }, [plugins, q, scope]);
  // Remaining curated plugins grouped by category (reference shows
  // "Productivity" etc. sections below Featured).
  const categories = useMemo(() => {
    if (scope !== "public") return [];
    const groups = new Map();
    for (const p of plugins || []) {
      if (p._marketplace !== "openai-curated-remote") continue;
      if (q && !pluginName(p).toLowerCase().includes(q) && !(p.interface?.shortDescription || "").toLowerCase().includes(q)) continue;
      const cat = p.interface?.category || "Other";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(p);
    }
    const order = ["Productivity"];
    return [...groups.entries()].sort((a, b) => {
      const ai = order.indexOf(a[0]), bi = order.indexOf(b[0]);
      return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a[0].localeCompare(b[0]);
    });
  }, [plugins, q, scope]);

  if (detail) {
    return <PluginDetailView plugin={detail} onBack={() => setDetail(null)} onChanged={setPlugins} />;
  }

  return (
    <PageShell title="Plugins">
      <div className="mx-auto w-full max-w-[48rem] px-5 pt-6">
      {/* Header */}
      <div>
        <h1 className="text-[28px] font-normal text-(--fg)">{t(tab === "plugins" ? "Plugins" : "Skills")}</h1>
        <div className="mt-1 text-[16px] leading-6 text-(--fg-secondary)">
          {t(tab === "plugins" ? "Work with ChatGPT across your favorite tools" : "Extend ChatGPT with task-specific skills")}
        </div>
        <div className="mt-3 flex h-8 items-center gap-2 rounded-full border border-(--border-light) bg-(--input-bg) px-2.5">
          <IconSearch size={14} className="shrink-0 text-(--fg-faint)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t(tab === "plugins" ? "Search plugins" : "Search skills")}
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm leading-[18px] outline-none placeholder:text-(--fg-faint)"
          />
        </div>
      </div>

      {tab === "skills" ? (
        <SkillsView query={query} />
      ) : (
        <PluginsBody query={query} plugins={plugins} setPlugins={setPlugins} error={error} scope={scope} setScope={setScope} setOverflow={setOverflow} onOpenDetail={setDetail} />
      )}
      </div>

      <Menu
        open={!!overflow}
        anchor={() => overflow?.rect}
        onClose={() => setOverflow(null)}
        align="end"
        width={180}
        items={[
          {
            id: "reveal",
            label: "Reveal in folder",
            disabled: !overflow?.plugin?.source?.path,
            onSelect: () => api.showItemInFolder(overflow.plugin.source.path),
          },
          {
            id: "uninstall",
            label: "Uninstall",
            onSelect: () =>
              api.rpc("plugin/uninstall", { pluginId: overflow.plugin.id })
                .then(() => api.rpc("plugin/list", {}).then((r) => {
                  const flat = [];
                  for (const mp of r?.marketplaces || []) for (const pl of mp.plugins || []) flat.push({ ...pl, _marketplace: mp.name, _marketplacePath: mp.path });
                  setPlugins(flat);
                }))
                .catch((e) => toast(`Uninstall failed: ${e.message}`)),
          },
        ]}
      />
    </PageShell>
  );
}

// Plugin card (icon + name + desc + details/overflow action).
function PluginCard({ plugin, onOverflow, onOpenDetail }) {
  const t = useT();
  const name = pluginName(plugin);
  const description = plugin.interface?.shortDescription || "—";
  return (
    <div
      className="flex cursor-pointer items-center gap-2.5 rounded-2xl border border-(--border-light) bg-(--surface-under) p-3 hover:bg-(--fg)/5"
      onClick={() => onOpenDetail?.(plugin)}
    >
      <PluginIcon plugin={plugin} size={28} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{t(name)}</span>
        <span className="block truncate text-xs text-(--fg-tertiary)" title={t(description)}>
          {t(description)}
        </span>
      </span>
      {plugin.installed ? (
        <button
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
          title={t("More actions")}
          onClick={(e) => { e.stopPropagation(); onOverflow(e.currentTarget.getBoundingClientRect()); }}
        >
          <IconMore size={14} />
        </button>
      ) : (
        <IconChevronDown
          size={14}
          className="-rotate-90 shrink-0 text-(--fg-faint)"
        />
      )}
    </div>
  );
}

// Plugin icon — same sources the reference uses: the plugin's own icon file
// (interface.composerIcon/logo, local path) → CDN logoUrl via the main-process
// proxy (CSP/CF-safe) → brandColor letter tile.
export function PluginIcon({ plugin, size }) {
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const iconPath = plugin.interface?.composerIcon || plugin.interface?.logo;
  const logoUrl = plugin.interface?.logoUrl;
  const name = pluginName(plugin);
  const brand = plugin.brandColor || plugin.interface?.brandColor;

  useEffect(() => {
    setSrc(null);
    setFailed(false);
    if (iconPath) {
      setSrc(api.localFileUrl(iconPath));
    } else if (logoUrl) {
      api.iconFetch(logoUrl).then((u) => {
        if (u) setSrc(u);
        else setFailed(true);
      });
    } else {
      setFailed(true);
    }
  }, [iconPath, logoUrl]);

  if (src && !failed) {
    return (
      <img
        src={src}
        alt=""
        className="shrink-0 rounded-lg object-cover"
        style={{ width: size, height: size }}
        onError={() => {
          // local icon file missing → try the CDN proxy next, then letter
          if (iconPath && logoUrl) {
            setSrc(null);
            api.iconFetch(logoUrl).then((u) => (u ? setSrc(u) : setFailed(true)));
          } else {
            setFailed(true);
          }
        }}
      />
    );
  }
  return (
    <span className="flex shrink-0 items-center justify-center rounded-lg" style={{ width: size, height: size }}>
      <IconPluginFallback size={size} />
    </span>
  );
}

export function pluginName(p) {
  return p.interface?.displayName || p.name || p.id || "Plugin";
}

// The reference pins this exact Featured set, in this order (ids matched by
// their slug before the "@marketplace").
const FEATURED_SLUGS = [
  "computer-use", "chrome", "spreadsheets", "presentations", "data-analytics", "github",
  "investment-banking", "public-equity-investing", "sales", "google-drive", "gmail",
  "slack", "notion", "outlook-email", "google-calendar", "figma", "outlook-calendar",
  "app-69312da8e4dc81919370cb86fd172b6c", // Adobe (formerly Photoshop)
];
// Only the first few Featured cards are shown; the rest collapse into a
// "See X, Y, and N more" row (reference behavior).
const FEATURED_VISIBLE = 6;
const CATEGORY_ORDER = [
  "Productivity", "Creativity", "Developer Tools", "Business & Operations", "Data & Analytics",
  "Communication", "Education & Research", "Security", "Finance", "Healthcare", "Travel",
  "Entertainment", "Other",
];
const pluginSlug = (p) => String(p.id || "").split("@")[0];

// Plugins tab body: installed tiles, scope pills, Featured, categories.
function PluginsBody({ query, plugins, setPlugins, error, scope, setScope, setOverflow, onOpenDetail }) {
  const t = useT();
  const q = query.trim().toLowerCase();
  const [seeAllFeatured, setSeeAllFeatured] = useState(false);
  const matchQ = (p) => {
    if (!q) return true;
    const name = pluginName(p);
    const description = p.interface?.shortDescription || "";
    return [name, description, t(name), t(description)]
      .some((value) => value.toLowerCase().includes(q));
  };
  const installed = useMemo(
    () => (plugins || []).filter((p) => p.installed && matchQ(p)),
    [plugins, q, t]
  );
  // Featured = the pinned set (public tab) or the personal marketplace.
  const featured = useMemo(() => {
    if (scope !== "public") return [];
    const bySlug = new Map();
    for (const p of plugins || []) if (!bySlug.has(pluginSlug(p))) bySlug.set(pluginSlug(p), p);
    return FEATURED_SLUGS.map((s) => bySlug.get(s)).filter((p) => p && matchQ(p));
  }, [plugins, q, scope, t]);
  // Personal tab: "Created by you" (personal marketplace) + one section per
  // third-party marketplace (ponytail…), full-width rows like the reference.
  const personalSections = useMemo(() => {
    if (scope !== "personal") return [];
    const groups = new Map(); // marketplace -> plugins
    for (const p of plugins || []) {
      if (p._marketplace === "openai-curated-remote" || p._marketplace === "openai-bundled" || p._marketplace === "openai-primary-runtime") continue;
      if (!matchQ(p)) continue;
      if (!groups.has(p._marketplace)) groups.set(p._marketplace, []);
      groups.get(p._marketplace).push(p);
    }
    const out = [];
    if (groups.has("personal")) out.push(["Created by you", groups.get("personal")]);
    for (const [mp, list] of groups) {
      if (mp === "personal") continue;
      out.push([mp.charAt(0).toUpperCase() + mp.slice(1), list]);
    }
    return out;
  }, [plugins, q, scope, t]);
  // Category sections: every catalog plugin grouped by interface.category in
  // the reference's fixed order. Productivity additionally carries the local
  // (installed, non-featured) plugins right after the first page.
  const categories = useMemo(() => {
    if (scope !== "public") return [];
    const groups = new Map();
    for (const p of plugins || []) {
      if (p._marketplace !== "openai-curated-remote") continue;
      const cat = p.interface?.category || "Other";
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat).push(p);
    }
    const result = [];
    for (const cat of CATEGORY_ORDER) {
      let list = (groups.get(cat) || []).filter(matchQ);
      if (cat === "Productivity") {
        const rank = { "openai-primary-runtime": 0, "openai-bundled": 1, personal: 2 };
        const locals = (plugins || [])
          .filter((p) => p._marketplace !== "openai-curated-remote" && p.installed && !FEATURED_SLUGS.includes(pluginSlug(p)) && matchQ(p))
          .sort((a, b) => (rank[a._marketplace] ?? 3) - (rank[b._marketplace] ?? 3));
        list = [...list.slice(0, 6), ...locals, ...list.slice(6)];
      }
      if (list.length) result.push([cat, list]);
    }
    for (const [cat, list0] of groups) {
      if (CATEGORY_ORDER.includes(cat)) continue;
      const list = list0.filter(matchQ);
      if (list.length) result.push([cat, list]);
    }
    return result;
  }, [plugins, q, scope]);

  if (plugins === null && !error) {
    return <div className="flex justify-center py-10 text-(--fg-tertiary)"><Spinner /></div>;
  }
  if (error) return <div className="py-10 text-center text-[13px] text-(--fg-tertiary)">{error}</div>;
  return (
    <>
          {/* Installed */}
          <div className="flex items-center justify-between pt-4">
            <span className="text-[11px] font-medium text-(--fg-tertiary)">{t("Installed")}</span>
            <button
              title={t("Manage plugins")}
              className="flex h-5 w-5 items-center justify-center rounded text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
              onClick={() => useStore.getState().setUi({ settingsOpen: true, settingsSection: "plugins" })}
            >
              <LucideIcon name="Settings" size={13} />
            </button>
          </div>
          {installed.length === 0 ? (
            <div className="mt-2 text-xs text-(--fg-faint)">
              {t(query ? "No installed plugins match your search" : "No plugins installed yet")}
            </div>
          ) : (
            <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
              {installed.map((p) => (
                <span key={p.id} title={t(pluginName(p))} className="shrink-0 cursor-default">
                  <PluginIcon plugin={p} size={32} />
                </span>
              ))}
            </div>
          )}

          {/* Scope pills */}
          <div className="mt-4 flex items-center justify-between">
            <div className="inline-flex items-center rounded-full border border-(--border-light) bg-(--surface-under) p-0.5">
              {[["public", "Public"], ["personal", "Personal"]].map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setScope(id)}
                  className={cx(
                    "h-6 rounded-full px-3 text-xs",
                    scope === id ? "bg-(--surface-active) text-(--fg)" : "text-(--fg-tertiary) hover:text-(--fg)"
                  )}
                >
                  {t(label)}
                </button>
              ))}
            </div>
            <button
              title={t("Filter")}
              className="flex h-5 w-5 items-center justify-center rounded text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
            >
              <LucideIcon name="ListFilter" size={13} />
            </button>
          </div>

          {/* Featured (public) / personal marketplaces (personal) */}
          {scope === "personal" ? (
            <>
              {personalSections.length === 0 && (
                <div className="mt-2 pb-2 text-xs text-(--fg-faint)">
                  {t(query ? "No plugins match your search" : "Nothing to show here yet")}
                </div>
              )}
              {personalSections.map(([title, list]) => (
                <div key={title}>
                  <SectionHeader title={title} className="pt-5" />
                  <div className="mt-1 flex flex-col">
                    {list.map((p) => (
                      <PersonalPluginRow key={p.id} plugin={p} onOverflow={(rect) => setOverflow({ rect, plugin: p })} onChanged={setPlugins} onOpenDetail={onOpenDetail} />
                    ))}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
          <SectionHeader title="Featured" className="pt-5" />
          {featured.length === 0 ? (
            <div className="mt-2 pb-2 text-xs text-(--fg-faint)">
              {t(query ? "No plugins match your search" : "Nothing to show here yet")}
            </div>
          ) : (
            <>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {(seeAllFeatured || q ? featured : featured.slice(0, FEATURED_VISIBLE)).map((p) => (
                <PluginCard key={p.id} plugin={p} onOverflow={(rect) => setOverflow({ rect, plugin: p })} onChanged={setPlugins} onOpenDetail={onOpenDetail} />
              ))}
            </div>
            {!seeAllFeatured && !q && featured.length > FEATURED_VISIBLE && (
              <button
                className="mt-2 flex items-center gap-2 rounded-lg px-1 py-1.5 text-[13px] text-(--fg-secondary) hover:bg-(--fg)/5"
                onClick={() => setSeeAllFeatured(true)}
              >
                <span className="flex -space-x-1">
                  {featured.slice(FEATURED_VISIBLE, FEATURED_VISIBLE + 3).map((p) => (
                    <span key={p.id} className="flex size-4 items-center justify-center overflow-hidden rounded-[4px] border border-(--border-light) bg-(--surface)">
                      <PluginIcon plugin={p} size={13} />
                    </span>
                  ))}
                </span>
                {seeMoreLabel(
                  t,
                  featured.slice(FEATURED_VISIBLE).map((plugin) => t(pluginName(plugin))),
                )}
              </button>
            )}
            {seeAllFeatured && !q && featured.length > FEATURED_VISIBLE && (
              <button
                className="mt-2 flex items-center rounded-lg px-1 py-1.5 text-[13px] text-(--fg-secondary) hover:bg-(--fg)/5"
                onClick={() => setSeeAllFeatured(false)}
              >
                {t("Show less")}
              </button>
            )}
            </>
          )}

          {/* Category sections */}
          {categories.map(([cat, list]) => (
            <PluginCategorySection key={cat} title={cat} list={list} setOverflow={setOverflow} setPlugins={setPlugins} onOpenDetail={onOpenDetail} />
          ))}
            </>
          )}
          <div className="h-8" />
    </>
  );
}

// Full-width row used on the Personal tab ("Mario personal" + marketplace tag).
function PersonalPluginRow({ plugin, onOverflow, onOpenDetail }) {
  const t = useT();
  const description = plugin.interface?.shortDescription || "—";
  const marketplace = plugin._marketplace === "personal"
    ? t("Personal")
    : plugin._marketplace;
  return (
    <div className="flex cursor-pointer items-center gap-3 rounded-xl p-2 hover:bg-(--fg)/5" onClick={() => onOpenDetail?.(plugin)}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-(--surface)">
        <PluginIcon plugin={plugin} size={20} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium">
          {t(pluginName(plugin))} <span className="font-normal text-(--fg-tertiary)">{marketplace}</span>
        </div>
        <div className="truncate text-sm text-(--fg-secondary)">{t(description)}</div>
      </div>
      {plugin.installed ? (
        <button
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
          title={t("More actions")}
          onClick={(e) => { e.stopPropagation(); onOverflow(e.currentTarget.getBoundingClientRect()); }}
        >
          <IconMore size={14} />
        </button>
      ) : (
        <IconChevronDown
          size={14}
          className="-rotate-90 shrink-0 text-(--fg-faint)"
        />
      )}
    </div>
  );
}

function SectionHeader({ title, className }) {
  const t = useT();
  return (
    <div className={cx("flex items-center justify-between gap-3 border-b border-(--border-light) pr-0.5 pb-2 pl-2", className)}>
      <h2 className="flex min-h-7 items-center gap-1.5 text-[16px] font-medium leading-6">{t(title)}</h2>
    </div>
  );
}

function PluginCategorySection({ title, list, setOverflow, setPlugins, onOpenDetail }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? list : list.slice(0, 6);
  return (
    <div>
      <SectionHeader title={title} className="pt-5" />
      <div className="mt-2 grid grid-cols-2 gap-2">
        {shown.map((p) => (
          <PluginCard key={p.id} plugin={p} onOverflow={(rect) => setOverflow({ rect, plugin: p })} onChanged={setPlugins} onOpenDetail={onOpenDetail} />
        ))}
      </div>
      <SeeMoreRow skills={list} expanded={expanded} onToggle={() => setExpanded((v) => !v)} names={list.map(pluginName)} />
    </div>
  );
}

// =======================================================================
// Skills tab — mirrors the reference app's skill directory:
// "Installed" grid (union of every scope) → scope pills (Personal +
// one per project that has repo skills) → the selected scope's grid.
// Card click opens the detail dialog (enable switch / Open / Uninstall /
// Try now). Data: skills/list grouped by cwd; toggle: skills/config/write.
// =======================================================================

// Display name: interface.displayName when the skill ships metadata,
// otherwise the reference app title-cases the slug ("agent-cli-harness" →
// "Agent CLI Harness" — "cli" uppercased, every word capitalized).
function titleizeSlug(slug) {
  return String(slug || "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((w) => (w === "cli" ? "CLI" : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(" ");
}
export function skillName(s) {
  return s.interface?.displayName || titleizeSlug(s.name) || "Skill";
}
export function skillDesc(s) {
  return s.interface?.shortDescription || s.shortDescription || s.description || "";
}
// Plugin-provided skills carry "plugin:skill" names — the reference Skills
// tab hides them everywhere (they live on the Plugins tab instead).
const isPluginSkill = (s) => (s.name || "").includes(":");
// zh collation matches the reference ordering (CJK first, then Latin).
function sortSkills(list) {
  return [...list].sort((a, b) => skillName(a).localeCompare(skillName(b), "zh"));
}
// The reference dedupes by skill name (same skill installed in several
// projects shows once). When copies differ, the one carrying metadata
// (interface / shortDescription — typically the repo copy) wins over a bare
// linked copy of the same skill.
function dedupeByName(lists) {
  const seen = new Map();
  const score = (s) => (s.interface ? 2 : 0) + (s.shortDescription ? 1 : 0);
  for (const list of lists) {
    for (const s of list || []) {
      const prev = seen.get(s.name);
      if (!prev || score(s) >= score(prev)) seen.set(s.name, s);
    }
  }
  return [...seen.values()];
}

function SkillIcon({ skill, size = 24 }) {
  const icon = skill.interface?.iconSmall;
  if (icon) {
    return (
      <span className="block h-full w-full overflow-hidden rounded-xl text-(--fg-secondary)">
        <img src={api.localFileUrl(icon)} alt="" draggable={false} className="h-full w-full object-cover" />
      </span>
    );
  }
  return <IconSkillCube size={size} className="text-(--fg-secondary)" />;
}

function SkillCard({ skill, onOpen }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(skill)}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen(skill)}
      className="group flex cursor-pointer flex-col justify-center gap-2.5 rounded-[20px] p-2.5 hover:bg-(--fg)/5"
    >
      <div className="flex items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-(--surface)">
          <SkillIcon skill={skill} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col justify-center gap-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <div className="truncate text-sm font-medium text-(--fg)">{skillName(skill)}</div>
          </div>
          <div className="line-clamp-1 text-sm leading-relaxed text-(--fg-secondary)">{skillDesc(skill)}</div>
        </div>
        <div className="flex shrink-0 items-center">
          {skill.enabled && (
            <span role="img" aria-label="Skill enabled" className="flex h-7 w-7 items-center justify-center rounded-md text-(--fg-tertiary)">
              <IconSkillCheck size={17} className="opacity-60" />
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// "See A, B, and N more" / "Show less" row button. `names` is the full
// display-name list of the section; the first two hidden names are shown.
function seeMoreLabel(t, names) {
  if (names.length === 1) {
    return t("See {first}", { first: names[0] });
  }
  if (names.length === 2) {
    return t("See {first} and {second}", {
      first: names[0],
      second: names[1],
    });
  }
  return t("See {first}, {second}, and {count} more", {
    first: names[0],
    second: names[1],
    count: Math.max(0, names.length - 2),
  });
}

function SeeMoreRow({ skills, expanded, onToggle, names }) {
  const t = useT();
  if (expanded) {
    return (
      <button
        onClick={onToggle}
        className="flex min-h-7 w-full cursor-pointer items-center rounded-md px-2 py-1 text-left text-sm leading-relaxed text-(--fg-tertiary) hover:text-(--fg)"
      >
        {t("Show less")}
      </button>
    );
  }
  if (skills.length <= 6) return null;
  const all = (names || skills.map(skillName)).map((name) => t(name));
  const rest = all.slice(6);
  const label = seeMoreLabel(t, rest);
  return (
    <button
      onClick={onToggle}
      className="flex min-h-7 w-full cursor-pointer items-center rounded-md px-2 py-1 text-left text-sm leading-relaxed text-(--fg-tertiary) hover:text-(--fg)"
    >
      {label}
    </button>
  );
}

function SkillGrid({ skills, expanded, onToggleExpand, onOpen }) {
  const shown = expanded ? skills : skills.slice(0, 6);
  return (
    <>
      <div className="grid grid-cols-2 gap-2">
        {shown.map((s) => (
          <SkillCard key={s.path} skill={s} onOpen={onOpen} />
        ))}
      </div>
      <SeeMoreRow skills={skills} expanded={expanded} onToggle={onToggleExpand} />
    </>
  );
}

function SkillsView({ query }) {
  const gs = useStore((s) => s.gs);
  const home = useStore((s) => s.appInfo?.home) || "";
  const [groups, setGroups] = useState(null); // [{cwd, skills, errors}]
  const [error, setError] = useState(null);
  const [pill, setPill] = useState("personal");
  const [expandInstalled, setExpandInstalled] = useState(false);
  const [expandScope, setExpandScope] = useState(false);
  const [detail, setDetail] = useState(null); // skill object

  // Projects from the shared global state (same source as the sidebar).
  const projects = useMemo(() => {
    const local = gs["local-projects"] || {};
    const roots = new Map();
    for (const p of Object.values(local)) {
      for (const rp of p.rootPaths || []) {
        if (!roots.has(rp)) roots.set(rp, basename(rp) || rp);
      }
    }
    return [...roots.entries()].map(([root, name]) => ({ root, name }));
  }, [gs]);

  const load = () => {
    const cwds = [home, ...projects.map((p) => p.root)];
    return api
      .rpc("skills/list", { cwds })
      .then((r) => setGroups(r?.data || r?.skills || []))
      .catch((e) => setError(e.message));
  };
  useEffect(() => {
    setGroups(null);
    setError(null);
    load();
  }, [home, projects]);

  const q = query.trim().toLowerCase();
  const match = (s) =>
    !q ||
    skillName(s).toLowerCase().includes(q) ||
    skillDesc(s).toLowerCase().includes(q) ||
    (s.name || "").toLowerCase().includes(q);

  const allSkills = useMemo(
    () => sortSkills(dedupeByName((groups || []).map((g) => (g.skills || []).filter((s) => !isPluginSkill(s))))),
    [groups]
  );
  // Personal = user-scope skills living in the two home skill dirs (the
  // reference excludes plugin-cache and foreign-linked user skills).
  const personalSkills = useMemo(() => {
    const dirs = [`${home}/.codex/skills/`, `${home}/.agents/skills/`];
    return sortSkills(
      dedupeByName((groups || []).map((g) =>
        (g.skills || []).filter((s) => s.scope === "user" && dirs.some((d) => (s.path || "").startsWith(d)))
      ))
    );
  }, [groups, home]);
  // Project scope = repo skills under "<root>/skills" or "<root>/.codex/skills"
  // (".agents/skills" counts toward Installed but earns no pill, matching the
  // reference). Projects whose skills are all already covered by an earlier
  // pill project are folded away (worktrees/copies of the same repo).
  const projectSkills = useMemo(() => {
    const map = new Map(); // root -> skills
    for (const p of projects) {
      const g = (groups || []).find((gr) => gr.cwd === p.root);
      const dirs = [`${p.root}/skills/`, `${p.root}/.codex/skills/`];
      const repo = sortSkills(dedupeByName([(g?.skills || []).filter((s) => s.scope === "repo" && dirs.some((d) => (s.path || "").startsWith(d)))]));
      if (repo.length) map.set(p.root, repo);
    }
    return map;
  }, [groups, projects]);

  const pills = useMemo(() => {
    const out = [];
    if (personalSkills.length) out.push({ id: "personal", label: "Personal" });
    // A project earns a pill with 2+ qualifying skills; projects whose
    // skills are all covered by an earlier pill (worktree copies) fold away.
    // Order: "<root>/skills" projects first, then ".codex/skills" ones,
    // alphabetical inside each group (matches the reference).
    const candidates = [];
    for (const p of projects) {
      const skills = projectSkills.get(p.root);
      if (!skills || skills.length < 2) continue;
      const dirType = skills.some((s) => (s.path || "").startsWith(`${p.root}/skills/`)) ? 0 : 1;
      candidates.push({ ...p, skills, dirType });
    }
    candidates.sort((a, b) => a.dirType - b.dirType || a.name.localeCompare(b.name, "zh"));
    const covered = new Set();
    for (const p of candidates) {
      const names = p.skills.map((s) => s.name);
      if (names.every((n) => covered.has(n))) continue;
      for (const n of names) covered.add(n);
      out.push({ id: p.root, label: p.name });
    }
    return out;
  }, [personalSkills, projects, projectSkills]);

  // Keep the selected pill valid as data arrives.
  useEffect(() => {
    if (pills.length && !pills.some((p) => p.id === pill)) setPill(pills[0].id);
  }, [pills, pill]);

  const scopeSkills = pill === "personal" ? personalSkills : projectSkills.get(pill) || [];
  const installedFiltered = allSkills.filter(match);
  const scopeFiltered = scopeSkills.filter(match);

  if (groups === null && !error) {
    return <div className="flex justify-center py-10 text-(--fg-tertiary)"><Spinner /></div>;
  }
  if (error) return <div className="py-10 text-center text-[13px] text-(--fg-tertiary)">{error}</div>;

  return (
    <>
      {/* Installed */}
      <section className="mt-8 flex flex-col gap-4">
        <div className="flex items-center justify-between gap-3 border-b border-(--border-light) pr-0.5 pb-2 pl-2">
          <h2 className="flex min-h-7 items-center gap-1.5 text-[16px] font-medium leading-6">Installed</h2>
        </div>
        {installedFiltered.length === 0 ? (
          <div className="text-xs text-(--fg-faint)">{query ? "No skills match your search" : "No skills installed yet"}</div>
        ) : (
          <SkillGrid
            skills={installedFiltered}
            expanded={expandInstalled}
            onToggleExpand={() => setExpandInstalled((v) => !v)}
            onOpen={setDetail}
          />
        )}
      </section>

      {/* Scope pills */}
      {pills.length > 0 && (
        <div className="mt-8 inline-flex hide-scrollbar relative min-w-0 max-w-full items-center gap-0.5 overflow-x-auto" role="group" aria-label="Skill directory">
          {pills.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={pill === p.id}
              onClick={() => { setPill(p.id); setExpandScope(false); }}
              className={cx(
                "flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-lg border border-transparent px-2 text-sm leading-[18px] whitespace-nowrap select-none",
                pill === p.id
                  ? "bg-(--fg)/5 text-(--fg) hover:bg-(--fg)/10"
                  : "text-(--fg-tertiary) hover:bg-(--surface-hover)"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      )}

      {/* Scope grid */}
      {pills.length > 0 && (
        <div className="mt-4 flex flex-col gap-4">
          {scopeFiltered.length === 0 ? (
            <div className="text-xs text-(--fg-faint)">{query ? "No skills match your search" : "No skills here yet"}</div>
          ) : (
            <SkillGrid skills={scopeFiltered} expanded={expandScope} onToggleExpand={() => setExpandScope((v) => !v)} onOpen={setDetail} />
          )}
        </div>
      )}
      <div className="h-8" />

      {detail && (
        <SkillDetailDialog
          skill={detail}
          onClose={() => setDetail(null)}
          onChanged={() => load()}
        />
      )}
    </>
  );
}

// Skill detail dialog — same layout as the reference: header (icon + switch /
// more / close), title + "Skill", description, scrollable SKILL.md body in a
// bordered panel, footer with Uninstall (red text) and Try now (fills a new
// chat draft with the skill's default prompt).
function SkillDetailDialog({ skill, onClose, onChanged }) {
  const [enabled, setEnabled] = useState(!!skill.enabled);
  const [body, setBody] = useState(null);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);

  useEffect(() => {
    let live = true;
    fetch(api.localFileUrl(skill.path))
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((text) => {
        if (!live) return;
        // Strip YAML frontmatter and the leading H1 (the reference hides it).
        const stripped = text
          .replace(/^---\n[\s\S]*?\n---\n?/, "")
          .replace(/^\s*#\s+[^\n]*\n+/, "")
          .trim();
        setBody(stripped);
      })
      .catch(() => live && setBody(null));
    return () => { live = false; };
  }, [skill.path]);

  useEffect(() => {
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const toggle = () => {
    const next = !enabled;
    setEnabled(next);
    api
      .rpc("skills/config/write", { path: skill.path, enabled: next })
      .then((r) => {
        if (typeof r?.effectiveEnabled === "boolean") setEnabled(r.effectiveEnabled);
        onChanged?.();
      })
      .catch(() => setEnabled(!next));
  };

  const uninstall = () => {
    const dir = skill.path.replace(/[\\/][^\\/]*$/, "");
    api
      .rpc("fs/remove", { path: dir, recursive: true })
      .catch(() => {})
      .finally(() => {
        onChanged?.();
        onClose();
      });
  };

  const tryNow = () => {
    // Reference behavior: defaultPrompt text followed by the skill chip.
    const dp = skill.interface?.defaultPrompt;
    const promptText = Array.isArray(dp) ? dp[0] || "" : dp || "";
    useStore.getState().newChatWithPrefill(
      promptText + (promptText ? " " : ""),
      [{ kind: "skill", name: skill.name, displayName: skillName(skill), path: skill.path, icon: skill.interface?.iconSmall || null }]
    );
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        role="dialog"
        className="flex h-[720px] max-h-full w-[600px] max-w-full flex-col overflow-hidden rounded-3xl bg-(--dropdown-bg)/90 shadow-lg ring-[0.5px] ring-(--border) backdrop-blur-xl"
      >
        <div className="flex h-full min-h-0 flex-col gap-0 px-5 py-5">
          {/* header row */}
          <div className="flex w-full flex-col">
            <div className="flex items-start justify-between">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-(--border) text-(--fg-secondary)">
                <SkillIcon skill={skill} />
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  role="switch"
                  aria-checked={enabled}
                  aria-label={enabled ? "Disable skill" : "Enable skill"}
                  onClick={toggle}
                  className="inline-flex h-7 cursor-pointer items-center"
                >
                  <span className={cx("relative inline-flex h-5 w-8 shrink-0 items-center rounded-full transition-colors", enabled ? "bg-(--accent)" : "bg-(--fg)/20")}>
                    <span
                      className={cx(
                        "h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                        enabled ? "translate-x-[14px]" : "translate-x-[2px]"
                      )}
                    />
                  </span>
                </button>
                <button
                  ref={moreRef}
                  type="button"
                  aria-label="More actions"
                  onClick={() => setMoreOpen(true)}
                  className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-lg text-(--fg-tertiary) hover:bg-(--surface-hover)"
                >
                  <IconDots21 size={18} />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="cursor-pointer rounded p-1 leading-none text-(--fg)/80 hover:bg-(--surface-hover)"
                >
                  <IconDialogX size={18} />
                </button>
              </div>
            </div>
            <div className="mt-3 flex flex-col items-start gap-1 self-stretch">
              <div className="flex min-w-0 items-center gap-2 text-[16px] font-semibold text-(--fg)">
                <div className="min-w-0 truncate">{skillName(skill)}</div>
                <div className="shrink-0 font-normal text-(--fg-secondary)">Skill</div>
              </div>
              <div className="text-sm leading-normal text-(--fg-secondary)">{skillDesc(skill)}</div>
            </div>
          </div>

          {/* body */}
          <div className="flex min-h-0 w-full flex-1 flex-col pt-4">
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-(--border-light)">
              <div className="h-full min-h-0 overflow-y-auto p-4 opacity-80">
                {body == null ? (
                  <div className="flex justify-center py-6 text-(--fg-tertiary)"><Spinner /></div>
                ) : (
                  <Markdown>{body}</Markdown>
                )}
              </div>
            </div>
          </div>

          {/* footer */}
          <div className="flex w-full items-center justify-between gap-2 pt-4">
            <button
              type="button"
              onClick={uninstall}
              className="flex h-7 cursor-pointer items-center gap-1 rounded-lg border border-transparent bg-(--danger)/10 px-2 text-sm leading-[18px] text-(--danger) hover:bg-(--danger)/20"
            >
              Uninstall
            </button>
            <button
              type="button"
              onClick={tryNow}
              className="flex h-7 cursor-pointer items-center gap-1 rounded-lg border border-transparent bg-(--fg) px-2 text-sm leading-[18px] text-(--dropdown-bg) hover:bg-(--fg)/80"
            >
              <IconTryChat size={14} />
              Try now
            </button>
          </div>
        </div>
      </div>
      <Menu
        open={moreOpen}
        anchor={() => moreRef.current?.getBoundingClientRect()}
        onClose={() => setMoreOpen(false)}
        align="end"
        width={160}
        items={[
          {
            id: "open",
            label: "Open",
            onSelect: () => {
              openFileInPanel(skill.path);
              onClose();
            },
          },
        ]}
      />
    </div>
  );
}

// =======================================================================
// Plugin detail page — opened from a directory card or the settings manage
// list. Header (icon/name/marketplace/desc + Install·Uninstall·Try now),
// Includes (skills from plugin/read), Information (capabilities, category,
// developer, version, links). Mirrors the reference detail page.
// =======================================================================
export function PluginDetailView({ plugin, onBack, onChanged }) {
  const t = useT();
  const toast = (m, k) => useStore.getState().toast(m, k);
  const [currentPlugin, setCurrentPlugin] = useState(plugin);
  const [detail, setDetail] = useState(null); // plugin/read result
  const [targets, setTargets] = useState([]);
  const [targetsLoading, setTargetsLoading] = useState(true);
  const [busyTargets, setBusyTargets] = useState(() => new Set());
  const [installAllBusy, setInstallAllBusy] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef(null);
  const [codexBusy, setCodexBusy] = useState(false);
  const activePlugin = currentPlugin || plugin;
  const slug = String(activePlugin.id || "").split("@")[0];

  useEffect(() => {
    let live = true;
    setDetail(null);
    Promise.resolve()
      .then(() => api.rpc("plugin/read", pluginRequestParams(activePlugin)))
      .then((r) => live && setDetail(r?.plugin || r || null))
      .catch(() => live && setDetail({}));
    return () => { live = false; };
  }, [activePlugin.id]);

  useEffect(() => {
    let live = true;
    setTargetsLoading(true);
    api.agentRuntimePluginTargets(pluginInstallDescriptor(activePlugin))
      .then((result) => {
        if (live) setTargets(result?.targets || []);
      })
      .catch((error) => {
        if (!live) return;
        setTargets([
          {
            id: "codex",
            label: "Codex",
            available: true,
            installed: activePlugin.installed === true,
            description: activePlugin.installed
              ? "Installed for Codex"
              : "Available from this Codex marketplace",
          },
          {
            id: "claude",
            label: "Claude Code",
            available: false,
            installed: false,
            reason: error.message,
          },
          {
            id: "kimi",
            label: "Kimi Code",
            available: false,
            installed: false,
            reason: error.message,
          },
        ]);
      })
      .finally(() => live && setTargetsLoading(false));
    return () => { live = false; };
  }, [
    activePlugin.id,
    activePlugin.installed,
    activePlugin.source?.path,
    activePlugin.installPath,
    activePlugin.root,
  ]);

  const reload = (candidate = activePlugin) =>
    api.rpc("plugin/list", {}).then((r) => {
      const flat = [];
      for (const mp of r?.marketplaces || []) for (const pl of mp.plugins || []) flat.push({ ...pl, _marketplace: mp.name, _marketplacePath: mp.path });
      onChanged?.(flat);
      const next = flat.find((item) => item.id === candidate.id) || candidate;
      setCurrentPlugin(next);
      return next;
    });

  const refreshTargets = async (candidate = activePlugin) => {
    setTargetsLoading(true);
    try {
      const result = await api.agentRuntimePluginTargets(
        pluginInstallDescriptor(candidate),
      );
      const next = result?.targets || [];
      setTargets(next);
      return next;
    } finally {
      setTargetsLoading(false);
    }
  };

  const setTargetBusy = (targetId, value) => {
    setBusyTargets((current) => {
      const next = new Set(current);
      if (value) next.add(targetId);
      else next.delete(targetId);
      return next;
    });
  };

  const iface = activePlugin.interface || {};
  const summary = detail?.summary;
  const skills = detail?.skills || [];
  const version = summary?.localVersion || activePlugin.localVersion || activePlugin.version;
  const developer = iface.developerName;
  const prompts = iface.defaultPrompt || [];
  const localizedPluginName = t(pluginName(activePlugin));

  const installFor = async (targetId) => {
    const target = targets.find((item) => item.id === targetId);
    setTargetBusy(targetId, true);
    let candidate = activePlugin;
    try {
      if (targetId === "codex") {
        await api.rpc("plugin/install", pluginRequestParams(activePlugin));
        candidate = await reload(candidate);
      } else {
        await api.agentRuntimePluginInstall(
          targetId,
          pluginInstallDescriptor(candidate),
        );
      }
    } catch (error) {
      toast(
        `${target?.label || runtimeMeta(targetId)?.label || targetId} install failed: ${error.message}`,
        "error",
      );
      setTargetBusy(targetId, false);
      return;
    }
    try {
      await refreshTargets(candidate);
      toast(t("Installed for {provider}", {
        provider: target?.label || runtimeMeta(targetId)?.label || targetId,
      }));
    } catch (error) {
      toast(
        `Installed for ${target?.label || runtimeMeta(targetId)?.label || targetId}, but status refresh failed: ${error.message}`,
        "error",
      );
    } finally {
      setTargetBusy(targetId, false);
    }
  };

  const installAll = async () => {
    setInstallAllBusy(true);
    try {
      let candidate = activePlugin;
      let currentTargets = targets;
      const successes = [];
      const failures = [];
      const codex = currentTargets.find((target) => target.id === "codex");
      let codexInstalled = false;
      if (codex?.available && !codex.installed) {
        try {
          await api.rpc("plugin/install", pluginRequestParams(activePlugin));
          candidate = await reload(candidate);
          successes.push(codex.label);
          codexInstalled = true;
        } catch (error) {
          failures.push({ label: codex.label, message: error.message });
        }
      }
      if (codexInstalled) {
        try {
          currentTargets = await refreshTargets(candidate);
        } catch (error) {
          failures.push({ label: "Status refresh", message: error.message });
        }
      }
      const external = currentTargets.filter((target) =>
        target.id !== "codex" && target.available && !target.installed
      );
      const results = await Promise.allSettled(
        external.map((target) =>
          api.agentRuntimePluginInstall(
            target.id,
            pluginInstallDescriptor(candidate),
          )
        ),
      );
      results.forEach((result, index) => {
        const target = external[index];
        if (result.status === "fulfilled") successes.push(target.label);
        else failures.push({
          label: target.label,
          message: result.reason?.message || String(result.reason),
        });
      });
      try {
        await refreshTargets(candidate);
      } catch (error) {
        failures.push({ label: "Status refresh", message: error.message });
      }
      if (failures.length) {
        const installed = successes.length
          ? `Installed for ${successes.join(", ")}. `
          : "";
        toast(
          `${installed}${failures.map((failure) =>
            `${failure.label}: ${failure.message}`
          ).join(" · ")}`,
          "error",
        );
      } else if (successes.length) {
        toast(`Installed for ${successes.join(", ")}`);
      }
    } finally {
      setInstallAllBusy(false);
    }
  };

  const uninstall = async () => {
    setCodexBusy(true);
    try {
      await api.rpc("plugin/uninstall", { pluginId: activePlugin.id });
      await reload();
      onBack();
    } catch (e) {
      toast(`Uninstall failed: ${e.message}`, "error");
    } finally {
      setCodexBusy(false);
    }
  };
  const tryNow = () => {
    const prompt = Array.isArray(prompts) ? prompts[0] : prompts;
    useStore.getState().newChatWithPrefill(prompt ? prompt + " " : "", [
      { kind: "skill", name: slug, displayName: localizedPluginName, path: "", icon: iface.composerIcon || iface.logo || null },
    ]);
  };
  const pendingTargets = targets.filter((target) =>
    target.available && !target.installed
  );

  const link = (url, label) =>
    url ? (
      <button className="text-(--accent) hover:underline" onClick={() => api.openExternal(url)}>
        {t(label)}
      </button>
    ) : (
      <span className="text-(--fg-tertiary)">—</span>
    );

  return (
    <div className="flex h-full min-w-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto border-t border-(--border-light)">
        <div className="mx-auto w-full max-w-[48rem] px-5 pb-10 pt-4">
          <button
            onClick={onBack}
            className="mb-4 flex h-7 items-center gap-1 rounded-lg px-2 text-sm text-(--fg-secondary) hover:bg-(--surface-hover) hover:text-(--fg)"
          >
            <IconChevronDown size={14} className="rotate-90" />
            {t("Back")}
          </button>

          {/* header */}
          <div className="flex items-start gap-4">
            <PluginIcon plugin={activePlugin} size={56} />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[22px] font-semibold">{localizedPluginName}</h1>
                {activePlugin._marketplace === "personal" && <span className="shrink-0 text-sm text-(--fg-tertiary)">{t("Personal")}</span>}
              </div>
              <div className="mt-0.5 text-sm text-(--fg-secondary)">{t(iface.shortDescription || "")}</div>
              <div className="mt-1 text-xs text-(--fg-tertiary)">
                {[developer, version].filter(Boolean).join(" · ")}
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              {activePlugin.installed && (
                <>
                  <button
                    onClick={tryNow}
                    className="flex h-7 items-center gap-1 rounded-lg bg-(--fg) px-2.5 text-sm text-(--dropdown-bg) hover:bg-(--fg)/80"
                  >
                    <IconTryChat size={14} />
                    {t("Try now")}
                  </button>
                  <button
                    onClick={uninstall}
                    disabled={codexBusy}
                    className="flex h-7 items-center rounded-lg border border-(--border) px-2.5 text-sm text-(--danger) hover:bg-(--danger)/10"
                  >
                    {t("Uninstall from Codex")}
                  </button>
                  <button
                    ref={moreRef}
                    aria-label={t("More actions")}
                    onClick={() => setMoreOpen(true)}
                    className="flex h-7 w-7 items-center justify-center rounded-lg border border-(--border) text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
                  >
                    <IconDots21 size={16} />
                  </button>
                </>
              )}
            </div>
          </div>

          <SectionHeader title="Install for" className="pt-6" />
          <div className="mt-2 overflow-hidden rounded-2xl border border-(--border-light) bg-(--surface-under)">
            <div className="divide-y divide-(--border-light)">
              {targets.map((target) => {
                const targetBusy = busyTargets.has(target.id);
                const meta = runtimeMeta(target.id);
                return (
                  <div key={target.id} className="flex min-h-14 items-center gap-3 px-4 py-3">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--surface)">
                      {meta?.icon(20, "shrink-0")}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="text-[13px] font-medium">{target.label}</div>
                      <div
                        className="truncate text-[12px] text-(--fg-tertiary)"
                        title={t(target.reason || target.description || "")}
                      >
                        {t(target.reason || target.description || "Checking compatibility…")}
                      </div>
                    </div>
                    {targetsLoading && !target.description && !target.reason ? (
                      <span className="px-2 text-(--fg-tertiary)"><Spinner /></span>
                    ) : target.installed ? (
                      <span className="shrink-0 rounded-full bg-(--success)/15 px-2.5 py-1 text-[11px] font-medium text-(--success)">
                        {t("Installed")}
                      </span>
                    ) : target.available ? (
                      <button
                        onClick={() => installFor(target.id)}
                        disabled={targetBusy || installAllBusy}
                        className="h-7 shrink-0 rounded-lg border border-(--border) bg-(--surface) px-3 text-[12px] hover:bg-(--surface-hover) disabled:opacity-40"
                      >
                        {t(targetBusy ? "Installing…" : "Install")}
                      </button>
                    ) : (
                      <span className="shrink-0 px-1 text-[11px] text-(--fg-faint)">
                        {t("Unavailable")}
                      </span>
                    )}
                  </div>
                );
              })}
              {targetsLoading && targets.length === 0 && (
                <div className="flex min-h-20 items-center justify-center text-(--fg-tertiary)">
                  <Spinner />
                </div>
              )}
            </div>
            <div className="flex items-center justify-between gap-4 border-t border-(--border-light) bg-(--surface) px-4 py-3">
              <div>
                <div className="text-[13px] font-medium">{t("All compatible providers")}</div>
                <div className="text-[12px] text-(--fg-tertiary)">
                  {t("Install this plugin everywhere a compatible package is available.")}
                </div>
              </div>
              <button
                onClick={installAll}
                disabled={
                  installAllBusy ||
                  targetsLoading ||
                  pendingTargets.length === 0 ||
                  busyTargets.size > 0
                }
                className="h-8 shrink-0 rounded-lg bg-(--fg) px-3.5 text-[12px] font-medium text-(--dropdown-bg) hover:bg-(--fg)/80 disabled:opacity-40"
              >
                {installAllBusy
                  ? t("Installing…")
                  : targetsLoading
                    ? t("Checking…")
                  : pendingTargets.length
                    ? t("Install all")
                    : t("All available installed")}
              </button>
            </div>
          </div>

          {/* prompt chips: every defaultPrompt, like the reference cards */}
          {prompts.length > 0 && (
            <div className="mt-4 flex flex-col gap-2">
              {(Array.isArray(prompts) ? prompts : [prompts]).filter(Boolean).map((p) => (
                <button
                  key={p}
                  onClick={() =>
                    useStore.getState().newChatWithPrefill(p + " ", [
                      { kind: "skill", name: slug, displayName: localizedPluginName, path: "", icon: iface.composerIcon || iface.logo || null },
                    ])
                  }
                  className="flex items-center gap-2.5 rounded-xl border border-(--border-light) bg-(--surface-under) px-3 py-2.5 text-left text-[13px] hover:bg-(--fg)/5"
                >
                  <span className="flex size-6 shrink-0 items-center justify-center">
                    <PluginIcon plugin={activePlugin} size={18} />
                  </span>
                  <span className="shrink-0 font-medium">{localizedPluginName}</span>
                  <span className="min-w-0 flex-1 truncate">{t(p)}</span>
                </button>
              ))}
            </div>
          )}

          {iface.longDescription && (
            <p className="mt-5 text-sm leading-relaxed text-(--fg-secondary)">{t(iface.longDescription)}</p>
          )}

          {/* Includes */}
          {detail === null ? (
            <div className="mt-8 flex justify-center text-(--fg-tertiary)"><Spinner /></div>
          ) : (
            <>
              {(detail.apps || []).length > 0 && (
                <>
                  <SectionHeader title={t("Apps · {count}", { count: detail.apps.length })} className="pt-8" />
                  <div className="mt-2 divide-y divide-(--border-light) rounded-2xl border border-(--border-light)">
                    {detail.apps.map((a) => (
                      <div key={a.id || a.name} className="flex items-center gap-3 px-4 py-3">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium">{t(appDisplayName(a))}</div>
                          {a.description && <div className="line-clamp-2 text-[12px] text-(--fg-tertiary)">{t(a.description)}</div>}
                        </div>
                        <span className="shrink-0 rounded-full bg-(--success)/15 px-2 py-0.5 text-[11px] font-medium text-(--success)">{t("Connected")}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
              {skills.length > 0 && (
                <>
                  <SectionHeader title={t("Skills · {count}", { count: skills.length })} className="pt-8" />
                  <div className="mt-2 divide-y divide-(--border-light) rounded-2xl border border-(--border-light)">
                    {skills.map((s) => (
                      <div key={s.name} className="flex items-center gap-3 px-4 py-3">
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-(--surface)">
                          {s.interface?.iconSmall ? (
                            <img src={api.localFileUrl(s.interface.iconSmall)} alt="" className="size-6 rounded object-cover" />
                          ) : (
                            <IconSkillCube size={20} />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13px] font-medium">{t(s.interface?.displayName || s.name)}</div>
                          <div className="truncate text-[12px] text-(--fg-tertiary)">
                            {t(s.interface?.shortDescription || s.shortDescription || s.description || "")}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {/* Information */}
          <SectionHeader title="Information" className="pt-8" />
          <div className="mt-2 divide-y divide-(--border-light) rounded-2xl border border-(--border-light)">
            {[
              ["Capabilities", (iface.capabilities || []).map((capability) => t(capability)).join(", ") || null],
              ["Developer", developer || null],
              ["Category", iface.category ? t(iface.category) : null],
              ["Version", version || null],
              ["Website", iface.websiteUrl ? link(iface.websiteUrl, iface.websiteUrl.replace(/^https?:\/\//, "").replace(/\/$/, "")) : null],
              ["Privacy policy", iface.privacyPolicyUrl ? link(iface.privacyPolicyUrl, "Privacy policy") : null],
              ["Terms of service", iface.termsOfServiceUrl ? link(iface.termsOfServiceUrl, "Terms of service") : null],
            ]
              .filter(([, v]) => v)
              .map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <span className="text-[13px] text-(--fg-secondary)">{t(k)}</span>
                  <span className="truncate text-[13px]">{v}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
      <Menu
        open={moreOpen}
        anchor={() => moreRef.current?.getBoundingClientRect()}
        onClose={() => setMoreOpen(false)}
        align="end"
        width={180}
        items={[
          {
            id: "share",
            label: "Share",
            disabled: !detail?.shareUrl,
            onSelect: () => {
              navigator.clipboard?.writeText(detail.shareUrl).catch(() => {});
              toast("Link copied");
            },
          },
          {
            id: "manage",
            label: "Manage",
            onSelect: () => useStore.getState().setUi({ settingsOpen: true, settingsSection: "plugins" }),
          },
          { sep: true },
          { id: "uninstall", label: "Uninstall from Codex", danger: true, onSelect: uninstall },
        ]}
      />
    </div>
  );
}

// Age labels for PR rows: m/h/d/w/mo/y like the reference inbox.
function shortAge(ts) {
  if (!ts) return "";
  const ms = ts > 1e12 ? ts : ts * 1000;
  const diff = Math.max(0, Date.now() - ms);
  if (diff < 3600e3) return `${Math.max(1, Math.round(diff / 60e3))}m`;
  if (diff < 86400e3) return `${Math.round(diff / 3600e3)}h`;
  if (diff < 7 * 86400e3) return `${Math.round(diff / 86400e3)}d`;
  if (diff < 30 * 86400e3) return `${Math.round(diff / (7 * 86400e3))}w`;
  if (diff < 365 * 86400e3) return `${Math.round(diff / (30 * 86400e3))}mo`;
  return `${Math.round(diff / (365 * 86400e3))}y`;
}

// Connector ids read as "connector_openai_codex_document_control" — the
// reference detail page renders them title-cased ("Codex Document Control").
function appDisplayName(a) {
  const raw = a.displayName || a.name || a.id || "";
  const words = raw
    .replace(/^connector_/, "")
    .split(/[_\-\s]+/)
    .filter(Boolean);
  // "connector_openai_codex_document_control" → "Codex Document Control".
  if (words[0] && words[0].toLowerCase() === "openai") words.shift();
  return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}
