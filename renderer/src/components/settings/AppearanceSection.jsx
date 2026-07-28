// Appearance: theme, accent, background/foreground overrides, fonts,
// translucent sidebar and contrast. Everything applies live to the document
// and persists via lib/appearance.js.
import React, { useState } from "react";
import { useStore } from "../../store.js";
import { cx } from "../../lib/cx.js";
import { Card, Row, Toggle, Dropdown, Segmented, lsGet, lsSet } from "./shared.jsx";
import {
  ACCENTS,
  BACKGROUNDS,
  FOREGROUNDS,
  UI_FONTS,
  CODE_FONTS,
  readAppearance,
  writeAppearance,
} from "../../lib/appearance.js";

export default function AppearanceSection() {
  const theme = useStore((s) => s.ui.theme);
  const setUi = useStore((s) => s.setUi);
  const [prefs, setPrefs] = useState(() => readAppearance());
  const update = (patch) => setPrefs(writeAppearance(patch));
  const [pointer, setPointer] = useState(() => lsGet("appearance.pointerCursors", true));
  const [motion, setMotion] = useState(() => lsGet("appearance.reduceMotion", "system"));
  const [uiFontSize, setUiFontSize] = useState(() => lsGet("appearance.uiFontSize", 14));
  const [codeFontSize, setCodeFontSize] = useState(() => lsGet("appearance.codeFontSize", 12.5));
  const [diffMarkers, setDiffMarkers] = useState(() => lsGet("appearance.diffMarkers", true));

  return (
    <>
      <Card title="Theme">
        <Row title="Theme">
          <Segmented
            value={theme}
            options={[
              ["system", "System"],
              ["light", "Light"],
              ["dark", "Dark"],
            ]}
            onChange={(v) => setUi({ theme: v })}
          />
        </Row>
        <div className="px-4 py-3.5">
          <div className="rounded-xl border border-(--border-light) bg-(--surface) p-4">
            <div className="text-[18px] font-medium">Aa</div>
            <div className="mt-1 text-[12px] text-(--fg-tertiary)">Codex</div>
            <div className="mt-3 flex gap-2">
              <button
                className="rounded-lg border border-(--border) px-2.5 py-1 text-[12px] hover:bg-(--surface-hover)"
                onClick={() => {
                  const { accent, background, foreground, uiFont, codeFont } = readAppearance();
                  navigator.clipboard
                    ?.writeText(JSON.stringify({ accent, background, foreground, uiFont, codeFont }, null, 2))
                    .catch(() => {});
                }}
              >
                Copy theme
              </button>
              <button
                className="rounded-lg border border-(--border) px-2.5 py-1 text-[12px] hover:bg-(--surface-hover)"
                onClick={async () => {
                  try {
                    const text = await navigator.clipboard.readText();
                    const parsed = JSON.parse(text);
                    const patch = {};
                    for (const k of ["accent", "background", "foreground", "uiFont", "codeFont"]) {
                      if (typeof parsed[k] === "string") patch[k] = parsed[k];
                    }
                    if (Object.keys(patch).length) update(patch);
                  } catch {}
                }}
              >
                Import
              </button>
            </div>
          </div>
        </div>
      </Card>

      <Card title="Colors">
        <Row title="Accent">
          <div className="flex items-center gap-1.5">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                title={a.label}
                className={cx(
                  "h-5 w-5 rounded-full border transition-transform",
                  prefs.accent === a.id ? "scale-110 border-(--fg)" : "border-(--border-heavy) hover:scale-105"
                )}
                style={{ background: a.color || "var(--accent)" }}
                onClick={() => update({ accent: a.id })}
              />
            ))}
          </div>
        </Row>
        <Row title="Background">
          <div className="flex items-center gap-1.5">
            {BACKGROUNDS.map((b) => (
              <button
                key={b.id}
                title={b.label}
                className={cx(
                  "h-5 w-5 rounded-full border transition-transform",
                  prefs.background === b.id ? "scale-110 border-(--fg)" : "border-(--border-heavy) hover:scale-105"
                )}
                style={{ background: b.swatch || "var(--surface)" }}
                onClick={() => update({ background: b.id })}
              />
            ))}
          </div>
        </Row>
        <Row title="Foreground">
          <div className="flex items-center gap-1.5">
            {FOREGROUNDS.map((f) => (
              <button
                key={f.id}
                title={f.label}
                className={cx(
                  "h-5 w-5 rounded-full border transition-transform",
                  prefs.foreground === f.id ? "scale-110 border-(--fg)" : "border-(--border-heavy) hover:scale-105"
                )}
                style={{ background: f.swatch || "var(--fg)" }}
                onClick={() => update({ foreground: f.id })}
              />
            ))}
          </div>
        </Row>
      </Card>

      <Card title="Fonts">
        <Row title="UI font">
          <Dropdown
            value={prefs.uiFont}
            options={UI_FONTS.map((f) => ({ id: f.id, label: f.label }))}
            onChange={(v) => update({ uiFont: v })}
          />
        </Row>
        <Row title="Code font">
          <Dropdown
            value={prefs.codeFont}
            options={CODE_FONTS.map((f) => ({ id: f.id, label: f.label }))}
            onChange={(v) => update({ codeFont: v })}
          />
        </Row>
      </Card>

      <Card title="Display">
        <Row title="Translucent sidebar" desc="Blend the sidebar with the desktop background.">
          <Toggle on={!!prefs.translucentSidebar} onChange={(v) => update({ translucentSidebar: v })} />
        </Row>
        <Row title="Contrast">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              value={prefs.contrast}
              onChange={(e) => update({ contrast: Number(e.target.value) })}
              className="w-[140px] accent-(--accent)"
            />
            <span className="w-6 text-right text-[12px] text-(--fg-tertiary)">{prefs.contrast}</span>
          </div>
        </Row>
      </Card>

      <Card title="Preferences">
        <Row title="Use pointer cursors" desc="Change the cursor to a pointer when hovering over interactive elements">
          <Toggle on={pointer} onChange={(v) => { setPointer(v); lsSet("appearance.pointerCursors", v); applyPointer(v); }} />
        </Row>
        <Row title="Reduce motion" desc="Reduce animations or match your system">
          <Segmented
            value={motion}
            options={[
              ["system", "System"],
              ["on", "On"],
              ["off", "Off"],
            ]}
            onChange={(v) => { setMotion(v); lsSet("appearance.reduceMotion", v); applyMotion(v); }}
          />
        </Row>
        <Row title="UI font size" desc="Adjust the base size used for the ChatGPT UI">
          <div className="flex items-center gap-2">
            <input
              type="number" min={11} max={20} step={0.5} value={uiFontSize}
              onChange={(e) => { const v = Number(e.target.value) || 14; setUiFontSize(v); lsSet("appearance.uiFontSize", v); applyUiFontSize(v); }}
              className="h-7 w-16 rounded-lg border border-(--border-light) bg-(--surface) px-2 text-[13px] outline-none focus:border-(--border-heavy)"
            />
            <span className="text-[12px] text-(--fg-tertiary)">px</span>
          </div>
        </Row>
        <Row title="Code font size" desc="Adjust the base size used for code across chats and diffs">
          <div className="flex items-center gap-2">
            <input
              type="number" min={9} max={20} step={0.5} value={codeFontSize}
              onChange={(e) => { const v = Number(e.target.value) || 12.5; setCodeFontSize(v); lsSet("appearance.codeFontSize", v); applyCodeFontSize(v); }}
              className="h-7 w-16 rounded-lg border border-(--border-light) bg-(--surface) px-2 text-[13px] outline-none focus:border-(--border-heavy)"
            />
            <span className="text-[12px] text-(--fg-tertiary)">px</span>
          </div>
        </Row>
        <Row title="Diff markers" desc="Show colored line markers in diff views">
          <Toggle on={diffMarkers} onChange={(v) => { setDiffMarkers(v); lsSet("appearance.diffMarkers", v); applyDiffMarkers(v); }} />
        </Row>
      </Card>
    </>
  );
}

// Live-apply helpers for the Preferences rows.
function applyPointer(on) {
  document.documentElement.classList.toggle("pref-pointer-cursors", !!on);
  if (on && !document.getElementById("pref-pointer-style")) {
    const st = document.createElement("style");
    st.id = "pref-pointer-style";
    st.textContent = "html.pref-pointer-cursors, html.pref-pointer-cursors * { cursor: pointer !important; }";
    document.head.appendChild(st);
  } else if (!on) {
    document.getElementById("pref-pointer-style")?.remove();
  }
}
function applyMotion(v) {
  document.documentElement.classList.toggle("pref-reduce-motion", v === "on");
  if (v === "on" && !document.getElementById("pref-motion-style")) {
    const st = document.createElement("style");
    st.id = "pref-motion-style";
    st.textContent = "html.pref-reduce-motion * { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }";
    document.head.appendChild(st);
  } else {
    document.getElementById("pref-motion-style")?.remove();
  }
}
function applyUiFontSize(v) {
  document.documentElement.style.setProperty("--codex-chat-font-size", `${v}px`);
}
function applyCodeFontSize(v) {
  document.documentElement.style.setProperty("--codex-code-font-size", `${v}px`);
}
function applyDiffMarkers(on) {
  document.documentElement.classList.toggle("pref-no-diff-markers", !on);
}
