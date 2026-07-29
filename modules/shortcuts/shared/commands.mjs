export const COMMAND_DEFINITIONS = [
  ["newChat", "New chat", "Start a new chat"],
  ["newStandaloneChat", "New standalone chat", "Start a new chat outside of any project"],
  ["quickChat", "Quick chat", "Start a lightweight chat in the quick composer"],
  ["archiveChat", "Archive chat", "Archive the current chat"],
  ["openInNewWindow", "Open in new window", "Open the current chat in a new window"],
  ["renameChat", "Rename chat", "Rename the current chat"],
  ["togglePin", "Toggle pin", "Pin or unpin the current chat"],
  ["openSideChatTab", "Open side chat", "Open the current chat in a side chat"],
  ["focusBrowserAddress", "Focus browser address bar", "Focus the in-app browser address bar"],
  ["back", "Back", "Go back in navigation history"],
  ["forward", "Forward", "Go forward in navigation history"],
  ["nextRecentChat", "Next recently viewed chat", "Cycle to the next recently viewed chat"],
  ["nextTab", "Next tab", "Switch to the next tab"],
  ["commandMenu", "Command menu", "Open the command menu"],
  ["toggleSidebar", "Toggle sidebar", "Show or hide the sidebar"],
  ["toggleSidePanel", "Toggle side panel", "Show or hide the side panel"],
  ["toggleBottomPanel", "Toggle bottom panel", "Show or hide the bottom panel"],
  ["findInThread", "Find in chat", "Search within the current chat"],
  ["closeWindow", "Close window", "Close the current window"],
  ["settings", "Settings", "Open settings"],
  ["openFilesTab", "Open Files tab", "Open the Files tab"],
  ["openBrowserTab", "Open Browser tab", "Open the Browser tab"],
  ["openReviewTab", "Open Review tab", "Open the Review tab"],
];

export function commandsWithBindings(bindings) {
  return COMMAND_DEFINITIONS.map(([id, label, description]) => {
    const binding = bindings[id] || {};
    return [id, label, binding.primary || "", description, binding.extras || []];
  });
}

export function eventKey(e) {
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
  else if (key === "Enter") key = "↵";
  else if (key === "Escape") key = "Esc";
  else if (key.startsWith("Arrow")) key = key.slice("Arrow".length);
  else if (key.length === 1) key = key.toUpperCase();
  return key;
}
