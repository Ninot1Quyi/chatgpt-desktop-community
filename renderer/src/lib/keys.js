// Keybinding storage/matching. Accelerator format: "⌘⇧K" style tokens
// joined without separators, e.g. "⌘B", "⌘⌥B", "⌘,", "⌘[", "↵".
// [id, label, defaultAccel, description, extraDefaultAccels?]
export const COMMANDS = [
  ["newChat", "New chat", "⌘N", "Start a new chat", ["⇧⌘O"]],
  ["newStandaloneChat", "New standalone chat", "⌥⌘O", "Start a new chat outside of any project"],
  ["quickChat", "Quick chat", "⌥⌘N", "Start a lightweight chat in the quick composer"],
  ["archiveChat", "Archive chat", "⇧⌘A", "Archive the current chat"],
  ["openInNewWindow", "Open in new window", "", "Open the current chat in a new window"],
  ["renameChat", "Rename chat", "⌃R", "Rename the current chat"],
  ["togglePin", "Toggle pin", "⌥⌘P", "Pin or unpin the current chat"],
  ["openSideChatTab", "Open side chat", "⌥⌘S", "Open the current chat in a side chat"],
  ["focusBrowserAddress", "Focus browser address bar", "⌘L", "Focus the in-app browser address bar"],
  ["back", "Back", "⌘[", "Go back in navigation history", ["Mouse Back"]],
  ["forward", "Forward", "⌘]", "Go forward in navigation history", ["Mouse Forward"]],
  ["nextRecentChat", "Next recently viewed chat", "⌃Tab", "Cycle to the next recently viewed chat"],
  ["nextTab", "Next tab", "⌃Tab", "Switch to the next tab", ["⇧⌘]", "⌥⌘Right"]],
  ["commandMenu", "Command menu", "⌘K", "Open the command menu"],
  ["toggleSidebar", "Toggle sidebar", "⌘B", "Show or hide the sidebar"],
  ["toggleSidePanel", "Toggle side panel", "⌘⌥B", "Show or hide the side panel"],
  ["toggleBottomPanel", "Toggle bottom panel", "⌘J", "Show or hide the bottom panel"],
  ["findInThread", "Find in chat", "⌘F", "Search within the current chat"],
  ["closeWindow", "Close window", "⌘W", "Close the current window"],
  ["settings", "Settings", "⌘,", "Open settings"],
  ["openFilesTab", "Open Files tab", "⌘P", "Open the Files tab"],
  ["openBrowserTab", "Open Browser tab", "⌘T", "Open the Browser tab"],
  ["openReviewTab", "Open Review tab", "⌃⇧G", "Open the Review tab"],
];

// Every accelerator bound to a command (default extras included).
export function bindingsFor(commandId, overrides) {
  const def = COMMANDS.find((c) => c[0] === commandId);
  const primary = overrides?.[commandId] ?? def?.[2] ?? null;
  return [...(primary ? [primary] : []), ...(def?.[4] || [])];
}

const IS_MAC = /Mac/.test(globalThis.navigator?.platform || "");
const MODS = IS_MAC
  ? [["⌘", "metaKey"], ["⌃", "ctrlKey"], ["⌥", "altKey"], ["⇧", "shiftKey"]]
  : [["⌘", "ctrlKey"], ["⌥", "altKey"], ["⇧", "shiftKey"]];

// Windows has one Ctrl modifier; macOS keeps Command and Control distinct.
const normalizeAccel = (accel) => (!IS_MAC && accel ? accel.replaceAll("⌃", "⌘") : accel);

// Event → accelerator string ("⌘⇧K").
export function eventToAccel(e) {
  let out = "";
  for (const [sym, prop] of MODS) if (e[prop]) out += sym;
  if (!out) return null; // require at least one modifier
  let k = e.key;
  if (k === " ") k = "Space";
  else if (k === "Enter") k = "↵";
  else if (k === "Escape") k = "Esc";
  else if (k.startsWith("Arrow")) k = { ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→" }[k];
  else if (k.length === 1) k = k.toUpperCase();
  out += k;
  return out;
}

// Does the event match the accelerator?
export function matchAccel(e, accel) {
  if (!accel) return false;
  const want = new Set([...normalizeAccel(accel)].filter((c) => (IS_MAC ? "⌘⌃⌥⇧" : "⌘⌥⇧").includes(c)));
  for (const [sym, prop] of MODS) {
    if (want.has(sym) !== !!e[prop]) return false;
  }
  const keyPart = normalizeAccel(accel).replace(IS_MAC ? /[⌘⌃⌥⇧]/g : /[⌘⌥⇧]/g, "");
  let k = e.key;
  if (k === " ") k = "Space";
  else if (k === "Enter") k = "↵";
  else if (k.length === 1) k = k.toUpperCase();
  return k === keyPart || e.key === keyPart;
}

export function bindingFor(commandId, overrides) {
  const def = COMMANDS.find((c) => c[0] === commandId);
  return overrides?.[commandId] ?? def?.[2] ?? null;
}
