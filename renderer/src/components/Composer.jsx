// Composer: auto-growing editor, image attachments, model+effort / permission
// selectors, context chips (home), queued pills, send/stop.
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useStore, PERMISSIONS, normalizePermission } from "../store.js";
import * as api from "../api.js";
import { cx } from "../lib/cx.js";
import { basename } from "../lib/time.js";
import { Menu } from "./ui.jsx";
import { usePanelStore } from "./RightPanel.jsx";
import { PluginIcon, skillName, skillDesc } from "./NavViews.jsx";
import {
  IconArrowUp, IconStop, IconFolder, IconBranch, IconChevronDown,
  IconX, IconImage, IconFile, IconList, IconCheck, IconChevronRight, IconChevronLeft,
  IconShield, IconSparkle, IconMonitor, IconPaperclip, LucideIcon,
  IconSkillCube, IconSkillBox, IconChat,
  IconCmdCodeReview, IconCmdFork, IconCmdFast, IconCmdFeedback, IconCmdGoal,
  IconCmdInit, IconCmdMcp, IconCmdMemories, IconCmdModel, IconCmdPlan,
  IconCmdReasoning, IconCmdSide, IconCmdStatus,
  IconComposerPlus, IconComposerMic, IconComposerChevronDown, IconComposerChevronRight, IconGoalChevron, IconSkillCheck, IconModelPower, IconCircleXFill,
} from "./icons.jsx";
import { panelHook } from "../lib/panelHook.js";

const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"];

// Uniform icon cell for the "/" menu. The extracted reference glyphs have
// inconsistent viewBoxes — some clip their paths, some underfill — so each
// glyph's bounding box is fitted to the same visual weight Lucide icons have
// (glyph spans ~20/24 of the icon size) instead of trusting the viewBox.
function FitIcon({ children, className }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const svg = ref.current?.querySelector("svg");
    if (!svg) return;
    try {
      const bb = svg.getBBox();
      if (!(bb.width > 0 && bb.height > 0)) return;
      const size = Number(svg.getAttribute("width")) || 16;
      const target = (size * 20) / 24;
      const m = Math.max(bb.width, bb.height);
      const v = (size * m) / target;
      const cx = bb.x + bb.width / 2;
      const cy = bb.y + bb.height / 2;
      svg.setAttribute("viewBox", `${cx - v / 2} ${cy - v / 2} ${v} ${v}`);
    } catch {}
  }, []);
  return (
    <span ref={ref} className={cx("flex size-5 shrink-0 items-center justify-center text-(--fg)", className)}>
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
export default function Composer({ centered = false, quick = false }) {
  const activeThreadId = useStore((s) => s.activeThreadId);
  const conv = useStore((s) => (s.activeThreadId ? s.conversations[s.activeThreadId] : null));
  const queueAll = useStore((s) => s.queue);
  const permission = useStore((s) => s.permission);
  const sendMessage = useStore((s) => s.sendMessage);
  const interrupt = useStore((s) => s.interrupt);
  const clearQueue = useStore((s) => s.clearQueue);

  const queue = queueAll.filter((q) => q.threadId === activeThreadId);
  const running = !!conv?.activeTurnId;

  const [text, setText] = useState("");
  const composerPrefill = useStore((s) => s.composerPrefill);

  // Consume a prefill request (e.g. skill detail "Try now" / Plugins "Create").
  useEffect(() => {
    if (!composerPrefill) return;
    setText(composerPrefill.text);
    if (composerPrefill.skills?.length) {
      setMentions((cur) => {
        const next = [...cur];
        for (const s of composerPrefill.skills) {
          if (!next.some((m) => m.kind === "skill" && m.name === s.name)) next.push(s);
        }
        return next;
      });
    }
    useStore.setState({ composerPrefill: null });
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (ta) {
        ta.focus();
        ta.setSelectionRange(ta.value.length, ta.value.length);
      }
    });
  }, [composerPrefill]);

  // Labels used by the /model and /reasoning slash commands.
  const models = useStore((s) => s.models);
  const curModel = useStore((s) => s.model);
  const curEffort = useStore((s) => s.effort);
  const curModelInfo = models.find((m) => m.model === curModel);
  const modelChipName = (curModelInfo?.displayName || curModel || "Model").replace(/-/g, " ");
  const effChipLabel = effortLabel(curEffort || curModelInfo?.defaultReasoningEffort || null);
  // /init sends a canned prompt without requiring typed text.
  const doSendRef = useRef(null);
  const browserTab = usePanelStore((s) => s.tabs.find((t) => t.kind === "browser" && t.url));
  const [images, setImages] = useState([]);
  const [files, setFiles] = useState([]);
  const [mentions, setMentions] = useState([]);
  const [dragOver, setDragOver] = useState(false);
  const [menu, setMenu] = useState(null); // {kind:'slash'|'mention', query, start}
  const [menuIdx, setMenuIdx] = useState(0);
  const [mentionResults, setMentionResults] = useState([]);
  const [skillResults, setSkillResults] = useState([]);
  const taRef = useRef(null);
  const imageFileRef = useRef(null);
  const anyFileRef = useRef(null);

  const canSend = text.trim().length > 0 || images.length > 0 || files.length > 0 || mentions.length > 0;

  // Detect a trailing /command, @mention, or $skill token and open the
  // matching menu.
  const detectMenu = (value, caret) => {
    const upto = value.slice(0, caret);
    if (/^\/[a-z]*$/i.test(upto)) {
      setMenu({ kind: "slash", query: upto.slice(1) });
      setMenuIdx(0);
      return;
    }
    const dollar = upto.match(/\$([^\s$]*)$/);
    if (dollar) {
      setMenu({ kind: "skill", query: dollar[1], start: caret - dollar[1].length - 1 });
      setMenuIdx(0);
      return;
    }
    const m = upto.match(/@([^\s@]*)$/);
    if (m && upto.length >= 1) {
      setMenu({ kind: "mention", query: m[1], start: caret - m[1].length - 1 });
      setMenuIdx(0);
      return;
    }
    setMenu(null);
  };

  // Match the original editor's 44px minimum while allowing multiline growth.
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    const h = Math.max(44, Math.min(ta.scrollHeight, 200));
    ta.style.height = h + "px";
    ta.style.overflowY = ta.scrollHeight > 200 ? "auto" : "hidden";
  }, [text]);

  useEffect(() => {
    taRef.current?.focus();
  }, [activeThreadId]);

  // External attach requests (e.g. browser annotations): insert images + text.
  useEffect(() => {
    const onAttach = (e) => {
      const { images: imgs = [], text: note = "" } = e.detail || {};
      if (imgs.length) setImages((s) => [...s, ...imgs]);
      if (note) setText((t) => (t ? t + "\n" + note : note));
      taRef.current?.focus();
    };
    window.addEventListener("codex:attach", onAttach);
    return () => window.removeEventListener("codex:attach", onAttach);
  }, []);

  // Fuzzy file search for @mentions (debounced).
  useEffect(() => {
    if (menu?.kind !== "mention" || !menu.query) { setMentionResults([]); return; }
    const cwd = conv?.thread?.cwd || useStore.getState().cwd;
    if (!cwd) return;
    const t = setTimeout(() => {
      api.rpc("fuzzyFileSearch", { query: menu.query, roots: [cwd] })
        .then((r) => {
          const files = r?.files ?? r?.data ?? (Array.isArray(r) ? r : []);
          setMentionResults(files.slice(0, 8).map((f) => (typeof f === "string" ? { path: f } : f)));
        })
        .catch(() => setMentionResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [menu?.kind === "mention" ? menu.query : null]);

  // Skill search for $mentions and the / menu: skills/list for the current
  // cwd gives Personal + System + repo skills, exactly the reference menu's
  // set.
  const skillsCacheRef = useRef({});
  useEffect(() => {
    if (menu?.kind !== "skill" && menu?.kind !== "slash") { setSkillResults([]); return; }
    const cwd = conv?.thread?.cwd || useStore.getState().cwd;
    if (!cwd) return;
    let live = true;
    (async () => {
      let list = skillsCacheRef.current[cwd];
      if (!list) {
        const r = await api.rpc("skills/list", { cwds: [cwd] }).catch(() => null);
        const groups = r?.data || r?.skills || [];
        const byName = new Map();
        for (const g of groups) {
          for (const s of g?.skills || []) {
            if (!s.name || s.name.includes(":")) continue;
            const prev = byName.get(s.name);
            const score = (x) => (x.interface ? 2 : 0) + (x.shortDescription ? 1 : 0);
            if (!prev || score(s) >= score(prev)) byName.set(s.name, s);
          }
        }
        list = [...byName.values()];
        skillsCacheRef.current[cwd] = list;
      }
      if (!live) return;
      const q = (menu.query || "").toLowerCase();
      const rows = list
        .filter((s) => !q || s.name.toLowerCase().includes(q) || skillName(s).toLowerCase().includes(q) || skillDesc(s).toLowerCase().includes(q))
        .sort((a, b) => skillName(a).localeCompare(skillName(b), "zh"))
        .slice(0, 20)
        .map((s) => ({
          ...s,
          scopeLabel: s.scope === "user" ? "Personal" : s.scope === "system" ? "System" : basename(cwd),
        }));
      setSkillResults(rows);
    })();
    return () => { live = false; };
  }, [menu?.kind === "skill" || menu?.kind === "slash" ? menu.query : null, menu?.kind, activeThreadId]);

  // Custom prompts from ~/.codex/prompts/*.md — the / menu's "prompts:*"
  // section. Name + frontmatter description, cached.
  const [promptResults, setPromptResults] = useState([]);
  const promptsCacheRef = useRef(null);
  useEffect(() => {
    if (menu?.kind !== "slash") { setPromptResults([]); return; }
    const home = useStore.getState().appInfo?.home || "";
    let live = true;
    (async () => {
      if (!promptsCacheRef.current) {
        promptsCacheRef.current = [];
        const r = await api.rpc("command/exec", {
          command: ["sh", "-c", 'cd "$1/.codex/prompts" 2>/dev/null && for f in *.md; do d=$(grep -m1 -E "^description:" "$f" | sed "s/^description: *//"); printf "%s\\t%s\\n" "${f%.md}" "$d"; done', "sh", home],
          timeoutMs: 6000,
        }).catch(() => null);
        const out = String(r?.stdout || "");
        promptsCacheRef.current = out.split("\n").filter(Boolean).map((line) => {
          const [name, ...rest] = line.split("\t");
          return { name, desc: rest.join("\t").trim().replace(/^"|"$/g, "") };
        });
      }
      if (!live) return;
      const q = (menu.query || "").toLowerCase();
      setPromptResults(
        promptsCacheRef.current
          .filter((p) => !q || p.name.toLowerCase().includes(q) || p.desc.toLowerCase().includes(q))
          .slice(0, 12)
      );
    })();
    return () => { live = false; };
  }, [menu?.kind === "slash" ? menu.query : null, menu?.kind]);

  // "/" commands — same set, order (alphabetical), labels, icons, and
  // context filtering as the reference composer menu.
  const isThread = !!activeThreadId;
  const slashCommands = [
    !isThread && {
      id: "chat", label: "Chat", desc: "Don't work in a project", icon: <LucideIcon name="MessageSquareDashed" size={16} />,
      run: () => {
        const s = useStore.getState();
        s.setCwd(s.appInfo?.home || "");
        s.toast("New chats won't work in a project");
      } },
    { id: "review", label: "Code review", desc: "Review uncommitted changes or compare against a branch", icon: <IconCmdCodeReview size={16} />,
      run: () => useStore.getState().setUi({ rightOpen: true, rightTab: "review" }) },
    isThread && {
      id: "compact", label: "Compact", desc: "Compact this chat's context", icon: <LucideIcon name="ListCollapse" size={16} />,
      run: async () => { await api.rpc("thread/compact", { threadId: activeThreadId }); useStore.getState().toast("Compacting context…"); } },
    isThread && {
      id: "continue", label: "Continue in new chat", desc: "Fork this chat into a new one", icon: <IconCmdFork size={16} />,
      run: async () => {
        const r = await api.rpc("thread/fork", { threadId: activeThreadId });
        if (r?.thread?.id) useStore.getState().openThread(r.thread.id);
      } },
    { id: "fast", label: "Fast", desc: useStore.getState().serviceTier ? "Turn off Fast and return to standard speed" : "Turn on Fast for quicker responses", icon: <IconCmdFast size={16} />,
      run: () => {
        const s = useStore.getState();
        s.setServiceTier(s.serviceTier ? null : "priority");
        s.toast(s.serviceTier ? "Fast mode on" : "Fast mode off");
      } },
    { id: "feedback", label: "Feedback", desc: "Send feedback about this chat", icon: <IconCmdFeedback size={16} />,
      run: () => useStore.getState().toast("Feedback submission isn't wired in this build", "warn") },
    { id: "goal", label: "Goal", desc: "Set a goal to keep pursuing", icon: <IconCmdGoal size={16} />,
      run: () => useStore.getState().setUi({ goalDialogOpen: true }) },
    { id: "init", label: "Init", desc: "Create an AGENTS.md file with instructions for Codex", icon: <IconCmdInit size={16} />,
      run: () => doSendRef.current?.("Create an AGENTS.md file with instructions for Codex") },
    { id: "mcp", label: "MCP", desc: "Show MCP server status", icon: <IconCmdMcp size={16} />,
      run: () => useStore.getState().setUi({ settingsOpen: true, settingsSection: "connections" }) },
    { id: "memories", label: "Memories", desc: "Use on, generate on", icon: <IconCmdMemories size={16} />,
      run: () => useStore.getState().setUi({ settingsOpen: true, settingsSection: "personalization" }) },
    { id: "model", label: "Model", desc: modelChipName || "Choose model", icon: <IconCmdModel size={16} />,
      run: () => window.dispatchEvent(new CustomEvent("composer:open-model-menu")) },
    !isThread && {
      id: "worktree", label: "New worktree", desc: "Run this chat in a new worktree", icon: <LucideIcon name="GitBranchPlus" size={16} />,
      run: () => useStore.getState().toast("Worktree chats aren't wired in this build", "warn") },
    { id: "plan", label: "Plan mode", desc: useStore.getState().planMode ? "Turn plan mode off" : "Turn plan mode on", icon: <IconCmdPlan size={16} />,
      run: () => {
        const s = useStore.getState();
        s.setPlanMode(!s.planMode);
        s.toast(s.planMode ? "Plan mode off" : "Plan mode on — Codex will propose a plan first");
      } },
    { id: "reasoning", label: "Reasoning", desc: effChipLabel || "Default", icon: <IconCmdReasoning size={16} />,
      run: () => window.dispatchEvent(new CustomEvent("composer:open-model-menu")) },
    isThread && {
      id: "side", label: "Side", desc: "Open a side chat", icon: <IconCmdSide size={16} />,
      run: () => panelHook.open?.("sidechat") },
    { id: "status", label: "Status", desc: "Show chat ID, context usage, and rate limits", icon: <IconCmdStatus size={16} />,
      run: () => {
        const s = useStore.getState();
        const conv = s.activeConversation?.();
        const used = conv?.tokenUsage?.last?.totalTokens;
        const ctx = conv?.tokenUsage?.modelContextWindow;
        s.toast(`${s.model || "model"} · ${PERMISSIONS[s.permission]?.label} · ${used && ctx ? Math.round((100 * used) / ctx) + "% context" : "no usage yet"}`);
      } },
    !isThread && {
      id: "project", label: "Work in a project", desc: "Choose project for new chats", icon: <IconFolder size={16} />,
      run: () => window.dispatchEvent(new CustomEvent("composer:open-attach-menu")) },
  ].filter(Boolean);
  const filteredCommands = menu?.kind === "slash"
    ? slashCommands.filter((c) => c.label.toLowerCase().includes((menu.query || "").toLowerCase()))
    : [];

  const pickMention = (f) => {
    const name = f.name || basename(f.path);
    const caret = taRef.current?.selectionStart ?? text.length;
    const before = text.slice(0, menu.start);
    const after = text.slice(caret);
    setText(before + name + " " + after);
    setMentions((s) => [...s.filter((m) => m.name !== name), { name, path: f.path.startsWith("/") ? f.path : `${useStore.getState().cwd}/${f.path}` }]);
    setMenu(null);
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const pickSkill = (s) => {
    // Remove the "$query" (or "/query") token; the chip row represents it.
    const caret = taRef.current?.selectionStart ?? text.length;
    const before = menu.kind === "slash" ? "" : text.slice(0, menu.start);
    const after = menu.kind === "slash" ? "" : text.slice(caret);
    setText(before + after);
    setMentions((cur) => [
      ...cur.filter((m) => !(m.kind === "skill" && m.name === s.name)),
      { kind: "skill", name: s.name, displayName: skillName(s), path: s.path, icon: s.interface?.iconSmall || null },
    ]);
    setMenu(null);
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const runCommand = (c) => {
    if (c.disabled) { useStore.getState().toast("Open a chat first", "warn"); return; }
    setText("");
    setMenu(null);
    Promise.resolve(c.run()).catch((e) => useStore.getState().toast(e.message, "error"));
  };

  const menuCount = menu?.kind === "slash"
    ? filteredCommands.length + promptResults.length + skillResults.length
    : menu?.kind === "skill" ? skillResults.length : mentionResults.length;

  const doSend = (opts) => {
    if (!canSend) return;
    // Strip mention display names back out of the text (they go as mention inputs).
    let outText = text;
    for (const m of mentions) {
      if (m.kind === "skill") continue;
      outText = outText.split(m.name).join(`@${m.name}`);
    }
    // Skill mentions serialize as inline $slug at the end (reference behavior).
    for (const m of mentions) {
      if (m.kind !== "skill") continue;
      const tag = `$${m.name}`;
      if (!outText.includes(tag)) outText = `${outText.replace(/\s+$/, "")}${outText.trim() ? " " : ""}${tag} `;
    }
    // Attached (non-image) files ride along as mention inputs with absolute paths.
    const allMentions = [...mentions, ...files.map((f) => ({ name: basename(f), path: f, kind: "file" }))];
    sendMessage(outText, images, allMentions, opts); // the store queues it when a turn is running
    setText("");
    setImages([]);
    setFiles([]);
    setMentions([]);
  };
  doSendRef.current = (txt) => {
    if (!txt?.trim()) return;
    sendMessage(txt, [], []);
  };

  // /prompts:* — replace the composer text with the prompt file's content.
  const pickPrompt = async (p) => {
    const home = useStore.getState().appInfo?.home || "";
    setMenu(null);
    const r = await api.rpc("command/exec", { command: ["cat", `${home}/.codex/prompts/${p.name}.md`], timeoutMs: 5000 }).catch(() => null);
    const body = String(r?.stdout || "").replace(/^---\n[\s\S]*?\n---\n?/, "").trim();
    setText(body || `/${p.name} `);
    setTimeout(() => taRef.current?.focus(), 0);
  };

  const onKeyDown = (e) => {
    if (menu && menuCount > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMenuIdx((i) => Math.min(i + 1, menuCount - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMenuIdx((i) => Math.max(i - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        if (menu.kind === "slash") {
          const i = menuIdx;
          if (i < filteredCommands.length) runCommand(filteredCommands[i]);
          else if (i < filteredCommands.length + promptResults.length) pickPrompt(promptResults[i - filteredCommands.length]);
          else pickSkill(skillResults[i - filteredCommands.length - promptResults.length]);
        }
        else if (menu.kind === "skill") pickSkill(skillResults[menuIdx]);
        else pickMention(mentionResults[menuIdx]);
        return;
      }
      if (e.key === "Escape") { e.preventDefault(); setMenu(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      doSend();
    }
  };

  const addFiles = (paths) => {
    const imgs = paths.filter((p) => IMAGE_EXTS.some((ext) => p.toLowerCase().endsWith(ext)));
    if (imgs.length) setImages((s) => [...s, ...imgs]);
    // Non-image files become attachment cards (sent as mention inputs), not @path text.
    const others = paths.filter((p) => !imgs.includes(p));
    if (others.length) setFiles((s) => [...s, ...others]);
  };

  const onPasteFiles = async (e) => {
    const itemFiles = [...(e.clipboardData?.items || [])]
      .filter((item) => item.kind === "file")
      .map((item) => item.getAsFile())
      .filter(Boolean);
    const files = itemFiles.length ? itemFiles : [...(e.clipboardData?.files || [])];
    if (!files.length) return;
    e.preventDefault();
    addFiles(files.map((file) => api.getFilePath(file)).filter(Boolean));
    try {
      const saved = [];
      for (const [i, file] of files.entries()) {
        if (api.getFilePath(file) || !file.type.startsWith("image/")) continue;
        const dataUrl = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = () => reject(reader.error);
          reader.readAsDataURL(file);
        });
        const subtype = file.type.slice(6);
        const ext = `.${subtype === "jpeg" ? "jpg" : subtype === "svg+xml" ? "svg" : subtype || "png"}`;
        saved.push(await api.saveTempFile(dataUrl, `codex-paste-${i}`, ext));
      }
      addFiles(saved);
    } catch (error) {
      useStore.getState().toast(`Paste image failed: ${error.message}`, "error");
    }
  };

  const onPickFiles = (e) => {
    const paths = [...e.target.files].map((f) => api.getFilePath(f)).filter(Boolean);
    addFiles(paths);
    e.target.value = "";
  };

  // Quick-chat (hotkey window) mode: single-row pill — + | input | Instant | mic | send.
  if (quick) {
    return (
      <div className="relative">
        <div
          className="flex items-center gap-1 rounded-full bg-(--input-bg) p-1.5 backdrop-blur"
          style={{ boxShadow: "var(--shadow-menu)" }}
        >
          <AttachButton
            onPickImages={() => imageFileRef.current?.click()}
            onPickFiles={() => anyFileRef.current?.click()}
            onInsertText={(t) => setText((cur) => (cur ? `${cur} ${t}` : t))}
            browserTab={browserTab}
          />
          <textarea
            ref={taRef}
            rows={1}
            value={text}
            placeholder="Message ChatGPT"
            className="min-w-0 flex-1 resize-none bg-transparent px-1 py-1 text-[14px] leading-6 text-(--fg) outline-none placeholder:text-(--fg-faint)"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={onKeyDown}
            onPaste={onPasteFiles}
          />
          <span className="shrink-0 px-1 text-[13px] text-(--fg-tertiary)">Instant</span>
          <VoiceButton />
          {running && !canSend ? (
            <button
              title="Stop"
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--fg) font-[445] text-(--surface) hover:text-(--danger)"
              onClick={interrupt}
            >
              <IconStop size={16} />
            </button>
          ) : (
            <button
              title="Send (Enter)"
              disabled={!canSend}
              onClick={() => doSend()}
              className={cx(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-opacity",
                canSend
                  ? "bg-(--fg) text-(--surface) hover:opacity-85"
                  : "bg-(--fg-tertiary) text-(--input-bg)"
              )}
            >
              <IconArrowUp size={16} />
            </button>
          )}
        </div>
        <input ref={imageFileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPickFiles} />
        <input ref={anyFileRef} type="file" multiple className="hidden" onChange={onPickFiles} />
      </div>
    );
  }

  return (
    <div
      className={cx("relative", centered ? "w-full" : "px-4 pb-4")}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        addFiles([...e.dataTransfer.files].map((f) => api.getFilePath(f)).filter(Boolean));
      }}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-[25px] border-2 border-dashed border-(--accent) bg-(--accent-soft) text-[13px] font-medium text-(--accent)">
          Drop to attach
        </div>
      )}

      {queue.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {queue.map((q, i) => (
            <span
              key={i}
              className="flex h-7 max-w-full items-center gap-1.5 rounded-full border border-(--border) pl-3 pr-1.5 text-xs text-(--fg-secondary)"
            >
              <span className="min-w-0 truncate">{q.text}</span>
              <button
                title="Clear queued messages"
                className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-(--fg-tertiary) hover:text-(--danger)"
                onClick={() => clearQueue(activeThreadId)}
              >
                <IconX size={11} />
              </button>
            </span>
          ))}
        </div>
      )}

      {!activeThreadId && <HomeContextBar />}

      <div
        className="relative rounded-[25px] bg-(--input-bg) p-2 font-normal backdrop-blur-lg"
        style={{ boxShadow: "var(--shadow-composer)" }}
      >
        {images.length > 0 && (
          <div className="hide-scrollbar h-[82px] w-full overflow-x-auto p-px">
            <div className="flex min-w-max items-end gap-2">
            {images.map((p, i) => (
              <div
                key={i}
                className="relative size-20 shrink-0 rounded-[17px] border border-(--border-heavy)"
              >
                <span className="absolute inset-0 overflow-hidden rounded-[17px]">
                  <img src={api.localFileUrl(p)} alt="" className="size-full object-cover" />
                </span>
                <button
                  aria-label={`Remove ${basename(p)}`}
                  className="absolute top-1 right-1 flex size-4 items-center justify-center rounded-full bg-(--fg) text-(--surface) shadow-sm"
                  onClick={() => setImages((s) => s.filter((_, j) => j !== i))}
                >
                  <IconX size={10} />
                </button>
              </div>
            ))}
            </div>
          </div>
        )}

        {files.length > 0 && (
          <div className="hide-scrollbar w-full overflow-x-auto p-px pb-1">
            <div className="flex min-w-max items-center gap-2">
            {files.map((p, i) => (
              <div
                key={i}
                className="relative flex items-center gap-2 rounded-[12px] border border-(--border) bg-(--surface) py-2 pr-2 pl-2.5"
              >
                <IconFile size={16} className="shrink-0 text-(--fg-tertiary)" />
                <div className="flex min-w-0 flex-col">
                  <span className="max-w-[200px] truncate text-[13px] leading-4">{basename(p)}</span>
                  <span className="text-[11px] leading-4 text-(--fg-tertiary)">
                    {(p.includes(".") ? p.split(".").pop() : "file").toUpperCase()}
                  </span>
                </div>
                <button
                  aria-label={`Remove ${basename(p)}`}
                  className="flex size-4 shrink-0 items-center justify-center rounded-full bg-(--fg) text-(--surface) shadow-sm"
                  onClick={() => setFiles((s) => s.filter((_, j) => j !== i))}
                >
                  <IconX size={10} />
                </button>
              </div>
            ))}
            </div>
          </div>
        )}

        {mentions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-1 pt-1 pb-1.5">
            {mentions.map((m, i) =>
              m.kind === "skill" ? (
                <span
                  key={i}
                  className="flex items-center gap-1.5 py-1 pl-1 pr-1.5 text-xs font-medium text-(--accent)"
                  title={m.path}
                >
                  {m.icon ? (
                    <img src={api.localFileUrl(m.icon)} alt="" className="size-3.5 rounded-sm object-cover" />
                  ) : (
                    <IconSkillCube size={14} />
                  )}
                  {m.displayName || m.name}
                  <button
                    className="shrink-0 opacity-60 hover:opacity-100"
                    onClick={() => setMentions((s) => s.filter((_, j) => j !== i))}
                  >
                    <IconX size={11} />
                  </button>
                </span>
              ) : (
                <span
                  key={i}
                  className="flex items-center gap-1.5 rounded-lg bg-(--accent-soft) py-1 pl-2 pr-1.5 text-xs text-(--accent)"
                  title={m.path}
                >
                  @{m.name}
                  <button
                    className="shrink-0 opacity-60 hover:opacity-100"
                    onClick={() => setMentions((s) => s.filter((_, j) => j !== i))}
                  >
                    <IconX size={11} />
                  </button>
                </span>
              )
            )}
          </div>
        )}

        {menu && (
          <div
            className={cx(
              "absolute bottom-full left-0 z-30 mb-2 overflow-hidden rounded-xl border border-(--border) bg-(--dropdown-bg) py-1",
              menu.kind === "skill" || menu.kind === "slash" ? "right-0 max-h-[320px] overflow-y-auto" : "w-[340px]"
            )}
            style={{ boxShadow: "var(--shadow-menu)" }}
          >
            {menu.kind === "slash" && (
              <>
                {menuCount === 0 && (
                  <div className="px-3 py-2 text-xs text-(--fg-tertiary)">No matching commands</div>
                )}
                {filteredCommands.map((c, i) => (
                  <button
                    key={c.id}
                    className={cx(
                      "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm",
                      i === menuIdx ? "bg-(--surface-active)" : "hover:bg-(--surface-hover)",
                      c.disabled && "opacity-45"
                    )}
                    onMouseEnter={() => setMenuIdx(i)}
                    onClick={() => runCommand(c)}
                  >
                    <FitIcon>{c.icon}</FitIcon>
                    <span className="max-w-[60%] flex-none truncate">{c.label}</span>
                    <span className="ml-auto min-w-0 flex-1 truncate text-right text-sm text-(--fg-tertiary)">{c.desc}</span>
                  </button>
                ))}
                {promptResults.map((p, i) => {
                  const gi = filteredCommands.length + i;
                  return (
                    <button
                      key={p.name}
                      className={cx(
                        "flex w-full items-center gap-2 rounded-lg px-3 py-1.5 text-left text-sm",
                        gi === menuIdx ? "bg-(--surface-active)" : "hover:bg-(--surface-hover)"
                      )}
                      onMouseEnter={() => setMenuIdx(gi)}
                      onClick={() => pickPrompt(p)}
                    >
                      <FitIcon>
                        <LucideIcon name="SquareTerminal" size={16} />
                      </FitIcon>
                      <span className="max-w-[60%] flex-none truncate">prompts:{p.name}</span>
                      <span className="ml-auto min-w-0 flex-1 truncate text-right text-sm text-(--fg-tertiary)">{p.desc}</span>
                    </button>
                  );
                })}
                {skillResults.map((s, i) => {
                  const gi = filteredCommands.length + promptResults.length + i;
                  return (
                    <button
                      key={s.path}
                      className={cx(
                        "flex w-full items-center gap-2 overflow-hidden rounded-lg px-3 py-1.5 text-left text-sm",
                        gi === menuIdx ? "bg-(--surface-active)" : "hover:bg-(--surface-hover)"
                      )}
                      onMouseEnter={() => setMenuIdx(gi)}
                      onClick={() => pickSkill(s)}
                    >
                      <FitIcon className="text-(--fg-secondary)">
                        {s.interface?.iconSmall ? (
                          <img src={api.localFileUrl(s.interface.iconSmall)} alt="" className="size-5 rounded object-cover" />
                        ) : (
                          <IconSkillBox size={16} />
                        )}
                      </FitIcon>
                      <span className="shrink-0 truncate">{skillName(s)}</span>
                      <span className="flex-1 truncate text-(--fg-tertiary)">{skillDesc(s)}</span>
                      <span className="ml-auto shrink-0 text-(--fg-tertiary)">{s.scopeLabel}</span>
                    </button>
                  );
                })}
              </>
            )}
            {menu.kind === "skill" && (
              <>
                {skillResults.length === 0 && (
                  <div className="px-3 py-2 text-xs text-(--fg-tertiary)">
                    {menu.query ? "No matching skills" : "Loading skills…"}
                  </div>
                )}
                {skillResults.map((s, i) => (
                  <button
                    key={s.path}
                    className={cx(
                      "flex w-full items-center gap-2 overflow-hidden rounded-lg px-3 py-1.5 text-left text-sm",
                      i === menuIdx ? "bg-(--surface-active)" : "hover:bg-(--surface-hover)"
                    )}
                    onMouseEnter={() => setMenuIdx(i)}
                    onClick={() => pickSkill(s)}
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center text-(--fg-secondary)">
                      {s.interface?.iconSmall ? (
                        <img src={api.localFileUrl(s.interface.iconSmall)} alt="" className="size-5 rounded object-cover" />
                      ) : (
                        <IconSkillBox size={16} />
                      )}
                    </span>
                    <span className="shrink-0 truncate">{skillName(s)}</span>
                    <span className="flex-1 truncate text-(--fg-tertiary)">{skillDesc(s)}</span>
                    <span className="ml-auto shrink-0 text-(--fg-tertiary)">{s.scopeLabel}</span>
                  </button>
                ))}
              </>
            )}
            {menu.kind === "mention" && (
              <>
                {mentionResults.length === 0 && (
                  <div className="px-3 py-2 text-xs text-(--fg-tertiary)">
                    {menu.query ? "Searching…" : "Type to search files"}
                  </div>
                )}
                {mentionResults.map((f, i) => (
                  <button
                    key={f.path}
                    className={cx(
                      "flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px]",
                      i === menuIdx ? "bg-(--surface-active)" : "hover:bg-(--surface-hover)"
                    )}
                    onMouseEnter={() => setMenuIdx(i)}
                    onClick={() => pickMention(f)}
                  >
                    <span className="min-w-0 flex-1 truncate">{f.name || basename(f.path)}</span>
                    <span className="max-w-[45%] shrink-0 truncate text-xs text-(--fg-tertiary)">{f.path}</span>
                  </button>
                ))}
              </>
            )}
          </div>
        )}

        <textarea
          ref={taRef}
          rows={1}
          value={text}
          placeholder={useStore((s) => s.mode) === "chatgpt" ? "Message ChatGPT" : "Do anything"}
          className="mx-1 mt-1.5 mb-1 block min-h-11 w-[calc(100%-8px)] resize-none bg-transparent p-0 text-[14px] leading-5 font-[445] text-(--fg) outline-none placeholder:text-(--fg-faint)"
          onChange={(e) => { setText(e.target.value); detectMenu(e.target.value, e.target.selectionStart); }}
          onKeyDown={onKeyDown}
          onClick={(e) => detectMenu(e.target.value, e.target.selectionStart)}
          onPaste={onPasteFiles}
        />

        <div className="flex items-center gap-[5px]">
          <AttachButton
            onPickImages={() => imageFileRef.current?.click()}
            onPickFiles={() => anyFileRef.current?.click()}
            onInsertText={(t) => setText((cur) => (cur ? `${cur} ${t}` : t))}
            browserTab={browserTab}
          />
          <PermissionChip />
          <div className="h-4 w-px bg-(--border-light)" />
          <PlanChip />
          <div className="ms-auto flex min-w-0 items-center justify-end">
            <ModelChip />
            <div className="flex shrink-0 items-center gap-2">
              <VoiceButton />
              {running && !canSend ? (
                <button
                  title="Stop"
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-(--fg) font-[445] text-(--surface) hover:text-(--danger)"
                  onClick={interrupt}
                >
                  <IconStop size={16} />
                </button>
              ) : (
                <button
                  title="Send (Enter)"
                  disabled={!canSend}
                  onClick={() => doSend()}
                  className={cx(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full transition-opacity",
                    canSend
                      ? "bg-(--fg) text-(--surface) hover:opacity-85"
                      : "bg-(--fg-tertiary) text-(--input-bg)"
                  )}
                >
                  <IconArrowUp size={16} />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      <input ref={imageFileRef} type="file" accept="image/*" multiple className="hidden" onChange={onPickFiles} />
      <input ref={anyFileRef} type="file" multiple className="hidden" onChange={onPickFiles} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Home-screen context bar: the project chip opens the reference-style project
// picker (search + project list + new project). With no project matched (for
// example the home folder), it reads "Select project" and the Local/branch
// chips stay hidden, like the official client.
// ---------------------------------------------------------------------------
function HomeContextBar() {
  const cwd = useStore((s) => s.cwd);
  const pickCwd = useStore((s) => s.pickCwd);
  const gs = useStore((s) => s.gs);
  const [branch, setBranch] = useState(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const wrapRef = useRef(null);

  useEffect(() => {
    let alive = true;
    setBranch(null);
    if (!cwd) return undefined;
    api
      .rpc("command/exec", {
        command: ["git", "rev-parse", "--abbrev-ref", "HEAD"],
        cwd,
        timeoutMs: 8000,
      })
      .then((res) => {
        if (!alive) return;
        const out = String(res?.stdout ?? res?.output ?? "")
          .split("\n")[0]
          .trim();
        setBranch(out && out !== "HEAD" ? out : null);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [cwd]);

  useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Match the cwd to a known project (longest rootPath wins, like the sidebar).
  const project = useMemo(() => {
    const norm = (p) => (p || "").replace(/\\/g, "/");
    const dir = norm(cwd);
    let best = null;
    for (const p of Object.values(gs?.["local-projects"] || {})) {
      for (const rp of p.rootPaths || []) {
        const r = norm(rp);
        if (r && (dir === r || dir.startsWith(r + "/")) && (!best || r.length > best.len)) {
          best = { p, len: r.length };
        }
      }
    }
    return best?.p || null;
  }, [gs, cwd]);

  const projects = useMemo(
    () => Object.entries(gs?.["local-projects"] || {})
      .map(([id, p]) => ({ id, name: p.name || "Project", path: (p.rootPaths || [])[0] || "" }))
      .filter((p) => p.path)
      .sort((a, b) => a.name.localeCompare(b.name)),
    [gs]
  );

  // Remove a project from the shared local-projects state (same file the
  // official client reads, so it disappears from both apps' sidebars).
  const removeProject = (id) => {
    const s = useStore.getState();
    const local = { ...(s.gs?.["local-projects"] || {}) };
    delete local[id];
    useStore.setState({ gs: { ...s.gs, "local-projects": local } });
    api.gsPatch({ "local-projects": local });
  };
  const q = query.trim().toLowerCase();
  const filtered = q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;

  const chipCls = "flex h-7 items-center gap-1.5 rounded-full px-2 text-[13px] leading-[18px] text-(--fg-secondary)";
  const iconCls = "opacity-70";
  return (
    <div className="relative z-0 mx-[13px] -mb-[18px] flex items-center gap-2 rounded-t-[20px] bg-(--surface-under) px-1.5 pt-1.5 pb-[27px] dark:bg-(--surface-fog)">
      <div ref={wrapRef} className="relative">
        <div className="group/projchip relative inline-flex min-w-0 rounded-full">
          <button
            title={project ? (project.rootPaths || [])[0] : "Select project"}
            onClick={() => { setOpen(!open); setQuery(""); }}
            className={cx(chipCls, "hover:bg-(--surface-hover)")}
          >
            <IconFolder size={13} className={cx(iconCls, project && "group-hover/projchip:invisible")} />
            <span className="max-w-[220px] truncate">{project ? project.name : "Select project"}</span>
          </button>
          {project && (
            // official behavior: hovering the chip covers the folder icon with a
            // circled-X ("Don't work in a project") that clears the selection
            <button
              aria-label="Don't work in a project"
              title="Don't work in a project"
              className="pointer-events-none absolute inset-y-0 left-0 z-10 flex aspect-square items-center justify-center rounded-full text-(--fg-tertiary) opacity-0 transition-opacity group-hover/projchip:pointer-events-auto group-hover/projchip:opacity-100 hover:text-(--fg)"
              onClick={(e) => {
                e.stopPropagation();
                setOpen(false);
                useStore.getState().setCwd(useStore.getState().appInfo?.home || "");
              }}
            >
              <IconCircleXFill size={15} />
            </button>
          )}
        </div>
        {open && (
          <div
            className="absolute bottom-full left-0 z-40 mb-2 w-64 overflow-hidden rounded-xl border border-(--border) bg-(--dropdown-bg)"
            style={{ boxShadow: "var(--shadow-menu)" }}
          >
            <div className="flex items-center gap-2 border-b border-(--border-light) px-3 py-2">
              <LucideIcon name="Search" size={13} className="shrink-0 text-(--fg-tertiary)" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search projects"
                className="w-full bg-transparent text-[13px] outline-none placeholder:text-(--fg-faint)"
              />
            </div>
            <div className="max-h-[280px] overflow-y-auto p-1">
              {filtered.map((p) => (
                <div key={p.id} className="group/projrow relative">
                  <button
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 pr-7 text-left text-[13px] hover:bg-(--surface-hover)"
                    onClick={() => { useStore.getState().setCwd(p.path); setOpen(false); }}
                  >
                    <IconFolder size={14} className="shrink-0 text-(--fg-tertiary)" />
                    <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  </button>
                  <button
                    title={`Remove ${p.name}`}
                    className="absolute top-1/2 right-1.5 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-(--fg-tertiary) opacity-0 group-hover/projrow:opacity-100 hover:bg-(--surface-active) hover:text-(--fg)"
                    onClick={(e) => { e.stopPropagation(); removeProject(p.id); }}
                  >
                    <IconX size={12} />
                  </button>
                </div>
              ))}
              {filtered.length === 0 && (
                <div className="px-3 py-2 text-xs text-(--fg-tertiary)">No matching projects</div>
              )}
            </div>
            <div className="border-t border-(--border-light) p-1">
              <button
                className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px] hover:bg-(--surface-hover)"
                onClick={() => { setOpen(false); pickCwd(); }}
              >
                <LucideIcon name="Plus" size={14} className="shrink-0 text-(--fg-tertiary)" />
                New project…
              </button>
            </div>
          </div>
        )}
      </div>
      {project && (
        <>
          <span className={chipCls}>
            <IconMonitor size={13} className={iconCls} />
            Local
          </span>
          {branch && (
            <span className={chipCls}>
              <IconBranch size={13} className={iconCls} />
              <span className="max-w-[180px] truncate">{branch}</span>
            </span>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// "+" button with attach menu.
// ---------------------------------------------------------------------------
function AttachButton({ onPickImages, onPickFiles, onInsertText, browserTab }) {
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [plugins, setPlugins] = useState([]);
  const [agents, setAgents] = useState([]);

  // "/project" (Work in a project) slash command opens this menu.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("composer:open-attach-menu", onOpen);
    return () => window.removeEventListener("composer:open-attach-menu", onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    api.rpc("plugin/list", {})
      .then((r) => {
        const flat = [];
        for (const mp of r?.marketplaces || []) {
          for (const p of mp.plugins || []) if (p.installed && p.enabled) flat.push(p);
        }
        setPlugins(flat);
      })
      .catch(() => setPlugins([]));
    // Local agents (~/.codex/agents/*.toml) — the reference menu's agent rows.
    const home = useStore.getState().appInfo?.home || "";
    api.rpc("command/exec", {
      command: ["sh", "-c", 'cd "$1/.codex/agents" 2>/dev/null && for f in *.toml; do n=$(grep -m1 "^name" "$f" | sed "s/.*= *//;s/\\"//g"); d=$(grep -m1 "^description" "$f" | sed "s/.*= *//;s/\\"//g"); printf "%s\\t%s\\n" "$n" "$d"; done', "sh", home],
      timeoutMs: 6000,
    })
      .then((r) => {
        const rows = String(r?.stdout || "").split("\n").filter(Boolean).map((line) => {
          const [name, ...rest] = line.split("\t");
          return { name, desc: rest.join("\t").trim() };
        }).filter((a) => a.name);
        rows.sort((a, b) => a.name.localeCompare(b.name));
        setAgents(rows.slice(0, 5));
      })
      .catch(() => setAgents([]));
  }, [open]);

  const threads = useStore((s) => s.threads) || [];
  const recentChats = useMemo(() => [...threads].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, 5), [threads]);

  const items = [
    { header: "Add" },
    { id: "files", label: "Files and folders", icon: <IconPaperclip size={14} />, onSelect: onPickFiles },
    ...(browserTab
      ? [{
          id: "chrome",
          label: "Attach browser tab",
          icon: <LucideIcon name="Globe" size={14} />,
          onSelect: () => onInsertText(`Browser tab: ${browserTab.title || browserTab.url} (${browserTab.url})`),
        }]
      : []),
    { id: "goal", label: "Goal", icon: <IconCmdGoal size={14} />, hint: "Set a goal to keep pursuing", onSelect: () => useStore.getState().setUi({ goalDialogOpen: true }) },
    { id: "plan", label: "Plan mode", icon: <IconList size={14} />, hint: useStore.getState().planMode ? "Turn plan mode off" : "Turn plan mode on", onSelect: () => useStore.getState().setPlanMode(!useStore.getState().planMode) },
    ...(plugins.length ? [{ header: "Plugins" }] : []),
    ...plugins.map((p) => ({
      id: `plugin:${p.id}`,
      label: (
        <span className="flex items-center gap-2">
          <PluginIcon plugin={p} size={16} />
          <span className="min-w-0 flex-1 truncate">{p.interface?.displayName || p.name}</span>
          <span className="min-w-0 truncate text-xs text-(--fg-faint)">{p.interface?.shortDescription || ""}</span>
        </span>
      ),
      onSelect: () => {
        const prompt = (p.interface?.defaultPrompt || [])[0];
        if (prompt) onInsertText(prompt);
      },
    })),
    ...(agents.length ? [{ header: "Agents" }] : []),
    ...agents.map((a) => ({
      id: `agent:${a.name}`,
      label: (
        <span className="flex items-center gap-2">
          <LucideIcon name="Bot" size={16} />
          <span className="min-w-0 flex-1 truncate">{a.name.split(/[-_\s]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ")}</span>
          <span className="min-w-0 truncate text-xs text-(--fg-faint)">{a.desc}</span>
        </span>
      ),
      onSelect: () => onInsertText(`@${a.name} `),
    })),
    ...(recentChats.length ? [{ header: "Chats" }] : []),
    ...recentChats.map((t) => ({
      id: `chat:${t.id}`,
      label: (
        <span className="flex items-center gap-2">
          <IconChat size={16} />
          <span className="min-w-0 flex-1 truncate">{t.name || "Untitled chat"}</span>
          <span className="shrink-0 text-xs text-(--fg-faint)">ChatGPT conversation</span>
        </span>
      ),
      onSelect: () => onInsertText(`Chat: ${t.name || "Untitled chat"} `),
    })),
  ];

  return (
    <>
      <button
        ref={ref}
        title="Add files and more"
        onClick={() => setOpen(true)}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-transparent text-[13px] leading-[18px] font-[445] text-(--fg) hover:bg-(--surface-hover)"
      >
        <IconComposerPlus className="size-4" />
      </button>
      <Menu
        open={open}
        anchor={() => ref.current?.getBoundingClientRect()}
        onClose={() => setOpen(false)}
        width={300}
        items={items}
      />
    </>
  );
}



// ---------------------------------------------------------------------------
// Permission preset chip.
// ---------------------------------------------------------------------------
function PermissionChip() {
  const permission = useStore((s) => normalizePermission(s.permission));
  const setPermission = useStore((s) => s.setPermission);
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const full = permission === "full";
  const OPTIONS = [
    { id: "ask", label: "Ask for approval", desc: "Always ask to edit external files and use the internet", icon: <IconHand size={14} /> },
    { id: "approve", label: "Approve for me", desc: "Only ask for actions detected as potentially unsafe", icon: <IconShield size={14} /> },
    { id: "full", label: "Full access", desc: "Unrestricted access to the internet and any file on your computer", icon: <FullAccessIcon size={14} />, warn: true },
    { id: "custom", label: "Custom (config.toml)", desc: "Uses permissions defined in config.toml", icon: <IconGear size={14} /> },
  ];
  return (
    <>
      <button
        ref={ref}
        onClick={() => setOpen(true)}
        className={cx(
          "flex h-7 shrink-0 items-center gap-1 rounded-full border border-transparent px-1.5 text-[13px] leading-[18px] font-[445] text-(--fg-tertiary) hover:bg-(--surface-hover)"
        )}
      >
        <FullAccessIcon size={16} className={full ? "text-(--warning)" : "text-(--fg-tertiary)"} />
        <span className={cx("font-normal", full && "text-(--warning)")}>
          {PERMISSIONS[permission]?.label || "Permissions"}
        </span>
      </button>
      {open && (
        <RichPopover anchor={() => ref.current?.getBoundingClientRect()} onClose={() => setOpen(false)} width={400}>
          <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-1.5">
            <span className="whitespace-nowrap text-xs font-medium text-(--fg-tertiary)">How should ChatGPT actions be approved?</span>
            <button
              className="shrink-0 text-xs whitespace-nowrap text-(--fg-secondary) underline hover:text-(--fg)"
              onClick={() => api.openExternal("https://developers.openai.com/codex/")}
            >
              Learn more
            </button>
          </div>
          {OPTIONS.map((o) => (
            <button
              key={o.id}
              className="flex w-full items-start gap-2.5 px-3 py-2 text-left hover:bg-(--surface-hover)"
              onClick={() => { setPermission(o.id); setOpen(false); }}
            >
              <span className={cx("mt-0.5 shrink-0", o.warn ? "text-(--warning)" : "text-(--fg-tertiary)")}>{o.icon}</span>
              <span className="min-w-0 flex-1">
                <span className={cx("block text-[13px]", o.warn && "text-(--warning)")}>{o.label}</span>
                <span className="block text-xs leading-4 text-(--fg-tertiary)">{o.desc}</span>
              </span>
              {permission === o.id && <IconCheck size={14} className="mt-0.5 shrink-0 text-(--accent)" />}
            </button>
          ))}
        </RichPopover>
      )}
    </>
  );
}

function FullAccessIcon({ size = 16, className }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" className={className} aria-hidden="true">
      <path fillRule="evenodd" clipRule="evenodd" d="M9.06543 1.95123C9.66107 1.69076 10.3389 1.69071 10.9346 1.95123L15.9346 4.13873C16.7832 4.51008 17.3311 5.34917 17.3311 6.27545V10.5528C17.3309 14.6017 14.0489 17.8847 10 17.8848C5.95108 17.8846 2.66813 14.6017 2.66797 10.5528V6.27545C2.66797 5.34924 3.21695 4.51012 4.06543 4.13873L9.06543 1.95123ZM10.4014 3.16998C10.1456 3.05814 9.85444 3.05819 9.59863 3.16998L4.59863 5.35748C4.23427 5.51708 3.99805 5.87764 3.99805 6.27545V10.5528C3.99821 13.8671 6.68563 16.5546 10 16.5547C13.3144 16.5546 16.0008 13.8671 16.001 10.5528V6.27545C16.001 5.87756 15.7658 5.51703 15.4014 5.35748L10.4014 3.16998Z" fill="currentColor" />
      <path d="M10.8883 13.1116C10.8883 13.6025 10.4903 14.0005 9.99936 14.0005C9.50844 14.0005 9.11047 13.6025 9.11047 13.1116C9.11047 12.6207 9.50844 12.2227 9.99936 12.2227C10.4903 12.2227 10.8883 12.6207 10.8883 13.1116Z" fill="currentColor" />
      <path d="M10.5169 10.8949L11.1135 7.31519C11.2283 6.62672 10.6974 6 9.99941 6C9.30145 6 8.77053 6.62672 8.88528 7.31519L9.4819 10.8949C9.52406 11.1479 9.74294 11.3333 9.99941 11.3333C10.2559 11.3333 10.4748 11.1479 10.5169 10.8949Z" fill="currentColor" />
    </svg>
  );
}

// Anchored popover panel (richer than the flat Menu; used by composer menus).
function RichPopover({ anchor, onClose, width = 320, children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);
  React.useLayoutEffect(() => {
    const r = anchor?.();
    if (!r) return;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
    let top = r.top - 8;
    const el = ref.current;
    const h = el?.offsetHeight || 300;
    top = Math.max(8, top - h);
    setPos({ left, top });
  }, []);
  React.useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown, true); window.removeEventListener("keydown", onKey); };
  }, []);
  if (!pos) {
    return createPortal(<div ref={ref} className="fixed z-50 opacity-0">{children}</div>, document.body);
  }
  return createPortal(
    <div
      ref={ref}
      className="popover-in fixed z-50 overflow-hidden rounded-xl border border-(--border) bg-(--dropdown-bg) py-1"
      style={{ left: pos.left, top: pos.top, width, boxShadow: "var(--shadow-menu)" }}
    >
      {children}
    </div>,
    document.body
  );
}

// Inline icons for the permission menu (Lucide).
const IconHand = (p) => <LucideIcon name="Hand" size={p.size || 16} className={p.className} />;
const IconGear = (p) => <LucideIcon name="Settings" size={p.size || 16} className={p.className} />;

// ---------------------------------------------------------------------------
// Model + reasoning effort chip (one combined menu, two sections).
// Plan-mode indicator chip (visible while plan mode is on; click to exit).
// Goal is not a resident composer button — it is set from the "/" menu.
function PlanChip() {
  const planMode = useStore((s) => s.planMode);
  const setPlanMode = useStore((s) => s.setPlanMode);
  if (!planMode) return null;
  return (
    <button
      title="Plan mode is on — click to turn off"
      className="flex h-7 items-center gap-1 rounded-full border border-(--accent) bg-(--accent-soft) px-2.5 text-xs font-medium text-(--accent)"
      onClick={() => setPlanMode(false)}
    >
      <IconList size={12} />
      Plan
      <IconX size={11} className="opacity-60" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Display-name helpers matching the reference client: "GPT-5.6-Sol" →
// "5.6 Sol"; "xhigh" → "Extra High".
// ---------------------------------------------------------------------------
function shortModelName(name) {
  if (!name) return name;
  return name.replace(/^GPT[- ]?/i, "").replace(/-/g, " ");
}
function effortLabel(e) {
  if (!e) return e;
  const map = { none: "None", minimal: "Minimal", low: "Light", medium: "Medium", high: "High", xhigh: "Extra High", max: "Max", ultra: "Ultra" };
  return map[e] || e.charAt(0).toUpperCase() + e.slice(1);
}

// ---------------------------------------------------------------------------
function ModelChip() {
  const models = useStore((s) => s.models);
  const model = useStore((s) => s.model);
  const effort = useStore((s) => s.effort);
  const serviceTier = useStore((s) => s.serviceTier);
  const setModel = useStore((s) => s.setModel);
  const setEffort = useStore((s) => s.setEffort);
  const setServiceTier = useStore((s) => s.setServiceTier);
  const ref = useRef(null);
  const [open, setOpen] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [closedWidth, setClosedWidth] = useState(null);

  // "/model" and "/reasoning" slash commands open this menu.
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("composer:open-model-menu", onOpen);
    return () => window.removeEventListener("composer:open-model-menu", onOpen);
  }, []);

  const current = models.find((m) => m.model === model);
  const effLabel = effortLabel(effort || current?.defaultReasoningEffort || null);
  const modelName = shortModelName(current?.displayName || model) || "Model";

  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const width = el.style.width;
    el.style.width = "max-content";
    setClosedWidth(el.getBoundingClientRect().width);
    el.style.width = width;
  }, [modelName, effLabel]);

  return (
    <>
      <button
        ref={ref}
        onClick={() => setOpen(true)}
        title="Model, effort, and speed"
        aria-haspopup="menu"
        aria-expanded={open}
        data-state={open ? "open" : "closed"}
        className="composer-model-button flex h-7 min-w-0 items-center justify-center gap-1 rounded-full border border-transparent py-0 pl-2 pr-2.5 text-[13px] leading-[18px] font-[445]"
        style={{
          width: open ? 225.15625 : closedWidth ?? undefined,
          transition: "width 320ms cubic-bezier(.23,1,.32,1)",
        }}
      >
        <span className="tabular-nums font-normal text-(--fg)">{modelName}</span>
        {effLabel && <span className="font-normal text-(--fg-tertiary)">{effLabel}</span>}
        <IconComposerChevronDown className="me-0.5 size-3.5 shrink-0 text-(--fg-tertiary)" />
      </button>
      {open && (
        <ModelMenu
          anchor={() => ref.current?.getBoundingClientRect()}
          onClose={() => setOpen(false)}
          models={models}
          current={current}
          model={model}
          modelName={modelName}
          effLabel={effLabel}
          effort={effort}
          serviceTier={serviceTier}
          setModel={setModel}
          setEffort={setEffort}
          setServiceTier={setServiceTier}
          advanced={advanced}
          setAdvanced={setAdvanced}
        />
      )}
    </>
  );
}

// The reasoning menu: Model / Effort / Speed rows whose submenus fly out on
// hover (like the reference client).
function ModelMenu({ anchor, onClose, models, current, model, modelName, effLabel, effort, serviceTier, setModel, setEffort, setServiceTier, advanced, setAdvanced }) {
  const ref = useRef(null);
  const [fly, setFly] = useState(null); // {kind, topViewport}
  const closeTimer = useRef(null);
  const W = 224;
  const position = () => {
    const r = anchor?.();
    if (!r) return null;
    return {
      left: Math.max(8, Math.min(r.right - W - 0.5, window.innerWidth - W - 8)),
      bottom: Math.max(8, window.innerHeight - r.top + 9),
    };
  };
  const [pos] = useState(position);

  React.useEffect(() => {
    const onDown = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("mousedown", onDown, true); window.removeEventListener("keydown", onKey); };
  }, []);

  const openFly = (kind) => (e) => {
    clearTimeout(closeTimer.current);
    setFly({ kind, top: e.currentTarget.getBoundingClientRect().top - 3.140625 });
  };
  const scheduleHide = () => {
    clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setFly(null), 150);
  };
  const stay = () => clearTimeout(closeTimer.current);

  const efforts = current?.supportedReasoningEfforts || [];
  const fastTier = (current?.serviceTiers || []).find((t) => t.id === "priority");
  const hasFast = !!fastTier || (current?.additionalSpeedTiers || []).includes("fast");
  const pick = (fn) => () => { fn(); onClose(); };
  const fast = serviceTier === "priority";

  return createPortal(
    <div ref={ref} className="fixed z-50" style={{ left: pos?.left ?? -9999, bottom: pos?.bottom ?? -9999, width: W, visibility: pos ? "visible" : "hidden" }}>
      <div
        role="menu"
        className="model-menu-in relative z-50 overflow-hidden rounded-[15px] p-1"
        style={{
          height: advanced ? 134 : 84,
          transition: "height 300ms cubic-bezier(.23,1,.32,1)",
        }}
      >
        <div
          className="absolute inset-x-1 top-1"
          style={{
            transform: advanced ? "none" : "translateY(-90px)",
            transition: "transform 300ms cubic-bezier(.23,1,.32,1)",
          }}
        >
            <MenuRow label="Model" value={modelName} onEnter={openFly("model")} onLeave={scheduleHide} />
            <MenuRow label="Effort" value={effLabel || "Default"} onEnter={openFly("effort")} onLeave={scheduleHide} />
            <MenuRow label="Speed" value={fast ? "Fast" : "Standard"} onEnter={openFly("speed")} onLeave={scheduleHide} />
        </div>
        <div
          className={cx("absolute left-1 flex items-center", advanced && "before:absolute before:-top-1 before:left-2 before:right-2 before:h-px before:bg-(--border-light)")}
          style={{
            top: 97.7109375,
            transform: advanced ? "none" : "translateY(-94px)",
            transition: "transform 300ms cubic-bezier(.23,1,.32,1)",
          }}
        >
          <button
            role="menuitem"
            data-model-picker-view-toggle="true"
            className="flex h-8 flex-col rounded-lg p-1 text-left text-[13px] leading-[18.5714px] font-[445] text-(--fg-tertiary) hover:bg-(--sidebar-row-active)"
            onClick={() => setAdvanced(!advanced)}
            aria-expanded={advanced}
          >
            <span className="inline-flex items-center gap-1 px-1 py-0.5">
              Advanced
              <IconComposerChevronRight
                className="size-3 shrink-0"
                style={{
                  rotate: advanced ? "-90deg" : "0deg",
                  transition: "rotate 300ms cubic-bezier(.23,1,.32,1)",
                }}
              />
            </span>
          </button>
        </div>
        {!advanced && <IconModelPower className="model-power-icon absolute top-[11.7109375px] right-3 size-4 text-(--fg-tertiary)" />}
        {!advanced && <EffortSlider efforts={efforts} effLabel={effLabel} onPick={(e) => setEffort(e)} />}
      </div>
      {fly && (
        <FlyPanel
          kind={fly.kind}
          anchorTop={fly.top}
          containerTop={ref.current?.getBoundingClientRect().top ?? 0}
          containerLeft={pos?.left ?? 0}
          containerWidth={W}
          width={fly.kind === "model" ? 280 : fly.kind === "effort" ? 204.0234375 : 233}
          onEnter={stay}
          onLeave={scheduleHide}
        >
          {fly.kind === "model" && (
            <>
              {models.filter((m) => !m.hidden).map((m) => (
                <FlyOption
                  key={m.model}
                  label={shortModelName(m.displayName || m.model)}
                  checked={m.model === model}
                  onClick={pick(() => setModel(m.model))}
                />
              ))}
            </>
          )}
          {fly.kind === "effort" && (
            <>
              <div className="px-2 py-1 text-[13px] leading-[18px] font-[445] text-(--fg-tertiary)">Effort</div>
              {efforts.map((e) => {
                const ultra = e.reasoningEffort === "ultra";
                return (
                  <FlyOption
                    key={e.reasoningEffort}
                    label={effortLabel(e.reasoningEffort)}
                    desc={ultra ? "Consumes usage limits faster" : null}
                    checked={effortLabel(e.reasoningEffort) === effLabel}
                    onClick={pick(() => setEffort(e.reasoningEffort))}
                  />
                );
              })}
            </>
          )}
          {fly.kind === "speed" && (
            <>
              <div className="px-2 py-1 text-[13px] leading-[18px] font-[445] text-(--fg-tertiary)">Speed</div>
              <FlyOption label="Standard" desc="Default speed" checked={!serviceTier} onClick={pick(() => setServiceTier(null))} />
              {hasFast && (
                <FlyOption label="Fast" desc="1.5x speed, more usage" checked={serviceTier === "priority"} onClick={pick(() => setServiceTier("priority"))} />
              )}
            </>
          )}
        </FlyPanel>
      )}
    </div>,
    document.body
  );
}

// Flyout submenu: picks left/right side based on available space and clamps
// itself inside the window (fixes off-window rendering).
function FlyPanel({ kind, anchorTop, containerTop, containerLeft, containerWidth, width, onEnter, onLeave, children }) {
  const ref = useRef(null);
  const [h, setH] = useState(0);
  React.useLayoutEffect(() => {
    setH(ref.current?.offsetHeight || 0);
  }, [kind]);
  // place to the right unless it would overflow the window's right edge
  const rightFits = containerLeft + containerWidth + 1 + width <= window.innerWidth - 8;
  const left = rightFits ? containerWidth + 1 : -width - 1;
  // clamp vertically inside the window
  const topViewport = Math.max(8, Math.min(anchorTop, window.innerHeight - h - 7));
  const top = topViewport - containerTop;
  return (
    <div
      ref={ref}
      role="menu"
      className="model-flyout absolute z-50 overflow-hidden rounded-[15px] p-1"
      style={{ left, top, width }}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
    >
      {children}
    </div>
  );
}

// The reference client's chunky power slider — a thick blue pill track with
// sparkle tick dots and a big white draggable thumb.
function EffortSlider({ efforts, effLabel, onPick }) {
  const trackRef = useRef(null);
  const levels = efforts.map((e) => e.reasoningEffort).filter((e) => e !== "ultra");
  const idx = Math.max(0, levels.findIndex((e) => effortLabel(e) === effLabel));
  const powerIdx = Math.min(levels.length - 1, idx + 1);
  const frac = levels.length > 1 ? powerIdx / (levels.length - 1) : 0;

  const pickFromClientX = (clientX) => {
    const r = trackRef.current?.getBoundingClientRect();
    if (!r || levels.length < 2) return;
    const f = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    const i = Math.max(0, Math.round(f * (levels.length - 1)) - 1);
    if (i !== idx) onPick(levels[i]);
  };
  const startDrag = (e) => {
    e.preventDefault();
    pickFromClientX(e.clientX);
    const move = (ev) => pickFromClientX(ev.clientX);
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  };
  const onKey = (e) => {
    if (e.key === "ArrowLeft" && idx > 0) { e.preventDefault(); onPick(levels[idx - 1]); }
    if (e.key === "ArrowRight" && idx < levels.length - 1) { e.preventDefault(); onPick(levels[idx + 1]); }
  };

  if (!levels.length) return null;
  return (
    <div
      data-model-picker-power-slider=""
      className="absolute top-[39.7109375px] right-[6px] left-[6px] flex h-8 items-center px-1.5"
      tabIndex={0}
      onKeyDown={onKey}
    >
      <div
        ref={trackRef}
        className="relative flex h-7 flex-1 cursor-pointer items-center"
        onMouseDown={startDrag}
      >
        <div className="absolute inset-x-0 top-0.5 h-6 overflow-hidden rounded-full bg-(--surface-active) shadow-[inset_0_0_0_.5px_color-mix(in_srgb,var(--fg)_8%,transparent)]">
          <div
            className="absolute inset-y-0 left-0 rounded-l-full bg-[#0169cc]"
            style={{ width: `calc(${frac * 100}% + ${(0.5 - frac) * 26}px)` }}
          />
        </div>
        <div className="pointer-events-none absolute inset-0">
          {levels.map((lv, i) => (
            <span
              key={lv}
              className="absolute top-1/2 block size-1 -translate-x-1/2 -translate-y-1/2 rounded-full"
              style={{
                left: `calc(${levels.length > 1 ? i * 100 / (levels.length - 1) : 0}% + ${(0.5 - (levels.length > 1 ? i / (levels.length - 1) : 0)) * 26}px)`,
                background: i <= powerIdx ? "rgb(255 255 255 / .3)" : "color-mix(in srgb, var(--fg) 25%, transparent)",
              }}
            />
          ))}
        </div>
        <div
          className="pointer-events-none absolute top-1/2 size-8 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-[0_0_2px_rgba(0,0,0,.1)]"
          style={{ left: `calc(${frac * 100}% + ${(0.5 - frac) * 26}px)` }}
        />
      </div>
    </div>
  );
}

function MenuRow({ label, value, onEnter, onLeave }) {  return (
    <button
      role="menuitem"
      data-model-menu-row={label.toLowerCase()}
      className="flex w-full items-center justify-between rounded-[12.5px] px-2 py-[5px] text-left text-[13px] leading-[18.5714px] font-[445] hover:bg-(--sidebar-row-active)"
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onClick={onEnter}
    >
      <span className="text-(--fg)">{label}</span>
      <span className="flex items-center gap-3 tabular-nums text-(--fg-tertiary)">
        {value}
        <IconGoalChevron size={16} />
      </span>
    </button>
  );
}

function FlyOption({ label, desc, checked, onClick }) {
  return (
    <button role="menuitem" data-model-fly-option={label} data-checked={checked || undefined} className="flex w-full items-center gap-2 rounded-[12.5px] px-2 py-[5px] text-left text-[13px] leading-[18.5714px] font-[445] hover:bg-(--sidebar-row-active)" onClick={onClick}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-(--fg)">{label}</span>
        {desc && <span className="block truncate text-(--fg-tertiary)">{desc}</span>}
      </span>
      {checked && <IconSkillCheck size={16} className="shrink-0 text-(--fg) opacity-75" />}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Voice button: toggles a realtime conversation on a fresh thread. Streams
// mic PCM16 to thread/realtime/appendAudio; falls back with a clear toast
// when the runtime/account can't do realtime (e.g. API key auth required).
// ---------------------------------------------------------------------------
function VoiceButton() {
  const [state, setState] = useState("idle"); // idle | starting | active
  const stopRef = useRef(null);

  useEffect(() => () => stopRef.current?.(), []);

  const start = async () => {
    if (state !== "idle") {
      const fn = stopRef.current;
      stopRef.current = null;
      setState("idle");
      await fn?.();
      return;
    }
    setState("starting");
    const s = useStore.getState();
    const cwd = s.activeConversation()?.thread?.cwd || s.cwd || s.appInfo?.home || "/";
    let threadId = null;
    let stream = null;
    let audioCtx = null;
    let unsubscribe = null;
    let gotAudio = false;

    const cleanup = async () => {
      try { unsubscribe?.(); } catch {}
      try { stream?.getTracks().forEach((t) => t.stop()); } catch {}
      try { audioCtx?.close(); } catch {}
      if (threadId) api.rpc("thread/realtime/stop", { threadId }).catch(() => {});
    };

    try {
      const t = await api.rpc("thread/start", { cwd, ephemeral: true });
      threadId = t?.thread?.id;
      if (!threadId) throw new Error("could not create a voice thread");
      await api.rpc("thread/realtime/start", { threadId, outputModality: "audio", voice: "marin" });

      // mic → PCM16 mono 24kHz → appendAudio (base64)
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
      const src = audioCtx.createMediaStreamSource(stream);
      const proc = audioCtx.createScriptProcessor(4096, 1, 1);
      proc.onaudioprocess = (e) => {
        const f = e.inputBuffer.getChannelData(0);
        const pcm = new Int16Array(f.length);
        for (let i = 0; i < f.length; i++) pcm[i] = Math.max(-32768, Math.min(32767, Math.round(f[i] * 32767)));
        let bin = "";
        const bytes = new Uint8Array(pcm.buffer);
        for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192));
        api.rpc("thread/realtime/appendAudio", { threadId, audioBase64: btoa(bin) }).catch(() => {});
      };
      src.connect(proc);
      proc.connect(audioCtx.destination);

      // playback of realtime audio deltas (any realtime notification with audio)
      unsubscribe = api.onNotification(({ method, params }) => {
        if (!/realtime/i.test(method)) return;
        gotAudio = true;
        const b64 = params?.audioBase64 || params?.delta || params?.audio;
        if (typeof b64 === "string" && b64.length > 16 && audioCtx) {
          try {
            const raw = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            const pcm = new Int16Array(raw.buffer);
            const buf = audioCtx.createBuffer(1, pcm.length, 24000);
            const data = buf.getChannelData(0);
            for (let i = 0; i < pcm.length; i++) data[i] = pcm[i] / 32768;
            const node = audioCtx.createBufferSource();
            node.buffer = buf;
            node.connect(audioCtx.destination);
            node.start();
          } catch {}
        }
      });

      const cleanupFn = cleanup;
      stopRef.current = cleanupFn;
      setState("active");
      // If the backend never produces realtime events (auth unsupported), roll
      // back with a clear message instead of a dead state.
      setTimeout(() => {
        if (!gotAudio && stopRef.current === cleanupFn) {
          cleanupFn();
          setState("idle");
          useStore.getState().toast("Voice isn't available with the current sign-in (realtime requires API key auth)");
        }
      }, 6000);
    } catch (e) {
      await cleanup();
      setState("idle");
      useStore.getState().toast(`Voice failed: ${e.message}`);
    }
  };

  return (
    <button
      title={state === "active" ? "Stop voice" : "Start voice"}
      onClick={start}
      className={cx(
        "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] leading-[18px] font-[445]",
        state === "active" ? "animate-pulse text-(--danger)" : "text-(--fg-tertiary) hover:bg-(--surface-hover)"
      )}
    >
      <IconComposerMic className={cx("size-4", state === "active" ? undefined : "text-(--fg)")} />
    </button>
  );
}
