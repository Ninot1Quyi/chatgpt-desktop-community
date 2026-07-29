import { commandsWithBindings, eventKey } from "../../shared/commands.mjs";

const DEFAULTS = {
  newChat: { primary: "Ctrl+N", extras: ["Ctrl+Shift+O"] },
  newStandaloneChat: { primary: "Ctrl+Alt+O" },
  quickChat: { primary: "Ctrl+Alt+N" },
  archiveChat: { primary: "Ctrl+Shift+A" },
  renameChat: { primary: "Ctrl+R" },
  togglePin: { primary: "Ctrl+Alt+P" },
  openSideChatTab: { primary: "Ctrl+Alt+S" },
  focusBrowserAddress: { primary: "Ctrl+L" },
  back: { primary: "Ctrl+[" },
  forward: { primary: "Ctrl+]" },
  nextRecentChat: { primary: "Ctrl+Tab" },
  nextTab: { primary: "Ctrl+Tab", extras: ["Ctrl+Shift+]", "Ctrl+Alt+Right"] },
  commandMenu: { primary: "Ctrl+K" },
  toggleSidebar: { primary: "Ctrl+B" },
  toggleSidePanel: { primary: "Ctrl+Alt+B" },
  toggleBottomPanel: { primary: "Ctrl+J" },
  findInThread: { primary: "Ctrl+F" },
  closeWindow: { primary: "Ctrl+W" },
  settings: { primary: "Ctrl+," },
  openFilesTab: { primary: "Ctrl+P" },
  openBrowserTab: { primary: "Ctrl+T" },
  openReviewTab: { primary: "Ctrl+Shift+G" },
};

export const COMMANDS = commandsWithBindings(DEFAULTS);

const MODIFIERS = [
  ["Ctrl", "ctrlKey"],
  ["Alt", "altKey"],
  ["Shift", "shiftKey"],
];

function parseAccel(accel) {
  const parts = String(accel || "").split("+").filter(Boolean);
  if (parts.length < 2) return null;
  const key = parts.pop();
  const modifiers = new Set(parts);
  if (!key || modifiers.size !== parts.length) return null;
  if ([...modifiers].some((modifier) => !MODIFIERS.some(([name]) => name === modifier))) {
    return null;
  }
  return { key, modifiers };
}

export function isAccelerator(accel) {
  return accel === "" || !!parseAccel(accel);
}

function storedBinding(commandId, overrides) {
  const value = overrides?.[commandId];
  return parseAccel(value) ? value : null;
}

export function bindingsFor(commandId, overrides) {
  const definition = COMMANDS.find((command) => command[0] === commandId);
  const primary = storedBinding(commandId, overrides) ?? definition?.[2] ?? null;
  return [...(primary ? [primary] : []), ...(definition?.[4] || [])];
}

export function eventToAccel(e) {
  const modifiers = MODIFIERS
    .filter(([, property]) => e[property])
    .map(([name]) => name);
  if (!modifiers.length) return null;
  return [...modifiers, eventKey(e)].join("+");
}

export function matchAccel(e, accel) {
  const parsed = parseAccel(accel);
  if (!parsed) return false;
  for (const [name, property] of MODIFIERS) {
    if (parsed.modifiers.has(name) !== !!e[property]) return false;
  }
  return eventKey(e) === parsed.key;
}

export function bindingFor(commandId, overrides) {
  const definition = COMMANDS.find((command) => command[0] === commandId);
  return storedBinding(commandId, overrides) ?? definition?.[2] ?? null;
}
