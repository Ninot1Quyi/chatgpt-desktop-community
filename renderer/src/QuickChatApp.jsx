// Quick chat window (⌥⌘N): the reference layout — "New chat" header with
// expand/close, an empty state of tab-type rows + Recent chats, and a
// compact Message ChatGPT composer at the bottom.
import React, { useEffect, useMemo } from "react";
import { useStore } from "./store.js";
import { Composer, Conversation } from "@modules/conversations";
import { IconButton, Toasts } from "./components/ui.jsx";
import { IconX, IconBranch, IconTerminal, IconGlobe, IconFolder, IconChat, LucideIcon } from "./components/icons.jsx";

const TAB_ROWS = [
  { id: "review", label: "Review", icon: <IconBranch size={15} /> },
  { id: "terminal", label: "Terminal", icon: <IconTerminal size={15} /> },
  { id: "browser", label: "Browser", icon: <IconGlobe size={15} /> },
  { id: "files", label: "Files", icon: <IconFolder size={15} /> },
  { id: "sidechat", label: "Side chat", icon: <IconChat size={15} /> },
];

export default function QuickChatApp() {
  const init = useStore((s) => s.init);
  const status = useStore((s) => s.status);
  const activeThreadId = useStore((s) => s.activeThreadId);
  const threads = useStore((s) => s.threads);
  const { newChat, openThread, applyTheme } = useStore();

  useEffect(() => {
    // Quick chat opens in ChatGPT mode ("Message ChatGPT" placeholder) —
    // set state only, do NOT persist (main window keeps its own mode).
    useStore.setState({ mode: "chatgpt" });
    init();
  }, []);
  useEffect(() => { applyTheme(); }, []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") window.close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const recent = useMemo(() => threads.slice(0, 3), [threads]);

  if (status !== "ready") {
    return (
      <div className="flex h-full w-full items-center justify-center bg-(--surface) text-[13px] text-(--fg-tertiary)">
        Starting…
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col bg-(--surface)">
      {/* header: title + expand + close */}
      <div className="app-drag flex h-10 shrink-0 items-center justify-between pl-4 pr-2">
        <span className="text-[13px] font-medium">{activeThreadId ? "Chat" : "New chat"}</span>
        <div className="app-no-drag flex items-center gap-1">
          <IconButton icon={<LucideIcon name="Maximize2" size={12} />} title="Open in app" onClick={() => window.open("index.html", "_blank")} />
          <IconButton icon={<IconX size={13} />} title="Close" onClick={() => window.close()} />
        </div>
      </div>

      {activeThreadId ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <Conversation />
        </div>
      ) : (
        <>
          {/* empty state: tab-type rows */}
          <div className="flex flex-col gap-px px-3 pb-2">
            {TAB_ROWS.map((r) => (
              <button
                key={r.id}
                className="flex h-8 items-center gap-2.5 rounded-lg px-2 text-left text-[13px] text-(--fg) hover:bg-(--surface-hover)"
                onClick={() => newChat()}
              >
                <span className="flex h-4 w-4 items-center justify-center text-(--fg-tertiary)">{r.icon}</span>
                {r.label}
              </button>
            ))}
          </div>

          {/* recent chats */}
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-(--border-light) px-3 py-2">
            <div className="px-2 pb-1 text-xs text-(--fg-tertiary)">Recent chats</div>
            {recent.map((t) => (
              <button
                key={t.id}
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-(--surface-hover)"
                onClick={() => openThread(t.id)}
              >
                <span className="min-w-0 flex-1 truncate text-[13px]">{t.name || (t.preview || "").split("\n")[0] || "New chat"}</span>
                <span className="shrink-0 text-xs text-(--fg-faint)">{quickDate(t.updatedAt)}</span>
              </button>
            ))}
            {threads.length > 3 && (
              <button
                className="mt-0.5 w-full rounded-lg px-2 py-1.5 text-left text-[13px] text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
                onClick={() => window.open("index.html", "_blank")}
              >
                See all
              </button>
            )}
          </div>

          {/* compact composer */}
          <div className="shrink-0 px-2 pb-2">
            <Composer centered />
          </div>
        </>
      )}
      <Toasts />
    </div>
  );
}

function quickDate(ts) {
  if (!ts) return "";
  const ms = ts > 1e12 ? ts : ts * 1000;
  const d = new Date(ms);
  const days = Math.floor((Date.now() - ms) / 86400e3);
  if (days >= 1 && days < 7) return `${days}d`;
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
