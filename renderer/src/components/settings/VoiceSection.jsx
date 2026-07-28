// Voice: dictation prefs, dictionary and history. Persisted under `voice.*`.
import React, { useState } from "react";
import { Card, Row, Toggle, Dropdown, Segmented, lsGet, lsSet } from "./shared.jsx";
import { IconX } from "../icons.jsx";

export default function VoiceSection() {
  const [mic, setMic] = useState(() => lsGet("voice.microphone", "default"));
  const [hold, setHold] = useState(() => lsGet("voice.holdToDictate", "off"));
  const [bar, setBar] = useState(() => lsGet("voice.keepBarVisible", false));
  const [dictionary, setDictionary] = useState(() => lsGet("voice.dictionary", []));
  const [draft, setDraft] = useState("");
  const [history] = useState(() => lsGet("voice.history", []));

  const addEntry = () => {
    const word = draft.trim();
    if (!word) return;
    const next = [...dictionary, word];
    setDictionary(next);
    lsSet("voice.dictionary", next);
    setDraft("");
  };

  return (
    <>
      <Card title="Dictation">
        <Row title="Microphone" desc="Used for dictation">
          <Dropdown
            value={mic}
            options={[{ id: "default", label: "System default" }]}
            onChange={(v) => {
              setMic(v);
              lsSet("voice.microphone", v);
            }}
          />
        </Row>
        <Row title="Hold-to-dictate hotkey" desc="Hold anywhere on desktop to dictate where your cursor is">
          <Segmented
            value={hold}
            options={[
              ["off", "Off"],
              ["on", "On"],
            ]}
            onChange={(v) => {
              setHold(v);
              lsSet("voice.holdToDictate", v);
            }}
          />
        </Row>
        <Row title="Toggle dictation hotkey" desc="Press once anywhere on desktop to dictate, then press again to stop">
          <kbd className="rounded-md border border-(--border) bg-(--surface-hover) px-1.5 py-0.5 font-mono text-xs text-(--fg-secondary)">
            ⌥A
          </kbd>
        </Row>
        <Row title="Keep dictation bar visible" desc="Show a small shortcut reminder when dictation isn't recording">
          <Toggle
            on={bar}
            onChange={(v) => {
              setBar(v);
              lsSet("voice.keepBarVisible", v);
            }}
          />
        </Row>
      </Card>

      <Card title="Dictation dictionary">
        <div className="px-4 py-3.5">
          <div className="text-[12px] text-(--fg-tertiary)">Words or phrases dictation should recognize</div>
          <div className="mt-2 flex gap-2">
            <input
              className="h-8 min-w-0 flex-1 rounded-lg border border-(--border-light) bg-(--surface) px-2.5 text-[13px] outline-none placeholder:text-(--fg-faint) focus:border-(--accent)"
              placeholder="Add entry"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addEntry()}
            />
            <button
              className="h-8 shrink-0 rounded-lg border border-(--border) px-3 text-[13px] hover:bg-(--surface-hover) disabled:opacity-50"
              disabled={!draft.trim()}
              onClick={addEntry}
            >
              Add
            </button>
          </div>
          {dictionary.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {dictionary.map((w, i) => (
                <span
                  key={`${w}-${i}`}
                  className="flex items-center gap-1 rounded-full border border-(--border-light) bg-(--surface) px-2 py-0.5 text-[12px]"
                >
                  {w}
                  <button
                    className="text-(--fg-faint) hover:text-(--danger)"
                    onClick={() => {
                      const next = dictionary.filter((_, j) => j !== i);
                      setDictionary(next);
                      lsSet("voice.dictionary", next);
                    }}
                  >
                    <IconX size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </Card>

      <Card title="Dictation history">
        {history.length === 0 ? (
          <div className="px-4 py-6 text-center text-[12px] text-(--fg-faint)">No dictation history yet.</div>
        ) : (
          history.map((h, i) => (
            <div key={i} className="flex items-baseline gap-3 px-4 py-2.5">
              <span className="shrink-0 text-[12px] text-(--fg-tertiary)">{h.when}</span>
              <span className="min-w-0 truncate text-[13px]">{h.text}</span>
            </div>
          ))
        )}
      </Card>
    </>
  );
}
