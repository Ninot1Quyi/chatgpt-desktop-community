// Renderers for the ThreadItem union, the turn action row, the plan-steps
// widget and the inline approval cards shown above the composer.
import React, { useState } from "react";
import { cx } from "../lib/cx.js";
import * as api from "../api.js";
import { localFileUrl, showItemInFolder } from "../api.js";
import { countDiff, parseUnifiedDiff } from "../lib/diff.js";
import { basename, formatDuration } from "../lib/time.js";
import { commandActivity } from "../lib/commandActivity.mjs";
import { useStore } from "../store.js";
import { openFileInPanel } from "./RightPanel.jsx";
import Markdown from "./Markdown.jsx";
import { ActivityDisclosure, Spinner, Menu, Dialog } from "./ui.jsx";
import {
  IconChevronRight, IconChevronDown, IconTerminal, IconFile,
  IconImage, IconCheck, IconClock, IconShield, IconCopy, IconPencil,
  IconCpu, IconChat, IconUndo, IconSparkle, LucideIcon,
  IconBookOpen, IconCodeSearching, IconContextCompaction, IconEditFiles, IconGoalChevron,
  IconListFiles, IconMcpSource, IconRunCommand, IconWebSearch,
} from "./icons.jsx";

const IconThumbUp = (p) => <LucideIcon name="ThumbsUp" size={p.size || 16} className={p.className} style={p.style} />;
const IconThumbDown = (p) => <LucideIcon name="ThumbsDown" size={p.size || 16} className={p.className} style={p.style} />;
const IconRetry = (p) => <LucideIcon name="RotateCcw" size={p.size || 16} className={p.className} style={p.style} />;

// ---------------------------------------------------------------------------
// ItemView: dispatches on ThreadItem.type.
// `streaming` is true only for the item(s) of the currently-active turn.
// ---------------------------------------------------------------------------
export function ItemView({ item, streaming, turnId }) {
  if (item.type === "reasoning"
    && !(item.summary?.length || item.content?.length)
    && !streaming) return null;
  const body = (() => {
    switch (item.type) {
      case "userMessage": return <UserMessage item={item} />;
      case "agentMessage": return <AgentMessage item={item} streaming={streaming} />;
      case "reasoning": return <Reasoning item={item} streaming={streaming} />;
      case "plan": return <PlanText item={item} />;
      case "commandExecution": return <CommandCard item={item} streaming={streaming} />;
      case "fileChange": return <FileChangeCard item={item} />;
      case "mcpToolCall":
      case "dynamicToolCall": return <ToolCallRow item={item} />;
      case "webSearch": return <WebSearchRow item={item} />;
      case "imageView": return <ImageView item={item} />;
      case "imageGeneration": return <ImageGeneration item={item} />;
      case "collabAgentToolCall": return <CollabRow item={item} />;
      case "subAgentActivity": return <SubAgentActivityRow item={item} />;
      case "contextCompaction": return <Divider label="Context automatically compacted" />;
      case "enteredReviewMode": return <Subtle icon={<IconShield size={13} />} text="Entered review mode" />;
      case "exitedReviewMode": return <Subtle icon={<IconShield size={13} />} text="Exited review mode" />;
      case "hookPrompt": return null;
      case "sleep": return <Subtle icon={<IconClock size={13} />} text={`Waiting… ${formatDuration(item.durationMs)}`} />;
      default: return null;
    }
  })();
  if (!body) return null;
  return <div className="fade-in min-w-0" data-item-id={item.id}>{body}</div>;
}

// ---------------------------------------------------------------------------
// userMessage — right-aligned bubble with hover Copy / Edit actions.
// ---------------------------------------------------------------------------
// Strip the app-server's injected wrappers from user text; the reference UI
// shows only the request itself.
function cleanUserText(raw) {
  let t = raw;
  // Injected context blocks (browser state, etc.).
  t = t.replace(/<in-app-browser-context[\s\S]*?<\/in-app-browser-context>/g, "");
  // "# Files mentioned by the user:" header plus its "## name: path" entries.
  t = t.replace(/\n?# Files mentioned by the user:\n(?:\n## [^\n]+\n?)*/g, "");
  // The request marker header.
  t = t.replace(/## My request for Codex:\s*\n?/, "");
  return t.trim();
}

function UserMessage({ item }) {
  const readOnly = useStore((s) => {
    const conv = s.activeThreadId ? s.conversations[s.activeThreadId] : null;
    return !!conv?.readOnly;
  });
  const texts = (item.content || []).filter((c) => c.type === "text").map((c) => c.text);
  const images = (item.content || []).filter((c) => c.type === "localImage" || c.type === "image");
  const mentions = (item.content || []).filter((c) => c.type === "mention" || c.type === "skill");
  const full = cleanUserText(texts.join("\n"));
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(full);

  const copy = () => {
    navigator.clipboard.writeText(full);
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };

  // Edit-and-resend: roll back the turn containing this message, then send
  // the edited text as a new turn.
  const resend = async () => {
    if (readOnly) return;
    const s = useStore.getState();
    const threadId = s.activeThreadId;
    const text = draft.trim();
    setEditing(false);
    if (!threadId || !text) return;
    try {
      // Roll back turns until this message is the last user message's turn.
      const conv = s.conversations[threadId];
      const idx = (conv?.turns || []).findIndex((t) => (t.items || []).some((it) => it.id === item.id));
      if (idx >= 0) {
        const numTurns = conv.turns.length - idx;
        await api.rpc("thread/rollback", { threadId, numTurns });
        // Refresh the conversation view after rollback.
        const r = await api.rpc("thread/read", { threadId, includeTurns: true });
        s._mutateConv(threadId, (c) => ({ ...c, thread: r?.thread || c.thread, turns: r?.thread?.turns || [] }));
      }
      await s.sendMessage(text);
    } catch (e) {
      s.toast(`Edit failed: ${e.message}`, "error");
    }
  };

  if (editing) {
    return (
      <div className="flex flex-col items-end">
        <textarea
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-full max-w-[77%] resize-none rounded-[20px] border border-(--border) bg-(--bubble-user) px-3.5 py-2.5 text-[14px] leading-6 outline-none focus:border-(--border-heavy)"
          rows={Math.min(12, Math.max(2, draft.split("\n").length))}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); resend(); } }}
        />
        <div className="mt-1.5 flex gap-1.5">
          <button
            className="rounded-lg border border-(--border) px-2.5 py-1 text-xs text-(--fg-secondary) hover:bg-(--surface-hover)"
            onClick={() => { setDraft(full); setEditing(false); }}
          >
            Cancel
          </button>
          <button
            className="rounded-lg bg-(--fg) px-2.5 py-1 text-xs font-medium text-(--surface) hover:opacity-85"
            title="Roll back this turn and resend"
            onClick={resend}
          >
            Send
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group/msg flex flex-col items-end gap-2">
      {images.length > 0 && (
        <div className="hide-scrollbar flex max-w-full flex-row-reverse self-end overflow-x-auto">
          <div className="flex min-w-max items-end gap-2">
            {images.map((c, i) => (
              <div key={i} className="flex size-20 items-center justify-center rounded-[12.5px] border border-(--border-heavy)">
                <img
                  src={c.type === "localImage" ? localFileUrl(c.path) : c.url}
                  className="h-full w-full rounded-[10px] object-cover"
                  alt=""
                />
              </div>
            ))}
          </div>
        </div>
      )}
      {(full || mentions.length > 0) && <div className="flex w-full flex-col items-end justify-end gap-1">
        <div className="max-w-[77%] rounded-[20px] bg-(--bubble-user) px-3 py-2">
          {mentions.length === 1 ? (
            <span className="mr-1 inline-block rounded-md bg-(--accent-soft) px-1.5 py-0.5 text-xs text-(--accent)">
              @{mentions[0].name}
            </span>
          ) : mentions.length > 1 ? (
            <MentionSummary mentions={mentions} />
          ) : null}
          {full && <div className="text-[14px] leading-[22px] whitespace-pre-wrap break-words">{full}</div>}
        </div>
        <div className="flex h-[26px] items-center gap-0.5 opacity-0 transition-opacity group-hover/msg:opacity-100">
          <HoverAction title="Copy" onClick={copy} icon={copied ? <IconCheck size={13} /> : <IconCopy size={13} />} />
          {!readOnly && (
            <HoverAction title="Edit" onClick={() => { setDraft(full); setEditing(true); }} icon={<IconPencil size={13} />} />
          )}
        </div>
      </div>}
    </div>
  );
}

function HoverAction({ icon, title, onClick }) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="flex h-6 w-6 items-center justify-center rounded-md text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
    >
      {icon}
    </button>
  );
}

// ---------------------------------------------------------------------------
// agentMessage — markdown; shimmer while empty.
// ---------------------------------------------------------------------------
function AgentMessage({ item, streaming }) {
  if (!item.text) {
    return streaming ? <span className="shimmer-text text-[14px]">Thinking</span> : null;
  }
  return (
    <div className="min-w-0">
      <Markdown>{item.text}</Markdown>
      {item.memoryCitation && <MemoryCitation citation={item.memoryCitation} />}
    </div>
  );
}

// "N files mentioned by the user" summary chip (expandable list).
function MentionSummary({ mentions }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="mb-1 inline-block">
      <button
        className="flex items-center gap-1 rounded-md bg-(--accent-soft) px-1.5 py-0.5 text-xs text-(--accent) hover:opacity-90"
        onClick={() => setOpen(!open)}
      >
        <IconFile size={11} />
        {mentions.length} files mentioned by the user
      </button>
      {open && (
        <span className="mt-1 flex flex-col gap-0.5">
          {mentions.map((c, i) => (
            <span key={i} className="block truncate font-mono text-[11px] text-(--fg-tertiary)" title={c.path}>
              @{c.name}
            </span>
          ))}
        </span>
      )}
    </span>
  );
}

// "N memory citations" collapsible row under an assistant message.
function MemoryCitation({ citation }) {
  const [open, setOpen] = useState(false);
  const entries = citation.entries || [];
  if (!entries.length) return null;
  return (
    <div className="mt-1">
      <button
        className="flex items-center gap-1.5 text-xs text-(--fg-tertiary) hover:text-(--fg-secondary)"
        onClick={() => setOpen(!open)}
      >
        <IconChevronRight size={11} className={cx("transition-transform", open && "rotate-90")} />
        {entries.length} memory citation{entries.length === 1 ? "" : "s"}
      </button>
      {open && (
        <div className="mt-1 flex flex-col gap-1 border-l-2 border-(--border) pl-3">
          {entries.map((e, i) => (
            <div key={i} className="text-xs text-(--fg-tertiary)">
              <span className="font-mono text-(--fg-secondary)">{e.path}:{e.lineStart}-{e.lineEnd}</span>
              {e.note && <span className="ml-1.5">{e.note}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// TurnActionRow — copy / thumbs up / thumbs down / retry under a completed
// assistant turn.
// ---------------------------------------------------------------------------
export function TurnActionRow({ turn }) {
  const toast = useStore((s) => s.toast);
  const sendMessage = useStore((s) => s.sendMessage);
  const running = useStore((s) => !!s.activeConversation()?.activeTurnId);
  const readOnly = useStore((s) => !!s.activeConversation()?.readOnly);
  const [copied, setCopied] = useState(false);

  const agentTexts = (turn.items || []).filter((i) => i.type === "agentMessage" && i.text).map((i) => i.text);
  if (agentTexts.length === 0) return null;
  const firstUser = (turn.items || []).find((i) => i.type === "userMessage");
  const firstUserText = (firstUser?.content || []).filter((c) => c.type === "text").map((c) => c.text).join("\n");

  const copy = () => {
    navigator.clipboard.writeText(agentTexts.join("\n\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1000);
  };
  const feedback = (classification) => {
    api.rpc("feedback/upload", { threadId: turn.threadId || useStore.getState().activeThreadId, classification }).catch(() => {});
    toast("Thanks for the feedback");
  };
  const retry = () => {
    if (firstUserText) sendMessage(firstUserText);
  };

  return (
    <div className="fade-in flex items-center gap-0.5 opacity-0 transition-opacity group-hover/turn:opacity-100">
      <ActionIcon title={copied ? "Copied" : "Copy"} onClick={copy} icon={copied ? <IconCheck size={14} /> : <IconCopy size={14} />} />
      {!readOnly && (
        <>
          <ActionIcon title="Good response" onClick={() => feedback("thumbs_up")} icon={<IconThumbUp size={14} />} />
          <ActionIcon title="Bad response" onClick={() => feedback("thumbs_down")} icon={<IconThumbDown size={14} />} />
          <ActionIcon title="Retry" onClick={retry} disabled={!firstUserText || running} icon={<IconRetry size={14} />} />
        </>
      )}
    </div>
  );
}

function ActionIcon({ icon, title, onClick, disabled }) {
  return (
    <button
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={cx(
        "flex h-6 w-6 items-center justify-center rounded-md text-(--fg-tertiary)",
        disabled ? "opacity-40" : "hover:bg-(--surface-hover) hover:text-(--fg)"
      )}
    >
      {icon}
    </button>
  );
}

// ---------------------------------------------------------------------------
// reasoning — collapsible "Thought".
// ---------------------------------------------------------------------------
function Reasoning({ item, streaming }) {
  const [open, setOpen] = useState(false);
  const text = (item.summary && item.summary.length ? item.summary : item.content || []).join("\n\n");
  if (!text && !streaming) return null;
  return (
    <div>
      <button
        className="flex items-center gap-1 text-xs text-(--fg-tertiary) hover:text-(--fg-secondary)"
        onClick={() => setOpen(!open)}
      >
        {streaming ? (
          <span className="shimmer-text text-[14px]">Thinking</span>
        ) : (
          <>
            <IconChevronRight size={12} className={cx("transition-transform", open && "rotate-90")} />
            <span>Thought</span>
          </>
        )}
      </button>
      {open && !streaming && text && (
        <div className="mt-1.5 border-l-2 border-(--border) pl-3 text-xs leading-5 whitespace-pre-wrap text-(--fg-secondary)">
          {text}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// plan (text item) — plan card.
// ---------------------------------------------------------------------------
function PlanText({ item }) {
  if (!item.text) return null;
  return (
    <div className="rounded-[12.5px] border border-(--border-light) bg-(--surface-under) px-3.5 py-2.5">
      <div className="mb-1 text-xs text-(--fg-tertiary)">Plan</div>
      <Markdown>{item.text}</Markdown>
    </div>
  );
}

// ---------------------------------------------------------------------------
// commandExecution — compact activity row with expandable output.
// ---------------------------------------------------------------------------
function CommandCard({ item, streaming }) {
  const [open, setOpen] = useState(false);
  const running = item.status === "inProgress";
  const failed = item.status === "failed" || item.status === "declined" || (item.exitCode != null && item.exitCode !== 0);
  const output = item.aggregatedOutput || "";
  const activity = commandActivity(item);
  return (
    <div className={cx("flex flex-col", open && "gap-1")}>
      <button
        type="button"
        aria-expanded={open}
        data-activity-icon={activity.kind}
        className="group/activity-header inline-flex min-w-0 max-w-full cursor-pointer self-start items-center gap-1 text-left text-[14px] leading-[21px] font-[445] text-(--conversation-body) hover:text-(--fg)"
        onClick={() => setOpen(!open)}
      >
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
          {activity.kind === "read-files"
            ? <IconBookOpen size={16} className="activity-read-files shrink-0" />
            : activity.kind === "code-searching"
            ? <IconCodeSearching size={16} className="activity-code-searching shrink-0" />
            : activity.kind === "list-files"
              ? <IconListFiles size={16} className="activity-list-files shrink-0" />
              : <IconRunCommand size={16} className="activity-run-command shrink-0" />}
          <span className="min-w-0 truncate">{activity.label}</span>
          {running ? <Spinner size={12} className="shrink-0 text-(--fg-tertiary)" />
            : failed && <span className="shrink-0 text-[11px] text-(--danger)">
              {item.status === "declined" ? "declined" : `exit ${item.exitCode ?? "!"}`}
            </span>}
          {item.durationMs != null && (
            <span className="shrink-0 text-[11px] text-(--fg-faint)">{formatDuration(item.durationMs)}</span>
          )}
        </span>
        <IconGoalChevron
          size={14}
          className={cx(
            "activity-chevron shrink-0 opacity-0 transition-transform duration-[300ms] group-hover/activity-header:opacity-100 group-focus-visible/activity-header:opacity-100",
            open && "rotate-90 opacity-100",
          )}
        />
      </button>
      <ActivityDisclosure open={open}>
        <div className="ml-4 border-l border-(--border-light) py-1 pl-3">
          {output ? (
            <pre className="max-h-72 overflow-auto font-mono text-xs leading-5 whitespace-pre-wrap break-all text-(--fg-secondary)">
              {output}
            </pre>
          ) : (
            <div className="text-xs text-(--fg-faint)">{running ? "Running…" : "No output"}</div>
          )}
        </div>
      </ActivityDisclosure>
    </div>
  );
}

// ---------------------------------------------------------------------------
// fileChange — "Edited N files" header + per-file rows + Undo/Review actions.
// Matches the reference: icon tile, counts under title, open file list.
// ---------------------------------------------------------------------------
const FILE_ROWS_COLLAPSED = 3;

function EditedFilesIcon({ size = 24, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="currentColor" className={className} aria-hidden="true">
      <path d="M12.084 12.668a.666.666 0 0 1 0 1.33H7.917a.665.665 0 1 1 0-1.33h4.167ZM10 5.585c.367 0 .665.298.665.665v1.418h1.419a.666.666 0 0 1 0 1.33h-1.419v1.419a.666.666 0 0 1-1.33 0V8.998H7.917a.665.665 0 0 1 0-1.33h1.418V6.25c0-.367.298-.665.665-.665Z" />
      <path fillRule="evenodd" d="M12.667 2.668c.689 0 1.246 0 1.696.036.458.038.865.117 1.242.309a3.163 3.163 0 0 1 1.382 1.383c.192.377.272.783.309 1.24.037.45.036 1.008.036 1.697v5.333c0 .689 0 1.246-.036 1.696-.037.458-.117.865-.309 1.242a3.166 3.166 0 0 1-1.382 1.382c-.377.192-.784.271-1.242.309-.45.037-1.007.036-1.696.036H7.334c-.689 0-1.246 0-1.696-.036-.458-.038-.864-.117-1.24-.309a3.166 3.166 0 0 1-1.384-1.383c-.192-.376-.271-.783-.309-1.24-.037-.45-.036-1.008-.036-1.697V7.333c0-.689 0-1.246.036-1.696.038-.458.117-.864.309-1.24a3.17 3.17 0 0 1 1.383-1.384c.377-.192.783-.272 1.24-.309.45-.037 1.008-.036 1.697-.036h5.333Zm-5.333 1.33c-.71 0-1.204.001-1.588.032-.375.03-.587.088-.745.168A1.836 1.836 0 0 0 4.199 5c-.08.158-.137.37-.168.745C4 6.13 4 6.622 4 7.333v5.333c0 .71.001 1.204.032 1.588.03.375.088.587.168.745.176.345.457.627.802.803.158.08.37.137.745.168.384.031.877.031 1.588.031h5.333c.71 0 1.204 0 1.588-.031.375-.031.587-.088.745-.168a1.84 1.84 0 0 0 .803-.803c.08-.158.137-.37.168-.745.031-.383.031-.877.031-1.588V7.333c0-.71 0-1.204-.031-1.588-.031-.375-.088-.587-.168-.745A1.838 1.838 0 0 0 15 4.198c-.158-.08-.37-.137-.745-.168-.384-.031-.877-.032-1.588-.032H7.334Z" clipRule="evenodd" />
    </svg>
  );
}

function FileChangeCard({ item }) {
  const changes = item.changes || [];
  // Document (markdown/text) edits render as individual "Document · MD"
  // cards with an Open-in split button, like the reference client; the rest
  // group into the "Edited N files" card.
  const docChanges = changes.filter((c) => /\.(md|markdown|mdx|txt|rst)$/i.test(c.path || ""));
  const codeChanges = changes.filter((c) => !/\.(md|markdown|mdx|txt|rst)$/i.test(c.path || ""));
  return (
    <div className="flex flex-col gap-(--conversation-item-gap)">
      {docChanges.map((c, i) => (
        <DocumentCard key={`doc:${c.path}:${i}`} change={c} />
      ))}
      {codeChanges.length > 0 && <EditedGroupCard item={item} changes={codeChanges} />}
    </div>
  );
}

// A single edited document: icon box + name + "Document · MD" + Open in split.
function DocumentCard({ change }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const btnRef = React.useRef(null);
  const name = basename(change.path);
  const ext = (name.split(".").pop() || "").toUpperCase();
  const openIn = () => openFileInPanel(change.path);
  return (
    <div className="flex items-center gap-3 rounded-[12.5px] border border-(--border-light) bg-(--surface-under) py-2.5 pr-2 pl-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-(--surface-active) text-(--fg-secondary)">
        <IconFile size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-(--fg)" title={change.path}>{name}</span>
        <span className="block text-xs text-(--fg-tertiary)">Document · {ext}</span>
      </span>
      <div className="flex h-7 shrink-0 items-stretch overflow-hidden rounded-full border border-(--border)">
        <button className="flex items-center gap-1 px-2.5 text-xs text-(--fg-secondary) hover:bg-(--surface-hover) hover:text-(--fg)" onClick={openIn}>
          Open in
        </button>
        <div className="w-px bg-(--border-light)" />
        <button ref={btnRef} className="px-1.5 text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)" onClick={() => setMenuOpen(true)} title="Open options">
          <IconChevronDown size={11} />
        </button>
      </div>
      <Menu
        open={menuOpen}
        anchor={() => btnRef.current?.getBoundingClientRect()}
        onClose={() => setMenuOpen(false)}
        align="end"
        items={[
          { id: "panel", label: "Open in panel", onSelect: openIn },
          { id: "external", label: "Open in default app", onSelect: () => api.openPath(change.path) },
          { id: "reveal", label: "Reveal in Finder", onSelect: () => api.showItemInFolder(change.path) },
        ]}
      />
    </div>
  );
}

function EditedGroupCard({ item, changes }) {
  const [showAll, setShowAll] = useState(false);
  const [undoOpen, setUndoOpen] = useState(false);
  const [confirmRevert, setConfirmRevert] = useState(false);
  const undoBtnRef = React.useRef(null);
  const setUi = useStore((s) => s.setUi);
  const toast = useStore((s) => s.toast);
  const cwd = useStore((s) => s.activeConversation()?.thread?.cwd || "");
  const totals = changes.reduce(
    (acc, c) => {
      const { add, del } = countDiff(c.diff);
      acc.add += add; acc.del += del;
      return acc;
    },
    { add: 0, del: 0 }
  );
  const running = item.status === "inProgress";
  const title = running
    ? `Editing ${changes.length === 1 ? basename(changes[0]?.path) : `${changes.length} files`}`
    : `Edited ${changes.length === 1 ? basename(changes[0]?.path) : `${changes.length} files`}`;
  const visible = showAll ? changes : changes.slice(0, FILE_ROWS_COLLAPSED);

  const doRevert = async () => {
    setConfirmRevert(false);
    const conv = useStore.getState().activeConversation?.();
    const cwd = conv?.thread?.cwd;
    if (!cwd) { toast("No working folder for this chat", "error"); return; }
    let ok = 0, failed = 0;
    for (const c of changes) {
      try {
        if (c.kind?.type === "add") {
          await api.rpc("fs/remove", { path: c.path.startsWith("/") ? c.path : `${cwd}/${c.path}` });
        } else {
          await api.rpc("command/exec", { command: ["git", "restore", "--worktree", "--", c.path], cwd, timeoutMs: 15000 });
        }
        ok++;
      } catch { failed++; }
    }
    if (failed) toast(`Reverted ${ok}, failed ${failed}`, "warn");
    else toast(`Reverted ${ok} file${ok === 1 ? "" : "s"}`);
    setUi({ rightOpen: true, rightTab: "review" });
  };

  if (changes.length === 1) {
    const change = changes[0];
    return (
      <div className="group/edit flex min-w-0 items-center gap-1.5 text-[14px] leading-[21px] [color:color-mix(in_srgb,var(--fg)_60%,transparent)]">
        <IconEditFiles size={16} className="shrink-0" />
        <span className="min-w-0 truncate">
          {running ? "Editing" : "Edited"}{" "}
          <button
            className="underline decoration-dotted decoration-[0.5px] underline-offset-2 hover:text-(--fg)"
            onClick={() => setUi({ rightOpen: true, rightTab: "review" })}
          >
            {basename(change.path)}
          </button>
        </span>
        {(totals.add > 0 || totals.del > 0) && (
          <span className="flex shrink-0 gap-1 text-[13px] leading-[19.5px]">
            {totals.add > 0 && <span className="group-hover/edit:text-(--diff-add-fg)">+{totals.add}</span>}
            {totals.del > 0 && <span className="group-hover/edit:text-(--diff-del-fg)">-{totals.del}</span>}
          </span>
        )}
        {running && <Spinner size={12} className="shrink-0 text-(--fg-tertiary)" />}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[12.5px] bg-[rgb(255_255_255/0.5)] dark:bg-[rgb(38_38_38/0.5)]">
      {/* header */}
      <div className="flex min-h-[64.5px] items-center gap-2.5 px-3 py-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[12.5px] bg-[color-mix(in_srgb,var(--surface-under)_92%,transparent)] text-(--fg-secondary)">
          <EditedFilesIcon size={24} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[14px] leading-[21px] font-medium">{title}</div>
          {(totals.add > 0 || totals.del > 0) && (
            <div className="flex gap-1 font-mono text-[13px] leading-[19.5px]">
              <span className="text-(--diff-add-fg)">+{totals.add}</span>{" "}
              <span className="text-(--diff-del-fg)">-{totals.del}</span>
            </div>
          )}
        </div>
        {!running && changes.length > 0 && (
          <div className="flex shrink-0 items-center gap-2">
            <button
              ref={undoBtnRef}
              className="flex h-7 items-center gap-1 rounded-[12.5px] px-2 text-[14px] leading-[18px] text-(--fg-secondary) hover:bg-(--surface-hover)"
              onClick={() => setUndoOpen(true)}
            >
              Undo <IconUndo size={14} />
            </button>
            <button
              className="flex h-7 items-center rounded-[12.5px] border border-(--border) bg-[rgb(255_255_255/0.96)] px-2 text-[14px] leading-[18px] hover:bg-(--surface-hover)"
              onClick={() => setUi({ rightOpen: true, rightTab: "review" })}
            >
              Review
            </button>
          </div>
        )}
        {running && <Spinner size={12} className="mt-1 shrink-0 text-(--fg-tertiary)" />}
      </div>

      {/* file rows */}
      {changes.length > 0 && (
        <div>
          {visible.map((c, i) => {
            const { add, del } = countDiff(c.diff);
            const name = basename(c.path);
            const path = cwd && c.path?.startsWith(`${cwd}/`) ? c.path.slice(cwd.length + 1) : c.path || "";
            const dir = path.slice(0, -name.length);
            return (
              <button
                key={i}
                className="flex h-9 w-full items-center gap-0 px-3 py-1 text-left text-[14px] leading-[21px] hover:bg-(--surface-hover)"
                title={c.path}
                onClick={() => setUi({ rightOpen: true, rightTab: "review" })}
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="inline-flex h-[21px] items-center text-(--fg-secondary)">{dir}</span>
                  <span className="inline-flex h-[21px] items-center">{name}</span>
                </span>
                <span className="flex shrink-0 gap-1 font-mono">
                  {add > 0 && <span className="text-(--diff-add-fg)">+{add} </span>}
                  {del > 0 && <span className="text-(--diff-del-fg)">-{del}</span>}
                </span>
              </button>
            );
          })}
          {changes.length > FILE_ROWS_COLLAPSED && (
            <button
              className="flex h-9 w-full items-center gap-1 px-3 py-1 text-[14px] leading-[21px] hover:bg-(--surface-hover)"
              onClick={() => setShowAll(!showAll)}
            >
              {showAll ? "Show less" : `Show ${changes.length - FILE_ROWS_COLLAPSED} more file${changes.length - FILE_ROWS_COLLAPSED === 1 ? "" : "s"}`}
              <IconChevronDown size={11} className={cx("transition-transform", showAll && "rotate-180")} />
            </button>
          )}
        </div>
      )}

      <Menu
        open={undoOpen}
        anchor={() => undoBtnRef.current?.getBoundingClientRect()}
        onClose={() => setUndoOpen(false)}
        align="end"
        items={[
          { id: "revert", label: "Revert these files…", icon: <IconUndo size={13} />, danger: true, onSelect: () => setConfirmRevert(true) },
          { id: "copy", label: "Copy file paths", icon: <IconCopy size={13} />, onSelect: () => { navigator.clipboard.writeText(changes.map((c) => c.path).join("\n")); toast("Paths copied"); } },
        ]}
      />
      <Dialog open={confirmRevert} title="Revert file changes?" onClose={() => setConfirmRevert(false)}>
        <div className="text-[13px] text-(--fg-secondary)">
          This discards the changes made to {changes.length} file{changes.length === 1 ? "" : "s"} in this turn
          (new files are deleted, modified files are restored from git). This cannot be undone.
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="rounded-lg px-3 py-1.5 text-[13px] text-(--fg-secondary) hover:bg-(--surface-hover)" onClick={() => setConfirmRevert(false)}>Cancel</button>
          <button className="rounded-lg bg-(--danger) px-3 py-1.5 text-[13px] font-medium text-white hover:opacity-90" onClick={doRevert}>Revert</button>
        </div>
      </Dialog>
    </div>
  );
}

function KindBadge({ kind }) {
  const t = kind?.type || "update";
  const map = {
    add: ["A", "text-(--diff-add-fg)"],
    delete: ["D", "text-(--diff-del-fg)"],
    update: ["M", "text-(--warning)"],
  };
  const [label, cls] = map[t] || map.update;
  return <span className={cx("w-4 shrink-0 text-center font-mono text-[11px] font-semibold", cls)}>{label}</span>;
}

// "Used Kdev Pipeline integration" style labels for MCP tool calls.
function mcpToolLabel(item) {
  const server = item.server || "";
  if (!server) return item.tool || "tool";
  const title = server
    .split(/[-_]/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
  if (server.includes("pipeline") || server.includes("integration")) return `Used ${title} integration`;
  return `Used ${title}`;
}

// ---------------------------------------------------------------------------
// mcpToolCall / dynamicToolCall — compact tool row.
// ---------------------------------------------------------------------------
function ToolCallRow({ item }) {
  const [open, setOpen] = useState(false);
  const [logoFailed, setLogoFailed] = useState(false);
  const name = item.type === "mcpToolCall" ? mcpToolLabel(item) : item.tool;
  const running = item.status === "inProgress";
  const failed = item.status === "failed";
  const nodeRepl = /node.?repl/i.test(`${item.server || ""} ${item.tool || ""}`);
  const sourceLogo = item.source?.logoUrl
    || item.source?.logoUrlDark
    || item.logoUrl
    || item.toolIcons?.[0]
    || null;
  let detail = "";
  try { detail = JSON.stringify(item.arguments, null, 2); } catch {}
  return (
    <div className={cx("flex flex-col", open && "gap-1")}>
      <button
        type="button"
        aria-expanded={open}
        data-activity-icon={nodeRepl ? "run-command" : "tool"}
        className="group/activity-header inline-flex min-w-0 max-w-full cursor-pointer self-start items-center gap-1 text-left text-[14px] leading-[21px] font-[445] text-(--conversation-body) hover:text-(--fg)"
        onClick={() => setOpen(!open)}
      >
        <span className="inline-flex min-w-0 items-center gap-1.5 truncate">
          {nodeRepl
            ? <IconRunCommand size={16} className="activity-run-command shrink-0" />
            : sourceLogo && !logoFailed
              ? <img src={sourceLogo} alt="" className="size-4 shrink-0 rounded-[2px] object-contain" onError={() => setLogoFailed(true)} />
              : <IconMcpSource size={16} className="activity-mcp-source shrink-0" />}
          <span className="min-w-0 truncate">{name}</span>
          {running ? <Spinner size={12} className="shrink-0 text-(--fg-tertiary)" />
            : failed ? <span className="shrink-0 text-[11px] text-(--danger)">failed</span>
            : item.durationMs != null && <span className="shrink-0 text-[11px] text-(--fg-faint)">{formatDuration(item.durationMs)}</span>}
        </span>
        <IconGoalChevron
          size={14}
          className={cx(
            "activity-chevron shrink-0 text-(--fg-tertiary) opacity-0 transition-transform duration-[300ms] group-hover/activity-header:opacity-100 group-focus-visible/activity-header:opacity-100",
            open && "rotate-90 opacity-100",
          )}
        />
      </button>
      <ActivityDisclosure open={open}>
        <div className="ml-[34px] min-w-0 py-1">
          {detail && detail !== "{}" && (
            <pre className="max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap break-all text-(--fg-secondary)">{detail}</pre>
          )}
          {item.error && <div className="mt-1 text-xs text-(--danger)">{item.error.message || String(item.error)}</div>}
          {item.result && (
            <pre className="mt-1 max-h-48 overflow-auto font-mono text-xs whitespace-pre-wrap break-all text-(--fg-tertiary)">
              {safeStringify(item.result.structuredContent ?? item.result.content ?? item.result)}
            </pre>
          )}
        </div>
      </ActivityDisclosure>
    </div>
  );
}

// ---------------------------------------------------------------------------
// webSearch / images / collab / misc subtle rows.
// ---------------------------------------------------------------------------
function WebSearchRow({ item }) {
  return (
    <div className="flex items-center gap-2 text-[13px] text-(--fg-tertiary)">
      <IconWebSearch size={16} className="activity-web-search shrink-0" />
      <span className="truncate">Searched the web for <span className="text-(--fg-secondary)">{item.query}</span></span>
    </div>
  );
}

function ImageView({ item }) {
  return (
    <img src={localFileUrl(item.path)} className="max-h-72 rounded-xl border border-(--border-light)" alt="" />
  );
}

function ImageGeneration({ item }) {
  const running = item.status === "inProgress";
  return (
    <div>
      {item.savedPath ? (
        <button onClick={() => showItemInFolder(item.savedPath)} title="Reveal in Finder">
          <img src={localFileUrl(item.savedPath)} className="max-h-72 rounded-xl border border-(--border-light)" alt="" />
        </button>
      ) : running ? (
        <span className="shimmer-text text-[14px]">Generating image</span>
      ) : (
        <Subtle icon={<IconImage size={13} />} text="Image generated" />
      )}
      {item.revisedPrompt && <div className="mt-1 text-xs text-(--fg-tertiary)">{item.revisedPrompt}</div>}
    </div>
  );
}

function CollabRow({ item }) {
  const labels = {
    spawnAgent: item.status === "inProgress" ? "Creating an agent" : "Created an agent",
    sendInput: item.status === "inProgress" ? "Messaging an agent" : "Messaged an agent",
    wait: item.status === "inProgress" ? "Waiting for agents" : "Waited for agents",
    resumeAgent: item.status === "inProgress" ? "Resuming an agent" : "Resumed an agent",
    closeAgent: item.status === "inProgress" ? "Closing an agent" : "Closed an agent",
  };
  const label = labels[item.tool] || (item.status === "inProgress" ? "Working with agents" : "Worked with agents");
  const done = item.status !== "inProgress";
  return (
    <div className="flex items-center gap-1.5 text-[13px] text-(--fg-secondary)">
      <IconSparkle size={13} className={cx("shrink-0", done ? "text-(--fg-tertiary)" : "text-(--accent)")} />
      <span className="truncate">{label}</span>
      {item.status === "inProgress" && <Spinner size={11} className="shrink-0 text-(--fg-tertiary)" />}
      {item.status === "failed" && <span className="shrink-0 text-xs text-(--danger)">failed</span>}
    </div>
  );
}

// subAgentActivity (started / interacted / interrupted). Long-running monitor
// agents (path contains "monitor") render as "Name · status" chips like the
// reference client; spawn/message/close events get the plain labels.
function SubAgentActivityRow({ item }) {
  const base = item.agentPath ? item.agentPath.replace(/\/+$/, "").split("/").pop() : "";
  if (/^monitor/i.test(base)) {
    const status = { started: "started working", interacted: "updated", interrupted: "finished" }[item.kind] || "updated";
    const name = base.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()).replace(/(\d{4})\d+/, "$1…");
    return (
      <div className="flex items-center gap-1.5 text-[13px] text-(--fg-secondary)">
        <IconSparkle size={13} className="shrink-0 text-(--warning)" />
        <span className="min-w-0 truncate">
          <span className="text-(--fg)">{name}</span>{" "}
          <span className="text-(--fg-tertiary)">{status}</span>
        </span>
      </div>
    );
  }
  const labels = {
    started: "Created an agent",
    interacted: "Messaged an agent",
    interrupted: "Closed an agent",
  };
  return (
    <div className="flex items-center gap-1.5 text-[13px] text-(--fg-secondary)">
      <IconSparkle size={13} className="shrink-0 text-(--fg-tertiary)" />
      <span className="truncate">{labels[item.kind] || "Agent activity"}</span>
    </div>
  );
}

function Subtle({ icon, text }) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-(--fg-tertiary)">
      {icon}
      <span className="truncate">{text}</span>
    </div>
  );
}

function Divider({ label }) {
  return (
    <div className="inline-flex h-[21px] min-w-0 max-w-full self-start items-center gap-1.5 text-[14px] leading-[21px] text-(--conversation-body)">
      <IconContextCompaction size={16} className="activity-context-compaction shrink-0" />
      <span className="min-w-0 truncate">{label}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Plan steps widget (from turn/plan/updated → conv.plan).
// ---------------------------------------------------------------------------
export function PlanWidget({ plan }) {
  const [open, setOpen] = useState(false);
  const diff = useStore((s) => s.activeConversation()?.diff || "");
  const setUi = useStore((s) => s.setUi);
  if (!plan?.steps?.length) return null;
  const activeIndex = plan.steps.findIndex((s) => s.status === "inProgress");
  const nextIndex = plan.steps.findIndex((s) => s.status !== "completed");
  const currentIndex = activeIndex >= 0 ? activeIndex : nextIndex >= 0 ? nextIndex : plan.steps.length - 1;
  const current = plan.steps[currentIndex];
  const diffFiles = parseUnifiedDiff(diff);
  const added = diffFiles.reduce((sum, file) => sum + file.added, 0);
  const deleted = diffFiles.reduce((sum, file) => sum + file.deleted, 0);
  return (
    <div
      className="relative z-20 flex h-[38px] w-full justify-center self-center"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      {open && (
        <div className="absolute bottom-full left-1/2 z-30 -translate-x-1/2 pb-2">
          <ol
            role="tooltip"
            className="flex max-h-[min(360px,50vh)] w-max max-w-[min(24rem,calc(100vw-16px))] flex-col gap-2 overflow-y-auto rounded-xl border border-(--border-light) bg-(--dropdown-bg) px-4 py-4"
            style={{ boxShadow: "var(--shadow-menu)" }}
          >
            {plan.steps.map((s, i) => (
              <li key={i} className="flex max-w-80 items-start gap-2 text-[14px] leading-4">
                <span className={cx(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border text-[10px]",
                  s.status === "completed" && "border-(--success) bg-(--success) text-white",
                  s.status === "inProgress" && "border-(--accent) text-(--accent)",
                  s.status !== "completed" && s.status !== "inProgress" && "border-(--border-heavy) text-(--fg-faint)"
                )}>
                  {s.status === "completed" ? <IconCheck size={10} /> : i + 1}
                </span>
                <span className={cx(
                  s.status === "completed" && "text-(--fg-tertiary) line-through",
                  s.status !== "completed" && s.status !== "inProgress" && "text-(--fg-tertiary)"
                )}>
                  {s.step}
                </span>
              </li>
            ))}
          </ol>
        </div>
      )}
      <div
        className="h-9 w-max max-w-full overflow-hidden rounded-[25px] border border-(--border-light) bg-[rgb(255_255_255/0.7)] backdrop-blur-sm dark:bg-[rgb(38_38_38/0.672)]"
      >
        <div className="flex min-h-[36px] max-w-full items-center gap-2 px-3 py-1.5 text-left">
          {activeIndex >= 0
            ? <Spinner size={13} className="shrink-0 text-(--accent)" />
            : <IconCheck size={13} className="shrink-0 text-(--success)" />
          }
          <span className="shrink-0 text-[14px] leading-[21px]">Step {currentIndex + 1} / {plan.steps.length}</span>
          <span className="text-(--fg-tertiary)">·</span>
          {diffFiles.length > 0 ? (
            <button
              className="flex min-w-0 items-center gap-1 text-[14px] leading-[21px] text-(--fg-tertiary) hover:text-(--fg)"
              onClick={() => setUi({ rightOpen: true, rightTab: "review" })}
            >
              <span className="min-w-0 truncate">{diffFiles.length} file{diffFiles.length === 1 ? "" : "s"} changed</span>
              {added > 0 && <span className="shrink-0 text-(--diff-add-fg)">+{added}</span>}
              {deleted > 0 && <span className="shrink-0 text-(--diff-del-fg)">-{deleted}</span>}
            </button>
          ) : (
            <span className="min-w-0 truncate text-[14px] leading-[21px] text-(--fg-tertiary)">
              {current?.step || "Plan complete"}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Approval cards (server-initiated requests) shown above the composer.
// ---------------------------------------------------------------------------
const KIND_META = {
  command: { icon: IconTerminal, badge: "Terminal" },
  fileChange: { icon: IconFile, badge: "Edit files" },
  permissions: { icon: IconShield, badge: "Permissions" },
  userInput: { icon: IconChat, badge: "Question" },
  elicitation: { icon: IconChat, badge: "Request" },
};

export function ApprovalCard({ approval: a }) {
  const answerApproval = useStore((s) => s.answerApproval);
  const meta = KIND_META[a.kind] || KIND_META.elicitation;
  const KindIcon = meta.icon;
  return (
    <div className="fade-in overflow-hidden rounded-[12.5px] border border-(--border) bg-(--surface-raised)" style={{ boxShadow: "var(--shadow-menu)" }}>
      <div className="flex items-center gap-2.5 px-3.5 pt-3">
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-(--accent-soft) text-(--accent)">
          <KindIcon size={13} />
        </span>
        <div className="min-w-0 flex-1 truncate text-[13px] font-medium">{a.title}</div>
        <span className="shrink-0 rounded-md bg-(--surface-hover) px-1.5 py-0.5 text-[11px] text-(--fg-tertiary)">
          {meta.badge}
        </span>
      </div>

      <div className="px-3.5 pt-2 pb-1">
        {a.kind === "command" && (
          <>
            {a.reason && <div className="mb-1.5 text-xs text-(--fg-tertiary)">{a.reason}</div>}
            <pre className="max-h-36 overflow-auto rounded-lg bg-(--code-bg) p-2.5 font-mono text-xs whitespace-pre-wrap break-all">{a.command}</pre>
            {a.cwd && <div className="mt-1 truncate font-mono text-[11px] text-(--fg-faint)">{a.cwd}</div>}
          </>
        )}
        {a.kind === "fileChange" && (
          <>
            {a.reason && <div className="mb-1.5 text-xs text-(--fg-tertiary)">{a.reason}</div>}
            {a.files && (
              <div className="max-h-32 overflow-auto">
                {a.files.map((f, i) => (
                  <div key={i} className="truncate font-mono text-xs text-(--fg-secondary)">{f}</div>
                ))}
              </div>
            )}
          </>
        )}
        {a.kind === "permissions" && (
          <>
            <div className="text-xs text-(--fg-tertiary)">{a.reason || "The agent requests additional permissions."}</div>
            <pre className="mt-1.5 max-h-32 overflow-auto rounded-lg bg-(--code-bg) p-2.5 font-mono text-[11px] whitespace-pre-wrap break-all">
              {safeStringify(a.permissions ?? a.raw?.permissions)}
            </pre>
          </>
        )}
        {a.kind === "userInput" && <UserInputForm approval={a} />}
        {a.kind === "elicitation" && (
          <div className="text-[13px] text-(--fg-secondary)">{a.raw?.message || a.title}</div>
        )}
      </div>

      {a.kind === "userInput" ? null : a.kind === "elicitation" ? (
        <div className="flex items-center gap-2 px-3.5 pb-3 pt-1.5">
          <PrimaryBtn onClick={() => answerApproval(a.reqId, "accept")}>Accept</PrimaryBtn>
          <DangerBtn onClick={() => answerApproval(a.reqId, "decline")}>Decline</DangerBtn>
        </div>
      ) : (
        <div className="flex items-center gap-2 px-3.5 pb-3 pt-1.5">
          <PrimaryBtn onClick={() => answerApproval(a.reqId, "accept")}>Allow once</PrimaryBtn>
          {(a.kind === "command" || a.kind === "fileChange" || a.kind === "permissions") && (
            <ApprovalOptionsBtn approval={a} />
          )}
          <DangerBtn onClick={() => answerApproval(a.reqId, "decline")}>Deny</DangerBtn>
        </div>
      )}
    </div>
  );
}

// "Approval options" split button: Always allow + scoped variants, like the
// reference client's approval menu.
function ApprovalOptionsBtn({ approval: a }) {
  const answerApproval = useStore((s) => s.answerApproval);
  const [open, setOpen] = useState(false);
  const ref = React.useRef(null);
  const hasAmendment = Array.isArray(a.raw?.proposedExecpolicyAmendment) && a.raw.proposedExecpolicyAmendment.length > 0;
  const cmd = (a.command || "").split(/\s+/).slice(0, 3).join(" ");
  return (
    <>
      <div className="flex overflow-hidden rounded-lg border border-(--border)">
        <button
          className="px-3 py-1.5 text-[13px] font-medium hover:bg-(--surface-hover)"
          onClick={() => answerApproval(a.reqId, "acceptForSession")}
        >
          Always allow
        </button>
        <button
          ref={ref}
          className="flex w-6 items-center justify-center border-l border-(--border) hover:bg-(--surface-hover)"
          title="Approval options"
          onClick={() => setOpen(true)}
        >
          <IconChevronDown size={11} />
        </button>
      </div>
      <Menu
        open={open}
        anchor={() => ref.current?.getBoundingClientRect()}
        onClose={() => setOpen(false)}
        width={260}
        align="end"
        items={[
          { header: "Approval options" },
          { id: "session", label: "Always allow", hint: "for this session", onSelect: () => answerApproval(a.reqId, "acceptForSession") },
          ...(a.kind === "command"
            ? [{
                id: "amendment",
                label: hasAmendment ? "Allow similar commands" : `Allow commands that start with "${cmd}"`,
                disabled: !hasAmendment,
                hint: hasAmendment ? "via policy rule" : "no rule available",
                onSelect: () => answerApproval(a.reqId, "acceptWithAmendment"),
              }]
            : []),
        ]}
      />
    </>
  );
}

function PrimaryBtn({ children, onClick }) {
  return (
    <button
      className="rounded-lg bg-(--fg) px-3 py-1.5 text-[13px] font-medium text-(--surface) hover:opacity-85"
      onClick={onClick}
    >
      {children}
    </button>
  );
}
function DangerBtn({ children, onClick }) {
  return (
    <button
      className="rounded-lg px-3 py-1.5 text-[13px] text-(--danger) hover:bg-(--danger-soft)"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function UserInputForm({ approval }) {
  const answerApproval = useStore((s) => s.answerApproval);
  const [values, setValues] = useState({});
  const questions = approval.questions || [];
  const setVal = (qid, v) => setValues((s) => ({ ...s, [qid]: v }));
  const submit = () => {
    const answers = {};
    for (const q of questions) {
      const v = values[q.id];
      answers[q.id] = { answers: Array.isArray(v) ? v : v != null && v !== "" ? [String(v)] : [] };
    }
    answerApproval(approval.reqId, null, { answers });
  };
  return (
    <div className="flex flex-col gap-3">
      {questions.map((q) => (
        <div key={q.id}>
          <div className="mb-1 text-[13px] font-medium">{q.question}</div>
          {q.options?.length ? (
            <div className="flex flex-wrap gap-1.5">
              {q.options.map((opt) => {
                const sel = values[q.id] === opt.label;
                return (
                  <button
                    key={opt.label}
                    title={opt.description}
                    className={cx(
                      "rounded-lg border px-2.5 py-1 text-xs",
                      sel ? "border-(--accent) bg-(--accent-soft) text-(--accent)" : "border-(--border) hover:bg-(--surface-hover)"
                    )}
                    onClick={() => setVal(q.id, opt.label)}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          ) : (
            <input
              type={q.isSecret ? "password" : "text"}
              className="w-full rounded-lg border border-(--border) bg-(--surface) px-2.5 py-1.5 text-[13px] outline-none focus:border-(--accent)"
              value={values[q.id] || ""}
              onChange={(e) => setVal(q.id, e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
            />
          )}
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <PrimaryBtn onClick={submit}>Submit</PrimaryBtn>
      </div>
    </div>
  );
}

function safeStringify(v) {
  try { return typeof v === "string" ? v : JSON.stringify(v, null, 2); } catch { return String(v); }
}
