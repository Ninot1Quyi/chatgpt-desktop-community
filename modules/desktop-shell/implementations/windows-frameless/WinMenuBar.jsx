// Windows-only in-window menu bar (File / Edit / View / Help), rendered inside
// the global header next to the sidebar/back/forward buttons — matching the
// official Windows client, where these menus share the header row. This file
// is imported only by the windows-frameless desktop-shell implementation.
import React, { useRef, useState } from "react";
import { useStore } from "@app/store.js";
import * as api from "@app/api.js";
import { cx } from "@app/lib/cx.js";
import { Menu } from "@app/components/ui.jsx";
import { useT } from "@app/i18n.jsx";

const DOCS_URL = "https://developers.openai.com/codex/";

export default function WinMenuBar() {
  const t = useT();
  const [openId, setOpenId] = useState(null);
  const btnRefs = useRef({});

  const newChat = () => {
    const s = useStore.getState();
    s.setUi({ navView: "chats" });
    s.newChat();
  };
  const setUi = (patch) => useStore.getState().setUi(patch);

  const menus = [
    {
      id: "file",
      label: "File",
      items: [
        { id: "new", label: "New chat", hint: "Ctrl+N", onSelect: newChat },
        { id: "settings", label: "Settings", hint: "Ctrl+,", onSelect: () => setUi({ settingsOpen: true }) },
        { sep: true },
        { id: "close", label: "Close window", hint: "Ctrl+W", onSelect: () => api.windowClose() },
      ],
    },
    {
      id: "edit",
      label: "Edit",
      items: [
        { id: "undo", label: "Undo", hint: "Ctrl+Z", onSelect: () => api.editRole("undo") },
        { id: "redo", label: "Redo", hint: "Ctrl+Y", onSelect: () => api.editRole("redo") },
        { sep: true },
        { id: "cut", label: "Cut", hint: "Ctrl+X", onSelect: () => api.editRole("cut") },
        { id: "copy", label: "Copy", hint: "Ctrl+C", onSelect: () => api.editRole("copy") },
        { id: "paste", label: "Paste", hint: "Ctrl+V", onSelect: () => api.editRole("paste") },
        { sep: true },
        { id: "selectAll", label: "Select all", hint: "Ctrl+A", onSelect: () => api.editRole("selectAll") },
      ],
    },
    {
      id: "view",
      label: "View",
      items: [
        { id: "sidebar", label: "Toggle sidebar", hint: "Ctrl+B", onSelect: () => setUi({ sidebarOpen: !useStore.getState().ui.sidebarOpen }) },
        { id: "sidePanel", label: "Toggle side panel", hint: "Ctrl+Alt+B", onSelect: () => setUi({ rightOpen: !useStore.getState().ui.rightOpen }) },
        { id: "bottomPanel", label: "Toggle bottom panel", hint: "Ctrl+J", onSelect: () => setUi({ bottomOpen: !useStore.getState().ui.bottomOpen }) },
        { sep: true },
        { id: "zoomIn", label: "Zoom in", hint: "Ctrl+=", onSelect: () => api.viewZoom("in") },
        { id: "zoomOut", label: "Zoom out", hint: "Ctrl+-", onSelect: () => api.viewZoom("out") },
        { id: "zoomReset", label: "Reset zoom", hint: "Ctrl+0", onSelect: () => api.viewZoom("reset") },
        { sep: true },
        { id: "reload", label: "Reload", hint: "Ctrl+R", onSelect: () => api.viewReload() },
        { id: "devtools", label: "Toggle developer tools", hint: "F12", onSelect: () => api.viewToggleDevtools() },
      ],
    },
    {
      id: "help",
      label: "Help",
      items: [
        { id: "docs", label: "Documentation", onSelect: () => api.openExternal(DOCS_URL) },
      ],
    },
  ];

  const open = menus.find((m) => m.id === openId);

  return (
    <div className="app-no-drag flex shrink-0 items-center">
      {menus.map((m) => (
        <button
          key={m.id}
          ref={(el) => { btnRefs.current[m.id] = el; }}
          onClick={() => setOpenId(openId === m.id ? null : m.id)}
          onMouseEnter={() => { if (openId && openId !== m.id) setOpenId(m.id); }}
          className={cx(
            "rounded-md px-2 py-1 text-[0.8125rem]",
            openId === m.id ? "bg-(--surface-hover) text-(--fg)" : "text-(--fg-secondary) hover:bg-(--surface-hover) hover:text-(--fg)"
          )}
        >
          {t(m.label)}
        </button>
      ))}
      <Menu
        open={!!open}
        anchor={() => btnRefs.current[open?.id]?.getBoundingClientRect()}
        items={open?.items || []}
        onClose={() => setOpenId(null)}
      />
    </div>
  );
}
