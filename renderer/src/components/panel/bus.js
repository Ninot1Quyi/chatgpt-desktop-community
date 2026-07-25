// Cross-component entry point: ask the side panel to preview a file
// (used by file chips / Edited cards / suggested-file entries).
let handler = null;

export function setFilePreviewHandler(fn) {
  handler = fn;
}

export function requestFilePreview(absPath) {
  if (handler) handler(absPath);
}
