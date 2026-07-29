// Personalization: personality, custom instructions and memory controls.
import React, { useState } from "react";
import * as api from "@app/api.js";
import { useStore } from "@app/store.js";
import { Card, Row, Toggle, Dropdown, Btn, lsGet, lsSet } from "./shared.jsx";

const PERSONALITIES = [
  { id: "pragmatic", label: "Pragmatic" },
  { id: "friendly", label: "Friendly" },
  { id: "professional", label: "Professional" },
  { id: "playful", label: "Playful" },
];

export default function PersonalizationSection() {
  const toast = useStore((s) => s.toast);
  const [personality, setPersonality] = useState(() => lsGet("personalization.personality", "pragmatic"));
  const [instructions, setInstructions] = useState(() => lsGet("customInstructions", ""));
  const [memories, setMemories] = useState(() => lsGet("memory.enabled", true));
  const [chronicle, setChronicle] = useState(() => lsGet("memory.chronicle", false));
  const [toolChats, setToolChats] = useState(() => lsGet("memory.toolChats", true));
  const [resetting, setResetting] = useState(false);

  const saveInstructions = () => {
    lsSet("customInstructions", instructions);
    api.rpc("config/value/write", { key: "instructions", value: instructions }).catch(() => {});
    toast("Custom instructions saved", "info");
  };

  const resetMemories = async () => {
    if (!window.confirm("Delete all ChatGPT memories? This cannot be undone.")) return;
    setResetting(true);
    try {
      await api.rpc("memory/reset", {});
      toast("Memories reset", "info");
    } catch (e) {
      toast(`Reset failed: ${e.message}`, "error");
    } finally {
      setResetting(false);
    }
  };

  return (
    <>
      <div className="mb-4 px-1 text-[12px] leading-5 text-(--fg-tertiary)">
        Personality settings are not supported by every model. The assistant&apos;s tone can be customized in Custom instructions.
      </div>

      <Card>
        <Row title="Personality" desc="Choose a default tone for ChatGPT responses">
          <Dropdown
            value={personality}
            options={PERSONALITIES}
            onChange={(v) => {
              setPersonality(v);
              lsSet("personalization.personality", v);
            }}
          />
        </Row>
        <div className="px-4 py-3.5">
          <div className="text-[13px]">Custom instructions</div>
          <div className="mt-0.5 text-[12px] leading-5 text-(--fg-tertiary)">
            Give ChatGPT extra instructions and context for all chats on this host. Learn more
          </div>
          <textarea
            className="mt-2 h-28 w-full resize-y rounded-lg border border-(--border-light) bg-(--surface) px-2.5 py-2 text-[13px] outline-none placeholder:text-(--fg-faint) focus:border-(--accent)"
            placeholder="e.g. Prefer concise answers and TypeScript examples."
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
          />
          <div className="mt-2 flex justify-end">
            <Btn onClick={saveInstructions}>Save</Btn>
          </div>
        </div>
      </Card>

      <Card title="Memory">
        <div className="px-4 py-3.5 text-[12px] leading-5 text-(--fg-tertiary)">
          Configure how ChatGPT collects, retains, and consolidates memories. Learn more
        </div>
        <Row title="Enable memories" desc="Generate new memories from chats and bring them into new chats">
          <Toggle
            on={memories}
            onChange={(v) => {
              setMemories(v);
              lsSet("memory.enabled", v);
            }}
          />
        </Row>
        <Row
          title="Chronicle research preview"
          desc="Augment memories with screen context so ChatGPT can help with anything you’re working on. Learn more"
        >
          <Toggle
            on={chronicle}
            onChange={(v) => {
              setChronicle(v);
              lsSet("memory.chronicle", v);
            }}
          />
        </Row>
        <Row
          title="Allow memory generation from tool-assisted chats"
          desc="Generate memories from chats that used MCP tools or web search"
        >
          <Toggle
            on={toolChats}
            onChange={(v) => {
              setToolChats(v);
              lsSet("memory.toolChats", v);
            }}
          />
        </Row>
        <Row title="Reset memories" desc="Delete all ChatGPT memories">
          <Btn danger disabled={resetting} onClick={resetMemories}>
            {resetting ? "Resetting…" : "Reset"}
          </Btn>
        </Row>
      </Card>
    </>
  );
}
