import assert from "node:assert/strict";
import test from "node:test";

import { isSidebarEmpty } from "./sidebar-empty.mjs";

const emptyModel = () => ({
  chats: [],
  pinned: [],
  projects: [],
});

test("sidebar is empty when every runtime section is empty", () => {
  assert.equal(isSidebarEmpty({
    archivedView: false,
    externalSections: [
      { projects: [] },
      { projects: [] },
    ],
    model: emptyModel(),
    pinnedExternalProjects: [],
    pinnedThreads: [],
  }), true);
});

test("external and pinned projects prevent the global empty state", () => {
  assert.equal(isSidebarEmpty({
    archivedView: false,
    externalSections: [{ projects: [{ id: "claude:project" }] }],
    model: emptyModel(),
    pinnedExternalProjects: [],
    pinnedThreads: [],
  }), false);
  assert.equal(isSidebarEmpty({
    archivedView: false,
    externalSections: [{ projects: [] }],
    model: emptyModel(),
    pinnedExternalProjects: [{ id: "kimi:project" }],
    pinnedThreads: [],
  }), false);
});

test("archived view considers only archived Codex content", () => {
  assert.equal(isSidebarEmpty({
    archivedView: true,
    externalSections: [{ projects: [{ id: "claude:project" }] }],
    model: emptyModel(),
    pinnedExternalProjects: [{ id: "kimi:project" }],
    pinnedThreads: [],
  }), true);
  assert.equal(isSidebarEmpty({
    archivedView: true,
    externalSections: [],
    model: {
      ...emptyModel(),
      chats: [{ id: "codex:archived" }],
    },
    pinnedExternalProjects: [],
    pinnedThreads: [],
  }), false);
});
