import React, { useRef, useState } from "react";
import { useStore } from "@app/store.js";
import { cx } from "@app/lib/cx.js";
import { Sidebar } from "@modules/projects-navigation";
import { IconButton, Menu } from "@app/components/ui.jsx";
import {
  IconChevronDown,
  IconGear,
  IconPlus,
  IconX,
  LucideIcon,
} from "@app/components/icons.jsx";
import { LazyTerminalTab } from "./lazy-panels.jsx";
import "./styles.css";

export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

export function DragHandle({ onDrag, onEnd }) {
  return (
    <div
      className="group relative z-20 w-0 shrink-0 cursor-col-resize bg-transparent"
      onMouseDown={(event) => {
        event.preventDefault();
        const startX = event.clientX;
        const move = (nextEvent) => onDrag(nextEvent.clientX - startX);
        const up = () => {
          window.removeEventListener("mousemove", move);
          window.removeEventListener("mouseup", up);
          onEnd?.();
        };
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
      }}
    >
      <div className="absolute inset-y-0 -left-2 w-[17px]" />
      <div
        className="absolute inset-y-0 left-0 w-px opacity-0 transition-opacity duration-150 group-hover:opacity-100"
        style={{
          background: "linear-gradient(to bottom, transparent, color-mix(in oklab, var(--fg) 25%, transparent), transparent)",
        }}
      />
    </div>
  );
}

export function SidebarColumn() {
  const ui = useStore((state) => state.ui);
  const setUi = useStore((state) => state.setUi);
  if (!ui.sidebarOpen) return null;
  return (
    <>
      <div className="slide-in-left shrink-0" style={{ width: ui.sidebarWidth }}>
        <Sidebar />
      </div>
      <DragHandle
        onDrag={(delta) => {
          const width = ui.sidebarWidth + delta;
          if (width < 170) setUi({ sidebarOpen: false });
          else setUi({ sidebarWidth: clamp(width, 220, 520) });
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
          "absolute inset-y-0 left-0 z-40 transition-transform duration-200 ease-[cubic-bezier(0.2,0,0.13,1)]",
          ui.sidebarPeek ? "translate-x-0" : "-translate-x-full",
        )}
        style={{ width: ui.sidebarWidth }}
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

export function RightPanelDragHandle() {
  const ui = useStore((state) => state.ui);
  const setUi = useStore((state) => state.setUi);
  return (
    <DragHandle
      onDrag={(delta) => setUi({
        rightWidth: clamp(
          ui.rightWidth - delta,
          320,
          Math.max(340, window.innerWidth - 420),
        ),
      })}
      onEnd={() => {
        const state = useStore.getState();
        const sidebar = state.ui.sidebarOpen ? state.ui.sidebarWidth + 8 : 0;
        const max = Math.max(320, window.innerWidth - sidebar - 380);
        if (state.ui.rightWidth > max) state.setUi({ rightWidth: max });
      }}
    />
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
  const tab = useStore((state) => state.ui.pluginsTab || "plugins");
  const setUi = useStore((state) => state.setUi);
  return (
    <div className="app-no-drag flex items-center gap-4">
      {[["plugins", "Plugins"], ["skills", "Skills"]].map(([id, label]) => (
        <button
          key={id}
          onClick={() => setUi({ pluginsTab: id })}
          className={cx(
            "border-b-2 pb-1 text-[13px]",
            tab === id
              ? "border-(--fg) font-medium text-(--fg)"
              : "border-transparent text-(--fg-tertiary) hover:text-(--fg)",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function NavHeaderActions({ view }) {
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
          Create
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
          Create
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
  const setUi = useStore((state) => state.setUi);
  return (
    <div className="flex h-full flex-col bg-(--surface-under)">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-(--border-light) px-2">
        <span className="px-1 text-xs text-(--fg-tertiary)">Terminal</span>
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
