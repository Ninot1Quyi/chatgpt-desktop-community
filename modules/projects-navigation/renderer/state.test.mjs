import assert from "node:assert/strict";
import test from "node:test";

import {
  createPinnedPatch,
  createProjectOrderPatch,
  createProjectsNavigationState,
  createReorderedIdsPatch,
  createThreadProjectAssignmentPatch,
  mostRecentThreadId,
  sameNavLocation,
  togglePinnedId,
} from "./state.js";

function createHarness(initial = {}) {
  let state;
  const get = () => state;
  const set = (patch) => {
    const next = typeof patch === "function" ? patch(state) : patch;
    state = { ...state, ...next };
  };
  const slice = createProjectsNavigationState(set, get);
  state = {
    activeThreadId: null,
    ui: { navView: "chats" },
    setUi(patch) {
      set((s) => ({ ui: { ...s.ui, ...patch } }));
    },
    openThread(threadId) {
      state.setUi({ navView: "chats" });
      set({ activeThreadId: threadId });
    },
    ...slice,
    ...initial,
  };
  return { get: () => state };
}

test("navigation locations compare by page or thread identity", () => {
  assert.equal(
    sameNavLocation({ type: "view", navView: "sites" }, { type: "view", navView: "sites" }),
    true,
  );
  assert.equal(
    sameNavLocation({ type: "thread", threadId: "a" }, { type: "thread", threadId: "b" }),
    false,
  );
});

test("recent-chat navigation skips views and the active thread", () => {
  const history = [
    { type: "thread", threadId: "older" },
    { type: "view", navView: "sites" },
    { type: "thread", threadId: "active" },
    { type: "view", navView: "plugins" },
    { type: "thread", threadId: "previous" },
  ];
  assert.equal(mostRecentThreadId(history, "active"), "previous");
  assert.equal(
    mostRecentThreadId([{ type: "view", navView: "sites" }], "active"),
    null,
  );
});

test("back and forward restore page locations around a thread", () => {
  const h = createHarness({
    activeThreadId: "thread-a",
    ui: { navView: "sites" },
    navBack: [{ type: "thread", threadId: "thread-a" }],
    navFwd: [],
  });

  h.get().goBack();
  assert.equal(h.get().ui.navView, "chats");
  assert.equal(h.get().activeThreadId, "thread-a");
  assert.deepEqual(h.get().navFwd, [{ type: "view", navView: "sites" }]);

  h.get().goForward();
  assert.equal(h.get().ui.navView, "sites");
  assert.equal(h.get().activeThreadId, "thread-a");
  assert.deepEqual(h.get().navBack, [{ type: "thread", threadId: "thread-a" }]);
});

test("opening plain chats view clears active thread during navigation replay", () => {
  const h = createHarness({
    activeThreadId: "thread-a",
    ui: { navView: "pull-requests" },
  });

  h.get().openNavLocation({ type: "view", navView: "chats" });
  assert.equal(h.get().ui.navView, "chats");
  assert.equal(h.get().activeThreadId, null);
});

test("pin patches toggle the same global-state ids used by the official sidebar", () => {
  assert.deepEqual(togglePinnedId(["a", "b"], "b"), ["a"]);
  assert.deepEqual(togglePinnedId(["a"], "b"), ["a", "b"]);
  assert.deepEqual(
    createPinnedPatch({ "pinned-project-ids": ["project-a"] }, "pinned-project-ids", "project-b"),
    { "pinned-project-ids": ["project-a", "project-b"] },
  );
});

test("project drag creates a persisted project-order patch", () => {
  const gs = {
    "project-order": ["project-a"],
    "local-projects": {
      "project-a": { name: "A" },
      "project-b": { name: "B" },
      "project-c": { name: "C" },
    },
  };

  assert.deepEqual(
    createProjectOrderPatch(gs, "project-c", "project-a"),
    { "project-order": ["project-c", "project-a", "project-b"] },
  );
  assert.equal(createProjectOrderPatch(gs, "project-a", "project-a"), null);
});

test("pinned drag creates a persisted pinned-id order patch", () => {
  assert.deepEqual(
    createReorderedIdsPatch(
      { "pinned-thread-ids": ["thread-a", "thread-b", "thread-c"] },
      "pinned-thread-ids",
      "thread-c",
      "thread-a",
    ),
    { "pinned-thread-ids": ["thread-c", "thread-a", "thread-b"] },
  );
  assert.equal(
    createReorderedIdsPatch({ "pinned-project-ids": ["project-a"] }, "pinned-project-ids", "x", "project-a"),
    null,
  );
});

test("thread drag writes and clears codex-global-state project assignments", () => {
  const gs = {
    "thread-project-assignments": {
      "thread-old": { projectId: "project-a" },
      "thread-a": { projectId: "project-a", note: "preserve" },
    },
  };

  assert.deepEqual(
    createThreadProjectAssignmentPatch(gs, "thread-a", "project-b"),
    {
      "thread-project-assignments": {
        "thread-old": { projectId: "project-a" },
        "thread-a": { projectId: "project-b", note: "preserve" },
      },
    },
  );
  assert.deepEqual(
    createThreadProjectAssignmentPatch(gs, "thread-a", null),
    { "thread-project-assignments": { "thread-old": { projectId: "project-a" } } },
  );
});
