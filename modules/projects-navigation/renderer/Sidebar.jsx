// Left sidebar: product header + search toggle, nav rows, client-owned pins,
// runtime / project / thread tree, account footer (archived / help / settings).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useStore, runtimeConnected, planLabel } from "@app/store.js";
import { cx } from "@app/lib/cx.js";
import { isPathInside } from "@app/lib/time.js";
import { externalProjectId, normalizeProjectPath } from "@modules/agent-runtimes";
import {
  codexRateLimitSections,
  codexRateLimitWindows,
  codexRemainingPercent,
  codexResetDate,
} from "@modules/agent-runtimes";
import { openExternal, toggleQuickChat, showItemInFolder, rpc, logout } from "@app/api.js";
import { Menu, Dialog, Spinner, IconButton } from "@app/components/ui.jsx";
import { EXTERNAL_RUNTIMES, RUNTIMES, runtimeMeta } from "@modules/agent-runtimes";
import {
  IconPlus, IconSearch, IconMore, IconGear, IconArchive, IconPencil,
  IconTrash, IconUndo, IconChevronDown, IconChevronRight, IconFolder, IconFolderFilled, IconClock,
  IconUsage, IconInvite, IconLogout, IconBranch, IconX, IconGlobe,
  IconHelpCircle, IconNavNewChat, IconNavPullRequests, IconNavScheduled, IconNavPlugins,
  IconCircleAlert, IconPin, IconPinFilled, IconQuickChat, IconRefresh,
} from "@app/components/icons.jsx";
import {
  formatHomePath,
  showInFileManager,
} from "@modules/host-copy";

const NAV_ITEMS = [
  { id: "pull-requests", label: "Pull requests", icon: <IconNavPullRequests size={16} /> },
  { id: "scheduled", label: "Scheduled", icon: <IconNavScheduled size={16} /> },
  { id: "plugins", label: "Plugins", icon: <IconNavPlugins size={16} /> },
];

const HELP_URL = "https://developers.openai.com/codex/";

// ---------------------------------------------------------------------------
export default function Sidebar() {
  const threads = useStore((s) => s.threads);
  const threadsLoading = useStore((s) => s.threadsLoading);
  // External history sources (registry-driven; hook order stable because the
  // registry is a fixed module-level array).
  const external = EXTERNAL_RUNTIMES.map((r) => ({
    meta: r,
    threads: useStore((s) => s[r.stateKeys.threads]),
    loading: useStore((s) => s[r.stateKeys.loading]),
    error: useStore((s) => s[r.stateKeys.error]),
    configDir: useStore((s) => s[r.stateKeys.configDir]),
  }));
  const archivedView = useStore((s) => s.archivedView);
  const searchTerm = useStore((s) => s.searchTerm);
  const navView = useStore((s) => s.ui.navView);
  const gs = useStore((s) => s.gs);
  const pinnedThreadIds = useStore((s) => s.pinnedThreadIds);
  const pinnedProjectIds = useStore((s) => s.pinnedProjectIds);
  const runtimeOrder = useStore((s) => s.runtimeOrder);

  const [searchOpen, setSearchOpen] = useState(false);
  const [renaming, setRenaming] = useState(null); // {id, name}
  const [expand, setExpand] = useState({}); // section key -> bool override

  const model = useMemo(
    () => buildSidebarModel(threads, gs, pinnedProjectIds, pinnedThreadIds, !archivedView),
    [threads, gs, pinnedProjectIds, pinnedThreadIds, archivedView],
  );
  // Per-source filtered threads + project grouping (registry-driven).
  const externalSections = useMemo(
    () => external.map((r) => ({
      ...r,
      projects: buildExternalProjects(
        filterThreadsByQuery(r.threads, searchTerm).filter((thread) => !pinnedThreadIds.includes(thread.id)),
        gs,
        r.meta.id,
      ).filter((project) => !pinnedProjectIds.includes(project.id)),
    })),
    // deps: one thread-list slot per external source + the other inputs
    [...external.map((r) => r.threads), searchTerm, gs, pinnedThreadIds, pinnedProjectIds],
  );
  const pinnedExternalProjects = useMemo(
    () => external.flatMap((r) =>
      buildExternalProjects(
        r.threads.filter((thread) => !pinnedThreadIds.includes(thread.id)),
        gs,
        r.meta.id,
      )
    ).filter((project) => pinnedProjectIds.includes(project.id)),
    [...external.map((r) => r.threads), gs, pinnedThreadIds, pinnedProjectIds],
  );
  const codexProjects = useMemo(() => {
    const projects = [...model.projects];
    if (model.chats.length) {
      projects.push({
        id: "codex:other-chats",
        kind: "virtual",
        runtime: "codex",
        name: "Other chats",
        path: "",
        rootPaths: [],
        threads: model.chats,
      });
    }
    return projects;
  }, [model.projects, model.chats]);
  const pinnedThreads = useMemo(() => {
    if (archivedView) return [];
    const allThreads = [...threads, ...external.flatMap((r) => r.threads)];
    const byId = new Map(allThreads.map((thread) => [thread.id, thread]));
    return pinnedThreadIds.map((id) => byId.get(id)).filter(Boolean);
  }, [threads, ...external.map((r) => r.threads), pinnedThreadIds, archivedView]);
  const showPinned = !archivedView
    && (model.pinned.length > 0 || pinnedExternalProjects.length > 0 || pinnedThreads.length > 0);

  const isOpen = (key, dflt = true) => expand[key] ?? dflt;
  const toggleOpen = (key, cur) => setExpand((e) => ({ ...e, [key]: !cur }));

  const closeSearch = () => {
    setSearchOpen(false);
    useStore.getState().setSearchTerm("");
  };

  const onScroll = (e) => {
    const el = e.currentTarget;
    const { threadsCursor: c, threadsLoading: l, loadThreads } = useStore.getState();
    if (c && !l && el.scrollTop + el.clientHeight > el.scrollHeight - 200) {
      loadThreads({ append: true });
    }
  };

  const onRename = (t) => setRenaming({ id: t.id, name: t.name || t.preview || "" });
  const empty = model.projects.length === 0
    && model.chats.length === 0
    && model.pinned.length === 0
    && pinnedThreads.length === 0
    && (archivedView || (filteredClaudeThreads.length === 0 && filteredKimiThreads.length === 0));

  return (
    <div className="app-sidebar flex h-full w-full flex-col">
      {/* 46px spacer: the floating global header occupies the top strip */}
      <div className="h-[46px] shrink-0" />
      {/* wordmark row + search (global header sits above the sidebar) */}
      <div className="flex h-[32px] shrink-0 items-center justify-between pl-4 pr-2">
        <WordmarkMenu />
        <IconButton
          icon={<IconSearch />}
          size={16}
          title="Search chats"
          active={searchOpen}
          onClick={() => (searchOpen ? closeSearch() : setSearchOpen(true))}
        />
      </div>

      {/* search field (toggled from the header) */}
      {searchOpen && (
        <div className="shrink-0 px-2 pb-2">
          <div className="flex h-[30px] items-center gap-2 rounded-full border border-(--border-light) bg-(--surface) px-3">
            <IconSearch size={13} className="shrink-0 text-(--fg-tertiary)" />
            <input
              autoFocus
              className="w-full bg-transparent text-[13px] outline-none placeholder:text-(--fg-faint)"
              placeholder="Search chats and history"
              value={searchTerm}
              onChange={(e) => useStore.getState().setSearchTerm(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Escape") closeSearch(); }}
              onBlur={() => { if (!useStore.getState().searchTerm) setSearchOpen(false); }}
            />
          </div>
        </div>
      )}

      {/* primary nav */}
      <div className="mt-2 flex shrink-0 flex-col gap-px px-2 pb-1">
        <div className="group/nav relative">
          <NavRow
            icon={<IconNavNewChat size={16} />}
            label="New chat"
            compact
            onClick={() => {
              const s = useStore.getState();
              s.setUi({ navView: "chats" });
              s.newChat();
            }}
          />
          <button
            title="Quick chat"
            className="absolute top-1/2 right-1.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded-md text-(--fg-tertiary) opacity-0 transition-opacity group-hover/nav:opacity-100 hover:bg-(--surface-active) hover:text-(--fg)"
            onClick={(e) => { e.stopPropagation(); toggleQuickChat(); }}
          >
            <IconQuickChat size={14} />
          </button>
        </div>
        {NAV_ITEMS.map((n) => (
          <NavRow
            key={n.id}
            icon={n.icon}
            label={n.label}
            active={navView === n.id}
            onClick={() => useStore.getState().setUi({ navView: n.id })}
          />
        ))}
      </div>

      {/* pinned + projects + chats tree */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-2" onScroll={onScroll}>
        {showPinned && (
          <>
            <SectionLabel>Pinned</SectionLabel>
            {pinnedThreads.map((t) => runtimeOfThread(t) === "codex" ? (
              <ThreadRow
                key={`pt:${t.id}`}
                thread={t}
                active={t.id === useStore.getState().activeThreadId}
                archived={false}
                onRename={() => onRename(t)}
              />
            ) : (
              <ExternalThreadRow key={`pt:${t.id}`} thread={t} runtime={runtimeOfThread(t)} />
            ))}
            {model.pinned.map((p) => (
              <ProjectSection
                key={`pin:${p.id}`}
                project={p}
                runtime="codex"
                open={isOpen(`pin:${p.id}`)}
                onToggle={() => toggleOpen(`pin:${p.id}`, isOpen(`pin:${p.id}`))}
                archived={false}
                onRename={onRename}
              />
            ))}
            {pinnedExternalProjects.map((project) => (
              <ProjectSection
                key={`pin:${project.id}`}
                project={project}
                runtime={project.runtime}
                open={isOpen(`pin:${project.id}`)}
                onToggle={() => toggleOpen(`pin:${project.id}`, isOpen(`pin:${project.id}`))}
                archived={false}
                onRename={() => {}}
              />
            ))}
          </>
        )}

        {runtimeOrder.map((runtime) => {
          if (runtime === "codex") {
            return (
              <React.Fragment key="codex">
                <RuntimeHeader
                  runtime="codex"
                  label="Codex"
                  loading={threadsLoading}
                  open={isOpen("runtime:codex")}
                  onToggle={() => toggleOpen("runtime:codex", isOpen("runtime:codex"))}
                  onRefresh={() => useStore.getState().loadThreads()}
                />
                {isOpen("runtime:codex") && (
                  <>
                    {codexProjects.map((p) => (
                      <ProjectSection
                        key={`proj:${p.id}`}
                        project={p}
                        runtime="codex"
                        nested
                        open={isOpen(`proj:${p.id}`)}
                        onToggle={() => toggleOpen(`proj:${p.id}`, isOpen(`proj:${p.id}`))}
                        archived={archivedView}
                        onRename={onRename}
                      />
                    ))}
                    {!archivedView && codexProjects.length === 0 && !threadsLoading && (
                      <RuntimeEmpty searching={!!searchTerm.trim()} label="Codex" />
                    )}
                  </>
                )}
              </React.Fragment>
            );
          }
          if (archivedView) return null;
          const section = externalSections.find((s) => s.meta.id === runtime);
          if (!section) return null;
          return (
            <RuntimeProjectSection
              key={runtime}
              runtime={runtime}
              label={section.meta.label}
              projects={section.projects}
              loading={section.loading}
              error={section.error}
              configDir={section.configDir}
              searching={!!searchTerm.trim()}
              open={isOpen(`runtime:${runtime}`)}
              onToggle={() => toggleOpen(`runtime:${runtime}`, isOpen(`runtime:${runtime}`))}
              isOpen={isOpen}
              toggleOpen={toggleOpen}
            />
          );
        })}

        {empty && !threadsLoading && (
          <div className="px-3 pt-8 text-center text-[13px] text-(--fg-tertiary)">
            {archivedView ? "No archived chats" : "No chats"}
          </div>
        )}
        {threadsLoading && (
          <div className="flex justify-center py-3 text-(--fg-tertiary)"><Spinner /></div>
        )}
      </div>

      {/* footer */}
      <UsageNudge />
      <Footer archivedView={archivedView} />

      <RenameDialog renaming={renaming} onClose={() => setRenaming(null)} />
    </div>
  );
}

// ---------------------------------------------------------------------------
function NavRow({ icon, label, active, compact = false, onClick }) {
  return (
    <button
      className={cx(
        "flex w-full items-center gap-2 rounded-[12.5px] pl-2 text-left text-[14px]",
        compact ? "h-[29px] pr-1" : "h-[30px] pr-2",
        active ? "bg-(--sidebar-row-active) text-(--fg)" : "hover:bg-(--surface-hover)"
      )}
      onClick={onClick}
    >
      <span className="flex h-4 w-4 shrink-0 items-center justify-center">{icon}</span>
      <span className="text-fade-truncate min-w-0 flex-1">{label}</span>
    </button>
  );
}

function SectionLabel({ children }) {
  return <div className="px-4 pt-4 pb-1 text-[14px] font-medium text-(--fg-tertiary)">{children}</div>;
}

// ---------------------------------------------------------------------------
// A project row (folder + name + optional remote-host suffix) with its threads.
// Shows at most 5 threads, then a "Show more" row — like the reference app.
// ---------------------------------------------------------------------------
const THREAD_CAP = 5;

function ProjectSection({ project, runtime = "codex", nested = false, open, onToggle, archived, onRename }) {
  const activeThreadId = useStore((s) => s.activeThreadId);
  const draftAt = useStore((s) => s.draftAt);
  const navView = useStore((s) => s.ui.navView);
  const storeCwd = useStore((s) => s.cwd);
  const pinned = useStore((s) => s.pinnedProjectIds.includes(project.id));
  const gs = useStore((s) => s.gs);
  const allLocalProjects = useMemo(
    () => Object.entries(gs?.["local-projects"] || {}).map(([id, p]) => ({ id, rootPaths: p.rootPaths || [] })),
    [gs]
  );
  const [showAll, setShowAll] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoverCard, setHoverCard] = useState(false);
  const hoverTimer = useRef(null);
  const menuBtnRef = useRef(null);
  const rowRef = useRef(null);
  const attention = useStore((s) =>
    s.approvals.some((a) => project.threads.some((t) => t.id === a.threadId))
  );

  // The new-chat draft lives in the best-matching (longest rootPath) project.
  const draftHere =
    !archived && !activeThreadId && navView === "chats" && project.kind === "local" &&
    (() => {
      let best = null;
      for (const p of allLocalProjects) {
        for (const rp of p.rootPaths) {
          if (rp && isPathInside(storeCwd, rp) && (!best || rp.length > best.len)) {
            best = { id: p.id, len: rp.length };
          }
        }
      }
      return best?.id === project.id;
    })();

  // Threads sorted by recency; the draft row slots in at its own recency.
  const rows = useMemo(() => {
    const list = project.threads.map((t) => ({ type: "thread", t, at: t.updatedAt || 0 }));
    if (draftHere) list.push({ type: "draft", at: draftAt || 0 });
    list.sort((a, b) => b.at - a.at);
    return list;
  }, [project.threads, draftHere, draftAt]);

  const visible = showAll ? rows : rows.slice(0, THREAD_CAP);
  const hidden = rows.length - visible.length;

  const newChatHere = (e) => {
    e?.stopPropagation();
    const s = useStore.getState();
    s.newChat();
    if (project.path) s.setCwd(project.path);
    s.setRuntime(runtime);
    s.setUi({ navView: "chats" });
  };

  return (
    <div>
      <div
        ref={rowRef}
        className={cx(
          "group/proj relative mx-2 flex h-[30px] cursor-pointer select-none items-center gap-2 rounded-[12.5px] pr-2 hover:bg-(--surface-hover)",
          nested ? "pl-6" : "pl-2",
        )}
        onClick={onToggle}
        onMouseEnter={() => { clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setHoverCard(true), 550); }}
        onMouseLeave={() => { clearTimeout(hoverTimer.current); setHoverCard(false); }}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center text-(--fg-secondary)">
          <span className="group-hover/proj:hidden">
            <IconFolderFilled size={16} />
          </span>
          <span className="hidden group-hover/proj:block">
            <IconChevronRight
              size={14}
              className={cx("transition-transform duration-100", open && "rotate-90")}
            />
          </span>
        </span>
        <span className="min-w-0 flex-1 truncate text-[14px]">
          {project.name}
          {project.hostName && (
            <span className="ml-2 text-(--fg-tertiary)">{project.hostName}</span>
          )}
        </span>
        {attention && (
          <IconCircleAlert size={14} className="shrink-0 text-(--danger)" />
        )}
        {project.kind !== "remote" && project.kind !== "virtual" && !!project.path && (
          <button
            className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-(--fg-tertiary) hover:bg-(--surface-active) hover:text-(--fg) group-hover/proj:flex"
            title={`Start new chat in ${project.name}`}
            onClick={newChatHere}
          >
            <IconPlus size={14} />
          </button>
        )}
        <button
          ref={menuBtnRef}
          className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-(--fg-tertiary) hover:bg-(--surface-active) hover:text-(--fg) group-hover/proj:flex"
          title="Project actions"
          onClick={(e) => { e.stopPropagation(); setMenuOpen(true); }}
        >
          <IconMore size={14} />
        </button>
        <Menu
          open={menuOpen}
          anchor={() => rowRef.current?.getBoundingClientRect()}
          onClose={() => setMenuOpen(false)}
          align="end"
          items={[
            ...(project.kind !== "remote" && project.kind !== "virtual" && project.path
              ? [{ id: "new", label: `New chat in ${project.name}`, icon: <IconPlus size={14} />, onSelect: () => newChatHere() }]
              : []),
            {
              id: "pin",
              label: pinned ? "Unpin project" : "Pin project",
              icon: <IconPin size={14} />,
              onSelect: () => useStore.getState().togglePinnedProjectId(project.id),
            },
            ...(project.path && project.kind !== "remote"
              ? [{ id: "explorer", label: showInFileManager, icon: <IconFolder size={14} />, onSelect: () => showItemInFolder(project.path) }]
              : []),
          ]}
        />
        {hoverCard && !menuOpen && (
          <div
            className="pointer-events-none fixed z-50 w-60 rounded-xl border border-(--border) bg-(--dropdown-bg) px-3 py-2.5"
            style={{ left: Math.round((rowRef.current?.getBoundingClientRect().right ?? 0) - 8), top: Math.round((rowRef.current?.getBoundingClientRect().top ?? 0) - 6), boxShadow: "var(--shadow-menu)" }}
          >
            <div className="min-w-0 truncate text-[14px] font-medium">{project.name}</div>
            <div className="mt-0.5 text-xs text-(--fg-tertiary)">
              {project.threads.length} {project.threads.length === 1 ? "thread" : "threads"}
            </div>
            <div className="mt-1 flex items-center gap-1.5 text-xs text-(--fg-secondary)">
              <IconFolder size={12} className="shrink-0 text-(--fg-tertiary)" />
              <span className="min-w-0 truncate">{displayPath(project.path)}</span>
            </div>
          </div>
        )}
      </div>

      {open && (
        <>
          {rows.length === 0 ? (
            <div className="mx-2 flex h-[30px] items-center pl-8 pr-2 text-[13px] text-(--fg-faint)">
              No chats
            </div>
          ) : (
            <>
              {visible.map((row) =>
                row.type === "draft" ? (
                  <DraftRow key="draft" />
                ) : (
                  runtime === "codex" ? (
                    <ThreadRow
                      key={row.t.id}
                      thread={row.t}
                      active={row.t.id === activeThreadId}
                      archived={archived}
                      onRename={() => onRename(row.t)}
                    />
                  ) : (
                    <ExternalThreadRow key={row.t.id} thread={row.t} runtime={runtime} />
                  )
                )
              )}
              {hidden > 0 && (
                <button
                  className="mx-2 flex h-[30px] w-[calc(100%-16px)] items-center pl-8 pr-2 text-left text-[13px] text-(--fg-tertiary) hover:text-(--fg)"
                  onClick={() => setShowAll(true)}
                >
                  Show more
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// The in-project "New chat" draft row (active when the draft view is open).
function DraftRow() {
  return (
    <div className="mx-2 flex h-[30px] cursor-pointer items-center gap-2 rounded-[12.5px] bg-(--sidebar-row-active) pl-8 pr-1 text-(--fg)">
      <span className="min-w-0 flex-1 truncate text-[14px]">New chat</span>
    </div>
  );
}

// Projectless threads ("Chats" section), capped like projects.
function ChatList({ threads, archived, onRename }) {
  const activeThreadId = useStore((s) => s.activeThreadId);
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? threads : threads.slice(0, THREAD_CAP);
  const hidden = threads.length - visible.length;
  return (
    <>
      {visible.map((t) => (
        <ThreadRow
          key={t.id}
          thread={t}
          active={t.id === activeThreadId}
          archived={archived}
          onRename={() => onRename(t)}
        />
      ))}
      {hidden > 0 && (
        <button
          className="mx-2 flex h-[30px] w-[calc(100%-16px)] items-center pl-8 pr-2 text-left text-[13px] text-(--fg-tertiary) hover:text-(--fg)"
          onClick={() => setShowAll(true)}
        >
          Show more
        </button>
      )}
    </>
  );
}

function RuntimeHeader({ runtime, label, loading, configDir, open, onToggle, onRefresh }) {
  return (
    <div className={cx("px-2", open ? "pt-4 pb-1" : "pt-1 pb-1")}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        className="group/runtime flex h-[30px] cursor-pointer items-center gap-2 rounded-[12.5px] px-2 text-[14px] font-medium text-(--fg-tertiary) hover:bg-(--surface-hover)"
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle?.();
          }
        }}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          {runtimeMeta(runtime)?.icon(14, "shrink-0")}
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
        {onRefresh && (
          <button
            className={cx(
              "flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-(--fg-tertiary) transition-opacity hover:bg-(--surface-active) hover:text-(--fg)",
              loading ? "cursor-default" : "opacity-0 group-hover/runtime:opacity-100 focus-visible:opacity-100",
            )}
            title={configDir ? `Refresh history from ${configDir}` : `Refresh ${label}`}
            disabled={loading}
            onClick={(event) => {
              event.stopPropagation();
              onRefresh();
            }}
          >
            {loading ? <Spinner size={11} /> : <IconRefresh size={12} />}
          </button>
        )}
        <IconChevronRight
          size={14}
          className={cx("shrink-0 transition-transform duration-100", open && "rotate-90")}
        />
      </div>
    </div>
  );
}

function RuntimeEmpty({ searching, label }) {
  return (
    <div className="px-4 py-2 text-[12px] text-(--fg-faint)">
      {searching ? `No matching ${label} sessions` : `No local ${label} sessions`}
    </div>
  );
}

function RuntimeProjectSection({
  runtime,
  label,
  projects,
  loading,
  error,
  configDir,
  searching,
  open,
  onToggle,
  isOpen,
  toggleOpen,
}) {
  const refresh = () => {
    const loader = runtimeMeta(runtime)?.loaderName;
    if (loader) useStore.getState()[loader]();
  };
  return (
    <>
      <RuntimeHeader
        runtime={runtime}
        label={label}
        loading={loading}
        configDir={configDir}
        open={open}
        onToggle={onToggle}
        onRefresh={refresh}
      />
      {open && projects.map((project) => {
        const key = `${runtime}:${project.id}`;
        const projectOpen = isOpen(key);
        return (
          <ProjectSection
            key={key}
            project={project}
            runtime={runtime}
            nested
            open={projectOpen}
            onToggle={() => toggleOpen(key, projectOpen)}
            archived={false}
            onRename={() => {}}
          />
        );
      })}
      {open && !loading && !error && projects.length === 0 && (
        <RuntimeEmpty searching={searching} label={label} />
      )}
      {open && error && (
        <button
          className="mx-2 rounded-lg px-2 py-1.5 text-left text-[12px] text-(--danger) hover:bg-(--surface-hover)"
          title={error}
          onClick={refresh}
        >
          Could not read {label} history · Retry
        </button>
      )}
    </>
  );
}

function ExternalThreadRow({ thread, runtime }) {
  const active = useStore((s) => s.activeThreadId === thread.id);
  const pinned = useStore((s) => s.pinnedThreadIds.includes(thread.id));
  const [menuOpen, setMenuOpen] = useState(false);
  const rowRef = useRef(null);
  const claude = runtime === "claude";
  const label = claude ? "Claude" : "Kimi";
  const title = thread.name || firstLine(thread.preview) || `${label} Code session`;
  const age = shortAge(thread.updatedAt || thread.createdAt);
  const copy = (value, label) => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    useStore.getState().toast(`${label} copied to clipboard`);
  };
  return (
    <div
      ref={rowRef}
      className={cx(
        "group/external relative mx-2 flex h-[30px] cursor-pointer items-center gap-2 rounded-[12.5px] pl-8 pr-2",
        active ? "bg-(--sidebar-row-active) text-(--fg)" : "hover:bg-(--surface-hover)"
      )}
      title={`${title}${thread.cwd ? `\n${thread.cwd}` : ""}`}
      onClick={() => useStore.getState().openThread(thread.id)}
      onContextMenu={(event) => {
        event.preventDefault();
        setMenuOpen(true);
      }}
    >
      <span className="min-w-0 flex-1 truncate text-[14px] leading-5">{title}</span>
      {pinned && <IconPinFilled size={12} className="shrink-0 text-(--fg-tertiary) group-hover/external:hidden" />}
      {age && <span className="shrink-0 text-[10px] text-(--fg-faint) group-hover/external:hidden">{age}</span>}
      <button
        className="hidden h-5 w-5 shrink-0 items-center justify-center rounded text-(--fg-tertiary) hover:bg-(--surface-active) hover:text-(--fg) group-hover/external:flex"
        title={`${label} session actions`}
        onClick={(event) => {
          event.stopPropagation();
          setMenuOpen(true);
        }}
      >
        <IconMore size={13} />
      </button>
      <Menu
        open={menuOpen}
        anchor={() => rowRef.current?.getBoundingClientRect()}
        align="end"
        onClose={() => setMenuOpen(false)}
        items={[
          {
            id: "pin",
            label: pinned ? "Unpin chat" : "Pin chat",
            icon: <IconPin size={14} />,
            onSelect: () => useStore.getState().togglePinnedThread(thread.id),
          },
          { sep: true },
          {
            id: "show-transcript",
            label: showInFileManager,
            disabled: !thread.path,
            onSelect: () => thread.path && showItemInFolder(thread.path),
          },
          {
            id: "copy-id",
            label: "Copy session ID",
            onSelect: () => copy(thread.sessionId, "Session ID"),
          },
          {
            id: "copy-cwd",
            label: "Copy working directory",
            disabled: !thread.cwd,
            onSelect: () => copy(thread.cwd, "Working directory"),
          },
        ]}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Product wordmark (product switching dropdown was removed).
function WordmarkMenu() {
  return (
    <div className="-ml-2 flex h-8 items-center rounded-xl px-2 py-0.5 text-[17px] leading-6">
      <span className="truncate font-openai-sans font-semibold">ChatGPT</span>
    </div>
  );
}

function ThreadRow({ thread, active, archived, onRename }) {  const needsInput = useStore((s) => s.approvals.some((a) => a.threadId === thread.id));
  const pinned = useStore((s) => s.pinnedThreadIds.includes(thread.id));
  const [menuOpen, setMenuOpen] = useState(false);
  const [hoverCard, setHoverCard] = useState(false);
  const hoverTimer = useRef(null);
  const btnRef = useRef(null);

  const running = thread.status?.type === "active";
  const title = thread.name || firstLine(thread.preview) || "New chat";

  const open = () => useStore.getState().openThread(thread.id);
  const menuItems = [
    { id: "rename", label: "Rename chat", icon: <IconPencil size={14} />, onSelect: onRename },
    {
      id: "pin",
      label: pinned ? "Unpin chat" : "Pin chat",
      icon: <IconPin size={14} />,
      onSelect: () => useStore.getState().togglePinnedThread(thread.id),
    },
    { sep: true },
    archived
      ? { id: "unarchive", label: "Unarchive chat", icon: <IconUndo size={14} />, onSelect: () => useStore.getState().unarchiveThread(thread.id) }
      : { id: "archive", label: "Archive chat", icon: <IconArchive size={14} />, onSelect: () => useStore.getState().archiveThread(thread.id) },
    ...(archived
      ? [
          { sep: true },
          { id: "delete", label: "Delete chat", icon: <IconTrash size={14} />, danger: true, onSelect: () => useStore.getState().deleteThread(thread.id) },
        ]
      : []),
  ];

  const rowRef = useRef(null);
  return (
    <div
      ref={rowRef}
      className={cx(
        "group/thr relative mx-2 flex h-[30px] cursor-pointer items-center gap-2 rounded-[12.5px] pl-8 pr-1",
        active ? "bg-(--sidebar-row-active) text-(--fg)" : "hover:bg-(--surface-hover)"
      )}
      onClick={open}
      onContextMenu={(e) => { e.preventDefault(); setMenuOpen(true); }}
      onMouseEnter={() => { clearTimeout(hoverTimer.current); hoverTimer.current = setTimeout(() => setHoverCard(true), 550); }}
      onMouseLeave={() => { clearTimeout(hoverTimer.current); setHoverCard(false); }}
    >
      <span className="min-w-0 flex-1 truncate text-[14px] leading-5">{title}</span>
      {pinned && <IconPinFilled size={12} className="shrink-0 text-(--fg-tertiary) group-hover/thr:hidden" />}
      {needsInput && <IconCircleAlert size={13} className="shrink-0 text-(--danger)" />}
      {running && (active
        ? <Spinner size={12} className="shrink-0 text-(--fg-tertiary)" />
        : <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-(--accent)" />
      )}
      {/* hover actions: pin + archive grouped flush right (like the reference client) */}
      <span className="hidden shrink-0 items-center gap-0.5 group-hover/thr:flex">
        <button
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-(--fg-tertiary) hover:bg-(--surface-active) hover:text-(--fg)"
          title={pinned ? "Unpin chat" : "Pin chat"}
          onClick={(e) => { e.stopPropagation(); useStore.getState().togglePinnedThread(thread.id); }}
        >
          {pinned ? <IconPinFilled size={13} /> : <IconPin size={13} />}
        </button>
        <button
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-(--fg-tertiary) hover:bg-(--surface-active) hover:text-(--fg)"
          title={archived ? "Unarchive chat" : "Archive chat"}
          onClick={(e) => { e.stopPropagation(); archived ? useStore.getState().unarchiveThread(thread.id) : useStore.getState().archiveThread(thread.id); }}
        >
          <IconArchive size={13} />
        </button>
      </span>
      <Menu
        open={menuOpen}
        anchor={() => rowRef.current?.getBoundingClientRect()}
        items={menuItems}
        onClose={() => setMenuOpen(false)}
        align="end"
      />
      {hoverCard && !menuOpen && <ThreadHoverCard thread={thread} title={title} anchor={rowRef} />}
    </div>
  );
}

// Floating card shown when hovering a thread row (reference: title + age on
// the first row, then project and repo rows).
function ThreadHoverCard({ thread, title, anchor }) {
  const project = useStore((s) => {
    const gs = s.gs || {};
    const local = gs["local-projects"] || {};
    const asn = gs["thread-project-assignments"]?.[thread.id];
    if (asn && local[asn.projectId]) return local[asn.projectId].name;
    const cwd = thread.cwd || "";
    let best = null;
    for (const p of Object.values(local)) {
      for (const rp of p.rootPaths || []) {
        if (rp && isPathInside(cwd, rp) && (!best || rp.length > best.len)) best = { name: p.name, len: rp.length };
      }
    }
    return best?.name || null;
  });
  const repo = (() => {
    const origin = thread.gitInfo?.originUrl || "";
    if (origin) return origin.replace(/\.git$/, "").split("/").pop();
    return thread.gitInfo?.branch || null;
  })();
  const age = shortAge(thread.updatedAt || thread.createdAt);
  const r = anchor.current?.getBoundingClientRect();
  if (!r) return null;
  return (
    <div
      className="pointer-events-none fixed z-50 w-56 rounded-xl border border-(--border) bg-(--dropdown-bg) px-3 py-2.5"
      style={{ left: Math.round(r.right - 8), top: Math.round(r.top - 6), boxShadow: "var(--shadow-menu)" }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className="min-w-0 truncate text-[13px] font-medium">{title}</span>
        {age && <span className="shrink-0 text-xs text-(--fg-tertiary)">{age}</span>}
      </div>
      {project && (
        <div className="mt-1.5 flex items-center gap-2 text-xs text-(--fg-secondary)">
          <IconFolder size={12} className="shrink-0 text-(--fg-tertiary)" />
          <span className="min-w-0 truncate">{project}</span>
        </div>
      )}
      {repo && (
        <div className="mt-1 flex items-center gap-2 text-xs text-(--fg-secondary)">
          <IconBranch size={12} className="shrink-0 text-(--fg-tertiary)" />
          <span className="min-w-0 truncate">{repo}</span>
        </div>
      )}
    </div>
  );
}

// "15m" / "3h" / "2d" / "Jul 3" — relative age like the reference hover card.
function shortAge(ts) {
  if (!ts) return null;
  const ms = ts > 1e12 ? ts : ts * 1000;
  const diff = Math.max(0, Date.now() - ms);
  if (diff < 90e3) return "1m";
  if (diff < 3600e3) return `${Math.round(diff / 60e3)}m`;
  if (diff < 86400e3) return `${Math.round(diff / 3600e3)}h`;
  if (diff < 7 * 86400e3) return `${Math.round(diff / 86400e3)}d`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// ---------------------------------------------------------------------------
// Low-usage nudge card above the footer (reference: "4% usage remaining"
// with reset schedule, progress bar and Add credits button).
// ---------------------------------------------------------------------------
let usageCache = null;
function UsageNudge() {
  const codexConnected = useStore((s) => runtimeConnected(s, "codex"));
  const [usage, setUsage] = useState(usageCache);
  const [dismissed, setDismissed] = useState(false);
  useEffect(() => {
    if (!codexConnected) {
      usageCache = null;
      setUsage(null);
      return undefined;
    }
    let live = true;
    const load = () =>
      rpc("account/rateLimits/read", {})
        .then((r) => {
          if (!live) return;
          usageCache = r?.rateLimits || null;
          setUsage(usageCache);
        })
        .catch(() => {});
    load();
    const t = setInterval(load, 5 * 60 * 1000);
    return () => { live = false; clearInterval(t); };
  }, [codexConnected]);

  const primary = usage?.primary;
  if (!primary || dismissed) return null;
  const remaining = Math.max(0, 100 - (primary.usedPercent ?? 0));
  if (remaining > 25) return null; // reference shows the nudge only when low

  const weekly = (primary.windowDurationMins || 0) >= 7 * 24 * 60 - 1;
  const reset = primary.resetsAt ? new Date(primary.resetsAt * 1000) : null;
  const resetStr = reset
    ? `${reset.getMonth() + 1}月${reset.getDate()}日 at ${String(reset.getHours()).padStart(2, "0")}:${String(reset.getMinutes()).padStart(2, "0")}`
    : null;

  return (
    <div className="mx-2 mb-2 rounded-xl border border-(--border-light) bg-(--surface) p-3">
      <div className="flex items-start justify-between gap-2">
        <span className="text-[13px] font-medium">{remaining}% usage remaining</span>
        <button
          className="flex h-4 w-4 shrink-0 items-center justify-center text-(--fg-tertiary) hover:text-(--fg)"
          title="Dismiss"
          onClick={() => setDismissed(true)}
        >
          <IconX size={12} />
        </button>
      </div>
      <div className="mt-1 text-xs leading-relaxed text-(--fg-tertiary)">
        {weekly ? "Resets every week" : "Resets periodically"}
        {resetStr && ` · Next reset is on ${resetStr}`}
      </div>
      <div className="mt-2.5 h-1 overflow-hidden rounded-full bg-(--surface-active)">
        <div className="h-full rounded-full bg-(--fg)" style={{ width: `${Math.max(2, remaining)}%` }} />
      </div>
      <button
        className="mt-3 h-8 w-full rounded-full bg-(--fg) text-[13px] font-medium text-(--surface) hover:opacity-90"
        onClick={() => openExternal("https://chatgpt.com/pricing")}
      >
        Add credits
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
function Footer() {
  const account = useStore((s) => s.account);
  const profile = useStore((s) => s.profile);
  const archivedView = useStore((s) => s.archivedView);
  const email = account?.email || "";
  const displayName = profile?.name || (email ? email.split("@")[0] : "Not signed in");
  const [menuOpen, setMenuOpen] = useState(false);
  const [providerOpen, setProviderOpen] = useState(false);
  const profileRef = useRef(null);

  return (
    <div className="shrink-0 border-t border-(--border-light) px-2">
      <div className="flex h-[46px] items-center gap-2">
        {/* profile menu (avatar + name), like the reference footer */}
        <button
          ref={profileRef}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1 text-left hover:bg-(--surface-hover)"
          title="Open profile menu"
          onClick={() => setMenuOpen(true)}
        >
          {profile?.photo ? (
            <img src={profile.photo} alt="" className="h-5 w-5 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-(--accent-soft) text-[10px] font-semibold text-(--accent)">
              {(displayName || "?")[0].toUpperCase()}
            </span>
          )}
          <span className="min-w-0 flex-1 truncate text-[14px] text-(--fg)">{displayName}</span>
        </button>
        <IconButton
          icon={<IconHelpCircle />}
        size={18}
          title="Help"
          onClick={() => openExternal(HELP_URL)}
        />
      </div>
      <Menu
        open={menuOpen}
        anchor={() => profileRef.current?.getBoundingClientRect()}
        onClose={() => setMenuOpen(false)}
        width={220}
        items={[
          { id: "usage", label: "Usage remaining", icon: <IconUsage size={14} />, onSelect: () => useStore.getState().setUi({ settingsOpen: true, settingsSection: "usage" }) },
          { id: "provider", label: "Provider", icon: <IconGlobe size={14} />, onSelect: () => setProviderOpen(true) },
          { sep: true },
          { id: "settings", label: "Settings", hint: "Ctrl+,", icon: <IconGear size={14} />, onSelect: () => useStore.getState().setUi({ settingsOpen: true }) },
          { id: "logout", label: "Log out", icon: <IconLogout size={14} />, onSelect: () => logout() },
        ]}
      />
      <ProviderDialog open={providerOpen} onClose={() => setProviderOpen(false)} />
    </div>
  );
}

// Provider popup: one tab per vendor. Codex shows its account and limits;
// CLI vendors only show their locally detected credential state.
function ProviderDialog({ open, onClose }) {
  const account = useStore((s) => s.account);
  const externalAuth = useStore((s) => s.externalAuth);
  const requiresOpenaiAuth = useStore((s) => s.requiresOpenaiAuth);
  const [tab, setTab] = useState("codex");

  // External logins finish in a separate console window; poll while open.
  useEffect(() => {
    if (!open) return;
    useStore.getState().refreshExternalAuth();
    const t = setInterval(() => useStore.getState().refreshExternalAuth(), 4000);
    return () => clearInterval(t);
  }, [open]);

  const authState = { account, externalAuth, requiresOpenaiAuth };
  const meta = runtimeMeta(tab);
  const connected = runtimeConnected(authState, tab);

  return (
    <Dialog open={open} title="Providers" onClose={onClose} width={420}>
      {/* vendor tabs, with a connection dot on each */}
      <div className="mb-4 flex gap-1 rounded-xl border border-(--border-light) bg-(--surface-under) p-1">
        {RUNTIMES.map((m) => (
          <button
            key={m.id}
            className={cx(
              "flex h-8 flex-1 items-center justify-center gap-1.5 rounded-lg text-[12px] transition-colors",
              tab === m.id ? "bg-(--surface) font-medium shadow-sm" : "text-(--fg-tertiary) hover:text-(--fg)",
            )}
            onClick={() => setTab(m.id)}
          >
            {m.icon(14)}
            <span className="truncate">{m.label}</span>
            <span className={cx(
              "h-1.5 w-1.5 shrink-0 rounded-full",
              runtimeConnected(authState, m.id) ? "bg-(--success)" : "bg-(--fg-faint)",
            )} />
          </button>
        ))}
      </div>
      {connected
        ? <ProviderAccount key={tab} runtime={tab} meta={meta} />
        : <ProviderLogin runtime={tab} meta={meta} />}
    </Dialog>
  );
}

// Centered login prompt for a vendor that is not connected.
function ProviderLogin({ runtime, meta }) {
  const loginStatus = useStore((s) => s.loginStatus);
  const codex = runtime === "codex";
  const waiting = codex && (loginStatus === "starting" || loginStatus === "waiting" || loginStatus === "completing");
  return (
    <div className="flex flex-col items-center gap-3 py-8">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-(--border-light) bg-(--surface-under)">
        {meta?.icon(24)}
      </span>
      <div className="text-[12px] text-(--fg-tertiary)">Not signed in to {meta?.label}</div>
      <button
        className="rounded-full bg-(--fg) px-4 py-1.5 text-[13px] font-medium text-(--surface) disabled:opacity-60"
        disabled={waiting}
        onClick={() => {
          if (codex) useStore.getState().startChatgptLogin();
          else useStore.getState().startExternalLogin(runtime);
        }}
      >
        {waiting ? "Signing in…" : "Log in"}
      </button>
    </div>
  );
}

// Account card for a connected vendor. Kimi intentionally stays credential-
// only here: the CLI owns token refresh and the client does not fetch web profile or
// quota data.
function ProviderAccount({ runtime, meta }) {
  const account = useStore((s) => s.account);
  const profile = useStore((s) => s.profile);
  const externalAuth = useStore((s) => s.externalAuth);
  const codex = runtime === "codex";

  const name = codex
    ? profile?.name || account?.email || "Codex account"
    : meta?.label;
  const accountLine = codex
    ? account?.email || "Signed in"
    : runtime === "claude"
      ? externalAuth?.claude?.detail === "oauth_token" ? "OAuth token" : externalAuth?.claude?.detail || "Signed in"
      : externalAuth?.kimi?.detail === "oauth_credentials" ? "OAuth credentials" : "Saved credentials";
  const plan = codex ? planLabel(account?.planType) : null;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        {codex && profile?.photo ? (
          <img src={profile.photo} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-(--border-light) bg-(--surface-under)">
            {meta?.icon(22)}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] font-medium">{name}</div>
          <div className="truncate text-[12px] text-(--fg-tertiary)">{accountLine}</div>
        </div>
        {plan && <span className="ml-auto shrink-0 text-[14px] font-medium">{plan}</span>}
      </div>
      {codex
        ? <CodexUsage />
        : runtime === "claude"
          ? <UsageUnavailable label="Claude Code" />
          : null}
    </div>
  );
}

// Small "x% left" bar, same visual language as Settings → Usage.
function UsageBar({ label, pctLeft, reset }) {
  const pct = Math.max(0, Math.min(100, Math.round(pctLeft)));
  return (
    <div>
      <div className="flex items-baseline justify-between text-[12px]">
        <span>{label}</span>
        <span className="text-(--fg-tertiary)">{reset && <>Resets {reset} · </>}{pct}% left</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-(--surface-active)">
        <div
          className={cx("h-full rounded-full", pct <= 15 ? "bg-(--danger)" : pct <= 40 ? "bg-(--warning)" : "bg-(--success)")}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

function UsageUnavailable({ label }) {
  return (
    <div className="rounded-xl border border-(--border-light) bg-(--surface-under) px-3 py-2.5 text-[12px] text-(--fg-tertiary)">
      Usage data is not available for {label}.
    </div>
  );
}

// Codex rate limits via the app-server (same RPC as Settings → Usage).
function CodexUsage() {
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState(false);
  const [resetMsg, setResetMsg] = useState(null);
  const load = () => {
    setFailed(false);
    return rpc("account/rateLimits/read", {})
      .then((r) => setData(r))
      .catch(() => setFailed(true));
  };
  useEffect(() => {
    load();
  }, []);
  if (failed) return <UsageUnavailable label="Codex" />;
  if (!data) return <div className="flex justify-center py-3 text-(--fg-tertiary)"><Spinner size={14} /></div>;
  const sections = codexRateLimitSections(data)
    .map((section) => ({
      ...section,
      windows: codexRateLimitWindows(section.snapshot),
    }))
    .filter((section) => section.windows.length);
  if (!sections.length) return <UsageUnavailable label="Codex" />;
  const resetSummary = data?.rateLimitResetCredits;
  const resetCount = Number(resetSummary?.availableCount || 0);
  const resets = Array.isArray(resetSummary?.credits) ? resetSummary.credits : [];
  const useReset = (creditId) => {
    setResetMsg(null);
    rpc("account/rateLimitResetCredit/consume", {
      creditId,
      idempotencyKey: globalThis.crypto.randomUUID(),
    })
      .then(() => {
        setResetMsg("Rate limits reset");
        return load();
      })
      .catch((error) => setResetMsg(`Reset failed: ${error.message}`));
  };
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-(--border-light) bg-(--surface-under) px-3 py-2.5">
      {sections.map((section) => (
        <div key={section.id} className="flex flex-col gap-2">
          {sections.length > 1 && (
            <div className="text-[11px] font-medium text-(--fg-secondary)">{section.name}</div>
          )}
          {section.windows.map(({ id, label, window }) => (
            <UsageBar
              key={id}
              label={label}
              pctLeft={codexRemainingPercent(window)}
              reset={codexResetDate(window.resetsAt)}
            />
          ))}
        </div>
      ))}
      {resetSummary && (
        <div className="flex flex-col gap-2 border-t border-(--border-light) pt-2">
          <div className="flex items-center justify-between text-[11px] text-(--fg-tertiary)">
            <span>Usage limit resets</span>
            <span>{resetCount} available</span>
          </div>
          {resets.map((credit) => (
            <div key={credit.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <div className="truncate text-[12px] text-(--fg-secondary)">
                  {credit.title || "Full reset"}
                </div>
                <div className="truncate text-[11px] text-(--fg-tertiary)">
                  {credit.expiresAt ? `Expires ${codexResetDate(credit.expiresAt, true)}` : credit.status || "No expiry reported"}
                </div>
              </div>
              {credit.status === "available" && (
                <button
                  className="shrink-0 rounded-full border border-(--border) px-2.5 py-1 text-[11px] hover:bg-(--surface-hover)"
                  onClick={() => useReset(credit.id)}
                >
                  Use reset
                </button>
              )}
            </div>
          ))}
          {resets.length < resetCount && (
            <div className="text-[11px] text-(--fg-tertiary)">
              {resetCount - resets.length} reset {resetCount - resets.length === 1 ? "detail is" : "details are"} not available.
            </div>
          )}
          {resetMsg && <div className="text-[11px] text-(--fg-tertiary)">{resetMsg}</div>}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
function RenameDialog({ renaming, onClose }) {
  const [value, setValue] = useState("");
  React.useEffect(() => { if (renaming) setValue(renaming.name); }, [renaming]);
  if (!renaming) return null;
  const submit = () => {
    const v = value.trim();
    if (v) useStore.getState().renameThread(renaming.id, v);
    onClose();
  };
  return (
    <Dialog open title="Rename chat" onClose={onClose}>
      <div className="mb-1 text-xs text-(--fg-tertiary)">Keep it short and recognizable.</div>
      <input
        autoFocus
        className="mt-2 w-full rounded-lg border border-(--border) bg-(--surface) px-3 py-2 text-[13px] outline-none focus:border-(--accent)"
        placeholder="Add a title…"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
      />
      <div className="mt-4 flex justify-end gap-2">
        <button className="rounded-lg px-3 py-1.5 text-[13px] text-(--fg-secondary) hover:bg-(--surface-hover)" onClick={onClose}>Cancel</button>
        <button className="rounded-lg bg-(--accent) px-3 py-1.5 text-[13px] font-medium text-(--accent-fg) hover:opacity-90" onClick={submit}>Save</button>
      </div>
    </Dialog>
  );
}

// ---------------------------------------------------------------------------
// Build the sidebar model from threads + the shared codex global state
// (%USERPROFILE%\.codex\.codex-global-state.json) — the same source the official desktop
// app uses, so both apps render the same projects/pins/order.
// ---------------------------------------------------------------------------
function buildSidebarModel(
  threads,
  gs,
  pinnedProjectIds = [],
  pinnedThreadIds = [],
  excludePinned = false,
) {
  const local = gs?.["local-projects"] || {};
  const remote = gs?.["remote-projects"] || [];
  const order = gs?.["project-order"] || [];
  const pinnedIds = pinnedProjectIds;
  // Pinned threads live in the Pinned section only, never duplicated under
  // their project / the chats list. In the archived view the Pinned section
  // is hidden, so pinned archived threads stay listed in place.
  const pinnedThreadSet = new Set(excludePinned ? pinnedThreadIds : []);
  const assignments = gs?.["thread-project-assignments"] || {};
  const hostNames = {};
  for (const c of gs?.["codex-managed-remote-connections"] || []) {
    if (c.hostId && c.displayName) hostNames[c.hostId] = c.displayName;
  }

  const projects = new Map(); // id -> project
  for (const [id, p] of Object.entries(local)) {
    projects.set(id, {
      id,
      kind: "local",
      name: p.name || "Project",
      path: (p.rootPaths || [])[0] || "",
      rootPaths: p.rootPaths || [],
      branch: null,
      hostName: null,
      threads: [],
    });
  }
  for (const rp of remote) {
    if (!rp?.id) continue;
    projects.set(rp.id, {
      id: rp.id,
      kind: "remote",
      name: rp.label || rp.remotePath || "Remote",
      path: rp.remotePath || "",
      rootPaths: [],
      branch: null,
      hostName: hostNames[rp.hostId] || null,
      threads: [],
    });
  }

  const localList = [...projects.values()].filter((p) => p.kind === "local");
  const matchProject = (t) => {
    const a = assignments[t.id];
    if (a && projects.has(a.projectId)) return a.projectId;
    const cwd = t.cwd || "";
    if (!cwd) return null;
    let best = null; // longest rootPath wins (exact match or parent dir)
    for (const p of localList) {
      for (const rp of p.rootPaths) {
        if (!rp) continue;
        if (isPathInside(cwd, rp)) {
          if (!best || rp.length > best.len) best = { id: p.id, len: rp.length };
        }
      }
    }
    return best?.id || null;
  };

  const chats = [];
  for (const t of threads) {
    if (pinnedThreadSet.has(t.id)) continue;
    const pid = matchProject(t);
    if (pid) {
      const p = projects.get(pid);
      p.threads.push(t);
      if (!p.branch) {
        const b = t.gitInfo?.branch;
        if (b && b !== "main" && b !== "master") p.branch = b;
      }
    } else {
      chats.push(t);
    }
  }

  const byRecency = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);
  for (const p of projects.values()) p.threads.sort(byRecency);
  chats.sort(byRecency);

  const orderedIds = [...order, ...[...projects.keys()].filter((id) => !order.includes(id))];
  const pinnedSet = new Set(pinnedIds);
  const pinned = pinnedIds.map((id) => projects.get(id)).filter(Boolean);
  const rest = orderedIds.map((id) => projects.get(id)).filter((p) => p && !pinnedSet.has(p.id));
  return { pinned, projects: rest, chats };
}

function filterThreadsByQuery(list, searchTerm) {
  const query = searchTerm.trim().toLowerCase();
  if (!query) return list;
  return list.filter((thread) =>
    `${thread.name || ""} ${thread.preview || ""} ${thread.cwd || ""}`.toLowerCase().includes(query)
  );
}

function buildExternalProjects(threads, gs, runtime) {
  const localProjects = Object.entries(gs?.["local-projects"] || {}).map(([id, project]) => ({
    id,
    name: project.name || "Project",
    rootPaths: project.rootPaths || [],
  }));
  const projects = new Map();

  for (const thread of threads) {
    const cwd = thread.cwd || "";
    let matched = null;
    for (const project of localProjects) {
      for (const rootPath of project.rootPaths) {
        if (rootPath && isPathInside(cwd, rootPath) && (!matched || rootPath.length > matched.rootPath.length)) {
          matched = { project, rootPath };
        }
      }
    }

    const normalizedCwd = normalizeProjectPath(cwd);
    const fallbackName = normalizedCwd.split(/[\\/]/).filter(Boolean).at(-1) || "Other sessions";
    const key = matched
      ? `project:${matched.project.id}`
      : normalizedCwd ? `cwd:${normalizedCwd.toLowerCase()}` : "other";
    if (!projects.has(key)) {
      projects.set(key, {
        id: matched
          ? externalProjectId(runtime, normalizedCwd, matched.project.id)
          : normalizedCwd ? externalProjectId(runtime, normalizedCwd) : `${runtime}:other`,
        kind: normalizedCwd ? "external" : "virtual",
        runtime,
        name: matched?.project.name || fallbackName,
        path: matched?.rootPath || normalizedCwd,
        rootPaths: matched?.project.rootPaths || (normalizedCwd ? [normalizedCwd] : []),
        branch: null,
        hostName: null,
        threads: [],
      });
    }
    projects.get(key).threads.push(thread);
  }

  const byRecency = (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0);
  for (const project of projects.values()) project.threads.sort(byRecency);
  return [...projects.values()].sort((a, b) =>
    (b.threads[0]?.updatedAt || 0) - (a.threads[0]?.updatedAt || 0)
  );
}

function runtimeOfThread(thread) {
  if (thread?.runtime === "claude" || thread?.source === "claude" || thread?.id?.startsWith("claude:")) {
    return "claude";
  }
  if (thread?.runtime === "kimi" || thread?.source === "kimi" || thread?.id?.startsWith("kimi:")) {
    return "kimi";
  }
  return "codex";
}

function firstLine(s) {
  return (s || "").split("\n")[0].trim();
}

function displayPath(p) {
  const home = useStore.getState().appInfo?.home || "";
  return formatHomePath(p, home);
}
