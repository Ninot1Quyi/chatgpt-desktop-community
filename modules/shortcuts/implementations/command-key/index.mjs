import { commandsWithBindings, eventKey } from "../../shared/commands.mjs";

const DEFAULTS = {
  newChat: { primary: "⌘N", extras: ["⇧⌘O"] },
  newStandaloneChat: { primary: "⌥⌘O" },
  quickChat: { primary: "⌥⌘N" },
  archiveChat: { primary: "⇧⌘A" },
  renameChat: { primary: "⌃R" },
  togglePin: { primary: "⌥⌘P" },
  openSideChatTab: { primary: "⌥⌘S" },
  focusBrowserAddress: { primary: "⌘L" },
  back: { primary: "⌘[", extras: ["Mouse Back"] },
  forward: { primary: "⌘]", extras: ["Mouse Forward"] },
  nextRecentChat: { primary: "⌃Tab" },
  nextTab: { primary: "⌃Tab", extras: ["⇧⌘]", "⌥⌘Right"] },
  commandMenu: { primary: "⌘K" },
  toggleSidebar: { primary: "⌘B" },
  toggleSidePanel: { primary: "⌘⌥B" },
  toggleBottomPanel: { primary: "⌘J" },
  findInThread: { primary: "⌘F" },
  closeWindow: { primary: "⌘W" },
  settings: { primary: "⌘," },
  openFilesTab: { primary: "⌘P" },
  openBrowserTab: { primary: "⌘T" },
  openReviewTab: { primary: "⌃⇧G" },
};

export const COMMANDS = commandsWithBindings(DEFAULTS);

const MODIFIERS = [
  ["⌘", "metaKey"],
  ["⌃", "ctrlKey"],
  ["⌥", "altKey"],
  ["⇧", "shiftKey"],
];

function normalizeAccel(accel) {
  let value = String(accel || "");
  if (value.includes("+")) {
    const parts = value.split("+").filter(Boolean);
    const key = parts.pop() || "";
    const symbols = parts.map((part) => ({
      Ctrl: "⌘",
      Control: "⌘",
      Alt: "⌥",
      Option: "⌥",
      Shift: "⇧",
      Command: "⌘",
      Cmd: "⌘",
    })[part] || part).join("");
    value = `${symbols}${key}`;
  }
  return value
    .replace(/Arrow(Up|Down|Left|Right)$/, "$1")
    .replace(/([↑↓←→])$/, (arrow) => ({
      "↑": "Up",
      "↓": "Down",
      "←": "Left",
      "→": "Right",
    })[arrow]);
}

function parseAccel(accel) {
  const normalized = normalizeAccel(accel);
  if (!normalized) return null;
  const modifiers = new Set([...normalized].filter((token) => "⌘⌃⌥⇧".includes(token)));
  const key = normalized.replace(/[⌘⌃⌥⇧]/g, "");
  if (!key || modifiers.size === 0) return null;
  return { key, modifiers };
}

export function isAccelerator(accel) {
  return accel === "" || !!parseAccel(accel);
}

function storedBinding(commandId, overrides) {
  const value = overrides?.[commandId];
  return parseAccel(value) ? normalizeAccel(value) : null;
}

export function bindingsFor(commandId, overrides) {
  const definition = COMMANDS.find((command) => command[0] === commandId);
  const primary = storedBinding(commandId, overrides) ?? definition?.[2] ?? null;
  return [...(primary ? [primary] : []), ...(definition?.[4] || [])];
}

export function eventToAccel(e) {
  let output = "";
  for (const [symbol, property] of MODIFIERS) {
    if (e[property]) output += symbol;
  }
  if (!output) return null;
  return `${output}${eventKey(e)}`;
}

export function matchAccel(e, accel) {
  const parsed = parseAccel(accel);
  if (!parsed) return false;
  for (const [symbol, property] of MODIFIERS) {
    if (parsed.modifiers.has(symbol) !== !!e[property]) return false;
  }
  return eventKey(e) === parsed.key || e.key === parsed.key;
}

export function bindingFor(commandId, overrides) {
  const definition = COMMANDS.find((command) => command[0] === commandId);
  return storedBinding(commandId, overrides) ?? definition?.[2] ?? null;
}
