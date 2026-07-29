// Terminal tab: a real inline terminal rendered with xterm.js (the same
// terminal library the reference app uses). Keystrokes go straight to the
// PTY; falls back to a one-shot runner only when the PTY cannot start.
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useStore } from "@app/store.js";
import * as api from "@app/api.js";
import { IconRefresh } from "@app/components/icons.jsx";
import {
  interactiveCommand,
  oneShotCommand,
  shellLabel,
} from "@modules/terminal";

function b64encode(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}
function b64decode(b64) {
  try {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch {
    return new Uint8Array(0);
  }
}
const newProcessId = () =>
  crypto.randomUUID ? crypto.randomUUID() : `term-${Date.now()}-${Math.random().toString(36).slice(2)}`;

// Measure the grid size that fits the container (no fit addon needed).
function gridSize(el, fontSize, lineHeight) {
  const probe = document.createElement("span");
  probe.style.cssText = `position:absolute;visibility:hidden;font-family:var(--font-mono,monospace);font-size:${fontSize}px;line-height:${lineHeight};`;
  probe.textContent = "W".repeat(100);
  el.appendChild(probe);
  const charW = probe.getBoundingClientRect().width / 100 || fontSize * 0.6;
  probe.remove();
  const lineH = fontSize * lineHeight;
  const cols = Math.max(40, Math.floor(el.clientWidth / charW) - 1);
  const rows = Math.max(6, Math.floor(el.clientHeight / lineH));
  return { cols, rows };
}

export default function TerminalTab() {
  const conv = useStore((s) => (s.activeThreadId ? s.conversations[s.activeThreadId] : null));
  const globalCwd = useStore((s) => s.cwd);
  const root = conv?.thread?.cwd || globalCwd;
  const [mode, setMode] = useState("pty"); // pty | oneshot
  const [exited, setExited] = useState(null);
  const [session, setSession] = useState(0);
  const [busy, setBusy] = useState(false);
  const [input, setInput] = useState("");
  const [buf, setBuf] = useState("");
  const containerRef = useRef(null);
  const termRef = useRef(null);
  const procRef = useRef(null);
  const gotOutput = useRef(false);

  const append = useCallback((t) => {
    if (!t) return;
    setBuf((b) => (b.length + t.length > 200000 ? (b + t).slice(-200000) : b + t));
  }, []);

  useEffect(() => {
    if (mode !== "pty") return undefined;
    const el = containerRef.current;
    if (!el) return undefined;
    let disposed = false;
    gotOutput.current = false;

    const fontSize = 12;
    const lineHeight = 1.35;
    const term = new Terminal({
      fontFamily: "var(--font-mono, ui-monospace, monospace)",
      fontSize,
      lineHeight,
      cursorBlink: true,
      cursorStyle: "block",
      scrollback: 5000,
      allowProposedApi: true,
      theme: {
        background: "#00000000",
        foreground: "#d4d4d4",
        cursor: "#d4d4d4",
        cursorAccent: "#1e1e1e",
        selectionBackground: "rgba(255,255,255,0.18)",
        black: "#6e6e6e",
        red: "#f14c4c",
        green: "#23d18b",
        yellow: "#e2c08d",
        blue: "#3b8eea",
        magenta: "#d670d6",
        cyan: "#29b8db",
        white: "#d4d4d4",
        brightBlack: "#8a8a8a",
        brightRed: "#ff6764",
        brightGreen: "#4ee6a0",
        brightYellow: "#f5d67b",
        brightBlue: "#6ab0ff",
        brightMagenta: "#e582e5",
        brightCyan: "#4adbe6",
        brightWhite: "#ffffff",
      },
    });
    term.open(el);
    termRef.current = term;

    const { cols, rows } = gridSize(el, fontSize, lineHeight);
    const processId = newProcessId();
    procRef.current = processId;

    const unsub = api.onNotification(({ method, params }) => {
      if (method !== "command/exec/outputDelta" || params?.processId !== processId) return;
      gotOutput.current = true;
      const bytes = b64decode(params.deltaBase64 || "");
      if (bytes.length) term.write(bytes);
    });

    const dataSub = term.onData((data) => {
      api.rpc("command/exec/write", { processId, deltaBase64: b64encode(data) }).catch(() => {});
    });

    // keep the PTY sized like the visible grid
    const ro = new ResizeObserver(() => {
      if (disposed) return;
      const s = gridSize(el, fontSize, lineHeight);
      try { term.resize(s.cols, s.rows); } catch {}
      api.rpc("command/exec/resize", { processId, size: { cols: s.cols, rows: s.rows } }).catch(() => {});
    });
    ro.observe(el);

    api.rpc("command/exec", {
      command: interactiveCommand,
      cwd: root || undefined,
      env: { TERM: "xterm-256color" },
      tty: true,
      processId,
      streamStdin: true,
      streamStdoutStderr: true,
      disableTimeout: true,
      size: { cols, rows },
    })
      .then((res) => {
        if (disposed) return;
        setExited(res?.exitCode ?? 0);
        term.write(`\r\n[process exited${res?.exitCode != null ? ` with code ${res.exitCode}` : ""}]\r\n`);
      })
      .catch((e) => {
        if (disposed) return;
        const msg = e?.message || String(e);
        if (gotOutput.current) {
          term.write(`\r\n[connection error: ${msg}]\r\n`);
          setExited(-1);
        } else {
          setMode("oneshot");
        }
      });

    return () => {
      disposed = true;
      ro.disconnect();
      dataSub.dispose();
      unsub();
      procRef.current = null;
      api.rpc("command/exec/terminate", { processId }).catch(() => {});
      term.dispose();
      termRef.current = null;
    };
  }, [root, mode, session]);

  const restart = () => {
    setExited(null);
    setMode("pty");
    setBuf("");
    setInput("");
    setSession((s) => s + 1);
  };

  const runOneshot = async (cmd) => {
    if (!cmd.trim()) return;
    append(`$ ${cmd}\n`);
    setBusy(true);
    try {
      const r = await api.rpc("command/exec", {
        command: oneShotCommand(cmd),
        cwd: root || undefined,
        timeoutMs: 60000,
      });
      const stdout = r?.stdout ?? r?.output ?? "";
      const stderr = r?.stderr ?? "";
      const text = [stdout.trimEnd(), stderr.trimEnd()].filter(Boolean).join("\n");
      append(`${text || "(no output)"}\n`);
    } catch (e) {
      append(`[command failed: ${e?.message || e}]\n`);
    }
    setBusy(false);
  };

  return (
    <div className="relative flex h-full flex-col bg-(--surface)">
      <button
        title={`Restart ${shellLabel}`}
        onClick={restart}
        className="absolute top-2 right-3 z-10 flex h-6 w-6 items-center justify-center rounded-md text-(--fg-tertiary) transition-colors hover:bg-(--surface-hover) hover:text-(--fg)"
      >
        <IconRefresh size={13} />
      </button>

      {mode === "oneshot" ? (
        <>
          <div className="min-h-0 flex-1 overflow-y-auto">
            <pre className="min-h-full px-3 py-2 font-mono text-xs leading-5 whitespace-pre-wrap break-all text-(--fg)">{buf || "[interactive shell unavailable — type a command and press Enter]\n"}</pre>
          </div>
          <div className="flex shrink-0 items-center gap-2 border-t border-(--border-light) px-3 py-2">
            <span className="shrink-0 font-mono text-xs text-(--accent)">❯</span>
            <input
              className="w-full bg-transparent font-mono text-xs outline-none placeholder:text-(--fg-faint)"
              placeholder="Type a command, Enter to run"
              value={input}
              disabled={busy}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const cmd = input;
                  setInput("");
                  runOneshot(cmd);
                }
              }}
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        </>
      ) : (
        <>
          <div ref={containerRef} className="xterm-host min-h-0 flex-1 overflow-hidden px-2 py-1" />
          {exited != null && (
            <div className="absolute inset-0 flex items-center justify-center gap-3 bg-(--surface)">
              <span className="text-xs text-(--fg-tertiary)">Shell exited</span>
              <button
                className="rounded-lg border border-(--border) px-2.5 py-1 text-xs text-(--fg-secondary) hover:bg-(--surface-hover)"
                onClick={restart}
              >
                Restart
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
