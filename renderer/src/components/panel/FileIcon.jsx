// File-type icons for the workspace tree, mirroring the reference app's
// system: filename/extension -> icon token -> bundled SVG, tinted with the
// reference palette (currentColor). Drop-in replaceable: overwrite any SVG
// in ./file-icons/ and the loader picks it up automatically.
import React from "react";
import { EXACT, EXT, TOKEN_COLOR, PALETTE_DARK, PALETTE_LIGHT } from "./fileIconMap.js";

// Bundled icon set (Vite raw-imports every svg in ./file-icons).
const RAW = import.meta.glob("./file-icons/*.svg", { query: "?raw", import: "default", eager: true });
const ICONS = {};
for (const [path, svg] of Object.entries(RAW)) {
  const name = path.slice(path.lastIndexOf("/") + 1, -4);
  ICONS[name] = svg;
}

export function iconTokenFor(fileName) {
  if (EXACT[fileName]) return EXACT[fileName];
  const dot = fileName.lastIndexOf(".");
  if (dot > 0) {
    const ext = fileName.slice(dot + 1).toLowerCase();
    if (EXT[ext]) return EXT[ext];
  }
  return "default";
}

export function iconColorFor(token, theme = "dark") {
  const pal = theme === "light" ? PALETTE_LIGHT : PALETTE_DARK;
  return pal[TOKEN_COLOR[token] || "gray"] || pal.gray;
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
      style={{ color, width: size, height: size, display: "inline-flex", flexShrink: 0, ...style }}
      dangerouslySetInnerHTML={{ __html: svg.replace("<svg", `<svg width="${size}" height="${size}"`) }}
    />
  );
}
