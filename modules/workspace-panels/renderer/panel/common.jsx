// Shared panel bits.
import React from "react";

export function EmptyState({ icon, text, sub, children }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1.5 px-6 text-center">
      {icon && <div className="mb-1 text-(--fg-faint)">{icon}</div>}
      <div className="text-[0.8125rem] text-(--fg-tertiary)">{text}</div>
      {sub && <div className="text-xs text-(--fg-faint)">{sub}</div>}
      {children}
    </div>
  );
}
