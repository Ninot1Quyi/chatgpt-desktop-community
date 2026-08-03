import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoots = ["renderer", "modules"].map((directory) =>
  path.join(repoRoot, directory));
const sourceExtensions = new Set([".css", ".html", ".js", ".jsx", ".mjs"]);
const excluded = new Set([
  path.join(repoRoot, "renderer/src/components/lucide/nodes.js"),
]);

function sources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sources(target);
    return sourceExtensions.has(path.extname(entry.name)) && !excluded.has(target)
      ? [target]
      : [];
  });
}

test("renderer layout source uses scalable CSS lengths", () => {
  const failures = [];
  for (const file of sourceRoots.flatMap(sources)) {
    const source = fs.readFileSync(file, "utf8");
    const fixedPixel = source.match(/-?(?:\d*\.)?\d+px\b/);
    const pixelUtility = source.match(
      /\b(?:w|h|gap|p[trblxy]?|m[trblxy]?)-px\b/,
    );
    if (fixedPixel || pixelUtility) {
      failures.push(
        `${path.relative(repoRoot, file)}: ${fixedPixel?.[0] || pixelUtility?.[0]}`,
      );
    }
  }
  assert.deepEqual(failures, []);
});

test("panel resizing keeps drag interaction without per-move store writes", () => {
  const parts = fs.readFileSync(
    path.join(repoRoot, "modules/desktop-shell/shared/parts.jsx"),
    "utf8",
  );
  const files = fs.readFileSync(
    path.join(repoRoot, "modules/workspace-panels/renderer/panel/FilesTab.jsx"),
    "utf8",
  );
  const store = fs.readFileSync(
    path.join(repoRoot, "renderer/src/store.js"),
    "utf8",
  );

  assert.match(parts, /export function DragHandle/);
  assert.match(parts, /window\.requestAnimationFrame\(flush\)/);
  assert.match(parts, /style\.setProperty\("--right-panel-size"/);
  assert.match(parts, /style\.setProperty\("--sidebar-size"/);
  assert.match(parts, /onEnd=\{\(delta\) => \{/);
  assert.match(files, /"--file-tree-size"/);
  assert.match(files, /window\.requestAnimationFrame\(flush\)/);
  assert.match(store, /sidebarRatio: storedSidebarRatio\(\)/);
  assert.doesNotMatch(store, /sidebarWidth:/);
  assert.doesNotMatch(files, /setTreeWidth/);
});

test("CSS unit helpers preserve the design grid", async () => {
  const source = fs.readFileSync(
    path.join(repoRoot, "renderer/src/lib/cssUnits.js"),
    "utf8",
  );
  const helpers = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
  assert.equal(helpers.rem(16), "1rem");
  assert.equal(helpers.rem(2), "0.125rem");
  assert.equal(helpers.rem(-8), "-0.5rem");
  assert.equal(helpers.cssPixelsToRem(32), "2rem");
});
