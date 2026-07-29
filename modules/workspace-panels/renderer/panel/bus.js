// Cross-component entry point: ask the side panel to preview a file
// (used by file chips / Edited cards / suggested-file entries).
let handler = null;

export function setFilePreviewHandler(fn) {
  handler = fn;
}

export function requestFilePreview(absPath) {
  if (handler) handler(absPath);
}

const SEARCH_URL = "https://www.google.com/search?q=";

export function normalizeBrowserUrl(raw) {
  const value = String(raw || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  if (/^[a-z][a-z0-9+.-]*:/i.test(value)) return "";
  if (value.includes(".") && !/\s/.test(value)) return `https://${value}`;
  return `${SEARCH_URL}${encodeURIComponent(value)}`;
}

export function browserStateFromWebview(webview) {
  if (!webview) {
    return {
      url: "",
      canBack: false,
      canForward: false,
    };
  }
  return {
    url: String(webview.getURL?.() || ""),
    canBack: !!webview.canGoBack?.(),
    canForward: !!webview.canGoForward?.(),
  };
}

export function appendBoundedTerminalBuffer(buffer, delta, limit = 200000) {
  if (!delta) return buffer;
  const next = `${buffer || ""}${delta}`;
  return next.length > limit ? next.slice(-limit) : next;
}

export function terminalExecParams({
  command,
  cwd,
  processId,
  size,
}) {
  return {
    command,
    cwd: cwd || undefined,
    env: { TERM: "xterm-256color" },
    tty: true,
    processId,
    streamStdin: true,
    streamStdoutStderr: true,
    disableTimeout: true,
    size,
  };
}

export function terminalResizeParams(processId, size) {
  return { processId, size };
}

export function terminalWriteParams(processId, deltaBase64) {
  return { processId, deltaBase64 };
}
