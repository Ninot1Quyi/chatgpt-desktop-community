import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), "utf8");

test("sidebar and keyboard nav include Sites between Scheduled and Plugins", () => {
  const sidebar = read("modules/projects-navigation/renderer/Sidebar.jsx");
  const app = read("renderer/src/App.jsx");
  const store = read("renderer/src/store.js");
  assert.match(sidebar, /id: "sites", label: "Sites"/);
  assert.match(app, /\["chats", "pull-requests", "scheduled", "sites", "plugins"\]/);
  assert.match(store, /chats \| pull-requests \| scheduled \| sites \| plugins/);
});

test("Sites view uses the Sites plugin when available and can create a Sites chat", () => {
  const source = read("modules/projects-navigation/renderer/NavViews.jsx");
  assert.match(source, /case "sites": return <SitesView \/>/);
  assert.match(source, /function SitesView\(\)/);
  assert.match(source, /api\.rpc\("plugin\/list", \{\}\)/);
  assert.match(source, /kind: "site"/);
  assert.match(source, /Create a website that /);
});

test("project and thread drag write the official shared global-state keys", () => {
  const sidebar = read("modules/projects-navigation/renderer/Sidebar.jsx");
  const state = read("modules/projects-navigation/renderer/state.js");
  assert.match(sidebar, /application\/x-chatgpt-desktop-sidebar/);
  assert.match(sidebar, /type: "project", projectId: project\.id/);
  assert.match(sidebar, /type: "thread", threadId: thread\.id/);
  assert.match(sidebar, /gsPatch\(patch\)/);
  assert.match(state, /export function createProjectOrderPatch/);
  assert.match(state, /"project-order"/);
  assert.match(state, /export function createThreadProjectAssignmentPatch/);
  assert.match(state, /"thread-project-assignments"/);
});
