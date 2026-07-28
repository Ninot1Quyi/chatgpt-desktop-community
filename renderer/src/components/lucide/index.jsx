// Lucide icon renderer, matching the reference app's createLucideIcon output:
// 24x24 viewBox, fill none, stroke currentColor, strokeWidth 2, round caps.
import React from "react";
import { ICON_NODES } from "./nodes.js";

export function LucideIcon({ name, size = 16, strokeWidth = 2, className, style }) {
  const nodes = ICON_NODES[name];
  if (!nodes) return null;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
      aria-hidden="true"
    >
      {nodes.map(([tag, attrs], i) =>
        React.createElement(tag, { ...attrs, key: attrs?.key || i })
      )}
    </svg>
  );
}

// Convenience: a component factory in the same shape as icons.jsx entries.
export function lucide(name) {
  const C = (p) => <LucideIcon name={name} {...p} />;
  C.displayName = name;
  return C;
}
