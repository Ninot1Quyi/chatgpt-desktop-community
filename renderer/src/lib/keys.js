// Windows keybinding storage/matching. Accelerators use Electron-style
// names joined with "+", for example "Ctrl+B", "Ctrl+Alt+B", and "Ctrl+,".
// [id, label, defaultAccel, description, extraDefaultAccels?]
export const COMMANDS = [
  ["newChat", "New chat", "Ctrl+N", "Start a new chat", ["Ctrl+Shift+O"]],
  ["newStandaloneChat", "New standalone chat", "Ctrl+Alt+O", "Start a new chat outside of any project"],
  ["quickChat", "Quick chat", "Ctrl+Alt+N", "Start a lightweight chat in the quick composer"],
  ["archiveChat", "Archive chat", "Ctrl+Shift+A", "Archive the current chat"],
  ["openInNewWindow", "Open in new window", "", "Open the current chat in a new window"],
  ["renameChat", "Rename chat", "Ctrl+R", "Rename the current chat"],
  ["togglePin", "Toggle pin", "Ctrl+Alt+P", "Pin or unpin the current chat"],
  ["openSideChatTab", "Open side chat", "Ctrl+Alt+S", "Open the current chat in a side chat"],
  ["focusBrowserAddress", "Focus browser address bar", "Ctrl+L", "Focus the in-app browser address bar"],
  ["nextRecentChat", "Next recently viewed chat", "Ctrl+Tab", "Cycle to the next recently viewed chat"],
  ["nextTab", "Next tab", "Ctrl+Tab", "Switch to the next tab", ["Ctrl+Shift+]", "Ctrl+Alt+Right"]],
  ["commandMenu", "Command menu", "Ctrl+K", "Open the command menu"],
  ["toggleSidebar", "Toggle sidebar", "Ctrl+B", "Show or hide the sidebar"],
  ["toggleSidePanel", "Toggle side panel", "Ctrl+Alt+B", "Show or hide the side panel"],
  ["toggleBottomPanel", "Toggle bottom panel", "Ctrl+J", "Show or hide the bottom panel"],
  ["findInThread", "Find in chat", "Ctrl+F", "Search within the current chat"],
  ["closeWindow", "Close window", "Ctrl+W", "Close the current window"],
  ["settings", "Settings", "Ctrl+,", "Open settings"],
  ["openFilesTab", "Open Files tab", "Ctrl+P", "Open the Files tab"],
  ["openBrowserTab", "Open Browser tab", "Ctrl+T", "Open the Browser tab"],
  ["openReviewTab", "Open Review tab", "Ctrl+Shift+G", "Open the Review tab"],
];

const MODS = [
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
  if ([...modifiers].some((modifier) => !MODS.some(([name]) => name === modifier))) return null;
  return { key, modifiers };
}

export function isWindowsAccelerator(accel) {
  return accel === "" || !!parseAccel(accel);
}

function storedBinding(commandId, overrides) {
  const value = overrides?.[commandId];
  return parseAccel(value) ? value : null;
}

// Every accelerator bound to a command (default extras included).
export function bindingsFor(commandId, overrides) {
  const def = COMMANDS.find((c) => c[0] === commandId);
  const primary = storedBinding(commandId, overrides) ?? def?.[2] ?? null;
  return [...(primary ? [primary] : []), ...(def?.[4] || [])];
}

function eventKey(e) {
  const physical = {
    Backquote: "`",
    Minus: "-",
    Equal: "=",
    BracketLeft: "[",
    BracketRight: "]",
    Backslash: "\\",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
  }[e.code];
  if (physical) return physical;
  let key = e.key;
  if (key === " ") key = "Space";
  else if (key === "Escape") key = "Esc";
  else if (key.startsWith("Arrow")) key = key.slice("Arrow".length);
  else if (key.length === 1) key = key.toUpperCase();
  return key;
}

// Event → Windows accelerator string ("Ctrl+Shift+K").
export function eventToAccel(e) {
  const modifiers = MODS.filter(([, prop]) => e[prop]).map(([name]) => name);
  if (!modifiers.length) return null;
  return [...modifiers, eventKey(e)].join("+");
}

// Does the event match the accelerator?
export function matchAccel(e, accel) {
  const parsed = parseAccel(accel);
  if (!parsed) return false;
  for (const [name, prop] of MODS) {
    if (parsed.modifiers.has(name) !== !!e[prop]) return false;
  }
  return eventKey(e) === parsed.key;
}

export function bindingFor(commandId, overrides) {
  const def = COMMANDS.find((c) => c[0] === commandId);
  return storedBinding(commandId, overrides) ?? def?.[2] ?? null;
}
