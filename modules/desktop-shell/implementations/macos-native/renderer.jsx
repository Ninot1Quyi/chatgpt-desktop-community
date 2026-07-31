import React from "react";
import { useStore } from "@app/store.js";
import { cx } from "@app/lib/cx.js";
import * as api from "@app/api.js";
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
  IconHeaderBack,
  IconHeaderForward,
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
  const rightVisible = ui.navView === "chats" && ui.rightOpen;
  return (
    <div className="app-shell-root desktop-shell-macos relative h-full w-full overflow-hidden">
      <div className="flex h-full w-full">
        <SidebarColumn />
        <div
          className={cx(
            "flex min-w-0 flex-1 flex-col bg-(--surface) pt-[46px]",
            rightVisible && ui.rightExpanded && "hidden",
          )}
        >
          {ui.navView === "chats" ? <Conversation /> : <NavViews />}
          {ui.bottomOpen && (
            <div className="slide-in-up h-[280px] shrink-0 border-t border-(--border-light)">
              <BottomPanel />
            </div>
          )}
        </div>
        {rightVisible && (
          <>
            {!ui.rightExpanded && <RightPanelDragHandle />}
            <div
              className={cx(
                "pointer-events-none slide-in-right shrink-0 border-l border-(--border)",
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
        icon={<IconHeaderBack />}
        size={16}
        title="Back"
        className="!rounded-[12.5px] !text-(--fg-tertiary)"
        disabled={!navBack.length}
        onClick={goBack}
      />
      <IconButton
        icon={<IconHeaderForward />}
        size={16}
        title="Forward"
        className="!rounded-[12.5px] !text-(--fg-tertiary)"
        disabled={!navForward.length}
        onClick={goForward}
      />
    </>
  );
}

function MacHeader() {
  const ui = useStore((state) => state.ui);
  const setUi = useStore((state) => state.setUi);
  const dragHandlers = useMacWindowDrag();
  return (
    <div
      className="mac-window-drag-surface app-no-drag absolute inset-x-0 top-0 z-40 flex h-[46px] items-center gap-1 pr-3 pl-[88px]"
      {...dragHandlers}
    >
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
                  "app-drag flex h-full shrink-0 items-center",
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
  const dragHandlers = useMacWindowDrag();
  return (
    <div
      className="mac-window-drag-surface app-no-drag absolute inset-x-0 top-0 z-10 flex h-[46px] items-center gap-1.5 pl-[84px]"
      {...dragHandlers}
    >
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

function useMacWindowDrag() {
  const pointerId = React.useRef(null);

  const finishDrag = React.useCallback((event) => {
    if (pointerId.current !== event.pointerId) return;
    pointerId.current = null;
    event.currentTarget.releasePointerCapture?.(event.pointerId);
    api.windowDragEnd();
  }, []);

  return {
    onPointerDown: (event) => {
      if (
        event.button !== 0
        || event.target.closest?.(
          "button, a, input, textarea, select, [role='button'], [contenteditable='true'], [draggable='true']",
        )
      ) {
        return;
      }
      pointerId.current = event.pointerId;
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.preventDefault();
      api.windowDragBegin(event.screenX, event.screenY);
    },
    onPointerMove: (event) => {
      if (pointerId.current !== event.pointerId || !(event.buttons & 1)) return;
      api.windowDragMove(event.screenX, event.screenY);
    },
    onPointerUp: finishDrag,
    onPointerCancel: finishDrag,
  };
}
