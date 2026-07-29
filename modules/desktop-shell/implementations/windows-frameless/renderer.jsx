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
import WinMenuBar from "./WinMenuBar.jsx";
import WinWindowControls from "./WinWindowControls.jsx";
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
    <div className="app-shell-root win-shell desktop-shell-windows relative h-full w-full overflow-hidden">
      <div className="flex h-full w-full">
        <SidebarColumn />
        <div className="mt-[46px] ml-2 flex min-w-0 flex-1 overflow-hidden rounded-tl-[10px] border-t border-l border-(--border-light) bg-(--surface)">
          <div className={cx("flex min-w-[360px] flex-1 flex-col", ui.rightOpen && ui.rightExpanded && "hidden")}>
            <div className="flex h-[46px] shrink-0 items-center gap-1 pl-3 pr-2">
              {ui.navView === "chats" ? (
                <>
                  <div className="min-w-0 flex-1">
                    <ConversationHeaderContent />
                  </div>
                  <HeaderContextButtons />
                  {!ui.rightOpen && <HeaderPanelButtons />}
                </>
              ) : (
                <>
                  {ui.navView === "plugins" && <PluginsHeaderTabs />}
                  <div className="flex-1" />
                  <NavHeaderActions view={ui.navView} />
                </>
              )}
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              {ui.navView === "chats" ? <Conversation /> : <NavViews />}
            </div>
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
                  "slide-in-right flex shrink-0 flex-col border-l border-(--border-light) bg-(--surface)",
                  ui.rightExpanded && "min-w-0 flex-1",
                )}
                style={ui.rightExpanded ? undefined : { width: ui.rightWidth }}
              >
                <div className="flex h-[46px] shrink-0 items-center pl-2">
                  <div className="h-full min-w-0 flex-1">
                    <React.Suspense fallback={null}>
                      <LazyRightPanelHeader />
                    </React.Suspense>
                  </div>
                  <HeaderPanelButtons />
                  <div className="w-2 shrink-0" />
                </div>
                <div className="min-h-0 flex-1">
                  <React.Suspense fallback={null}>
                    <LazyRightPanel />
                  </React.Suspense>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
      <WindowsHeader />
      <CollapsedSidebar header={<WindowsPeekHeader />} />
      {overlays}
    </div>
  );
}

function WindowsHeader() {
  const ui = useStore((state) => state.ui);
  const setUi = useStore((state) => state.setUi);
  return (
    <div className="app-drag absolute inset-x-0 top-0 z-40 flex h-[46px] items-center gap-1 pl-3">
      <IconButton
        icon={<IconHeaderSidebar />}
        size={16}
        title={`Toggle sidebar (${bindingFor("toggleSidebar")})`}
        onClick={() => setUi({ sidebarOpen: !ui.sidebarOpen })}
      />
      <WinMenuBar />
      {!ui.sidebarOpen && (
        <IconButton
          icon={<LucideIcon name="SquarePen" size={16} />}
          title="New chat"
          onClick={() => {
            const state = useStore.getState();
            state.setUi({ navView: "chats" });
            state.newChat();
          }}
        />
      )}
      <div className="flex-1" />
      <WinWindowControls />
    </div>
  );
}

function WindowsPeekHeader() {
  const setUi = useStore((state) => state.setUi);
  return (
    <div className="app-drag absolute inset-x-0 top-0 z-10 flex h-[46px] items-center gap-1.5 pl-3">
      <IconButton
        icon={<IconHeaderSidebar />}
        size={16}
        title={`Show sidebar (${bindingFor("toggleSidebar")})`}
        onClick={() => setUi({ sidebarOpen: true, sidebarPeek: false })}
      />
    </div>
  );
}
