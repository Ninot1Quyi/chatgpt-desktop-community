import React from "react";
import { useStore } from "@app/store.js";
import { cx } from "@app/lib/cx.js";
import {
  Conversation,
  ConversationHeaderContent,
  HeaderContextButtons,
  HeaderPanelButtons,
} from "@modules/conversations";
import { NavViews } from "@modules/projects-navigation";
import {
  LazyRightPanel,
  LazyRightPanelHeader,
} from "../../shared/lazy-panels.jsx";
import { IconButton } from "@app/components/ui.jsx";
import {
  IconHeaderSidebar,
  LucideIcon,
} from "@app/components/icons.jsx";
import { bindingFor } from "@modules/shortcuts";
import {
  BottomPanel,
  CollapsedSidebar,
  PluginsHeaderTabs,
  NavHeaderActions,
  RightPanelDragHandle,
  SidebarColumn,
} from "../../shared/parts.jsx";
import "./styles.css";

export default function DesktopShell({ overlays }) {
  const ui = useStore((state) => state.ui);
  return (
    <div className="app-shell-root desktop-shell-macos relative h-full w-full overflow-hidden">
      <div className="flex h-full w-full">
        <SidebarColumn />
        <div
          className={cx(
            "flex min-w-0 flex-1 flex-col bg-(--surface) pt-[46px]",
            ui.rightOpen && ui.rightExpanded && "hidden",
          )}
        >
          {ui.navView === "chats" ? <Conversation /> : <NavViews />}
          {ui.bottomOpen && (
            <div className="slide-in-up h-[280px] shrink-0 border-t border-(--border-light)">
              <BottomPanel />
            </div>
          )}
        </div>
        {ui.rightOpen && (
          <>
            {!ui.rightExpanded && <RightPanelDragHandle />}
            <div
              className={cx(
                "slide-in-right shrink-0 border-l border-(--border-light)",
                ui.rightExpanded && "min-w-0 flex-1",
              )}
              style={ui.rightExpanded ? undefined : { width: ui.rightWidth }}
            >
              <React.Suspense fallback={null}>
                <LazyRightPanel />
              </React.Suspense>
            </div>
          </>
        )}
      </div>
      <MacHeader />
      <CollapsedSidebar header={<MacPeekHeader />} />
      {overlays}
    </div>
  );
}

function HeaderNewChatButton() {
  return (
    <IconButton
      icon={<LucideIcon name="SquarePen" size={16} />}
      title="New chat"
      onClick={() => {
        const state = useStore.getState();
        state.setUi({ navView: "chats" });
        state.newChat();
      }}
    />
  );
}

function NavigationButtons() {
  const navBack = useStore((state) => state.navBack);
  const navForward = useStore((state) => state.navFwd);
  const goBack = useStore((state) => state.goBack);
  const goForward = useStore((state) => state.goForward);
  return (
    <>
      <IconButton
        icon={<LucideIcon name="ChevronLeft" size={16} />}
        size={16}
        title="Back"
        disabled={!navBack.length}
        onClick={goBack}
      />
      <IconButton
        icon={<LucideIcon name="ChevronRight" size={16} />}
        size={16}
        title="Forward"
        disabled={!navForward.length}
        onClick={goForward}
      />
    </>
  );
}

function MacHeader() {
  const ui = useStore((state) => state.ui);
  const setUi = useStore((state) => state.setUi);
  return (
    <div className="app-drag absolute inset-x-0 top-0 z-40 flex h-[46px] items-center gap-1 pl-[88px]">
      <IconButton
        icon={<IconHeaderSidebar />}
        size={16}
        title={`Toggle sidebar (${bindingFor("toggleSidebar")})`}
        onClick={() => setUi({ sidebarOpen: !ui.sidebarOpen })}
      />
      <NavigationButtons />
      {!ui.sidebarOpen && <HeaderNewChatButton />}
      {ui.sidebarOpen && (
        <div className="shrink-0" style={{ width: Math.max(0, ui.sidebarWidth - 180) }} />
      )}
      {ui.navView === "chats" ? (
        <>
          <div className={cx("min-w-0", ui.rightOpen && ui.rightExpanded ? "w-0" : "flex-1")}>
            {!(ui.rightOpen && ui.rightExpanded) && <ConversationHeaderContent />}
          </div>
          {ui.rightOpen ? (
            <>
              {!ui.rightExpanded && <HeaderContextButtons />}
              <div className="w-2 shrink-0" />
              <div
                className={cx(
                  "flex h-full shrink-0 items-center",
                  ui.rightExpanded && "min-w-0 flex-1",
                )}
                style={ui.rightExpanded ? undefined : { width: ui.rightWidth }}
              >
                <div className="h-full min-w-0 flex-1">
                  <React.Suspense fallback={null}>
                    <LazyRightPanelHeader />
                  </React.Suspense>
                </div>
                <HeaderPanelButtons />
              </div>
            </>
          ) : (
            <>
              <HeaderContextButtons />
              <HeaderPanelButtons />
              <div className="w-2 shrink-0" />
            </>
          )}
        </>
      ) : (
        <>
          {ui.navView === "plugins" && <PluginsHeaderTabs />}
          <div className="flex-1" />
          <NavHeaderActions view={ui.navView} />
          <div className="w-2 shrink-0" />
        </>
      )}
    </div>
  );
}

function MacPeekHeader() {
  const setUi = useStore((state) => state.setUi);
  return (
    <div className="app-drag absolute inset-x-0 top-0 z-10 flex h-[46px] items-center gap-1.5 pl-[84px]">
      <IconButton
        icon={<IconHeaderSidebar />}
        size={16}
        title={`Show sidebar (${bindingFor("toggleSidebar")})`}
        onClick={() => setUi({ sidebarOpen: true, sidebarPeek: false })}
      />
      <NavigationButtons />
    </div>
  );
}
