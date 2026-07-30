// Side chat tab: quick prompt box that forwards to the main chat.
import React, { useState } from "react";
import { useStore } from "@app/store.js";
import { IconButton } from "@app/components/ui.jsx";
import { IconChat, IconArrowUp } from "@app/components/icons.jsx";
import { basename } from "@app/lib/time.js";

function threadContextSummary(conv, cwd) {
  const thread = conv?.thread || {};
  const title = thread.title || conv?.title || "Current chat";
  const project = thread.cwd || cwd || "";
  return {
    title,
    projectLabel: project ? basename(project) || project : "No project selected",
  };
}

export default function SideChatTab() {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const activeThreadId = useStore((s) => s.activeThreadId);
  const conv = useStore((s) => (s.activeThreadId ? s.conversations[s.activeThreadId] : null));
  const cwd = useStore((s) => s.cwd);
  const context = threadContextSummary(conv, cwd);

  const send = async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    try {
      const store = useStore.getState();
      await store.sendMessage(t, [], [], {
        steer: !!activeThreadId && store.isTurnActive(activeThreadId),
      });
      setText("");
      store.toast("Sent to main chat");
    } catch (e) {
      useStore.getState().toast(`Side chat failed: ${e.message}`, "error");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
        <IconChat size={22} className="mb-1 text-(--fg-faint)" />
        <div className="text-[13px] font-medium text-(--fg-secondary)">Side chat</div>
        <div className="text-xs text-(--fg-tertiary)">Ask in the active thread without leaving this view</div>
        <div className="mt-2 max-w-full rounded-xl border border-(--border-light) bg-(--panel-action-bg) px-3 py-2 text-left">
          <div className="truncate text-[12px] font-medium text-(--fg-secondary)" title={context.title}>{context.title}</div>
          <div className="mt-0.5 truncate text-[11px] text-(--fg-faint)" title={context.projectLabel}>{context.projectLabel}</div>
        </div>
      </div>
      <div className="shrink-0 border-t border-(--border-light) p-2">
        <div className="flex items-end gap-1.5 rounded-xl border border-(--border) bg-(--input-bg) px-2.5 py-1.5">
          <textarea
            rows={2}
            className="max-h-32 w-full resize-none bg-transparent text-[13px] outline-none placeholder:text-(--fg-faint)"
            placeholder="Ask a question…"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <div className="flex flex-col items-end gap-1">
            <kbd className="rounded bg-(--surface-hover) px-1 py-px text-[10px] leading-none text-(--fg-faint)">Enter</kbd>
            <IconButton icon={<IconArrowUp />} title="Send to main chat" onClick={send} size={13} disabled={!text.trim() || sending} />
          </div>
        </div>
      </div>
    </div>
  );
}
