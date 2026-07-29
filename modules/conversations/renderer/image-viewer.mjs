export const IMAGE_VIEWER_MIN_ZOOM = 0.5;
export const IMAGE_VIEWER_MAX_ZOOM = 3;
export const IMAGE_VIEWER_ZOOM_STEP = 0.25;

export function imageViewerZoom(current, direction) {
  const delta = direction === "in" ? IMAGE_VIEWER_ZOOM_STEP : -IMAGE_VIEWER_ZOOM_STEP;
  return clampZoom(current + delta);
}

export function clampZoom(value) {
  const numeric = Number.isFinite(value) ? value : 1;
  return Math.min(
    IMAGE_VIEWER_MAX_ZOOM,
    Math.max(IMAGE_VIEWER_MIN_ZOOM, Math.round(numeric * 100) / 100),
  );
}

export function imageSourceForContent(content, localFileUrl) {
  if (!content) return "";
  if ((content.type === "localImage" || content.path) && content.path) {
    return localFileUrl(content.path);
  }
  return content.url || content.imageUrl || "";
}

export function imageAltForContent(content, fallback = "Image") {
  return content?.alt || content?.name || content?.path || fallback;
}
