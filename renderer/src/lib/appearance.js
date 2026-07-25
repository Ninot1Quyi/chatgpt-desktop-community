// Appearance prefs (accent / background / foreground / fonts / sidebar /
// contrast) persisted in localStorage and applied to the document root.
// Applied once at startup (store.init) and on every change from the
// Appearance settings section.

const KEY = "appearance";

export const ACCENTS = [
  { id: "default", color: null, label: "Default" },
  { id: "blue", color: "#339cff", label: "Blue" },
  { id: "green", color: "#40c977", label: "Green" },
  { id: "orange", color: "#ff8549", label: "Orange" },
  { id: "red", color: "#ff6764", label: "Red" },
  { id: "purple", color: "#ad7bf9", label: "Purple" },
  { id: "pink", color: "#f472b6", label: "Pink" },
  { id: "teal", color: "#2dd4bf", label: "Teal" },
];

export const BACKGROUNDS = [
  { id: "default", surface: null, under: null, swatch: null, label: "Default" },
  { id: "black", surface: "#000000", under: "#000000", swatch: "#000000", label: "Black" },
  { id: "graphite", surface: "#18191c", under: "#131417", swatch: "#18191c", label: "Graphite" },
  { id: "navy", surface: "#10141c", under: "#0c0f16", swatch: "#10141c", label: "Navy" },
  { id: "forest", surface: "#10160f", under: "#0c110b", swatch: "#10160f", label: "Forest" },
  { id: "cocoa", surface: "#1a1410", under: "#14100c", swatch: "#1a1410", label: "Cocoa" },
];

export const FOREGROUNDS = [
  { id: "default", color: null, swatch: null, label: "Default" },
  { id: "white", color: "#fcfcfc", swatch: "#fcfcfc", label: "White" },
  { id: "warm", color: "#ece5d8", swatch: "#ece5d8", label: "Warm" },
  { id: "cool", color: "#d7e3f4", swatch: "#d7e3f4", label: "Cool" },
  { id: "mint", color: "#d9f2e2", swatch: "#d9f2e2", label: "Mint" },
];

export const UI_FONTS = [
  { id: "default", label: "System default", stack: null },
  { id: "sf", label: "SF Pro", stack: '-apple-system, BlinkMacSystemFont, "SF Pro Text", "Segoe UI", sans-serif' },
  { id: "sf-mono", label: "SF Mono", stack: 'ui-monospace, "SFMono-Regular", "SF Mono", Menlo, monospace' },
  { id: "helvetica", label: "Helvetica Neue", stack: '"Helvetica Neue", Helvetica, Arial, sans-serif' },
  { id: "georgia", label: "Georgia", stack: "Georgia, 'Times New Roman', serif" },
];

export const CODE_FONTS = [
  { id: "default", label: "System default", stack: null },
  { id: "sf-mono", label: "SF Mono", stack: 'ui-monospace, "SFMono-Regular", "SF Mono", monospace' },
  { id: "menlo", label: "Menlo", stack: "Menlo, monospace" },
  { id: "jetbrains", label: "JetBrains Mono", stack: '"JetBrains Mono", Menlo, monospace' },
  { id: "fira", label: "Fira Code", stack: '"Fira Code", Menlo, monospace' },
  { id: "consolas", label: "Consolas", stack: "Consolas, monospace" },
];

export function readAppearance() {
  try {
    return { accent: "default", background: "default", foreground: "default", uiFont: "default", codeFont: "default", translucentSidebar: false, contrast: 60, ...(JSON.parse(localStorage.getItem(KEY) || "{}")) };
  } catch {
    return { accent: "default", background: "default", foreground: "default", uiFont: "default", codeFont: "default", translucentSidebar: false, contrast: 60 };
  }
}

export function writeAppearance(patch) {
  const next = { ...readAppearance(), ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  applyAppearance(next);
  return next;
}

export function applyAppearance(prefs) {
  const p = prefs || readAppearance();
  const root = document.documentElement;
  const st = root.style;

  // Accent (+ soft tint used for highlights).
  const accent = ACCENTS.find((a) => a.id === p.accent) || ACCENTS[0];
  if (accent.color) {
    st.setProperty("--accent", accent.color);
    st.setProperty("--accent-soft", `color-mix(in srgb, ${accent.color} 16%, transparent)`);
  } else {
    st.removeProperty("--accent");
    st.removeProperty("--accent-soft");
  }

  // Background / foreground overrides.
  const bg = BACKGROUNDS.find((b) => b.id === p.background) || BACKGROUNDS[0];
  if (bg.surface) {
    st.setProperty("--surface", bg.surface);
    st.setProperty("--surface-under", bg.under || bg.surface);
  } else {
    st.removeProperty("--surface");
    st.removeProperty("--surface-under");
  }
  const fg = FOREGROUNDS.find((f) => f.id === p.foreground) || FOREGROUNDS[0];
  if (fg.color) {
    st.setProperty("--fg", fg.color);
    st.setProperty("--fg-secondary", `color-mix(in srgb, ${fg.color} 65%, transparent)`);
    st.setProperty("--fg-tertiary", `color-mix(in srgb, ${fg.color} 50%, transparent)`);
    st.setProperty("--fg-faint", `color-mix(in srgb, ${fg.color} 30%, transparent)`);
  } else {
    st.removeProperty("--fg");
    st.removeProperty("--fg-secondary");
    st.removeProperty("--fg-tertiary");
    st.removeProperty("--fg-faint");
  }

  // Fonts (theme.css consumes --font-sans / --font-mono).
  const uiFont = UI_FONTS.find((f) => f.id === p.uiFont) || UI_FONTS[0];
  const codeFont = CODE_FONTS.find((f) => f.id === p.codeFont) || CODE_FONTS[0];
  if (uiFont.stack) st.setProperty("--font-sans", uiFont.stack);
  else st.removeProperty("--font-sans");
  if (codeFont.stack) st.setProperty("--font-mono", codeFont.stack);
  else st.removeProperty("--font-mono");

  // Translucent sidebar (CSS rule in theme.css keys off this class).
  root.classList.toggle("translucent-sidebar", !!p.translucentSidebar);

  // Contrast slider (0-100 → 0.7x-1.3x page filter; 50 is neutral).
  const c = Number(p.contrast);
  st.filter = Number.isFinite(c) && c !== 50 ? `contrast(${(0.7 + (c / 100) * 0.6).toFixed(2)})` : "";
}
