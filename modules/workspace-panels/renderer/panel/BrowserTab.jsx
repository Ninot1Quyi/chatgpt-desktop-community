// Browser tab: real embedded browser via Electron <webview>, with an
// annotate mode (numbered pins + notes → screenshot into the composer).
import React, { useEffect, useRef, useState } from "react";
import { cx } from "@app/lib/cx.js";
import { cssPixelsToRem } from "@app/lib/cssUnits.js";
import { openExternal, captureWebview, saveTempFile } from "@app/api.js";
import { useStore } from "@app/store.js";
import { Menu } from "@app/components/ui.jsx";
import { IconChevronLeft, IconChevronRight, IconRefresh, IconGlobe, IconX, IconExternal, IconPencil, IconCheck, IconMore } from "@app/components/icons.jsx";
import {
  browserStateFromWebview,
  normalizeBrowserUrl,
} from "./bus.js";

export default function BrowserTab() {
  const wvRef = useRef(null);
  const [url, setUrl] = useState(() => {
    const stored = localStorage.getItem("browser.url") || "";
    const normalized = normalizeBrowserUrl(stored);
    if (normalized) localStorage.setItem("browser.url", normalized);
    else if (stored) localStorage.removeItem("browser.url");
    return normalized;
  });
  const [input, setInput] = useState(url);
  const [canBack, setCanBack] = useState(false);
  const [canFwd, setCanFwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [annotate, setAnnotate] = useState(false);
  const [pins, setPins] = useState([]); // {x, y, note} in view-area CSS coordinates
  const [draftPin, setDraftPin] = useState(null); // {x, y, note} being edited
  const [busy, setBusy] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const optionsRef = useRef(null);

  useEffect(() => {
    const onOpenUrl = (e) => {
      const u = normalizeBrowserUrl(e.detail?.url);
      if (!u) return;
      const wv = wvRef.current;
      if (wv) wv.loadURL(u).catch(() => {});
      setUrl(u);
      setInput(u);
      localStorage.setItem("browser.url", u);
    };
    window.addEventListener("codex:open-url", onOpenUrl);
    return () => {
      window.removeEventListener("codex:open-url", onOpenUrl);
    };
  }, []);

  useEffect(() => {
    const wv = wvRef.current;
    if (!wv) return;
    const sync = () => {
      try {
        const next = browserStateFromWebview(wv);
        setCanBack(next.canBack);
        setCanFwd(next.canForward);
        setInput(next.url);
        setUrl(next.url);
        localStorage.setItem("browser.url", next.url);
      } catch {}
    };
    const onStart = () => setLoading(true);
    const onStop = () => { setLoading(false); sync(); };
    const onFail = () => { setLoading(false); sync(); };
    const onTitle = (e) => setTitle(e.title || "");
    const onWillNavigate = (e) => {
      const nextUrl = normalizeBrowserUrl(e.url);
      if (!nextUrl || nextUrl !== String(e.url || "").trim()) e.preventDefault();
    };
    wv.addEventListener("did-start-loading", onStart);
    wv.addEventListener("did-stop-loading", onStop);
    wv.addEventListener("did-fail-load", onFail);
    wv.addEventListener("will-navigate", onWillNavigate);
    wv.addEventListener("did-navigate", sync);
    wv.addEventListener("did-navigate-in-page", sync);
    wv.addEventListener("page-title-updated", onTitle);
    sync();
    return () => {
      wv.removeEventListener("did-start-loading", onStart);
      wv.removeEventListener("did-stop-loading", onStop);
      wv.removeEventListener("did-fail-load", onFail);
      wv.removeEventListener("will-navigate", onWillNavigate);
      wv.removeEventListener("did-navigate", sync);
      wv.removeEventListener("did-navigate-in-page", sync);
      wv.removeEventListener("page-title-updated", onTitle);
    };
  }, [url]);

  const navigate = (raw) => {
    const u = normalizeBrowserUrl(raw);
    if (!u) return;
    const wv = wvRef.current;
    if (wv) wv.loadURL(u).catch(() => {});
    setUrl(u);
    setInput(u);
    localStorage.setItem("browser.url", u);
  };

  const applyZoom = (next) => {
    const clamped = Math.min(200, Math.max(25, Math.round(next)));
    setZoom(clamped);
    try { wvRef.current?.setZoomFactor(clamped / 100); } catch {}
  };

  // ---- annotate mode ----
  const viewClick = (e) => {
    if (!annotate || draftPin) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDraftPin({ x: e.clientX - rect.left, y: e.clientY - rect.top, note: "" });
  };

  const confirmPin = () => {
    if (!draftPin?.note.trim()) { setDraftPin(null); return; }
    setPins((p) => [...p, draftPin]);
    setDraftPin(null);
  };

  const finishAnnotate = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const wv = wvRef.current;
      const id = wv?.getWebContentsId?.();
      if (pins.length && id) {
        const dataUrl = await captureWebview(id);
        const composited = await compositePins(dataUrl, pins, wv);
        const file = await saveTempFile(composited, "codex-annotate", ".png");
        // Attach the screenshot + notes to the main composer via a store event.
        useStore.getState().toast("Annotation attached to composer");
        window.dispatchEvent(new CustomEvent("codex:attach", {
          detail: {
            images: [file],
            text: pins.map((p, i) => `${i + 1}. ${p.note}`).join("\n"),
          },
        }));
        setPins([]);
      }
      setAnnotate(false);
    } catch (e) {
      useStore.getState().toast(`Capture failed: ${e.message}`, "error");
    }
    setBusy(false);
  };

  return (
    <div className="flex h-full flex-col">
      {/* address bar */}
      <div className="flex h-[2.4375rem] shrink-0 items-center border-b border-(--border-light) px-2">
        <div className="flex items-center gap-[0.0625rem]">
        <NavBtn title="Back" disabled={!canBack} onClick={() => wvRef.current?.goBack()}>
          <IconChevronLeft size={14} />
        </NavBtn>
        <NavBtn title="Next" disabled={!canFwd} onClick={() => wvRef.current?.goForward()}>
          <IconChevronRight size={14} />
        </NavBtn>
        <NavBtn title="Reload page" onClick={() => (loading ? wvRef.current?.stop() : wvRef.current?.reload())}>
          {loading ? <IconX size={13} /> : <IconRefresh size={13} />}
        </NavBtn>
        </div>
        <div className="ml-2 flex h-7 min-w-0 flex-1 items-center overflow-hidden rounded-[0.625rem] ring-1 ring-inset ring-(--border)">
          <input
            id="browser-address-input"
            className="h-7 min-w-0 flex-1 bg-transparent px-2 text-[0.8125rem] outline-none placeholder:text-(--fg-tertiary)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") navigate(input); }}
            onFocus={(e) => e.target.select()}
            placeholder="Enter a URL"
            spellCheck={false}
          />
          <NavBtn title="Open in external browser" onClick={() => {
            const u = normalizeBrowserUrl(input);
            if (u) openExternal(u);
          }}>
            <IconExternal size={14} />
          </NavBtn>
        </div>
        <div className="ml-2">
        {annotate ? (
          <button
            className="flex size-7 items-center justify-center rounded-lg bg-(--surface-active) text-(--fg) hover:bg-(--surface-hover)"
            title="Finish annotation"
            aria-label="Annotate"
            onClick={finishAnnotate}
            disabled={busy}
          >
            <IconCheck size={14} />
            <span className="sr-only">Annotating</span>
          </button>
        ) : (
          <NavBtn title="Annotate" ariaLabel="Annotate" onClick={() => setAnnotate(true)}>
            <IconPencil size={14} />
          </NavBtn>
        )}
        </div>
        <div ref={optionsRef} className="ml-1.5">
          <NavBtn title="Browser options" ariaLabel="Browser options" onClick={() => setOptionsOpen((value) => !value)}>
            <IconMore size={15} />
          </NavBtn>
        </div>
      </div>
      <Menu
        open={optionsOpen}
        anchor={() => optionsRef.current?.getBoundingClientRect()}
        align="end"
        width={210}
        onClose={() => setOptionsOpen(false)}
        items={[
          { id: "zoom-out", label: "Zoom out", hint: `${zoom}%`, onSelect: () => applyZoom(zoom - 10) },
          { id: "zoom-reset", label: "Reset zoom", hint: "100%", onSelect: () => applyZoom(100) },
          { id: "zoom-in", label: "Zoom in", onSelect: () => applyZoom(zoom + 10) },
          { sep: true },
          { id: "external", label: "Open in external browser", icon: <IconExternal size={14} />, onSelect: () => {
            const u = normalizeBrowserUrl(input);
            if (u) openExternal(u);
          } },
        ]}
      />
      {/* page */}
      <div className="relative min-h-0 flex-1">
        {!url ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
            <IconGlobe size={28} className="text-(--fg-tertiary)" />
            <div>
              <div className="mx-auto w-fit text-[1rem] leading-6 font-medium">Start browsing</div>
              <div className="mt-2 text-[0.8125rem] leading-[1.160625rem] font-[445] text-(--fg-tertiary)">Enter a URL to open a page</div>
            </div>
          </div>
        ) : (
          <>
            <webview
              ref={wvRef}
              src={url}
              className="h-full w-full"
              // eslint-disable-next-line react/no-unknown-property
              webpreferences="contextIsolation=yes, nodeIntegration=no, sandbox=yes"
            />
            {annotate && (
              <div className="absolute inset-0 z-10 cursor-crosshair" onClick={viewClick}>
                {pins.map((p, i) => (
                  <Pin key={i} n={i + 1} x={p.x} y={p.y} onRemove={() => setPins((s) => s.filter((_, j) => j !== i))} />
                ))}
                {draftPin && (
                  <div
                    className="absolute z-20 w-56 rounded-xl border border-(--border) bg-(--surface-raised) p-2"
                    style={{
                      left: cssPixelsToRem(Math.min(draftPin.x + 10, 200)),
                      top: cssPixelsToRem(draftPin.y + 10),
                      boxShadow: "var(--shadow-menu)",
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="mb-1 text-xs font-medium text-(--fg-secondary)">Note {pins.length + 1}</div>
                    <textarea
                      autoFocus
                      rows={2}
                      className="w-full resize-none rounded-lg border border-(--border) bg-(--surface) px-2 py-1 text-xs outline-none focus:border-(--accent)"
                      placeholder="What's wrong here?"
                      value={draftPin.note}
                      onChange={(e) => setDraftPin({ ...draftPin, note: e.target.value })}
                      onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); confirmPin(); } if (e.key === "Escape") setDraftPin(null); }}
                    />
                    <div className="mt-1.5 flex justify-end gap-1.5">
                      <button className="rounded-md px-2 py-1 text-xs text-(--fg-tertiary) hover:bg-(--surface-hover)" onClick={() => setDraftPin(null)}>Cancel</button>
                      <button className="rounded-md bg-(--accent) px-2 py-1 text-xs font-medium text-(--accent-fg)" onClick={confirmPin}>Add</button>
                    </div>
                  </div>
                )}
                {!draftPin && pins.length === 0 && (
                  <div className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-max rounded-full border border-(--border) bg-(--surface-raised) px-3 py-1 text-xs text-(--fg-tertiary)" style={{ boxShadow: "var(--shadow-menu)" }}>
                    Click anywhere to drop a note pin
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function Pin({ n, x, y, onRemove }) {
  return (
    <div
      className="group absolute"
      style={{ left: cssPixelsToRem(x - 11), top: cssPixelsToRem(y - 11) }}
    >
      <div className="flex h-[1.375rem] w-[1.375rem] items-center justify-center rounded-full bg-(--accent) text-[0.6875rem] font-semibold text-white" style={{ boxShadow: "0 0.0625rem 0.25rem rgb(0 0 0 / 0.4)" }}>
        {n}
      </div>
      <button
        className="absolute -top-1.5 -right-1.5 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-(--danger) text-[0.5625rem] text-white group-hover:flex"
        onClick={(e) => { e.stopPropagation(); onRemove(); }}
      >
        ×
      </button>
    </div>
  );
}

// Draw the numbered pins onto the captured page image.
async function compositePins(dataUrl, pins, wv) {
  const img = new Image();
  await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = dataUrl; });
  const rect = wv.getBoundingClientRect();
  const scaleX = img.naturalWidth / Math.max(1, rect.width);
  const scaleY = img.naturalHeight / Math.max(1, rect.height);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0);
  pins.forEach((p, i) => {
    const cx = p.x * scaleX;
    const cy = p.y * scaleY;
    const r = 11 * scaleX;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#339cff";
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${cssPixelsToRem(Math.round(13 * scaleX))} -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), cx, cy + 1);
  });
  return canvas.toDataURL("image/png");
}

function NavBtn({ children, title, ariaLabel, onClick, disabled }) {
  return (
    <button
      title={title}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "flex size-7 items-center justify-center rounded-lg text-(--fg-secondary)",
        disabled ? "opacity-35" : "hover:bg-(--surface-hover) hover:text-(--fg)"
      )}
    >
      {children}
    </button>
  );
}
