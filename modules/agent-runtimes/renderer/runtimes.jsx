// Vendor (runtime) registry — single source of truth for the sidebar history
// sources (Codex, Claude Code, Kimi Code). Sidebar sections, the Settings
// drag-to-reorder card, and cross-vendor search all read from here.
//
// To add a new history source:
//   1. add its store slices (`<id>Threads`, `<id>ThreadsLoading`,
//      `<id>ThreadsError`, `<id>ConfigDir`) plus a `load<Id>Threads` action
//      in store.js;
//   2. add one entry below.
// Sidebar, Settings, and search pick it up with no further changes.
import React from "react";
import { cx } from "@app/lib/cx.js";
import { CodexMark, IconClaude, IconKimi } from "@app/components/icons.jsx";

export const RUNTIMES = [
  {
    id: "codex",
    label: "Codex",
    icon: (size = 14, className) => <CodexMark size={size} className={cx("text-(--fg-secondary)", className)} />,
  },
  {
    id: "claude",
    label: "Claude Code",
    icon: (size = 14, className) => <IconClaude size={size} className={cx("text-[#d97757]", className)} />,
    // store slices backing this source (see store.js)
    stateKeys: {
      threads: "claudeThreads",
      loading: "claudeThreadsLoading",
      error: "claudeThreadsError",
      configDir: "claudeConfigDir",
    },
    loaderName: "loadClaudeThreads",
  },
  {
    id: "kimi",
    label: "Kimi Code",
    icon: (size = 14, className) => <IconKimi size={size} className={className} />,
    stateKeys: {
      threads: "kimiThreads",
      loading: "kimiThreadsLoading",
      error: "kimiThreadsError",
      configDir: "kimiConfigDir",
    },
    loaderName: "loadKimiThreads",
  },
];

export const RUNTIME_IDS = RUNTIMES.map((r) => r.id);

// Sources with their own history store slices (everything except Codex).
export const EXTERNAL_RUNTIMES = RUNTIMES.filter((r) => r.stateKeys);

export const runtimeMeta = (id) => RUNTIMES.find((r) => r.id === id);
