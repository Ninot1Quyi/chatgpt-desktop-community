// Windows-only custom caption buttons (minimize / maximize-restore / close).
// The main window is transparent + titleBarStyle "hiddenInset", which draws
// no native caption buttons on Windows, so the official-style controls are
// rendered here at the right end of the global header. macOS uses its traffic
// lights instead, so this renders nothing there.
import React, { useEffect, useState } from "react";
import { useStore } from "../store.js";
import * as api from "../api.js";
import { cx } from "../lib/cx.js";
import { LucideIcon } from "./icons.jsx";

export default function WinWindowControls() {
  const isWin = useStore((s) => s.appInfo?.platform === "win32");
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    if (!isWin) return;
    api.windowIsMaximized().then(setMaximized).catch(() => {});
    return api.onMaximizeChanged((v) => setMaximized(!!v));
  }, [isWin]);

  if (!isWin) return null;

  const btn = "app-no-drag flex h-[30px] w-[40px] items-center justify-center text-(--fg-secondary) transition-colors";
  return (
    <div className="flex shrink-0 items-center">
      <button
        className={cx(btn, "hover:bg-(--surface-hover) hover:text-(--fg)")}
        title="Minimize"
        onClick={() => api.windowMinimize()}
      >
        <LucideIcon name="Minus" size={15} />
      </button>
      <button
        className={cx(btn, "hover:bg-(--surface-hover) hover:text-(--fg)")}
        title={maximized ? "Restore" : "Maximize"}
        onClick={() => api.windowToggleMaximize()}
      >
        <LucideIcon name={maximized ? "Copy" : "Square"} size={12} />
      </button>
      <button
        className={cx(btn, "hover:bg-[#e81123] hover:text-white")}
        title="Close"
        onClick={() => api.windowClose()}
      >
        <LucideIcon name="X" size={15} />
      </button>
    </div>
  );
}
