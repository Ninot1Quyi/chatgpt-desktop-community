// Git: branch prefix, PR merge method and related Git prefs.
import React, { useState } from "react";
import * as api from "@app/api.js";
import { Card, Row, Toggle, Dropdown, Segmented, lsGet, lsSet } from "./shared.jsx";

export default function GitSection() {
  const [prefix, setPrefix] = useState(() => lsGet("git.branchPrefix", ""));
  const [merge, setMerge] = useState(() => lsGet("git.mergeMethod", "merge"));
  const [forcePush, setForcePush] = useState(() => lsGet("git.alwaysForcePush", false));
  const [drafts, setDrafts] = useState(() => lsGet("git.draftPrs", false));
  const [review, setReview] = useState(() => lsGet("git.reviewDelivery", "inline"));

  const savePrefix = (value) => {
    setPrefix(value);
    lsSet("git.branchPrefix", value);
    api.rpc("config/value/write", { keyPath: "git.branchPrefix", value, mergeStrategy: "replace" }).catch(() => {});
  };

  return (
    <Card>
      <Row title="Branch prefix" desc="Prefix used when ChatGPT creates new branches">
        <input
          className="h-8 w-[11.25rem] rounded-lg border border-(--border-light) bg-(--surface) px-2.5 text-[0.8125rem] outline-none placeholder:text-(--fg-faint) focus:border-(--accent)"
          placeholder="e.g. codex/"
          value={prefix}
          onChange={(e) => setPrefix(e.target.value)}
          onBlur={(e) => savePrefix(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && savePrefix(e.currentTarget.value)}
        />
      </Row>
      <Row title="Pull request merge method" desc="Choose how ChatGPT merges pull requests">
        <Segmented
          value={merge}
          options={[
            ["merge", "Merge"],
            ["squash", "Squash"],
          ]}
          onChange={(v) => {
            setMerge(v);
            lsSet("git.mergeMethod", v);
          }}
        />
      </Row>
      <Row title="Always force push" desc="Use --force-with-lease when pushing from ChatGPT">
        <Toggle
          on={forcePush}
          onChange={(v) => {
            setForcePush(v);
            lsSet("git.alwaysForcePush", v);
          }}
        />
      </Row>
      <Row title="Create draft pull requests" desc="Use draft pull requests by default when creating PRs from ChatGPT">
        <Toggle
          on={drafts}
          onChange={(v) => {
            setDrafts(v);
            lsSet("git.draftPrs", v);
          }}
        />
      </Row>
      <Row title="Review delivery" desc="Start /review in the current chat when possible or launch a separate review chat">
        <Segmented
          value={review}
          options={[
            ["inline", "Inline"],
            ["detached", "Detached"],
          ]}
          onChange={(v) => {
            setReview(v);
            lsSet("git.reviewDelivery", v);
          }}
        />
      </Row>
    </Card>
  );
}

// Multiline instruction box with a Save button (Commit / PR instructions).
function InstructionsCard({ title, desc, storageKey }) {
  const [value, setValue] = useState(() => lsGet(storageKey, ""));
  const [saved, setSaved] = useState(true);
  return (
    <Card title={title}>
      <div className="px-4 py-3">
        <div className="text-[0.75rem] text-(--fg-tertiary)">{desc}</div>
        <textarea
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setSaved(false);
          }}
          rows={5}
          spellCheck={false}
          className="mt-2 w-full resize-y rounded-lg border border-(--border-light) bg-(--surface) p-2.5 font-mono text-[0.75rem] leading-relaxed outline-none focus:border-(--border-heavy)"
        />
        <div className="mt-2 flex justify-end">
          <button
            disabled={saved}
            onClick={() => {
              lsSet(storageKey, value);
              setSaved(true);
            }}
            className="flex h-7 items-center rounded-lg border border-(--border) px-3 text-[0.8125rem] hover:bg-(--surface-hover) disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </Card>
  );
}

export function GitInstructionsSections() {
  return (
    <>
      <InstructionsCard title="Commit instructions" desc="Added to commit message generation prompts" storageKey="git.commitInstructions" />
      <InstructionsCard title="Pull request instructions" desc="Added to PR title/description generation prompts" storageKey="git.prInstructions" />
    </>
  );
}
