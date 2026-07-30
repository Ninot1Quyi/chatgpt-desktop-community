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

test("the conversation footer is outside the message scroll container", () => {
  assert.match(conversationSource, /className="relative flex min-h-0 flex-1 flex-col"/);
  assert.match(conversationSource, /ref=\{ref\} onScroll=\{onScroll\} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto"/);

  const scrollContainerStart = conversationSource.indexOf(
    '<div ref={ref} onScroll={onScroll} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">',
  );
  const bottomAreaStart = conversationSource.indexOf(
    "<BottomArea",
    scrollContainerStart,
  );
  const findBarStart = conversationSource.indexOf(
    "{useStore((s) => s.ui.findOpen) && <FindBar conv={conv} />}",
    scrollContainerStart,
  );

  assert.notEqual(scrollContainerStart, -1);
  assert.notEqual(bottomAreaStart, -1);
  assert.notEqual(findBarStart, -1);
  assert.ok(bottomAreaStart > scrollContainerStart);
  assert.ok(bottomAreaStart < findBarStart);

  const scrollContainerSource = conversationSource.slice(scrollContainerStart, bottomAreaStart);
  assert.doesNotMatch(scrollContainerSource, /<BottomArea/);
});

test("the conversation footer is a non-sticky flex sibling below messages", () => {
  assert.match(
    conversationSource,
    /className="relative z-10 w-full shrink-0 bg-\(--surface\)"/,
  );
  assert.doesNotMatch(
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
