// Browser tab: real embedded browser via Electron <webview>, with an
// annotate mode (numbered pins + notes → screenshot into the composer).
import React, { useEffect, useRef, useState } from "react";
import { cx } from "../../lib/cx.js";
import { openExternal, captureWebview, saveTempFile } from "../../api.js";
import { useStore } from "../../store.js";
import { IconChevronLeft, IconChevronRight, IconRefresh, IconGlobe, IconX, IconExternal, IconPencil, IconCheck } from "../icons.jsx";

const HOME_URL = "https://www.google.com";

export default function BrowserTab() {
  const wvRef = useRef(null);
  const [url, setUrl] = useState(() => localStorage.getItem("browser.url") || "");
  const [input, setInput] = useState(url);
  const [canBack, setCanBack] = useState(false);
  const [canFwd, setCanFwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [title, setTitle] = useState("");
  const [annotate, setAnnotate] = useState(false);
  const [pins, setPins] = useState([]); // {x, y, note} in CSS px of the view area
  const [draftPin, setDraftPin] = useState(null); // {x, y, note} being edited
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const wv = wvRef.current;
    if (!wv) return;
    const sync = () => {
      try {
        setCanBack(wv.canGoBack());
        setCanFwd(wv.canGoForward());
        setInput(wv.getURL());
        setUrl(wv.getURL());
        localStorage.setItem("browser.url", wv.getURL());
      } catch {}
    };
    const onStart = () => setLoading(true);
    const onStop = () => { setLoading(false); sync(); };
    const onTitle = (e) => setTitle(e.title || "");
    const onOpenUrl = (e) => {
      const u = e.detail?.url;
      if (u) { wv.loadURL(u).catch(() => {}); setInput(u); }
    };
    window.addEventListener("codex:open-url", onOpenUrl);
    wv.addEventListener("did-start-loading", onStart);
    wv.addEventListener("did-stop-loading", onStop);
    wv.addEventListener("did-navigate", sync);
    wv.addEventListener("did-navigate-in-page", sync);
    wv.addEventListener("page-title-updated", onTitle);
    return () => {
      window.removeEventListener("codex:open-url", onOpenUrl);
      wv.removeEventListener("did-start-loading", onStart);
      wv.removeEventListener("did-stop-loading", onStop);
      wv.removeEventListener("did-navigate", sync);
      wv.removeEventListener("did-navigate-in-page", sync);
      wv.removeEventListener("page-title-updated", onTitle);
    };
  }, []);

  const navigate = (raw) => {
    let u = raw.trim();
    if (!u) return;
    if (!/^[a-z]+:\/\//i.test(u)) {
      u = u.includes(".") && !u.includes(" ") ? `https://${u}` : `https://www.google.com/search?q=${encodeURIComponent(u)}`;
    }
    const wv = wvRef.current;
    if (wv) wv.loadURL(u).catch(() => {});
    setInput(u);
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
      <div className="flex shrink-0 items-center gap-1 border-b border-(--border-light) px-2 py-1.5">
        <NavBtn title="Back" disabled={!canBack} onClick={() => wvRef.current?.goBack()}>
          <IconChevronLeft size={14} />
        </NavBtn>
        <NavBtn title="Forward" disabled={!canFwd} onClick={() => wvRef.current?.goForward()}>
          <IconChevronRight size={14} />
        </NavBtn>
        <NavBtn title="Reload" onClick={() => (loading ? wvRef.current?.stop() : wvRef.current?.reload())}>
          {loading ? <IconX size={13} /> : <IconRefresh size={13} />}
        </NavBtn>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full border border-(--border-light) bg-(--surface) px-2.5 py-1">
          <IconGlobe size={11} className="shrink-0 text-(--fg-faint)" />
          <input
            className="w-full bg-transparent text-xs outline-none placeholder:text-(--fg-faint)"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") navigate(input); }}
            onFocus={(e) => e.target.select()}
            placeholder="Search or enter URL"
            spellCheck={false}
          />
        </div>
        <ZoomControl wvRef={wvRef} />
        {annotate ? (
          <button
            className="flex h-6 items-center gap-1 rounded-md bg-(--accent) px-2 text-xs font-medium text-(--accent-fg) hover:opacity-90"
            title="Finish annotation"
            onClick={finishAnnotate}
            disabled={busy}
          >
            <IconCheck size={12} /> Done
          </button>
        ) : (
          <NavBtn title="Annotate" onClick={() => setAnnotate(true)}>
            <IconPencil size={13} />
          </NavBtn>
        )}
        <NavBtn title="Open in browser" onClick={() => openExternal(input)}>
          <IconExternal size={13} />
        </NavBtn>
      </div>
      {/* page */}
      <div className="relative min-h-0 flex-1">
        {!url ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
            <IconGlobe size={28} className="text-(--fg-faint)" />
            <div>
              <div className="text-[15px] font-medium">Start browsing</div>
              <div className="mt-1 text-xs text-(--fg-tertiary)">Enter a URL to open a page</div>
            </div>
            <form
              className="mt-2 flex w-full max-w-[320px] items-center gap-1.5 rounded-full border border-(--border) bg-(--surface) px-3 py-1.5"
              onSubmit={(e) => { e.preventDefault(); navigate(input); }}
            >
              <IconGlobe size={12} className="shrink-0 text-(--fg-faint)" />
              <input
                className="w-full bg-transparent text-xs outline-none placeholder:text-(--fg-faint)"
                placeholder="Enter a URL"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                spellCheck={false}
              />
            </form>
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
                    style={{ left: Math.min(draftPin.x + 10, 200), top: draftPin.y + 10, boxShadow: "var(--shadow-menu)" }}
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
    <div className="group absolute" style={{ left: x - 11, top: y - 11 }}>
      <div className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-(--accent) text-[11px] font-semibold text-white" style={{ boxShadow: "0 1px 4px rgb(0 0 0 / 0.4)" }}>
        {n}
      </div>
      <button
        className="absolute -top-1.5 -right-1.5 hidden h-3.5 w-3.5 items-center justify-center rounded-full bg-(--danger) text-[9px] text-white group-hover:flex"
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
    ctx.font = `600 ${Math.round(13 * scaleX)}px -apple-system, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(String(i + 1), cx, cy + 1);
  });
  return canvas.toDataURL("image/png");
}

function NavBtn({ children, title, onClick, disabled }) {
  return (
    <button
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        "flex h-6 w-6 items-center justify-center rounded-md text-(--fg-secondary)",
        disabled ? "opacity-35" : "hover:bg-(--surface-hover) hover:text-(--fg)"
      )}
    >
      {children}
    </button>
  );
}

// Zoom percentage control, like the reference browser tab toolbar.
function ZoomControl({ wvRef }) {
  const [pct, setPct] = useState(100);
  const apply = (next) => {
    const clamped = Math.min(200, Math.max(25, Math.round(next)));
    setPct(clamped);
    try { wvRef.current?.setZoomFactor(clamped / 100); } catch {}
  };
  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <NavBtn title="Zoom out" onClick={() => apply(pct - 10)}>
        <span className="text-xs leading-none">−</span>
      </NavBtn>
      <button
        title="Reset zoom"
        className="w-9 rounded-md py-0.5 text-center text-[11px] text-(--fg-secondary) hover:bg-(--surface-hover)"
        onClick={() => apply(100)}
      >
        {pct}%
      </button>
      <NavBtn title="Zoom in" onClick={() => apply(pct + 10)}>
        <span className="text-xs leading-none">+</span>
      </NavBtn>
    </div>
  );
}
