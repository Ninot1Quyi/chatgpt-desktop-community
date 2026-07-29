import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  IMAGE_VIEWER_MAX_ZOOM,
  IMAGE_VIEWER_MIN_ZOOM,
  imageAltForContent,
  imageSourceForContent,
  imageViewerZoom,
} from "../modules/conversations/renderer/image-viewer.mjs";

const itemsSource = fs.readFileSync(
  new URL("../modules/conversations/renderer/items.jsx", import.meta.url),
  "utf8",
);

test("image viewer resolves local images through the codex-file allowlist helper", () => {
  const src = imageSourceForContent(
    { type: "localImage", path: "/tmp/example image.png" },
    (path) => `codex-file://local/${encodeURIComponent(path)}`,
  );
  assert.equal(src, "codex-file://local/%2Ftmp%2Fexample%20image.png");
});

test("image viewer keeps remote image URLs remote without inventing file access", () => {
  assert.equal(
    imageSourceForContent({ type: "image", url: "https://example.com/a.png" }, () => {
      throw new Error("localFileUrl should not be used for remote images");
    }),
    "https://example.com/a.png",
  );
});

test("image viewer zoom is clamped and steps consistently", () => {
  assert.equal(imageViewerZoom(1, "in"), 1.25);
  assert.equal(imageViewerZoom(1, "out"), 0.75);
  assert.equal(imageViewerZoom(IMAGE_VIEWER_MAX_ZOOM, "in"), IMAGE_VIEWER_MAX_ZOOM);
  assert.equal(imageViewerZoom(IMAGE_VIEWER_MIN_ZOOM, "out"), IMAGE_VIEWER_MIN_ZOOM);
});

test("image viewer alt text prefers explicit labels before file paths", () => {
  assert.equal(imageAltForContent({ alt: "Screenshot" }, "Fallback"), "Screenshot");
  assert.equal(imageAltForContent({ path: "/tmp/a.png" }, "Fallback"), "/tmp/a.png");
  assert.equal(imageAltForContent(null, "Fallback"), "Fallback");
});

test("conversation image renderer exposes accessible preview controls", () => {
  assert.match(itemsSource, /data-image-viewer/);
  assert.match(itemsSource, /role="dialog"/);
  assert.match(itemsSource, /aria-modal="true"/);
  assert.match(itemsSource, /event\.key === "Escape"/);
  assert.match(itemsSource, /event\.target === event\.currentTarget/);
  assert.match(itemsSource, /aria-label="Zoom in"/);
  assert.match(itemsSource, /aria-label="Close image preview"/);
});

test("generated images keep reveal-in-file-manager separate from preview open", () => {
  assert.match(itemsSource, /onOpen=\{\(\) => setViewerImage\(\{ src, alt \}\)\}/);
  assert.match(itemsSource, /showItemInFolder\(item\.savedPath\)/);
  assert.match(itemsSource, /aria-label=\{revealInFileManager\}/);
});
