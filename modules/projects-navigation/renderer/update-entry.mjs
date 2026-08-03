const VISIBLE_UPDATE_STATUSES = new Set([
  "available",
  "downloading",
  "downloaded",
]);

export function shouldShowUpdateEntry(updateStatus) {
  return VISIBLE_UPDATE_STATUSES.has(updateStatus?.status);
}
