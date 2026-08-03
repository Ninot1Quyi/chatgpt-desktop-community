import React, { useRef, useState } from "react";
import { useStore } from "@app/store.js";
import { cx } from "@app/lib/cx.js";
import { useT } from "@app/i18n.jsx";
import { Sidebar } from "@modules/projects-navigation";
import { IconButton, Menu } from "@app/components/ui.jsx";
import {
  IconChevronDown,
  IconGear,
  IconRefresh,
  IconPlus,
  IconX,
  LucideIcon,
} from "@app/components/icons.jsx";
import { LazyTerminalTab } from "./lazy-panels.jsx";
import "./styles.css";

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function DragHandle({ onStart, onDrag, onEnd }) {
  return (
    <div
      className="drag-handle group relative z-20 w-0 shrink-0 cursor-col-resize bg-transparent"
      onMouseDown={(event) => {
        event.preventDefault();
        onStart?.(event);
        const startX = event.clientX;
        let latestDelta = 0;
        let frame = null;
        const flush = () => {
          frame = null;
          onDrag(latestDelta);
        };
        const move = (nextEvent) => {
          latestDelta = nextEvent.clientX - startX;
          if (frame == null) frame = window.requestAnimationFrame(flush);
        };
        const up = () => {
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", up);
          if (frame != null) {
            window.cancelAnimationFrame(frame);
            flush();
          }
          onEnd?.(latestDelta);
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
      }}
    >
      <div className="drag-handle-hit absolute inset-y-0 -left-2 w-[1.0625rem]" />
      <div
        className="drag-handle-line absolute inset-y-0 left-0 w-[0.0625rem] opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        style={{
          background: "linear-gradient(to bottom, transparent, color-mix(in oklab, var(--fg) 25%, transparent), transparent)",
        }}
      />
    </div>
  );
}

const DEFAULT_RIGHT_PANEL_RATIO = 0.28;
const MIN_RIGHT_PANEL_RATIO = 0.18;
const MAX_RIGHT_PANEL_RATIO = 0.6;

function normalizedRightPanelRatio(value) {
  const ratio = Number(value);
  return clamp(
    Number.isFinite(ratio) ? ratio : DEFAULT_RIGHT_PANEL_RATIO,
    MIN_RIGHT_PANEL_RATIO,
    MAX_RIGHT_PANEL_RATIO,
  );
}

export function rightPanelResponsiveStyle(ratio) {
  return {
    "--right-panel-size": `${normalizedRightPanelRatio(ratio) * 100}vw`,
  };
}

// Mid-drag panel collapse, mirroring the reference app: once the dragged size
// drops below half the panel minimum, the panel plays its close animation
// while the drag is still active (children freeze at the rendered width so
// they fade instead of reflowing). Dragging back above the threshold reverses
// the animation; releasing below it commits the close.
const PANEL_COLLAPSE_TRANSITION = "max-width 180ms cubic-bezier(0.2,0,0.13,1), opacity 150ms ease";

function beginPanelCollapse(panel) {
  const width = panel.getBoundingClientRect().width;
  for (const child of panel.children) {
    child.style.width = `${width}px`;
    child.style.minWidth = `${width}px`;
  }
  panel.style.overflow = "hidden";
  panel.style.transition = PANEL_COLLAPSE_TRANSITION;
  panel.style.minWidth = "0";
  panel.style.maxWidth = "0";
  panel.style.opacity = "0";
}

function revertPanelCollapse(panel) {
  panel.style.minWidth = "";
  panel.style.maxWidth = "";
  panel.style.opacity = "";
  for (const child of panel.children) {
    child.style.width = "";
    child.style.minWidth = "";
  }
}

function resetPanelCollapse(panel) {
  panel.style.transition = "";
  panel.style.overflow = "";
  revertPanelCollapse(panel);
}

export function RightPanelDragHandle({ panelRefs }) {
  const ratio = useStore((state) => state.ui.rightPanelRatio);
  const setUi = useStore((state) => state.setUi);
  const baseRatio = useRef(normalizedRightPanelRatio(ratio));
  const pendingRatio = useRef(normalizedRightPanelRatio(ratio));
  const collapsing = useRef(false);
  pendingRatio.current = normalizedRightPanelRatio(ratio);
  const forEachPanel = (fn) => {
    for (const ref of panelRefs) {
      if (ref.current) fn(ref.current);
    }
  };

  return (
    <DragHandle
      onStart={() => {
        forEachPanel(resetPanelCollapse);
        const panel = panelRefs.find((ref) => ref.current)?.current;
        const renderedRatio = panel
          ? panel.getBoundingClientRect().width / Math.max(1, window.innerWidth)
          : ratio;
        baseRatio.current = normalizedRightPanelRatio(renderedRatio);
        pendingRatio.current = baseRatio.current;
        collapsing.current = false;
      }}
      onDrag={(delta) => {
        const rawRatio = baseRatio.current - delta / Math.max(1, window.innerWidth);
        const shouldCollapse = rawRatio < MIN_RIGHT_PANEL_RATIO / 2;
        if (shouldCollapse !== collapsing.current) {
          collapsing.current = shouldCollapse;
          forEachPanel(shouldCollapse ? beginPanelCollapse : revertPanelCollapse);
        }
        if (collapsing.current) return;
        const next = normalizedRightPanelRatio(rawRatio);
        pendingRatio.current = next;
        for (const ref of panelRefs) {
          ref.current?.style.setProperty("--right-panel-size", `${next * 100}vw`);
        }
      }}
      onEnd={(delta) => {
        if (collapsing.current) {
          collapsing.current = false;
          setUi({ rightOpen: false });
          return;
        }
        forEachPanel(resetPanelCollapse);
        if (delta) setUi({ rightPanelRatio: pendingRatio.current });
      }}
    />
  );
}

const DEFAULT_SIDEBAR_RATIO = 0.16;
const MIN_SIDEBAR_RATIO = 0.11;
const MAX_SIDEBAR_RATIO = 0.3;

function normalizedSidebarRatio(value) {
  const ratio = Number(value);
  return clamp(
    Number.isFinite(ratio) ? ratio : DEFAULT_SIDEBAR_RATIO,
    MIN_SIDEBAR_RATIO,
    MAX_SIDEBAR_RATIO,
  );
}

export function sidebarResponsiveStyle(ratio) {
  return {
    "--sidebar-size": `${normalizedSidebarRatio(ratio) * 100}vw`,
  };
}

export function SidebarColumn() {
  const sidebarOpen = useStore((state) => state.ui.sidebarOpen);
  const sidebarRatio = useStore((state) => state.ui.sidebarRatio);
  const setUi = useStore((state) => state.setUi);
  const panelRef = useRef(null);
  const baseRatio = useRef(normalizedSidebarRatio(sidebarRatio));
  const pendingRatio = useRef(normalizedSidebarRatio(sidebarRatio));
  const collapsing = useRef(false);
  pendingRatio.current = normalizedSidebarRatio(sidebarRatio);
  if (!sidebarOpen) return null;
  return (
    <>
      <div
        ref={panelRef}
        className="sidebar-frame slide-in-left shrink-0"
        style={sidebarResponsiveStyle(sidebarRatio)}
      >
        <Sidebar />
      </div>
      <DragHandle
        onStart={() => {
          if (panelRef.current) resetPanelCollapse(panelRef.current);
          const renderedRatio = panelRef.current
            ? panelRef.current.getBoundingClientRect().width / Math.max(1, window.innerWidth)
            : sidebarRatio;
          baseRatio.current = normalizedSidebarRatio(renderedRatio);
          pendingRatio.current = baseRatio.current;
          collapsing.current = false;
        }}
        onDrag={(delta) => {
          const rawRatio = baseRatio.current + delta / Math.max(1, window.innerWidth);
          const shouldCollapse = rawRatio < MIN_SIDEBAR_RATIO / 2;
          if (shouldCollapse !== collapsing.current) {
            collapsing.current = shouldCollapse;
            if (panelRef.current) {
              if (shouldCollapse) {
                beginPanelCollapse(panelRef.current);
              } else {
                revertPanelCollapse(panelRef.current);
              }
            }
          }
          if (collapsing.current) return;
          const next = normalizedSidebarRatio(rawRatio);
          pendingRatio.current = next;
          panelRef.current?.style.setProperty("--sidebar-size", `${next * 100}vw`);
        }}
        onEnd={(delta) => {
          if (collapsing.current) {
            collapsing.current = false;
            setUi({ sidebarOpen: false });
            return;
          }
          if (panelRef.current) resetPanelCollapse(panelRef.current);
          if (delta) {
            setUi({ sidebarRatio: pendingRatio.current });
          }
        }}
      />
    </>
  );
}

export function CollapsedSidebar({ header }) {
  const ui = useStore((state) => state.ui);
  const setUi = useStore((state) => state.setUi);
  if (ui.sidebarOpen) return null;
  return (
    <>
      <div
        className="absolute inset-y-0 left-0 z-40 w-2.5"
        onMouseEnter={() => setUi({ sidebarPeek: true })}
      />
      <div
        className={cx(
          "sidebar-frame absolute inset-y-0 left-0 z-40 transition-transform duration-200 ease-[cubic-bezier(0.2,0,0.13,1)]",
          ui.sidebarPeek ? "translate-x-0" : "-translate-x-full",
        )}
        style={sidebarResponsiveStyle(ui.sidebarRatio)}
        onMouseLeave={() => setUi({ sidebarPeek: false })}
      >
        <div
          className="relative h-full border-r border-(--border-light) bg-(--surface)"
          style={{ boxShadow: "var(--shadow-menu)" }}
        >
          <Sidebar />
          {header}
        </div>
      </div>
    </>
  );
}

export function HeaderNewChatButton({ IconButtonComponent, icon }) {
  const Button = IconButtonComponent;
  return (
    <Button
      icon={icon}
      title="New chat"
      onClick={() => {
        const state = useStore.getState();
        state.setUi({ navView: "chats" });
        state.newChat();
      }}
    />
  );
}

export function PluginsHeaderTabs() {
  const t = useT();
  const tab = useStore((state) => state.ui.pluginsTab || "plugins");
  const setUi = useStore((state) => state.setUi);
  return (
    <div className="app-no-drag flex items-center gap-4">
      {[["plugins", "Plugins"], ["skills", "Skills"]].map(([id, label]) => (
        <button
          key={id}
          onClick={() => setUi({ pluginsTab: id })}
          className={cx(
            "border-b-2 pb-1 text-[0.8125rem]",
            tab === id
              ? "border-(--fg) font-medium text-(--fg)"
              : "border-transparent text-(--fg-tertiary) hover:text-(--fg)",
          )}
        >
          {t(label)}
        </button>
      ))}
    </div>
  );
}

export function NavHeaderActions({ view }) {
  const t = useT();
  const setUi = useStore((state) => state.setUi);
  const [createOpen, setCreateOpen] = useState(false);
  const createRef = useRef(null);
  const toast = (message) => useStore.getState().toast(message);

  const createExtension = () => {
    const home = useStore.getState().appInfo?.home || "";
    const skillsTab = useStore.getState().ui.pluginsTab === "skills";
    const name = skillsTab ? "skill-creator" : "plugin-creator";
    const displayName = skillsTab ? "Skill Creator" : "Plugin Creator";
    useStore.getState().newChatWithPrefill("", [{
      kind: "skill",
      name,
      displayName,
      path: `${home}/.codex/skills/.system/${name}/SKILL.md`,
      icon: `${home}/.codex/skills/.system/${name}/assets/${name}-small.svg`,
    }]);
  };

  const createSite = () => {
    useStore.getState().newChatWithPrefill(
      "Create a website that …",
      [{ kind: "site", name: "Sites", displayName: "Sites" }],
    );
  };

  if (view === "sites") {
    return (
      <div className="app-no-drag flex items-center gap-2">
        <IconButton
          icon={<IconRefresh />}
          title="Refresh sites"
          className="!rounded-[0.78125rem] !text-(--fg-tertiary)"
          onClick={() => window.dispatchEvent(new CustomEvent("sites:reload"))}
        />
        <button
          type="button"
          className="flex h-7 items-center rounded-[0.78125rem] border border-(--border) bg-(--fg) px-2 text-[0.875rem] leading-[1.125rem] text-(--surface) hover:opacity-80"
          onClick={createSite}
        >
          Create
        </button>
      </div>
    );
  }

  if (view === "plugins") {
    return (
      <div className="app-no-drag flex items-center gap-1.5">
        <IconButton
          icon={<LucideIcon name="RefreshCw" size={14} />}
          title="Refresh"
          onClick={() => window.dispatchEvent(new CustomEvent("plugins:reload"))}
        />
        <IconButton
          icon={<IconGear />}
          title="Manage plugins"
          onClick={() => setUi({ settingsOpen: true, settingsSection: "plugins" })}
        />
        <button
          className="ml-0.5 flex h-7 items-center gap-1.5 rounded-full border border-(--border) px-3 text-sm hover:bg-(--surface-hover)"
          onClick={createExtension}
        >
          <IconPlus size={12} />
          {t("Create")}
          <IconChevronDown size={12} className="text-(--fg-tertiary)" />
        </button>
      </div>
    );
  }

  if (view === "scheduled") {
    return (
      <div className="app-no-drag flex items-center">
        <button
          ref={createRef}
          className="flex h-7 items-center gap-1.5 rounded-full border border-(--border) px-3 text-sm hover:bg-(--surface-hover)"
          onClick={() => setCreateOpen(true)}
        >
          <IconPlus size={12} />
          {t("Create")}
          <IconChevronDown size={12} className="text-(--fg-tertiary)" />
        </button>
        <Menu
          open={createOpen}
          anchor={() => createRef.current?.getBoundingClientRect()}
          onClose={() => setCreateOpen(false)}
          align="end"
          width={220}
          items={[{
            id: "task",
            label: "Create scheduled task",
            onSelect: () => toast("Create scheduled tasks from a chat by asking ChatGPT Desktop Community"),
          }]}
        />
      </div>
    );
  }
  return null;
}

export function BottomPanel() {
  const t = useT();
  const setUi = useStore((state) => state.setUi);
  return (
    <div className="flex h-full flex-col bg-(--surface-under)">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-(--border-light) px-2">
        <span className="px-1 text-xs text-(--fg-tertiary)">{t("Terminal")}</span>
        <IconButton
          icon={<IconX />}
          title="Close"
          size={12}
          onClick={() => setUi({ bottomOpen: false })}
        />
      </div>
      <div className="min-h-0 flex-1">
        <React.Suspense fallback={null}>
          <LazyTerminalTab />
        </React.Suspense>
      </div>
    </div>
  );
}
