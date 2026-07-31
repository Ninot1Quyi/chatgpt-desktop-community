// Voice: dictation prefs, dictionary and history. Persisted under `voice.*`.
import React, { useEffect, useState } from "react";
import { Card, Row, Toggle, Dropdown, Segmented, lsGet, lsSet } from "./shared.jsx";
import { IconX } from "@app/components/icons.jsx";
import * as api from "@app/api.js";

const FALLBACK_GPT_LIVE_VOICES = [
  { id: "alloy", label: "Alloy" },
  { id: "ash", label: "Ash" },
  { id: "ballad", label: "Ballad" },
  { id: "coral", label: "Coral" },
  { id: "echo", label: "Echo" },
  { id: "marin", label: "Marin" },
  { id: "sage", label: "Sage" },
  { id: "shimmer", label: "Shimmer" },
  { id: "verse", label: "Verse" },
];

function voiceOption(id) {
  return {
    id,
    label: String(id).charAt(0).toUpperCase() + String(id).slice(1),
  };
}

export default function VoiceSection() {
  const [mic, setMic] = useState(() => lsGet("voice.microphone", "default"));
  const [mics, setMics] = useState([{ id: "default", label: "System default" }]);
  const [hold, setHold] = useState(() => lsGet("voice.holdToDictate", "off"));
  const [bar, setBar] = useState(() => lsGet("voice.keepBarVisible", false));
  const [liveVoice, setLiveVoice] = useState(() => lsGet("voice.gptLive.voice", "marin"));
  const [liveVoices, setLiveVoices] = useState(FALLBACK_GPT_LIVE_VOICES);
  const [dictionary, setDictionary] = useState(() => lsGet("voice.dictionary", []));
  const [draft, setDraft] = useState("");
  const [history] = useState(() => lsGet("voice.history", []));

  useEffect(() => {
    let live = true;
    navigator.mediaDevices?.enumerateDevices?.()
      .then((devices) => {
        if (!live) return;
        const inputs = devices
          .filter((device) => device.kind === "audioinput")
          .map((device, index) => ({
            id: device.deviceId,
            label: device.label || `Microphone ${index + 1}`,
          }))
          .filter((device) => device.id);
        setMics([{ id: "default", label: "System default" }, ...inputs]);
      })
      .catch(() => {});
    return () => { live = false; };
  }, []);

  useEffect(() => {
    let live = true;
    api.rpc("thread/realtime/listVoices", {})
      .then((response) => {
        if (!live) return;
        const voices = response?.voices?.v2?.length
          ? response.voices.v2
          : response?.voices?.v1;
        if (Array.isArray(voices) && voices.length) {
          setLiveVoices(voices.map(voiceOption));
          const defaults = [response?.voices?.defaultV2, response?.voices?.defaultV1].filter(Boolean);
          if (!voices.includes(liveVoice) && defaults.length) {
            setLiveVoice(defaults[0]);
            lsSet("voice.gptLive.voice", defaults[0]);
          }
        }
      })
      .catch(() => {});
    return () => { live = false; };
  }, [liveVoice]);

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
            options={mics}
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

      <Card title="GPT Live">
        <Row title="Response voice" desc="Saved preference for realtime audio sessions">
          <Dropdown
            value={liveVoice}
            options={liveVoices}
            onChange={(v) => {
              setLiveVoice(v);
              lsSet("voice.gptLive.voice", v);
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
