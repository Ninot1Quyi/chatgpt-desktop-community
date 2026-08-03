// File-type icons for the workspace tree, mirroring the reference app's
// system: filename/extension -> icon token -> bundled SVG, tinted with the
// reference palette (currentColor). Drop-in replaceable: overwrite any SVG
// in ../../assets/file-icons/ and the loader picks it up automatically.
import React from "react";
import { rem } from "@app/lib/cssUnits.js";
import { iconColorFor, iconTokenFor } from "./fileIconMap.js";

// Bundled icon set (Vite raw-imports every svg in the renderer asset dir).
const RAW = import.meta.glob("../../../../renderer/src/assets/file-icons/*.svg", { query: "?raw", import: "default", eager: true });
const ICONS = {};
for (const [path, svg] of Object.entries(RAW)) {
  const name = path.slice(path.lastIndexOf("/") + 1, -4);
  ICONS[name] = svg;
}

// Renders the bundled SVG for `token` (or the generic file icon) at `size`,
// tinted with the token's palette color.
export function FileIcon({ name, size = 14, theme = "dark", style, className }) {
  const token = iconTokenFor(name);
  const color = iconColorFor(token, theme);
  const svg = ICONS[token] || ICONS.default;
  if (!svg) return null;
  return (
    <span
      className={className}
      style={{
        color,
        width: rem(size),
        height: rem(size),
        display: "inline-flex",
        flexShrink: 0,
        ...style,
      }}
      dangerouslySetInnerHTML={{
        __html: svg
          .replace("<svg", '<svg width="100%" height="100%"')
          .replace(/>\s+</g, "><"),
      }}
    />
  );
}
