// Pets: built-in pet picker + custom pets folder. Selection persisted in
// localStorage under `pet`.
import React, { useState } from "react";
import * as api from "../../api.js";
import { useStore } from "../../store.js";
import { cx } from "../../lib/cx.js";
import { Card, Btn, lsGet, lsSet } from "./shared.jsx";
import { LucideIcon } from "../icons.jsx";

const PETS = [
  ["claude-icon", "Claude Icon", "A Claude Code style orange pixel pet upgraded into a tiny chef, wearing a white chef hat and holding a frying pan."],
  ["clawd", "Clawd", "A compact Codex pet based on official Claude Code pixel Clawd frames, extracted without stretching."],
  ["codex", "Codex", "The original Codex companion."],
  ["dewey", "Dewey", "A calm companion for focused workspace days"],
  ["fireball", "Fireball", "Hot path energy for fast iteration."],
  ["hoots", "Hoots", "A sharp-eyed owl for polished work in a blink."],
  ["rocky", "Rocky", "A steady rock when the diff gets large."],
  ["seedy", "Seedy", "Small green shoots for new ideas."],
  ["stacky", "Stacky", "A balanced stack for deep work."],
  ["bsod", "BSOD", "A tiny blue-screen gremlin."],
  ["null-signal", "Null Signal", "Quiet signal from the void."],
];

export default function PetsSection() {
  const appInfo = useStore((s) => s.appInfo);
  const gs = useStore((s) => s.gs);
  // The reference stores the awake pet's avatar id in the shared state; map
  // it back onto the picker ("custom:claude-icon" → claude-icon).
  const sharedId = (() => {
    const ids = gs?.["electron-persisted-atom-state"]?.["first-awake-pet-notification-avatar-ids"];
    const first = Array.isArray(ids) ? ids[0] : null;
    return first ? String(first).replace(/^custom:/, "") : null;
  })();
  const [pet, setPet] = useState(() => sharedId || lsGet("pet", "codex"));
  const petsDir = `${appInfo?.home || "~"}/.codex/pets`;

  return (
    <>
      <div className="-mt-3 mb-4 flex items-start justify-between gap-4">
        <div>
          <div className="text-[13px] font-medium">Pick a pet</div>
          <div className="mt-0.5 text-[13px] text-(--fg-tertiary)">Pets manage threads and surface what needs attention</div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            className="flex h-7 items-center gap-1.5 rounded-full border border-(--border) px-3 text-[13px] hover:bg-(--surface-hover)"
            onClick={() => api.openPath(petsDir)}
          >
            Create
          </button>
          <button
            className="flex h-7 items-center gap-1.5 rounded-full bg-(--fg) px-3 text-[13px] text-(--surface) hover:opacity-85"
            onClick={() => useStore.getState().toast("The pet overlay isn't available in this build", "warn")}
          >
            Wake Pet
          </button>
        </div>
      </div>
      <Card>
        {PETS.map(([id, name, desc]) => {
          const selected = pet === id;
          return (
            <div key={id} className="flex items-center justify-between gap-6 px-4 py-3">
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-(--border-light) bg-(--surface) text-(--fg-secondary)">
                  <LucideIcon name="PawPrint" size={16} />
                </div>
                <div className="min-w-0">
                  <div className="text-[13px]">{name}</div>
                  <div className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-(--fg-tertiary)">{desc}</div>
                </div>
              </div>
              <button
                className={cx(
                  "shrink-0 rounded-lg border px-3 py-1.5 text-[13px]",
                  selected
                    ? "border-(--accent) bg-(--accent-soft) text-(--accent)"
                    : "border-(--border) hover:bg-(--surface-hover)"
                )}
                onClick={() => {
                  setPet(id);
                  lsSet("pet", id);
                }}
              >
                {selected ? "Selected" : "Select"}
              </button>
            </div>
          );
        })}
      </Card>

      <Card title="Custom pets">
        <div className="flex items-center justify-between gap-6 px-4 py-3.5">
          <span className="min-w-0 truncate font-mono text-[12px] text-(--fg-tertiary)" title={petsDir}>
            {petsDir}
          </span>
          <Btn onClick={() => api.openPath(petsDir)}>Open folder</Btn>
        </div>
      </Card>
    </>
  );
}
