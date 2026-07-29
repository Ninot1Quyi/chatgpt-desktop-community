// Full-screen settings window: left section nav + right content cards.
// Overlay replaces the whole app while open (not a modal); Esc or
// "Back to app" closes it.
import React, { useEffect, useMemo, useState } from "react";
import { useStore, normalizePermission, runtimeConnected, planLabel } from "@app/store.js";
import * as api from "@app/api.js";
import { cx } from "@app/lib/cx.js";
import {
  codexRateLimitSections,
  codexRateLimitWindows,
  codexRemainingPercent,
  codexResetDate,
} from "@modules/agent-runtimes";
import { basename, isPathInside } from "@app/lib/time.js";
import {
  COMMANDS,
  bindingFor,
  eventToAccel,
  isAccelerator,
} from "@modules/shortcuts";
import { fileManagerName } from "@modules/host-copy";
import { Spinner } from "@app/components/ui.jsx";
import {
  IconArchive,
  IconBranch,
  IconChevronDown,
  IconChevronLeft,
  IconFolder,
  IconGear,
  IconGlobe,
  IconMore,
  IconSearch,
  IconShield,
  IconSparkle,
  IconTrash,
  LucideIcon,
} from "@app/components/icons.jsx";
import { RUNTIMES, runtimeMeta } from "@modules/agent-runtimes";
import { SortableList } from "./SortableList.jsx";
import { Card, Row, Toggle, Dropdown, Segmented, Btn, lsGet, lsSet } from "./sections/shared.jsx";
import ProfileSection from "./sections/ProfileSection.jsx";
import AppearanceSection from "./sections/AppearanceSection.jsx";
import VoiceSection from "./sections/VoiceSection.jsx";
import ConfigurationSection from "./sections/ConfigurationSection.jsx";
import PersonalizationSection from "./sections/PersonalizationSection.jsx";
import PetsSection from "./sections/PetsSection.jsx";
import AppshotsSection from "./sections/AppshotsSection.jsx";
import PluginsSection from "./sections/PluginsSection.jsx";
import BrowserSection from "./sections/BrowserSection.jsx";
import ComputerUseSection from "./sections/ComputerUseSection.jsx";
import HooksSection from "./sections/HooksSection.jsx";
import ConnectionsSection from "./sections/ConnectionsSection.jsx";
import GitSection, { GitInstructionsSections } from "./sections/GitSection.jsx";
import EnvironmentsSection from "./sections/EnvironmentsSection.jsx";
import WorktreesSection from "./sections/WorktreesSection.jsx";


const IconUser = (p) => <LucideIcon name="UserRound" {...p} />;
const IconPalette = (p) => <LucideIcon name="Palette" {...p} />;
const IconMic = (p) => <LucideIcon name="Mic" {...p} />;
const IconSliders = (p) => <LucideIcon name="SlidersHorizontal" {...p} />;
const IconPaw = (p) => <LucideIcon name="PawPrint" {...p} />;
const IconKeyboard = (p) => <LucideIcon name="Keyboard" {...p} />;
const IconCard = (p) => <LucideIcon name="CreditCard" {...p} />;
const IconCamera = (p) => <LucideIcon name="Aperture" {...p} />;
const IconPuzzle = (p) => <LucideIcon name="Puzzle" {...p} />;
const IconMonitor = (p) => <LucideIcon name="Monitor" {...p} />;
const IconHook = (p) => <LucideIcon name="Webhook" {...p} />;
const IconPlug = (p) => <LucideIcon name="Plug" {...p} />;
const IconLayers = (p) => <LucideIcon name="Layers" {...p} />;

// ---------------------------------------------------------------------------
// Section tree (left column).
// ---------------------------------------------------------------------------
const SECTIONS = [
  {
    header: "Personal",
    items: [
      { id: "general", label: "General", icon: IconGear },
      { id: "profile", label: "Profile", icon: IconUser },
      { id: "appearance", label: "Appearance", icon: IconPalette },
      { id: "voice", label: "Voice", icon: IconMic },
      { id: "configuration", label: "Configuration", icon: IconSliders },
      { id: "personalization", label: "Personalization", icon: IconSparkle },
      { id: "pets", label: "Pets", icon: IconPaw },
      { id: "shortcuts", label: "Keyboard shortcuts", icon: IconKeyboard },
      { id: "usage", label: "Usage & billing", icon: IconCard },
      { id: "account", label: "Account", icon: IconShield },
    ],
  },
  {
    header: "Integrations",
    items: [
      { id: "appshots", label: "Appshots", icon: IconCamera },
      { id: "plugins", label: "Plugins", icon: IconPuzzle },
      { id: "browser", label: "Browser", icon: IconGlobe },
      { id: "computer", label: "Computer use", icon: IconMonitor },
    ],
  },
  {
    header: "Coding",
    items: [
      { id: "hooks", label: "Hooks", icon: IconHook },
      { id: "connections", label: "Connections", icon: IconPlug },
      { id: "git", label: "Git", icon: IconBranch },
      { id: "environments", label: "Environments", icon: IconLayers },
      { id: "worktrees", label: "Worktrees", icon: IconFolder },
    ],
  },
  {
    header: "Archived",
    items: [{ id: "archived", label: "Archived chats", icon: IconArchive }],
  },
];

// ---------------------------------------------------------------------------
// Settings window
// ---------------------------------------------------------------------------
export default function Settings() {
  const open = useStore((s) => s.ui.settingsOpen);
  const setUi = useStore((s) => s.setUi);
  const [section, setSection] = useState("general");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (open) {
      // Deep links (e.g. the Plugins page gear → Plugins section) win over the
      // default landing section.
      const wanted = useStore.getState().ui.settingsSection;
      setSection(wanted && SECTIONS.some((g) => g.items.some((it) => it.id === wanted)) ? wanted : "general");
      if (wanted) setUi({ settingsSection: null });
      setQuery("");
    }
  }, [open]);

  // Esc closes. Bubble phase on purpose: the keybinding-capture listener in
  // ShortcutsSection runs in the capture phase and stops propagation, so Esc
  // cancels a capture instead of closing the window.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setUi({ settingsOpen: false });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, setUi]);

  if (!open) return null;

  const close = () => setUi({ settingsOpen: false });
  const q = query.trim().toLowerCase();
  const groups = SECTIONS.map((g) => ({
    ...g,
    items: g.items.filter((it) => !q || it.label.toLowerCase().includes(q)),
  })).filter((g) => g.items.length > 0);
  const active = SECTIONS.flatMap((g) => g.items).find((it) => it.id === section);

  return (
    <div className="fade-in absolute inset-0 z-50 flex bg-(--surface)">
      {/* left nav column */}
      <div className="flex w-[230px] shrink-0 flex-col border-r border-(--border-light) bg-(--surface-under)">
        <div className="app-drag h-[46px] shrink-0" />
        <button
          className="mx-2 mb-1 flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] text-(--fg-secondary) hover:bg-(--surface-hover) hover:text-(--fg)"
          onClick={close}
        >
          <IconChevronLeft size={14} />
          Back to app
        </button>
        <div className="shrink-0 px-3 pb-2">
          <div className="relative">
            <IconSearch size={12} className="absolute top-1/2 left-2.5 -translate-y-1/2 text-(--fg-faint)" />
            <input
              autoFocus
              className="h-7 w-full rounded-full border border-(--border-light) bg-(--surface) pr-3 pl-7 text-[12px] outline-none placeholder:text-(--fg-faint) focus:border-(--accent)"
              placeholder="Search settings…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-4">
          {groups.map((g) => (
            <div key={g.header}>
              <div className="px-2 pt-3 pb-1 text-[11px] font-medium text-(--fg-tertiary)">{g.header}</div>
              {g.items.map((it) => (
                <button
                  key={it.id}
                  className={cx(
                    "flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[13px]",
                    section === it.id
                      ? "bg-(--surface-active) font-medium"
                      : "text-(--fg-secondary) hover:bg-(--surface-hover)"
                  )}
                  onClick={() => {
                    // Account links out to the web account page (reference behavior).
                    if (it.id === "account") {
                      api.openExternal("https://chatgpt.com/#settings");
                      return;
                    }
                    setSection(it.id);
                  }}
                >
                  <it.icon size={15} className="shrink-0 text-(--fg-tertiary)" />
                  <span className="min-w-0 flex-1">{it.label}</span>
                  {it.id === "account" && <span className="shrink-0 text-(--fg-faint)">↗</span>}
                </button>
              ))}
            </div>
          ))}
          {groups.length === 0 && (
            <div className="px-2 pt-4 text-[12px] text-(--fg-faint)">No matching settings</div>
          )}
        </nav>
      </div>

      {/* right content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="app-drag h-[46px] shrink-0" />
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[640px] px-8 pt-2 pb-16">
            <h1 className="mb-5 text-[22px] font-semibold">{active?.label}</h1>
            <SectionContent id={section} />
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionContent({ id }) {
  switch (id) {
    case "general":
      return <GeneralSection />;
    case "profile":
      return <ProfileSection />;
    case "appearance":
      return <AppearanceSection />;
    case "voice":
      return <VoiceSection />;
    case "configuration":
      return <ConfigurationSection />;
    case "personalization":
      return <PersonalizationSection />;
    case "pets":
      return <PetsSection />;
    case "shortcuts":
      return <ShortcutsSection />;
    case "usage":
      return <UsageSection />;
    case "account":
      return <AccountSection />;
    case "appshots":
      return <AppshotsSection />;
    case "plugins":
      return <PluginsSection />;
    case "browser":
      return <BrowserSection />;
    case "computer":
      return <ComputerUseSection />;
    case "hooks":
      return <HooksSection />;
    case "connections":
      return <ConnectionsSection />;
    case "git":
      return (<><GitSection /><GitInstructionsSections /></>);
    case "environments":
      return <EnvironmentsSection />;
    case "worktrees":
      return <WorktreesSection />;
    case "archived":
      return <ArchivedSection />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// General: permission presets + app prefs.
// ---------------------------------------------------------------------------
const PERMISSION_ROWS = [
  {
    id: "ask",
    title: "Default permissions",
    desc: "ChatGPT can read and edit files in its workspace, and asks for approval before running commands or accessing anything outside the workspace.",
  },
  {
    id: "approve",
    title: "Auto-review",
    desc: "ChatGPT automatically reviews requests for additional access and approves low-risk ones for you. Auto-review can make mistakes. Learn more about elevated risks.",
  },
  {
    id: "full",
    title: "Full access",
    desc: "ChatGPT gets unrestricted access to read, edit, and run commands without asking first. This significantly increases the risk of unintended changes or data loss.",
  },
];

const OPEN_DESTINATIONS = [
  { id: "editor", label: "Editor default" },
  { id: "vscode", label: "VS Code" },
  { id: "explorer", label: fileManagerName },
];

function GeneralSection() {
  const permission = useStore((s) => normalizePermission(s.permission));
  const setPermission = useStore((s) => s.setPermission);
  const bottomOpen = useStore((s) => s.ui.bottomOpen);
  const setUi = useStore((s) => s.setUi);
  const [openDest, setOpenDest] = useState(() => {
    const saved = lsGet("settings.openDestination", "editor");
    return OPEN_DESTINATIONS.some(({ id }) => id === saved) ? saved : "editor";
  });

  return (
    <>
      <Card title="Permissions">
        {PERMISSION_ROWS.map((r) => (
          <Row key={r.id} title={r.title} desc={r.desc}>
            {/* radio-like: exactly one on; clicking selects that preset */}
            <Toggle on={permission === r.id} onChange={() => setPermission(r.id)} />
          </Row>
        ))}
      </Card>
      <Card title="General">
        <Row title="Default file open destination" desc="Where files and folders open by default">
          <Dropdown
            value={openDest}
            options={OPEN_DESTINATIONS}
            onChange={(v) => {
              setOpenDest(v);
              lsSet("settings.openDestination", v);
            }}
          />
        </Row>
        <Row title="Language" desc="Language for the app UI">
          <Dropdown value="en" options={[{ id: "en", label: "English (United States)" }]} onChange={() => {}} disabled />
        </Row>
        <Row title="Bottom panel" desc="Show the bottom panel control in the app header">
          <Toggle on={bottomOpen} onChange={(v) => setUi({ bottomOpen: v })} />
        </Row>
        <Row title="Default terminal location" desc="Choose where the terminal shortcut and environment actions open terminal tabs">
          <Segmented
            value={useStore((s) => s.ui.terminalLocation) || "bottom"}
            options={[
              ["bottom", "Bottom"],
              ["right", "Right"],
            ]}
            onChange={(v) => setUi({ terminalLocation: v })}
          />
        </Row>
        <Row title="Prevent sleep while running" desc="Keep your computer awake while ChatGPT is running a task">
          <PreventSleepToggle />
        </Row>
        <Row title="Speed" desc="Choose how quickly ChatGPT runs across chats, subagents, and compaction">
          <Dropdown
            value={useStore((s) => s.serviceTier) ? "fast" : "standard"}
            options={[
              { id: "standard", label: "Standard" },
              { id: "fast", label: "Fast" },
            ]}
            onChange={(v) => useStore.getState().setServiceTier(v === "fast" ? "priority" : null)}
          />
        </Row>
        <Row title="Suggested prompts" desc="Suggest what to do next by searching project files and connected apps">
          <Toggle
            on={useStore((s) => s.ui.suggestedPrompts !== false)}
            onChange={(v) => setUi({ suggestedPrompts: v })}
          />
        </Row>
      </Card>
      <RuntimeOrderCard />
      <DiagnosticsCard />
      <Card title="Updates">
        <UpdateRow />
      </Card>
    </>
  );
}

function DiagnosticsCard() {
  const [info, setInfo] = useState(null);
  const [openError, setOpenError] = useState("");

  useEffect(() => {
    let live = true;
    api.getDiagnosticsInfo()
      .then((value) => live && setInfo(value))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const openLogs = async () => {
    setOpenError("");
    try {
      const error = await api.openDiagnosticsLogs();
      if (error) setOpenError(error);
    } catch (error) {
      setOpenError(error?.message || String(error));
    }
  };

  const buttonClass =
    "flex h-7 shrink-0 items-center rounded-full border border-(--border) px-3 text-sm hover:bg-(--surface-hover)";

  return (
    <Card title="Diagnostics">
      <Row
        title="Application logs"
        desc={openError || info?.logFile || "Startup and renderer errors are recorded automatically"}
      >
        <button className={buttonClass} onClick={openLogs}>
          Open logs folder
        </button>
      </Row>
    </Card>
  );
}

// Drag-to-reorder card for sidebar vendor sections; the row data and visuals
// come from the runtime registry, the drag behavior from SortableList.
function RuntimeOrderCard() {
  const runtimeOrder = useStore((s) => s.runtimeOrder);
  const setRuntimeOrder = useStore((s) => s.setRuntimeOrder);
  const items = runtimeOrder.map((id) => {
    const meta = runtimeMeta(id);
    return { id, label: meta?.label || id, icon: meta?.icon(14) };
  });
  return (
    <Card title="Sidebar">
      <Row title="Vendor order" desc="Drag to reorder the vendor sections in the sidebar" />
      <SortableList items={items} onChange={setRuntimeOrder} />
    </Card>
  );
}

// App update row: version + check / download progress / restart-to-update.
// Status comes from the main process (electron-updater, packaged builds only).
function UpdateRow() {
  const version = useStore((s) => s.appInfo?.version);
  const [st, setSt] = useState(null);
  useEffect(() => {
    let live = true;
    api.getUpdateStatus().then((s) => live && setSt(s)).catch(() => {});
    return api.onUpdateStatus((s) => setSt(s));
  }, []);
  const status = st?.status || "idle";
  const desc =
    status === "dev" ? "Updates are only available in packaged builds" :
    status === "disabled" ? "Updates are disabled in this portable build" :
    status === "checking" ? "Checking for updates…" :
    status === "available" ? `Version ${st.version} found, downloading…` :
    status === "downloading" ? `Downloading update — ${st.percent ?? 0}%` :
    status === "downloaded" ? `Version ${st.version} is ready to install` :
    status === "none" ? "You're up to date" :
    status === "error" ? `Update check failed: ${st.message || "unknown error"}` :
    `Current version ${version || "unknown"}`;
  const busy = status === "checking" || status === "available" || status === "downloading";
  const btnCls = "flex h-7 shrink-0 items-center rounded-full border border-(--border) px-3 text-sm hover:bg-(--surface-hover) disabled:opacity-50";
  return (
    <Row title="App updates" desc={desc}>
      {status === "downloaded" ? (
        <button className={btnCls} onClick={() => api.installUpdate()}>Restart to update</button>
      ) : (
        <button
          className={btnCls}
          disabled={busy || status === "dev" || status === "disabled"}
          onClick={() => api.checkForUpdates()}
        >
          {busy ? "Working…" : "Check for updates"}
        </button>
      )}
    </Row>
  );
}

// Prevent-sleep toggle (powerSaveBlocker in the main process).
function PreventSleepToggle() {
  const [on, setOn] = useState(() => lsGet("settings.preventSleep", false));
  return (
    <Toggle
      on={on}
      onChange={(v) => {
        setOn(v);
        lsSet("settings.preventSleep", v);
        api.togglePreventSleep?.(v);
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Keyboard shortcuts (remappable, moved unchanged from the old dialog).
// ---------------------------------------------------------------------------
function ShortcutsSection() {
  const keybindings = useStore((s) => s.ui.keybindings);
  const setKeybinding = useStore((s) => s.setKeybinding);
  const [capturing, setCapturing] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!capturing) return;
    const onKey = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key === "Escape") {
        setCapturing(null);
        return;
      }
      const accel = eventToAccel(e);
      if (accel) {
        setKeybinding(capturing, accel);
        setCapturing(null);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [capturing]);

  const q = query.trim().toLowerCase();
  const rows = COMMANDS.filter(([, label, , desc]) => !q || label.toLowerCase().includes(q) || (desc || "").toLowerCase().includes(q));

  return (
    <>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex h-8 flex-1 items-center gap-2 rounded-full border border-(--border-light) bg-(--input-bg) px-2.5">
          <IconSearch size={13} className="shrink-0 text-(--fg-faint)" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search keyboard shortcuts"
            spellCheck={false}
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-(--fg-faint)"
          />
        </div>
        <button
          className="flex h-7 shrink-0 items-center rounded-full border border-(--border) px-3 text-[13px] hover:bg-(--surface-hover)"
          onClick={() => {
            for (const [id] of COMMANDS) setKeybinding(id, null);
            useStore.getState().toast("Shortcuts reset to defaults");
          }}
        >
          Reset all to defaults
        </button>
      </div>
      <Card>
        {rows.map(([id, label, def, desc, extras]) => {
          const current = bindingFor(id, keybindings);
          const isCustom = !!keybindings[id] && isAccelerator(keybindings[id]);
          const chips = [...(current ? [current] : []), ...(extras || [])];
          return (
            <div key={id} className="flex items-center justify-between gap-4 px-4 py-2.5">
              <div className="min-w-0">
                <div className="text-[13px]">{label}</div>
                {desc && <div className="mt-0.5 text-[12px] text-(--fg-tertiary)">{desc}</div>}
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                {chips.length === 0 && !isCustom && <span className="text-[12px] text-(--fg-faint)">Unassigned</span>}
                {chips.map((chip, ci) => (
                  <button
                    key={chip + ci}
                    className={cx(
                      "rounded-md border px-1.5 py-0.5 font-mono text-xs",
                      capturing === id && ci === 0
                        ? "border-(--accent) bg-(--accent-soft) text-(--accent)"
                        : "border-(--border) bg-(--surface-hover) text-(--fg-secondary)"
                    )}
                    title={ci === 0 ? (capturing === id ? "Press new keys (Esc to cancel)" : "Click to remap") : "Default binding"}
                    onClick={() => ci === 0 && setCapturing(capturing === id ? null : id)}
                  >
                    {capturing === id && ci === 0 ? "press keys…" : chip}
                  </button>
                ))}
                {isCustom && (
                  <button
                    className="rounded px-1 text-xs text-(--fg-faint) hover:text-(--danger)"
                    title="Reset to default"
                    onClick={() => setKeybinding(id, null)}
                  >
                    ↺
                  </button>
                )}
              </div>
            </div>
          );
        })}
        {rows.length === 0 && <div className="px-4 py-3 text-[12px] text-(--fg-faint)">No matching shortcuts</div>}
      </Card>
      <div className="px-1 text-[11px] text-(--fg-faint)">
        Click a shortcut to remap it. Non-editable: Enter (send), Shift+Enter (new line), Ctrl+Shift+Space (hotkey window), Ctrl+Alt+N (quick chat).
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Usage & billing — plan, credits, weekly limits, reset credits (reference
// layout, data from account/rateLimits/read).
// ---------------------------------------------------------------------------
function UsageSection() {
  const account = useStore((s) => s.account);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [resetMsg, setResetMsg] = useState(null);
  const load = () => {
    setError(null);
    api
      .rpc("account/rateLimits/read", {})
      .then((r) => setData(r))
      .catch((e) => setError(e.message));
  };
  useEffect(() => { load(); }, []);

  const main = data?.rateLimits;
  const sections = codexRateLimitSections(data);
  const resetSummary = data?.rateLimitResetCredits;
  const resets = Array.isArray(resetSummary?.credits) ? resetSummary.credits : [];
  const resetCount = Number(resetSummary?.availableCount || 0);
  const credits = main?.credits;
  const individualLimit = main?.individualLimit;
  const plan = planLabel(main?.planType || account?.planType);
  const creditBalance = credits?.unlimited
    ? "Unlimited"
    : credits?.hasCredits
      ? credits.balance || "Available"
      : "Not available";

  const useReset = (id) => {
    setResetMsg(null);
    api
      .rpc("account/rateLimitResetCredit/consume", {
        creditId: id,
        idempotencyKey: globalThis.crypto.randomUUID(),
      })
      .then(() => { setResetMsg("Rate limits reset"); load(); })
      .catch((e) => setResetMsg(`Reset failed: ${e.message}`));
  };

  return (
    <div className="flex flex-col gap-3">
      {error && <div className="text-[13px] text-(--fg-tertiary)">Usage data is not available: {error}</div>}
      {!data && !error && (
        <div className="flex justify-center py-6 text-(--fg-tertiary)"><Spinner /></div>
      )}

      {data && (
        <>
          <Card title="Your plan">
            <Row title={plan ? `${plan} plan` : "Plan unavailable"}>
              <button className="rounded-full border border-(--border) px-3 py-1 text-xs hover:bg-(--surface-hover)" onClick={() => api.openExternal("https://chatgpt.com/pricing")}>
                View plans
              </button>
            </Row>
          </Card>

          {(credits || individualLimit || main?.spendControlReached) && (
            <Card title="Credits and spend control">
              {credits && (
                <Row
                  title="Credits balance"
                  desc={credits.unlimited
                    ? "The account reports unlimited credits."
                    : credits.hasCredits
                      ? "Current backend-reported credit balance."
                      : "No separate credit balance is available for this account."}
                >
                  <span className="text-[13px] text-(--fg-secondary)">{creditBalance}</span>
                </Row>
              )}
              {individualLimit && (
                <Row
                  title="Monthly usage limit"
                  desc={`Resets ${codexResetDate(individualLimit.resetsAt, true) || "on the next billing cycle"}`}
                >
                  <span className="text-[13px] text-(--fg-secondary)">
                    {individualLimit.used} / {individualLimit.limit} · {individualLimit.remainingPercent}% left
                  </span>
                </Row>
              )}
              {main?.spendControlReached && (
                <Row
                  title="Spend control reached"
                  desc="This account has reached its configured spending limit."
                />
              )}
            </Card>
          )}

          {sections.map((section) => {
            const windows = codexRateLimitWindows(section.snapshot);
            if (!windows.length) return null;
            return (
              <Card key={section.id} title={section.title}>
                {windows.map(({ id, label, window }) => (
                  <LimitRow
                    key={id}
                    label={label}
                    pctLeft={codexRemainingPercent(window)}
                    reset={codexResetDate(window.resetsAt, true)}
                  />
                ))}
                {section.snapshot.rateLimitReachedType && (
                  <Row
                    title="Limit reached"
                    desc={String(section.snapshot.rateLimitReachedType).replaceAll("_", " ")}
                  />
                )}
              </Card>
            );
          })}

          {resetSummary && (
            <Card title="Usage limit resets">
              <Row
                title="Available resets"
                desc={resets.length < resetCount
                  ? `${resets.length} of ${resetCount} reset details are currently available.`
                  : "Earned resets that can restore eligible usage windows."}
              >
                <span className="text-[13px] text-(--fg-secondary)">{resetCount}</span>
              </Row>
              {resets.map((credit) => (
                <Row
                  key={credit.id}
                  title={credit.title || "Full reset"}
                  desc={[
                    credit.description,
                    credit.expiresAt ? `Expires ${codexResetDate(credit.expiresAt, true)}` : "No expiry reported",
                  ].filter(Boolean).join(" · ")}
                >
                  {credit.status === "available" ? (
                    <button
                      className="rounded-full border border-(--border) px-3 py-1 text-xs hover:bg-(--surface-hover)"
                      onClick={() => useReset(credit.id)}
                    >
                      Use reset
                    </button>
                  ) : (
                    <span className="text-xs capitalize text-(--fg-tertiary)">{credit.status}</span>
                  )}
                </Row>
              ))}
              {resetMsg && <div className="px-4 pb-3 text-xs text-(--fg-tertiary)">{resetMsg}</div>}
            </Card>
          )}
        </>
      )}

      <Card title="Cancel plan">
        <Row
          title={
            <span>
              Your subscription is managed through ChatGPT.{" "}
              <button className="underline" onClick={() => api.openExternal("https://chatgpt.com/billing")}>Go to billing</button>
              {" "}to cancel your plan
            </span>
          }
        />
      </Card>
    </div>
  );
}

function LimitRow({ label, pctLeft, reset }) {
  const pct = Math.round(pctLeft);
  return (
    <div className="px-4 py-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[13px]">{label}</span>
        <span className="text-xs text-(--fg-tertiary)">
          {reset && <>Resets {reset} · </>}{pct}% left
        </span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-(--surface-active)">
        <div
          className={cx("h-full rounded-full", pct <= 15 ? "bg-(--danger)" : pct <= 40 ? "bg-(--warning)" : "bg-(--success)")}
          style={{ width: `${Math.max(2, pct)}%` }}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Account
// ---------------------------------------------------------------------------
function AccountSection() {
  const account = useStore((s) => s.account);
  const codexHome = useStore((s) => s.codexHome);
  const binary = useStore((s) => s.binary);
  const appInfo = useStore((s) => s.appInfo);

  // Keep vendor sign-in status fresh while this page is open — external
  // logins complete in a separate console window.
  useEffect(() => {
    useStore.getState().refreshExternalAuth();
    const t = setInterval(() => useStore.getState().refreshExternalAuth(), 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <>
      <Card title="Connected accounts">
        {RUNTIMES.map((meta) => <VendorAccountRow key={meta.id} meta={meta} />)}
      </Card>
      <Card title="Account">
        <Row title="Email">
          <span className="text-[13px] text-(--fg-secondary)">{account?.email || "Not signed in"}</span>
        </Row>
        <Row title="Plan">
          <span className="text-[13px] text-(--fg-secondary)">{planLabel(account?.planType) || "—"}</span>
        </Row>
      </Card>
      <Card title="Backend">
        <InfoRow label="CLI path" value={binary} />
        <InfoRow label="Codex home" value={codexHome} />
        <InfoRow label="Client" value={`ChatGPT Desktop Community v${appInfo?.version ?? "?"}`} />
        <Row title="Restart backend" desc="Restart the ChatGPT Desktop Community backend process.">
          <button
            className="rounded-lg border border-(--border) px-3 py-1.5 text-[13px] hover:bg-(--surface-hover)"
            onClick={() => api.restartAppServer()}
          >
            Restart
          </button>
        </Row>
      </Card>
    </>
  );
}

// One provider row: icon, name, connection status, Connect/Switch button.
function VendorAccountRow({ meta }) {
  const account = useStore((s) => s.account);
  const connected = useStore((s) => runtimeConnected(s, meta.id));
  const startChatgptLogin = useStore((s) => s.startChatgptLogin);
  const startExternalLogin = useStore((s) => s.startExternalLogin);
  const codex = meta.id === "codex";
  const status = codex
    ? account?.email || (connected ? "Connected" : "Not connected")
    : connected ? "Connected" : "Not connected";
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center">{meta.icon(18)}</span>
      <div className="min-w-0 flex-1">
        <div className="text-[13px]">{meta.label}</div>
        <div className="mt-0.5 truncate text-[12px] text-(--fg-tertiary)">{status}</div>
      </div>
      {connected && <LucideIcon name="Check" size={14} className="shrink-0 text-(--success)" />}
      <Btn onClick={() => (codex ? startChatgptLogin() : startExternalLogin(meta.id))}>
        {connected ? "Switch" : "Connect"}
      </Btn>
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-6 px-4 py-3">
      <span className="shrink-0 text-[13px]">{label}</span>
      <span className="min-w-0 truncate font-mono text-[12px] text-(--fg-tertiary)" title={value || ""}>
        {value || "—"}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Archived chats
// ---------------------------------------------------------------------------
function ArchivedSection() {
  const gs = useStore((s) => s.gs);
  const toast = useStore((s) => s.toast);
  const [threads, setThreads] = useState(null);
  const [query, setQuery] = useState("");
  const [project, setProject] = useState("all");
  const [busy, setBusy] = useState(false);
  const [menuFor, setMenuFor] = useState(null); // project name whose ⋯ menu is open

  // Reference behavior: the list comes from thread/list (subagent threads are
  // excluded server-side; empty titles fall back to the first-message preview).
  const load = async () => {
    const all = [];
    let cursor;
    for (let page = 0; page < 30; page++) {
      const r = await api
        .rpc("thread/list", {
          sortKey: "updated_at",
          archived: true,
          limit: 100,
          useStateDbOnly: true,
          ...(cursor ? { cursor } : {}),
        })
        .catch(() => null);
      const data = r?.data || [];
      all.push(...data);
      cursor = r?.nextCursor;
      if (!cursor || !data.length) break;
    }
    setThreads(
      all.map((t) => ({
        id: t.id,
        title: t.name || (t.preview || "").split("\n")[0].trim() || "New chat",
        updatedAtMs: (t.updatedAt || 0) * 1000,
        cwd: t.cwd || "",
      }))
    );
  };
  useEffect(() => {
    let live = true;
    load().then(() => live && void 0);
    return () => { live = false; };
  }, []);

  const projectName = (cwd) => {
    const local = gs["local-projects"] || {};
    // exact root, or nested under a project root
    for (const p of Object.values(local)) {
      for (const rp of p.rootPaths || []) {
        if (isPathInside(cwd, rp)) return p.name || basename(cwd);
      }
    }
    // codex worktrees map back to the project whose root basename matches
    const m = cwd.match(/[\\/]\.codex[\\/]worktrees[\\/](?:[^\\/]+[\\/])?([^\\/]+)$/);
    const leaf = m ? m[1] : null;
    if (leaf) {
      for (const p of Object.values(local)) {
        for (const rp of p.rootPaths || []) {
          const base = basename(rp);
          if (base && (leaf === base || leaf.startsWith(base))) return p.name || base;
        }
      }
      return leaf;
    }
    return basename(cwd) || "Other";
  };

  const q = query.trim().toLowerCase();
  const filtered = (threads || []).filter(
    (t) => (project === "all" || projectName(t.cwd) === project) && (!q || t.title.toLowerCase().includes(q))
  );
  const projects = [...new Set((threads || []).map((t) => projectName(t.cwd)))];
  const groups = [...filtered.reduce((m, t) => {
    const name = projectName(t.cwd);
    if (!m.has(name)) m.set(name, []);
    m.get(name).push(t);
    return m;
  }, new Map()).entries()];

  const deleteThreads = async (list, label) => {
    if (!window.confirm(`Delete ${list.length} archived chats permanently?`)) return;
    setBusy(true);
    for (const t of list) {
      await api.rpc("thread/delete", { threadId: t.id }).catch(() => {});
    }
    setBusy(false);
    toast(`${list.length} chats deleted`);
    setMenuFor(null);
    load();
  };

  const fmtDate = (ms) =>
    new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <>
      {/* Delete all sits on the page-title row (pulled up beside the h1) */}
      <div className="-mt-10 mb-3 flex justify-end">
        <button
          disabled={busy || filtered.length === 0}
          className="flex h-7 items-center gap-1.5 rounded-full bg-(--danger-soft) px-3 text-[13px] font-medium text-(--danger) hover:opacity-85 disabled:opacity-40"
          onClick={() => deleteThreads(filtered)}
        >
          <IconTrash size={13} />
          Delete all
        </button>
      </div>
      <div className="mb-3 flex h-8 items-center gap-2 rounded-full border border-(--border-light) bg-(--input-bg) px-2.5">
        <IconSearch size={13} className="shrink-0 text-(--fg-faint)" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search archived chats"
          spellCheck={false}
          className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-(--fg-faint)"
        />
      </div>
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-7 items-center gap-1.5 rounded-full border border-(--border) px-3 text-[13px]">
          <LucideIcon name="List" size={13} className="text-(--fg-tertiary)" />
          All chats
          <IconChevronDown size={12} className="text-(--fg-tertiary)" />
        </span>
        <span className="relative flex h-7 items-center gap-1.5 rounded-full border border-(--border) pl-3 pr-2 text-[13px]">
          <IconFolder size={13} className="text-(--fg-tertiary)" />
          <select
            value={project}
            onChange={(e) => setProject(e.target.value)}
            className="appearance-none bg-transparent pr-4 text-[13px] outline-none"
          >
            <option value="all">All projects</option>
            {projects.map((p) => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
          <IconChevronDown size={12} className="pointer-events-none absolute right-2 text-(--fg-tertiary)" />
        </span>
      </div>
      {threads === null ? (
        <div className="flex justify-center py-6 text-(--fg-tertiary)"><Spinner /></div>
      ) : groups.length === 0 ? (
        <div className="px-1 text-[13px] text-(--fg-tertiary)">No archived chats</div>
      ) : (
        groups.map(([name, list]) => (
          <div key={name} className="mb-6">
            <div className="mb-2 flex items-center justify-between px-1">
              <span className="flex items-center gap-1.5 text-[13px] font-medium text-(--fg-secondary)">
                <IconFolder size={13} className="text-(--fg-tertiary)" />
                {name}
              </span>
              <span className="relative flex items-center gap-1">
                <span className="text-[12px] text-(--fg-tertiary)">{list.length} chats</span>
                <button
                  className="flex h-5 w-5 items-center justify-center rounded-md text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--fg)"
                  onClick={() => setMenuFor(menuFor === name ? null : name)}
                >
                  <IconMore size={13} />
                </button>
                {menuFor === name && (
                  <div
                    className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-(--border) bg-(--dropdown-bg) py-1"
                    style={{ boxShadow: "var(--shadow-menu)" }}
                  >
                    <button
                      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] text-(--danger) hover:bg-(--surface-hover)"
                      onClick={() => deleteThreads(list)}
                    >
                      <IconTrash size={13} />
                      Delete all {list.length} chats
                    </button>
                  </div>
                )}
              </span>
            </div>
            <div className="divide-y divide-(--border-light) rounded-2xl border border-(--border-light) bg-(--surface-under)">
              {list.slice(0, 50).map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-4 px-4 py-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-[13px]">{t.title}</div>
                    <div className="mt-0.5 text-[11px] text-(--fg-faint)">{fmtDate(t.updatedAtMs)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      title="Delete chat"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-(--fg-tertiary) hover:bg-(--surface-hover) hover:text-(--danger)"
                      onClick={async () => {
                        await api.rpc("thread/delete", { threadId: t.id }).catch(() => {});
                        toast("Chat deleted");
                        load();
                      }}
                    >
                      <IconTrash size={13} />
                    </button>
                    <button
                      className="rounded-lg border border-(--border) px-2.5 py-1 text-[12px] hover:bg-(--surface-hover)"
                      onClick={async () => {
                        await api.rpc("thread/unarchive", { threadId: t.id }).catch(() => {});
                        useStore.getState().loadThreads();
                        load();
                      }}
                    >
                      Unarchive
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </>
  );
}
