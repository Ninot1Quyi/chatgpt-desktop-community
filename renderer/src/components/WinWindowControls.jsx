// Custom caption buttons (minimize / maximize-restore / close) at the right
// end of the global header — the hidden native title bar draws none.
import React, { useEffect, useState } from "react";
import * as api from "../api.js";
import { cx } from "../lib/cx.js";
import { LucideIcon } from "./icons.jsx";

export default function WinWindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    api.windowIsMaximized().then(setMaximized).catch(() => {});
    return api.onMaximizeChanged((v) => setMaximized(!!v));
  }, []);

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
