import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const conversationSource = fs.readFileSync(
  new URL("../modules/conversations/renderer/Conversation.jsx", import.meta.url),
  "utf8",
);
const composerSource = fs.readFileSync(
  new URL("../modules/conversations/renderer/Composer.jsx", import.meta.url),
  "utf8",
);

test("the sticky conversation footer masks messages below the composer", () => {
  assert.match(
    conversationSource,
    /className="relative sticky bottom-0 z-10 mt-auto w-full shrink-0 bg-\(--surface\)"/,
  );
});

test("scroll-to-bottom is anchored above the dynamic conversation footer", () => {
  assert.match(conversationSource, /onScrollToBottom=\{!stickBottom \? scrollToBottom : null\}/);
  assert.match(conversationSource, /aria-label="Scroll to bottom"/);
  assert.match(conversationSource, /className="absolute -top-10 left-1\/2/);
  assert.doesNotMatch(conversationSource, /className="absolute bottom-4 left-1\/2/);
});

test("the regular composer keeps the native sixteen-pixel bottom inset", () => {
  assert.match(
    composerSource,
    /centered \? "w-full" : "px-4 pb-4"/,
  );
});
