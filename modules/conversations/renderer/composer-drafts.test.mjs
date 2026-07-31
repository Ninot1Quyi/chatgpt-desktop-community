import assert from "node:assert/strict";
import test from "node:test";

import {
  COMPOSER_DRAFT_STORAGE_PREFIX,
  composerDraftKey,
  composerDraftStorageKey,
  deleteComposerDraft,
  emptyComposerDraft,
  normalizeComposerDraft,
  readComposerDraft,
  writeComposerDraft,
} from "./composer-drafts.mjs";

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    values,
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, value);
    },
    removeItem(key) {
      values.delete(key);
    },
  };
}

test("isolates historical and new-chat draft keys", () => {
  assert.equal(
    composerDraftKey("thread/one", 100, "/project/a"),
    composerDraftKey("thread/one", 200, "/project/b"),
  );
  assert.notEqual(
    composerDraftKey("thread/one", 100, "/project/a"),
    composerDraftKey("thread/two", 100, "/project/a"),
  );
  assert.notEqual(
    composerDraftKey(null, 100, "/project/a"),
    composerDraftKey(null, 200, "/project/a"),
  );
  assert.notEqual(
    composerDraftKey(null, 100, "/project/a"),
    composerDraftKey(null, 100, "/project/b"),
  );
  assert.equal(
    composerDraftStorageKey("thread:abc"),
    `${COMPOSER_DRAFT_STORAGE_PREFIX}thread:abc`,
  );
});

test("normalizes draft fields and mention shapes", () => {
  assert.deepEqual(normalizeComposerDraft({
    text: "Continue this",
    images: ["/tmp/a.png", null, 42, ""],
    files: ["/tmp/a.txt", {}, "/tmp/b.txt"],
    mentions: [
      { name: "file.js", path: "/repo/file.js", ignored: true },
      {
        kind: "skill",
        name: "review",
        displayName: "Review",
        path: "",
        icon: "/icons/review.png",
        ignored: true,
      },
      { kind: "site", name: "Sites", displayName: "Sites" },
      { kind: "file", name: "notes.md", path: "/repo/notes.md" },
      { kind: "unknown", name: "drop", path: "/tmp/drop" },
      { name: "", path: "/tmp/empty-name" },
      { name: "missing-path" },
      "not-an-object",
    ],
    ignored: true,
  }), {
    text: "Continue this",
    images: ["/tmp/a.png"],
    files: ["/tmp/a.txt", "/tmp/b.txt"],
    mentions: [
      { name: "file.js", path: "/repo/file.js" },
      {
        name: "review",
        kind: "skill",
        displayName: "Review",
        path: "",
        icon: "/icons/review.png",
      },
      { name: "Sites", kind: "site", displayName: "Sites" },
      { name: "notes.md", kind: "file", path: "/repo/notes.md" },
    ],
  });

  assert.deepEqual(normalizeComposerDraft(null), emptyComposerDraft());
});

test("reads a stored draft and degrades corrupt JSON or storage errors to empty", () => {
  const draftKey = composerDraftKey("thread-1", 0, "");
  const storageKey = composerDraftStorageKey(draftKey);
  const storage = createStorage({
    [storageKey]: JSON.stringify({
      text: "Saved",
      images: ["/tmp/image.png"],
      files: [],
      mentions: [],
    }),
  });

  assert.deepEqual(readComposerDraft(storage, draftKey), {
    text: "Saved",
    images: ["/tmp/image.png"],
    files: [],
    mentions: [],
  });

  storage.values.set(storageKey, "{bad json");
  assert.deepEqual(readComposerDraft(storage, draftKey), emptyComposerDraft());
  assert.deepEqual(readComposerDraft({
    getItem() {
      throw new Error("storage blocked");
    },
  }, draftKey), emptyComposerDraft());
});

test("writes normalized drafts and removes empty drafts", () => {
  const draftKey = composerDraftKey(null, 100, "/repo");
  const storageKey = composerDraftStorageKey(draftKey);
  const storage = createStorage();

  writeComposerDraft(storage, draftKey, {
    text: "Saved",
    images: ["/tmp/image.png", 3],
    files: [],
    mentions: [],
  });
  assert.deepEqual(JSON.parse(storage.values.get(storageKey)), {
    text: "Saved",
    images: ["/tmp/image.png"],
    files: [],
    mentions: [],
  });

  writeComposerDraft(storage, draftKey, emptyComposerDraft());
  assert.equal(storage.values.has(storageKey), false);

  storage.values.set(storageKey, JSON.stringify({ text: "again" }));
  deleteComposerDraft(storage, draftKey);
  assert.equal(storage.values.has(storageKey), false);
});
