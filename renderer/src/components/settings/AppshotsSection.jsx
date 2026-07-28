// Appshots screenshot preferences. Persisted under `appshots.*`.
import React, { useState } from "react";
import { Card, Row, Toggle, Dropdown, lsGet, lsSet } from "./shared.jsx";

export default function AppshotsSection() {
  const [dest, setDest] = useState(() => lsGet("appshots.destination", "automatic"));
  const [sound, setSound] = useState(() => lsGet("appshots.sound", true));

  return (
    <>
      <div className="-mt-3 mb-4 text-[13px] text-(--fg-tertiary)">
        Take an appshot to show ChatGPT your frontmost window
        <div className="mt-0.5">Appshots include visual and text content, including text scrolled offscreen</div>
      </div>
      <Card>
      <Row title="Hotkey" desc="Capture the foreground window">
        <kbd className="rounded-md border border-(--border) bg-(--surface-hover) px-1.5 py-0.5 font-mono text-xs text-(--fg-secondary)">
          Ctrl+Shift+S
        </kbd>
      </Row>
      <Row title="Appshot destination" desc="Choose where appshots go when you use the hotkey">
        <Dropdown
          value={dest}
          options={[
            { id: "automatic", label: "Automatic" },
            { id: "clipboard", label: "Clipboard" },
            { id: "desktop", label: "Desktop" },
            { id: "downloads", label: "Downloads" },
          ]}
          onChange={(v) => {
            setDest(v);
            lsSet("appshots.destination", v);
          }}
        />
      </Row>
      <Row title="Play sound effect">
        <Toggle
          on={sound}
          onChange={(v) => {
            setSound(v);
            lsSet("appshots.sound", v);
          }}
        />
      </Row>
    </Card>
    </>
  );
}
