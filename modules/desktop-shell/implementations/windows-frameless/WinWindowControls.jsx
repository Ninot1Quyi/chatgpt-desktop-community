// Windows-only custom caption buttons (minimize / maximize-restore / close).
// The frameless main window draws no native caption buttons, so these controls
// are rendered at the right end of the global header. This component is
// selected only by the windows-frameless desktop-shell implementation.
import React, { useEffect, useState } from "react";
import * as api from "@app/api.js";
import { cx } from "@app/lib/cx.js";
import { LucideIcon } from "@app/components/icons.jsx";

export default function WinWindowControls() {
  const [maximized, setMaximized] = useState(false);

  useEffect(() => {
    api.windowIsMaximized().then(setMaximized).catch(() => {});
    return api.onMaximizeChanged((v) => setMaximized(!!v));
  }, []);

  const btn = "app-no-drag flex h-[1.875rem] w-[2.5rem] items-center justify-center text-(--fg-secondary) transition-colors";
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
