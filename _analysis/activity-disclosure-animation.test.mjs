import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(
  new URL("../renderer/src/components/ui.jsx", import.meta.url),
  "utf8",
);

test("the first disclosure expansion uses the same transition as later toggles", () => {
  assert.doesNotMatch(source, /firstRender/);
  assert.match(source, /height \$\{duration\}ms \$\{easing\}, opacity \$\{duration\}ms \$\{easing\}/);
  assert.match(source, /element\.style\.height = "0rem";\s+element\.style\.opacity = "0";/);
  assert.match(source, /element\.style\.height = `\$\{element\.scrollHeight\}px`;/);
});
