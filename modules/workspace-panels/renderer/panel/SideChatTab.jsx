// Side chat tab: quick prompt box that forwards to the main chat.
import React, { useState } from "react";
import { useStore } from "@app/store.js";
import { IconButton } from "@app/components/ui.jsx";
import { IconChat, IconArrowUp } from "@app/components/icons.jsx";

export default function SideChatTab() {
  const [text, setText] = useState("");

  const send = () => {
    const t = text.trim();
    if (!t) return;
    useStore.getState().sendMessage(t);
    setText("");
    useStore.getState().toast("Sent to main chat");
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1.5 px-6 text-center">
        <IconChat size={22} className="mb-1 text-(--fg-faint)" />
        <div className="text-[13px] font-medium text-(--fg-secondary)">Side chat</div>
        <div className="text-xs text-(--fg-tertiary)">Ask a quick question without leaving this view</div>
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
          <IconButton icon={<IconArrowUp />} title="Send to main chat" onClick={send} size={13} disabled={!text.trim()} />
        </div>
      </div>
    </div>
  );
}
