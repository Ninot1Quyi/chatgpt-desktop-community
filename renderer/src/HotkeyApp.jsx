// Hotkey popout window content: recent chats + quick composer pinned to the
// bottom of a floating frameless card. Esc hides; blur hides unless pinned.
import React, { useEffect, useState } from "react";
import { useStore } from "./store.js";
import { hideHotkey, onHotkeyShown, toggleHotkeyPin, showMainWindow } from "./api.js";
import Composer from "./components/Composer.jsx";
import { ItemView, ApprovalCard, PlanWidget } from "./components/items.jsx";
import { Spinner } from "./components/ui.jsx";
import { IconPip, IconMinus } from "./components/icons.jsx";

// Short timestamp like the reference: 5m / 3h / 6d / Jul 15.
function shortTime(sec) {
  if (!sec) return "";
  const diff = Date.now() / 1000 - sec;
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  if (diff < 7 * 86400) return `${Math.floor(diff / 86400)}d`;
  return new Date(sec * 1000).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default function HotkeyApp() {
  const status = useStore((s) => s.status);
  const init = useStore((s) => s.init);
  const activeThreadId = useStore((s) => s.activeThreadId);
  const threads = useStore((s) => s.threads);
  const { openThread, newChat } = useStore();
  const [pinned, setPinned] = useState(true);

  useEffect(() => { init(); }, []);
  useEffect(() => onHotkeyShown(() => {
    useStore.getState().newChat();
  }), []);
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") hideHotkey(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const activeName = activeThreadId ? threads.find((t) => t.id === activeThreadId)?.name : null;

  return (
    <div className="flex h-full w-full items-stretch justify-center p-2">
      <div
        className="flex max-h-full w-full flex-col overflow-hidden rounded-[20px] border border-(--border-heavy) bg-(--surface-raised)"
        style={{ boxShadow: "var(--shadow-menu)" }}
      >
        {/* drag handle row: title + pin + minimize */}
        <div className="app-drag flex h-9 shrink-0 items-center justify-between pl-4 pr-2">
          <span className="text-[14px] text-(--fg-tertiary)">{activeThreadId ? activeName || "Chat" : "New chat"}</span>
          <div className="app-no-drag flex items-center gap-0.5">
            <button
              className={`flex h-6 w-6 items-center justify-center rounded-md hover:bg-(--surface-hover) ${pinned ? "text-(--fg)" : "text-(--fg-tertiary)"}`}
              onClick={async () => setPinned(await toggleHotkeyPin())}
              title={pinned ? "Unpin" : "Keep on top"}
            >
              <IconPip size={14} />
            </button>
            <button
              className="flex h-6 w-6 items-center justify-center rounded-md text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
              onClick={hideHotkey}
              title="Minimize (Esc)"
            >
              <IconMinus size={14} />
            </button>
          </div>
        </div>

        {status !== "ready" ? (
          <div className="flex flex-1 items-center justify-center py-10 text-(--fg-tertiary)"><Spinner /></div>
        ) : activeThreadId ? (
          <HotkeyThread onBack={() => newChat()} />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1" />
            <div className="shrink-0 px-4 pb-1 text-xs text-(--fg-tertiary)">Recent chats</div>
            <div className="shrink-0 px-1.5">
              {threads.slice(0, 3).map((t) => (
                <button
                  key={t.id}
                  className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-(--surface-hover)"
                  onClick={() => openThread(t.id)}
                >
                  <span className="min-w-0 flex-1 truncate text-[14px]">{t.name || (t.preview || "").split("\n")[0] || "New chat"}</span>
                  <span className="shrink-0 text-[13px] text-(--fg-faint)">{shortTime(t.updatedAt)}</span>
                </button>
              ))}
              <button
                className="flex w-full items-center rounded-lg px-2.5 py-2 text-left text-[14px] text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
                onClick={() => { showMainWindow(); hideHotkey(); }}
              >
                See all
              </button>
            </div>
            <div className="shrink-0 p-2">
              <Composer quick />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function HotkeyThread({ onBack }) {
  const conv = useStore((s) => (s.activeThreadId ? s.conversations[s.activeThreadId] : null));
  const approvalsAll = useStore((s) => s.approvals);
  const approvals = approvalsAll.filter((a) => !a.threadId || a.threadId === useStore.getState().activeThreadId);
  const turns = conv?.turns || [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <button className="mb-1 text-xs text-(--accent) hover:underline" onClick={onBack}>← New chat</button>
        {conv?.loading && <div className="flex justify-center py-6 text-(--fg-tertiary)"><Spinner /></div>}
        <div className="flex flex-col gap-(--conversation-item-gap)">
          {turns.slice(-2).map((turn) => (
            <div key={turn.id} className="flex flex-col gap-(--conversation-item-gap)">
              {(turn.items || []).map((item, i) => (
                <ItemView key={item.id ?? i} item={item} streaming={turn.id === conv?.activeTurnId && i === turn.items.length - 1} turnId={turn.id} />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="shrink-0 px-2 pb-2">
        {conv?.plan && <PlanWidget plan={conv.plan} />}
        {approvals.map((a) => <ApprovalCard key={a.reqId} approval={a} />)}
        <Composer />
      </div>
    </div>
  );
}
