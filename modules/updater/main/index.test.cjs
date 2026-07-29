const assert = require("node:assert/strict");
const test = require("node:test");

const { resolveUpdaterMode } = require("./index.cjs");

test("updater is disabled when a packaged build has no update configuration", () => {
  assert.equal(resolveUpdaterMode({
    isPackaged: true,
    resourcesPath: "C:\\portable\\resources",
    existsSync: () => false,
  }), "disabled");
});

test("updater remains enabled for installer builds with update metadata", () => {
  assert.equal(resolveUpdaterMode({
    isPackaged: true,
    resourcesPath: "C:\\installed\\resources",
    existsSync: () => true,
  }), "enabled");
});

test("updater remains inactive during development", () => {
  assert.equal(resolveUpdaterMode({
    isPackaged: false,
    resourcesPath: "",
    existsSync: () => true,
  }), "dev");
});
