export const PANEL_ACTION_ORDER = Object.freeze([
  "review",
  "terminal",
  "browser",
  "files",
  "sidechat",
]);

export const PANEL_ACTION_COMMANDS = Object.freeze({
  review: "openReviewTab",
  terminal: null,
  browser: "openBrowserTab",
  files: "openFilesTab",
  sidechat: "openSideChatTab",
});

export function emptyPanelActionOrder({
  mode = "codex",
  runtime = "codex",
  hasActiveThread = false,
  hasGit = false,
} = {}) {
  if (mode === "chatgpt") {
    return ["sidechat", "browser", "terminal"];
  }
  return PANEL_ACTION_ORDER.filter((kind) =>
    panelActionAvailable(kind, { runtime, hasActiveThread, hasGit }));
}

export function panelActionAvailable(
  kind,
  {
    runtime = "codex",
    hasActiveThread = false,
    hasGit = false,
  } = {},
) {
  if (kind === "review") return runtime === "kimi" || hasGit;
  if (kind === "sidechat") return hasActiveThread;
  return true;
}
